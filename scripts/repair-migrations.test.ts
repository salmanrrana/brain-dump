import { afterEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import crypto from "crypto";
import Database from "better-sqlite3";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { dirname, join } from "path";
import { tmpdir } from "os";

function getDbPath(homeDir: string): string {
  if (process.platform === "darwin") {
    return join(homeDir, "Library", "Application Support", "brain-dump", "brain-dump.db");
  }

  if (process.platform === "win32") {
    return join(homeDir, "AppData", "Roaming", "brain-dump", "brain-dump.db");
  }

  return join(homeDir, ".local", "share", "brain-dump", "brain-dump.db");
}

function createBrokenDatabase(homeDir: string, dbPath: string): void {
  execFileSync(
    "node",
    [
      "--import",
      "tsx/esm",
      "--eval",
      "import { initDatabase } from './core/index.ts'; const result = initDatabase(); result.db.close();",
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, HOME: homeDir },
      stdio: "pipe",
    }
  );

  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash text NOT NULL,
      created_at numeric
    );
  `);

  db.close();
}

function createLegacyDatabaseWithStampedJournalOnly(dbPath: string): void {
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      color TEXT,
      working_method TEXT DEFAULT 'auto',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE epics (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      color TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE tickets (
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

    CREATE TABLE settings (
      id TEXT PRIMARY KEY NOT NULL DEFAULT 'default',
      terminal_emulator TEXT,
      ralph_sandbox INTEGER DEFAULT 0,
      ralph_timeout INTEGER DEFAULT 3600,
      ralph_max_iterations INTEGER DEFAULT 10,
      auto_create_pr INTEGER DEFAULT 1,
      pr_target_branch TEXT DEFAULT 'main',
      default_projects_directory TEXT,
      docker_runtime TEXT,
      docker_socket_path TEXT,
      conversation_retention_days INTEGER DEFAULT 90,
      conversation_logging_enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO settings (id) VALUES ('default');

    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash text NOT NULL,
      created_at numeric
    );
  `);

  const journal = JSON.parse(
    readFileSync(join(process.cwd(), "drizzle", "meta", "_journal.json"), "utf8")
  );
  const insertMigration = db.prepare(
    "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)"
  );

  for (const entry of journal.entries) {
    const rawSql = readFileSync(join(process.cwd(), "drizzle", `${entry.tag}.sql`), "utf8");
    const hash = crypto.createHash("sha256").update(rawSql).digest("hex");
    insertMigration.run(hash, entry.when);
  }

  db.close();
}

describe("repair-migrations script", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("reports repair-needed when schema exists but drizzle journal is empty", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "brain-dump-repair-check-"));
    tempDirs.push(homeDir);
    const dbPath = getDbPath(homeDir);

    mkdirSync(dirname(dbPath), { recursive: true });
    createBrokenDatabase(homeDir, dbPath);

    const result = spawnSync("node", ["scripts/repair-migrations.mjs", "--check"], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: homeDir },
      encoding: "utf8",
    });

    expect(result.status).toBe(10);
    expect(result.stdout).toContain("repair-needed:");
  });

  it("repairs and stamps migrations for a pre-initialized database", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "brain-dump-repair-run-"));
    tempDirs.push(homeDir);
    const dbPath = getDbPath(homeDir);

    mkdirSync(dirname(dbPath), { recursive: true });
    createBrokenDatabase(homeDir, dbPath);

    const repair = spawnSync("node", ["scripts/repair-migrations.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: homeDir },
      encoding: "utf8",
    });

    expect(repair.status).toBe(0);
    expect(repair.stdout).toContain("Repair complete");
    expect(existsSync(dbPath)).toBe(true);

    const db = new Database(dbPath, { readonly: true });
    const stampedCount = db.prepare("SELECT COUNT(*) AS count FROM __drizzle_migrations").get() as {
      count: number;
    };
    db.close();

    expect(stampedCount.count).toBeGreaterThan(0);
  });

  it("repairs orphaned migration files that are not listed in the drizzle journal", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "brain-dump-repair-orphaned-"));
    tempDirs.push(homeDir);
    const dbPath = getDbPath(homeDir);

    mkdirSync(dirname(dbPath), { recursive: true });
    createLegacyDatabaseWithStampedJournalOnly(dbPath);

    const check = spawnSync("node", ["scripts/repair-migrations.mjs", "--check"], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: homeDir },
      encoding: "utf8",
    });

    expect(check.status).toBe(10);
    expect(check.stdout).toContain("repair-needed:");
    expect(check.stdout).toContain("unstamped=");

    const repair = spawnSync("node", ["scripts/repair-migrations.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: homeDir },
      encoding: "utf8",
    });

    expect(repair.status).toBe(0);
    expect(repair.stdout).toContain("orphaned migration file");

    const db = new Database(dbPath, { readonly: true });
    const telemetryTables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('telemetry_sessions', 'telemetry_events') ORDER BY name"
      )
      .all() as Array<{ name: string }>;
    const stampedCount = db.prepare("SELECT COUNT(*) AS count FROM __drizzle_migrations").get() as {
      count: number;
    };
    db.close();

    const totalSqlFiles = readdirSync(join(process.cwd(), "drizzle")).filter((name) =>
      name.endsWith(".sql")
    ).length;

    expect(telemetryTables.map((row) => row.name)).toEqual([
      "telemetry_events",
      "telemetry_sessions",
    ]);
    expect(stampedCount.count).toBe(totalSqlFiles);
  });

  it("reports corrupt when the database file is unreadable", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "brain-dump-repair-corrupt-"));
    tempDirs.push(homeDir);
    const dbPath = getDbPath(homeDir);

    mkdirSync(dirname(dbPath), { recursive: true });
    writeFileSync(dbPath, "not a sqlite database");

    const result = spawnSync("node", ["scripts/repair-migrations.mjs", "--check"], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: homeDir },
      encoding: "utf8",
    });

    expect(result.status).toBe(12);
    expect(result.stdout).toContain("corrupt:");
  });
});
