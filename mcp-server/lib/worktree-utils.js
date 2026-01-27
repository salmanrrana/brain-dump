/**
 * Worktree utility functions for generating and managing worktree paths.
 *
 * @module lib/worktree-utils
 */
import path from "path";
import fs from "fs";
import { slugify, shortId } from "./git-utils.js";
import { validatePathComponent, SecurityError } from "./path-validation.js";
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
 * @returns {{ projectName: string | null, epicShortId: string | null, slug: string | null }}
 *
 * @example
 * parseWorktreePath("/Users/dev/brain-dump-epic-abc12345-git-worktree");
 * // Returns: { projectName: "brain-dump", epicShortId: "abc12345", slug: "git-worktree" }
 */
export function parseWorktreePath(worktreePath) {
  const dirname = path.basename(worktreePath);

  // Try to match the pattern: {projectName}-epic-{shortId}-{slug}
  const match = dirname.match(/^(.+)-epic-([a-f0-9]{8})-(.+)$/);
  if (match) {
    return {
      projectName: match[1],
      epicShortId: match[2],
      slug: match[3],
    };
  }

  // Try without slug: {projectName}-epic-{shortId}
  const matchNoSlug = dirname.match(/^(.+)-epic-([a-f0-9]{8})$/);
  if (matchNoSlug) {
    return {
      projectName: matchNoSlug[1],
      epicShortId: matchNoSlug[2],
      slug: null,
    };
  }

  // Try subfolder format: epic-{shortId}-{slug}
  const subfolderMatch = dirname.match(/^epic-([a-f0-9]{8})-(.+)$/);
  if (subfolderMatch) {
    return {
      projectName: null,
      epicShortId: subfolderMatch[1],
      slug: subfolderMatch[2],
    };
  }

  // Try subfolder without slug: epic-{shortId}
  const subfolderNoSlug = dirname.match(/^epic-([a-f0-9]{8})$/);
  if (subfolderNoSlug) {
    return {
      projectName: null,
      epicShortId: subfolderNoSlug[1],
      slug: null,
    };
  }

  return { projectName: null, epicShortId: null, slug: null };
}
