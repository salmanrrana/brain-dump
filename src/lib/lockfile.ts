import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { getStateDir } from "./xdg";

const LOCK_FILE_NAME = "brain-dumpy.lock";

/**
 * Lock file contents structure
 */
export interface LockInfo {
  pid: number;
  startedAt: string;
  type: "mcp-server" | "cli" | "vite";
}

/**
 * Result of checking lock status
 */
export interface LockCheckResult {
  isLocked: boolean;
  lockInfo: LockInfo | null;
  isStale: boolean;
  message: string;
}

/**
 * Get the lock file path.
 */
export function getLockFilePath(): string {
  return join(getStateDir(), LOCK_FILE_NAME);
}

/**
 * Check if a process with the given PID is running.
 */
export function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 doesn't kill the process, just checks if it exists
    process.kill(pid, 0);
    return true;
  } catch (e) {
    const error = e as NodeJS.ErrnoException;
    // ESRCH means process not found, EPERM means process exists but we can't signal it
    return error.code === "EPERM";
  }
}

/**
 * Read the current lock file if it exists.
 */
export function readLockFile(): LockInfo | null {
  const lockPath = getLockFilePath();

  if (!existsSync(lockPath)) {
    return null;
  }

  try {
    const content = readFileSync(lockPath, "utf-8");
    const lockInfo = JSON.parse(content) as LockInfo;

    // Validate the lock info structure
    if (
      typeof lockInfo.pid !== "number" ||
      typeof lockInfo.startedAt !== "string" ||
      !["mcp-server", "cli", "vite"].includes(lockInfo.type)
    ) {
      // Invalid lock file format, treat as no lock
      return null;
    }

    return lockInfo;
  } catch {
    // Corrupted or unreadable lock file
    return null;
  }
}

/**
 * Check if there's an active lock and whether it's stale.
 */
export function checkLock(): LockCheckResult {
  const lockInfo = readLockFile();

  if (!lockInfo) {
    return {
      isLocked: false,
      lockInfo: null,
      isStale: false,
      message: "No lock file found",
    };
  }

  const isRunning = isProcessRunning(lockInfo.pid);

  if (!isRunning) {
    return {
      isLocked: false,
      lockInfo,
      isStale: true,
      message: `Stale lock detected from ${lockInfo.type} (PID ${lockInfo.pid}) - process no longer running`,
    };
  }

  return {
    isLocked: true,
    lockInfo,
    isStale: false,
    message: `Database locked by ${lockInfo.type} (PID ${lockInfo.pid}) started at ${lockInfo.startedAt}`,
  };
}

/**
 * Acquire a lock for database access.
 * Returns true if lock was acquired, false if database is already locked.
 */
export function acquireLock(type: LockInfo["type"]): {
  acquired: boolean;
  message: string;
  lockInfo: LockInfo | null;
} {
  const lockPath = getLockFilePath();
  const check = checkLock();

  // If there's a stale lock, clean it up first
  if (check.isStale) {
    try {
      unlinkSync(lockPath);
      console.error(`[brain-dumpy] Cleaned up stale lock file`);
    } catch {
      // Ignore cleanup errors
    }
  }

  // If there's an active lock from another process, warn but continue
  // SQLite with WAL mode can handle concurrent readers
  if (check.isLocked && check.lockInfo) {
    // Check if this is our own process (re-acquiring)
    if (check.lockInfo.pid === process.pid) {
      return {
        acquired: true,
        message: "Lock already held by this process",
        lockInfo: check.lockInfo,
      };
    }

    // Another process has the lock - warn but don't block
    console.error(
      `[brain-dumpy] Warning: ${check.message}. Concurrent access may cause issues.`
    );
  }

  // Create new lock
  const lockInfo: LockInfo = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    type,
  };

  try {
    writeFileSync(lockPath, JSON.stringify(lockInfo, null, 2), {
      mode: 0o600, // Only owner can read/write
    });

    return {
      acquired: true,
      message: `Lock acquired by ${type} (PID ${process.pid})`,
      lockInfo,
    };
  } catch (e) {
    const error = e as Error;
    return {
      acquired: false,
      message: `Failed to create lock file: ${error.message}`,
      lockInfo: null,
    };
  }
}

/**
 * Release the lock if held by this process.
 */
export function releaseLock(): { released: boolean; message: string } {
  const lockPath = getLockFilePath();
  const lockInfo = readLockFile();

  if (!lockInfo) {
    return {
      released: true,
      message: "No lock to release",
    };
  }

  // Only release if this process owns the lock
  if (lockInfo.pid !== process.pid) {
    return {
      released: false,
      message: `Lock owned by different process (PID ${lockInfo.pid})`,
    };
  }

  try {
    unlinkSync(lockPath);
    return {
      released: true,
      message: "Lock released successfully",
    };
  } catch (e) {
    const error = e as Error;
    return {
      released: false,
      message: `Failed to release lock: ${error.message}`,
    };
  }
}

/**
 * Setup signal handlers for graceful shutdown.
 * Ensures lock file is cleaned up when process terminates.
 *
 * @param cleanupCallback Optional additional cleanup to run before releasing lock
 */
export function setupGracefulShutdown(
  cleanupCallback?: () => Promise<void> | void
): void {
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    console.error(`[brain-dumpy] Received ${signal}, shutting down gracefully`);

    try {
      // Run custom cleanup if provided
      if (cleanupCallback) {
        await cleanupCallback();
      }

      // Release the lock
      const result = releaseLock();
      if (result.released) {
        console.error(`[brain-dumpy] ${result.message}`);
      }
    } catch (e) {
      const error = e as Error;
      console.error(`[brain-dumpy] Error during shutdown: ${error.message}`);
    }

    // Exit with appropriate code
    process.exit(signal === "SIGTERM" || signal === "SIGINT" ? 0 : 1);
  };

  // Handle termination signals
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGQUIT", () => shutdown("SIGQUIT"));

  // Handle uncaught exceptions and unhandled rejections
  process.on("uncaughtException", (error) => {
    console.error(`[brain-dumpy] Uncaught exception:`, error);
    releaseLock();
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    console.error(`[brain-dumpy] Unhandled rejection:`, reason);
    releaseLock();
    process.exit(1);
  });

  // Handle normal exit
  process.on("exit", () => {
    // Synchronous cleanup only - async won't work in exit handler
    const lockInfo = readLockFile();
    if (lockInfo && lockInfo.pid === process.pid) {
      try {
        unlinkSync(getLockFilePath());
      } catch {
        // Ignore errors during exit
      }
    }
  });
}

/**
 * Synchronous version of lock acquisition for startup.
 * Combines directory check, lock acquisition, and signal setup.
 */
export function initializeLockSync(
  type: LockInfo["type"],
  cleanupCallback?: () => void
): { acquired: boolean; message: string } {
  // Ensure state directory exists (lockfile lives there)
  const stateDir = getStateDir();
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  }

  // Acquire lock
  const result = acquireLock(type);

  if (result.acquired) {
    // Setup signal handlers for cleanup
    setupGracefulShutdown(cleanupCallback);
  }

  return result;
}
