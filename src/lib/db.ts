import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { getDatabasePath, ensureDirectoriesSync } from "./xdg";
import { migrateFromLegacySync } from "./migration";
import { performDailyBackupSync } from "./backup";
import { initializeLockSync } from "./lockfile";
import { initializeWatcher, stopWatching } from "./db-watcher";
import { startupIntegrityCheck } from "./integrity";
import { ensureTelemetryTables, ensureTicketWorkflowColumns } from "./db-bootstrap";
import {
  drainVerificationQueue,
  isVerificationExecutionAllowedFromEnv,
  resolveBrainDumpRootFrom,
  shouldStartVerificationWorkerFromEnv,
  spawnDetachedVerificationDrainIfNeeded,
  startVerificationWorker,
} from "../../core/verification-worker.ts";
import { drainEpicContinuations } from "../../core/epic-continuation.ts";
import { launchEpicContinuationHeadless } from "./ralph-launch/epic-continuation-adapter";
import { execFileNoThrow } from "../utils/execFileNoThrow";

const disableStartupTasks = process.env.BRAIN_DUMP_DISABLE_DB_STARTUP_TASKS === "1";

// Ensure XDG directories exist with proper permissions
ensureDirectoriesSync();

// Run migration from legacy ~/.brain-dump if needed
// This must happen before opening the database
if (!disableStartupTasks) {
  const migrationResult = migrateFromLegacySync();
  if (migrationResult.migrated) {
    console.log(`[DB] Migration completed: ${migrationResult.message}`);
  }
}

// Get database path from XDG utility
const dbPath = getDatabasePath();

// Run quick integrity check on startup (fast, stops at first error)
if (!disableStartupTasks) {
  const integrityResult = startupIntegrityCheck(dbPath);
  if (!integrityResult.healthy) {
    console.warn(`[DB] WARNING: ${integrityResult.message}`);
    if (integrityResult.suggestRestore) {
      console.warn(`[DB] A backup is available. Run: brain-dump restore --latest`);
    }
  } else {
    console.log(`[DB] ${integrityResult.message}`);
  }
}

/**
 * Apply connection PRAGMAs tuned for a local, read-heavy desktop app where the
 * UI, MCP server, and CLI may all touch the same SQLite file concurrently.
 * Must run on every new connection (PRAGMAs are per-connection, not persisted).
 */
function applyConnectionPragmas(connection: Database.Database): void {
  connection.pragma("journal_mode = WAL"); // concurrent readers + single writer
  connection.pragma("foreign_keys = ON"); // enforce cascades/constraints
  connection.pragma("synchronous = NORMAL"); // biggest write-latency win; crash-safe under WAL
  connection.pragma("busy_timeout = 5000"); // wait out locks instead of throwing SQLITE_BUSY
  connection.pragma("cache_size = -32000"); // ~32MB page cache (negative = KiB)
  connection.pragma("mmap_size = 268435456"); // 256MB memory-mapped reads
  connection.pragma("temp_store = MEMORY"); // keep ORDER BY/GROUP BY temp data off disk
}

// Create database connection
const sqlite = new Database(dbPath);
applyConnectionPragmas(sqlite);

// Acquire lock and setup graceful shutdown
// This ensures lock is cleaned up and WAL is checkpointed on shutdown
if (!disableStartupTasks) {
  const lockResult = initializeLockSync("vite", () => {
    try {
      stopWatching(); // Stop file watcher
      sqlite.pragma("wal_checkpoint(TRUNCATE)");
      sqlite.close();
    } catch (error) {
      console.warn("[DB] Cleanup error during shutdown:", error);
    }
  });
  if (lockResult.acquired) {
    console.log(`[DB] ${lockResult.message}`);
  }
}

// Start watching for unexpected database file deletions
if (!disableStartupTasks && initializeWatcher(dbPath)) {
  console.log(`[DB] Database file watcher started`);
}

function columnExists(tableName: string, columnName: string): boolean {
  const columns = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: string;
  }>;
  return columns.some((column) => column.name === columnName);
}

function isDuplicateColumnError(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes("duplicate column name");
}

function ensureColumnExists(tableName: string, columnName: string, definition: string): void {
  if (!columnExists(tableName, columnName)) {
    try {
      sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    } catch (error) {
      if (!isDuplicateColumnError(error)) {
        throw error;
      }
    }
  }
}

function backfillProjectPositions(): void {
  const projectRows = sqlite
    .prepare("SELECT id FROM projects ORDER BY datetime(created_at), rowid")
    .all() as Array<{ id: string }>;

  const updateProjectPosition = sqlite.prepare("UPDATE projects SET position = ? WHERE id = ?");

  const fillPositions = sqlite.transaction((rows: Array<{ id: string }>) => {
    rows.forEach((row, index) => {
      updateProjectPosition.run(index + 1, row.id);
    });
  });

  fillPositions(projectRows);
}

// Auto-create tables if they don't exist
function initTables() {
  const projectsExists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'")
    .get();

  if (!projectsExists) {
    console.log("Creating database tables...");

    // Create projects table
    sqlite.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        color TEXT,
        working_method TEXT DEFAULT 'auto',
        reviewer_provider TEXT,
        reviewer_model TEXT,
        position REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Create epics table
    sqlite.exec(`
      CREATE TABLE epics (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        color TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    sqlite.exec(`CREATE INDEX idx_epics_project ON epics (project_id)`);

    // Create tickets table
    sqlite.exec(`
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
        completed_at TEXT,
        branch_name TEXT,
        pr_number INTEGER,
        pr_url TEXT,
        pr_status TEXT
      )
    `);
    sqlite.exec(`CREATE INDEX idx_tickets_project ON tickets (project_id)`);
    sqlite.exec(`CREATE INDEX idx_tickets_epic ON tickets (epic_id)`);
    sqlite.exec(`CREATE INDEX idx_tickets_status ON tickets (status)`);

    console.log("Database tables created successfully");

    // Seed sample data
    seedSampleData();
  }
}

function seedSampleData() {
  console.log("Seeding sample data...");

  const projectId = "sample-project-1";
  const epicId = "sample-epic-1";

  // Create a sample project using parameterized query
  sqlite
    .prepare("INSERT INTO projects (id, name, path, color) VALUES (?, ?, ?, ?)")
    .run(projectId, "My First Project", "/home/user/projects/my-project", "#3b82f6");

  // Create a sample epic using parameterized query
  sqlite
    .prepare("INSERT INTO epics (id, title, description, project_id, color) VALUES (?, ?, ?, ?, ?)")
    .run(epicId, "Getting Started", "Learn how to use Brain Dump", projectId, "#8b5cf6");

  // Create sample tickets
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

  // Use parameterized query for ticket insertion
  const insertTicket = sqlite.prepare(
    "INSERT INTO tickets (id, title, description, status, priority, position, project_id, epic_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );

  for (const t of sampleTickets) {
    insertTicket.run(t.id, t.title, t.desc, t.status, t.priority, t.pos, projectId, epicId);
  }

  console.log("Sample data seeded successfully");
}

// Add new projects columns to existing databases
function migrateProjectsTable() {
  if (!columnExists("projects", "working_method")) {
    console.log("Adding working_method column to projects...");
    ensureColumnExists("projects", "working_method", "TEXT DEFAULT 'auto'");
  }
  if (!columnExists("projects", "reviewer_provider")) {
    console.log("Adding reviewer_provider column to projects...");
    ensureColumnExists("projects", "reviewer_provider", "TEXT");
  }
  if (!columnExists("projects", "reviewer_model")) {
    console.log("Adding reviewer_model column to projects...");
    ensureColumnExists("projects", "reviewer_model", "TEXT");
  }

  const shouldBackfillExistingPositions = (): boolean => {
    const maxRow = sqlite.prepare("SELECT MAX(position) as maxPosition FROM projects").get() as {
      maxPosition: number | null;
    };
    return (maxRow?.maxPosition ?? 0) <= 0;
  };

  if (!columnExists("projects", "position")) {
    console.log("Adding position column to projects...");
    ensureColumnExists("projects", "position", "REAL NOT NULL DEFAULT 0");
    if (shouldBackfillExistingPositions()) {
      backfillProjectPositions();
    }
  } else if (shouldBackfillExistingPositions()) {
    backfillProjectPositions();
  }

  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_projects_position ON projects(position)");
}

function migrateEpicWorkflowStateTable() {
  const workflowStateExists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='epic_workflow_state'")
    .get();

  if (!workflowStateExists) {
    return;
  }

  const tableInfo = sqlite.prepare("PRAGMA table_info(epic_workflow_state)").all() as {
    name: string;
  }[];
  const columns = tableInfo.map((col) => col.name);

  if (!columns.includes("epic_branch_name")) {
    sqlite.exec("ALTER TABLE epic_workflow_state ADD COLUMN epic_branch_name TEXT");
  }
  if (!columns.includes("epic_branch_created_at")) {
    sqlite.exec("ALTER TABLE epic_workflow_state ADD COLUMN epic_branch_created_at TEXT");
  }
  if (!columns.includes("pr_number")) {
    sqlite.exec("ALTER TABLE epic_workflow_state ADD COLUMN pr_number INTEGER");
  }
  if (!columns.includes("pr_url")) {
    sqlite.exec("ALTER TABLE epic_workflow_state ADD COLUMN pr_url TEXT");
  }
  if (!columns.includes("pr_status")) {
    sqlite.exec("ALTER TABLE epic_workflow_state ADD COLUMN pr_status TEXT");
  }
}

// Initialize FTS5 table for search if it doesn't exist
function initFTS5() {
  const tableExists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tickets_fts'")
    .get();

  if (!tableExists) {
    // Create FTS5 virtual table
    sqlite.exec(`
      CREATE VIRTUAL TABLE tickets_fts USING fts5(
        title,
        description,
        tags,
        subtasks,
        content=tickets,
        content_rowid=rowid
      )
    `);

    // Populate with existing data
    sqlite.exec(`
      INSERT INTO tickets_fts(rowid, title, description, tags, subtasks)
      SELECT rowid, title, COALESCE(description, ''), COALESCE(tags, ''), COALESCE(subtasks, '')
      FROM tickets
    `);

    // Create triggers to keep FTS in sync
    sqlite.exec(`
      CREATE TRIGGER tickets_ai AFTER INSERT ON tickets BEGIN
        INSERT INTO tickets_fts(rowid, title, description, tags, subtasks)
        VALUES (NEW.rowid, NEW.title, COALESCE(NEW.description, ''), COALESCE(NEW.tags, ''), COALESCE(NEW.subtasks, ''));
      END
    `);

    sqlite.exec(`
      CREATE TRIGGER tickets_ad AFTER DELETE ON tickets BEGIN
        INSERT INTO tickets_fts(tickets_fts, rowid, title, description, tags, subtasks)
        VALUES ('delete', OLD.rowid, OLD.title, COALESCE(OLD.description, ''), COALESCE(OLD.tags, ''), COALESCE(OLD.subtasks, ''));
      END
    `);

    sqlite.exec(`
      CREATE TRIGGER tickets_au AFTER UPDATE ON tickets BEGIN
        INSERT INTO tickets_fts(tickets_fts, rowid, title, description, tags, subtasks)
        VALUES ('delete', OLD.rowid, OLD.title, COALESCE(OLD.description, ''), COALESCE(OLD.tags, ''), COALESCE(OLD.subtasks, ''));
        INSERT INTO tickets_fts(rowid, title, description, tags, subtasks)
        VALUES (NEW.rowid, NEW.title, COALESCE(NEW.description, ''), COALESCE(NEW.tags, ''), COALESCE(NEW.subtasks, ''));
      END
    `);
  }
}

// Initialize settings table if it doesn't exist
function initSettings() {
  const settingsExists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'")
    .get();

  if (!settingsExists) {
    console.log("Creating settings table...");
    sqlite.exec(`
      CREATE TABLE settings (
        id TEXT PRIMARY KEY DEFAULT 'default' NOT NULL,
        terminal_emulator TEXT,
        ralph_sandbox INTEGER DEFAULT 0,
        ralph_timeout INTEGER DEFAULT 3600,
        ralph_max_iterations INTEGER DEFAULT 10,
        auto_create_pr INTEGER DEFAULT 1,
        epic_auto_pr INTEGER DEFAULT 1,
        verification_worker_paused INTEGER DEFAULT 0,
        pr_target_branch TEXT DEFAULT 'dev',
        default_projects_directory TEXT,
        default_working_method TEXT DEFAULT 'auto',
        default_reviewer_provider TEXT,
        default_reviewer_model TEXT,
        docker_runtime TEXT,
        docker_socket_path TEXT,
        conversation_retention_days INTEGER DEFAULT 90,
        conversation_logging_enabled INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Insert default settings row
    sqlite.exec(`INSERT INTO settings (id) VALUES ('default')`);
    console.log("Settings table created successfully");
  } else {
    // Add new columns if they don't exist (migration)
    const tableInfo = sqlite.prepare("PRAGMA table_info(settings)").all() as { name: string }[];
    const columns = tableInfo.map((col) => col.name);

    if (!columns.includes("ralph_sandbox")) {
      console.log("Adding ralph_sandbox column to settings...");
      sqlite.exec("ALTER TABLE settings ADD COLUMN ralph_sandbox INTEGER DEFAULT 0");
    }
    if (!columns.includes("auto_create_pr")) {
      console.log("Adding auto_create_pr column to settings...");
      sqlite.exec("ALTER TABLE settings ADD COLUMN auto_create_pr INTEGER DEFAULT 1");
    }
    if (!columns.includes("epic_auto_pr")) {
      console.log("Adding epic_auto_pr column to settings...");
      sqlite.exec("ALTER TABLE settings ADD COLUMN epic_auto_pr INTEGER DEFAULT 1");
    }
    if (!columns.includes("verification_worker_paused")) {
      console.log("Adding verification_worker_paused column to settings...");
      sqlite.exec("ALTER TABLE settings ADD COLUMN verification_worker_paused INTEGER DEFAULT 0");
    }
    if (!columns.includes("pr_target_branch")) {
      console.log("Adding pr_target_branch column to settings...");
      sqlite.exec("ALTER TABLE settings ADD COLUMN pr_target_branch TEXT DEFAULT 'dev'");
    }
    if (!columns.includes("ralph_timeout")) {
      sqlite.exec("ALTER TABLE settings ADD COLUMN ralph_timeout INTEGER DEFAULT 3600");
    }
    if (!columns.includes("ralph_max_iterations")) {
      sqlite.exec("ALTER TABLE settings ADD COLUMN ralph_max_iterations INTEGER DEFAULT 10");
    }
    if (!columns.includes("default_working_method")) {
      sqlite.exec("ALTER TABLE settings ADD COLUMN default_working_method TEXT DEFAULT 'auto'");
    }
    if (!columns.includes("default_reviewer_provider")) {
      sqlite.exec("ALTER TABLE settings ADD COLUMN default_reviewer_provider TEXT");
    }
    if (!columns.includes("default_reviewer_model")) {
      sqlite.exec("ALTER TABLE settings ADD COLUMN default_reviewer_model TEXT");
    }
    if (!columns.includes("default_projects_directory")) {
      sqlite.exec("ALTER TABLE settings ADD COLUMN default_projects_directory TEXT");
    }
    if (!columns.includes("docker_runtime")) {
      sqlite.exec("ALTER TABLE settings ADD COLUMN docker_runtime TEXT");
    }
    if (!columns.includes("docker_socket_path")) {
      sqlite.exec("ALTER TABLE settings ADD COLUMN docker_socket_path TEXT");
    }
  }
}

// Initialize ticket_comments table if it doesn't exist
function initTicketComments() {
  const commentsExists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ticket_comments'")
    .get();

  if (!commentsExists) {
    console.log("Creating ticket_comments table...");
    sqlite.exec(`
      CREATE TABLE ticket_comments (
        id TEXT PRIMARY KEY NOT NULL,
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        author TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'comment',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    sqlite.exec(`CREATE INDEX idx_comments_ticket ON ticket_comments (ticket_id)`);
    console.log("ticket_comments table created successfully");
  }
}

// Initialize ralph_events table if it doesn't exist
function initRalphEvents() {
  const eventsExists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ralph_events'")
    .get();

  if (!eventsExists) {
    console.log("Creating ralph_events table...");
    sqlite.exec(`
      CREATE TABLE ralph_events (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        data TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    sqlite.exec(`CREATE INDEX idx_ralph_events_session ON ralph_events (session_id)`);
    sqlite.exec(`CREATE INDEX idx_ralph_events_created ON ralph_events (created_at)`);
    console.log("ralph_events table created successfully");
  }
}

// Initialize ralph_sessions table if it doesn't exist
function initRalphSessions() {
  const sessionsExists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ralph_sessions'")
    .get();

  if (!sessionsExists) {
    console.log("Creating ralph_sessions table...");
    sqlite.exec(`
      CREATE TABLE ralph_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        current_state TEXT NOT NULL DEFAULT 'idle',
        state_history TEXT,
        outcome TEXT,
        error_message TEXT,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      )
    `);
    sqlite.exec(`CREATE INDEX idx_ralph_sessions_ticket ON ralph_sessions (ticket_id)`);
    sqlite.exec(`CREATE INDEX idx_ralph_sessions_state ON ralph_sessions (current_state)`);
    console.log("ralph_sessions table created successfully");
  } else {
    const columns = sqlite.prepare("PRAGMA table_info(ralph_sessions)").all() as Array<{
      name: string;
    }>;
    const columnNames = columns.map((col) => col.name);

    if (!columnNames.includes("project_id")) {
      console.log("Adding project_id column to ralph_sessions...");
      sqlite.exec(
        "ALTER TABLE ralph_sessions ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL"
      );
      console.log("Added project_id column to ralph_sessions");
    }
  }
}

function initReviewWorkflowTables() {
  const workflowStateExists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ticket_workflow_state'")
    .get();

  if (!workflowStateExists) {
    console.log("Creating ticket_workflow_state table...");
    sqlite.exec(`
      CREATE TABLE ticket_workflow_state (
        id TEXT PRIMARY KEY NOT NULL,
        ticket_id TEXT NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
        current_phase TEXT NOT NULL DEFAULT 'implementation',
        review_iteration INTEGER NOT NULL DEFAULT 0,
        findings_count INTEGER NOT NULL DEFAULT 0,
        findings_fixed INTEGER NOT NULL DEFAULT 0,
        demo_generated INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    sqlite.exec(`CREATE INDEX idx_workflow_ticket ON ticket_workflow_state (ticket_id)`);
    console.log("ticket_workflow_state table created successfully");
  }

  const findingsExists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='review_findings'")
    .get();

  if (!findingsExists) {
    console.log("Creating review_findings table...");
    sqlite.exec(`
      CREATE TABLE review_findings (
        id TEXT PRIMARY KEY NOT NULL,
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        iteration INTEGER NOT NULL,
        agent TEXT NOT NULL,
        severity TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        file_path TEXT,
        line_number INTEGER,
        suggested_fix TEXT,
        epic_review_run_id TEXT REFERENCES epic_review_runs(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'open',
        fixed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    sqlite.exec(`CREATE INDEX idx_findings_ticket ON review_findings (ticket_id)`);
    sqlite.exec(`CREATE INDEX idx_findings_status ON review_findings (status)`);
    console.log("review_findings table created successfully");
  }

  const demoScriptsExists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='demo_scripts'")
    .get();

  if (!demoScriptsExists) {
    console.log("Creating demo_scripts table...");
    sqlite.exec(`
      CREATE TABLE demo_scripts (
        id TEXT PRIMARY KEY NOT NULL,
        ticket_id TEXT NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
        steps TEXT NOT NULL,
        epic_review_run_id TEXT REFERENCES epic_review_runs(id) ON DELETE SET NULL,
        generated_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        feedback TEXT,
        passed INTEGER
      )
    `);
    console.log("demo_scripts table created successfully");
  }

  const verificationRunsExists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='verification_runs'")
    .get();

  if (!verificationRunsExists) {
    console.log("Creating verification_runs table...");
    sqlite.exec(`
      CREATE TABLE verification_runs (
        id TEXT PRIMARY KEY NOT NULL,
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        round INTEGER NOT NULL,
        status TEXT NOT NULL,
        certified INTEGER NOT NULL DEFAULT 0,
        manifest TEXT NOT NULL,
        git_sha TEXT,
        provider TEXT,
        actor TEXT,
        provider_source TEXT,
        execution_surface TEXT,
        worker_id TEXT,
        code_git_sha TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL
      )
    `);
    sqlite.exec(`CREATE INDEX idx_verification_runs_ticket ON verification_runs (ticket_id)`);
    sqlite.exec(
      `CREATE UNIQUE INDEX idx_verification_runs_round ON verification_runs (ticket_id, round)`
    );
    console.log("verification_runs table created successfully");
  }

  const verificationJobsExists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='verification_jobs'")
    .get();

  if (!verificationJobsExists) {
    console.log("Creating verification_jobs table...");
    sqlite.exec(`
      CREATE TABLE verification_jobs (
        id TEXT PRIMARY KEY NOT NULL,
        ticket_id TEXT NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
        demo_script_id TEXT NOT NULL REFERENCES demo_scripts(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'queued',
        attempt_count INTEGER NOT NULL DEFAULT 0,
        next_run_at TEXT NOT NULL,
        last_error TEXT,
        leased_by TEXT,
        lease_expires_at TEXT,
        provider TEXT,
        actor TEXT,
        provider_source TEXT,
        execution_surface TEXT,
        worker_id TEXT,
        code_git_sha TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      )
    `);
    console.log("verification_jobs table created successfully");
  }
  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS idx_verification_jobs_status_next ON verification_jobs (status, next_run_at)`
  );
  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS idx_verification_jobs_lease ON verification_jobs (status, lease_expires_at)`
  );
  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS idx_verification_jobs_demo ON verification_jobs (demo_script_id)`
  );
  for (const tableName of ["verification_runs", "verification_jobs"]) {
    ensureColumnExists(tableName, "provider", "TEXT");
    ensureColumnExists(tableName, "actor", "TEXT");
    ensureColumnExists(tableName, "provider_source", "TEXT");
    ensureColumnExists(tableName, "execution_surface", "TEXT");
    ensureColumnExists(tableName, "worker_id", "TEXT");
    ensureColumnExists(tableName, "code_git_sha", "TEXT");
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS autonomous_epic_launches (
      epic_id TEXT PRIMARY KEY REFERENCES epics(id) ON DELETE CASCADE,
      profile_json TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS epic_continuation_jobs (
      id TEXT PRIMARY KEY,
      epic_id TEXT NOT NULL UNIQUE REFERENCES epics(id) ON DELETE CASCADE,
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'queued',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_run_at TEXT NOT NULL,
      last_error TEXT,
      leased_by TEXT,
      lease_expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_epic_continuation_jobs_ready
      ON epic_continuation_jobs (status, next_run_at);
    CREATE INDEX IF NOT EXISTS idx_epic_continuation_jobs_lease
      ON epic_continuation_jobs (status, lease_expires_at);
  `);

  const epicReviewRunsExists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='epic_review_runs'")
    .get();

  if (!epicReviewRunsExists) {
    console.log("Creating epic_review_runs table...");
    sqlite.exec(`
      CREATE TABLE epic_review_runs (
        id TEXT PRIMARY KEY NOT NULL,
        epic_id TEXT NOT NULL REFERENCES epics(id) ON DELETE CASCADE,
        steering_prompt TEXT,
        launch_mode TEXT NOT NULL,
        provider TEXT,
        status TEXT NOT NULL DEFAULT 'queued',
        summary TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    sqlite.exec(`CREATE INDEX idx_epic_review_runs_epic ON epic_review_runs (epic_id)`);
    sqlite.exec(`CREATE INDEX idx_epic_review_runs_status ON epic_review_runs (status)`);
    sqlite.exec(`CREATE INDEX idx_epic_review_runs_created ON epic_review_runs (created_at)`);
    console.log("epic_review_runs table created successfully");
  }

  const epicReviewRunTicketsExists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='epic_review_run_tickets'")
    .get();

  if (!epicReviewRunTicketsExists) {
    console.log("Creating epic_review_run_tickets table...");
    sqlite.exec(`
      CREATE TABLE epic_review_run_tickets (
        id TEXT PRIMARY KEY NOT NULL,
        epic_review_run_id TEXT NOT NULL REFERENCES epic_review_runs(id) ON DELETE CASCADE,
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'queued',
        summary TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    sqlite.exec(
      `CREATE INDEX idx_epic_review_run_tickets_run ON epic_review_run_tickets (epic_review_run_id)`
    );
    sqlite.exec(
      `CREATE INDEX idx_epic_review_run_tickets_ticket ON epic_review_run_tickets (ticket_id)`
    );
    sqlite.exec(
      `CREATE INDEX idx_epic_review_run_tickets_position ON epic_review_run_tickets (epic_review_run_id, position)`
    );
    console.log("epic_review_run_tickets table created successfully");
  }

  ensureColumnExists(
    "review_findings",
    "epic_review_run_id",
    "TEXT REFERENCES epic_review_runs(id) ON DELETE SET NULL"
  );
  ensureColumnExists("epic_review_run_tickets", "status", "TEXT NOT NULL DEFAULT 'queued'");
  ensureColumnExists("epic_review_run_tickets", "summary", "TEXT");
  ensureColumnExists("epic_review_run_tickets", "started_at", "TEXT");
  ensureColumnExists("epic_review_run_tickets", "completed_at", "TEXT");
  ensureColumnExists(
    "demo_scripts",
    "epic_review_run_id",
    "TEXT REFERENCES epic_review_runs(id) ON DELETE SET NULL"
  );
  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS idx_review_findings_run ON review_findings (epic_review_run_id)`
  );
  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS idx_demo_scripts_run ON demo_scripts (epic_review_run_id)`
  );
  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS idx_verification_runs_ticket ON verification_runs (ticket_id)`
  );
  sqlite.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_runs_round ON verification_runs (ticket_id, round)`
  );
}

// Initialize conversation logging tables for enterprise compliance
function initConversationLogging() {
  // Create conversation_sessions table
  const conversationSessionsExists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversation_sessions'")
    .get();

  if (!conversationSessionsExists) {
    console.log("Creating conversation_sessions table...");
    sqlite.exec(`
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
    sqlite.exec(
      `CREATE INDEX idx_conversation_sessions_project ON conversation_sessions (project_id)`
    );
    sqlite.exec(
      `CREATE INDEX idx_conversation_sessions_ticket ON conversation_sessions (ticket_id)`
    );
    sqlite.exec(`CREATE INDEX idx_conversation_sessions_user ON conversation_sessions (user_id)`);
    sqlite.exec(
      `CREATE INDEX idx_conversation_sessions_started ON conversation_sessions (started_at)`
    );
    console.log("conversation_sessions table created successfully");
  }

  // Create conversation_messages table
  const conversationMessagesExists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversation_messages'")
    .get();

  if (!conversationMessagesExists) {
    console.log("Creating conversation_messages table...");
    sqlite.exec(`
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
    sqlite.exec(
      `CREATE INDEX idx_conversation_messages_session ON conversation_messages (session_id)`
    );
    sqlite.exec(
      `CREATE INDEX idx_conversation_messages_session_seq ON conversation_messages (session_id, sequence_number)`
    );
    sqlite.exec(
      `CREATE INDEX idx_conversation_messages_created ON conversation_messages (created_at)`
    );
    console.log("conversation_messages table created successfully");
  }

  // Create audit_log_access table
  const auditLogExists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log_access'")
    .get();

  if (!auditLogExists) {
    console.log("Creating audit_log_access table...");
    sqlite.exec(`
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
    sqlite.exec(`CREATE INDEX idx_audit_log_accessor ON audit_log_access (accessor_id)`);
    sqlite.exec(`CREATE INDEX idx_audit_log_target ON audit_log_access (target_type, target_id)`);
    sqlite.exec(`CREATE INDEX idx_audit_log_accessed ON audit_log_access (accessed_at)`);
    console.log("audit_log_access table created successfully");
  }

  // Add conversation logging settings to settings table
  const settingsInfo = sqlite.prepare("PRAGMA table_info(settings)").all() as { name: string }[];
  const settingsColumns = settingsInfo.map((col) => col.name);

  if (!settingsColumns.includes("conversation_retention_days")) {
    console.log("Adding conversation_retention_days column to settings...");
    sqlite.exec("ALTER TABLE settings ADD COLUMN conversation_retention_days INTEGER DEFAULT 90");
  }

  if (!settingsColumns.includes("conversation_logging_enabled")) {
    console.log("Adding conversation_logging_enabled column to settings...");
    sqlite.exec("ALTER TABLE settings ADD COLUMN conversation_logging_enabled INTEGER DEFAULT 1");
  }
}

/**
 * Run every table-creation / column-migration check in order. All steps are
 * idempotent (existence-gated), but they total ~25 synchronous
 * `sqlite_master` / `PRAGMA table_info` probes — wasted work on an
 * already-migrated DB. See the `user_version` gate below for when this runs.
 */
function runSchemaMigrations(): void {
  initTables();
  migrateProjectsTable();
  migrateEpicWorkflowStateTable();

  // FTS5 init depends on the tickets table existing first.
  const ticketsTableExists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tickets'")
    .get();
  if (ticketsTableExists) {
    initFTS5();
  }

  initSettings();
  initTicketComments();
  initRalphEvents();
  initRalphSessions();
  initReviewWorkflowTables();
  initConversationLogging();
  ensureTicketWorkflowColumns(sqlite);
  ensureTelemetryTables(sqlite);
}

/**
 * Bump this whenever a new table/column migration is added to
 * `runSchemaMigrations()` so existing DBs re-run the checks once and re-stamp.
 */
const CURRENT_SCHEMA_VERSION = 6;

// Gate the migration checks behind PRAGMA user_version (standard SQLite
// pattern). When the DB is already at the current version we skip all ~25
// probes, shaving startup/first-request latency. Otherwise we run them once
// and stamp user_version so subsequent boots skip. Existing DBs report
// user_version = 0, so they migrate exactly once after this change ships.
const schemaVersion = sqlite.pragma("user_version", { simple: true }) as number;
if (schemaVersion !== CURRENT_SCHEMA_VERSION) {
  runSchemaMigrations();
  sqlite.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`);
}

// Perform daily backup maintenance (deferred 5s to avoid blocking startup)
// VACUUM INTO can take 10+ seconds on larger databases
const BACKUP_DEFER_MS = 5000;

function scheduleBackupMaintenance(): void {
  if (disableStartupTasks) return;

  setTimeout(() => {
    try {
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
scheduleBackupMaintenance();

// Clean up old launch scripts on startup
async function cleanupLaunchScripts() {
  if (disableStartupTasks) return;

  try {
    const { cleanupOldScripts } = await import("../api/terminal");
    await cleanupOldScripts();
  } catch (error) {
    console.warn("[DB] Failed to cleanup launch scripts:", error);
  }
}
cleanupLaunchScripts();

function scheduleVerificationWorker(): void {
  // Resident 10s poller is explicit opt-in (BRAIN_DUMP_VERIFICATION_WORKER_POLL=1).
  if (shouldStartVerificationWorkerFromEnv()) {
    setTimeout(() => {
      try {
        startVerificationWorker(sqlite, {
          execFileNoThrow,
          executionSurface: "resident-poller",
          afterJob: async () => {
            await drainEpicContinuations(sqlite, { launch: launchEpicContinuationHeadless });
          },
        });
        console.log("[VerificationWorker] Started resident polling worker (opt-in)");
      } catch (error) {
        console.error("[VerificationWorker] Failed to start:", error);
      }
    }, 0).unref?.();
    return;
  }

  if (!isVerificationExecutionAllowedFromEnv()) return;

  const brainDumpRoot = resolveBrainDumpRootFrom(import.meta.url);
  if (brainDumpRoot) {
    // Enqueue drains are normally launched by the MCP/CLI caller. That caller
    // may belong to a short-lived provider process tree, so a lightweight
    // supervisor in the long-lived app recovers queued jobs and expired
    // leases with a fresh current-code drain.
    setInterval(() => {
      try {
        const recovery = spawnDetachedVerificationDrainIfNeeded(sqlite, { brainDumpRoot });
        if (recovery.needed && !recovery.spawned) {
          console.error(
            `[VerificationWorker] Recovery drain failed to spawn: ${recovery.error ?? "unknown error"}`
          );
        }
      } catch (error) {
        console.error("[VerificationWorker] Recovery supervisor check failed:", error);
      }
    }, 10_000).unref?.();
  } else {
    console.error("[VerificationWorker] Recovery supervisor could not resolve Brain Dump root");
  }

  // Default mode: one drain pass for jobs left over from previous sessions,
  // then the recovery supervisor only intervenes when an enqueue drain never
  // claims its job or leaves an expired lease. Boot-time in-process execution
  // is safe — the module graph is fresh at boot.
  setTimeout(() => {
    drainVerificationQueue(sqlite, { execFileNoThrow, executionSurface: "boot-drain" })
      .then(async (result) => {
        if (result.processed > 0) {
          console.log(`[VerificationWorker] Boot drain processed ${result.processed} job(s)`);
        }
        if (result.lastError) {
          console.error(`[VerificationWorker] Boot drain last error: ${result.lastError}`);
        }
        const continuations = await drainEpicContinuations(sqlite, {
          launch: launchEpicContinuationHeadless,
        });
        if (continuations.lastError) {
          console.error(
            `[EpicContinuationWorker] Boot drain last error: ${continuations.lastError}`
          );
        }
      })
      .catch((error) => {
        console.error("[VerificationWorker] Boot drain failed:", error);
      });
  }, 0).unref?.();
}
scheduleVerificationWorker();

export const db = drizzle(sqlite, { schema });

export { sqlite, dbPath };
