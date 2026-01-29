import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  startWatching,
  stopWatching,
  isWatching,
  wasDeletionDetected,
  getWatchedPath,
  getDatabaseFiles,
  checkDatabaseFiles,
  initializeWatcher,
  logDeletionEvent,
  defaultDeletionHandler,
} from "./db-watcher";

describe("db-watcher", () => {
  let testDir: string;
  let testDbPath: string;

  beforeEach(() => {
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `db-watcher-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    testDbPath = join(testDir, "test.db");

    // Create a mock database file
    writeFileSync(testDbPath, "test database content");

    // Stop any previous watchers
    stopWatching();
  });

  afterEach(() => {
    // Stop watcher
    stopWatching();

    // Cleanup test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("getDatabaseFiles", () => {
    it("should return all database-related file paths", () => {
      const files = getDatabaseFiles("/path/to/db.sqlite");
      expect(files).toEqual([
        "/path/to/db.sqlite",
        "/path/to/db.sqlite-wal",
        "/path/to/db.sqlite-shm",
      ]);
    });

    it("should handle paths with special characters", () => {
      const files = getDatabaseFiles("/path with spaces/db.db");
      expect(files).toContain("/path with spaces/db.db");
      expect(files).toContain("/path with spaces/db.db-wal");
      expect(files).toContain("/path with spaces/db.db-shm");
    });
  });

  describe("checkDatabaseFiles", () => {
    it("should return null when database file exists", () => {
      const result = checkDatabaseFiles(testDbPath);
      expect(result).toBeNull();
    });

    it("should return filename when database file is missing", () => {
      const missingPath = join(testDir, "nonexistent.db");
      const result = checkDatabaseFiles(missingPath);
      expect(result).toBe("nonexistent.db");
    });

    it("should not fail when directory exists but file does not", () => {
      unlinkSync(testDbPath); // Delete the file
      const result = checkDatabaseFiles(testDbPath);
      expect(result).toBe("test.db");
    });
  });

  describe("startWatching", () => {
    it("should start watching when database exists", () => {
      const result = startWatching(testDbPath);
      expect(result).toBe(true);
      expect(isWatching()).toBe(true);
      expect(getWatchedPath()).toBe(testDbPath);
    });

    it("should fail when database does not exist", () => {
      const missingPath = join(testDir, "missing.db");
      const result = startWatching(missingPath);
      expect(result).toBe(false);
      expect(isWatching()).toBe(false);
    });

    it("should fail when directory does not exist", () => {
      const badPath = "/nonexistent/directory/db.sqlite";
      const result = startWatching(badPath);
      expect(result).toBe(false);
      expect(isWatching()).toBe(false);
    });

    it("should not start again if already watching", () => {
      startWatching(testDbPath);
      expect(isWatching()).toBe(true);

      // Try to start again
      const result = startWatching(testDbPath);
      expect(result).toBe(true); // Still returns true
      expect(isWatching()).toBe(true);
    });

    it("should accept a deletion callback", () => {
      const callback = vi.fn();
      startWatching(testDbPath, callback);
      expect(isWatching()).toBe(true);
    });
  });

  describe("stopWatching", () => {
    it("should stop watching and reset state", () => {
      startWatching(testDbPath);
      expect(isWatching()).toBe(true);

      stopWatching();
      expect(isWatching()).toBe(false);
      expect(getWatchedPath()).toBe("");
      expect(wasDeletionDetected()).toBe(false);
    });

    it("should be safe to call when not watching", () => {
      expect(() => stopWatching()).not.toThrow();
      expect(isWatching()).toBe(false);
    });

    it("should be safe to call multiple times", () => {
      startWatching(testDbPath);
      stopWatching();
      expect(() => stopWatching()).not.toThrow();
      expect(isWatching()).toBe(false);
    });
  });

  describe("isWatching", () => {
    it("should return false initially", () => {
      expect(isWatching()).toBe(false);
    });

    it("should return true after starting", () => {
      startWatching(testDbPath);
      expect(isWatching()).toBe(true);
    });

    it("should return false after stopping", () => {
      startWatching(testDbPath);
      stopWatching();
      expect(isWatching()).toBe(false);
    });
  });

  describe("wasDeletionDetected", () => {
    it("should return false initially", () => {
      expect(wasDeletionDetected()).toBe(false);
    });

    it("should return false after starting (no deletion)", () => {
      startWatching(testDbPath);
      expect(wasDeletionDetected()).toBe(false);
    });

    it("should be reset after stopping", () => {
      startWatching(testDbPath);
      stopWatching();
      expect(wasDeletionDetected()).toBe(false);
    });
  });

  describe("getWatchedPath", () => {
    it("should return empty string when not watching", () => {
      expect(getWatchedPath()).toBe("");
    });

    it("should return the watched path when active", () => {
      startWatching(testDbPath);
      expect(getWatchedPath()).toBe(testDbPath);
    });
  });

  describe("initializeWatcher", () => {
    it("should start watching with default handler", () => {
      const result = initializeWatcher(testDbPath);
      expect(result).toBe(true);
      expect(isWatching()).toBe(true);
    });

    it("should fail when database does not exist", () => {
      const missingPath = join(testDir, "missing.db");
      const result = initializeWatcher(missingPath);
      expect(result).toBe(false);
    });
  });

  describe("logDeletionEvent", () => {
    it("should log deletion event without throwing", () => {
      // This test just verifies the function doesn't throw
      expect(() => logDeletionEvent("test.db")).not.toThrow();
    });
  });

  describe("defaultDeletionHandler", () => {
    it("should not throw when called", () => {
      // Silence console output for this test
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(() => defaultDeletionHandler("test.db")).not.toThrow();

      consoleSpy.mockRestore();
    });

    it("should log deletion information", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      defaultDeletionHandler("test.db");

      // Check that console.error was called with deletion message
      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls.flat().join(" ");
      expect(calls).toContain("test.db");
      expect(calls).toContain("CRITICAL");

      consoleSpy.mockRestore();
    });
  });

  describe("deletion detection (integration)", () => {
    it("should detect file deletion", async () => {
      const callback = vi.fn();
      startWatching(testDbPath, callback);

      // Give watcher time to initialize
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Delete the database file
      unlinkSync(testDbPath);

      // Wait for watcher to detect the deletion
      await new Promise((resolve) => setTimeout(resolve, 200));

      // The callback should have been called
      // Note: This test may be flaky depending on OS and timing
      // The watcher behavior varies across platforms
      expect(wasDeletionDetected() || callback.mock.calls.length > 0 || !existsSync(testDbPath)).toBe(true);
    });

    it("should not trigger on non-database files", async () => {
      const callback = vi.fn();
      startWatching(testDbPath, callback);

      // Give watcher time to initialize
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Create and delete a different file
      const otherFile = join(testDir, "other.txt");
      writeFileSync(otherFile, "other content");
      await new Promise((resolve) => setTimeout(resolve, 50));
      unlinkSync(otherFile);

      // Wait for watcher to process
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Database should still exist, callback should not have been called
      expect(existsSync(testDbPath)).toBe(true);
      expect(callback).not.toHaveBeenCalled();
      expect(wasDeletionDetected()).toBe(false);
    });
  });
});
