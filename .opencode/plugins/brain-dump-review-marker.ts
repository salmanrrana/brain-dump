/**
 * Brain Dump Review Marker Plugin for OpenCode
 *
 * Automatically creates a `.claude/.review-completed` marker file after the AI review
 * phase completes successfully. This marker is checked by the review guard plugin to
 * allow/block git push operations.
 *
 * Workflow:
 * 1. Detects completion of review check-complete calls
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
 * Checks if review check-complete output indicates review is complete
 * Parses JSON and validates structured fields to determine if all critical/major findings are resolved
 */
function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Most MCP tool outputs are plain JSON strings.
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through to substring extraction.
  }

  // Some wrappers prepend text before JSON payload.
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function extractReviewPayload(output: any): Record<string, unknown> | null {
  if (output && typeof output === "object" && !Array.isArray(output)) {
    // Direct structured payload
    if (
      "complete" in output ||
      "canProceedToHumanReview" in output ||
      "openCritical" in output ||
      "openMajor" in output
    ) {
      return output as Record<string, unknown>;
    }

    // MCP-style response with content blocks
    const content = (output as { content?: unknown }).content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block && typeof block === "object" && "text" in block) {
          const text = (block as { text?: unknown }).text;
          if (typeof text === "string") {
            const parsed = extractJsonObject(text);
            if (parsed) return parsed;
          }
        }
      }
    }
  }

  if (typeof output === "string") {
    return extractJsonObject(output);
  }

  return null;
}

function isReviewComplete(output: any): boolean {
  try {
    const data = extractReviewPayload(output);

    // Validate we have an object to work with
    if (!data || typeof data !== "object") {
      console.error("[Brain Dump] Review complete check failed: output is not a valid object");
      return false;
    }

    // Check explicit success indicators with proper type safety
    if (data.complete === true) {
      return true;
    }

    if (data.canProceedToHumanReview === true) {
      return true;
    }

    // Check for no open critical/major findings
    if (
      typeof data.openCritical === "number" &&
      data.openCritical === 0 &&
      typeof data.openMajor === "number" &&
      data.openMajor === 0
    ) {
      return true;
    }

    return false;
  } catch (error) {
    // Can't parse output - review status unknown
    // Fail closed: don't create marker if we can't validate the response
    console.error(
      `[Brain Dump] Could not parse review complete output: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
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
     * Called after review check-complete executes.
     * Creates marker file if review is complete.
     */
    "tool.execute.after": async (input: any, output: any) => {
      const toolName = input.tool || "";
      const action =
        input.params?.action || input.input?.action || input.arguments?.action || "";

      // Support both consolidated and legacy review tool naming.
      const isConsolidatedCheckComplete =
        toolName === "mcp__brain-dump__review" && action === "check-complete";
      const isLegacyCheckComplete = toolName === "mcp__brain-dump__check_review_complete";
      if (!isConsolidatedCheckComplete && !isLegacyCheckComplete) {
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
        // Log error with context but don't break workflow
        const markerPath = join(projectPath, ".claude", ".review-completed");
        console.error(`[Brain Dump] Failed to create review marker file at ${markerPath}`);
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`Reason: ${errorMsg}`);
        console.error(
          `[Brain Dump] Note: You may need to manually create this marker or check file permissions.`
        );
      }
    },
  };
};
