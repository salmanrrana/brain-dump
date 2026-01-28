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

  // Add git/PR tracking columns to tickets table
  try {
    const ticketColumns = db.prepare("PRAGMA table_info(tickets)").all();
    const ticketColumnNames = ticketColumns.map(c => c.name);

    if (!ticketColumnNames.includes("branch_name")) {
      db.prepare("ALTER TABLE tickets ADD COLUMN branch_name TEXT").run();
      log.info("Added branch_name column to tickets table");
    }
    if (!ticketColumnNames.includes("pr_number")) {
      db.prepare("ALTER TABLE tickets ADD COLUMN pr_number INTEGER").run();
      log.info("Added pr_number column to tickets table");
    }
    if (!ticketColumnNames.includes("pr_url")) {
      db.prepare("ALTER TABLE tickets ADD COLUMN pr_url TEXT").run();
      log.info("Added pr_url column to tickets table");
    }
    if (!ticketColumnNames.includes("pr_status")) {
      db.prepare("ALTER TABLE tickets ADD COLUMN pr_status TEXT").run();
      log.info("Added pr_status column to tickets table");
    }
  } catch (err) {
    log.error("Failed to check/add git/PR tracking columns", err);
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

  // Create ralph_sessions table if it doesn't exist (for state machine observability)
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ralph_sessions'").all();
    if (tables.length === 0) {
      db.prepare(`
        CREATE TABLE ralph_sessions (
          id TEXT PRIMARY KEY,
          ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
          current_state TEXT NOT NULL DEFAULT 'idle',
          state_history TEXT,
          outcome TEXT,
          error_message TEXT,
          started_at TEXT NOT NULL DEFAULT (datetime('now')),
          completed_at TEXT
        )
      `).run();
      db.prepare("CREATE INDEX idx_ralph_sessions_ticket ON ralph_sessions(ticket_id)").run();
      db.prepare("CREATE INDEX idx_ralph_sessions_state ON ralph_sessions(current_state)").run();
      log.info("Created ralph_sessions table for state machine observability");
    } else {
      // Add missing columns if table already exists (migration from older schema)
      const columns = db.prepare("PRAGMA table_info(ralph_sessions)").all();
      const columnNames = columns.map(c => c.name);

      if (!columnNames.includes("current_state")) {
        db.prepare("ALTER TABLE ralph_sessions ADD COLUMN current_state TEXT NOT NULL DEFAULT 'idle'").run();
        log.info("Added current_state column to ralph_sessions table");
      }
      if (!columnNames.includes("state_history")) {
        db.prepare("ALTER TABLE ralph_sessions ADD COLUMN state_history TEXT").run();
        log.info("Added state_history column to ralph_sessions table");
      }
      if (!columnNames.includes("completed_at")) {
        db.prepare("ALTER TABLE ralph_sessions ADD COLUMN completed_at TEXT").run();
        log.info("Added completed_at column to ralph_sessions table");
      }

      // Create index on current_state if it doesn't exist
      try {
        db.prepare("CREATE INDEX IF NOT EXISTS idx_ralph_sessions_state ON ralph_sessions(current_state)").run();
      } catch (err) {
        // Index may already exist with a different name, or table structure differs
        if (!err.message?.includes("already exists")) {
          log.warn("Failed to create idx_ralph_sessions_state index", err);
        }
      }
    }
  } catch (err) {
    log.error("Failed to create/migrate ralph_sessions table", err);
  }

  // ===========================================
  // Enterprise Conversation Logging Tables
  // ===========================================

  // Create conversation_sessions table for compliance logging
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversation_sessions'").all();
    if (tables.length === 0) {
      db.prepare(`
        CREATE TABLE conversation_sessions (
          id TEXT PRIMARY KEY NOT NULL,
          project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
          ticket_id TEXT REFERENCES tickets(id) ON DELETE SET NULL,
          user_id TEXT,
          environment TEXT NOT NULL DEFAULT 'unknown',
          session_metadata TEXT,
          data_classification TEXT DEFAULT 'internal',
          legal_hold INTEGER DEFAULT 0,
          started_at TEXT NOT NULL DEFAULT (datetime('now')),
          ended_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `).run();
      db.prepare("CREATE INDEX idx_conversation_sessions_project ON conversation_sessions(project_id)").run();
      db.prepare("CREATE INDEX idx_conversation_sessions_ticket ON conversation_sessions(ticket_id)").run();
      db.prepare("CREATE INDEX idx_conversation_sessions_user ON conversation_sessions(user_id)").run();
      db.prepare("CREATE INDEX idx_conversation_sessions_started ON conversation_sessions(started_at)").run();
      log.info("Created conversation_sessions table for enterprise compliance logging");
    }
  } catch (err) {
    log.error("Failed to create conversation_sessions table", err);
  }

  // Create conversation_messages table for message logging with tamper detection
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversation_messages'").all();
    if (tables.length === 0) {
      db.prepare(`
        CREATE TABLE conversation_messages (
          id TEXT PRIMARY KEY NOT NULL,
          session_id TEXT NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          tool_calls TEXT,
          token_count INTEGER,
          model_id TEXT,
          sequence_number INTEGER NOT NULL,
          contains_potential_secrets INTEGER DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `).run();
      db.prepare("CREATE INDEX idx_conversation_messages_session ON conversation_messages(session_id)").run();
      db.prepare("CREATE INDEX idx_conversation_messages_session_seq ON conversation_messages(session_id, sequence_number)").run();
      db.prepare("CREATE INDEX idx_conversation_messages_created ON conversation_messages(created_at)").run();
      log.info("Created conversation_messages table for message logging with tamper detection");
    }
  } catch (err) {
    log.error("Failed to create conversation_messages table", err);
  }

  // Create audit_log_access table for tracking access to conversation logs
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log_access'").all();
    if (tables.length === 0) {
      db.prepare(`
        CREATE TABLE audit_log_access (
          id TEXT PRIMARY KEY NOT NULL,
          accessor_id TEXT NOT NULL,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          action TEXT NOT NULL,
          result TEXT NOT NULL,
          accessed_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `).run();
      db.prepare("CREATE INDEX idx_audit_log_accessor ON audit_log_access(accessor_id)").run();
      db.prepare("CREATE INDEX idx_audit_log_target ON audit_log_access(target_type, target_id)").run();
      db.prepare("CREATE INDEX idx_audit_log_accessed ON audit_log_access(accessed_at)").run();
      log.info("Created audit_log_access table for compliance audit trail");
    }
  } catch (err) {
    log.error("Failed to create audit_log_access table", err);
  }

  // Add conversation logging settings columns if missing
  try {
    const settingsColumns = db.prepare("PRAGMA table_info(settings)").all();
    const settingsColumnNames = settingsColumns.map(c => c.name);

    if (!settingsColumnNames.includes("conversation_retention_days")) {
      db.prepare("ALTER TABLE settings ADD COLUMN conversation_retention_days INTEGER DEFAULT 90").run();
      log.info("Added conversation_retention_days column to settings table");
    }
    if (!settingsColumnNames.includes("conversation_logging_enabled")) {
      db.prepare("ALTER TABLE settings ADD COLUMN conversation_logging_enabled INTEGER DEFAULT 1").run();
      log.info("Added conversation_logging_enabled column to settings table");
    }
    if (!settingsColumnNames.includes("enable_worktree_support")) {
      db.prepare("ALTER TABLE settings ADD COLUMN enable_worktree_support INTEGER DEFAULT 0").run();
      log.info("Added enable_worktree_support column to settings table (feature flag, default: disabled)");
    }
  } catch (err) {
    log.error("Failed to add conversation logging settings columns", err);
  }
}

/**
 * Initialize the database connection with WAL mode and migrations.
 * @param {string} [dbPath] - Optional path to database (defaults to XDG path)
 * @returns {{db: Database, actualDbPath: string}} Database connection and path used
 */
export function initDatabase(dbPath?: string) {
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
