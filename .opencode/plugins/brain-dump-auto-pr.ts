/**
 * Brain Dump Auto-PR Plugin for OpenCode
 *
 * Automatically creates a draft GitHub PR when `start_ticket_work` completes successfully.
 * This ensures PRs are created early and linked to tickets immediately.
 *
 * Workflow:
 * 1. Detects completion of mcp__brain-dump__start_ticket_work
 * 2. Parses output to extract branch name, ticket ID, and ticket title
 * 3. Creates an empty WIP commit
 * 4. Pushes branch to remote with -u flag
 * 5. Creates draft PR via gh pr create
 * 6. Outputs feedback to console
 *
 * All errors are handled gracefully - failure to create PR doesn't block the workflow.
 *
 * Reference: https://opencode.ai/docs/plugins/
 */

import { execSync } from "child_process";

/**
 * Safely execute a shell command and return output
 * Returns empty string on error and logs the error for visibility
 */
function safeExec(command: string, cwd?: string): string {
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
 * Extracts branch name from start_ticket_work output
 * Looks for pattern: feature/{shortId}-{slug}
 */
function extractBranchName(output: string): string {
  const match = output.match(/feature\/[a-f0-9]+-[a-z0-9-]+/);
  return match ? match[0] : "";
}

/**
 * Extracts ticket ID from start_ticket_work output
 * Looks for "id": "..." in JSON
 */
function extractTicketId(output: string): string {
  const match = output.match(/"id":\s*"([^"]+)"/);
  return match ? match[1] : "";
}

/**
 * Extracts ticket title from start_ticket_work output
 * Looks for "title": "..." in JSON
 */
function extractTicketTitle(output: string): string {
  const match = output.match(/"title":\s*"([^"]+)"/);
  return match ? match[1] : "";
}

/**
 * Gets the short ticket ID (first 8 characters)
 */
function getShortId(ticketId: string): string {
  return ticketId.substring(0, 8);
}

/**
 * Escapes a string for safe use in shell commands
 * Replaces special characters that could be interpreted by the shell
 */
function escapeShellArg(arg: string): string {
  // Use single quotes and escape any single quotes within the string
  return `'${arg.replace(/'/g, "'\\''")}'`;
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
     * Called after mcp__brain-dump__start_ticket_work completes successfully.
     * Automatically creates a draft PR.
     */
    "tool.execute.after": async (input: any, output: any) => {
      const toolName = input.tool || "";

      // Only handle start_ticket_work
      if (toolName !== "mcp__brain-dump__start_ticket_work") {
        return;
      }

      // Convert output to string if needed
      let outputStr = typeof output === "string" ? output : JSON.stringify(output);

      // Parse ticket details from output
      const branchName = extractBranchName(outputStr);
      const ticketId = extractTicketId(outputStr);
      const ticketTitle = extractTicketTitle(outputStr);

      if (!branchName || !ticketId || !ticketTitle) {
        // Could not extract required info - likely tool failed or ticket already in progress
        return;
      }

      // Get short ID for commit/PR messages
      const shortId = getShortId(ticketId);

      // Verify we're on the correct branch
      const currentBranch = safeExec("git branch --show-current", projectPath);
      if (currentBranch !== branchName) {
        console.log(`[Brain Dump] Auto-PR: Expected branch ${branchName} but on ${currentBranch}`);
        return;
      }

      // Check if PR already exists for this branch
      const existingPrNumber = safeExec(
        `gh pr list --head ${branchName} --json number --jq '.[0].number // ""'`,
        projectPath
      );
      if (existingPrNumber) {
        console.log(`[Brain Dump] Auto-PR: Draft PR already exists (#${existingPrNumber})`);
        return;
      }

      // Create empty WIP commit (escaped for shell safety)
      const commitMessage = `feat(${shortId}): WIP - ${ticketTitle}\n\nThis is an auto-generated commit to enable PR creation.\nActual implementation follows in subsequent commits.\n\nTicket: ${ticketId}`;
      const commitResult = safeExec(
        `git commit --allow-empty -m ${escapeShellArg(commitMessage)}`,
        projectPath
      );

      if (!commitResult && currentBranch === branchName) {
        // May have failed, but don't exit - try to continue
        console.log(`[Brain Dump] Auto-PR: Note - Could not create WIP commit, continuing...`);
      }

      // Push branch to remote with -u flag
      const pushResult = safeExec(`git push -u origin ${branchName}`, projectPath);
      if (!pushResult) {
        console.log(`[Brain Dump] Auto-PR: Failed to push branch to remote`);
        return;
      }

      // Create draft PR using gh pr create (escaped for shell safety)
      const prTitle = `feat(${shortId}): ${ticketTitle}`;
      const prBody = `## Summary\nWork in progress for ticket: ${ticketId}\n\n**${ticketTitle}**\n\n---\n_This PR was auto-created when work started on the ticket._\n_Draft status will be removed when the ticket is complete._\n\nGenerated with [OpenCode](https://opencode.ai)`;
      const prResult = safeExec(
        `gh pr create --draft --title ${escapeShellArg(prTitle)} --body ${escapeShellArg(prBody)}`,
        projectPath
      );

      if (!prResult) {
        console.log(`[Brain Dump] Auto-PR: Failed to create draft PR`);
        return;
      }

      // Extract PR URL and number from output
      const prUrlMatch = prResult.match(/https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/);
      if (!prUrlMatch) {
        console.log(`[Brain Dump] Auto-PR: Created PR but could not extract PR number`);
        return;
      }

      const prNumber = prUrlMatch[1];
      const prUrl = prUrlMatch[0];

      // Output success feedback
      console.log("");
      console.log("═══════════════════════════════════════");
      console.log("🔗 AUTO-PR CREATED");
      console.log("═══════════════════════════════════════");
      console.log(`Draft PR #${prNumber} created for ticket ${shortId}`);
      console.log(`Title: feat(${shortId}): ${ticketTitle}`);
      console.log(`URL: ${prUrl}`);
      console.log("");
      console.log("The PR has been created and will update as commits are pushed.");
      console.log("═══════════════════════════════════════");
      console.log("");
    },
  };
};
