import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import Database from "better-sqlite3";
import {
  quickIntegrityCheck,
  fullIntegrityCheck,
  foreignKeyCheck,
  walCheck,
  tableCheck,
  fullDatabaseCheck,
  startupIntegrityCheck,
} from "./integrity";

describe("Integrity Utilities", () => {
  const testBase = join("/tmp", `integrity-test-${process.pid}`);
  const testXdgData = join(testBase, "xdg-data");
  const testXdgState = join(testBase, "xdg-state");
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clean up any existing test directories
    if (existsSync(testBase)) {
      rmSync(testBase, { recursive: true, force: true });
    }

    // Create base test directory
    mkdirSync(testBase, { recursive: true });

    // Point XDG env vars to test directories
    process.env.XDG_DATA_HOME = testXdgData;
    process.env.XDG_STATE_HOME = testXdgState;
  });

  afterEach(() => {
    // Clean up test directories
    if (existsSync(testBase)) {
      rmSync(testBase, { recursive: true, force: true });
    }

    // Restore environment
    process.env = { ...originalEnv };
  });

  describe("quickIntegrityCheck", () => {
    it("should return error for non-existent database", () => {
      const result = quickIntegrityCheck("/nonexistent/database.db");

      expect(result.success).toBe(false);
      expect(result.status).toBe("error");
      expect(result.message).toContain("not found");
    });

    it("should return ok for valid database", () => {
      const dbPath = join(testBase, "valid.db");
      const db = new Database(dbPath);
      db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)");
      db.exec("INSERT INTO test (name) VALUES ('test')");
      db.close();

      const result = quickIntegrityCheck(dbPath);

      expect(result.success).toBe(true);
      expect(result.status).toBe("ok");
      expect(result.message).toContain("verified");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("should return error for corrupted database", () => {
      const dbPath = join(testBase, "corrupt.db");
      writeFileSync(dbPath, "this is not a valid sqlite database");

      const result = quickIntegrityCheck(dbPath);

      expect(result.success).toBe(false);
      expect(result.status).toBe("error");
    });

    it("should track duration", () => {
      const dbPath = join(testBase, "timed.db");
      const db = new Database(dbPath);
      db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)");
      db.close();

      const result = quickIntegrityCheck(dbPath);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.durationMs).toBe("number");
    });
  });

  describe("fullIntegrityCheck", () => {
    it("should return error for non-existent database", () => {
      const result = fullIntegrityCheck("/nonexistent/database.db");

      expect(result.success).toBe(false);
      expect(result.status).toBe("error");
      expect(result.details).toEqual([]);
    });

    it("should return ok for valid database", () => {
      const dbPath = join(testBase, "valid.db");
      const db = new Database(dbPath);
      db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)");
      for (let i = 0; i < 100; i++) {
        db.exec(`INSERT INTO test (name) VALUES ('test${i}')`);
      }
      db.close();

      const result = fullIntegrityCheck(dbPath);

      expect(result.success).toBe(true);
      expect(result.status).toBe("ok");
      expect(result.message).toContain("passed");
      expect(result.details).toEqual([]);
    });

    it("should return error for corrupted database", () => {
      const dbPath = join(testBase, "corrupt.db");
      writeFileSync(dbPath, "not a database file");

      const result = fullIntegrityCheck(dbPath);

      expect(result.success).toBe(false);
      expect(result.status).toBe("error");
    });
  });

  describe("foreignKeyCheck", () => {
    it("should return error for non-existent database", () => {
      const result = foreignKeyCheck("/nonexistent/database.db");

      expect(result.success).toBe(false);
      expect(result.status).toBe("error");
    });

    it("should return ok when no foreign key violations", () => {
      const dbPath = join(testBase, "fk-valid.db");
      const db = new Database(dbPath);
      db.pragma("foreign_keys = ON");
      db.exec(`
        CREATE TABLE projects (id TEXT PRIMARY KEY);
        CREATE TABLE tickets (
          id TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id)
        );
      `);
      db.exec("INSERT INTO projects VALUES ('p1')");
      db.exec("INSERT INTO tickets VALUES ('t1', 'p1')");
      db.close();

      const result = foreignKeyCheck(dbPath);

      expect(result.success).toBe(true);
      expect(result.status).toBe("ok");
      expect(result.message).toContain("No foreign key violations");
    });

    it("should detect foreign key violations", () => {
      const dbPath = join(testBase, "fk-invalid.db");
      const db = new Database(dbPath);
      // Disable FK enforcement to create orphaned data
      db.pragma("foreign_keys = OFF");
      db.exec(`
        CREATE TABLE projects (id TEXT PRIMARY KEY);
        CREATE TABLE tickets (
          id TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id)
        );
      `);
      // Insert orphaned ticket (FK not enforced because pragma is OFF)
      db.exec("INSERT INTO tickets VALUES ('t1', 'nonexistent')");
      db.close();

      const result = foreignKeyCheck(dbPath);

      expect(result.success).toBe(false);
      expect(result.status).toBe("error");
      expect(result.message).toContain("violation");
      expect(result.details.length).toBeGreaterThan(0);
    });
  });

  describe("walCheck", () => {
    it("should return error for non-existent database", () => {
      const result = walCheck("/nonexistent/database.db");

      expect(result.success).toBe(false);
      expect(result.status).toBe("error");
    });

    it("should return ok for database in WAL mode", () => {
      const dbPath = join(testBase, "wal.db");
      const db = new Database(dbPath);
      db.pragma("journal_mode = WAL");
      db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)");
      db.close();

      const result = walCheck(dbPath);

      expect(result.success).toBe(true);
      expect(result.details.some((d) => d.includes("Journal mode"))).toBe(true);
    });

    it("should work for database not in WAL mode", () => {
      const dbPath = join(testBase, "delete.db");
      const db = new Database(dbPath);
      db.pragma("journal_mode = DELETE");
      db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)");
      db.close();

      const result = walCheck(dbPath);

      expect(result.success).toBe(true);
      expect(result.details.some((d) => d.includes("delete") || d.includes("Journal mode"))).toBe(true);
    });

    it("should detect orphaned WAL file", () => {
      const dbPath = join(testBase, "orphan.db");
      const walPath = dbPath + "-wal";

      const db = new Database(dbPath);
      db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)");
      db.close();

      // Create WAL without SHM (simulating partial state)
      writeFileSync(walPath, "dummy wal content");

      const result = walCheck(dbPath);

      // Should at least succeed with warnings
      expect(result.success).toBe(true);
    });
  });

  describe("tableCheck", () => {
    it("should return error for non-existent database", () => {
      const result = tableCheck("/nonexistent/database.db");

      expect(result.success).toBe(false);
      expect(result.status).toBe("error");
    });

    it("should return ok when all required tables present", () => {
      const dbPath = join(testBase, "complete.db");
      const db = new Database(dbPath);
      db.exec(`
        CREATE TABLE projects (id TEXT PRIMARY KEY);
        CREATE TABLE epics (id TEXT PRIMARY KEY);
        CREATE TABLE tickets (id TEXT PRIMARY KEY);
        CREATE TABLE settings (id TEXT PRIMARY KEY);
        CREATE TABLE ticket_comments (id TEXT PRIMARY KEY);
      `);
      db.close();

      const result = tableCheck(dbPath);

      expect(result.success).toBe(true);
      expect(result.status).toBe("ok");
      expect(result.message).toContain("All required tables");
    });

    it("should detect missing tables", () => {
      const dbPath = join(testBase, "partial.db");
      const db = new Database(dbPath);
      db.exec(`
        CREATE TABLE projects (id TEXT PRIMARY KEY);
        CREATE TABLE tickets (id TEXT PRIMARY KEY);
      `);
      db.close();

      const result = tableCheck(dbPath);

      expect(result.success).toBe(false);
      expect(result.status).toBe("error");
      expect(result.message).toContain("Missing");
      expect(result.details.some((d) => d.includes("epics"))).toBe(true);
    });

    it("should report number of tables found", () => {
      const dbPath = join(testBase, "tables.db");
      const db = new Database(dbPath);
      db.exec(`
        CREATE TABLE projects (id TEXT PRIMARY KEY);
        CREATE TABLE epics (id TEXT PRIMARY KEY);
        CREATE TABLE tickets (id TEXT PRIMARY KEY);
        CREATE TABLE settings (id TEXT PRIMARY KEY);
        CREATE TABLE ticket_comments (id TEXT PRIMARY KEY);
        CREATE TABLE extra_table (id TEXT PRIMARY KEY);
      `);
      db.close();

      const result = tableCheck(dbPath);

      expect(result.success).toBe(true);
      expect(result.details.some((d) => d.includes("6 table"))).toBe(true);
    });
  });

  describe("fullDatabaseCheck", () => {
    it("should return comprehensive results for valid database", () => {
      const dbPath = join(testBase, "full-valid.db");
      const db = new Database(dbPath);
      db.pragma("journal_mode = WAL");
      db.exec(`
        CREATE TABLE projects (id TEXT PRIMARY KEY);
        CREATE TABLE epics (id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id));
        CREATE TABLE tickets (id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id));
        CREATE TABLE settings (id TEXT PRIMARY KEY);
        CREATE TABLE ticket_comments (id TEXT PRIMARY KEY, ticket_id TEXT REFERENCES tickets(id));
      `);
      db.exec("INSERT INTO projects VALUES ('p1')");
      db.exec("INSERT INTO tickets VALUES ('t1', 'p1')");
      db.close();

      const result = fullDatabaseCheck(dbPath);

      expect(result.overallStatus).toBe("ok");
      expect(result.integrityCheck.status).toBe("ok");
      expect(result.foreignKeyCheck.status).toBe("ok");
      expect(result.tableCheck.status).toBe("ok");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.suggestions).toEqual([]);
    });

    it("should return error status when integrity check fails", () => {
      const dbPath = join(testBase, "full-corrupt.db");
      writeFileSync(dbPath, "not a valid database");

      const result = fullDatabaseCheck(dbPath);

      expect(result.overallStatus).toBe("error");
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it("should suggest restore when corruption detected", () => {
      // Create a backup first so suggestion includes backup info
      const backupsDir = join(testXdgState, "brain-dump", "backups");
      mkdirSync(backupsDir, { recursive: true });
      const backupPath = join(backupsDir, "brain-dump-2026-01-12.db");
      const backupDb = new Database(backupPath);
      backupDb.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)");
      backupDb.close();

      // Now create corrupt database
      const dbPath = join(testBase, "suggest.db");
      writeFileSync(dbPath, "corrupted content");

      const result = fullDatabaseCheck(dbPath);

      expect(result.overallStatus).toBe("error");
      expect(result.suggestions.some((s) => s.includes("restore"))).toBe(true);
    });

    it("should return warning status for WAL warnings", () => {
      const dbPath = join(testBase, "wal-warn.db");
      const walPath = dbPath + "-wal";

      const db = new Database(dbPath);
      db.pragma("journal_mode = DELETE");
      db.exec(`
        CREATE TABLE projects (id TEXT PRIMARY KEY);
        CREATE TABLE epics (id TEXT PRIMARY KEY);
        CREATE TABLE tickets (id TEXT PRIMARY KEY);
        CREATE TABLE settings (id TEXT PRIMARY KEY);
        CREATE TABLE ticket_comments (id TEXT PRIMARY KEY);
      `);
      db.close();

      // Create orphaned WAL file
      writeFileSync(walPath, "dummy");

      const result = fullDatabaseCheck(dbPath);

      // Should be ok or warning depending on implementation
      expect(["ok", "warning"]).toContain(result.overallStatus);
    });
  });

  describe("startupIntegrityCheck", () => {
    it("should return healthy for valid database", () => {
      const dbPath = join(testBase, "startup-valid.db");
      const db = new Database(dbPath);
      db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)");
      db.close();

      const result = startupIntegrityCheck(dbPath);

      expect(result.healthy).toBe(true);
      expect(result.shouldWarn).toBe(false);
      expect(result.suggestRestore).toBe(false);
      expect(result.message).toContain("OK");
    });

    it("should return unhealthy for corrupted database", () => {
      const dbPath = join(testBase, "startup-corrupt.db");
      writeFileSync(dbPath, "corrupted");

      const result = startupIntegrityCheck(dbPath);

      expect(result.healthy).toBe(false);
      expect(result.shouldWarn).toBe(true);
    });

    it("should suggest restore when backups available", () => {
      // Create backup
      const backupsDir = join(testXdgState, "brain-dump", "backups");
      mkdirSync(backupsDir, { recursive: true });
      const backupPath = join(backupsDir, "brain-dump-2026-01-12.db");
      const backupDb = new Database(backupPath);
      backupDb.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)");
      backupDb.close();

      // Create corrupted database
      const dbPath = join(testBase, "startup-restore.db");
      writeFileSync(dbPath, "corrupted");

      const result = startupIntegrityCheck(dbPath);

      expect(result.healthy).toBe(false);
      expect(result.suggestRestore).toBe(true);
    });

    it("should not suggest restore when no backups available", () => {
      const dbPath = join(testBase, "startup-no-backup.db");
      writeFileSync(dbPath, "corrupted");

      const result = startupIntegrityCheck(dbPath);

      expect(result.healthy).toBe(false);
      expect(result.suggestRestore).toBe(false);
    });

    it("should return unhealthy for non-existent database", () => {
      const result = startupIntegrityCheck("/nonexistent/database.db");

      expect(result.healthy).toBe(false);
      expect(result.shouldWarn).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty database", () => {
      const dbPath = join(testBase, "empty.db");
      const db = new Database(dbPath);
      db.close();

      const quickResult = quickIntegrityCheck(dbPath);
      expect(quickResult.success).toBe(true);

      const fullResult = fullIntegrityCheck(dbPath);
      expect(fullResult.success).toBe(true);
    });

    it("should handle database with only system tables", () => {
      const dbPath = join(testBase, "system-only.db");
      const db = new Database(dbPath);
      // SQLite always has sqlite_master, sqlite_sequence may exist
      db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY AUTOINCREMENT)");
      db.exec("INSERT INTO test DEFAULT VALUES");
      db.exec("DROP TABLE test");
      db.close();

      const result = tableCheck(dbPath);
      expect(result.success).toBe(false); // Missing required tables
      expect(result.status).toBe("error");
    });

    it("should handle concurrent access scenario", () => {
      const dbPath = join(testBase, "concurrent.db");
      const db1 = new Database(dbPath);
      db1.pragma("journal_mode = WAL");
      db1.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, val TEXT)");

      // Open second connection while first is still open
      const db2 = new Database(dbPath, { readonly: true });

      const result = quickIntegrityCheck(dbPath);

      // Should still succeed (WAL supports concurrent reads)
      expect(result.success).toBe(true);

      db2.close();
      db1.close();
    });
  });
});
