/**
 * Backup utilities for Brain Dump MCP server.
 * Handles database backup creation, verification, and cleanup.
 * @module lib/backup
 */
import Database from "better-sqlite3";
import { existsSync, readdirSync, statSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { log } from "./logging.js";
import { getBackupsDir } from "./xdg.js";

const BACKUP_PREFIX = "brain-dump-";
const BACKUP_SUFFIX = ".db";
const LAST_BACKUP_FILE = ".last-backup";

/**
 * Get today's date string in YYYY-MM-DD format.
 * @returns {string}
 */
export function getTodayDateString() {
  return new Date().toISOString().split("T")[0];
}

/**
 * Get path to the last backup marker file.
 * @returns {string}
 */
export function getLastBackupMarkerPath() {
  return join(getBackupsDir(), LAST_BACKUP_FILE);
}

/**
 * Check if a backup was already created today.
 * @returns {boolean}
 */
export function wasBackupCreatedToday() {
  const markerPath = getLastBackupMarkerPath();
  if (!existsSync(markerPath)) return false;
  try {
    const stats = statSync(markerPath);
    const markerDate = stats.mtime.toISOString().split("T")[0];
    return markerDate === getTodayDateString();
  } catch {
    return false;
  }
}

/**
 * Update the last backup marker file.
 */
export function updateLastBackupMarker() {
  try {
    const markerPath = getLastBackupMarkerPath();
    writeFileSync(markerPath, new Date().toISOString(), { mode: 0o600 });
  } catch (error) {
    log.error("Failed to update backup marker", error);
  }
}

/**
 * Get backup filename for a given date.
 * @param {string} [dateString] - Date in YYYY-MM-DD format (defaults to today)
 * @returns {string}
 */
export function getBackupFilename(dateString) {
  const date = dateString || getTodayDateString();
  return `${BACKUP_PREFIX}${date}${BACKUP_SUFFIX}`;
}

/**
 * Get the path for today's backup file.
 * @returns {string}
 */
export function getTodayBackupPath() {
  return join(getBackupsDir(), getBackupFilename());
}

/**
 * Verify a backup file's integrity using SQLite PRAGMA.
 * @param {string} backupPath - Path to backup file
 * @returns {boolean} True if backup is valid
 */
export function verifyBackup(backupPath) {
  if (!existsSync(backupPath)) return false;
  try {
    const testDb = new Database(backupPath, { readonly: true });
    const result = testDb.pragma("integrity_check");
    testDb.close();
    return result.length === 1 && result[0].integrity_check === "ok";
  } catch {
    return false;
  }
}

/**
 * Create a backup if one hasn't been created today.
 * @param {string} sourcePath - Path to source database
 * @returns {{success: boolean, created: boolean, message: string, backupPath?: string}}
 */
export function createBackupIfNeeded(sourcePath) {
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
      try { unlinkSync(backupPath); } catch { /* ignore */ }
      return { success: false, created: false, message: "Backup created but failed integrity check" };
    }

    updateLastBackupMarker();
    log.info(`Created backup: ${backupPath}`);
    return { success: true, created: true, message: "Backup created successfully", backupPath };
  } catch (error) {
    log.error("Failed to create backup", error);
    return { success: false, created: false, message: `Backup failed: ${error.message}` };
  }
}

/**
 * List all available backups sorted by date (newest first).
 * @returns {Array<{filename: string, date: string, path: string, size: number}>}
 */
export function listBackups() {
  const backupsDir = getBackupsDir();
  if (!existsSync(backupsDir)) return [];

  const files = readdirSync(backupsDir);
  const backups = [];

  for (const file of files) {
    const match = file.match(/^brain-dump-(\d{4}-\d{2}-\d{2})\.db$/);
    if (match) {
      const filePath = join(backupsDir, file);
      try {
        const stats = statSync(filePath);
        backups.push({ filename: file, date: match[1], path: filePath, size: stats.size });
      } catch { /* skip */ }
    }
  }

  return backups.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Clean up old backups, keeping the most recent ones.
 * @param {number} [keepDays=7] - Number of backups to keep
 * @returns {{success: boolean, deleted: number, message: string}}
 */
export function cleanupOldBackups(keepDays = 7) {
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
      log.error(`Failed to delete ${backup.filename}`, error);
    }
  }

  return { success: true, deleted, message: `Cleaned up ${deleted} old backup(s)` };
}

/**
 * Perform daily backup sync: create backup if needed and cleanup old ones.
 * @param {string} sourcePath - Path to source database
 * @returns {{backup: object, cleanup: object}}
 */
export function performDailyBackupSync(sourcePath) {
  const backup = createBackupIfNeeded(sourcePath);
  const cleanup = cleanupOldBackups(7);
  return { backup, cleanup };
}
