/**
 * Git utilities for Brain Dump MCP server.
 */

import * as cp from "child_process";
import { log } from "./logging.js";

// Wrapper function to replace execFileSync functionality
function execFileSync(cmd: string, args: string[], options: any) {
  const result = (cp as any).spawnSync(cmd, args, { ...options, encoding: "utf-8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error: any = new Error(result.stderr || result.stdout || "Command failed");
    error.code = result.status;
    error.stderr = result.stderr;
    throw error;
  }
  return result.stdout;
}

export interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface CommandOptions {
  maxBuffer?: number;
  timeout?: number;
}

export interface ExecFileSyncOptions {
  cwd?: string;
  input?: string | unknown;
  encoding?: string;
  maxBuffer?: number;
  timeout?: number;
  stdio?: string | string[];
}

interface ExecError extends Error {
  code?: string;
  stderr?: string | unknown;
  killed?: boolean;
}

/**
 * Safely run a git command using argument arrays (immune to command injection).
 *
 * This function uses execFileSync with argument arrays, preventing shell
 * metacharacter injection attacks.
 *
 * @param args - Array of git command arguments (without 'git' prefix)
 * @param cwd - Working directory for the command
 * @param options - Optional configuration
 * @returns Command result with success status and output
 *
 * @example
 * // Safe - no injection possible
 * runGitCommandSafe(["worktree", "add", worktreePath, "-b", branchName], cwd);
 *
 * // Even with malicious input, this is safe:
 * const epicTitle = "; rm -rf /";
 * runGitCommandSafe(["branch", "-m", epicTitle], cwd); // Won't execute rm
 */
export function runGitCommandSafe(
  args: string[],
  cwd: string,
  options: CommandOptions = {}
): CommandResult {
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
    const execOptions: ExecFileSyncOptions = {
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
    return { success: true, output: output.toString().trim() };
  } catch (error) {
    const err = error as ExecError;
    // Extract meaningful error information
    let errorMessage = err.message;

    // If stderr is available, prefer it (git outputs errors to stderr)
    if (err.stderr && typeof err.stderr === "string" && err.stderr.trim()) {
      errorMessage = err.stderr.trim();
    }
    // Handle buffer output (when stdio is inherited or captured differently)
    else if (err.stderr && typeof err.stderr === "object" && "toString" in err.stderr) {
      errorMessage = (err.stderr as unknown as { toString(): string }).toString().trim() || err.message;
    }

    // Handle specific error cases with helpful messages
    if (err.code === "ENOENT") {
      errorMessage = "Git is not installed or not in PATH";
    } else if (err.code === "ETIMEDOUT") {
      errorMessage = `Git command timed out after ${timeout}ms`;
    } else if (err.killed) {
      errorMessage = "Git command was terminated (possibly due to timeout or signal)";
    }

    // Log failed git commands for debugging and audit trail
    log.debug(`Git command failed: git ${args.join(" ")} in ${cwd} - ${errorMessage}`);

    return { success: false, output: "", error: errorMessage };
  }
}

/**
 * Convert text to a URL-safe slug.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
}

/**
 * Get short ID from UUID (first 8 chars).
 */
export function shortId(uuid: string): string {
  return uuid.substring(0, 8);
}

/**
 * Generate a feature branch name from ticket info.
 */
export function generateBranchName(ticketId: string, ticketTitle: string): string {
  return `feature/${shortId(ticketId)}-${slugify(ticketTitle)}`;
}

/**
 * Generate an epic feature branch name from epic info.
 */
export function generateEpicBranchName(epicId: string, epicTitle: string): string {
  return `feature/epic-${shortId(epicId)}-${slugify(epicTitle)}`;
}

/**
 * Safely run a GitHub CLI (gh) command using argument arrays (immune to command injection).
 *
 * Unlike shell-based execution, this function uses execFileSync with argument arrays,
 * preventing shell metacharacter injection.
 *
 * @param args - Array of gh command arguments (without 'gh' prefix)
 * @param cwd - Working directory for the command
 * @param options - Optional configuration
 * @returns Command result with success status and output
 *
 * @example
 * // Query PR status
 * runGhCommandSafe(["pr", "view", "123", "--json", "state,mergedAt"], cwd);
 */
export function runGhCommandSafe(
  args: string[],
  cwd: string,
  options: CommandOptions = {}
): CommandResult {
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
    const execOptions: ExecFileSyncOptions = {
      cwd,
      encoding: "utf-8",
      maxBuffer,
      // Don't use shell - this is the key security feature
    };

    if (timeout !== undefined) {
      execOptions.timeout = timeout;
    }

    const output = execFileSync("gh", args, execOptions);
    return { success: true, output: output.toString().trim() };
  } catch (error) {
    const err = error as ExecError;
    // Extract meaningful error information
    let errorMessage = err.message;

    if (err.stderr && typeof err.stderr === "string" && err.stderr.trim()) {
      errorMessage = err.stderr.trim();
    } else if (err.stderr && typeof err.stderr === "object" && "toString" in err.stderr) {
      errorMessage = (err.stderr as unknown as { toString(): string }).toString().trim() || err.message;
    }

    if (err.code === "ENOENT") {
      errorMessage = "GitHub CLI (gh) is not installed or not in PATH";
    } else if (err.code === "ETIMEDOUT") {
      errorMessage = `gh command timed out after ${timeout}ms`;
    } else if (err.killed) {
      errorMessage = "gh command was terminated (possibly due to timeout or signal)";
    }

    log.debug(`gh command failed: gh ${args.join(" ")} in ${cwd} - ${errorMessage}`);

    return { success: false, output: "", error: errorMessage };
  }
}
