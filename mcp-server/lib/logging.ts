/**
 * Logging utilities for Brain Dump MCP server.
 * All output goes to stderr for STDIO transport. File logging for audit trail.
 * @module lib/logging
 */
import { join } from "path";
import { existsSync, mkdirSync, appendFileSync, statSync, renameSync, unlinkSync } from "fs";
import { getLogsDir } from "./xdg.js";

/** Main log file name */
export const LOG_FILE = "mcp-server.log";
/** Error-only log file name */
export const ERROR_LOG_FILE = "error.log";
/** Maximum log file size before rotation (10MB) */
export const MAX_LOG_SIZE = 10 * 1024 * 1024;
/** Maximum number of rotated log files to keep */
export const MAX_LOG_FILES = 5;

/** Log level type */
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

/** Log level priority mapping */
export const LOG_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

/**
 * Get a message string from any error value.
 * @param error - Error value (Error, string, unknown, etc)
 * @returns Error message string
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

/**
 * Format a log entry with timestamp, level, source, and optional error details.
 * @param level - Log level (DEBUG, INFO, WARN, ERROR)
 * @param source - Source identifier (e.g., "mcp-server")
 * @param message - Log message
 * @param error - Optional error object for stack trace
 * @returns Formatted log entry
 */
export function formatLogEntry(
  level: LogLevel,
  source: string,
  message: string,
  error?: Error
): string {
  const timestamp = new Date().toISOString();
  let line = `${timestamp} [${level}] [${source}] ${message}`;
  if (error) {
    line += `\n  Error: ${error.message || String(error)}`;
    if (error.stack) {
      for (const stackLine of error.stack.split("\n").slice(1)) {
        line += `\n  ${stackLine.trim()}`;
      }
    }
  }
  return line;
}

/**
 * Rotate a log file if it exceeds MAX_LOG_SIZE.
 * @param filename - The log filename to rotate
 */
export function rotateLogFile(filename: string): void {
  const logsDir = getLogsDir();
  const basePath = join(logsDir, filename);
  if (!existsSync(basePath)) return;
  try {
    const stats = statSync(basePath);
    if (stats.size < MAX_LOG_SIZE) return;
    const oldestPath = join(logsDir, `${filename}.${MAX_LOG_FILES - 1}`);
    if (existsSync(oldestPath)) unlinkSync(oldestPath);
    for (let i = MAX_LOG_FILES - 2; i >= 1; i--) {
      const fromPath = join(logsDir, `${filename}.${i}`);
      const toPath = join(logsDir, `${filename}.${i + 1}`);
      if (existsSync(fromPath)) renameSync(fromPath, toPath);
    }
    renameSync(basePath, join(logsDir, `${filename}.1`));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[brain-dump] Log rotation failed for ${filename}: ${message}`);
  }
}

/**
 * Write an entry to a log file, creating the logs directory if needed.
 * @param filename - The log filename to write to
 * @param entry - The formatted log entry to write
 */
export function writeToLogFile(filename: string, entry: string): void {
  try {
    const logsDir = getLogsDir();
    if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true, mode: 0o700 });
    rotateLogFile(filename);
    appendFileSync(join(logsDir, filename), entry + "\n", { mode: 0o600 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[brain-dump] Failed to write to log file ${filename}: ${message}`);
  }
}

/**
 * Get the configured minimum log level from LOG_LEVEL env var.
 * @returns The minimum log level
 */
export function getLogLevel(): LogLevel {
  const level = process.env["LOG_LEVEL"]?.toUpperCase();
  const validLevels: LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR"];
  return validLevels.includes(level as LogLevel) ? (level as LogLevel) : "INFO";
}

/**
 * Check if a message at the given level should be logged.
 * @param level - The log level to check
 * @returns True if the message should be logged
 */
export function shouldLog(level: LogLevel): boolean {
  return LOG_PRIORITY[level] >= LOG_PRIORITY[getLogLevel()];
}

/** Logger interface */
export interface Logger {
  info(message: string, error?: Error | Record<string, unknown> | unknown): void;
  warn(message: string, error?: Error | Record<string, unknown> | unknown): void;
  error(message: string, error?: Error | Record<string, unknown> | unknown): void;
  debug(message: string, error?: Error | Record<string, unknown> | unknown): void;
}

/**
 * Logger object with methods for each log level.
 * All methods write to stderr (for STDIO transport) and to log files.
 */
export const log: Logger = {
  info: (msg: string, err?: Error | Record<string, unknown> | unknown): void => {
    if (!shouldLog("INFO")) return;
    console.error(`[brain-dump] ${msg}`);
    const error = err instanceof Error ? err : undefined;
    writeToLogFile(LOG_FILE, formatLogEntry("INFO", "mcp-server", msg, error));
  },
  warn: (msg: string, err?: Error | Record<string, unknown> | unknown): void => {
    if (!shouldLog("WARN")) return;
    const errorMsg =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err
          ? JSON.stringify(err)
          : String(err);
    console.error(`[brain-dump] WARN: ${msg}`, errorMsg);
    const error = err instanceof Error ? err : undefined;
    writeToLogFile(LOG_FILE, formatLogEntry("WARN", "mcp-server", msg, error));
  },
  error: (msg: string, err?: Error | Record<string, unknown> | unknown): void => {
    if (!shouldLog("ERROR")) return;
    const errorMsg =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err
          ? JSON.stringify(err)
          : String(err);
    console.error(`[brain-dump] ERROR: ${msg}`, errorMsg);
    const error = err instanceof Error ? err : undefined;
    const entry = formatLogEntry("ERROR", "mcp-server", msg, error);
    writeToLogFile(LOG_FILE, entry);
    writeToLogFile(ERROR_LOG_FILE, entry);
  },
  debug: (msg: string, err?: Error | Record<string, unknown> | unknown): void => {
    if (!shouldLog("DEBUG")) return;
    console.error(`[brain-dump] DEBUG: ${msg}`);
    const error = err instanceof Error ? err : undefined;
    writeToLogFile(LOG_FILE, formatLogEntry("DEBUG", "mcp-server", msg, error));
  },
};
