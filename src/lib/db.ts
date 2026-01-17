import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { getDatabasePath, ensureDirectoriesSync } from "./xdg";
import { migrateFromLegacySync } from "./migration";
import { performDailyBackupSync } from "./backup";
import { initializeLockSync } from "./lockfile";
import { initializeWatcher, stopWatching } from "./db-watcher";
import { startupIntegrityCheck } from "./integrity";

// Ensure XDG directories exist with proper permissions
ensureDirectoriesSync();

// Run migration from legacy ~/.brain-dump if needed
// This must happen before opening the database
const migrationResult = migrateFromLegacySync();
if (migrationResult.migrated) {
  console.log(`[DB] Migration completed: ${migrationResult.message}`);
}

// Get database path from XDG utility
const dbPath = getDatabasePath();

// Run quick integrity check on startup (fast, stops at first error)
const integrityResult = startupIntegrityCheck(dbPath);
if (!integrityResult.healthy) {
  console.warn(`[DB] WARNING: ${integrityResult.message}`);
  if (integrityResult.suggestRestore) {
    console.warn(`[DB] A backup is available. Run: brain-dump restore --latest`);
  }
} else {
  console.log(`[DB] ${integrityResult.message}`);
}

// Create database connection
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Acquire lock and setup graceful shutdown
// This ensures lock is cleaned up and WAL is checkpointed on shutdown
const lockResult = initializeLockSync("vite", () => {
  try {
    stopWatching(); // Stop file watcher
    sqlite.pragma("wal_checkpoint(TRUNCATE)");
    sqlite.close();
  } catch {
    // Ignore errors during cleanup
  }
});
if (lockResult.acquired) {
  console.log(`[DB] ${lockResult.message}`);
}

// Start watching for unexpected database file deletions
if (initializeWatcher(dbPath)) {
  console.log(`[DB] Database file watcher started`);
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
        completed_at TEXT
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

// Initialize tables on startup
initTables();

// Add working_method column to projects table if it doesn't exist (migration)
function migrateProjectsTable() {
  const tableInfo = sqlite.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
  const columns = tableInfo.map((col) => col.name);

  if (!columns.includes("working_method")) {
    console.log("Adding working_method column to projects...");
    sqlite.exec("ALTER TABLE projects ADD COLUMN working_method TEXT DEFAULT 'auto'");
  }
}

migrateProjectsTable();

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

// Check if tickets table exists before initializing FTS
const ticketsTableExists = sqlite
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tickets'")
  .get();

if (ticketsTableExists) {
  initFTS5();
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
        auto_create_pr INTEGER DEFAULT 1,
        pr_target_branch TEXT DEFAULT 'dev',
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
    if (!columns.includes("pr_target_branch")) {
      console.log("Adding pr_target_branch column to settings...");
      sqlite.exec("ALTER TABLE settings ADD COLUMN pr_target_branch TEXT DEFAULT 'dev'");
    }
  }
}

initSettings();

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

initTicketComments();

// Perform daily backup maintenance (deferred 5s to avoid blocking startup)
// VACUUM INTO can take 10+ seconds on larger databases
const BACKUP_DEFER_MS = 5000;

function scheduleBackupMaintenance(): void {
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
  try {
    const { cleanupOldScripts } = await import("../api/terminal");
    await cleanupOldScripts();
  } catch {
    // Ignore - terminal module might not be loaded yet
  }
}
cleanupLaunchScripts();

export const db = drizzle(sqlite, { schema });

export { sqlite, dbPath };
