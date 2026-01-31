/**
 * Brain Dump Review Guard Plugin for OpenCode
 *
 * Blocks git push/gh pr create until code review is complete.
 * This ensures all code goes through the mandatory AI review phase before being pushed.
 *
 * Workflow:
 * 1. Detects before Bash tool executes `git push` or `gh pr create`
 * 2. Gets uncommitted source file changes via `git diff`
 * 3. If no source code changes, allows push (nothing to review)
 * 4. Checks for `.claude/.review-completed` marker existence
 * 5. If marker doesn't exist, throws error with helpful message
 * 6. If marker exists but stale (> 30 minutes), throws error about fresh review needed
 * 7. If marker is fresh, allows push
 *
 * All errors are handled gracefully, defaulting to allow if anything fails.
 *
 * Reference: https://opencode.ai/docs/plugins/
 */

import { execSync } from "child_process";
import { existsSync, statSync } from "fs";
import { join } from "path";

/**
 * Safely execute a shell command and return output
 * Returns empty string on error (graceful failure)
 */
function safeExec(command: string, cwd?: string): string {
  try {
    const result = execSync(command, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8",
    });
    return result.trim();
  } catch {
    return "";
  }
}

/**
 * Gets uncommitted source file changes
 * Returns array of file paths that have changes
 */
function getSourceChanges(projectPath: string): string[] {
  // Get both unstaged and staged changes
  const unstagedOutput = safeExec('git diff --name-only HEAD 2>/dev/null || echo ""', projectPath);
  const stagedOutput = safeExec(
    'git diff --cached --name-only 2>/dev/null || echo ""',
    projectPath
  );

  // Combine and filter to source files only
  const allChanges = `${unstagedOutput}\n${stagedOutput}`
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .filter((file) => {
      // Match source file extensions: ts, tsx, js, jsx, py, go, rs, java, c, cpp, h, hpp
      if (!/\.(ts|tsx|js|jsx|py|go|rs|java|c|cpp|h|hpp)$/.test(file)) {
        return false;
      }
      // Exclude .d.ts files
      if (file.endsWith(".d.ts")) {
        return false;
      }
      // Exclude node_modules and other build artifacts
      if (/node_modules|dist|build|\.next|\.turbo/.test(file)) {
        return false;
      }
      return true;
    });

  // Deduplicate
  return Array.from(new Set(allChanges));
}

/**
 * Checks if review marker exists and is fresh
 * Returns: "fresh" if marker is < 30 minutes old
 *          "stale" if marker exists but > 30 minutes old
 *          "missing" if marker doesn't exist
 */
function checkReviewMarker(projectPath: string): "fresh" | "stale" | "missing" {
  const markerPath = join(projectPath, ".claude", ".review-completed");

  if (!existsSync(markerPath)) {
    return "missing";
  }

  try {
    const stats = statSync(markerPath);
    const markerAge = (Date.now() - stats.mtimeMs) / 1000 / 60; // age in minutes

    if (markerAge < 30) {
      return "fresh";
    } else {
      return "stale";
    }
  } catch {
    // If we can't stat the file, treat as missing
    return "missing";
  }
}

/**
 * Main plugin export
 * OpenCode will instantiate this plugin and call event handlers
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async (context: any) => {
  const { project } = context;
  const projectPath = project?.path || process.cwd();

  return {
    /**
     * Called before Bash tool executes
     * Blocks git push or gh pr create if review is not complete
     */
    "tool.execute.before": async (input: any) => {
      const toolName = input.tool || "";
      const toolInput = input.params || {};

      // Only handle Bash tool
      if (toolName !== "Bash") {
        return;
      }

      // Get the command that will be executed
      const command = toolInput.command || "";

      // Only care about git push or gh pr create commands
      if (!command.includes("git push") && !command.includes("gh pr create")) {
        return;
      }

      // Get source code changes
      const changes = getSourceChanges(projectPath);

      // If no source code changes, allow push
      if (changes.length === 0) {
        return;
      }

      // Check review marker
      const markerStatus = checkReviewMarker(projectPath);

      if (markerStatus === "fresh") {
        // Review was completed recently, allow push
        return;
      }

      // Review not complete or stale - block with helpful error message
      const changeCount = changes.length;
      const fileList = changes.slice(0, 5).join("\n  ");
      const moreFiles = changeCount > 5 ? `\n  ... and ${changeCount - 5} more files` : "";

      if (markerStatus === "stale") {
        throw new Error(
          `CODE REVIEW REQUIRED - Your review marker is stale (> 30 minutes old).

Detected ${changeCount} uncommitted source file(s):
  ${fileList}${moreFiles}

Your previous review was completed more than 30 minutes ago. You need a fresh review.

To proceed, run the review again:
  /review

After review completes, retry the push command.`
        );
      }

      // marker is missing
      throw new Error(
        `CODE REVIEW REQUIRED before push. Detected ${changeCount} uncommitted source file(s):
  ${fileList}${moreFiles}

Code review is mandatory before pushing. Run the code review pipeline:
  /review

This will analyze your changes for:
  - Code quality and project guidelines
  - Error handling and silent failures
  - Unnecessary complexity and simplification opportunities

After review completes and all critical/major findings are fixed, retry the push command.`
      );
    },
  };
};
