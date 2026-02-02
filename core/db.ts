/**
 * Standalone database initialization for the core layer.
 *
 * Extracted from mcp-server/lib/database.ts. Works independently of the MCP
 * server — can be used by CLI, TanStack Start server functions, or tests.
 *
 * For tests, pass an in-memory database path (":memory:") or a temp file path.
 */

import Database from "better-sqlite3";
import { existsSync, copyFileSync, mkdirSync, readdirSync, writeFileSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { DbHandle, InitDatabaseResult } from "./types.ts";

// ============================================
// XDG Path Utilities (copied from mcp-server/lib/xdg.ts)
// These are pure functions with no MCP dependencies.
// ============================================

const APP_NAME = "brain-dump";

type Platform = "linux" | "darwin" | "win32" | "other";

function getPlatform(): Platform {
  const p = process.platform;
  return p === "linux" || p === "darwin" || p === "win32" ? p : "other";
}

export function getDataDir(): string {
  const p = getPlatform();
  if (p === "darwin") return join(homedir(), "Library", "Application Support", APP_NAME);
  if (p === "win32") {
    return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), APP_NAME);
  }
  return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), APP_NAME);
}

export function getStateDir(): string {
  const p = getPlatform();
  if (p === "darwin") return join(homedir(), "Library", "Application Support", APP_NAME, "state");
  if (p === "win32") {
    return join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), APP_NAME, "state");
  }
  return join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), APP_NAME);
}

export function getBackupsDir(): string {
  return join(getStateDir(), "backups");
}

export function getLegacyDir(): string {
  return join(homedir(), ".brain-dump");
}

export function getDbPath(): string {
  return join(getDataDir(), "brain-dump.db");
}

function ensureDirectoriesSync(): void {
  for (const dir of [getDataDir(), getStateDir(), getBackupsDir()]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

// ============================================
// Logger Interface
// ============================================

export interface Logger {
  info(msg: string): void;
  warn(msg: string, err?: Error): void;
  error(msg: string, err?: Error): void;
}

/** Silent logger for tests or when logging is not needed. */
export const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** Console-based logger for CLI usage. */
export const consoleLogger: Logger = {
  info: (msg: string) => console.error(`[brain-dump] ${msg}`),
  warn: (msg: string, err?: Error) =>
    console.error(`[brain-dump] WARN: ${msg}`, err?.message ?? ""),
  error: (msg: string, err?: Error) =>
    console.error(`[brain-dump] ERROR: ${msg}`, err?.message ?? ""),
};

// ============================================
// Migration
// ============================================

const MIGRATED_MARKER = ".migrated";

interface MigrationResult {
  success: boolean;
  migrated: boolean;
  message: string;
}

function isMigrationComplete(): boolean {
  return existsSync(join(getLegacyDir(), MIGRATED_MARKER));
}

function verifyDatabaseIntegrity(dbPath: string): boolean {
  if (!existsSync(dbPath)) return false;
  try {
    const testDb = new Database(dbPath, { readonly: true });
    const result = testDb.pragma("integrity_check") as Array<{ integrity_check: string }>;
    testDb.close();
    return result.length === 1 && result[0]?.integrity_check === "ok";
  } catch {
    return false;
  }
}

function migrateFromLegacySync(logger: Logger): MigrationResult {
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
    logger.info("Both legacy and XDG locations have data, using XDG");
    return { success: true, migrated: false, message: "XDG already has data" };
  }

  logger.info("Migrating from legacy ~/.brain-dump to XDG directories...");

  try {
    ensureDirectoriesSync();

    // Create pre-migration backup
    try {
      const backupsDir = getBackupsDir();
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = join(backupsDir, `pre-migration-${timestamp}.db`);
      const srcDb = new Database(legacyDbPath, { readonly: true });
      srcDb.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
      srcDb.close();
      logger.info(`Created pre-migration backup: ${backupPath}`);
    } catch (backupErr) {
      const err = backupErr instanceof Error ? backupErr : new Error(String(backupErr));
      logger.error("Failed to create backup, continuing anyway", err);
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
      logger.info(`Copied ${files.length} attachments`);
    }

    // Create migration marker
    writeFileSync(
      join(legacyDir, MIGRATED_MARKER),
      JSON.stringify(
        {
          migratedAt: new Date().toISOString(),
          migratedTo: getDataDir(),
          note: "Data has been migrated to XDG directories.",
        },
        null,
        2
      ),
      { mode: 0o600 }
    );

    logger.info("Migration complete! Legacy data preserved in ~/.brain-dump");
    return { success: true, migrated: true, message: "Migration complete" };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Migration failed", err);
    return { success: false, migrated: false, message: `Migration failed: ${err.message}` };
  }
}

// ============================================
// Schema Migrations
// ============================================

interface ColumnInfo {
  name: string;
  [key: string]: unknown;
}

function tableExists(db: DbHandle, tableName: string): boolean {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .all(tableName) as Array<{ name: string }>;
  return tables.length > 0;
}

function columnExists(db: DbHandle, tableName: string, columnName: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as ColumnInfo[];
  return columns.some((col) => col.name === columnName);
}

function addColumnIfMissing(
  db: DbHandle,
  table: string,
  column: string,
  definition: string,
  logger: Logger
): void {
  if (!columnExists(db, table, column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
    logger.info(`Added ${column} column to ${table} table`);
  }
}

export function runMigrations(db: DbHandle, logger: Logger = silentLogger): void {
  // Ticket columns
  addColumnIfMissing(db, "tickets", "linked_commits", "TEXT", logger);
  addColumnIfMissing(db, "tickets", "branch_name", "TEXT", logger);
  addColumnIfMissing(db, "tickets", "pr_number", "INTEGER", logger);
  addColumnIfMissing(db, "tickets", "pr_url", "TEXT", logger);
  addColumnIfMissing(db, "tickets", "pr_status", "TEXT", logger);

  // Project columns
  addColumnIfMissing(db, "projects", "working_method", "TEXT DEFAULT 'auto'", logger);

  // Ralph events table
  if (!tableExists(db, "ralph_events")) {
    db.prepare(
      `
      CREATE TABLE ralph_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        data TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `
    ).run();
    db.prepare("CREATE INDEX idx_ralph_events_session ON ralph_events(session_id)").run();
    db.prepare("CREATE INDEX idx_ralph_events_created ON ralph_events(created_at)").run();
    logger.info("Created ralph_events table");
  }

  // Ralph sessions table
  if (!tableExists(db, "ralph_sessions")) {
    db.prepare(
      `
      CREATE TABLE ralph_sessions (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        current_state TEXT NOT NULL DEFAULT 'idle',
        state_history TEXT,
        outcome TEXT,
        error_message TEXT,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      )
    `
    ).run();
    db.prepare("CREATE INDEX idx_ralph_sessions_ticket ON ralph_sessions(ticket_id)").run();
    db.prepare("CREATE INDEX idx_ralph_sessions_state ON ralph_sessions(current_state)").run();
    logger.info("Created ralph_sessions table");
  } else {
    addColumnIfMissing(
      db,
      "ralph_sessions",
      "current_state",
      "TEXT NOT NULL DEFAULT 'idle'",
      logger
    );
    addColumnIfMissing(db, "ralph_sessions", "state_history", "TEXT", logger);
    addColumnIfMissing(db, "ralph_sessions", "completed_at", "TEXT", logger);
    addColumnIfMissing(
      db,
      "ralph_sessions",
      "project_id",
      "TEXT REFERENCES projects(id) ON DELETE SET NULL",
      logger
    );
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_ralph_sessions_state ON ralph_sessions(current_state)"
    ).run();
  }

  // Conversation sessions table (enterprise compliance)
  if (!tableExists(db, "conversation_sessions")) {
    db.prepare(
      `
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
    `
    ).run();
    db.prepare(
      "CREATE INDEX idx_conversation_sessions_project ON conversation_sessions(project_id)"
    ).run();
    db.prepare(
      "CREATE INDEX idx_conversation_sessions_ticket ON conversation_sessions(ticket_id)"
    ).run();
    db.prepare(
      "CREATE INDEX idx_conversation_sessions_user ON conversation_sessions(user_id)"
    ).run();
    db.prepare(
      "CREATE INDEX idx_conversation_sessions_started ON conversation_sessions(started_at)"
    ).run();
    logger.info("Created conversation_sessions table");
  }

  // Conversation messages table
  if (!tableExists(db, "conversation_messages")) {
    db.prepare(
      `
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
    `
    ).run();
    db.prepare(
      "CREATE INDEX idx_conversation_messages_session ON conversation_messages(session_id)"
    ).run();
    db.prepare(
      "CREATE INDEX idx_conversation_messages_session_seq ON conversation_messages(session_id, sequence_number)"
    ).run();
    db.prepare(
      "CREATE INDEX idx_conversation_messages_created ON conversation_messages(created_at)"
    ).run();
    logger.info("Created conversation_messages table");
  }

  // Audit log access table
  if (!tableExists(db, "audit_log_access")) {
    db.prepare(
      `
      CREATE TABLE audit_log_access (
        id TEXT PRIMARY KEY NOT NULL,
        accessor_id TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        action TEXT NOT NULL,
        result TEXT NOT NULL,
        accessed_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `
    ).run();
    db.prepare("CREATE INDEX idx_audit_log_accessor ON audit_log_access(accessor_id)").run();
    db.prepare(
      "CREATE INDEX idx_audit_log_target ON audit_log_access(target_type, target_id)"
    ).run();
    db.prepare("CREATE INDEX idx_audit_log_accessed ON audit_log_access(accessed_at)").run();
    logger.info("Created audit_log_access table");
  }

  // Settings columns for conversation logging
  addColumnIfMissing(db, "settings", "conversation_retention_days", "INTEGER DEFAULT 90", logger);
  addColumnIfMissing(db, "settings", "conversation_logging_enabled", "INTEGER DEFAULT 1", logger);
}

// ============================================
// Database Initialization
// ============================================

export interface InitDatabaseOptions {
  /** Override database path. Use ":memory:" for tests. */
  dbPath?: string;
  /** Logger instance. Defaults to silentLogger. */
  logger?: Logger;
  /** Skip legacy migration (useful for tests). */
  skipMigration?: boolean;
  /** Skip schema migrations (useful when connecting to existing DB). */
  skipSchemaMigrations?: boolean;
}

/**
 * Initialize a database connection with WAL mode and run migrations.
 *
 * For production: `initDatabase()` — uses XDG paths, runs legacy migration.
 * For tests: `initDatabase({ dbPath: ":memory:", skipMigration: true })`.
 */
export function initDatabase(options: InitDatabaseOptions = {}): InitDatabaseResult {
  const {
    dbPath: overridePath,
    logger = silentLogger,
    skipMigration = false,
    skipSchemaMigrations = false,
  } = options;

  if (!skipMigration) {
    ensureDirectoriesSync();

    const migrationResult = migrateFromLegacySync(logger);
    if (migrationResult.migrated) {
      logger.info(migrationResult.message);
    }
  }

  let actualDbPath: string;

  if (overridePath) {
    actualDbPath = overridePath;
  } else {
    const xdgDbPath = getDbPath();
    const legacyDbPath = join(getLegacyDir(), "brain-dump.db");

    if (existsSync(xdgDbPath)) {
      actualDbPath = xdgDbPath;
    } else if (existsSync(legacyDbPath) && !isMigrationComplete()) {
      logger.info(`Using legacy database at ${legacyDbPath}`);
      actualDbPath = legacyDbPath;
    } else {
      // For fresh installs, create a new database at the XDG path
      ensureDirectoriesSync();
      actualDbPath = xdgDbPath;
    }
  }

  const db = new Database(actualDbPath);
  db.pragma("journal_mode = WAL");
  logger.info(`Connected to database: ${actualDbPath}`);

  if (!skipSchemaMigrations) {
    runMigrations(db, logger);
  }

  return { db, dbPath: actualDbPath };
}

/**
 * Create an in-memory database with the base schema for testing.
 * This creates all tables needed by the application.
 */
export function createTestDatabase(logger: Logger = silentLogger): InitDatabaseResult {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");

  // Create base schema (matching src/lib/schema.ts / Drizzle migrations)
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      color TEXT,
      working_method TEXT DEFAULT 'auto',
      default_isolation_mode TEXT,
      worktree_location TEXT DEFAULT 'sibling',
      worktree_base_path TEXT,
      max_worktrees INTEGER DEFAULT 5,
      auto_cleanup_worktrees INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS epics (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      color TEXT,
      isolation_mode TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'backlog',
      priority TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      epic_id TEXT REFERENCES epics(id) ON DELETE SET NULL,
      tags TEXT,
      subtasks TEXT,
      is_blocked INTEGER NOT NULL DEFAULT 0,
      blocked_reason TEXT,
      linked_files TEXT,
      attachments TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      linked_commits TEXT,
      branch_name TEXT,
      pr_number INTEGER,
      pr_url TEXT,
      pr_status TEXT
    );

    CREATE TABLE IF NOT EXISTS ticket_comments (
      id TEXT PRIMARY KEY NOT NULL,
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT 'user',
      type TEXT NOT NULL DEFAULT 'comment',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY NOT NULL DEFAULT 'default',
      terminal_emulator TEXT,
      ralph_sandbox INTEGER DEFAULT 0,
      ralph_timeout INTEGER DEFAULT 3600,
      ralph_max_iterations INTEGER DEFAULT 10,
      auto_create_pr INTEGER DEFAULT 1,
      pr_target_branch TEXT DEFAULT 'main',
      default_projects_directory TEXT,
      default_working_method TEXT DEFAULT 'auto',
      docker_runtime TEXT,
      docker_socket_path TEXT,
      conversation_retention_days INTEGER DEFAULT 90,
      conversation_logging_enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO settings (id) VALUES ('default');

    CREATE TABLE IF NOT EXISTS ticket_workflow_state (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
      current_phase TEXT NOT NULL DEFAULT 'implementation',
      review_iteration INTEGER NOT NULL DEFAULT 0,
      findings_count INTEGER NOT NULL DEFAULT 0,
      findings_fixed INTEGER NOT NULL DEFAULT 0,
      demo_generated INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS review_findings (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      iteration INTEGER NOT NULL,
      agent TEXT NOT NULL,
      severity TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      file_path TEXT,
      line_number INTEGER,
      suggested_fix TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      fixed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS demo_scripts (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
      steps TEXT NOT NULL,
      generated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      feedback TEXT,
      passed INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_ticket ON ticket_workflow_state(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_findings_ticket ON review_findings(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_findings_status ON review_findings(status);

    CREATE TABLE IF NOT EXISTS telemetry_sessions (
      id TEXT PRIMARY KEY,
      ticket_id TEXT REFERENCES tickets(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      environment TEXT NOT NULL DEFAULT 'unknown',
      branch_name TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT,
      total_prompts INTEGER DEFAULT 0,
      total_tool_calls INTEGER DEFAULT 0,
      total_duration_ms INTEGER,
      total_tokens INTEGER,
      outcome TEXT
    );

    CREATE TABLE IF NOT EXISTS telemetry_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES telemetry_sessions(id) ON DELETE CASCADE,
      ticket_id TEXT REFERENCES tickets(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      tool_name TEXT,
      event_data TEXT,
      duration_ms INTEGER,
      token_count INTEGER,
      is_error INTEGER DEFAULT 0,
      correlation_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_telemetry_sessions_ticket ON telemetry_sessions(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_telemetry_events_session ON telemetry_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_telemetry_events_correlation ON telemetry_events(correlation_id);
  `);

  // Run the additional migration tables
  runMigrations(db, logger);

  logger.info("Created test database with base schema");
  return { db, dbPath: ":memory:" };
}
