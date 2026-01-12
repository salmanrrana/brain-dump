import { existsSync, readdirSync, unlinkSync, statSync } from "fs";
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
    const now = new Date();
    require("fs").writeFileSync(markerPath, now.toISOString(), { mode: 0o600 });
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
 * Async version of createBackupIfNeeded for non-blocking use.
 * Returns a promise that resolves after backup is complete.
 */
export async function createBackupIfNeededAsync(force = false): Promise<BackupResult> {
  // Run the sync version in a microtask to avoid blocking
  return new Promise((resolve) => {
    setImmediate(() => {
      resolve(createBackupIfNeeded(force));
    });
  });
}

/**
 * Async version of cleanupOldBackups for non-blocking use.
 */
export async function cleanupOldBackupsAsync(keepDays = 7): Promise<CleanupResult> {
  return new Promise((resolve) => {
    setImmediate(() => {
      resolve(cleanupOldBackups(keepDays));
    });
  });
}

/**
 * Perform daily backup maintenance: create backup if needed and cleanup old ones.
 * This is the recommended function to call on application startup.
 */
export async function performDailyBackup(keepDays = 7): Promise<{
  backup: BackupResult;
  cleanup: CleanupResult;
}> {
  const backup = await createBackupIfNeededAsync();
  const cleanup = await cleanupOldBackupsAsync(keepDays);

  return { backup, cleanup };
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
