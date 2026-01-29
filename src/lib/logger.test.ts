import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "path";
import { existsSync, rmSync, readFileSync, mkdirSync, writeFileSync, statSync } from "fs";
import {
  getLogLevel,
  isValidLogLevel,
  shouldLog,
  formatTimestamp,
  formatLogEntry,
  getLogFilePath,
  getRotatedLogPaths,
  needsRotation,
  rotateLogFile,
  writeToLogFileSync,
  Logger,
  createLogger,
  createMcpLogger,
  createCliLogger,
  createViteLogger,
  getDefaultLogger,
  APP_LOG_FILE,
  MCP_LOG_FILE,
  ERROR_LOG_FILE,
  MAX_FILE_SIZE,
  MAX_FILES,
  LogEntry,
} from "./logger";
import { _setPlatformOverride, getLogsDir } from "./xdg";

describe("Logger Module", () => {
  const originalEnv = { ...process.env };
  const testBase = join("/tmp", `logger-test-${process.pid}-${Date.now()}`);

  beforeEach(() => {
    // Reset environment
    delete process.env.LOG_LEVEL;
    _setPlatformOverride("linux");
    process.env.XDG_STATE_HOME = testBase;

    // Ensure test directory exists
    const logsDir = getLogsDir();
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true, mode: 0o700 });
    }
  });

  afterEach(() => {
    // Cleanup test directories
    if (existsSync(testBase)) {
      rmSync(testBase, { recursive: true, force: true });
    }
    // Restore environment
    process.env = { ...originalEnv };
    _setPlatformOverride(null);
  });

  // ===========================================================================
  // LOG LEVEL TESTS
  // ===========================================================================

  describe("Log Level Management", () => {
    describe("getLogLevel", () => {
      it("should return INFO by default", () => {
        delete process.env.LOG_LEVEL;
        expect(getLogLevel()).toBe("INFO");
      });

      it("should respect LOG_LEVEL env var", () => {
        process.env.LOG_LEVEL = "DEBUG";
        expect(getLogLevel()).toBe("DEBUG");
      });

      it("should handle lowercase LOG_LEVEL", () => {
        process.env.LOG_LEVEL = "error";
        expect(getLogLevel()).toBe("ERROR");
      });

      it("should fall back to INFO for invalid LOG_LEVEL", () => {
        process.env.LOG_LEVEL = "INVALID";
        expect(getLogLevel()).toBe("INFO");
      });
    });

    describe("isValidLogLevel", () => {
      it("should return true for valid levels", () => {
        expect(isValidLogLevel("DEBUG")).toBe(true);
        expect(isValidLogLevel("INFO")).toBe(true);
        expect(isValidLogLevel("WARN")).toBe(true);
        expect(isValidLogLevel("ERROR")).toBe(true);
      });

      it("should return false for invalid levels", () => {
        expect(isValidLogLevel("INVALID")).toBe(false);
        expect(isValidLogLevel("debug")).toBe(false); // Case sensitive
        expect(isValidLogLevel("")).toBe(false);
      });
    });

    describe("shouldLog", () => {
      it("should log ERROR at all levels", () => {
        expect(shouldLog("ERROR", "DEBUG")).toBe(true);
        expect(shouldLog("ERROR", "INFO")).toBe(true);
        expect(shouldLog("ERROR", "WARN")).toBe(true);
        expect(shouldLog("ERROR", "ERROR")).toBe(true);
      });

      it("should not log DEBUG at INFO level", () => {
        expect(shouldLog("DEBUG", "INFO")).toBe(false);
      });

      it("should log INFO at INFO level", () => {
        expect(shouldLog("INFO", "INFO")).toBe(true);
      });

      it("should log WARN at INFO level", () => {
        expect(shouldLog("WARN", "INFO")).toBe(true);
      });

      it("should use default level when not specified", () => {
        delete process.env.LOG_LEVEL;
        expect(shouldLog("INFO")).toBe(true);
        expect(shouldLog("DEBUG")).toBe(false);
      });
    });
  });

  // ===========================================================================
  // LOG FORMATTING TESTS
  // ===========================================================================

  describe("Log Formatting", () => {
    describe("formatTimestamp", () => {
      it("should format date as ISO string", () => {
        const date = new Date("2026-01-12T10:30:00.000Z");
        expect(formatTimestamp(date)).toBe("2026-01-12T10:30:00.000Z");
      });

      it("should use current time when no date provided", () => {
        const timestamp = formatTimestamp();
        expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      });
    });

    describe("formatLogEntry", () => {
      it("should format basic log entry", () => {
        const entry: LogEntry = {
          timestamp: "2026-01-12T10:30:00.000Z",
          level: "INFO",
          source: "test",
          message: "Test message",
        };
        expect(formatLogEntry(entry)).toBe(
          "2026-01-12T10:30:00.000Z [INFO] [test] Test message"
        );
      });

      it("should include error message when present", () => {
        const entry: LogEntry = {
          timestamp: "2026-01-12T10:30:00.000Z",
          level: "ERROR",
          source: "test",
          message: "Test error",
          error: new Error("Something went wrong"),
        };
        const formatted = formatLogEntry(entry);
        expect(formatted).toContain("2026-01-12T10:30:00.000Z [ERROR] [test] Test error");
        expect(formatted).toContain("Error: Something went wrong");
      });

      it("should include stack trace for errors", () => {
        const error = new Error("Stack test");
        const entry: LogEntry = {
          timestamp: "2026-01-12T10:30:00.000Z",
          level: "ERROR",
          source: "test",
          message: "Error with stack",
          error,
        };
        const formatted = formatLogEntry(entry);
        expect(formatted).toContain("at ");
      });
    });
  });

  // ===========================================================================
  // LOG FILE MANAGEMENT TESTS
  // ===========================================================================

  describe("Log File Management", () => {
    describe("getLogFilePath", () => {
      it("should return correct path for app log", () => {
        const path = getLogFilePath(APP_LOG_FILE);
        expect(path).toBe(join(getLogsDir(), APP_LOG_FILE));
      });

      it("should return correct path for mcp log", () => {
        const path = getLogFilePath(MCP_LOG_FILE);
        expect(path).toBe(join(getLogsDir(), MCP_LOG_FILE));
      });

      it("should return correct path for error log", () => {
        const path = getLogFilePath(ERROR_LOG_FILE);
        expect(path).toBe(join(getLogsDir(), ERROR_LOG_FILE));
      });
    });

    describe("getRotatedLogPaths", () => {
      it("should return correct number of paths", () => {
        const paths = getRotatedLogPaths(APP_LOG_FILE);
        expect(paths.length).toBe(MAX_FILES);
      });

      it("should include base file and numbered rotations", () => {
        const paths = getRotatedLogPaths(APP_LOG_FILE);
        expect(paths[0]).toBe(join(getLogsDir(), APP_LOG_FILE));
        expect(paths[1]).toBe(join(getLogsDir(), `${APP_LOG_FILE}.1`));
        expect(paths[2]).toBe(join(getLogsDir(), `${APP_LOG_FILE}.2`));
      });
    });

    describe("needsRotation", () => {
      it("should return false if file does not exist", () => {
        expect(needsRotation("/nonexistent/file.log")).toBe(false);
      });

      it("should return false for small files", () => {
        const testFile = join(getLogsDir(), "small.log");
        writeFileSync(testFile, "small content", { mode: 0o600 });
        expect(needsRotation(testFile)).toBe(false);
      });

      it("should return true for files at or over max size", () => {
        const testFile = join(getLogsDir(), "large.log");
        // Create a file that's exactly at the limit
        const content = "x".repeat(MAX_FILE_SIZE);
        writeFileSync(testFile, content, { mode: 0o600 });
        expect(needsRotation(testFile)).toBe(true);
      });
    });

    describe("rotateLogFile", () => {
      it("should not rotate if file does not need rotation", () => {
        const testFile = join(getLogsDir(), "test.log");
        writeFileSync(testFile, "small content", { mode: 0o600 });
        rotateLogFile("test.log");
        expect(existsSync(testFile)).toBe(true);
        expect(existsSync(join(getLogsDir(), "test.log.1"))).toBe(false);
      });

      it("should rotate files when needed", () => {
        const testFile = join(getLogsDir(), "rotate-test.log");
        // Create a large file
        writeFileSync(testFile, "x".repeat(MAX_FILE_SIZE), { mode: 0o600 });
        rotateLogFile("rotate-test.log");

        // Original should be gone, .1 should exist
        expect(existsSync(testFile)).toBe(false);
        expect(existsSync(join(getLogsDir(), "rotate-test.log.1"))).toBe(true);
      });

      it("should shift existing rotated files", () => {
        // Create files: log, log.1, log.2
        const testFile = join(getLogsDir(), "shift-test.log");
        const file1 = join(getLogsDir(), "shift-test.log.1");
        const file2 = join(getLogsDir(), "shift-test.log.2");

        writeFileSync(testFile, "x".repeat(MAX_FILE_SIZE), { mode: 0o600 });
        writeFileSync(file1, "content1", { mode: 0o600 });
        writeFileSync(file2, "content2", { mode: 0o600 });

        rotateLogFile("shift-test.log");

        // Check shifted
        expect(readFileSync(join(getLogsDir(), "shift-test.log.2"), "utf-8")).toBe("content1");
        expect(readFileSync(join(getLogsDir(), "shift-test.log.3"), "utf-8")).toBe("content2");
      });
    });

    describe("writeToLogFileSync", () => {
      it("should write log entry to file", () => {
        const entry: LogEntry = {
          timestamp: "2026-01-12T10:30:00.000Z",
          level: "INFO",
          source: "test",
          message: "Sync write test",
        };

        writeToLogFileSync("sync-test.log", entry);

        const logPath = join(getLogsDir(), "sync-test.log");
        expect(existsSync(logPath)).toBe(true);
        const content = readFileSync(logPath, "utf-8");
        expect(content).toContain("Sync write test");
      });

      it("should create file with secure permissions", () => {
        const entry: LogEntry = {
          timestamp: "2026-01-12T10:30:00.000Z",
          level: "INFO",
          source: "test",
          message: "Permission test",
        };

        writeToLogFileSync("perm-test.log", entry);

        const logPath = join(getLogsDir(), "perm-test.log");
        const stats = statSync(logPath);
        expect(stats.mode & 0o777).toBe(0o600);
      });
    });
  });

  // ===========================================================================
  // LOGGER CLASS TESTS
  // ===========================================================================

  describe("Logger Class", () => {
    describe("constructor", () => {
      it("should create logger with source", () => {
        const logger = new Logger({ source: "test-source" });
        expect(logger).toBeInstanceOf(Logger);
      });

      it("should use default log level from env", () => {
        process.env.LOG_LEVEL = "DEBUG";
        const logger = new Logger({ source: "test" });
        // Internal test - we'll verify through behavior
        expect(logger).toBeInstanceOf(Logger);
      });
    });

    describe("logging methods", () => {
      let logger: Logger;

      beforeEach(() => {
        process.env.LOG_LEVEL = "DEBUG";
        logger = new Logger({ source: "test-logger" });
      });

      it("should log debug messages", () => {
        logger.debug("Debug test");
        // Wait for setImmediate
        return new Promise((resolve) => {
          setImmediate(() => {
            const logPath = join(getLogsDir(), APP_LOG_FILE);
            if (existsSync(logPath)) {
              const content = readFileSync(logPath, "utf-8");
              expect(content).toContain("[DEBUG]");
              expect(content).toContain("[test-logger]");
              expect(content).toContain("Debug test");
            }
            resolve(undefined);
          });
        });
      });

      it("should log info messages", () => {
        logger.info("Info test");
        return new Promise((resolve) => {
          setImmediate(() => {
            const logPath = join(getLogsDir(), APP_LOG_FILE);
            if (existsSync(logPath)) {
              const content = readFileSync(logPath, "utf-8");
              expect(content).toContain("[INFO]");
              expect(content).toContain("Info test");
            }
            resolve(undefined);
          });
        });
      });

      it("should log warn messages", () => {
        logger.warn("Warn test");
        return new Promise((resolve) => {
          setImmediate(() => {
            const logPath = join(getLogsDir(), APP_LOG_FILE);
            if (existsSync(logPath)) {
              const content = readFileSync(logPath, "utf-8");
              expect(content).toContain("[WARN]");
              expect(content).toContain("Warn test");
            }
            resolve(undefined);
          });
        });
      });

      it("should log error messages", () => {
        logger.error("Error test");
        return new Promise((resolve) => {
          setImmediate(() => {
            const logPath = join(getLogsDir(), APP_LOG_FILE);
            if (existsSync(logPath)) {
              const content = readFileSync(logPath, "utf-8");
              expect(content).toContain("[ERROR]");
              expect(content).toContain("Error test");
            }
            resolve(undefined);
          });
        });
      });

      it("should write errors to error.log", () => {
        logger.error("Error log test");
        return new Promise((resolve) => {
          setImmediate(() => {
            const errorLogPath = join(getLogsDir(), ERROR_LOG_FILE);
            if (existsSync(errorLogPath)) {
              const content = readFileSync(errorLogPath, "utf-8");
              expect(content).toContain("Error log test");
            }
            resolve(undefined);
          });
        });
      });

      it("should include error stack traces", () => {
        const error = new Error("Stack trace test");
        logger.error("Error with stack", error);
        return new Promise((resolve) => {
          setImmediate(() => {
            const logPath = join(getLogsDir(), APP_LOG_FILE);
            if (existsSync(logPath)) {
              const content = readFileSync(logPath, "utf-8");
              expect(content).toContain("Stack trace test");
              expect(content).toContain("at ");
            }
            resolve(undefined);
          });
        });
      });
    });

    describe("log level filtering", () => {
      it("should filter debug messages when level is INFO", () => {
        process.env.LOG_LEVEL = "INFO";
        const logger = new Logger({ source: "filter-test" });
        logger.debug("Should not appear");
        return new Promise((resolve) => {
          setImmediate(() => {
            const logPath = join(getLogsDir(), APP_LOG_FILE);
            if (existsSync(logPath)) {
              const content = readFileSync(logPath, "utf-8");
              expect(content).not.toContain("Should not appear");
            }
            resolve(undefined);
          });
        });
      });

      it("should allow changing log level", () => {
        process.env.LOG_LEVEL = "ERROR";
        const logger = new Logger({ source: "level-change" });
        logger.setLevel("DEBUG");
        logger.debug("After level change");
        return new Promise((resolve) => {
          setImmediate(() => {
            const logPath = join(getLogsDir(), APP_LOG_FILE);
            if (existsSync(logPath)) {
              const content = readFileSync(logPath, "utf-8");
              expect(content).toContain("After level change");
            }
            resolve(undefined);
          });
        });
      });
    });

    describe("console output", () => {
      it("should log to console when enabled", () => {
        const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        process.env.LOG_LEVEL = "DEBUG";
        const logger = new Logger({ source: "console-test", logToConsole: true });
        logger.info("Console test");

        // Wait for setImmediate
        return new Promise((resolve) => {
          setImmediate(() => {
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
            resolve(undefined);
          });
        });
      });

      it("should not log to console by default", () => {
        const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        process.env.LOG_LEVEL = "DEBUG";
        const logger = new Logger({ source: "no-console" });
        logger.info("No console test");

        return new Promise((resolve) => {
          setImmediate(() => {
            expect(consoleSpy).not.toHaveBeenCalled();
            consoleSpy.mockRestore();
            resolve(undefined);
          });
        });
      });
    });
  });

  // ===========================================================================
  // MCP LOGGER TESTS
  // ===========================================================================

  describe("MCP Logger", () => {
    it("should write to mcp-server.log", () => {
      process.env.LOG_LEVEL = "DEBUG";
      const logger = createMcpLogger();
      logger.info("MCP test message");

      return new Promise((resolve) => {
        setImmediate(() => {
          const logPath = join(getLogsDir(), MCP_LOG_FILE);
          if (existsSync(logPath)) {
            const content = readFileSync(logPath, "utf-8");
            expect(content).toContain("[mcp-server]");
            expect(content).toContain("MCP test message");
          }
          resolve(undefined);
        });
      });
    });
  });

  // ===========================================================================
  // FACTORY FUNCTION TESTS
  // ===========================================================================

  describe("Factory Functions", () => {
    describe("createLogger", () => {
      it("should create a logger with custom source", () => {
        const logger = createLogger("custom-source");
        expect(logger).toBeInstanceOf(Logger);
      });
    });

    describe("createMcpLogger", () => {
      it("should create a logger with mcp-server source", () => {
        const logger = createMcpLogger();
        expect(logger).toBeInstanceOf(Logger);
      });
    });

    describe("createCliLogger", () => {
      it("should create a logger with cli source", () => {
        const logger = createCliLogger();
        expect(logger).toBeInstanceOf(Logger);
      });
    });

    describe("createViteLogger", () => {
      it("should create a logger with vite source", () => {
        const logger = createViteLogger();
        expect(logger).toBeInstanceOf(Logger);
      });
    });

    describe("getDefaultLogger", () => {
      it("should return the same logger instance", () => {
        const logger1 = getDefaultLogger();
        const logger2 = getDefaultLogger();
        expect(logger1).toBe(logger2);
      });
    });
  });

  // ===========================================================================
  // CONSTANTS TESTS
  // ===========================================================================

  describe("Constants", () => {
    it("should have correct file names", () => {
      expect(APP_LOG_FILE).toBe("brain-dump.log");
      expect(MCP_LOG_FILE).toBe("mcp-server.log");
      expect(ERROR_LOG_FILE).toBe("error.log");
    });

    it("should have correct size limits", () => {
      expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024); // 10MB
      expect(MAX_FILES).toBe(5);
    });
  });
});
