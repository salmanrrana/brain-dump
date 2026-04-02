import { afterEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import Database from "better-sqlite3";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
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
