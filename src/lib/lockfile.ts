import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { getStateDir } from "./xdg";

const LOCK_FILE_NAME = "brain-dumpy.lock";

export interface LockInfo {
  pid: number;
  startedAt: string;
  type: "mcp-server" | "cli" | "vite";
}

export interface LockCheckResult {
  isLocked: boolean;
  lockInfo: LockInfo | null;
  isStale: boolean;
  message: string;
}

export function getLockFilePath(): string {
  return join(getStateDir(), LOCK_FILE_NAME);
}

export function isProcessRunning(pid: number): boolean {
  try {
    // Signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch (e) {
    const error = e as NodeJS.ErrnoException;
    // EPERM means process exists but we can't signal it
    return error.code === "EPERM";
  }
}

export function readLockFile(): LockInfo | null {
  const lockPath = getLockFilePath();

  if (!existsSync(lockPath)) {
    return null;
  }

  try {
    const content = readFileSync(lockPath, "utf-8");
    const lockInfo = JSON.parse(content) as LockInfo;

    if (
      typeof lockInfo.pid !== "number" ||
      typeof lockInfo.startedAt !== "string" ||
      !["mcp-server", "cli", "vite"].includes(lockInfo.type)
    ) {
      return null;
    }

    return lockInfo;
  } catch (error) {
    console.error(`[Lockfile] Failed to read lock file: ${error}`);
    return null;
  }
}

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

export function acquireLock(type: LockInfo["type"]): {
  acquired: boolean;
  message: string;
  lockInfo: LockInfo | null;
} {
  const lockPath = getLockFilePath();
  const check = checkLock();

  if (check.isStale) {
    try {
      unlinkSync(lockPath);
      console.error(`[brain-dumpy] Cleaned up stale lock file`);
    } catch (error) {
      console.error(`[Lockfile] Failed to cleanup stale lock file: ${error}`);
    }
  }

  // SQLite with WAL mode can handle concurrent readers
  if (check.isLocked && check.lockInfo) {
    if (check.lockInfo.pid === process.pid) {
      return {
        acquired: true,
        message: "Lock already held by this process",
        lockInfo: check.lockInfo,
      };
    }

    console.error(
      `[brain-dumpy] Warning: ${check.message}. Concurrent access may cause issues.`
    );
  }

  const lockInfo: LockInfo = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    type,
  };

  try {
    writeFileSync(lockPath, JSON.stringify(lockInfo, null, 2), {
      mode: 0o600,
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

export function releaseLock(): { released: boolean; message: string } {
  const lockPath = getLockFilePath();
  const lockInfo = readLockFile();

  if (!lockInfo) {
    return {
      released: true,
      message: "No lock to release",
    };
  }

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

/** Ensures lock file is cleaned up when process terminates. */
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
      if (cleanupCallback) {
        await cleanupCallback();
      }

      const result = releaseLock();
      if (result.released) {
        console.error(`[brain-dumpy] ${result.message}`);
      }
    } catch (e) {
      const error = e as Error;
      console.error(`[brain-dumpy] Error during shutdown: ${error.message}`);
    }

    process.exit(signal === "SIGTERM" || signal === "SIGINT" ? 0 : 1);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGQUIT", () => shutdown("SIGQUIT"));

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

  process.on("exit", () => {
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

export function initializeLockSync(
  type: LockInfo["type"],
  cleanupCallback?: () => void
): { acquired: boolean; message: string } {
  const stateDir = getStateDir();
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  }

  const result = acquireLock(type);

  if (result.acquired) {
    setupGracefulShutdown(cleanupCallback);
  }

  return result;
}
