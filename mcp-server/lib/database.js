/**
 * Database initialization and migration for Brain Dump MCP server.
 * Handles connection setup, WAL mode, and schema migrations.
 * @module lib/database
 */
import Database from "better-sqlite3";
import { existsSync, copyFileSync, mkdirSync, readdirSync, writeFileSync, statSync } from "fs";
import { join } from "path";
import { log } from "./logging.js";
import {
  getDbPath,
  getLegacyDir,
  getDataDir,
  getStateDir,
  ensureDirectoriesSync,
} from "./xdg.js";

const MIGRATED_MARKER = ".migrated";

/**
 * Check if migration from legacy directory is complete.
 * @returns {boolean}
 */
export function isMigrationComplete() {
  return existsSync(join(getLegacyDir(), MIGRATED_MARKER));
}

/**
 * Verify database integrity using PRAGMA integrity_check.
 * @param {string} dbPath - Path to database file
 * @returns {boolean} True if database is valid
 */
export function verifyDatabaseIntegrity(dbPath) {
  if (!existsSync(dbPath)) return false;
  try {
    const testDb = new Database(dbPath, { readonly: true });
    const result = testDb.pragma("integrity_check");
    testDb.close();
    return result.length === 1 && result[0].integrity_check === "ok";
  } catch {
    return false;
  }
}

/**
 * Migrate database from legacy ~/.brain-dump to XDG directories.
 * @returns {{success: boolean, migrated: boolean, message: string}}
 */
export function migrateFromLegacySync() {
  const legacyDir = getLegacyDir();
  const legacyDbPath = join(legacyDir, "brain-dump.db");
  const xdgDbPath = getDbPath();

  if (isMigrationComplete()) {
    return { success: true, migrated: false, message: "Migration already complete" };
  }
  if (!existsSync(legacyDbPath)) {
    return { success: true, migrated: false, message: "No legacy data to migrate" };
  }
  if (existsSync(xdgDbPath)) {
    log.info("Both legacy and XDG locations have data, using XDG");
    return { success: true, migrated: false, message: "XDG already has data" };
  }

  log.info("Migrating from legacy ~/.brain-dump to XDG directories...");

  try {
    ensureDirectoriesSync();

    // Create pre-migration backup
    try {
      const backupsDir = join(getStateDir(), "backups");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = join(backupsDir, `pre-migration-${timestamp}.db`);
      const srcDb = new Database(legacyDbPath, { readonly: true });
      srcDb.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
      srcDb.close();
      log.info(`Created pre-migration backup: ${backupPath}`);
    } catch (backupErr) {
      log.error("Failed to create backup, continuing anyway", backupErr);
    }

    // Copy database and WAL/SHM files
    copyFileSync(legacyDbPath, xdgDbPath);
    const walFile = legacyDbPath + "-wal";
    const shmFile = legacyDbPath + "-shm";
    if (existsSync(walFile)) copyFileSync(walFile, xdgDbPath + "-wal");
    if (existsSync(shmFile)) copyFileSync(shmFile, xdgDbPath + "-shm");

    if (!verifyDatabaseIntegrity(xdgDbPath)) {
      throw new Error("Database integrity check failed after copy");
    }

    // Copy attachments
    const legacyAttachments = join(legacyDir, "attachments");
    const xdgAttachments = join(getDataDir(), "attachments");
    if (existsSync(legacyAttachments)) {
      if (!existsSync(xdgAttachments)) mkdirSync(xdgAttachments, { recursive: true, mode: 0o700 });
      const files = readdirSync(legacyAttachments);
      for (const file of files) {
        const srcPath = join(legacyAttachments, file);
        const destPath = join(xdgAttachments, file);
        if (statSync(srcPath).isFile() && !existsSync(destPath)) {
          copyFileSync(srcPath, destPath);
        }
      }
      log.info(`Copied ${files.length} attachments`);
    }

    // Create migration marker
    writeFileSync(join(legacyDir, MIGRATED_MARKER), JSON.stringify({
      migratedAt: new Date().toISOString(),
      migratedTo: getDataDir(),
      note: "Data has been migrated to XDG directories."
    }, null, 2), { mode: 0o600 });

    log.info("Migration complete! Legacy data preserved in ~/.brain-dump");
    return { success: true, migrated: true, message: "Migration complete" };
  } catch (error) {
    log.error("Migration failed", error);
    return { success: false, migrated: false, message: `Migration failed: ${error.message}` };
  }
}

/**
 * Run schema migrations on the database.
 * @param {Database} db - Database connection
 */
export function runMigrations(db) {
  // Add linked_commits column if it doesn't exist
  try {
    const columns = db.prepare("PRAGMA table_info(tickets)").all();
    if (!columns.some(col => col.name === "linked_commits")) {
      db.prepare("ALTER TABLE tickets ADD COLUMN linked_commits TEXT").run();
      log.info("Added linked_commits column to tickets table");
    }
  } catch (err) {
    log.error("Failed to check/add linked_commits column", err);
  }

  // Add working_method column to projects table
  try {
    const projectColumns = db.prepare("PRAGMA table_info(projects)").all();
    if (!projectColumns.some(col => col.name === "working_method")) {
      db.prepare("ALTER TABLE projects ADD COLUMN working_method TEXT DEFAULT 'auto'").run();
      log.info("Added working_method column to projects table");
    }
  } catch (err) {
    log.error("Failed to check/add working_method column", err);
  }

  // Create ralph_events table if it doesn't exist
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ralph_events'").all();
    if (tables.length === 0) {
      db.prepare(`
        CREATE TABLE ralph_events (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          type TEXT NOT NULL,
          data TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `).run();
      db.prepare("CREATE INDEX idx_ralph_events_session ON ralph_events(session_id)").run();
      db.prepare("CREATE INDEX idx_ralph_events_created ON ralph_events(created_at)").run();
      log.info("Created ralph_events table for real-time UI streaming");
    }
  } catch (err) {
    log.error("Failed to create ralph_events table", err);
  }
}

/**
 * Initialize the database connection with WAL mode and migrations.
 * @param {string} [dbPath] - Optional path to database (defaults to XDG path)
 * @returns {{db: Database, actualDbPath: string}} Database connection and path used
 */
export function initDatabase(dbPath) {
  ensureDirectoriesSync();

  // Run legacy migration if needed
  const migrationResult = migrateFromLegacySync();
  if (migrationResult.migrated) {
    log.info(migrationResult.message);
  }

  const xdgDbPath = dbPath || getDbPath();
  const legacyDbPath = join(getLegacyDir(), "brain-dump.db");
  let actualDbPath = xdgDbPath;

  // Try XDG path first, fall back to legacy for backwards compatibility
  if (!existsSync(xdgDbPath)) {
    if (existsSync(legacyDbPath) && !isMigrationComplete()) {
      log.info(`Using legacy database at ${legacyDbPath}`);
      actualDbPath = legacyDbPath;
    } else {
      throw new Error(`Database not found at ${xdgDbPath} or ${legacyDbPath}. Run Brain Dump first to create the database.`);
    }
  }

  const db = new Database(actualDbPath);
  db.pragma("journal_mode = WAL");
  log.info(`Connected to database: ${actualDbPath}`);

  // Run schema migrations
  runMigrations(db);

  return { db, actualDbPath };
}
