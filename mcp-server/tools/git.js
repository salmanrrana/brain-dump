/**
 * Git integration tools for Brain Dump MCP server.
 * @module tools/git
 */
import { z } from "zod";
import { existsSync } from "fs";
import { log } from "../lib/logging.js";
import { runGitCommand, shortId } from "../lib/git-utils.js";

/**
 * Register git integration tools with the MCP server.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {import("better-sqlite3").Database} db
 */
export function registerGitTools(server, db) {
  // Link commit to ticket
  server.tool(
    "link_commit_to_ticket",
    `Link a git commit to a ticket.

Stores the commit reference in the ticket's metadata.
Multiple commits can be linked to a single ticket.

Use this to track which commits are related to a ticket.
The commit can be queried later to see all work done.

Args:
  ticketId: The ticket ID to link the commit to
  commitHash: The git commit hash (full or short)
  message: Optional commit message (auto-fetched if not provided)

Returns:
  Updated list of linked commits for the ticket.`,
    {
      ticketId: z.string().describe("Ticket ID to link the commit to"),
      commitHash: z.string().describe("Git commit hash (full or abbreviated)"),
      message: z.string().optional().describe("Optional commit message (auto-fetched if in git repo)"),
    },
    async ({ ticketId, commitHash, message }) => {
      const ticket = db.prepare(`
        SELECT t.*, p.name as project_name, p.path as project_path
        FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
      `).get(ticketId);

      if (!ticket) {
        return { content: [{ type: "text", text: `Ticket not found: ${ticketId}` }], isError: true };
      }

      let commitMessage = message || "";
      if (!commitMessage && existsSync(ticket.project_path)) {
        const gitCheck = runGitCommand("git rev-parse --git-dir", ticket.project_path);
        if (gitCheck.success) {
          const msgResult = runGitCommand(`git log -1 --format=%s ${commitHash} 2>/dev/null`, ticket.project_path);
          if (msgResult.success && msgResult.output) commitMessage = msgResult.output;
        }
      }

      let linkedCommits = [];
      if (ticket.linked_commits) {
        try {
          linkedCommits = JSON.parse(ticket.linked_commits);
        } catch (parseErr) {
          log.warn(`Failed to parse linked_commits for ticket ${ticketId}:`, parseErr);
          linkedCommits = [];
        }
      }

      const alreadyLinked = linkedCommits.some(c => c.hash === commitHash || c.hash.startsWith(commitHash) || commitHash.startsWith(c.hash));
      if (alreadyLinked) {
        return {
          content: [{ type: "text", text: `Commit ${commitHash} is already linked to this ticket.\n\nLinked commits:\n${JSON.stringify(linkedCommits, null, 2)}` }],
        };
      }

      linkedCommits.push({ hash: commitHash, message: commitMessage, linkedAt: new Date().toISOString() });

      const now = new Date().toISOString();
      db.prepare("UPDATE tickets SET linked_commits = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(linkedCommits), now, ticketId);

      log.info(`Linked commit ${commitHash} to ticket ${ticketId}`);

      return {
        content: [{
          type: "text",
          text: `Commit linked to ticket "${ticket.title}"!\n\nCommit: ${commitHash}\nMessage: ${commitMessage || "(no message)"}\n\nAll linked commits (${linkedCommits.length}):\n${linkedCommits.map(c => `- ${shortId(c.hash)}: ${c.message || "(no message)"}`).join("\n")}`,
        }],
      };
    }
  );

  // Link PR to ticket
  server.tool(
    "link_pr_to_ticket",
    `Link a GitHub PR to a ticket for status tracking.

Associates a pull request with a ticket so the UI can display PR status.
Call this after creating a PR with 'gh pr create'.

Args:
  ticketId: The ticket ID to link the PR to
  prNumber: The GitHub PR number
  prUrl: Optional full PR URL (auto-generated if not provided)
  prStatus: Optional status ('draft', 'open', 'merged', 'closed') - defaults to 'open'

Returns:
  Updated ticket with PR information.`,
    {
      ticketId: z.string().describe("Ticket ID to link the PR to"),
      prNumber: z.number().int().describe("GitHub PR number"),
      prUrl: z.string().optional().describe("Full PR URL (optional, will be auto-generated if in git repo)"),
      prStatus: z.enum(["draft", "open", "merged", "closed"]).optional().describe("PR status (default: 'open')"),
    },
    async ({ ticketId, prNumber, prUrl, prStatus }) => {
      const ticket = db.prepare(`
        SELECT t.*, p.name as project_name, p.path as project_path
        FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
      `).get(ticketId);

      if (!ticket) {
        return { content: [{ type: "text", text: `Ticket not found: ${ticketId}` }], isError: true };
      }

      // Try to auto-detect PR URL if not provided
      let finalPrUrl = prUrl;
      if (!finalPrUrl && existsSync(ticket.project_path)) {
        const remoteResult = runGitCommand("git remote get-url origin 2>/dev/null", ticket.project_path);
        if (remoteResult.success && remoteResult.output) {
          const remote = remoteResult.output.trim();
          // Parse GitHub URL (supports both SSH and HTTPS formats)
          const match = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
          if (match) {
            const repoPath = match[1].replace(/\.git$/, "");
            finalPrUrl = `https://github.com/${repoPath}/pull/${prNumber}`;
          }
        }
      }

      const finalStatus = prStatus || "open";
      const now = new Date().toISOString();

      try {
        db.prepare(
          "UPDATE tickets SET pr_number = ?, pr_url = ?, pr_status = ?, updated_at = ? WHERE id = ?"
        ).run(prNumber, finalPrUrl || null, finalStatus, now, ticketId);
      } catch (dbErr) {
        log.error(`Failed to update ticket with PR info: ${dbErr.message}`, { ticketId });
        return { content: [{ type: "text", text: `Failed to link PR: ${dbErr.message}` }], isError: true };
      }

      log.info(`Linked PR #${prNumber} (${finalStatus}) to ticket ${ticketId}`);

      return {
        content: [{
          type: "text",
          text: `PR linked to ticket "${ticket.title}"!

**PR #${prNumber}** - ${finalStatus}
${finalPrUrl ? `**URL:** ${finalPrUrl}` : "(URL not available)"}

The PR status will be displayed on the ticket in the Brain Dump UI.`,
        }],
      };
    }
  );
}
