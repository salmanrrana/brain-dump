import { existsSync, appendFileSync, statSync, renameSync, unlinkSync } from "fs";
import { join } from "path";
import { getLogsDir, ensureDirectoriesSync } from "./xdg";

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;
const APP_LOG_FILE = "brain-dumpy.log";
const MCP_LOG_FILE = "mcp-server.log";
const ERROR_LOG_FILE = "error.log";

// =============================================================================
// TYPES
// =============================================================================

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  error?: Error;
}

export interface LoggerOptions {
  source: string;
  level?: LogLevel;
  logToConsole?: boolean;
}

// =============================================================================
// LOG LEVEL MANAGEMENT
// =============================================================================

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

/**
 * Get the minimum log level from environment or default to INFO.
 */
export function getLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toUpperCase();
  if (envLevel && isValidLogLevel(envLevel)) {
    return envLevel as LogLevel;
  }
  return "INFO";
}

/**
 * Check if a string is a valid log level.
 */
export function isValidLogLevel(level: string): level is LogLevel {
  return level === "DEBUG" || level === "INFO" || level === "WARN" || level === "ERROR";
}

/**
 * Check if a log entry should be logged based on the current level.
 */
export function shouldLog(entryLevel: LogLevel, minLevel?: LogLevel): boolean {
  const min = minLevel || getLogLevel();
  return LOG_LEVEL_PRIORITY[entryLevel] >= LOG_LEVEL_PRIORITY[min];
}

// =============================================================================
// LOG FORMATTING
// =============================================================================

/**
 * Format a timestamp for log entries.
 */
export function formatTimestamp(date?: Date): string {
  const d = date || new Date();
  return d.toISOString();
}

/**
 * Format a log entry as a string.
 * Format: TIMESTAMP [LEVEL] [source] message
 */
export function formatLogEntry(entry: LogEntry): string {
  let line = `${entry.timestamp} [${entry.level}] [${entry.source}] ${entry.message}`;

  if (entry.error) {
    line += `\n  Error: ${entry.error.message}`;
    if (entry.error.stack) {
      // Indent stack trace lines
      const stackLines = entry.error.stack.split("\n").slice(1);
      for (const stackLine of stackLines) {
        line += `\n  ${stackLine.trim()}`;
      }
    }
  }

  return line;
}

// =============================================================================
// LOG FILE MANAGEMENT
// =============================================================================

/**
 * Get the path to a log file.
 */
export function getLogFilePath(filename: string): string {
  return join(getLogsDir(), filename);
}

/**
 * Get paths to rotated log files for a given base filename.
 * Returns files like: brain-dumpy.log, brain-dumpy.log.1, brain-dumpy.log.2, etc.
 */
export function getRotatedLogPaths(baseFilename: string): string[] {
  const logsDir = getLogsDir();
  const paths: string[] = [];

  // Current log file
  paths.push(join(logsDir, baseFilename));

  // Rotated files (1 through MAX_FILES-1)
  for (let i = 1; i < MAX_FILES; i++) {
    paths.push(join(logsDir, `${baseFilename}.${i}`));
  }

  return paths;
}

/**
 * Check if a log file needs rotation (exceeds MAX_FILE_SIZE).
 */
export function needsRotation(filePath: string): boolean {
  if (!existsSync(filePath)) {
    return false;
  }

  try {
    const stats = statSync(filePath);
    return stats.size >= MAX_FILE_SIZE;
  } catch {
    return false;
  }
}

/**
 * Rotate a log file.
 * Moves current log to .1, .1 to .2, etc.
 * Deletes the oldest file if we exceed MAX_FILES.
 */
export function rotateLogFile(baseFilename: string): void {
  const logsDir = getLogsDir();
  const basePath = join(logsDir, baseFilename);

  // Don't rotate if file doesn't need it
  if (!needsRotation(basePath)) {
    return;
  }

  // Delete the oldest rotated file if it exists
  const oldestPath = join(logsDir, `${baseFilename}.${MAX_FILES - 1}`);
  if (existsSync(oldestPath)) {
    try {
      unlinkSync(oldestPath);
    } catch {
      // Ignore deletion errors
    }
  }

  // Shift existing rotated files
  for (let i = MAX_FILES - 2; i >= 1; i--) {
    const fromPath = join(logsDir, `${baseFilename}.${i}`);
    const toPath = join(logsDir, `${baseFilename}.${i + 1}`);

    if (existsSync(fromPath)) {
      try {
        renameSync(fromPath, toPath);
      } catch {
        // Ignore rename errors
      }
    }
  }

  // Move current log to .1
  if (existsSync(basePath)) {
    try {
      renameSync(basePath, join(logsDir, `${baseFilename}.1`));
    } catch {
      // Ignore rename errors
    }
  }
}

/**
 * Write a log entry to a file (non-blocking via setImmediate).
 */
export function writeToLogFile(filename: string, entry: LogEntry): void {
  setImmediate(() => {
    try {
      // Ensure logs directory exists
      ensureDirectoriesSync();

      const filePath = getLogFilePath(filename);

      // Check if rotation is needed
      rotateLogFile(filename);

      // Append the log entry
      const line = formatLogEntry(entry) + "\n";
      appendFileSync(filePath, line, { mode: 0o600 });
    } catch (error) {
      // Log to console if file write fails
      console.error("[Logger] Failed to write to log file:", error);
    }
  });
}

/**
 * Write a log entry synchronously (for critical errors or shutdown).
 */
export function writeToLogFileSync(filename: string, entry: LogEntry): void {
  try {
    // Ensure logs directory exists
    ensureDirectoriesSync();

    const filePath = getLogFilePath(filename);

    // Check if rotation is needed
    rotateLogFile(filename);

    // Append the log entry
    const line = formatLogEntry(entry) + "\n";
    appendFileSync(filePath, line, { mode: 0o600 });
  } catch (error) {
    // Log to console if file write fails
    console.error("[Logger] Failed to write to log file:", error);
  }
}

// =============================================================================
// LOGGER CLASS
// =============================================================================

/**
 * Logger class for structured logging.
 */
export class Logger {
  private source: string;
  private minLevel: LogLevel;
  private logToConsole: boolean;

  constructor(options: LoggerOptions) {
    this.source = options.source;
    this.minLevel = options.level || getLogLevel();
    this.logToConsole = options.logToConsole ?? false;
  }

  /**
   * Create a log entry and write it to the appropriate files.
   */
  private log(level: LogLevel, message: string, error?: Error): void {
    // Check if we should log this level
    if (!shouldLog(level, this.minLevel)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: formatTimestamp(),
      level,
      source: this.source,
      message,
      error,
    };

    // Determine which log file to use
    const logFile = this.source === "mcp-server" ? MCP_LOG_FILE : APP_LOG_FILE;

    // Write to main log file
    writeToLogFile(logFile, entry);

    // Also write errors to error.log
    if (level === "ERROR") {
      writeToLogFile(ERROR_LOG_FILE, entry);
    }

    // Optionally log to console
    if (this.logToConsole) {
      const formatted = formatLogEntry(entry);
      if (level === "ERROR") {
        console.error(formatted);
      } else if (level === "WARN") {
        console.warn(formatted);
      } else {
        console.log(formatted);
      }
    }
  }

  /**
   * Log a debug message.
   */
  debug(message: string): void {
    this.log("DEBUG", message);
  }

  /**
   * Log an info message.
   */
  info(message: string): void {
    this.log("INFO", message);
  }

  /**
   * Log a warning message.
   */
  warn(message: string, error?: Error): void {
    this.log("WARN", message, error);
  }

  /**
   * Log an error message.
   */
  error(message: string, error?: Error): void {
    this.log("ERROR", message, error);
  }

  /**
   * Set the minimum log level.
   */
  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Enable or disable console logging.
   */
  setConsoleOutput(enabled: boolean): void {
    this.logToConsole = enabled;
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a logger for a specific source.
 */
export function createLogger(source: string, options?: Partial<LoggerOptions>): Logger {
  return new Logger({
    source,
    ...options,
  });
}

/**
 * Create a logger for the MCP server.
 */
export function createMcpLogger(options?: Partial<Omit<LoggerOptions, "source">>): Logger {
  return new Logger({
    source: "mcp-server",
    ...options,
  });
}

/**
 * Create a logger for the CLI.
 */
export function createCliLogger(options?: Partial<Omit<LoggerOptions, "source">>): Logger {
  return new Logger({
    source: "cli",
    ...options,
  });
}

/**
 * Create a logger for the Vite dev server.
 */
export function createViteLogger(options?: Partial<Omit<LoggerOptions, "source">>): Logger {
  return new Logger({
    source: "vite",
    ...options,
  });
}

// =============================================================================
// CONVENIENCE EXPORTS
// =============================================================================

// Default app logger (lazy initialization)
let defaultLogger: Logger | null = null;

/**
 * Get the default application logger.
 */
export function getDefaultLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = createLogger("app");
  }
  return defaultLogger;
}

// Export log file constants for external use
export { APP_LOG_FILE, MCP_LOG_FILE, ERROR_LOG_FILE, MAX_FILE_SIZE, MAX_FILES };
