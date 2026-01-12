import { homedir, platform as osPlatform } from "os";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import { mkdir, access, constants } from "fs/promises";

const APP_NAME = "brain-dumpy";

/**
 * Cross-Platform Application Paths
 *
 * Provides platform-appropriate directory paths for:
 * - Data: User data (database, exports)
 * - Config: User configuration (settings)
 * - Cache: Non-essential cached data (temp files)
 * - State: State data (logs, backups)
 *
 * Platform conventions:
 * - Linux: XDG Base Directory Specification (~/.local/share, ~/.config, etc.)
 * - macOS: Apple conventions (~/Library/Application Support, ~/Library/Caches)
 * - Windows: Windows conventions (%APPDATA%, %LOCALAPPDATA%)
 */

// =============================================================================
// PLATFORM DETECTION
// =============================================================================

export type Platform = "linux" | "darwin" | "win32" | "other";

/**
 * Override for testing - allows tests to set a specific platform.
 * Set to null to use actual platform detection.
 */
let platformOverride: Platform | null = null;

/**
 * Set platform override for testing.
 * @internal - Only for use in tests
 */
export function _setPlatformOverride(p: Platform | null): void {
  platformOverride = p;
}

/**
 * Get the current platform.
 * Returns a normalized platform string.
 */
export function getPlatform(): Platform {
  if (platformOverride !== null) {
    return platformOverride;
  }
  const p = osPlatform();
  if (p === "linux" || p === "darwin" || p === "win32") {
    return p;
  }
  return "other";
}

/**
 * Check if running on Linux.
 */
export function isLinux(): boolean {
  return getPlatform() === "linux";
}

/**
 * Check if running on macOS.
 */
export function isMacOS(): boolean {
  return getPlatform() === "darwin";
}

/**
 * Check if running on Windows.
 */
export function isWindows(): boolean {
  return getPlatform() === "win32";
}

// =============================================================================
// PLATFORM-SPECIFIC PATH FUNCTIONS
// =============================================================================

/**
 * Get the data directory for the application.
 *
 * Platform paths:
 * - Linux: XDG_DATA_HOME or ~/.local/share/brain-dumpy
 * - macOS: ~/Library/Application Support/brain-dumpy
 * - Windows: %APPDATA%\brain-dumpy
 */
export function getDataDir(): string {
  const p = getPlatform();

  if (p === "darwin") {
    // macOS: ~/Library/Application Support/brain-dumpy
    return join(homedir(), "Library", "Application Support", APP_NAME);
  }

  if (p === "win32") {
    // Windows: %APPDATA%\brain-dumpy (falls back to ~/AppData/Roaming)
    const appData = process.env.APPDATA;
    const base = appData || join(homedir(), "AppData", "Roaming");
    return join(base, APP_NAME);
  }

  // Linux and other: XDG_DATA_HOME or ~/.local/share/brain-dumpy
  const xdgDataHome = process.env.XDG_DATA_HOME;
  const base = xdgDataHome || join(homedir(), ".local", "share");
  return join(base, APP_NAME);
}

/**
 * Get the config directory for the application.
 *
 * Platform paths:
 * - Linux: XDG_CONFIG_HOME or ~/.config/brain-dumpy
 * - macOS: ~/Library/Application Support/brain-dumpy (same as data on macOS)
 * - Windows: %APPDATA%\brain-dumpy (same as data on Windows)
 */
export function getConfigDir(): string {
  const p = getPlatform();

  if (p === "darwin") {
    // macOS: Config is in Application Support (same as data)
    return join(homedir(), "Library", "Application Support", APP_NAME);
  }

  if (p === "win32") {
    // Windows: Config is in %APPDATA% (same as data)
    const appData = process.env.APPDATA;
    const base = appData || join(homedir(), "AppData", "Roaming");
    return join(base, APP_NAME);
  }

  // Linux and other: XDG_CONFIG_HOME or ~/.config/brain-dumpy
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  const base = xdgConfigHome || join(homedir(), ".config");
  return join(base, APP_NAME);
}

/**
 * Get the cache directory for the application.
 *
 * Platform paths:
 * - Linux: XDG_CACHE_HOME or ~/.cache/brain-dumpy
 * - macOS: ~/Library/Caches/brain-dumpy
 * - Windows: %LOCALAPPDATA%\brain-dumpy\cache
 */
export function getCacheDir(): string {
  const p = getPlatform();

  if (p === "darwin") {
    // macOS: ~/Library/Caches/brain-dumpy
    return join(homedir(), "Library", "Caches", APP_NAME);
  }

  if (p === "win32") {
    // Windows: %LOCALAPPDATA%\brain-dumpy\cache
    const localAppData = process.env.LOCALAPPDATA;
    const base = localAppData || join(homedir(), "AppData", "Local");
    return join(base, APP_NAME, "cache");
  }

  // Linux and other: XDG_CACHE_HOME or ~/.cache/brain-dumpy
  const xdgCacheHome = process.env.XDG_CACHE_HOME;
  const base = xdgCacheHome || join(homedir(), ".cache");
  return join(base, APP_NAME);
}

/**
 * Get the state directory for the application.
 * Used for logs, backups, and other state that persists between sessions.
 *
 * Platform paths:
 * - Linux: XDG_STATE_HOME or ~/.local/state/brain-dumpy
 * - macOS: ~/Library/Application Support/brain-dumpy/state
 * - Windows: %LOCALAPPDATA%\brain-dumpy\state
 */
export function getStateDir(): string {
  const p = getPlatform();

  if (p === "darwin") {
    // macOS: ~/Library/Application Support/brain-dumpy/state
    return join(homedir(), "Library", "Application Support", APP_NAME, "state");
  }

  if (p === "win32") {
    // Windows: %LOCALAPPDATA%\brain-dumpy\state
    const localAppData = process.env.LOCALAPPDATA;
    const base = localAppData || join(homedir(), "AppData", "Local");
    return join(base, APP_NAME, "state");
  }

  // Linux and other: XDG_STATE_HOME or ~/.local/state/brain-dumpy
  const xdgStateHome = process.env.XDG_STATE_HOME;
  const base = xdgStateHome || join(homedir(), ".local", "state");
  return join(base, APP_NAME);
}

// =============================================================================
// DERIVED PATHS (Platform-independent)
// =============================================================================

/**
 * Get the legacy data directory path.
 * Used for migration detection. Same on all platforms.
 */
export function getLegacyDir(): string {
  return join(homedir(), ".brain-dump");
}

/**
 * Get the database file path.
 */
export function getDatabasePath(): string {
  return join(getDataDir(), "brain-dumpy.db");
}

/**
 * Get the backups directory path.
 */
export function getBackupsDir(): string {
  return join(getStateDir(), "backups");
}

/**
 * Get the logs directory path.
 */
export function getLogsDir(): string {
  return join(getStateDir(), "logs");
}

// =============================================================================
// DIRECTORY CREATION
// =============================================================================

/**
 * Ensure a directory exists with secure permissions.
 * Creates parent directories if needed.
 * Uses 0700 on Unix, default permissions on Windows.
 */
async function ensureDir(dir: string): Promise<void> {
  try {
    await access(dir, constants.F_OK);
  } catch {
    // Directory doesn't exist, create it
    // Note: mode is ignored on Windows
    await mkdir(dir, { recursive: true, mode: 0o700 });
  }
}

/**
 * Ensure all required application directories exist with proper permissions.
 * Creates directories with mode 0700 (owner read/write/execute only) on Unix.
 *
 * Directory structure varies by platform - see individual path functions.
 */
export async function ensureDirectories(): Promise<void> {
  await Promise.all([
    ensureDir(getDataDir()),
    ensureDir(getConfigDir()),
    ensureDir(getCacheDir()),
    ensureDir(getStateDir()),
    ensureDir(getBackupsDir()),
    ensureDir(getLogsDir()),
  ]);
}

/**
 * Synchronous version of directory creation for startup.
 * Uses fs.mkdirSync with proper permissions.
 */
export function ensureDirectoriesSync(): void {
  const dirs = [
    getDataDir(),
    getConfigDir(),
    getCacheDir(),
    getStateDir(),
    getBackupsDir(),
    getLogsDir(),
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      // Note: mode is ignored on Windows
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }
}
