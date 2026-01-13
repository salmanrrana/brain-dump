/**
 * Logging utilities for Brain Dump MCP server.
 * All output goes to stderr for STDIO transport. File logging for audit trail.
 * @module lib/logging
 */
import { join } from "path";
import { existsSync, mkdirSync, appendFileSync, statSync, renameSync, unlinkSync } from "fs";
import { getLogsDir } from "./xdg.js";

/** @type {string} Main log file name */
export const LOG_FILE = "mcp-server.log";
/** @type {string} Error-only log file name */
export const ERROR_LOG_FILE = "error.log";
/** @type {number} Maximum log file size before rotation (10MB) */
export const MAX_LOG_SIZE = 10 * 1024 * 1024;
/** @type {number} Maximum number of rotated log files to keep */
export const MAX_LOG_FILES = 5;
/** @type {Object<string, number>} Log level priority mapping */
export const LOG_PRIORITY = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

// Re-export getLogsDir for backwards compatibility
export { getLogsDir };

/**
 * Format a log entry with timestamp, level, source, and optional error details.
 * @param {string} level - Log level (DEBUG, INFO, WARN, ERROR)
 * @param {string} source - Source identifier (e.g., "mcp-server")
 * @param {string} message - Log message
 * @param {Error} [error] - Optional error object for stack trace
 * @returns {string} Formatted log entry
 */
export function formatLogEntry(level, source, message, error) {
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
 * @param {string} filename - The log filename to rotate
 */
export function rotateLogFile(filename) {
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
  } catch { /* ignore rotation errors */ }
}

/**
 * Write an entry to a log file, creating the logs directory if needed.
 * @param {string} filename - The log filename to write to
 * @param {string} entry - The formatted log entry to write
 */
export function writeToLogFile(filename, entry) {
  try {
    const logsDir = getLogsDir();
    if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true, mode: 0o700 });
    rotateLogFile(filename);
    appendFileSync(join(logsDir, filename), entry + "\n", { mode: 0o600 });
  } catch { /* ignore file write errors */ }
}

/**
 * Get the configured minimum log level from LOG_LEVEL env var.
 * @returns {"DEBUG"|"INFO"|"WARN"|"ERROR"} The minimum log level
 */
export function getLogLevel() {
  const level = process.env.LOG_LEVEL?.toUpperCase();
  return ["DEBUG", "INFO", "WARN", "ERROR"].includes(level) ? level : "INFO";
}

/**
 * Check if a message at the given level should be logged.
 * @param {"DEBUG"|"INFO"|"WARN"|"ERROR"} level - The log level to check
 * @returns {boolean} True if the message should be logged
 */
export function shouldLog(level) {
  return LOG_PRIORITY[level] >= LOG_PRIORITY[getLogLevel()];
}

/**
 * Logger object with methods for each log level.
 * All methods write to stderr (for STDIO transport) and to log files.
 * @type {{info: function, warn: function, error: function, debug: function}}
 */
export const log = {
  info: (msg) => {
    if (!shouldLog("INFO")) return;
    console.error(`[brain-dump] ${msg}`);
    writeToLogFile(LOG_FILE, formatLogEntry("INFO", "mcp-server", msg));
  },
  warn: (msg, err) => {
    if (!shouldLog("WARN")) return;
    console.error(`[brain-dump] WARN: ${msg}`, err?.message || "");
    writeToLogFile(LOG_FILE, formatLogEntry("WARN", "mcp-server", msg, err));
  },
  error: (msg, err) => {
    if (!shouldLog("ERROR")) return;
    console.error(`[brain-dump] ERROR: ${msg}`, err?.message || "");
    const entry = formatLogEntry("ERROR", "mcp-server", msg, err);
    writeToLogFile(LOG_FILE, entry);
    writeToLogFile(ERROR_LOG_FILE, entry);
  },
  debug: (msg) => {
    if (!shouldLog("DEBUG")) return;
    console.error(`[brain-dump] DEBUG: ${msg}`);
    writeToLogFile(LOG_FILE, formatLogEntry("DEBUG", "mcp-server", msg));
  },
};
