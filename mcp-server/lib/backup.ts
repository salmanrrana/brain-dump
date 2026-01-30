/**
 * Backup utilities for Brain Dump MCP server.
 * Handles database backup creation, verification, and cleanup.
 */

import Database from "better-sqlite3";
import { existsSync, readdirSync, statSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { log } from "./logging.js";
import { getBackupsDir } from "./xdg.js";

const BACKUP_PREFIX = "brain-dump-";
const BACKUP_SUFFIX = ".db";
const LAST_BACKUP_FILE = ".last-backup";

interface BackupInfo {
  filename: string;
  date: string;
  path: string;
  size: number;
}

interface BackupResult {
  success: boolean;
  created: boolean;
  message: string;
  backupPath?: string;
}

interface CleanupResult {
  success: boolean;
  deleted: number;
  message: string;
}

interface DailyBackupSyncResult {
  backup: BackupResult;
  cleanup: CleanupResult;
}

/**
 * Get today's date string in YYYY-MM-DD format.
 */
export function getTodayDateString(): string {
  const datePart = new Date().toISOString().split("T")[0];
  return datePart || "";
}

/**
 * Get path to the last backup marker file.
 */
export function getLastBackupMarkerPath(): string {
  return join(getBackupsDir(), LAST_BACKUP_FILE);
}

/**
 * Check if a backup was already created today.
 */
export function wasBackupCreatedToday(): boolean {
  const markerPath = getLastBackupMarkerPath();
  if (!existsSync(markerPath)) return false;
  try {
    const stats = statSync(markerPath);
    const markerDatePart = stats.mtime.toISOString().split("T")[0];
    const markerDate = markerDatePart || "";
    return markerDate === getTodayDateString();
  } catch {
    return false;
  }
}

/**
 * Update the last backup marker file.
 */
export function updateLastBackupMarker(): void {
  try {
    const markerPath = getLastBackupMarkerPath();
    writeFileSync(markerPath, new Date().toISOString(), { mode: 0o600 });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error("Failed to update backup marker", err);
  }
}

/**
 * Get backup filename for a given date.
 */
export function getBackupFilename(dateString?: string): string {
  const date = dateString || getTodayDateString();
  return `${BACKUP_PREFIX}${date}${BACKUP_SUFFIX}`;
}

/**
 * Get the path for today's backup file.
 */
export function getTodayBackupPath(): string {
  return join(getBackupsDir(), getBackupFilename());
}

/**
 * Verify a backup file's integrity using SQLite PRAGMA.
 */
export function verifyBackup(backupPath: string): boolean {
  if (!existsSync(backupPath)) return false;
  try {
    const testDb = new Database(backupPath, { readonly: true });
    const result = testDb.pragma("integrity_check") as Array<{ integrity_check: string }>;
    testDb.close();
    return result.length === 1 && (result[0]?.integrity_check === "ok");
  } catch {
    return false;
  }
}

/**
 * Create a backup if one hasn't been created today.
 */
export function createBackupIfNeeded(sourcePath: string): BackupResult {
  if (wasBackupCreatedToday()) {
    return { success: true, created: false, message: "Backup already created today" };
  }

  const backupPath = getTodayBackupPath();
  if (existsSync(backupPath)) {
    updateLastBackupMarker();
    return { success: true, created: false, message: "Today's backup already exists", backupPath };
  }

  if (!existsSync(sourcePath)) {
    return { success: false, created: false, message: `Source database not found: ${sourcePath}` };
  }

  try {
    const srcDb = new Database(sourcePath, { readonly: true });
    srcDb.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
    srcDb.close();

    if (!verifyBackup(backupPath)) {
      try {
        unlinkSync(backupPath);
      } catch {
        /* ignore */
      }
      return { success: false, created: false, message: "Backup created but failed integrity check" };
    }

    updateLastBackupMarker();
    log.info(`Created backup: ${backupPath}`);
    return { success: true, created: true, message: "Backup created successfully", backupPath };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error("Failed to create backup", err);
    return { success: false, created: false, message: `Backup failed: ${err.message}` };
  }
}

/**
 * List all available backups sorted by date (newest first).
 */
export function listBackups(): BackupInfo[] {
  const backupsDir = getBackupsDir();
  if (!existsSync(backupsDir)) return [];

  const files = readdirSync(backupsDir);
  const backups: BackupInfo[] = [];

  for (const file of files) {
    const match = file.match(/^brain-dump-(\d{4}-\d{2}-\d{2})\.db$/);
    if (!match || !match[1]) continue;
    const filePath = join(backupsDir, file);
    try {
      const stats = statSync(filePath);
      backups.push({ filename: file, date: match[1], path: filePath, size: stats.size });
    } catch {
      /* skip */
    }
  }

  return backups.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Clean up old backups, keeping the most recent ones.
 */
export function cleanupOldBackups(keepDays = 7): CleanupResult {
  const backups = listBackups();

  if (backups.length <= keepDays) {
    return { success: true, deleted: 0, message: `No cleanup needed (${backups.length} backups)` };
  }

  const toDelete = backups.slice(keepDays);
  let deleted = 0;

  for (const backup of toDelete) {
    try {
      unlinkSync(backup.path);
      deleted++;
      log.info(`Deleted old backup: ${backup.filename}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`Failed to delete ${backup.filename}`, err);
    }
  }

  return { success: true, deleted, message: `Cleaned up ${deleted} old backup(s)` };
}

/**
 * Perform daily backup sync: create backup if needed and cleanup old ones.
 */
export function performDailyBackupSync(sourcePath: string): DailyBackupSyncResult {
  const backup = createBackupIfNeeded(sourcePath);
  const cleanup = cleanupOldBackups(7);
  return { backup, cleanup };
}
