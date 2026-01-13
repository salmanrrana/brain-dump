/**
 * XDG-compliant path utilities for Brain Dump MCP server.
 * Handles platform-specific paths (Linux XDG, macOS Library, Windows APPDATA).
 * @module lib/xdg
 */
import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

const APP_NAME = "brain-dump";

/** @returns {"linux"|"darwin"|"win32"|"other"} */
export function getPlatform() {
  const p = process.platform;
  return (p === "linux" || p === "darwin" || p === "win32") ? p : "other";
}

/** Get the data directory for storing the database. @returns {string} */
export function getDataDir() {
  const p = getPlatform();
  if (p === "darwin") return join(homedir(), "Library", "Application Support", APP_NAME);
  if (p === "win32") {
    return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), APP_NAME);
  }
  return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), APP_NAME);
}

/** Get the state directory for logs, backups, and lock files. @returns {string} */
export function getStateDir() {
  const p = getPlatform();
  if (p === "darwin") return join(homedir(), "Library", "Application Support", APP_NAME, "state");
  if (p === "win32") {
    return join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), APP_NAME, "state");
  }
  return join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), APP_NAME);
}

/** Get the logs directory. @returns {string} */
export function getLogsDir() {
  return join(getStateDir(), "logs");
}

/** Get the backups directory. @returns {string} */
export function getBackupsDir() {
  return join(getStateDir(), "backups");
}

/** Get the legacy directory path (~/.brain-dump). @returns {string} */
export function getLegacyDir() {
  return join(homedir(), ".brain-dump");
}

/** Get the database file path. @returns {string} */
export function getDbPath() {
  return join(getDataDir(), "brain-dump.db");
}

/** Get the lock file path. @returns {string} */
export function getLockFilePath() {
  return join(getStateDir(), "brain-dump.lock");
}

/** Ensure all required directories exist with 0700 permissions. */
export function ensureDirectoriesSync() {
  for (const dir of [getDataDir(), getStateDir(), getBackupsDir()]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}
