import * as schema from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sqlite: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _dbPath: any;
let initialized = false;

// Check if we're in a browser environment
const isBrowser = typeof window !== "undefined";

// Only initialize on the server side
if (!isBrowser && typeof require !== "undefined") {
  initializeDatabase();
}

 
function initializeDatabase() {
  if (initialized || isBrowser) {
    return;
  }

  // Use require for Node.js modules - these only exist on the server
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require("drizzle-orm/better-sqlite3");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getDatabasePath, ensureDirectoriesSync } = require("./xdg");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { migrateFromLegacySync } = require("./migration");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { initializeLockSync } = require("./lockfile");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { initializeWatcher, stopWatching } = require("./db-watcher");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { startupIntegrityCheck } = require("./integrity");

  // Ensure XDG directories exist with proper permissions
  ensureDirectoriesSync();

  // Run migration from legacy ~/.brain-dump if needed
  const migrationResult = migrateFromLegacySync();
  if (migrationResult.migrated) {
    console.log(`[DB] Migration completed: ${migrationResult.message}`);
  }

  // Get database path from XDG utility
  _dbPath = getDatabasePath();

  // Run quick integrity check on startup
  const integrityResult = startupIntegrityCheck(_dbPath);
  if (!integrityResult.healthy) {
    console.warn(`[DB] WARNING: ${integrityResult.message}`);
    if (integrityResult.suggestRestore) {
      console.warn(`[DB] A backup is available. Run: brain-dump restore --latest`);
    }
  } else {
    console.log(`[DB] ${integrityResult.message}`);
  }

  // Create database connection
  _sqlite = new Database(_dbPath);
  _sqlite.pragma("journal_mode = WAL");
  _sqlite.pragma("foreign_keys = ON");

  // Acquire lock and setup graceful shutdown
  const lockResult = initializeLockSync("vite", () => {
    try {
      stopWatching();
      _sqlite.pragma("wal_checkpoint(TRUNCATE)");
      _sqlite.close();
    } catch (error) {
      console.warn("[DB] Cleanup error during shutdown:", error);
    }
  });
  if (lockResult.acquired) {
    console.log(`[DB] ${lockResult.message}`);
  }

  // Start watching for unexpected database file deletions
  if (initializeWatcher(_dbPath)) {
    console.log(`[DB] Database file watcher started`);
  }

  // Initialize tables and other schema
  initTables();
  migrateProjectsTable();
  initFTS5();
  initSettings();
  initTicketComments();
  initRalphEvents();
  initRalphSessions();
  initConversationLogging();

  // Schedule backup maintenance
  scheduleBackupMaintenance();
  cleanupLaunchScripts();

  _db = drizzle(_sqlite, { schema });
  initialized = true;
}

// Auto-create tables if they don't exist
function initTables() {
  const projectsExists = _sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'")
    .get();

  if (!projectsExists) {
    console.log("Creating database tables...");

    // Create projects table
    _sqlite.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        color TEXT,
        working_method TEXT DEFAULT 'auto',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Create epics table
    _sqlite.exec(`
      CREATE TABLE epics (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        color TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    _sqlite.exec(`CREATE INDEX idx_epics_project ON epics (project_id)`);

    // Create tickets table
    _sqlite.exec(`
      CREATE TABLE tickets (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'backlog',
        priority TEXT,
        position REAL NOT NULL,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        epic_id TEXT REFERENCES epics(id) ON DELETE SET NULL,
        tags TEXT,
        subtasks TEXT,
        is_blocked INTEGER DEFAULT 0,
        blocked_reason TEXT,
        linked_files TEXT,
        attachments TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      )
    `);
    _sqlite.exec(`CREATE INDEX idx_tickets_project ON tickets (project_id)`);
    _sqlite.exec(`CREATE INDEX idx_tickets_epic ON tickets (epic_id)`);
    _sqlite.exec(`CREATE INDEX idx_tickets_status ON tickets (status)`);

    console.log("Database tables created successfully");

    // Seed sample data
    seedSampleData();
  }
}

function seedSampleData() {
  console.log("Seeding sample data...");

  const projectId = "sample-project-1";
  const epicId = "sample-epic-1";

  _sqlite
    .prepare("INSERT INTO projects (id, name, path, color) VALUES (?, ?, ?, ?)")
    .run(projectId, "My First Project", "/home/user/projects/my-project", "#3b82f6");

  _sqlite
    .prepare("INSERT INTO epics (id, title, description, project_id, color) VALUES (?, ?, ?, ?, ?)")
    .run(epicId, "Getting Started", "Learn how to use Brain Dump", projectId, "#8b5cf6");

  const sampleTickets = [
    {
      id: "sample-1",
      title: "Welcome to Brain Dump!",
      desc: "This is your personal task management system. Drag tickets between columns to update their status.",
      status: "backlog",
      priority: "medium",
      pos: 1000,
    },
    {
      id: "sample-2",
      title: 'Try the "Start Work" button',
      desc: 'Click "Start Work" on a ticket to open Claude Code with full context.',
      status: "ready",
      priority: "high",
      pos: 2000,
    },
    {
      id: "sample-3",
      title: "Create your own project",
      desc: "Click the + button in the sidebar to add a new project with your actual code path.",
      status: "backlog",
      priority: "low",
      pos: 3000,
    },
    {
      id: "sample-4",
      title: "Use keyboard shortcuts",
      desc: 'Press "n" for new ticket, "/" to search, "?" for help.',
      status: "backlog",
      priority: "medium",
      pos: 4000,
    },
  ];

  const insertTicket = _sqlite.prepare(
    "INSERT INTO tickets (id, title, description, status, priority, position, project_id, epic_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );

  for (const t of sampleTickets) {
    insertTicket.run(t.id, t.title, t.desc, t.status, t.priority, t.pos, projectId, epicId);
  }

  console.log("Sample data seeded successfully");
}

function migrateProjectsTable() {
  const tableInfo = _sqlite.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
  const columns = tableInfo.map((col) => col.name);

  if (!columns.includes("working_method")) {
    console.log("Adding working_method column to projects...");
    _sqlite.exec("ALTER TABLE projects ADD COLUMN working_method TEXT DEFAULT 'auto'");
  }
}

function initFTS5() {
  const tableExists = _sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tickets_fts'")
    .get();

  if (!tableExists) {
    _sqlite.exec(`
      CREATE VIRTUAL TABLE tickets_fts USING fts5(
        title,
        description,
        tags,
        subtasks,
        content=tickets,
        content_rowid=rowid
      )
    `);

    _sqlite.exec(`
      INSERT INTO tickets_fts(rowid, title, description, tags, subtasks)
      SELECT rowid, title, COALESCE(description, ''), COALESCE(tags, ''), COALESCE(subtasks, '')
      FROM tickets
    `);

    _sqlite.exec(`
      CREATE TRIGGER tickets_ai AFTER INSERT ON tickets BEGIN
        INSERT INTO tickets_fts(rowid, title, description, tags, subtasks)
        VALUES (NEW.rowid, NEW.title, COALESCE(NEW.description, ''), COALESCE(NEW.tags, ''), COALESCE(NEW.subtasks, ''));
      END
    `);

    _sqlite.exec(`
      CREATE TRIGGER tickets_ad AFTER DELETE ON tickets BEGIN
        INSERT INTO tickets_fts(tickets_fts, rowid, title, description, tags, subtasks)
        VALUES ('delete', OLD.rowid, OLD.title, COALESCE(OLD.description, ''), COALESCE(OLD.tags, ''), COALESCE(OLD.subtasks, ''));
      END
    `);

    _sqlite.exec(`
      CREATE TRIGGER tickets_au AFTER UPDATE ON tickets BEGIN
        INSERT INTO tickets_fts(tickets_fts, rowid, title, description, tags, subtasks)
        VALUES ('delete', OLD.rowid, OLD.title, COALESCE(OLD.description, ''), COALESCE(OLD.tags, ''), COALESCE(OLD.subtasks, ''));
        INSERT INTO tickets_fts(rowid, title, description, tags, subtasks)
        VALUES (NEW.rowid, NEW.title, COALESCE(NEW.description, ''), COALESCE(NEW.tags, ''), COALESCE(NEW.subtasks, ''));
      END
    `);
  }
}

function initSettings() {
  const settingsExists = _sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'")
    .get();

  if (!settingsExists) {
    console.log("Creating settings table...");
    _sqlite.exec(`
      CREATE TABLE settings (
        id TEXT PRIMARY KEY DEFAULT 'default' NOT NULL,
        terminal_emulator TEXT,
        ralph_sandbox INTEGER DEFAULT 0,
        auto_create_pr INTEGER DEFAULT 1,
        pr_target_branch TEXT DEFAULT 'dev',
        conversation_retention_days INTEGER DEFAULT 90,
        conversation_logging_enabled INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    _sqlite.exec(`INSERT INTO settings (id) VALUES ('default')`);
    console.log("Settings table created successfully");
  } else {
    const tableInfo = _sqlite.prepare("PRAGMA table_info(settings)").all() as { name: string }[];
    const columns = tableInfo.map((col) => col.name);

    if (!columns.includes("ralph_sandbox")) {
      console.log("Adding ralph_sandbox column to settings...");
      _sqlite.exec("ALTER TABLE settings ADD COLUMN ralph_sandbox INTEGER DEFAULT 0");
    }
    if (!columns.includes("auto_create_pr")) {
      console.log("Adding auto_create_pr column to settings...");
      _sqlite.exec("ALTER TABLE settings ADD COLUMN auto_create_pr INTEGER DEFAULT 1");
    }
    if (!columns.includes("pr_target_branch")) {
      console.log("Adding pr_target_branch column to settings...");
      _sqlite.exec("ALTER TABLE settings ADD COLUMN pr_target_branch TEXT DEFAULT 'dev'");
    }
    if (!columns.includes("conversation_retention_days")) {
      console.log("Adding conversation_retention_days column to settings...");
      _sqlite.exec(
        "ALTER TABLE settings ADD COLUMN conversation_retention_days INTEGER DEFAULT 90"
      );
    }
    if (!columns.includes("conversation_logging_enabled")) {
      console.log("Adding conversation_logging_enabled column to settings...");
      _sqlite.exec(
        "ALTER TABLE settings ADD COLUMN conversation_logging_enabled INTEGER DEFAULT 1"
      );
    }
  }
}

function initTicketComments() {
  const commentsExists = _sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ticket_comments'")
    .get();

  if (!commentsExists) {
    console.log("Creating ticket_comments table...");
    _sqlite.exec(`
      CREATE TABLE ticket_comments (
        id TEXT PRIMARY KEY NOT NULL,
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        author TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'comment',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    _sqlite.exec(`CREATE INDEX idx_comments_ticket ON ticket_comments (ticket_id)`);
    console.log("ticket_comments table created successfully");
  }
}

function initRalphEvents() {
  const eventsExists = _sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ralph_events'")
    .get();

  if (!eventsExists) {
    console.log("Creating ralph_events table...");
    _sqlite.exec(`
      CREATE TABLE ralph_events (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        data TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    _sqlite.exec(`CREATE INDEX idx_ralph_events_session ON ralph_events (session_id)`);
    _sqlite.exec(`CREATE INDEX idx_ralph_events_created ON ralph_events (created_at)`);
    console.log("ralph_events table created successfully");
  }
}

function initRalphSessions() {
  const sessionsExists = _sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ralph_sessions'")
    .get();

  if (!sessionsExists) {
    console.log("Creating ralph_sessions table...");
    _sqlite.exec(`
      CREATE TABLE ralph_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        current_state TEXT NOT NULL DEFAULT 'idle',
        state_history TEXT,
        outcome TEXT,
        error_message TEXT,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      )
    `);
    _sqlite.exec(`CREATE INDEX idx_ralph_sessions_ticket ON ralph_sessions (ticket_id)`);
    _sqlite.exec(`CREATE INDEX idx_ralph_sessions_state ON ralph_sessions (current_state)`);
    console.log("ralph_sessions table created successfully");
  }
}

function initConversationLogging() {
  const conversationSessionsExists = _sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversation_sessions'")
    .get();

  if (!conversationSessionsExists) {
    console.log("Creating conversation_sessions table...");
    _sqlite.exec(`
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
    `);
    _sqlite.exec(
      `CREATE INDEX idx_conversation_sessions_project ON conversation_sessions (project_id)`
    );
    _sqlite.exec(
      `CREATE INDEX idx_conversation_sessions_ticket ON conversation_sessions (ticket_id)`
    );
    _sqlite.exec(`CREATE INDEX idx_conversation_sessions_user ON conversation_sessions (user_id)`);
    _sqlite.exec(
      `CREATE INDEX idx_conversation_sessions_started ON conversation_sessions (started_at)`
    );
    console.log("conversation_sessions table created successfully");
  }

  const conversationMessagesExists = _sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversation_messages'")
    .get();

  if (!conversationMessagesExists) {
    console.log("Creating conversation_messages table...");
    _sqlite.exec(`
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
    `);
    _sqlite.exec(
      `CREATE INDEX idx_conversation_messages_session ON conversation_messages (session_id)`
    );
    _sqlite.exec(
      `CREATE INDEX idx_conversation_messages_session_seq ON conversation_messages (session_id, sequence_number)`
    );
    _sqlite.exec(
      `CREATE INDEX idx_conversation_messages_created ON conversation_messages (created_at)`
    );
    console.log("conversation_messages table created successfully");
  }

  const auditLogExists = _sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log_access'")
    .get();

  if (!auditLogExists) {
    console.log("Creating audit_log_access table...");
    _sqlite.exec(`
      CREATE TABLE audit_log_access (
        id TEXT PRIMARY KEY NOT NULL,
        accessor_id TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        action TEXT NOT NULL,
        result TEXT NOT NULL,
        accessed_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    _sqlite.exec(`CREATE INDEX idx_audit_log_accessor ON audit_log_access (accessor_id)`);
    _sqlite.exec(`CREATE INDEX idx_audit_log_target ON audit_log_access (target_type, target_id)`);
    _sqlite.exec(`CREATE INDEX idx_audit_log_accessed ON audit_log_access (accessed_at)`);
    console.log("audit_log_access table created successfully");
  }
}

function scheduleBackupMaintenance() {
  const BACKUP_DEFER_MS = 5000;

  setTimeout(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { performDailyBackupSync } = require("./backup");
      const result = performDailyBackupSync();
      if (result.backup.created) {
        console.log(`[Backup] ${result.backup.message}`);
      }
      if (result.cleanup.deleted > 0) {
        console.log(`[Backup] ${result.cleanup.message}`);
      }
    } catch (error) {
      console.error("[Backup] Backup maintenance failed:", error);
    }
  }, BACKUP_DEFER_MS);
}

async function cleanupLaunchScripts() {
  try {
    const { cleanupOldScripts } = await import("../api/terminal");
    await cleanupOldScripts();
  } catch (error) {
    console.warn("[DB] Failed to cleanup launch scripts:", error);
  }
}

export { _db as db, _sqlite as sqlite, _dbPath as dbPath };
