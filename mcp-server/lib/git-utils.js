/**
 * Git utilities for Brain Dump MCP server.
 * @module lib/git-utils
 */
import { execFileSync } from "child_process";
import { log } from "./logging.js";

/**
 * Safely run a git command using argument arrays (immune to command injection).
 *
 * This function uses execFileSync with argument arrays, preventing shell
 * metacharacter injection attacks.
 *
 * @param {string[]} args - Array of git command arguments (without 'git' prefix)
 * @param {string} cwd - Working directory for the command
 * @param {object} [options] - Optional configuration
 * @param {number} [options.maxBuffer=10485760] - Maximum buffer size (default 10MB)
 * @param {number} [options.timeout] - Optional timeout in milliseconds
 * @returns {{ success: boolean, output: string, error?: string }}
 *
 * @example
 * // Safe - no injection possible
 * runGitCommandSafe(["worktree", "add", worktreePath, "-b", branchName], cwd);
 *
 * // Even with malicious input, this is safe:
 * const epicTitle = "; rm -rf /";
 * runGitCommandSafe(["branch", "-m", epicTitle], cwd); // Won't execute rm
 */
export function runGitCommandSafe(args, cwd, options = {}) {
  // Validate args is an array
  if (!Array.isArray(args)) {
    return {
      success: false,
      output: "",
      error: "Invalid arguments: expected array of git command arguments",
    };
  }

  // Validate cwd is provided
  if (!cwd || typeof cwd !== "string") {
    return {
      success: false,
      output: "",
      error: "Invalid working directory: cwd must be a non-empty string",
    };
  }

  const { maxBuffer = 10 * 1024 * 1024, timeout } = options;

  try {
    const execOptions = {
      cwd,
      encoding: "utf-8",
      maxBuffer,
      // Don't use shell - this is the key security feature
      // execFileSync doesn't spawn a shell by default
    };

    if (timeout !== undefined) {
      execOptions.timeout = timeout;
    }

    const output = execFileSync("git", args, execOptions);
    return { success: true, output: output.trim() };
  } catch (error) {
    // Extract meaningful error information
    let errorMessage = error.message;

    // If stderr is available, prefer it (git outputs errors to stderr)
    if (error.stderr && typeof error.stderr === "string" && error.stderr.trim()) {
      errorMessage = error.stderr.trim();
    }
    // Handle buffer output (when stdio is inherited or captured differently)
    else if (error.stderr && Buffer.isBuffer(error.stderr)) {
      errorMessage = error.stderr.toString("utf-8").trim() || error.message;
    }

    // Handle specific error cases with helpful messages
    if (error.code === "ENOENT") {
      errorMessage = "Git is not installed or not in PATH";
    } else if (error.code === "ETIMEDOUT") {
      errorMessage = `Git command timed out after ${timeout}ms`;
    } else if (error.killed) {
      errorMessage = "Git command was terminated (possibly due to timeout or signal)";
    }

    // Log failed git commands for debugging and audit trail
    log.debug(`Git command failed: git ${args.join(" ")} in ${cwd} - ${errorMessage}`);

    return { success: false, output: "", error: errorMessage };
  }
}

/**
 * Convert text to a URL-safe slug.
 * @param {string} text - Text to slugify
 * @returns {string}
 */
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
}

/**
 * Get short ID from UUID (first 8 chars).
 * @param {string} uuid - Full UUID
 * @returns {string}
 */
export function shortId(uuid) {
  return uuid.substring(0, 8);
}

/**
 * Generate a feature branch name from ticket info.
 * @param {string} ticketId - Ticket UUID
 * @param {string} ticketTitle - Ticket title
 * @returns {string}
 */
export function generateBranchName(ticketId, ticketTitle) {
  return `feature/${shortId(ticketId)}-${slugify(ticketTitle)}`;
}

/**
 * Generate an epic feature branch name from epic info.
 * @param {string} epicId - Epic UUID
 * @param {string} epicTitle - Epic title
 * @returns {string}
 */
export function generateEpicBranchName(epicId, epicTitle) {
  return `feature/epic-${shortId(epicId)}-${slugify(epicTitle)}`;
}

/**
 * Safely run a GitHub CLI (gh) command using argument arrays (immune to command injection).
 *
 * Unlike shell-based execution, this function uses execFileSync with argument arrays,
 * preventing shell metacharacter injection.
 *
 * @param {string[]} args - Array of gh command arguments (without 'gh' prefix)
 * @param {string} cwd - Working directory for the command
 * @param {object} [options] - Optional configuration
 * @param {number} [options.maxBuffer=10485760] - Maximum buffer size (default 10MB)
 * @param {number} [options.timeout] - Optional timeout in milliseconds
 * @returns {{ success: boolean, output: string, error?: string }}
 *
 * @example
 * // Query PR status
 * runGhCommandSafe(["pr", "view", "123", "--json", "state,mergedAt"], cwd);
 */
export function runGhCommandSafe(args, cwd, options = {}) {
  // Validate args is an array
  if (!Array.isArray(args)) {
    return {
      success: false,
      output: "",
      error: "Invalid arguments: expected array of gh command arguments",
    };
  }

  // Validate cwd is provided
  if (!cwd || typeof cwd !== "string") {
    return {
      success: false,
      output: "",
      error: "Invalid working directory: cwd must be a non-empty string",
    };
  }

  const { maxBuffer = 10 * 1024 * 1024, timeout } = options;

  try {
    const execOptions = {
      cwd,
      encoding: "utf-8",
      maxBuffer,
      // Don't use shell - this is the key security feature
    };

    if (timeout !== undefined) {
      execOptions.timeout = timeout;
    }

    const output = execFileSync("gh", args, execOptions);
    return { success: true, output: output.trim() };
  } catch (error) {
    // Extract meaningful error information
    let errorMessage = error.message;

    if (error.stderr && typeof error.stderr === "string" && error.stderr.trim()) {
      errorMessage = error.stderr.trim();
    } else if (error.stderr && Buffer.isBuffer(error.stderr)) {
      errorMessage = error.stderr.toString("utf-8").trim() || error.message;
    }

    if (error.code === "ENOENT") {
      errorMessage = "GitHub CLI (gh) is not installed or not in PATH";
    } else if (error.code === "ETIMEDOUT") {
      errorMessage = `gh command timed out after ${timeout}ms`;
    } else if (error.killed) {
      errorMessage = "gh command was terminated (possibly due to timeout or signal)";
    }

    log.debug(`gh command failed: gh ${args.join(" ")} in ${cwd} - ${errorMessage}`);

    return { success: false, output: "", error: errorMessage };
  }
}
