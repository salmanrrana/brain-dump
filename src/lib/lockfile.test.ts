import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import {
  getLockFilePath,
  isProcessRunning,
  readLockFile,
  checkLock,
  acquireLock,
  releaseLock,
  type LockInfo,
} from "./lockfile";

describe("Lock File Utilities", () => {
  const testBase = join("/tmp", `lockfile-test-${process.pid}`);
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Use temporary state directory for testing
    process.env.XDG_STATE_HOME = testBase;
    // Ensure the state directory exists
    mkdirSync(join(testBase, "brain-dump"), { recursive: true });
  });

  afterEach(() => {
    // Cleanup test directories
    if (existsSync(testBase)) {
      rmSync(testBase, { recursive: true, force: true });
    }
    // Restore original environment
    process.env = { ...originalEnv };
  });

  describe("getLockFilePath", () => {
    it("should return lock file path in state directory", () => {
      const expected = join(testBase, "brain-dump", "brain-dump.lock");
      expect(getLockFilePath()).toBe(expected);
    });
  });

  describe("isProcessRunning", () => {
    it("should return true for current process PID", () => {
      expect(isProcessRunning(process.pid)).toBe(true);
    });

    it("should return false for non-existent PID", () => {
      // Use a very high PID that's unlikely to exist
      expect(isProcessRunning(999999999)).toBe(false);
    });

    it("should return true for init process (PID 1)", () => {
      // PID 1 always exists on Unix-like systems
      expect(isProcessRunning(1)).toBe(true);
    });
  });

  describe("readLockFile", () => {
    it("should return null when lock file does not exist", () => {
      expect(readLockFile()).toBeNull();
    });

    it("should return lock info when valid lock file exists", () => {
      const lockPath = getLockFilePath();
      const lockInfo: LockInfo = {
        pid: 12345,
        startedAt: "2026-01-12T00:00:00Z",
        type: "mcp-server",
      };
      writeFileSync(lockPath, JSON.stringify(lockInfo));

      const result = readLockFile();
      expect(result).toEqual(lockInfo);
    });

    it("should return null for corrupted lock file", () => {
      const lockPath = getLockFilePath();
      writeFileSync(lockPath, "not valid json{{{");

      expect(readLockFile()).toBeNull();
    });

    it("should return null for lock file with invalid structure", () => {
      const lockPath = getLockFilePath();
      writeFileSync(lockPath, JSON.stringify({ foo: "bar" }));

      expect(readLockFile()).toBeNull();
    });

    it("should return null for lock file with invalid type", () => {
      const lockPath = getLockFilePath();
      writeFileSync(
        lockPath,
        JSON.stringify({
          pid: 12345,
          startedAt: "2026-01-12T00:00:00Z",
          type: "invalid-type",
        })
      );

      expect(readLockFile()).toBeNull();
    });
  });

  describe("checkLock", () => {
    it("should report no lock when lock file does not exist", () => {
      const result = checkLock();
      expect(result.isLocked).toBe(false);
      expect(result.lockInfo).toBeNull();
      expect(result.isStale).toBe(false);
      expect(result.message).toBe("No lock file found");
    });

    it("should report active lock for running process", () => {
      const lockPath = getLockFilePath();
      const lockInfo: LockInfo = {
        pid: process.pid, // Current process is running
        startedAt: new Date().toISOString(),
        type: "cli",
      };
      writeFileSync(lockPath, JSON.stringify(lockInfo));

      const result = checkLock();
      expect(result.isLocked).toBe(true);
      expect(result.lockInfo).toEqual(lockInfo);
      expect(result.isStale).toBe(false);
      expect(result.message).toContain("Database locked by cli");
    });

    it("should detect stale lock from non-running process", () => {
      const lockPath = getLockFilePath();
      const lockInfo: LockInfo = {
        pid: 999999999, // Non-existent process
        startedAt: "2026-01-01T00:00:00Z",
        type: "vite",
      };
      writeFileSync(lockPath, JSON.stringify(lockInfo));

      const result = checkLock();
      expect(result.isLocked).toBe(false);
      expect(result.lockInfo).toEqual(lockInfo);
      expect(result.isStale).toBe(true);
      expect(result.message).toContain("Stale lock detected");
    });
  });

  describe("acquireLock", () => {
    it("should acquire lock when no lock exists", () => {
      const result = acquireLock("cli");

      expect(result.acquired).toBe(true);
      expect(result.lockInfo).not.toBeNull();
      expect(result.lockInfo?.pid).toBe(process.pid);
      expect(result.lockInfo?.type).toBe("cli");
      expect(result.message).toContain("Lock acquired");

      // Verify lock file was created
      expect(existsSync(getLockFilePath())).toBe(true);
    });

    it("should acquire lock after cleaning up stale lock", () => {
      // Create a stale lock
      const lockPath = getLockFilePath();
      writeFileSync(
        lockPath,
        JSON.stringify({
          pid: 999999999,
          startedAt: "2026-01-01T00:00:00Z",
          type: "mcp-server",
        })
      );

      const result = acquireLock("cli");

      expect(result.acquired).toBe(true);
      expect(result.lockInfo?.pid).toBe(process.pid);
      expect(result.lockInfo?.type).toBe("cli");
    });

    it("should allow re-acquiring lock by same process", () => {
      // First acquisition
      acquireLock("mcp-server");

      // Re-acquire
      const result = acquireLock("mcp-server");

      expect(result.acquired).toBe(true);
      expect(result.message).toBe("Lock already held by this process");
    });

    it("should create lock file with secure permissions (0600)", () => {
      acquireLock("cli");

      const lockPath = getLockFilePath();
      const { statSync } = require("fs");
      const stats = statSync(lockPath);

      // Check mode is 0600 (owner rw only)
      expect(stats.mode & 0o777).toBe(0o600);
    });

    it("should support all process types", () => {
      const types: Array<LockInfo["type"]> = ["mcp-server", "cli", "vite"];

      for (const type of types) {
        // Clean up between iterations
        if (existsSync(getLockFilePath())) {
          rmSync(getLockFilePath());
        }

        const result = acquireLock(type);
        expect(result.acquired).toBe(true);
        expect(result.lockInfo?.type).toBe(type);
      }
    });
  });

  describe("releaseLock", () => {
    it("should release lock held by current process", () => {
      acquireLock("cli");
      expect(existsSync(getLockFilePath())).toBe(true);

      const result = releaseLock();

      expect(result.released).toBe(true);
      expect(result.message).toBe("Lock released successfully");
      expect(existsSync(getLockFilePath())).toBe(false);
    });

    it("should report success when no lock exists", () => {
      const result = releaseLock();

      expect(result.released).toBe(true);
      expect(result.message).toBe("No lock to release");
    });

    it("should not release lock owned by different process", () => {
      // Create a lock owned by a different PID
      const lockPath = getLockFilePath();
      writeFileSync(
        lockPath,
        JSON.stringify({
          pid: process.pid + 1000, // Different PID
          startedAt: new Date().toISOString(),
          type: "mcp-server",
        })
      );

      const result = releaseLock();

      expect(result.released).toBe(false);
      expect(result.message).toContain("Lock owned by different process");
      // Lock file should still exist
      expect(existsSync(lockPath)).toBe(true);
    });
  });

  describe("Lock file format", () => {
    it("should write valid JSON with expected fields", () => {
      acquireLock("mcp-server");

      const lockPath = getLockFilePath();
      const content = readFileSync(lockPath, "utf-8");
      const lockInfo = JSON.parse(content);

      expect(lockInfo).toHaveProperty("pid");
      expect(lockInfo).toHaveProperty("startedAt");
      expect(lockInfo).toHaveProperty("type");
      expect(typeof lockInfo.pid).toBe("number");
      expect(typeof lockInfo.startedAt).toBe("string");
      expect(lockInfo.type).toBe("mcp-server");
    });

    it("should have valid ISO timestamp", () => {
      acquireLock("cli");

      const lockInfo = readLockFile();
      expect(lockInfo).not.toBeNull();

      // Verify timestamp is valid ISO 8601
      const timestamp = new Date(lockInfo!.startedAt);
      expect(timestamp.toISOString()).toBe(lockInfo!.startedAt);
    });
  });
});
