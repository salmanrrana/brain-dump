/**
 * Type definitions for xdg.js module.
 * XDG Base Directory utilities for cross-platform data storage paths.
 */

export function getPlatform(): "linux" | "darwin" | "win32" | "other";
export function getDataDir(): string;
export function getStateDir(): string;
export function getLogsDir(): string;
export function getBackupsDir(): string;
export function getLegacyDir(): string;
export function getDbPath(): string;
export function getLockFilePath(): string;
export function ensureDirectoriesSync(): void;
