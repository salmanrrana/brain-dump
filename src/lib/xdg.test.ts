import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { homedir } from "os";
import { join } from "path";
import { existsSync, rmSync, statSync } from "fs";
import {
  getDataDir,
  getConfigDir,
  getCacheDir,
  getStateDir,
  getLegacyDir,
  getDatabasePath,
  getBackupsDir,
  getLogsDir,
  ensureDirectories,
  ensureDirectoriesSync,
} from "./xdg";

describe("XDG Directory Utilities", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment variables
    delete process.env.XDG_DATA_HOME;
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CACHE_HOME;
    delete process.env.XDG_STATE_HOME;
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  describe("getDataDir", () => {
    it("should return default path when XDG_DATA_HOME is not set", () => {
      const expected = join(homedir(), ".local", "share", "brain-dumpy");
      expect(getDataDir()).toBe(expected);
    });

    it("should respect XDG_DATA_HOME environment variable", () => {
      process.env.XDG_DATA_HOME = "/custom/data";
      expect(getDataDir()).toBe("/custom/data/brain-dumpy");
    });
  });

  describe("getConfigDir", () => {
    it("should return default path when XDG_CONFIG_HOME is not set", () => {
      const expected = join(homedir(), ".config", "brain-dumpy");
      expect(getConfigDir()).toBe(expected);
    });

    it("should respect XDG_CONFIG_HOME environment variable", () => {
      process.env.XDG_CONFIG_HOME = "/custom/config";
      expect(getConfigDir()).toBe("/custom/config/brain-dumpy");
    });
  });

  describe("getCacheDir", () => {
    it("should return default path when XDG_CACHE_HOME is not set", () => {
      const expected = join(homedir(), ".cache", "brain-dumpy");
      expect(getCacheDir()).toBe(expected);
    });

    it("should respect XDG_CACHE_HOME environment variable", () => {
      process.env.XDG_CACHE_HOME = "/custom/cache";
      expect(getCacheDir()).toBe("/custom/cache/brain-dumpy");
    });
  });

  describe("getStateDir", () => {
    it("should return default path when XDG_STATE_HOME is not set", () => {
      const expected = join(homedir(), ".local", "state", "brain-dumpy");
      expect(getStateDir()).toBe(expected);
    });

    it("should respect XDG_STATE_HOME environment variable", () => {
      process.env.XDG_STATE_HOME = "/custom/state";
      expect(getStateDir()).toBe("/custom/state/brain-dumpy");
    });
  });

  describe("getLegacyDir", () => {
    it("should return legacy ~/.brain-dump path", () => {
      const expected = join(homedir(), ".brain-dump");
      expect(getLegacyDir()).toBe(expected);
    });
  });

  describe("getDatabasePath", () => {
    it("should return database path in data directory", () => {
      const expected = join(homedir(), ".local", "share", "brain-dumpy", "brain-dumpy.db");
      expect(getDatabasePath()).toBe(expected);
    });

    it("should respect XDG_DATA_HOME for database path", () => {
      process.env.XDG_DATA_HOME = "/custom/data";
      expect(getDatabasePath()).toBe("/custom/data/brain-dumpy/brain-dumpy.db");
    });
  });

  describe("getBackupsDir", () => {
    it("should return backups path in state directory", () => {
      const expected = join(homedir(), ".local", "state", "brain-dumpy", "backups");
      expect(getBackupsDir()).toBe(expected);
    });
  });

  describe("getLogsDir", () => {
    it("should return logs path in state directory", () => {
      const expected = join(homedir(), ".local", "state", "brain-dumpy", "logs");
      expect(getLogsDir()).toBe(expected);
    });
  });

  describe("ensureDirectories", () => {
    const testBase = join("/tmp", `xdg-test-${process.pid}`);

    beforeEach(() => {
      // Use temporary directories for testing
      process.env.XDG_DATA_HOME = join(testBase, "data");
      process.env.XDG_CONFIG_HOME = join(testBase, "config");
      process.env.XDG_CACHE_HOME = join(testBase, "cache");
      process.env.XDG_STATE_HOME = join(testBase, "state");
    });

    afterEach(() => {
      // Cleanup test directories
      if (existsSync(testBase)) {
        rmSync(testBase, { recursive: true, force: true });
      }
    });

    it("should create all XDG directories", async () => {
      await ensureDirectories();

      expect(existsSync(getDataDir())).toBe(true);
      expect(existsSync(getConfigDir())).toBe(true);
      expect(existsSync(getCacheDir())).toBe(true);
      expect(existsSync(getStateDir())).toBe(true);
      expect(existsSync(getBackupsDir())).toBe(true);
      expect(existsSync(getLogsDir())).toBe(true);
    });

    it("should create directories with secure permissions (0700)", async () => {
      await ensureDirectories();

      const dataStats = statSync(getDataDir());
      const configStats = statSync(getConfigDir());
      const cacheStats = statSync(getCacheDir());
      const stateStats = statSync(getStateDir());

      // Check mode is 0700 (owner rwx only)
      // statSync returns full mode including file type, mask with 0o777 to get permissions
      expect(dataStats.mode & 0o777).toBe(0o700);
      expect(configStats.mode & 0o777).toBe(0o700);
      expect(cacheStats.mode & 0o777).toBe(0o700);
      expect(stateStats.mode & 0o777).toBe(0o700);
    });

    it("should be idempotent (not fail if directories exist)", async () => {
      await ensureDirectories();
      await expect(ensureDirectories()).resolves.not.toThrow();
    });
  });

  describe("ensureDirectoriesSync", () => {
    const testBase = join("/tmp", `xdg-sync-test-${process.pid}`);

    beforeEach(() => {
      process.env.XDG_DATA_HOME = join(testBase, "data");
      process.env.XDG_CONFIG_HOME = join(testBase, "config");
      process.env.XDG_CACHE_HOME = join(testBase, "cache");
      process.env.XDG_STATE_HOME = join(testBase, "state");
    });

    afterEach(() => {
      if (existsSync(testBase)) {
        rmSync(testBase, { recursive: true, force: true });
      }
    });

    it("should create all XDG directories synchronously", () => {
      ensureDirectoriesSync();

      expect(existsSync(getDataDir())).toBe(true);
      expect(existsSync(getConfigDir())).toBe(true);
      expect(existsSync(getCacheDir())).toBe(true);
      expect(existsSync(getStateDir())).toBe(true);
      expect(existsSync(getBackupsDir())).toBe(true);
      expect(existsSync(getLogsDir())).toBe(true);
    });

    it("should be idempotent synchronously", () => {
      ensureDirectoriesSync();
      expect(() => ensureDirectoriesSync()).not.toThrow();
    });
  });
});
