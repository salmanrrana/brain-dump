/**
 * Git utilities for Brain Dump MCP server.
 * @module lib/git-utils
 */
import { execSync } from "child_process";

/**
 * Run a git command in a specified directory.
 * @param {string} command - The git command to run
 * @param {string} cwd - Working directory for the command
 * @returns {{ success: boolean, output: string, error?: string }}
 */
export function runGitCommand(command, cwd) {
  try {
    const output = execSync(command, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    return { success: true, output: output.trim() };
  } catch (error) {
    return { success: false, output: "", error: error.stderr?.trim() || error.message };
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
