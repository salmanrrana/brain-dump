/**
 * Lock file management for Brain Dump MCP server.
 * Prevents concurrent database access issues with PID-based locking.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { log } from "./logging.js";
import { getLockFilePath } from "./xdg.js";

type ProcessType = "mcp-server" | "cli" | "vite";

interface LockInfo {
  pid: number;
  startedAt: string;
  type: ProcessType;
}

interface LockCheck {
  isLocked: boolean;
  lockInfo: LockInfo | null;
  isStale: boolean;
  message: string;
}

interface LockResult {
  acquired: boolean;
  message: string;
  lockInfo: LockInfo | null;
}

interface ReleaseResult {
  released: boolean;
  message: string;
}

/**
 * Check if a process is running by PID.
 */
export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    return err.code === "EPERM";
  }
}

/**
 * Read and parse the lock file.
 */
export function readLockFile(): LockInfo | null {
  const lockPath = getLockFilePath();
  if (!existsSync(lockPath)) return null;
  try {
    const content = readFileSync(lockPath, "utf-8");
    const lockInfo = JSON.parse(content) as unknown;
    if (
      typeof (lockInfo as Record<string, unknown>).pid !== "number" ||
      typeof (lockInfo as Record<string, unknown>).startedAt !== "string" ||
      !["mcp-server", "cli", "vite"].includes((lockInfo as Record<string, unknown>).type as string)
    ) {
      return null;
    }
    return lockInfo as LockInfo;
  } catch (err) {
    log.warn(
      "Could not read lock file, treating as no lock",
      err instanceof Error ? err : new Error(String(err))
    );
    return null;
  }
}

/**
 * Check lock status and detect stale locks.
 */
export function checkLock(): LockCheck {
  const lockInfo = readLockFile();
  if (!lockInfo) {
    return { isLocked: false, lockInfo: null, isStale: false, message: "No lock file found" };
  }
  const isRunning = isProcessRunning(lockInfo.pid);
  if (!isRunning) {
    return {
      isLocked: false,
      lockInfo,
      isStale: true,
      message: `Stale lock detected from ${lockInfo.type} (PID ${lockInfo.pid})`,
    };
  }
  return {
    isLocked: true,
    lockInfo,
    isStale: false,
    message: `Database locked by ${lockInfo.type} (PID ${lockInfo.pid})`,
  };
}

/**
 * Check if the database is currently locked.
 */
export function isLocked(): boolean {
  const check = checkLock();
  return check.isLocked && check.lockInfo?.pid !== process.pid;
}

/**
 * Acquire the lock file for this process.
 */
export function acquireLock(type: ProcessType): LockResult {
  const lockPath = getLockFilePath();
  const check = checkLock();

  // Clean up stale locks
  if (check.isStale) {
    try {
      unlinkSync(lockPath);
      log.info("Cleaned up stale lock file");
    } catch (err) {
      log.warn(
        "Failed to clean up stale lock file, continuing anyway",
        err instanceof Error ? err : new Error(String(err))
      );
    }
  }

  // Warn if another process has lock (don't block - SQLite WAL handles concurrency)
  if (check.isLocked && check.lockInfo && check.lockInfo.pid !== process.pid) {
    log.info(`Warning: ${check.message}. Concurrent access may cause issues.`);
  }

  // Create lock
  const lockInfo: LockInfo = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    type,
  };

  try {
    writeFileSync(lockPath, JSON.stringify(lockInfo, null, 2), { mode: 0o600 });
    return { acquired: true, message: `Lock acquired by ${type} (PID ${process.pid})`, lockInfo };
  } catch (e) {
    const err = e as Error;
    return { acquired: false, message: `Failed to create lock: ${err.message}`, lockInfo: null };
  }
}

/**
 * Release the lock file if owned by this process.
 */
export function releaseLock(): ReleaseResult {
  const lockPath = getLockFilePath();
  const lockInfo = readLockFile();
  if (!lockInfo) return { released: true, message: "No lock to release" };
  if (lockInfo.pid !== process.pid) {
    return { released: false, message: `Lock owned by PID ${lockInfo.pid}` };
  }
  try {
    unlinkSync(lockPath);
    return { released: true, message: "Lock released successfully" };
  } catch (e) {
    const err = e as Error;
    return { released: false, message: `Failed to release: ${err.message}` };
  }
}
