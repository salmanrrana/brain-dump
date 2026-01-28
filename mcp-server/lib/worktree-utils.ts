/**
 * Worktree utility functions for generating and managing worktree paths.
 */

import path from "path";
import fs from "fs";
import { slugify, shortId, runGitCommandSafe } from "./git-utils.js";
import type { CommandResult } from "./git-utils.js";
import {
  validateProjectPath,
  validateWorktreePath,
  ensureNotSymlink,
  validatePathComponent,
  SecurityError,
} from "./path-validation.js";
import { log } from "./logging.js";

/**
 * Default maximum length for the slug portion of worktree names.
 * This prevents overly long directory names on filesystems with path limits.
 */
const DEFAULT_SLUG_MAX_LENGTH = 30;

export type WorktreeLocation = "sibling" | "subfolder" | "custom";

export interface WorktreeOptions {
  location?: WorktreeLocation;
  basePath?: string | null;
  slugMaxLength?: number;
}

export interface WorktreePathResult {
  success: true;
  path: string;
  worktreeName: string;
}

export interface WorktreePathError {
  success: false;
  error: string;
}

export type WorktreePathResponse = WorktreePathResult | WorktreePathError;

export interface AlternativeWorktreePathResult extends WorktreePathResult {
  suffix: number;
}

export type AlternativeWorktreePathResponse = AlternativeWorktreePathResult | WorktreePathError;

export interface ParsedWorktreePath {
  matched: boolean;
  projectName: string | null;
  epicShortId: string | null;
  slug: string | null;
}

export interface WorktreeInfo {
  path: string;
  head: string;
  branch: string | null;
  isMainWorktree: boolean;
}

export interface ListWorktreesResult {
  success: true;
  worktrees: WorktreeInfo[];
}

export type ListWorktreesResponse = ListWorktreesResult | WorktreePathError;

export type WorktreeValidationStatus = "valid" | "missing_directory" | "corrupted" | "wrong_branch";

export interface WorktreeValidationResult {
  status: WorktreeValidationStatus;
  branch?: string;
  expectedBranch?: string;
  hasUncommittedChanges?: boolean;
  error?: string;
}

export interface CreateWorktreeOptions {
  maxWorktrees?: number;
  createClaudeDir?: boolean;
}

export interface CreateWorktreeResult {
  success: true;
  worktreePath: string;
  branchName: string;
}

export interface CreateWorktreeError {
  success: false;
  error: string;
  rollbackWarning?: string;
}

export type CreateWorktreeResponse = CreateWorktreeResult | CreateWorktreeError;

export interface RemoveWorktreeOptions {
  force?: boolean;
}

export interface RemoveWorktreeResult {
  success: true;
  warning?: string;
}

export type RemoveWorktreeResponse = RemoveWorktreeResult | WorktreePathError;

/**
 * Generate a worktree path based on project settings.
 *
 * Creates a standardized path for git worktrees with the format:
 * - Sibling: `{projectParent}/{projectName}-epic-{shortId}-{slug}`
 * - Subfolder: `{projectPath}/.worktrees/epic-{shortId}-{slug}`
 * - Custom: `{basePath}/{projectName}-epic-{shortId}-{slug}`
 */
export function generateWorktreePath(
  projectPath: string,
  epicId: string,
  epicTitle: string,
  options: WorktreeOptions = {}
): WorktreePathResponse {
  const {
    location = "sibling",
    basePath = null,
    slugMaxLength = DEFAULT_SLUG_MAX_LENGTH,
  } = options;

  // Validate required inputs
  if (!projectPath || typeof projectPath !== "string") {
    return { success: false, error: "Project path must be a non-empty string" };
  }

  if (!epicId || typeof epicId !== "string") {
    return { success: false, error: "Epic ID must be a non-empty string" };
  }

  if (!epicTitle || typeof epicTitle !== "string") {
    return { success: false, error: "Epic title must be a non-empty string" };
  }

  if (!path.isAbsolute(projectPath)) {
    return { success: false, error: "Project path must be absolute" };
  }

  // Generate slug from epic title (sanitized, truncated)
  const epicSlug = slugify(epicTitle).substring(0, slugMaxLength);
  const epicShortId = shortId(epicId);

  // Validate the generated components
  try {
    // Validate the short ID and slug don't contain dangerous characters
    // (slugify should have sanitized these, but defense in depth)
    validatePathComponent(epicShortId);
    if (epicSlug) {
      validatePathComponent(epicSlug);
    }
  } catch (err) {
    if (err instanceof SecurityError) {
      log.warn(`Path component validation failed: ${err.message}`);
      return { success: false, error: err.message };
    }
    throw err;
  }

  // Get project name for use in worktree name
  const projectName = path.basename(projectPath);

  let worktreePath: string;
  let worktreeName: string;

  switch (location) {
    case "sibling": {
      // Sibling: {projectParent}/{projectName}-epic-{shortId}-{slug}
      worktreeName = epicSlug
        ? `${projectName}-epic-${epicShortId}-${epicSlug}`
        : `${projectName}-epic-${epicShortId}`;

      worktreePath = path.join(path.dirname(projectPath), worktreeName);
      break;
    }

    case "subfolder": {
      // Subfolder: {projectPath}/.worktrees/epic-{shortId}-{slug}
      worktreeName = epicSlug ? `epic-${epicShortId}-${epicSlug}` : `epic-${epicShortId}`;

      worktreePath = path.join(projectPath, ".worktrees", worktreeName);
      break;
    }

    case "custom": {
      // Custom: {basePath}/{projectName}-epic-{shortId}-{slug}
      if (!basePath || typeof basePath !== "string") {
        return {
          success: false,
          error: "Custom location requires basePath parameter",
        };
      }

      if (!path.isAbsolute(basePath)) {
        return { success: false, error: "basePath must be an absolute path" };
      }

      worktreeName = epicSlug
        ? `${projectName}-epic-${epicShortId}-${epicSlug}`
        : `${projectName}-epic-${epicShortId}`;

      worktreePath = path.join(basePath, worktreeName);
      break;
    }

    default:
      return { success: false, error: `Unknown location type: ${location}` };
  }

  // Check if path already exists
  if (fs.existsSync(worktreePath)) {
    log.debug(`Worktree path already exists: ${worktreePath}`);
    return {
      success: false,
      error: `Path already exists: ${worktreePath}. Remove it first or use a different epic.`,
    };
  }

  log.debug(`Generated worktree path: ${worktreePath} (location: ${location})`);
  return { success: true, path: worktreePath, worktreeName };
}

/**
 * Suggest an alternative worktree path when the primary one is taken.
 *
 * Appends a numeric suffix to find an available path.
 */
export function suggestAlternativeWorktreePath(
  projectPath: string,
  epicId: string,
  epicTitle: string,
  options: WorktreeOptions = {},
  maxAttempts = 10
): AlternativeWorktreePathResponse {
  const {
    location = "sibling",
    basePath = null,
    slugMaxLength = DEFAULT_SLUG_MAX_LENGTH,
  } = options;

  // First, try the primary path
  const primary = generateWorktreePath(projectPath, epicId, epicTitle, options);
  if (primary.success) {
    return { ...primary, suffix: 0 };
  }

  // If it failed for a reason other than "path exists", propagate the error
  if (!primary.error?.includes("Path already exists")) {
    return primary;
  }

  // Try adding numeric suffixes
  for (let suffix = 2; suffix <= maxAttempts + 1; suffix++) {
    // Modify epic title to include suffix
    const modifiedTitle = `${epicTitle}-${suffix}`;
    const result = generateWorktreePath(projectPath, epicId, modifiedTitle, {
      location,
      basePath,
      slugMaxLength,
    });

    if (result.success) {
      return { ...result, suffix };
    }

    // If error is not "path exists", something else is wrong
    if (!result.error?.includes("Path already exists")) {
      return result;
    }
  }

  return {
    success: false,
    error: `Could not find available path after ${maxAttempts} attempts`,
  };
}

/**
 * Parse a worktree path to extract components.
 *
 * Useful for understanding an existing worktree's origin.
 */
export function parseWorktreePath(worktreePath: string): ParsedWorktreePath {
  const dirname = path.basename(worktreePath);

  // Try to match the pattern: {projectName}-epic-{shortId}-{slug}
  const match = dirname.match(/^(.+)-epic-([a-f0-9]{8})-(.+)$/);
  if (match) {
    return {
      matched: true,
      projectName: match[1] ?? null,
      epicShortId: match[2] ?? null,
      slug: match[3] ?? null,
    };
  }

  // Try without slug: {projectName}-epic-{shortId}
  const matchNoSlug = dirname.match(/^(.+)-epic-([a-f0-9]{8})$/);
  if (matchNoSlug) {
    return {
      matched: true,
      projectName: matchNoSlug[1] ?? null,
      epicShortId: matchNoSlug[2] ?? null,
      slug: null,
    };
  }

  // Try subfolder format: epic-{shortId}-{slug}
  const subfolderMatch = dirname.match(/^epic-([a-f0-9]{8})-(.+)$/);
  if (subfolderMatch) {
    return {
      matched: true,
      projectName: null,
      epicShortId: subfolderMatch[1] ?? null,
      slug: subfolderMatch[2] ?? null,
    };
  }

  // Try subfolder without slug: epic-{shortId}
  const subfolderNoSlug = dirname.match(/^epic-([a-f0-9]{8})$/);
  if (subfolderNoSlug) {
    return {
      matched: true,
      projectName: null,
      epicShortId: subfolderNoSlug[1] ?? null,
      slug: null,
    };
  }

  return { matched: false, projectName: null, epicShortId: null, slug: null };
}

/**
 * List all git worktrees for a repository.
 *
 * Parses the output of `git worktree list --porcelain` to return structured data
 * about each worktree. Identifies the main worktree (bare: false) vs linked worktrees.
 */
export function listWorktrees(projectPath: string): ListWorktreesResponse {
  // Validate project path
  try {
    validateProjectPath(projectPath);
  } catch (error) {
    if (error instanceof SecurityError) {
      return { success: false, error: error.message };
    }
    throw error;
  }

  // Get worktree list in porcelain format
  const result: CommandResult = runGitCommandSafe(["worktree", "list", "--porcelain"], projectPath);
  if (!result.success) {
    return {
      success: false,
      error: `Failed to list worktrees for ${projectPath}: ${result.error || "Unknown error"}`,
    };
  }

  // Parse porcelain output
  // Format:
  // worktree /path/to/worktree
  // HEAD abc123...
  // branch refs/heads/main
  // (blank line between entries)
  const worktrees: WorktreeInfo[] = [];
  const entries = result.output.trim().split("\n\n");

  for (const entry of entries) {
    if (!entry.trim()) continue;

    const lines = entry.split("\n");
    let worktreePath: string | null = null;
    let head: string | null = null;
    let branch: string | null = null;
    let isBare = false;

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        worktreePath = line.substring("worktree ".length);
      } else if (line.startsWith("HEAD ")) {
        head = line.substring("HEAD ".length);
      } else if (line.startsWith("branch ")) {
        // Extract branch name from refs/heads/branch-name
        const fullBranch = line.substring("branch ".length);
        branch = fullBranch.startsWith("refs/heads/")
          ? fullBranch.substring("refs/heads/".length)
          : fullBranch;
      } else if (line === "bare") {
        isBare = true;
      }
    }

    if (worktreePath) {
      // The main worktree doesn't have a "linked" marker and matches projectPath
      // after normalization
      const normalizedWorktreePath = path.normalize(worktreePath);
      const normalizedProjectPath = path.normalize(projectPath);
      const isMainWorktree = normalizedWorktreePath === normalizedProjectPath || isBare;

      worktrees.push({
        path: worktreePath,
        head: head || "",
        branch,
        isMainWorktree,
      });
    }
  }

  log.debug(`Listed ${worktrees.length} worktree(s) for ${projectPath}`);
  return { success: true, worktrees };
}

/**
 * Validate an existing worktree for resumption.
 *
 * Checks that a worktree directory exists, is a valid git worktree,
 * is on the expected branch (if specified), and reports uncommitted changes
 * for resumption awareness.
 */
export function validateWorktree(
  worktreePath: string,
  projectPath: string,
  expectedBranch: string | null = null
): WorktreeValidationResult {
  // Input validation
  if (!worktreePath || typeof worktreePath !== "string") {
    return { status: "corrupted", error: "Worktree path must be a non-empty string" };
  }

  if (!projectPath || typeof projectPath !== "string") {
    return { status: "corrupted", error: "Project path must be a non-empty string" };
  }

  // Check if directory exists
  if (!fs.existsSync(worktreePath)) {
    return { status: "missing_directory" };
  }

  try {
    // Check if it's a directory
    const stats = fs.statSync(worktreePath);
    if (!stats.isDirectory()) {
      return { status: "corrupted", error: "Path exists but is not a directory" };
    }

    // Check if the worktree is in the main repo's worktree list
    // We use runGitCommandSafe on the projectPath to get the authoritative list
    const worktreeListResult = runGitCommandSafe(["worktree", "list", "--porcelain"], projectPath);

    if (!worktreeListResult.success) {
      return {
        status: "corrupted",
        error: `Failed to list worktrees: ${worktreeListResult.error}`,
      };
    }

    // Normalize paths for comparison (handle trailing slashes, etc.)
    // path.normalize doesn't remove trailing slashes, so we do it manually
    const normalizedWorktreePath = path.normalize(worktreePath).replace(/\/+$/, "");

    // Parse the porcelain output to find the worktree entry
    // Format: worktree /path\nHEAD abc123\nbranch refs/heads/name\n\n
    const entries = worktreeListResult.output.trim().split("\n\n");
    let foundInList = false;

    for (const entry of entries) {
      const lines = entry.split("\n");
      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          const listedPath = line.substring("worktree ".length);
          const normalizedListedPath = path.normalize(listedPath).replace(/\/+$/, "");
          if (normalizedListedPath === normalizedWorktreePath) {
            foundInList = true;
            break;
          }
        }
      }
      if (foundInList) break;
    }

    if (!foundInList) {
      return {
        status: "corrupted",
        error: "Directory exists but is not in worktree list",
      };
    }

    // Get current branch from the worktree (run git command IN the worktree)
    const branchResult = runGitCommandSafe(["branch", "--show-current"], worktreePath);

    if (!branchResult.success) {
      return {
        status: "corrupted",
        error: `Failed to get current branch: ${branchResult.error}`,
      };
    }

    const currentBranch = branchResult.output.trim();

    // Check for uncommitted changes (run git status --porcelain in the worktree)
    const statusResult = runGitCommandSafe(["status", "--porcelain"], worktreePath);

    if (!statusResult.success) {
      return {
        status: "corrupted",
        error: `Failed to check git status: ${statusResult.error}`,
      };
    }

    const hasUncommittedChanges = statusResult.output.trim().length > 0;

    // Validate branch if expected branch is specified
    if (expectedBranch !== null && currentBranch !== expectedBranch) {
      return {
        status: "wrong_branch",
        branch: currentBranch,
        expectedBranch,
        hasUncommittedChanges,
      };
    }

    // All checks passed
    return {
      status: "valid",
      branch: currentBranch,
      hasUncommittedChanges,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(`Error validating worktree at ${worktreePath}: ${message}`);
    return {
      status: "corrupted",
      error: message,
    };
  }
}

/**
 * Create a git worktree with all security checks and rollback on failure.
 *
 * This function:
 * 1. Validates all input paths for security (traversal, symlinks)
 * 2. Checks the worktree limit hasn't been reached
 * 3. Creates the worktree directory with proper permissions
 * 4. Creates the .claude/ directory with restricted permissions (0o700)
 * 5. Rolls back (cleans up) on failure
 */
export function createWorktree(
  projectPath: string,
  worktreePath: string,
  branchName: string,
  options: CreateWorktreeOptions = {}
): CreateWorktreeResponse {
  const { maxWorktrees = 5, createClaudeDir = true } = options;

  // Track what we've created for rollback
  let createdWorktree = false;
  let rollbackWarning: string | null = null;

  // Helper function for rollback - cleans up on failure and returns error result
  const rollback = (error: string): CreateWorktreeError => {
    log.debug(`Rolling back worktree creation due to error: ${error}`);

    // Remove worktree if created
    if (createdWorktree) {
      try {
        const removeResult = runGitCommandSafe(
          ["worktree", "remove", "--force", worktreePath],
          projectPath
        );
        if (!removeResult.success) {
          log.warn(`Failed to remove worktree during rollback: ${removeResult.error}`);
          rollbackWarning = `Rollback failed: ${removeResult.error}. Manual cleanup may be required.`;
          // Also try to prune
          const pruneResult = runGitCommandSafe(["worktree", "prune"], projectPath);
          if (!pruneResult.success) {
            log.error(`Failed to prune worktrees during rollback: ${pruneResult.error}`);
          }
        }
      } catch (rollbackError) {
        const message =
          rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        log.warn(`Error during worktree rollback: ${message}`);
        rollbackWarning = `Rollback error: ${message}. Manual cleanup may be required.`;
      }
    }

    // Note: We don't remove the parent directory if we created it
    // because it might be needed by other operations, and removing
    // empty directories is generally safe to leave

    const result: CreateWorktreeError = { success: false, error };
    if (rollbackWarning) {
      result.rollbackWarning = rollbackWarning;
    }
    return result;
  };

  try {
    // 1. Validate project path
    let resolvedProjectPath: string;
    try {
      resolvedProjectPath = validateProjectPath(projectPath);
    } catch (error) {
      if (error instanceof SecurityError) {
        return { success: false, error: error.message };
      }
      throw error;
    }

    // 2. Validate worktree path
    try {
      validateWorktreePath(worktreePath, resolvedProjectPath);
    } catch (error) {
      if (error instanceof SecurityError) {
        return { success: false, error: error.message };
      }
      throw error;
    }

    // 3. Check worktree limit
    const listResult = listWorktrees(resolvedProjectPath);
    if (!listResult.success) {
      return { success: false, error: listResult.error };
    }

    // Count non-main worktrees
    const linkedWorktrees = listResult.worktrees.filter((w) => !w.isMainWorktree);
    if (linkedWorktrees.length >= maxWorktrees) {
      return {
        success: false,
        error: `Worktree limit (${maxWorktrees}) reached. Current count: ${linkedWorktrees.length}. Remove stale worktrees before creating new ones.`,
      };
    }

    // 4. Check path doesn't already exist
    if (fs.existsSync(worktreePath)) {
      return {
        success: false,
        error: `Path already exists: ${worktreePath}. Remove it first or use a different epic.`,
      };
    }

    // 5. Validate branch name (basic validation - no shell metacharacters)
    if (!branchName || typeof branchName !== "string" || branchName.trim() === "") {
      return { success: false, error: "Branch name must be a non-empty string" };
    }
    // Check for obviously invalid branch name characters
    // (tilde, caret, colon, question mark, asterisk, open bracket, backslash, control chars)
    const invalidBranchChars = /[~^:?*[\]\\]/;
    const hasControlChars = Array.from(branchName).some((char) => char.charCodeAt(0) < 32);
    if (invalidBranchChars.test(branchName) || hasControlChars) {
      return { success: false, error: "Branch name contains invalid characters" };
    }

    // 6. Create parent directory if needed
    // Note: We don't track parent directory creation for rollback because
    // empty directories are harmless and may be needed by other operations.
    const parentDir = path.dirname(worktreePath);
    if (!fs.existsSync(parentDir)) {
      try {
        fs.mkdirSync(parentDir, { recursive: true, mode: 0o755 });
        log.debug(`Created parent directory: ${parentDir}`);
      } catch (mkdirError) {
        const message = mkdirError instanceof Error ? mkdirError.message : String(mkdirError);
        return { success: false, error: `Failed to create parent directory: ${message}` };
      }
    }

    // 7. Create worktree (SAFE command - argument arrays)
    const worktreeResult = runGitCommandSafe(
      ["worktree", "add", worktreePath, "-b", branchName],
      resolvedProjectPath
    );

    if (!worktreeResult.success) {
      // Check for specific error cases
      if (worktreeResult.error?.includes("already exists")) {
        return {
          success: false,
          error: `Branch '${branchName}' already exists. Use a different branch name or delete the existing branch.`,
        };
      }
      return rollback(worktreeResult.error || "Failed to create worktree");
    }

    createdWorktree = true;

    // 7b. Verify worktree was actually created (defense against silent failures)
    if (!fs.existsSync(worktreePath)) {
      log.error(`Worktree creation reported success but directory does not exist: ${worktreePath}`);
      return rollback("Worktree creation succeeded but directory does not exist");
    }

    log.debug(`Created worktree at: ${worktreePath} with branch: ${branchName}`);

    // 8. Create .claude/ directory with restricted permissions
    if (createClaudeDir) {
      const claudeDir = path.join(worktreePath, ".claude");

      // Check for symlink attacks before creating
      try {
        ensureNotSymlink(claudeDir);
      } catch (error) {
        if (error instanceof SecurityError) {
          return rollback(error.message);
        }
        throw error;
      }

      try {
        fs.mkdirSync(claudeDir, { recursive: true, mode: 0o700 });
        log.debug(`Created .claude directory with restricted permissions: ${claudeDir}`);
      } catch (mkdirError) {
        const message = mkdirError instanceof Error ? mkdirError.message : String(mkdirError);
        return rollback(`Failed to create .claude directory: ${message}`);
      }
    }

    return { success: true, worktreePath, branchName };
  } catch (error) {
    // Unexpected error - still try to rollback
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Unexpected error during worktree creation: ${message}`);
    return rollback(`Unexpected error: ${message}`);
  }
}

/**
 * Remove a git worktree safely with all security validations.
 *
 * This function:
 * 1. Validates the worktree path is within allowed boundaries
 * 2. Checks the worktree exists in git's worktree list
 * 3. Removes the worktree using git worktree remove
 * 4. Prunes any stale worktree references
 */
export function removeWorktree(
  worktreePath: string,
  projectPath: string,
  options: RemoveWorktreeOptions = {}
): RemoveWorktreeResponse {
  const { force = false } = options;

  // 1. Input validation
  if (!worktreePath || typeof worktreePath !== "string") {
    return { success: false, error: "Worktree path must be a non-empty string" };
  }

  if (!projectPath || typeof projectPath !== "string") {
    return { success: false, error: "Project path must be a non-empty string" };
  }

  // 2. Validate project path (security check)
  let resolvedProjectPath: string;
  try {
    resolvedProjectPath = validateProjectPath(projectPath);
  } catch (error) {
    if (error instanceof SecurityError) {
      return { success: false, error: error.message };
    }
    throw error;
  }

  // 3. Validate worktree path is within allowed boundaries
  try {
    validateWorktreePath(worktreePath, resolvedProjectPath);
  } catch (error) {
    if (error instanceof SecurityError) {
      return { success: false, error: error.message };
    }
    throw error;
  }

  // 4. Verify the worktree exists in git's worktree list
  const listResult = listWorktrees(resolvedProjectPath);
  if (!listResult.success) {
    return { success: false, error: `Failed to list worktrees: ${listResult.error}` };
  }

  // Normalize path for comparison (handle trailing slashes)
  const normalizedWorktreePath = path.normalize(worktreePath).replace(/\/+$/, "");
  const foundWorktree = listResult.worktrees.find((wt) => {
    const normalizedWtPath = path.normalize(wt.path).replace(/\/+$/, "");
    return normalizedWtPath === normalizedWorktreePath;
  });

  if (!foundWorktree) {
    return {
      success: false,
      error: `Worktree not found in git worktree list: ${worktreePath}. It may have already been removed or was never a valid worktree.`,
    };
  }

  // 5. Prevent removal of main worktree
  if (foundWorktree.isMainWorktree) {
    return {
      success: false,
      error: "Cannot remove the main worktree. This is the primary repository directory.",
    };
  }

  // 6. Build remove command with optional force flag
  const args = ["worktree", "remove"];
  if (force) {
    args.push("--force");
  }
  args.push(worktreePath);

  // 7. Execute removal
  log.debug(
    `Removing worktree: ${worktreePath} from project: ${resolvedProjectPath}${force ? " (force)" : ""}`
  );

  const removeResult = runGitCommandSafe(args, resolvedProjectPath);
  if (!removeResult.success) {
    // Provide helpful error message for common cases
    if (removeResult.error?.includes("contains modified or untracked files")) {
      // Only suggest force if it wasn't already set
      const suggestion = force
        ? "Commit or discard the changes first, or check if the worktree path is correct."
        : "Use force: true to remove anyway, or commit/discard changes first.";
      return {
        success: false,
        error: `Worktree has uncommitted changes. ${suggestion}`,
      };
    }
    return { success: false, error: removeResult.error || "Failed to remove worktree" };
  }

  // 8. Prune stale worktree references
  const pruneResult = runGitCommandSafe(["worktree", "prune"], resolvedProjectPath);
  if (!pruneResult.success) {
    // Log the failure - the worktree was removed but prune failed
    log.warn(`Failed to prune worktrees after removal: ${pruneResult.error}`);
    // Return success with warning so callers know prune failed
    return {
      success: true,
      warning: `Worktree removed but failed to prune stale references: ${pruneResult.error}`,
    };
  }

  log.debug(`Successfully removed worktree: ${worktreePath}`);
  return { success: true };
}
