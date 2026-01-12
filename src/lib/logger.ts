import { existsSync, appendFileSync, statSync, renameSync, unlinkSync } from "fs";
import { join } from "path";
import { getLogsDir, ensureDirectoriesSync } from "./xdg";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;
const APP_LOG_FILE = "brain-dumpy.log";
const MCP_LOG_FILE = "mcp-server.log";
const ERROR_LOG_FILE = "error.log";

// PERFORMANCE: Cache file sizes to avoid repeated stat() calls on every log write
// Cache expires after 60 seconds or after rotation
const fileSizeCache: Map<string, { size: number; timestamp: number }> = new Map();
const CACHE_TTL_MS = 60000; // 60 seconds

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

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

export function getLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toUpperCase();
  if (envLevel && isValidLogLevel(envLevel)) {
    return envLevel as LogLevel;
  }
  return "INFO";
}

export function isValidLogLevel(level: string): level is LogLevel {
  return level === "DEBUG" || level === "INFO" || level === "WARN" || level === "ERROR";
}

export function shouldLog(entryLevel: LogLevel, minLevel?: LogLevel): boolean {
  const min = minLevel || getLogLevel();
  return LOG_LEVEL_PRIORITY[entryLevel] >= LOG_LEVEL_PRIORITY[min];
}

export function formatTimestamp(date?: Date): string {
  const d = date || new Date();
  return d.toISOString();
}

export function formatLogEntry(entry: LogEntry): string {
  let line = `${entry.timestamp} [${entry.level}] [${entry.source}] ${entry.message}`;

  if (entry.error) {
    line += `\n  Error: ${entry.error.message}`;
    if (entry.error.stack) {
      const stackLines = entry.error.stack.split("\n").slice(1);
      for (const stackLine of stackLines) {
        line += `\n  ${stackLine.trim()}`;
      }
    }
  }

  return line;
}

export function getLogFilePath(filename: string): string {
  return join(getLogsDir(), filename);
}

export function getRotatedLogPaths(baseFilename: string): string[] {
  const logsDir = getLogsDir();
  const paths: string[] = [];

  paths.push(join(logsDir, baseFilename));

  for (let i = 1; i < MAX_FILES; i++) {
    paths.push(join(logsDir, `${baseFilename}.${i}`));
  }

  return paths;
}

export function needsRotation(filePath: string): boolean {
  if (!existsSync(filePath)) {
    return false;
  }

  // PERFORMANCE: Check cache first to avoid repeated stat() calls
  const now = Date.now();
  const cached = fileSizeCache.get(filePath);
  if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
    return cached.size >= MAX_FILE_SIZE;
  }

  try {
    const stats = statSync(filePath);
    // Update cache
    fileSizeCache.set(filePath, { size: stats.size, timestamp: now });
    return stats.size >= MAX_FILE_SIZE;
  } catch (error) {
    console.error(`[Logger] Failed to check log file size: ${error}`);
    return false;
  }
}

export function rotateLogFile(baseFilename: string): void {
  const logsDir = getLogsDir();
  const basePath = join(logsDir, baseFilename);

  if (!needsRotation(basePath)) {
    return;
  }

  // Clear cache for this file since we're rotating
  fileSizeCache.delete(basePath);

  const oldestPath = join(logsDir, `${baseFilename}.${MAX_FILES - 1}`);
  if (existsSync(oldestPath)) {
    try {
      unlinkSync(oldestPath);
    } catch (error) {
      console.error(`[Logger] Failed to delete oldest log file: ${error}`);
    }
  }

  for (let i = MAX_FILES - 2; i >= 1; i--) {
    const fromPath = join(logsDir, `${baseFilename}.${i}`);
    const toPath = join(logsDir, `${baseFilename}.${i + 1}`);

    if (existsSync(fromPath)) {
      try {
        renameSync(fromPath, toPath);
      } catch (error) {
        console.error(`[Logger] Failed to rotate log file ${fromPath}: ${error}`);
      }
    }
  }

  if (existsSync(basePath)) {
    try {
      renameSync(basePath, join(logsDir, `${baseFilename}.1`));
    } catch (error) {
      console.error(`[Logger] Failed to rotate current log file: ${error}`);
    }
  }
}

export function writeToLogFile(filename: string, entry: LogEntry): void {
  setImmediate(() => {
    try {
      ensureDirectoriesSync();

      const filePath = getLogFilePath(filename);
      rotateLogFile(filename);

      const line = formatLogEntry(entry) + "\n";
      appendFileSync(filePath, line, { mode: 0o600 });

      // PERFORMANCE: Update cache with estimated new size to avoid stat() on next write
      const cached = fileSizeCache.get(filePath);
      if (cached) {
        cached.size += Buffer.byteLength(line, "utf8");
      }
    } catch (error) {
      console.error("[Logger] Failed to write to log file:", error);
    }
  });
}

export function writeToLogFileSync(filename: string, entry: LogEntry): void {
  try {
    ensureDirectoriesSync();

    const filePath = getLogFilePath(filename);
    rotateLogFile(filename);

    const line = formatLogEntry(entry) + "\n";
    appendFileSync(filePath, line, { mode: 0o600 });

    // PERFORMANCE: Update cache with estimated new size to avoid stat() on next write
    const cached = fileSizeCache.get(filePath);
    if (cached) {
      cached.size += Buffer.byteLength(line, "utf8");
    }
  } catch (error) {
    console.error("[Logger] Failed to write to log file:", error);
  }
}

export class Logger {
  private source: string;
  private minLevel: LogLevel;
  private logToConsole: boolean;

  constructor(options: LoggerOptions) {
    this.source = options.source;
    this.minLevel = options.level || getLogLevel();
    this.logToConsole = options.logToConsole ?? false;
  }

  private log(level: LogLevel, message: string, error?: Error): void {
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

    const logFile = this.source === "mcp-server" ? MCP_LOG_FILE : APP_LOG_FILE;
    writeToLogFile(logFile, entry);

    if (level === "ERROR") {
      writeToLogFile(ERROR_LOG_FILE, entry);
    }

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

  debug(message: string): void {
    this.log("DEBUG", message);
  }

  info(message: string): void {
    this.log("INFO", message);
  }

  warn(message: string, error?: Error): void {
    this.log("WARN", message, error);
  }

  error(message: string, error?: Error): void {
    this.log("ERROR", message, error);
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  setConsoleOutput(enabled: boolean): void {
    this.logToConsole = enabled;
  }
}

export function createLogger(source: string, options?: Partial<LoggerOptions>): Logger {
  return new Logger({
    source,
    ...options,
  });
}

export function createMcpLogger(options?: Partial<Omit<LoggerOptions, "source">>): Logger {
  return new Logger({
    source: "mcp-server",
    ...options,
  });
}

export function createCliLogger(options?: Partial<Omit<LoggerOptions, "source">>): Logger {
  return new Logger({
    source: "cli",
    ...options,
  });
}

export function createViteLogger(options?: Partial<Omit<LoggerOptions, "source">>): Logger {
  return new Logger({
    source: "vite",
    ...options,
  });
}

let defaultLogger: Logger | null = null;

export function getDefaultLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = createLogger("app");
  }
  return defaultLogger;
}

export { APP_LOG_FILE, MCP_LOG_FILE, ERROR_LOG_FILE, MAX_FILE_SIZE, MAX_FILES };
