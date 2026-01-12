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
  getPlatform,
  isLinux,
  isMacOS,
  isWindows,
  _setPlatformOverride,
} from "./xdg";

describe("Cross-Platform Path Utilities", () => {
  const originalEnv = { ...process.env };
  const home = homedir();

  beforeEach(() => {
    // Reset environment variables
    delete process.env.XDG_DATA_HOME;
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CACHE_HOME;
    delete process.env.XDG_STATE_HOME;
    delete process.env.APPDATA;
    delete process.env.LOCALAPPDATA;
    // Reset platform override
    _setPlatformOverride(null);
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
    _setPlatformOverride(null);
  });

  // ===========================================================================
  // PLATFORM DETECTION TESTS
  // ===========================================================================

  describe("Platform Detection", () => {
    describe("getPlatform", () => {
      it("should return 'linux' when override is set", () => {
        _setPlatformOverride("linux");
        expect(getPlatform()).toBe("linux");
      });

      it("should return 'darwin' when override is set", () => {
        _setPlatformOverride("darwin");
        expect(getPlatform()).toBe("darwin");
      });

      it("should return 'win32' when override is set", () => {
        _setPlatformOverride("win32");
        expect(getPlatform()).toBe("win32");
      });

      it("should return 'other' when override is set", () => {
        _setPlatformOverride("other");
        expect(getPlatform()).toBe("other");
      });

      it("should return actual platform when no override", () => {
        _setPlatformOverride(null);
        // On Linux test system, should return 'linux'
        const result = getPlatform();
        expect(["linux", "darwin", "win32", "other"]).toContain(result);
      });
    });

    describe("isLinux", () => {
      it("should return true on Linux", () => {
        _setPlatformOverride("linux");
        expect(isLinux()).toBe(true);
      });

      it("should return false on other platforms", () => {
        _setPlatformOverride("darwin");
        expect(isLinux()).toBe(false);
      });
    });

    describe("isMacOS", () => {
      it("should return true on macOS", () => {
        _setPlatformOverride("darwin");
        expect(isMacOS()).toBe(true);
      });

      it("should return false on other platforms", () => {
        _setPlatformOverride("linux");
        expect(isMacOS()).toBe(false);
      });
    });

    describe("isWindows", () => {
      it("should return true on Windows", () => {
        _setPlatformOverride("win32");
        expect(isWindows()).toBe(true);
      });

      it("should return false on other platforms", () => {
        _setPlatformOverride("linux");
        expect(isWindows()).toBe(false);
      });
    });
  });

  // ===========================================================================
  // LINUX PATH TESTS (XDG)
  // ===========================================================================

  describe("Linux Paths (XDG)", () => {
    beforeEach(() => {
      _setPlatformOverride("linux");
    });

    describe("getDataDir", () => {
      it("should return default XDG path", () => {
        const expected = join(home, ".local", "share", "brain-dumpy");
        expect(getDataDir()).toBe(expected);
      });

      it("should respect XDG_DATA_HOME", () => {
        process.env.XDG_DATA_HOME = "/custom/data";
        expect(getDataDir()).toBe("/custom/data/brain-dumpy");
      });
    });

    describe("getConfigDir", () => {
      it("should return default XDG path", () => {
        const expected = join(home, ".config", "brain-dumpy");
        expect(getConfigDir()).toBe(expected);
      });

      it("should respect XDG_CONFIG_HOME", () => {
        process.env.XDG_CONFIG_HOME = "/custom/config";
        expect(getConfigDir()).toBe("/custom/config/brain-dumpy");
      });
    });

    describe("getCacheDir", () => {
      it("should return default XDG path", () => {
        const expected = join(home, ".cache", "brain-dumpy");
        expect(getCacheDir()).toBe(expected);
      });

      it("should respect XDG_CACHE_HOME", () => {
        process.env.XDG_CACHE_HOME = "/custom/cache";
        expect(getCacheDir()).toBe("/custom/cache/brain-dumpy");
      });
    });

    describe("getStateDir", () => {
      it("should return default XDG path", () => {
        const expected = join(home, ".local", "state", "brain-dumpy");
        expect(getStateDir()).toBe(expected);
      });

      it("should respect XDG_STATE_HOME", () => {
        process.env.XDG_STATE_HOME = "/custom/state";
        expect(getStateDir()).toBe("/custom/state/brain-dumpy");
      });
    });
  });

  // ===========================================================================
  // MACOS PATH TESTS
  // ===========================================================================

  describe("macOS Paths", () => {
    beforeEach(() => {
      _setPlatformOverride("darwin");
    });

    describe("getDataDir", () => {
      it("should return ~/Library/Application Support/brain-dumpy", () => {
        const expected = join(home, "Library", "Application Support", "brain-dumpy");
        expect(getDataDir()).toBe(expected);
      });
    });

    describe("getConfigDir", () => {
      it("should return ~/Library/Application Support/brain-dumpy (same as data)", () => {
        const expected = join(home, "Library", "Application Support", "brain-dumpy");
        expect(getConfigDir()).toBe(expected);
      });
    });

    describe("getCacheDir", () => {
      it("should return ~/Library/Caches/brain-dumpy", () => {
        const expected = join(home, "Library", "Caches", "brain-dumpy");
        expect(getCacheDir()).toBe(expected);
      });
    });

    describe("getStateDir", () => {
      it("should return ~/Library/Application Support/brain-dumpy/state", () => {
        const expected = join(home, "Library", "Application Support", "brain-dumpy", "state");
        expect(getStateDir()).toBe(expected);
      });
    });
  });

  // ===========================================================================
  // WINDOWS PATH TESTS
  // ===========================================================================

  describe("Windows Paths", () => {
    beforeEach(() => {
      _setPlatformOverride("win32");
    });

    describe("getDataDir", () => {
      it("should use %APPDATA% when set", () => {
        process.env.APPDATA = "/mock/appdata";
        expect(getDataDir()).toBe(join("/mock/appdata", "brain-dumpy"));
      });

      it("should fall back to ~/AppData/Roaming when %APPDATA% not set", () => {
        const expected = join(home, "AppData", "Roaming", "brain-dumpy");
        expect(getDataDir()).toBe(expected);
      });
    });

    describe("getConfigDir", () => {
      it("should use %APPDATA% when set (same as data)", () => {
        process.env.APPDATA = "/mock/appdata";
        expect(getConfigDir()).toBe(join("/mock/appdata", "brain-dumpy"));
      });
    });

    describe("getCacheDir", () => {
      it("should use %LOCALAPPDATA%/brain-dumpy/cache when set", () => {
        process.env.LOCALAPPDATA = "/mock/localappdata";
        expect(getCacheDir()).toBe(join("/mock/localappdata", "brain-dumpy", "cache"));
      });

      it("should fall back to ~/AppData/Local when %LOCALAPPDATA% not set", () => {
        const expected = join(home, "AppData", "Local", "brain-dumpy", "cache");
        expect(getCacheDir()).toBe(expected);
      });
    });

    describe("getStateDir", () => {
      it("should use %LOCALAPPDATA%/brain-dumpy/state when set", () => {
        process.env.LOCALAPPDATA = "/mock/localappdata";
        expect(getStateDir()).toBe(join("/mock/localappdata", "brain-dumpy", "state"));
      });

      it("should fall back to ~/AppData/Local when %LOCALAPPDATA% not set", () => {
        const expected = join(home, "AppData", "Local", "brain-dumpy", "state");
        expect(getStateDir()).toBe(expected);
      });
    });
  });

  // ===========================================================================
  // PLATFORM-INDEPENDENT PATHS
  // ===========================================================================

  describe("Platform-Independent Paths", () => {
    describe("getLegacyDir", () => {
      it("should return ~/.brain-dump on all platforms", () => {
        const expected = join(home, ".brain-dump");

        _setPlatformOverride("linux");
        expect(getLegacyDir()).toBe(expected);

        _setPlatformOverride("darwin");
        expect(getLegacyDir()).toBe(expected);

        _setPlatformOverride("win32");
        expect(getLegacyDir()).toBe(expected);
      });
    });

    describe("getDatabasePath", () => {
      it("should return database path in data directory (Linux)", () => {
        _setPlatformOverride("linux");
        const expected = join(home, ".local", "share", "brain-dumpy", "brain-dumpy.db");
        expect(getDatabasePath()).toBe(expected);
      });

      it("should return database path in data directory (macOS)", () => {
        _setPlatformOverride("darwin");
        const expected = join(home, "Library", "Application Support", "brain-dumpy", "brain-dumpy.db");
        expect(getDatabasePath()).toBe(expected);
      });

      it("should return database path in data directory (Windows)", () => {
        _setPlatformOverride("win32");
        process.env.APPDATA = "/mock/appdata";
        expect(getDatabasePath()).toBe(join("/mock/appdata", "brain-dumpy", "brain-dumpy.db"));
      });
    });

    describe("getBackupsDir", () => {
      it("should return backups path in state directory", () => {
        _setPlatformOverride("linux");
        const expected = join(home, ".local", "state", "brain-dumpy", "backups");
        expect(getBackupsDir()).toBe(expected);
      });
    });

    describe("getLogsDir", () => {
      it("should return logs path in state directory", () => {
        _setPlatformOverride("linux");
        const expected = join(home, ".local", "state", "brain-dumpy", "logs");
        expect(getLogsDir()).toBe(expected);
      });
    });
  });

  // ===========================================================================
  // DIRECTORY CREATION TESTS
  // ===========================================================================

  describe("ensureDirectories", () => {
    const testBase = join("/tmp", `xdg-test-${process.pid}-${Date.now()}`);

    beforeEach(() => {
      _setPlatformOverride("linux");
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

    it("should create all directories", async () => {
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
      expect(dataStats.mode & 0o777).toBe(0o700);
      expect(configStats.mode & 0o777).toBe(0o700);
      expect(cacheStats.mode & 0o777).toBe(0o700);
      expect(stateStats.mode & 0o777).toBe(0o700);
    });

    it("should be idempotent", async () => {
      await ensureDirectories();
      await expect(ensureDirectories()).resolves.not.toThrow();
    });
  });

  describe("ensureDirectoriesSync", () => {
    const testBase = join("/tmp", `xdg-sync-test-${process.pid}-${Date.now()}`);

    beforeEach(() => {
      _setPlatformOverride("linux");
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

    it("should create all directories synchronously", () => {
      ensureDirectoriesSync();

      expect(existsSync(getDataDir())).toBe(true);
      expect(existsSync(getConfigDir())).toBe(true);
      expect(existsSync(getCacheDir())).toBe(true);
      expect(existsSync(getStateDir())).toBe(true);
      expect(existsSync(getBackupsDir())).toBe(true);
      expect(existsSync(getLogsDir())).toBe(true);
    });

    it("should be idempotent", () => {
      ensureDirectoriesSync();
      expect(() => ensureDirectoriesSync()).not.toThrow();
    });
  });
});
