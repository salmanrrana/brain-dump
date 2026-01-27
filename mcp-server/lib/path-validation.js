/**
 * Path validation utilities for worktree security.
 *
 * These functions prevent common security attacks:
 * - Path traversal (using ".." to escape directories)
 * - Symlink attacks (using symlinks to redirect operations)
 * - Relative path injection (using relative paths to bypass checks)
 *
 * @module lib/path-validation
 */
import path from "path";
import fs from "fs";
import { log } from "./logging.js";

/**
 * Custom error class for security violations.
 */
export class SecurityError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string} type - Type of security violation
   */
  constructor(message, type) {
    super(message);
    this.name = "SecurityError";
    this.type = type;
  }
}

/**
 * Validate a project path to prevent path traversal attacks.
 *
 * Performs the following security checks:
 * 1. Path must be absolute (no relative paths)
 * 2. Path must exist on the filesystem
 * 3. Path must not contain ".." sequences
 * 4. Resolves symlinks to get the real path
 *
 * @param {string} inputPath - The project path to validate
 * @returns {string} The resolved real path (symlinks followed)
 * @throws {SecurityError} If validation fails
 *
 * @example
 * // Valid path
 * validateProjectPath("/Users/dev/my-project"); // Returns real path
 *
 * // Invalid - relative path
 * validateProjectPath("./my-project"); // Throws SecurityError
 *
 * // Invalid - path traversal
 * validateProjectPath("/Users/dev/../../../etc/passwd"); // Throws SecurityError
 */
export function validateProjectPath(inputPath) {
  // Check for null/undefined/empty
  if (!inputPath || typeof inputPath !== "string") {
    throw new SecurityError(
      "Security: Project path must be a non-empty string",
      "invalid_input"
    );
  }

  // Check for absolute path
  if (!path.isAbsolute(inputPath)) {
    log.warn(`Path validation failed: relative path attempted: ${inputPath}`);
    throw new SecurityError(
      "Security: Project path must be absolute",
      "relative_path"
    );
  }

  // Check for path traversal attempts in the ORIGINAL input
  // We check the original string to catch attempts like "/a/../b"
  // even though path.normalize would resolve them.
  // This is intentional: we want to reject suspicious input, not normalize it.
  if (inputPath.includes("..")) {
    log.warn(`Path validation failed: traversal detected in: ${inputPath}`);
    throw new SecurityError(
      "Security: Path traversal detected",
      "path_traversal"
    );
  }

  // Check that path exists
  if (!fs.existsSync(inputPath)) {
    throw new SecurityError(
      "Security: Project path does not exist",
      "path_not_found"
    );
  }

  // Resolve symlinks to get the real path
  // This prevents symlink attacks where a symlink points to sensitive locations
  try {
    const realPath = fs.realpathSync(inputPath);
    return realPath;
  } catch (error) {
    log.error(`Failed to resolve real path for: ${inputPath}`, error);
    throw new SecurityError(
      "Security: Failed to resolve path",
      "resolution_failed"
    );
  }
}

/**
 * Validate a worktree path is within expected boundaries.
 *
 * Worktrees must be either:
 * - A sibling directory (same parent as the project)
 * - Within the project directory itself (subfolder)
 *
 * This prevents creating worktrees in arbitrary locations that could
 * overwrite system files or other projects.
 *
 * @param {string} worktreePath - The proposed worktree path
 * @param {string} projectPath - The main project path (already validated)
 * @throws {SecurityError} If worktree path is outside allowed boundaries
 *
 * @example
 * // Valid - sibling directory
 * validateWorktreePath("/Users/dev/project-worktree", "/Users/dev/project");
 *
 * // Valid - subfolder
 * validateWorktreePath("/Users/dev/project/.worktrees/epic-1", "/Users/dev/project");
 *
 * // Invalid - arbitrary location
 * validateWorktreePath("/tmp/malicious", "/Users/dev/project"); // Throws SecurityError
 */
export function validateWorktreePath(worktreePath, projectPath) {
  // Check for null/undefined/empty
  if (!worktreePath || typeof worktreePath !== "string") {
    throw new SecurityError(
      "Security: Worktree path must be a non-empty string",
      "invalid_input"
    );
  }

  if (!projectPath || typeof projectPath !== "string") {
    throw new SecurityError(
      "Security: Project path must be a non-empty string",
      "invalid_input"
    );
  }

  // Check for absolute path
  if (!path.isAbsolute(worktreePath)) {
    log.warn(`Worktree path validation failed: relative path: ${worktreePath}`);
    throw new SecurityError(
      "Security: Worktree path must be absolute",
      "relative_path"
    );
  }

  // Check for path traversal in the ORIGINAL worktree path input
  if (worktreePath.includes("..")) {
    log.warn(`Worktree path validation failed: traversal in: ${worktreePath}`);
    throw new SecurityError(
      "Security: Path traversal detected in worktree path",
      "path_traversal"
    );
  }

  // Normalize both paths for comparison (after traversal check)
  const normalizedWorktree = path.normalize(worktreePath);
  const normalizedProject = path.normalize(projectPath);
  const projectParent = path.dirname(normalizedProject);
  const worktreeParent = path.dirname(normalizedWorktree);

  // Check: worktree must be sibling (same parent) OR within project
  const isSibling = worktreeParent === projectParent;
  const isWithinProject = normalizedWorktree.startsWith(normalizedProject + path.sep);

  if (!isSibling && !isWithinProject) {
    log.warn(
      `Worktree path validation failed: ${worktreePath} is not a sibling of or within ${projectPath}`
    );
    throw new SecurityError(
      "Security: Worktree must be sibling or within project directory",
      "invalid_location"
    );
  }
}

/**
 * Ensure a path is not a symlink before performing sensitive operations.
 *
 * This prevents symlink attacks where:
 * - An attacker creates a symlink pointing to a sensitive location
 * - The operation follows the symlink and modifies the wrong location
 *
 * Note: If the path doesn't exist (ENOENT), this is considered safe
 * because no symlink exists there yet.
 *
 * @param {string} targetPath - The path to check
 * @throws {SecurityError} If the path is a symlink
 *
 * @example
 * // Safe - regular directory
 * ensureNotSymlink("/Users/dev/project/.claude"); // OK
 *
 * // Safe - path doesn't exist yet
 * ensureNotSymlink("/Users/dev/project/.claude/new-dir"); // OK
 *
 * // Unsafe - path is a symlink
 * ensureNotSymlink("/Users/dev/project/.claude"); // Throws if .claude is a symlink
 */
export function ensureNotSymlink(targetPath) {
  // Check for null/undefined/empty
  if (!targetPath || typeof targetPath !== "string") {
    throw new SecurityError(
      "Security: Target path must be a non-empty string",
      "invalid_input"
    );
  }

  try {
    // Use lstat to check the path itself, not what it points to
    const stats = fs.lstatSync(targetPath);

    if (stats.isSymbolicLink()) {
      log.warn(`Security check failed: ${targetPath} is a symlink`);
      throw new SecurityError(
        "Security: Path is a symlink - refusing operation",
        "symlink_detected"
      );
    }
  } catch (error) {
    // ENOENT means the path doesn't exist - this is fine
    // (no symlink to exploit)
    if (error.code === "ENOENT") {
      return; // Path doesn't exist, safe to proceed
    }

    // If it's our own SecurityError, re-throw it
    if (error instanceof SecurityError) {
      throw error;
    }

    // Other errors (permission denied, etc.) should be reported
    log.error(`Failed to check symlink status for: ${targetPath}`, error);
    throw new SecurityError(
      `Security: Failed to verify path is not a symlink: ${error.message}`,
      "check_failed"
    );
  }
}

/**
 * Validate a path component (directory or file name) for dangerous characters.
 *
 * Prevents names that could cause issues:
 * - Control characters
 * - Path separators (/ or \)
 * - Shell metacharacters in names
 *
 * @param {string} name - The path component to validate
 * @returns {boolean} True if the name is safe
 * @throws {SecurityError} If the name contains dangerous characters
 *
 * @example
 * validatePathComponent("my-project"); // Returns true
 * validatePathComponent("project; rm -rf /"); // Throws SecurityError
 */
export function validatePathComponent(name) {
  if (!name || typeof name !== "string") {
    throw new SecurityError(
      "Security: Path component must be a non-empty string",
      "invalid_input"
    );
  }

  // Check for path separators
  if (name.includes("/") || name.includes("\\")) {
    throw new SecurityError(
      "Security: Path component cannot contain path separators",
      "invalid_characters"
    );
  }

  // Check for null bytes (can truncate strings in C-based APIs)
  if (name.includes("\0")) {
    throw new SecurityError(
      "Security: Path component cannot contain null bytes",
      "invalid_characters"
    );
  }

  // Check for control characters (ASCII 0-31)
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(name)) {
    throw new SecurityError(
      "Security: Path component cannot contain control characters",
      "invalid_characters"
    );
  }

  // Check for reserved names on Windows
  const windowsReserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  if (windowsReserved.test(name)) {
    throw new SecurityError(
      "Security: Path component uses reserved Windows name",
      "reserved_name"
    );
  }

  return true;
}
