/**
 * Brain Dump Review Marker Plugin for OpenCode
 *
 * Automatically creates a `.claude/.review-completed` marker file after the AI review
 * phase completes successfully. This marker is checked by the review guard plugin to
 * allow/block git push operations.
 *
 * Workflow:
 * 1. Detects completion of mcp__brain-dump__check_review_complete
 * 2. Parses output to determine if review is complete
 * 3. If review complete, creates/touches `.claude/.review-completed` marker file
 * 4. Marker file contains ISO timestamp for staleness checking
 *
 * The review guard plugin checks this marker (< 30 minutes old) before allowing push.
 *
 * Reference: https://opencode.ai/docs/plugins/
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

/**
 * Checks if check_review_complete output indicates review is complete
 */
function isReviewComplete(output: any): boolean {
  let outputStr = typeof output === "string" ? output : JSON.stringify(output);

  // Check for explicit success indicators
  if (outputStr.includes('"complete": true') || outputStr.includes("'complete': true")) {
    return true;
  }

  if (
    outputStr.includes('"canProceedToHumanReview": true') ||
    outputStr.includes("'canProceedToHumanReview': true")
  ) {
    return true;
  }

  // Check for no open critical or major findings
  if (outputStr.includes('"openCritical": 0') || outputStr.includes("'openCritical': 0")) {
    if (outputStr.includes('"openMajor": 0') || outputStr.includes("'openMajor': 0")) {
      return true;
    }
  }

  // Check for success message in output
  if (outputStr.includes("✅ Review complete") || outputStr.includes("Review complete!")) {
    return true;
  }

  return false;
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
     * Called after mcp__brain-dump__check_review_complete completes
     * Creates marker file if review is complete
     */
    "tool.execute.after": async (input: any, output: any) => {
      const toolName = input.tool || "";

      // Only handle check_review_complete
      if (toolName !== "mcp__brain-dump__check_review_complete") {
        return;
      }

      // Check if review is complete
      if (!isReviewComplete(output)) {
        // Review not complete - do nothing
        return;
      }

      try {
        // Ensure .claude directory exists
        const claudeDir = join(projectPath, ".claude");
        mkdirSync(claudeDir, { recursive: true });

        // Create marker file with timestamp
        const markerPath = join(claudeDir, ".review-completed");
        const timestamp = new Date().toISOString();
        writeFileSync(markerPath, timestamp, "utf-8");

        // Output success message
        console.log("");
        console.log("╔══════════════════════════════════════════════════════════════╗");
        console.log("║  ✅ REVIEW MARKER CREATED                                    ║");
        console.log("╠══════════════════════════════════════════════════════════════╣");
        console.log("║  Review is complete! Marker file created for git push.        ║");
        console.log(`║  Timestamp: ${timestamp}`);
        console.log("║  You can now push your changes with: git push                ║");
        console.log("╚══════════════════════════════════════════════════════════════╝");
        console.log("");
      } catch (error) {
        // Log error but don't break workflow
        console.error("[Brain Dump] Failed to create review marker file");
        if (error instanceof Error) {
          console.error(`[Brain Dump] Error: ${error.message}`);
        }
      }
    },
  };
};
