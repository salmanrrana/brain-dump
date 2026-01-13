/**
 * Lock file management for Brain Dump MCP server.
 * Prevents concurrent database access issues with PID-based locking.
 * @module lib/lock
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { log } from "./logging.js";
import { getLockFilePath } from "./xdg.js";

/**
 * Check if a process is running by PID.
 * @param {number} pid - Process ID to check
 * @returns {boolean} True if process is running
 */
export function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

/**
 * Read and parse the lock file.
 * @returns {{pid: number, startedAt: string, type: string}|null}
 */
export function readLockFile() {
  const lockPath = getLockFilePath();
  if (!existsSync(lockPath)) return null;
  try {
    const content = readFileSync(lockPath, "utf-8");
    const lockInfo = JSON.parse(content);
    if (
      typeof lockInfo.pid !== "number" ||
      typeof lockInfo.startedAt !== "string" ||
      !["mcp-server", "cli", "vite"].includes(lockInfo.type)
    ) {
      return null;
    }
    return lockInfo;
  } catch {
    return null;
  }
}

/**
 * Check lock status and detect stale locks.
 * @returns {{isLocked: boolean, lockInfo: object|null, isStale: boolean, message: string}}
 */
export function checkLock() {
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
 * @returns {boolean} True if locked by another process
 */
export function isLocked() {
  const check = checkLock();
  return check.isLocked && check.lockInfo?.pid !== process.pid;
}

/**
 * Acquire the lock file for this process.
 * @param {"mcp-server"|"cli"|"vite"} type - Process type
 * @returns {{acquired: boolean, message: string, lockInfo: object|null}}
 */
export function acquireLock(type) {
  const lockPath = getLockFilePath();
  const check = checkLock();

  // Clean up stale locks
  if (check.isStale) {
    try {
      unlinkSync(lockPath);
      log.info("Cleaned up stale lock file");
    } catch { /* ignore */ }
  }

  // Warn if another process has lock (don't block - SQLite WAL handles concurrency)
  if (check.isLocked && check.lockInfo && check.lockInfo.pid !== process.pid) {
    log.info(`Warning: ${check.message}. Concurrent access may cause issues.`);
  }

  // Create lock
  const lockInfo = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    type,
  };

  try {
    writeFileSync(lockPath, JSON.stringify(lockInfo, null, 2), { mode: 0o600 });
    return { acquired: true, message: `Lock acquired by ${type} (PID ${process.pid})`, lockInfo };
  } catch (e) {
    return { acquired: false, message: `Failed to create lock: ${e.message}`, lockInfo: null };
  }
}

/**
 * Release the lock file if owned by this process.
 * @returns {{released: boolean, message: string}}
 */
export function releaseLock() {
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
    return { released: false, message: `Failed to release: ${e.message}` };
  }
}
