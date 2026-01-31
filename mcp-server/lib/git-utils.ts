/**
 * Git utilities for Brain Dump MCP server.
 */

import { execSync } from "child_process";

interface GitCommandResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * Run a git command in a specified directory.
 */
export function runGitCommand(command: string, cwd: string): GitCommandResult {
  try {
    const output = execSync(command, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    return { success: true, output: output.trim() };
  } catch (error) {
    const err = error as { stderr?: string; message: string };
    return { success: false, output: "", error: err.stderr?.trim() || err.message };
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
