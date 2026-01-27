/**
 * Worktree utility functions for generating and managing worktree paths.
 *
 * @module lib/worktree-utils
 */
import path from "path";
import fs from "fs";
import { slugify, shortId, runGitCommandSafe } from "./git-utils.js";
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

/**
 * Generate a worktree path based on project settings.
 *
 * Creates a standardized path for git worktrees with the format:
 * - Sibling: `{projectParent}/{projectName}-epic-{shortId}-{slug}`
 * - Subfolder: `{projectPath}/.worktrees/epic-{shortId}-{slug}`
 * - Custom: `{basePath}/{projectName}-epic-{shortId}-{slug}`
 *
 * @param {string} projectPath - Absolute path to the main project directory
 * @param {string} epicId - Epic UUID (will be truncated to 8 chars)
 * @param {string} epicTitle - Epic title (will be slugified)
 * @param {object} [options] - Configuration options
 * @param {"sibling" | "subfolder" | "custom"} [options.location="sibling"] - Where to create the worktree
 * @param {string} [options.basePath] - Base path for custom location (required if location="custom")
 * @param {number} [options.slugMaxLength=30] - Maximum length for the slug portion
 * @returns {{ success: true, path: string, worktreeName: string } | { success: false, error: string }}
 *
 * @example
 * // Sibling location (default)
 * generateWorktreePath("/Users/dev/brain-dump", "abc-123", "Git Worktree Integration");
 * // Returns: { success: true, path: "/Users/dev/brain-dump-epic-abc12345-git-worktree-integration", worktreeName: "brain-dump-epic-abc12345-git-worktree-integration" }
 *
 * @example
 * // Subfolder location
 * generateWorktreePath("/Users/dev/brain-dump", "abc-123", "Feature X", { location: "subfolder" });
 * // Returns: { success: true, path: "/Users/dev/brain-dump/.worktrees/epic-abc12345-feature-x", worktreeName: "epic-abc12345-feature-x" }
 *
 * @example
 * // Custom location
 * generateWorktreePath("/Users/dev/brain-dump", "abc-123", "Feature X", {
 *   location: "custom",
 *   basePath: "/worktrees"
 * });
 * // Returns: { success: true, path: "/worktrees/brain-dump-epic-abc12345-feature-x", worktreeName: "brain-dump-epic-abc12345-feature-x" }
 */
export function generateWorktreePath(projectPath, epicId, epicTitle, options = {}) {
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

  let worktreePath;
  let worktreeName;

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
      worktreeName = epicSlug
        ? `epic-${epicShortId}-${epicSlug}`
        : `epic-${epicShortId}`;

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
 *
 * @param {string} projectPath - Absolute path to the main project directory
 * @param {string} epicId - Epic UUID
 * @param {string} epicTitle - Epic title
 * @param {object} [options] - Same options as generateWorktreePath
 * @param {number} [maxAttempts=10] - Maximum number of suffixes to try
 * @returns {{ success: true, path: string, worktreeName: string, suffix: number } | { success: false, error: string }}
 *
 * @example
 * // If "brain-dump-epic-abc12345-feature" exists, try "brain-dump-epic-abc12345-feature-2", etc.
 * suggestAlternativeWorktreePath("/Users/dev/brain-dump", "abc-123", "Feature");
 */
export function suggestAlternativeWorktreePath(
  projectPath,
  epicId,
  epicTitle,
  options = {},
  maxAttempts = 10
) {
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
 *
 * @param {string} worktreePath - Path to a worktree
 * @returns {{ matched: boolean, projectName: string | null, epicShortId: string | null, slug: string | null }}
 *
 * @example
 * parseWorktreePath("/Users/dev/brain-dump-epic-abc12345-git-worktree");
 * // Returns: { matched: true, projectName: "brain-dump", epicShortId: "abc12345", slug: "git-worktree" }
 *
 * @example
 * parseWorktreePath("/Users/dev/some-random-folder");
 * // Returns: { matched: false, projectName: null, epicShortId: null, slug: null }
 */
export function parseWorktreePath(worktreePath) {
  const dirname = path.basename(worktreePath);

  // Try to match the pattern: {projectName}-epic-{shortId}-{slug}
  const match = dirname.match(/^(.+)-epic-([a-f0-9]{8})-(.+)$/);
  if (match) {
    return {
      matched: true,
      projectName: match[1],
      epicShortId: match[2],
      slug: match[3],
    };
  }

  // Try without slug: {projectName}-epic-{shortId}
  const matchNoSlug = dirname.match(/^(.+)-epic-([a-f0-9]{8})$/);
  if (matchNoSlug) {
    return {
      matched: true,
      projectName: matchNoSlug[1],
      epicShortId: matchNoSlug[2],
      slug: null,
    };
  }

  // Try subfolder format: epic-{shortId}-{slug}
  const subfolderMatch = dirname.match(/^epic-([a-f0-9]{8})-(.+)$/);
  if (subfolderMatch) {
    return {
      matched: true,
      projectName: null,
      epicShortId: subfolderMatch[1],
      slug: subfolderMatch[2],
    };
  }

  // Try subfolder without slug: epic-{shortId}
  const subfolderNoSlug = dirname.match(/^epic-([a-f0-9]{8})$/);
  if (subfolderNoSlug) {
    return {
      matched: true,
      projectName: null,
      epicShortId: subfolderNoSlug[1],
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
 *
 * @param {string} projectPath - Absolute path to the main repository
 * @returns {{ success: true, worktrees: Array<{path: string, head: string, branch: string | null, isMainWorktree: boolean}> } | { success: false, error: string }}
 *
 * @example
 * const result = listWorktrees("/Users/dev/brain-dump");
 * if (result.success) {
 *   console.log(result.worktrees);
 *   // [
 *   //   { path: "/Users/dev/brain-dump", head: "abc123", branch: "main", isMainWorktree: true },
 *   //   { path: "/Users/dev/brain-dump-epic-xyz", head: "def456", branch: "feature/epic-xyz", isMainWorktree: false }
 *   // ]
 * }
 */
export function listWorktrees(projectPath) {
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
  const result = runGitCommandSafe(["worktree", "list", "--porcelain"], projectPath);
  if (!result.success) {
    return { success: false, error: result.error || "Failed to list worktrees" };
  }

  // Parse porcelain output
  // Format:
  // worktree /path/to/worktree
  // HEAD abc123...
  // branch refs/heads/main
  // (blank line between entries)
  const worktrees = [];
  const entries = result.output.trim().split("\n\n");

  for (const entry of entries) {
    if (!entry.trim()) continue;

    const lines = entry.split("\n");
    let worktreePath = null;
    let head = null;
    let branch = null;
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

  return { success: true, worktrees };
}

/**
 * Validation status for a worktree.
 * @typedef {"valid" | "missing_directory" | "corrupted" | "wrong_branch"} WorktreeValidationStatus
 */

/**
 * Result of worktree validation.
 * @typedef {Object} WorktreeValidationResult
 * @property {WorktreeValidationStatus} status - The validation status
 * @property {string} [branch] - Current branch name (if valid or wrong_branch)
 * @property {string} [expectedBranch] - Expected branch name (if wrong_branch)
 * @property {boolean} [hasUncommittedChanges] - Whether there are uncommitted changes
 * @property {string} [error] - Error message (if corrupted)
 */

/**
 * Validate an existing worktree for resumption.
 *
 * Checks that a worktree directory exists, is a valid git worktree,
 * is on the expected branch (if specified), and reports uncommitted changes
 * for resumption awareness.
 *
 * @param {string} worktreePath - Absolute path to the worktree directory
 * @param {string} projectPath - Absolute path to the main repository
 * @param {string | null} [expectedBranch=null] - Expected branch name (optional)
 * @returns {WorktreeValidationResult}
 *
 * @example
 * // Valid worktree
 * const result = validateWorktree("/Users/dev/brain-dump-epic-abc12345", "/Users/dev/brain-dump");
 * // Returns: { status: "valid", branch: "feature/epic-abc12345", hasUncommittedChanges: false }
 *
 * @example
 * // Missing directory
 * const result = validateWorktree("/Users/dev/nonexistent", "/Users/dev/brain-dump");
 * // Returns: { status: "missing_directory" }
 *
 * @example
 * // Wrong branch
 * const result = validateWorktree(
 *   "/Users/dev/brain-dump-epic-abc12345",
 *   "/Users/dev/brain-dump",
 *   "feature/epic-abc12345-original"
 * );
 * // Returns: { status: "wrong_branch", branch: "other-branch", expectedBranch: "feature/epic-abc12345-original", hasUncommittedChanges: true }
 */
export function validateWorktree(worktreePath, projectPath, expectedBranch = null) {
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
    const worktreeListResult = runGitCommandSafe(
      ["worktree", "list", "--porcelain"],
      projectPath
    );

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
    log.warn(`Error validating worktree at ${worktreePath}: ${error.message}`);
    return {
      status: "corrupted",
      error: error.message,
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
 *
 * @param {string} projectPath - Absolute path to the main project directory
 * @param {string} worktreePath - Absolute path where the worktree should be created
 * @param {string} branchName - Name of the branch to create for the worktree
 * @param {object} [options] - Configuration options
 * @param {number} [options.maxWorktrees=5] - Maximum number of worktrees allowed
 * @param {boolean} [options.createClaudeDir=true] - Whether to create .claude/ directory
 * @returns {{ success: true, worktreePath: string, branchName: string } | { success: false, error: string }}
 *
 * @example
 * const result = createWorktree(
 *   "/Users/dev/brain-dump",
 *   "/Users/dev/brain-dump-epic-abc12345-feature",
 *   "feature/epic-abc12345-feature"
 * );
 * if (result.success) {
 *   console.log(`Worktree created at: ${result.worktreePath}`);
 * }
 */
export function createWorktree(projectPath, worktreePath, branchName, options = {}) {
  const { maxWorktrees = 5, createClaudeDir = true } = options;

  // Track what we've created for rollback
  let _createdParentDir = false;
  let createdWorktree = false;

  // Helper function for rollback
  const rollback = (error) => {
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
          // Also try to prune
          const pruneResult = runGitCommandSafe(["worktree", "prune"], projectPath);
          if (!pruneResult.success) {
            log.error(`Failed to prune worktrees during rollback: ${pruneResult.error}`);
          }
        }
      } catch (rollbackError) {
        log.warn(`Error during worktree rollback: ${rollbackError.message}`);
      }
    }

    // Note: We don't remove the parent directory if we created it
    // because it might be needed by other operations, and removing
    // empty directories is generally safe to leave

    return { success: false, error };
  };

  try {
    // 1. Validate project path
    let resolvedProjectPath;
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
    // Using code point check for control chars to avoid eslint no-control-regex
    const invalidBranchChars = /[~^:?*[\]\\]/;
    const hasControlChars = Array.from(branchName).some(
      (char) => char.charCodeAt(0) < 32
    );
    if (invalidBranchChars.test(branchName) || hasControlChars) {
      return { success: false, error: "Branch name contains invalid characters" };
    }

    // 6. Create parent directory if needed
    const parentDir = path.dirname(worktreePath);
    if (!fs.existsSync(parentDir)) {
      try {
        fs.mkdirSync(parentDir, { recursive: true, mode: 0o755 });
        _createdParentDir = true;
        log.debug(`Created parent directory: ${parentDir}`);
      } catch (mkdirError) {
        return { success: false, error: `Failed to create parent directory: ${mkdirError.message}` };
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
        return rollback(`Failed to create .claude directory: ${mkdirError.message}`);
      }
    }

    return { success: true, worktreePath, branchName };
  } catch (error) {
    // Unexpected error - still try to rollback
    log.error(`Unexpected error during worktree creation: ${error.message}`);
    return rollback(`Unexpected error: ${error.message}`);
  }
}
