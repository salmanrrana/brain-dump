import { existsSync, readdirSync, unlinkSync, statSync, writeFileSync, copyFileSync } from "fs";
import { join } from "path";
import Database from "better-sqlite3";
import { getBackupsDir, getDatabasePath, ensureDirectoriesSync } from "./xdg";

const BACKUP_PREFIX = "brain-dumpy-";
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

/**
 * Get the date string for today in YYYY-MM-DD format
 */
function getTodayDateString(): string {
  const now = new Date();
  const isoString = now.toISOString();
  return isoString.substring(0, 10); // YYYY-MM-DD is always the first 10 characters
}

/**
 * Get the path to the last backup marker file
 */
function getLastBackupMarkerPath(): string {
  return join(getBackupsDir(), LAST_BACKUP_FILE);
}

/**
 * Check if a backup was already created today
 */
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
  } catch {
    return false;
  }
}

/**
 * Update the last backup marker to today
 */
function updateLastBackupMarker(): void {
  const markerPath = getLastBackupMarkerPath();

  // Ensure backups directory exists
  ensureDirectoriesSync();

  // Touch the marker file
  try {
    writeFileSync(markerPath, new Date().toISOString(), { mode: 0o600 });
  } catch (error) {
    console.error("[Backup] Failed to update marker:", error);
  }
}

/**
 * Generate the backup filename for a given date
 */
export function getBackupFilename(dateString?: string): string {
  const date = dateString || getTodayDateString();
  return `${BACKUP_PREFIX}${date}${BACKUP_SUFFIX}`;
}

/**
 * Get the full path to today's backup file
 */
export function getTodayBackupPath(): string {
  return join(getBackupsDir(), getBackupFilename());
}

/**
 * List all existing backup files sorted by date (newest first)
 */
export function listBackups(): { filename: string; date: string; path: string; size: number }[] {
  const backupsDir = getBackupsDir();

  if (!existsSync(backupsDir)) {
    return [];
  }

  const files = readdirSync(backupsDir);
  const backups: { filename: string; date: string; path: string; size: number }[] = [];

  for (const file of files) {
    // Match backup filename pattern: brain-dumpy-YYYY-MM-DD.db
    const match = file.match(/^brain-dumpy-(\d{4}-\d{2}-\d{2})\.db$/);
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
      } catch {
        // Skip files we can't stat
      }
    }
  }

  // Sort by date descending (newest first)
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
      } catch {
        // Ignore cleanup errors
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

/**
 * Verify a backup database is valid using integrity check
 */
export function verifyBackup(backupPath: string): boolean {
  if (!existsSync(backupPath)) {
    return false;
  }

  try {
    const db = new Database(backupPath, { readonly: true });
    const result = db.pragma("integrity_check") as { integrity_check: string }[];
    db.close();

    return result.length === 1 && result[0]?.integrity_check === "ok";
  } catch {
    return false;
  }
}

/**
 * Create a backup if one hasn't been created today.
 * This is the main function to call on startup.
 *
 * @param force - If true, create backup even if one exists for today
 */
export function createBackupIfNeeded(force = false): BackupResult {
  // Check if backup already exists for today
  if (!force && wasBackupCreatedToday()) {
    return {
      success: true,
      created: false,
      message: "Backup already created today",
    };
  }

  // Check if today's backup file already exists
  const todayBackupPath = getTodayBackupPath();
  if (!force && existsSync(todayBackupPath)) {
    // Update marker and return
    updateLastBackupMarker();
    return {
      success: true,
      created: false,
      message: "Today's backup already exists",
      backupPath: todayBackupPath,
    };
  }

  // Create the backup
  const result = createBackup();

  if (result.success) {
    // Update the marker file
    updateLastBackupMarker();
  }

  return result;
}

/**
 * Clean up old backups, keeping only the most recent ones.
 *
 * @param keepDays - Number of daily backups to keep (default: 7)
 */
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

/**
 * Perform daily backup maintenance: create backup if needed and cleanup old ones.
 * This is the recommended function to call on application startup.
 * Note: This is async for API consistency but operations are synchronous.
 */
export async function performDailyBackup(keepDays = 7): Promise<{
  backup: BackupResult;
  cleanup: CleanupResult;
}> {
  return performDailyBackupSync(keepDays);
}

/**
 * Synchronous version of performDailyBackup for startup use.
 */
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

/**
 * Get database statistics for comparison during restore
 */
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

    // Check if tables exist
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
  } catch {
    return null;
  }
}

/**
 * Restore database from a backup file.
 *
 * Safety measures:
 * - Creates a pre-restore backup of the current database
 * - Verifies backup integrity before restoring
 * - Uses atomic copy operations
 *
 * @param backupPath - Path to the backup file to restore from
 */
export function restoreFromBackup(backupPath: string): RestoreResult {
  const currentDbPath = getDatabasePath();

  // Verify backup file exists
  if (!existsSync(backupPath)) {
    return {
      success: false,
      message: `Backup file not found: ${backupPath}`,
    };
  }

  // Verify backup integrity
  if (!verifyBackup(backupPath)) {
    return {
      success: false,
      message: "Backup file failed integrity check - cannot restore",
    };
  }

  // Create pre-restore backup of current database
  const preRestoreFilename = `pre-restore-${Date.now()}.db`;
  const preRestoreBackupPath = join(getBackupsDir(), preRestoreFilename);

  try {
    // Ensure backups directory exists
    ensureDirectoriesSync();

    // Create pre-restore backup
    if (existsSync(currentDbPath)) {
      const db = new Database(currentDbPath, { readonly: true });
      db.exec(`VACUUM INTO '${preRestoreBackupPath.replace(/'/g, "''")}'`);
      db.close();
      console.log(`[Restore] Created pre-restore backup: ${preRestoreBackupPath}`);
    }

    // Remove existing database files before restoring
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

    // Copy backup to database location
    copyFileSync(backupPath, currentDbPath);

    // Verify restored database
    if (!verifyBackup(currentDbPath)) {
      // Restore failed, try to recover from pre-restore backup
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

/**
 * Get the most recent backup file
 */
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
