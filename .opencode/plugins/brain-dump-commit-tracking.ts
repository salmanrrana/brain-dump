/**
 * Brain Dump Commit Tracking Plugin for OpenCode
 *
 * Outputs MCP commands to link commits to tickets after each git commit.
 * This maintains an audit trail and helps the AI remember to link its work.
 *
 * Workflow:
 * 1. Detects completion of a `git commit` Bash command
 * 2. Checks if Ralph mode is active (`.claude/ralph-state.json` exists)
 * 3. Extracts the commit hash from the git output
 * 4. Reads ticketId from the Ralph state file
 * 5. Outputs suggested MCP command: `link_commit_to_ticket({ ticketId, commitHash })`
 * 6. Checks if a PR exists on the branch
 * 7. If PR exists, outputs: `link_pr_to_ticket({ ticketId, prNumber })`
 *
 * All errors are handled gracefully - failing silently if not in Ralph mode or commands fail.
 *
 * Reference: https://opencode.ai/docs/plugins/
 */

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Safely execute a shell command and return output
 * Returns empty string on error and logs for debugging
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
 * Escapes a string for safe use in shell commands
 * Replaces special characters that could be interpreted by the shell
 */
function escapeShellArg(arg: string): string {
  // Use single quotes and escape any single quotes within the string
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Extracts commit hash from git output
 * Looks for pattern like [branch shortHash]
 */
function extractCommitHash(output: string): string {
  // Try to extract from common git commit output patterns
  // Pattern: [feature/abc123... 1a2b3c4] commit message
  const match = output.match(/\[[^\]]*\s+([a-f0-9]{7,})\]/);
  if (match) {
    return match[1];
  }
  // Fallback: look for any 7+ character hex string
  const hexMatch = output.match(/([a-f0-9]{7,})/);
  return hexMatch ? hexMatch[1] : "";
}

/**
 * Reads ticket ID from Ralph state file
 * Logs errors to help debug state file issues
 */
function readTicketIdFromState(stateFilePath: string): string {
  try {
    const content = readFileSync(stateFilePath, "utf-8");
    const state = JSON.parse(content);
    return state.ticketId || "";
  } catch (error) {
    // Log error context to help debug state file issues
    console.error(`[Brain Dump] Failed to read Ralph state file: ${stateFilePath}`);
    if (error instanceof Error) {
      console.error(`[Brain Dump] Error: ${error.message}`);
    }
    return "";
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
     * Called after Bash tool completes
     * Outputs MCP commands to link commits to tickets if git commit was successful
     */
    "tool.execute.after": async (input: any, output: any) => {
      const toolName = input.tool || "";
      const toolInput = input.params || {};

      // Only handle Bash tool
      if (toolName !== "Bash") {
        return;
      }

      // Get the command that was executed
      const command = toolInput.command || "";

      // Only care about git commit commands
      if (!command.includes("git commit")) {
        return;
      }

      // Check if Ralph mode is active
      const stateFilePath = join(projectPath, ".claude", "ralph-state.json");
      if (!existsSync(stateFilePath)) {
        // Not in Ralph mode - silently return
        return;
      }

      // Convert output to string if needed
      let outputStr = typeof output === "string" ? output : JSON.stringify(output);

      // Extract commit hash from output
      const commitHash = extractCommitHash(outputStr);
      if (!commitHash) {
        // Commit likely failed or was a no-op
        return;
      }

      // Read ticket ID from Ralph state
      const ticketId = readTicketIdFromState(stateFilePath);
      if (!ticketId) {
        // No ticket ID found
        return;
      }

      // Get short commit hash for display
      const shortHash = commitHash.substring(0, 8);

      // Get current branch
      const branch = safeExec("git branch --show-current", projectPath);

      // Get commit message for display (escaped for shell safety)
      const commitMessage = safeExec(
        `git log -1 --pretty=format:%s ${escapeShellArg(commitHash)}`,
        projectPath
      );

      // Output the link commit command
      console.log("");
      console.log("╔══════════════════════════════════════════════════════════════╗");
      console.log("║  🔗 COMMIT TRACKING                                          ║");
      console.log("╠══════════════════════════════════════════════════════════════╣");
      console.log(
        `║  Commit: ${shortHash}${commitMessage ? ` (${commitMessage.substring(0, 40)})` : ""}`
      );
      console.log(`║  Ticket: ${ticketId}`);
      console.log("╠══════════════════════════════════════════════════════════════╣");
      console.log("║  To link this commit to the ticket, run:                     ║");
      console.log("║                                                              ║");
      console.log(
        `║  link_commit_to_ticket({ ticketId: "${ticketId}", commitHash: "${shortHash}" })`
      );
      console.log("║                                                              ║");

      // Check if PR exists for this branch (escaped for shell safety)
      if (branch) {
        const prNumber = safeExec(
          `gh pr list --head ${escapeShellArg(branch)} --json number --jq '.[0].number // ""'`,
          projectPath
        );

        if (prNumber) {
          console.log("║  If you also want to link the PR to the ticket:             ║");
          console.log("║                                                              ║");
          console.log(`║  link_pr_to_ticket({ ticketId: "${ticketId}", prNumber: ${prNumber} })`);
          console.log("║                                                              ║");
        }
      }

      console.log("╚══════════════════════════════════════════════════════════════╝");
      console.log("");
    },
  };
};
