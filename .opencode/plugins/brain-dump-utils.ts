/**
 * Brain Dump OpenCode Plugin Utilities
 *
 * Shared utility functions used across multiple OpenCode plugins.
 * Consolidates common patterns like shell execution, string escaping, and output parsing.
 */

import { execSync } from "child_process";

/**
 * Safely execute a shell command and return output
 * Returns empty string on error and logs for debugging
 *
 * @param command - The shell command to execute
 * @param cwd - Optional working directory (defaults to process.cwd())
 * @returns Command output trimmed, or empty string on error
 */
export function safeExec(command: string, cwd?: string): string {
  try {
    const result = execSync(command, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8",
    });
    return result.trim();
  } catch (error) {
    // Log error for debugging without breaking workflow
    console.error(`[Brain Dump] Command failed: ${command}`);
    if (error instanceof Error) {
      console.error(`[Brain Dump] Error: ${error.message}`);
    }
    return "";
  }
}

/**
 * Escapes a string for safe use in shell commands
 * Uses single quote wrapping with proper handling of embedded quotes
 *
 * @param arg - The string to escape
 * @returns Escaped string safe for shell use
 */
export function escapeShellArg(arg: string): string {
  // Use single quotes and escape any single quotes within the string
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Extracts a value from a regex match result
 * Returns empty string if match fails, helping with optional field extraction
 *
 * @param text - Text to search
 * @param pattern - Regex pattern with capture group
 * @returns Captured value or empty string
 */
export function extractFromText(text: string, pattern: RegExp): string {
  const match = text.match(pattern);
  return match ? match[1] : "";
}
