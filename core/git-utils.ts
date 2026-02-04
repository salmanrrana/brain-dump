/**
 * Git utilities for the core business logic layer.
 *
 * Pure functions for branch naming and slug generation, plus a
 * `createRealGitOperations()` factory that wraps `execSync` into
 * the `GitOperations` interface from core/types.ts.
 *
 * Consumers inject `GitOperations` so tests can provide mocks.
 */

import { execSync, execFileSync } from "child_process";
import type { GitCommandResult, GitOperations } from "./types.ts";

// ============================================
// Pure helpers
// ============================================

/** Convert text to a URL-safe slug (max 50 chars). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
}

/** First 8 characters of a UUID. */
export function shortId(uuid: string): string {
  return uuid.substring(0, 8);
}

/** Generate `feature/{shortId}-{slug}` branch name for a ticket. */
export function generateBranchName(ticketId: string, ticketTitle: string): string {
  return `feature/${shortId(ticketId)}-${slugify(ticketTitle)}`;
}

/** Generate `feature/epic-{shortId}-{slug}` branch name for an epic. */
export function generateEpicBranchName(epicId: string, epicTitle: string): string {
  return `feature/epic-${shortId(epicId)}-${slugify(epicTitle)}`;
}

// ============================================
// GitOperations factory (real implementation)
// ============================================

/** Run a git command via `execSync` (shell string) and return a structured result. */
export function runGitCommand(command: string, cwd: string): GitCommandResult {
  try {
    const output = execSync(command, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    return { success: true, output: output.trim() };
  } catch (error) {
    const err = error as { stderr?: string; message: string };
    return { success: false, output: "", error: err.stderr?.trim() || err.message };
  }
}

/** Run git with argument array via `execFileSync` (no shell interpretation — safe from injection). */
function runGitArgs(args: string[], cwd: string): GitCommandResult {
  try {
    const output = execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { success: true, output: output.trim() };
  } catch (error) {
    const err = error as { stderr?: string; message: string };
    return { success: false, output: "", error: err.stderr?.trim() || err.message };
  }
}

/**
 * Create real `GitOperations` backed by `execFileSync` (argument arrays).
 * The `run` method still uses `execSync` for arbitrary commands (e.g., piped git log).
 * Branch-specific methods use `execFileSync` to avoid shell injection.
 * Use in production code; tests should provide a mock instead.
 */
export function createRealGitOperations(): GitOperations {
  return {
    run: runGitCommand,
    branchExists(branchName: string, cwd: string): boolean {
      return runGitArgs(["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], cwd)
        .success;
    },
    checkout(branchName: string, cwd: string): GitCommandResult {
      return runGitArgs(["checkout", branchName], cwd);
    },
    createBranch(branchName: string, cwd: string): GitCommandResult {
      return runGitArgs(["checkout", "-b", branchName], cwd);
    },
  };
}

// ============================================
// Higher-level git helpers
// ============================================

/** Detect whether the base branch is `main` or `master`. Defaults to `main`. */
export function findBaseBranch(git: GitOperations, cwd: string): string {
  if (git.branchExists("main", cwd)) return "main";
  if (git.branchExists("master", cwd)) return "master";
  return "main"; // fall back even if neither exists
}
