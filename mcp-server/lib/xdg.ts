/**
 * XDG-compliant path utilities for Brain Dump MCP server.
 * Handles platform-specific paths (Linux XDG, macOS Library, Windows APPDATA).
 */

import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

const APP_NAME = "brain-dump";

type Platform = "linux" | "darwin" | "win32" | "other";

/** Detect current platform and return normalized value */
export function getPlatform(): Platform {
  const p = process.platform;
  return p === "linux" || p === "darwin" || p === "win32" ? p : "other";
}

/** Get the data directory for storing the database. */
export function getDataDir(): string {
  const p = getPlatform();
  if (p === "darwin") return join(homedir(), "Library", "Application Support", APP_NAME);
  if (p === "win32") {
    return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), APP_NAME);
  }
  return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), APP_NAME);
}

/** Get the state directory for logs, backups, and lock files. */
export function getStateDir(): string {
  const p = getPlatform();
  if (p === "darwin") return join(homedir(), "Library", "Application Support", APP_NAME, "state");
  if (p === "win32") {
    return join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), APP_NAME, "state");
  }
  return join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), APP_NAME);
}

/** Get the logs directory. */
export function getLogsDir(): string {
  return join(getStateDir(), "logs");
}

/** Get the backups directory. */
export function getBackupsDir(): string {
  return join(getStateDir(), "backups");
}

/** Get the legacy directory path (~/.brain-dump). */
export function getLegacyDir(): string {
  return join(homedir(), ".brain-dump");
}

/** Get the database file path. */
export function getDbPath(): string {
  return join(getDataDir(), "brain-dump.db");
}

/** Get the lock file path. */
export function getLockFilePath(): string {
  return join(getStateDir(), "brain-dump.lock");
}

/** Ensure all required directories exist with 0700 permissions. */
export function ensureDirectoriesSync(): void {
  for (const dir of [getDataDir(), getStateDir(), getBackupsDir()]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}
