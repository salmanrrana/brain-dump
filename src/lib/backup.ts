import { existsSync, readdirSync, unlinkSync, statSync, writeFileSync, copyFileSync } from "fs";
import { join } from "path";
import Database from "better-sqlite3";
import { getBackupsDir, getDatabasePath, ensureDirectoriesSync } from "./xdg";

const BACKUP_PREFIX = "brain-dump-";
const BACKUP_SUFFIX = ".db";
const LAST_BACKUP_FILE = ".last-backup";

export interface BackupResult {
  success: boolean;
  created: boolean;
  message: string;
  backupPath?: string;
}

export interface CleanupResult {
  success: boolean;
  deleted: number;
  message: string;
}

function getTodayDateString(): string {
  const now = new Date();
  const isoString = now.toISOString();
  return isoString.substring(0, 10);
}

function getLastBackupMarkerPath(): string {
  return join(getBackupsDir(), LAST_BACKUP_FILE);
}

export function wasBackupCreatedToday(): boolean {
  const markerPath = getLastBackupMarkerPath();
  if (!existsSync(markerPath)) {
    return false;
  }

  try {
    const stats = statSync(markerPath);
    const markerDate = stats.mtime.toISOString().substring(0, 10);
    const today = getTodayDateString();
    return markerDate === today;
  } catch (error) {
    console.error(`[Backup] Failed to check backup marker: ${error}`);
    return false;
  }
}

function updateLastBackupMarker(): void {
  const markerPath = getLastBackupMarkerPath();
  ensureDirectoriesSync();

  try {
    writeFileSync(markerPath, new Date().toISOString(), { mode: 0o600 });
  } catch (error) {
    console.error("[Backup] Failed to update marker:", error);
  }
}

export function getBackupFilename(dateString?: string): string {
  const date = dateString || getTodayDateString();
  return `${BACKUP_PREFIX}${date}${BACKUP_SUFFIX}`;
}

export function getTodayBackupPath(): string {
  return join(getBackupsDir(), getBackupFilename());
}

export function listBackups(): { filename: string; date: string; path: string; size: number }[] {
  const backupsDir = getBackupsDir();

  if (!existsSync(backupsDir)) {
    return [];
  }

  const files = readdirSync(backupsDir);
  const backups: { filename: string; date: string; path: string; size: number }[] = [];

  for (const file of files) {
    const match = file.match(/^brain-dump-(\d{4}-\d{2}-\d{2})\.db$/);
    if (match && match[1]) {
      const dateStr = match[1];
      const filePath = join(backupsDir, file);
      try {
        const stats = statSync(filePath);
        backups.push({
          filename: file,
          date: dateStr,
          path: filePath,
          size: stats.size,
        });
      } catch (error) {
        console.error(`[Backup] Failed to stat backup file ${file}: ${error}`);
      }
    }
  }

  backups.sort((a, b) => b.date.localeCompare(a.date));

  return backups;
}

/**
 * Create a backup of the database using SQLite Online Backup API.
 * Uses VACUUM INTO for atomic, consistent backup.
 *
 * @param sourcePath - Optional path to the source database. Defaults to current database.
 * @param targetPath - Optional path for the backup. Defaults to today's backup path.
 */
export function createBackup(sourcePath?: string, targetPath?: string): BackupResult {
  const dbPath = sourcePath || getDatabasePath();
  const backupPath = targetPath || getTodayBackupPath();

  // Verify source database exists
  if (!existsSync(dbPath)) {
    return {
      success: false,
      created: false,
      message: `Source database not found: ${dbPath}`,
    };
  }

  // Ensure backups directory exists
  ensureDirectoriesSync();

  try {
    // Open source database in readonly mode
    const db = new Database(dbPath, { readonly: true });

    // Use VACUUM INTO for atomic backup
    // This creates a clean, defragmented copy
    db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
    db.close();

    // Verify the backup is valid
    const isValid = verifyBackup(backupPath);
    if (!isValid) {
      // Remove invalid backup
      try {
        unlinkSync(backupPath);
      } catch (error) {
        console.error(`[Backup] Failed to cleanup invalid backup ${backupPath}: ${error}`);
      }
      return {
        success: false,
        created: false,
        message: "Backup created but failed integrity check",
      };
    }

    console.log(`[Backup] Created: ${backupPath}`);

    return {
      success: true,
      created: true,
      message: "Backup created successfully",
      backupPath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Backup] Failed to create backup: ${errorMessage}`);

    return {
      success: false,
      created: false,
      message: `Backup failed: ${errorMessage}`,
    };
  }
}

export function verifyBackup(backupPath: string): boolean {
  if (!existsSync(backupPath)) {
    return false;
  }

  try {
    const db = new Database(backupPath, { readonly: true });
    const result = db.pragma("integrity_check") as { integrity_check: string }[];
    db.close();

    return result.length === 1 && result[0]?.integrity_check === "ok";
  } catch (error) {
    console.error(`[Backup] Failed to verify backup ${backupPath}: ${error}`);
    return false;
  }
}

export function createBackupIfNeeded(force = false): BackupResult {
  if (!force && wasBackupCreatedToday()) {
    return {
      success: true,
      created: false,
      message: "Backup already created today",
    };
  }

  const todayBackupPath = getTodayBackupPath();
  if (!force && existsSync(todayBackupPath)) {
    updateLastBackupMarker();
    return {
      success: true,
      created: false,
      message: "Today's backup already exists",
      backupPath: todayBackupPath,
    };
  }

  const result = createBackup();

  if (result.success) {
    updateLastBackupMarker();
  }

  return result;
}

export function cleanupOldBackups(keepDays = 7): CleanupResult {
  const backups = listBackups();

  if (backups.length <= keepDays) {
    return {
      success: true,
      deleted: 0,
      message: `No cleanup needed (${backups.length} backups, keeping ${keepDays})`,
    };
  }

  const toDelete = backups.slice(keepDays);
  let deleted = 0;

  for (const backup of toDelete) {
    try {
      unlinkSync(backup.path);
      deleted++;
      console.log(`[Backup] Deleted old backup: ${backup.filename}`);
    } catch (error) {
      console.error(`[Backup] Failed to delete ${backup.filename}:`, error);
    }
  }

  return {
    success: true,
    deleted,
    message: `Cleaned up ${deleted} old backup(s)`,
  };
}

export async function performDailyBackup(keepDays = 7): Promise<{
  backup: BackupResult;
  cleanup: CleanupResult;
}> {
  return performDailyBackupSync(keepDays);
}

export function performDailyBackupSync(keepDays = 7): {
  backup: BackupResult;
  cleanup: CleanupResult;
} {
  const backup = createBackupIfNeeded();
  const cleanup = cleanupOldBackups(keepDays);

  return { backup, cleanup };
}

export interface RestoreResult {
  success: boolean;
  message: string;
  preRestoreBackupPath?: string;
}

export function getDatabaseStats(dbPath: string): {
  projects: number;
  epics: number;
  tickets: number;
} | null {
  if (!existsSync(dbPath)) {
    return null;
  }

  try {
    const db = new Database(dbPath, { readonly: true });

    const tablesExist = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('projects', 'epics', 'tickets')"
      )
      .all();

    if (tablesExist.length < 3) {
      db.close();
      return null;
    }

    const projects = (
      db.prepare("SELECT COUNT(*) as count FROM projects").get() as {
        count: number;
      }
    ).count;
    const epics = (
      db.prepare("SELECT COUNT(*) as count FROM epics").get() as { count: number }
    ).count;
    const tickets = (
      db.prepare("SELECT COUNT(*) as count FROM tickets").get() as {
        count: number;
      }
    ).count;

    db.close();
    return { projects, epics, tickets };
  } catch (error) {
    console.error(`[Backup] Failed to get database stats for ${dbPath}: ${error}`);
    return null;
  }
}

/**
 * Restore database from a backup file. Creates a pre-restore backup,
 * verifies integrity, and uses atomic copy operations.
 */
export function restoreFromBackup(backupPath: string): RestoreResult {
  const currentDbPath = getDatabasePath();

  if (!existsSync(backupPath)) {
    return {
      success: false,
      message: `Backup file not found: ${backupPath}`,
    };
  }

  if (!verifyBackup(backupPath)) {
    return {
      success: false,
      message: "Backup file failed integrity check - cannot restore",
    };
  }

  const preRestoreFilename = `pre-restore-${Date.now()}.db`;
  const preRestoreBackupPath = join(getBackupsDir(), preRestoreFilename);

  try {
    ensureDirectoriesSync();

    if (existsSync(currentDbPath)) {
      const db = new Database(currentDbPath, { readonly: true });
      db.exec(`VACUUM INTO '${preRestoreBackupPath.replace(/'/g, "''")}'`);
      db.close();
      console.log(`[Restore] Created pre-restore backup: ${preRestoreBackupPath}`);
    }

    const walPath = currentDbPath + "-wal";
    const shmPath = currentDbPath + "-shm";

    if (existsSync(currentDbPath)) {
      unlinkSync(currentDbPath);
    }
    if (existsSync(walPath)) {
      unlinkSync(walPath);
    }
    if (existsSync(shmPath)) {
      unlinkSync(shmPath);
    }

    copyFileSync(backupPath, currentDbPath);

    if (!verifyBackup(currentDbPath)) {
      if (existsSync(preRestoreBackupPath)) {
        copyFileSync(preRestoreBackupPath, currentDbPath);
      }
      return {
        success: false,
        message: "Restored database failed integrity check - reverted to previous state",
        preRestoreBackupPath,
      };
    }

    return {
      success: true,
      message: "Database restored successfully",
      preRestoreBackupPath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const result: RestoreResult = {
      success: false,
      message: `Restore failed: ${errorMessage}`,
    };
    if (existsSync(preRestoreBackupPath)) {
      result.preRestoreBackupPath = preRestoreBackupPath;
    }
    return result;
  }
}

export function getLatestBackup(): {
  filename: string;
  date: string;
  path: string;
  size: number;
} | null {
  const backups = listBackups();
  if (backups.length > 0 && backups[0]) {
    return backups[0];
  }
  return null;
}
