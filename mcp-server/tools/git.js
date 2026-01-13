/**
 * Git integration tools for Brain Dump MCP server.
 * @module tools/git
 */
import { z } from "zod";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { log } from "../lib/logging.js";

function runGitCommand(command, cwd) {
  try {
    const output = execSync(command, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    return { success: true, output: output.trim() };
  } catch (error) {
    return { success: false, output: "", error: error.stderr?.trim() || error.message };
  }
}

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
        try { linkedCommits = JSON.parse(ticket.linked_commits); } catch { linkedCommits = []; }
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
          text: `Commit linked to ticket "${ticket.title}"!\n\nCommit: ${commitHash}\nMessage: ${commitMessage || "(no message)"}\n\nAll linked commits (${linkedCommits.length}):\n${linkedCommits.map(c => `- ${c.hash.substring(0, 8)}: ${c.message || "(no message)"}`).join("\n")}`,
        }],
      };
    }
  );
}
