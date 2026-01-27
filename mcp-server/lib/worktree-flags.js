/**
 * Worktree feature flag utilities.
 *
 * Feature flag controls gradual rollout of git worktree support.
 * Worktree support can be enabled:
 * - Globally via settings table (enable_worktree_support)
 * - Per-project via projects.default_isolation_mode (not null = opt-in)
 *
 * @module lib/worktree-flags
 */
import { log } from "./logging.js";

/**
 * Check if worktree support is enabled for a given project.
 *
 * Worktree support is enabled when ANY of the following is true:
 * 1. Project has `defaultIsolationMode` set to "worktree" or "ask"
 * 2. Global settings have `enable_worktree_support = true`
 *
 * This allows both per-project opt-in and global enablement for power users.
 *
 * @param {import("better-sqlite3").Database} db - Database connection
 * @param {string} projectId - Project ID to check
 * @returns {{ enabled: boolean, reason: "project" | "global" | "disabled" }}
 */
export function isWorktreeSupportEnabled(db, projectId) {
  // Check project-level setting first (more specific)
  if (projectId) {
    try {
      const project = db
        .prepare("SELECT default_isolation_mode FROM projects WHERE id = ?")
        .get(projectId);

      if (project?.default_isolation_mode) {
        // "branch" means explicitly using branch mode, not opt-in to worktrees
        // "worktree" or "ask" means worktree support is enabled
        if (
          project.default_isolation_mode === "worktree" ||
          project.default_isolation_mode === "ask"
        ) {
          log.debug(`Worktree support enabled for project ${projectId} via project setting`);
          return { enabled: true, reason: "project" };
        }
        // "branch" means explicitly disabled at project level
        if (project.default_isolation_mode === "branch") {
          log.debug(`Worktree support explicitly disabled for project ${projectId}`);
          return { enabled: false, reason: "disabled" };
        }
      }
    } catch (err) {
      log.warn(`Failed to check project worktree setting for ${projectId}: ${err.message}`);
    }
  }

  // Check global setting as fallback
  try {
    const settings = db
      .prepare("SELECT value FROM settings WHERE key = 'enable_worktree_support'")
      .get();

    if (settings?.value === "true" || settings?.value === "1") {
      log.debug("Worktree support enabled globally via settings");
      return { enabled: true, reason: "global" };
    }
  } catch {
    // Settings table might use id-based lookup instead of key-based
    // Fall through to default (disabled)
    log.debug("No global worktree setting found, defaulting to disabled");
  }

  return { enabled: false, reason: "disabled" };
}

/**
 * Check if worktree support is enabled for an epic.
 *
 * Uses the epic's project to determine worktree support status,
 * and also checks the epic's own isolation_mode setting.
 *
 * @param {import("better-sqlite3").Database} db - Database connection
 * @param {string} epicId - Epic ID to check
 * @returns {{ enabled: boolean, reason: "epic" | "project" | "global" | "disabled", isolationMode: string | null }}
 */
export function isWorktreeSupportEnabledForEpic(db, epicId) {
  try {
    const epic = db
      .prepare("SELECT project_id, isolation_mode FROM epics WHERE id = ?")
      .get(epicId);

    if (!epic) {
      log.warn(`Epic not found: ${epicId}`);
      return { enabled: false, reason: "disabled", isolationMode: null };
    }

    // If epic has explicit isolation mode, that takes precedence
    if (epic.isolation_mode === "worktree") {
      return { enabled: true, reason: "epic", isolationMode: "worktree" };
    }
    if (epic.isolation_mode === "branch") {
      return { enabled: false, reason: "disabled", isolationMode: "branch" };
    }

    // Otherwise, check project-level and global settings
    const projectCheck = isWorktreeSupportEnabled(db, epic.project_id);
    return {
      enabled: projectCheck.enabled,
      reason: projectCheck.reason,
      isolationMode: epic.isolation_mode,
    };
  } catch (err) {
    log.error(`Failed to check epic worktree support for ${epicId}: ${err.message}`);
    return { enabled: false, reason: "disabled", isolationMode: null };
  }
}

/**
 * Get the effective isolation mode for starting an epic.
 *
 * This determines what mode to use when starting work on an epic:
 * - If isolationMode param is provided, use it (if worktrees enabled)
 * - Else use epic.isolation_mode if set
 * - Else use project.default_isolation_mode if set
 * - Else default to "branch" (safe default)
 *
 * @param {import("better-sqlite3").Database} db - Database connection
 * @param {string} epicId - Epic ID
 * @param {string | null} requestedMode - Explicitly requested mode (optional)
 * @returns {{ mode: "branch" | "worktree", source: "requested" | "epic" | "project" | "default" }}
 */
export function getEffectiveIsolationMode(db, epicId, requestedMode = null) {
  // If worktree is explicitly requested, check if it's allowed
  if (requestedMode === "worktree") {
    const check = isWorktreeSupportEnabledForEpic(db, epicId);
    if (check.enabled) {
      return { mode: "worktree", source: "requested" };
    }
    // Worktrees not enabled, fall back to branch
    log.info(`Worktree requested but not enabled, falling back to branch for epic ${epicId}`);
    return { mode: "branch", source: "default" };
  }

  // If branch is explicitly requested, use it
  if (requestedMode === "branch") {
    return { mode: "branch", source: "requested" };
  }

  // Get epic and project settings
  try {
    const epic = db
      .prepare(
        `SELECT e.isolation_mode, e.project_id, p.default_isolation_mode
         FROM epics e
         JOIN projects p ON e.project_id = p.id
         WHERE e.id = ?`
      )
      .get(epicId);

    if (!epic) {
      return { mode: "branch", source: "default" };
    }

    // Epic-level setting takes precedence
    if (epic.isolation_mode === "worktree") {
      const check = isWorktreeSupportEnabledForEpic(db, epicId);
      if (check.enabled) {
        return { mode: "worktree", source: "epic" };
      }
    }
    if (epic.isolation_mode === "branch") {
      return { mode: "branch", source: "epic" };
    }

    // Project-level setting as fallback
    if (epic.default_isolation_mode === "worktree") {
      const check = isWorktreeSupportEnabled(db, epic.project_id);
      if (check.enabled) {
        return { mode: "worktree", source: "project" };
      }
    }
    if (epic.default_isolation_mode === "branch") {
      return { mode: "branch", source: "project" };
    }

    // Default: use branches (safe, no special setup needed)
    return { mode: "branch", source: "default" };
  } catch (err) {
    log.error(`Failed to get effective isolation mode for epic ${epicId}: ${err.message}`);
    return { mode: "branch", source: "default" };
  }
}
