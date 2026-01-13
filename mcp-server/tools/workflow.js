/**
 * Workflow tools for Brain Dump MCP server.
 * Handles starting and completing ticket work (includes git branch creation).
 * @module tools/workflow
 */
import { z } from "zod";
import { existsSync } from "fs";
import { log } from "../lib/logging.js";
import { runGitCommand, shortId, generateBranchName } from "../lib/git-utils.js";

/**
 * Register workflow tools with the MCP server.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {import("better-sqlite3").Database} db
 * @param {Function} detectEnvironment - Environment detection function
 */
export function registerWorkflowTools(server, db, detectEnvironment) {
  // Start ticket work
  server.tool(
    "start_ticket_work",
    `Start working on a ticket.

This tool:
1. Creates a git branch: feature/{ticket-short-id}-{slug}
2. Sets the ticket status to in_progress
3. Returns the branch name and ticket context

Use this when picking up a ticket to work on.
The project must have a git repository initialized.

Args:
  ticketId: The ticket ID to start working on

Returns:
  Branch name, ticket details, and project path for context.`,
    { ticketId: z.string().describe("Ticket ID to start working on") },
    async ({ ticketId }) => {
      const ticket = db.prepare(`
        SELECT t.*, p.name as project_name, p.path as project_path
        FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
      `).get(ticketId);

      if (!ticket) {
        return { content: [{ type: "text", text: `Ticket not found: ${ticketId}` }], isError: true };
      }

      if (ticket.status === "in_progress") {
        return { content: [{ type: "text", text: `Ticket is already in progress.\n\n${JSON.stringify(ticket, null, 2)}` }] };
      }

      if (!existsSync(ticket.project_path)) {
        return { content: [{ type: "text", text: `Project path does not exist: ${ticket.project_path}` }], isError: true };
      }

      const gitCheck = runGitCommand("git rev-parse --git-dir", ticket.project_path);
      if (!gitCheck.success) {
        return { content: [{ type: "text", text: `Not a git repository: ${ticket.project_path}\n\nInitialize git first: git init` }], isError: true };
      }

      const branchName = generateBranchName(ticketId, ticket.title);
      const branchExists = runGitCommand(`git show-ref --verify --quiet refs/heads/${branchName}`, ticket.project_path);

      let branchCreated = false;
      if (!branchExists.success) {
        const createBranch = runGitCommand(`git checkout -b ${branchName}`, ticket.project_path);
        if (!createBranch.success) {
          return { content: [{ type: "text", text: `Failed to create branch ${branchName}: ${createBranch.error}` }], isError: true };
        }
        branchCreated = true;
      } else {
        const checkoutBranch = runGitCommand(`git checkout ${branchName}`, ticket.project_path);
        if (!checkoutBranch.success) {
          return { content: [{ type: "text", text: `Failed to checkout branch ${branchName}: ${checkoutBranch.error}` }], isError: true };
        }
      }

      const now = new Date().toISOString();
      db.prepare("UPDATE tickets SET status = 'in_progress', updated_at = ? WHERE id = ?").run(now, ticketId);

      const updatedTicket = db.prepare(`
        SELECT t.*, p.name as project_name, p.path as project_path
        FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
      `).get(ticketId);

      log.info(`Started work on ticket ${ticketId}: branch ${branchName}`);

      return {
        content: [{
          type: "text",
          text: `Started work on ticket!\n\nBranch: ${branchName}\n${branchCreated ? "Created new branch" : "Checked out existing branch"}\n\nProject: ${updatedTicket.project_name}\nPath: ${updatedTicket.project_path}\n\nTicket:\n${JSON.stringify(updatedTicket, null, 2)}`,
        }],
      };
    }
  );

  // Complete ticket work
  server.tool(
    "complete_ticket_work",
    `Complete work on a ticket and move it to review.

This tool:
1. Sets the ticket status to review
2. Gets git commits on the current branch (for PR description)
3. Returns a summary of work done
4. Signals that context should be cleared for fresh perspective on next task

Use this when you've finished implementing a ticket.
Call this before creating a pull request.

Args:
  ticketId: The ticket ID to complete
  summary: Optional work summary to include

Returns:
  Updated ticket, git commits summary, suggested PR description, and context reset guidance.`,
    {
      ticketId: z.string().describe("Ticket ID to complete"),
      summary: z.string().optional().describe("Optional work summary describing what was done"),
    },
    async ({ ticketId, summary }) => {
      const ticket = db.prepare(`
        SELECT t.*, p.name as project_name, p.path as project_path
        FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
      `).get(ticketId);

      if (!ticket) {
        return { content: [{ type: "text", text: `Ticket not found: ${ticketId}` }], isError: true };
      }

      if (ticket.status === "done") {
        return { content: [{ type: "text", text: `Ticket is already done.\n\n${JSON.stringify(ticket, null, 2)}` }] };
      }

      if (ticket.status === "review") {
        return { content: [{ type: "text", text: `Ticket is already in review.\n\n${JSON.stringify(ticket, null, 2)}` }] };
      }

      let commitsInfo = "", prDescription = "";

      if (existsSync(ticket.project_path)) {
        const gitCheck = runGitCommand("git rev-parse --git-dir", ticket.project_path);
        if (gitCheck.success) {
          let baseBranch = "main";
          const mainExists = runGitCommand("git show-ref --verify --quiet refs/heads/main", ticket.project_path);
          if (!mainExists.success) {
            const masterExists = runGitCommand("git show-ref --verify --quiet refs/heads/master", ticket.project_path);
            if (masterExists.success) baseBranch = "master";
          }

          const commitsResult = runGitCommand(
            `git log ${baseBranch}..HEAD --oneline --no-decorate 2>/dev/null || git log -10 --oneline --no-decorate`,
            ticket.project_path
          );

          if (commitsResult.success && commitsResult.output) {
            commitsInfo = commitsResult.output;
            const commitLines = commitsInfo.split("\n").filter(l => l.trim());
            prDescription = `## Summary\n${summary || ticket.title}\n\n## Changes\n${commitLines.map(c => `- ${c.substring(c.indexOf(" ") + 1)}`).join("\n")}\n\n## Ticket\n- ID: ${shortId(ticketId)}\n- Title: ${ticket.title}\n`;
          }
        }
      }

      const now = new Date().toISOString();
      db.prepare("UPDATE tickets SET status = 'review', updated_at = ? WHERE id = ?").run(now, ticketId);

      const updatedTicket = db.prepare(`
        SELECT t.*, p.name as project_name, p.path as project_path
        FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
      `).get(ticketId);

      log.info(`Completed work on ticket ${ticketId}, moved to review`);

      const environment = detectEnvironment();
      const contextResetGuidance = getContextResetGuidance(environment);

      return {
        content: [{
          type: "text",
          text: `Ticket moved to review!\n\nProject: ${updatedTicket.project_name}\nStatus: ${updatedTicket.status}\n\n${commitsInfo ? `Commits:\n${commitsInfo}\n` : ""}${prDescription ? `Suggested PR Description:\n\`\`\`\n${prDescription}\`\`\`\n` : ""}Ticket:\n${JSON.stringify(updatedTicket, null, 2)}\n${contextResetGuidance}\n\n---\nclearContext: true\nenvironment: ${environment}`,
        }],
      };
    }
  );
}

function getContextResetGuidance(environment) {
  if (environment === "claude-code") {
    return `\n## Context Reset Required\n\nThis ticket has been completed. Run \`/clear\` to reset context for the next task.`;
  } else if (environment === "vscode") {
    return `\n## Context Reset Required\n\nThis ticket has been completed. Click "New Chat" or press Cmd/Ctrl+L for the next task.`;
  }
  return `\n## Context Reset Required\n\nThis ticket has been completed. Start a new conversation for the next task.`;
}
