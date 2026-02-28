import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initDatabase } from "../lib/database.ts";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("MCP database adapter", () => {
  it("creates base schema and settings columns for a fresh database path", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "brain-dump-mcp-db-"));
    tempDirs.push(tempDir);
    const originalHome = process.env.HOME;
    process.env.HOME = tempDir;

    const dbPath = join(tempDir, "brain-dump.db");
    const { db, actualDbPath } = initDatabase(dbPath);

    try {
      expect(actualDbPath).toBe(dbPath);

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>;
      const tableNames = tables.map((table) => table.name);

      expect(tableNames).toContain("tickets");
      expect(tableNames).toContain("projects");
      expect(tableNames).toContain("settings");

      const settingColumns = db.prepare("PRAGMA table_info(settings)").all() as Array<{
        name: string;
      }>;
      const settingColumnNames = settingColumns.map((column) => column.name);

      expect(settingColumnNames).toEqual(
        expect.arrayContaining([
          "ralph_timeout",
          "ralph_max_iterations",
          "default_working_method",
          "default_projects_directory",
          "docker_runtime",
          "docker_socket_path",
        ])
      );
    } finally {
      db.close();
      process.env.HOME = originalHome;
    }
  });
});
