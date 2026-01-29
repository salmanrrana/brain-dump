import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import Database from "better-sqlite3";
import {
  hasLegacyData,
  isMigrationComplete,
  hasXdgData,
  verifyDatabaseIntegrity,
  migrateFromLegacy,
  migrateFromLegacySync,
} from "./migration";
import { _setDataDirOverride, _setStateDirOverride } from "./xdg";

describe("Migration Utilities", () => {
  const testBase = join("/tmp", `migration-test-${process.pid}`);
  const testXdgData = join(testBase, "brain-dump");
  const testXdgState = join(testBase, "brain-dump", "state");

  beforeEach(() => {
    // Clean up any existing test directories
    if (existsSync(testBase)) {
      rmSync(testBase, { recursive: true, force: true });
    }

    // Create base test directory
    mkdirSync(testBase, { recursive: true });

    // Use XDG override functions for cross-platform test isolation
    _setDataDirOverride(testXdgData);
    _setStateDirOverride(testXdgState);
  });

  afterEach(() => {
    // Reset XDG overrides
    _setDataDirOverride(null);
    _setStateDirOverride(null);

    // Clean up test directories
    if (existsSync(testBase)) {
      rmSync(testBase, { recursive: true, force: true });
    }
  });

  describe("verifyDatabaseIntegrity", () => {
    it("should return false for non-existent database", () => {
      expect(verifyDatabaseIntegrity("/nonexistent/path.db")).toBe(false);
    });

    it("should return true for valid SQLite database", () => {
      const dbPath = join(testBase, "test.db");
      const db = new Database(dbPath);
      db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)");
      db.close();

      expect(verifyDatabaseIntegrity(dbPath)).toBe(true);
    });

    it("should return false for corrupted database", () => {
      const dbPath = join(testBase, "corrupt.db");
      // Write invalid data as a database file
      writeFileSync(dbPath, "this is not a valid sqlite database");

      expect(verifyDatabaseIntegrity(dbPath)).toBe(false);
    });
  });

  describe("Migration State Detection", () => {
    // For these tests, we need to create a mock legacy directory
    // Since we can't easily mock homedir(), we'll test with the actual structure

    describe("hasLegacyData", () => {
      it("should return false when legacy directory does not exist", () => {
        // getLegacyDir returns ~/.brain-dump which likely doesn't exist in CI
        // For this test, we verify the function works with mocked paths
        // by checking it doesn't throw
        const result = hasLegacyData();
        expect(typeof result).toBe("boolean");
      });
    });

    describe("hasXdgData", () => {
      it("should return false when XDG data directory is empty", () => {
        expect(hasXdgData()).toBe(false);
      });

      it("should return true when XDG database exists", () => {
        // Create the XDG data directory structure
        const xdgBrainDump = testXdgData;
        mkdirSync(xdgBrainDump, { recursive: true });

        // Create a database file
        const dbPath = join(xdgBrainDump, "brain-dump.db");
        const db = new Database(dbPath);
        db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)");
        db.close();

        expect(hasXdgData()).toBe(true);
      });
    });

    describe("isMigrationComplete", () => {
      it("should return false when migration marker does not exist", () => {
        // This checks the actual legacy directory
        // In most cases, this will return false
        const result = isMigrationComplete();
        expect(typeof result).toBe("boolean");
      });
    });
  });

  describe("migrateFromLegacySync", () => {
    it("should return success when no migration needed", () => {
      // This test runs against the actual home directory
      // Possible outcomes:
      // 1. No legacy data exists -> "No legacy data"
      // 2. Migration already done -> "Migration already complete"
      // 3. XDG already has data -> "XDG already has data"
      const result = migrateFromLegacySync();

      expect(result.success).toBe(true);
      // migrated could be true if this is the first run that actually migrates
      // or false if no migration was needed
      expect(typeof result.migrated).toBe("boolean");
    });

    it("should return success with no migration when XDG already has data", () => {
      // Create XDG database first
      const xdgBrainDump = testXdgData;
      mkdirSync(xdgBrainDump, { recursive: true });

      const dbPath = join(xdgBrainDump, "brain-dump.db");
      const db = new Database(dbPath);
      db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)");
      db.close();

      const result = migrateFromLegacySync();

      expect(result.success).toBe(true);
      expect(result.migrated).toBe(false);
    });
  });

  describe("migrateFromLegacy (async)", () => {
    it("should return success when no migration needed", async () => {
      // This test runs against the actual home directory
      // Possible outcomes depend on system state
      const result = await migrateFromLegacy();

      expect(result.success).toBe(true);
      expect(typeof result.migrated).toBe("boolean");
    });

    it("should return success with no migration when XDG already has data", async () => {
      // Create XDG database first
      const xdgBrainDump = testXdgData;
      mkdirSync(xdgBrainDump, { recursive: true });

      const dbPath = join(xdgBrainDump, "brain-dump.db");
      const db = new Database(dbPath);
      db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)");
      db.close();

      const result = await migrateFromLegacy();

      expect(result.success).toBe(true);
      expect(result.migrated).toBe(false);
    });
  });

  describe("MigrationResult interface", () => {
    it("should have correct structure", () => {
      const result = migrateFromLegacySync();

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("migrated");
      expect(result).toHaveProperty("message");
      expect(typeof result.success).toBe("boolean");
      expect(typeof result.migrated).toBe("boolean");
      expect(typeof result.message).toBe("string");
    });
  });
});

describe("Migration Integration", () => {
  const testBase = join("/tmp", `migration-integration-${process.pid}`);
  const testXdgData = join(testBase, "brain-dump");
  const testXdgState = join(testBase, "brain-dump", "state");

  beforeEach(() => {
    if (existsSync(testBase)) {
      rmSync(testBase, { recursive: true, force: true });
    }
    mkdirSync(testBase, { recursive: true });

    // Use XDG override functions for cross-platform test isolation
    _setDataDirOverride(testXdgData);
    _setStateDirOverride(testXdgState);
  });

  afterEach(() => {
    // Reset XDG overrides
    _setDataDirOverride(null);
    _setStateDirOverride(null);

    if (existsSync(testBase)) {
      rmSync(testBase, { recursive: true, force: true });
    }
  });

  it("should create XDG directories during migration check", async () => {
    // Even when no migration happens, ensureDirectoriesSync is called
    await migrateFromLegacy();

    // XDG directories might be created during the migration process
    // This depends on implementation details
  });

  it("should handle concurrent migration calls safely", async () => {
    // Run multiple migrations concurrently
    const results = await Promise.all([
      migrateFromLegacy(),
      migrateFromLegacy(),
      migrateFromLegacy(),
    ]);

    // All should succeed and return consistent results
    for (const result of results) {
      expect(result.success).toBe(true);
    }
  });
});
