/**
 * Type declarations for worktree-flags.js
 */

/**
 * Minimal database interface for worktree flag functions.
 * Compatible with better-sqlite3 Database and mock implementations.
 */
export interface WorktreeDb {
  prepare(sql: string): { get(...params: unknown[]): unknown };
}

export interface WorktreeSupportResult {
  enabled: boolean;
  reason: "project" | "global" | "disabled";
}

export interface WorktreeSupportForEpicResult {
  enabled: boolean;
  reason: "epic" | "project" | "global" | "disabled";
  isolationMode: string | null;
}

export interface EffectiveIsolationModeResult {
  mode: "branch" | "worktree";
  source: "requested" | "epic" | "project" | "default" | "fallback_disabled";
}

/**
 * Check if worktree support is enabled for a given project.
 */
export function isWorktreeSupportEnabled(db: WorktreeDb, projectId: string): WorktreeSupportResult;

/**
 * Check if worktree support is enabled for an epic.
 */
export function isWorktreeSupportEnabledForEpic(
  db: WorktreeDb,
  epicId: string
): WorktreeSupportForEpicResult;

/**
 * Get the effective isolation mode for starting an epic.
 */
export function getEffectiveIsolationMode(
  db: WorktreeDb,
  epicId: string,
  requestedMode?: "branch" | "worktree" | null
): EffectiveIsolationModeResult;
