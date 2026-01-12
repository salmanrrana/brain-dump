import { homedir } from "os";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import { mkdir, access, constants } from "fs/promises";

const APP_NAME = "brain-dumpy";

/**
 * XDG Base Directory Specification utility
 * https://specifications.freedesktop.org/basedir-spec/latest/
 *
 * Provides XDG-compliant directory paths for:
 * - XDG_DATA_HOME: User data (database, exports)
 * - XDG_CONFIG_HOME: User configuration (settings)
 * - XDG_CACHE_HOME: Non-essential cached data (temp files)
 * - XDG_STATE_HOME: State data (logs, backups)
 */

/**
 * Get the XDG data directory for the application.
 * Uses XDG_DATA_HOME if set, otherwise defaults to ~/.local/share/brain-dumpy
 */
export function getDataDir(): string {
  const xdgDataHome = process.env.XDG_DATA_HOME;
  const base = xdgDataHome || join(homedir(), ".local", "share");
  return join(base, APP_NAME);
}

/**
 * Get the XDG config directory for the application.
 * Uses XDG_CONFIG_HOME if set, otherwise defaults to ~/.config/brain-dumpy
 */
export function getConfigDir(): string {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  const base = xdgConfigHome || join(homedir(), ".config");
  return join(base, APP_NAME);
}

/**
 * Get the XDG cache directory for the application.
 * Uses XDG_CACHE_HOME if set, otherwise defaults to ~/.cache/brain-dumpy
 */
export function getCacheDir(): string {
  const xdgCacheHome = process.env.XDG_CACHE_HOME;
  const base = xdgCacheHome || join(homedir(), ".cache");
  return join(base, APP_NAME);
}

/**
 * Get the XDG state directory for the application.
 * Uses XDG_STATE_HOME if set, otherwise defaults to ~/.local/state/brain-dumpy
 */
export function getStateDir(): string {
  const xdgStateHome = process.env.XDG_STATE_HOME;
  const base = xdgStateHome || join(homedir(), ".local", "state");
  return join(base, APP_NAME);
}

/**
 * Get the legacy data directory path.
 * Used for migration detection.
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

/**
 * Ensure a directory exists with secure permissions (0700).
 * Creates parent directories if needed.
 */
async function ensureDir(dir: string): Promise<void> {
  try {
    await access(dir, constants.F_OK);
  } catch {
    // Directory doesn't exist, create it with 0700 permissions
    await mkdir(dir, { recursive: true, mode: 0o700 });
  }
}

/**
 * Ensure all required XDG directories exist with proper permissions.
 * Creates directories with mode 0700 (owner read/write/execute only).
 *
 * Directory structure:
 * - ~/.local/share/brain-dumpy/ (database, exports)
 * - ~/.config/brain-dumpy/ (settings)
 * - ~/.cache/brain-dumpy/ (temp files)
 * - ~/.local/state/brain-dumpy/ (logs, backups)
 * - ~/.local/state/brain-dumpy/backups/
 * - ~/.local/state/brain-dumpy/logs/
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
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }
}
