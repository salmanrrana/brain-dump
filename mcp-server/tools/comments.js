/**
 * Ticket comment tools for Brain Dump MCP server.
 * @module tools/comments
 */
import { z } from "zod";
import { randomUUID } from "crypto";
import { log } from "../lib/logging.js";

const AUTHORS = ["claude", "ralph", "user", "opencode"];
const COMMENT_TYPES = ["comment", "work_summary", "test_report"];

/**
 * Register ticket comment tools with the MCP server.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {import("better-sqlite3").Database} db
 */
export function registerCommentTools(server, db) {
  // Add ticket comment
  server.tool(
    "add_ticket_comment",
    `Add a comment or work summary to a ticket.

Use this to document work completed, test results, or any notes about the ticket.
This creates an audit trail of changes made by Claude or Ralph.

Args:
  ticketId: The ticket ID to add comment to
  content: The comment text (markdown supported)
  author: Who is adding the comment (claude, ralph, or user)
  type: Type of comment (comment, work_summary, test_report)

Returns the created comment.`,
    {
      ticketId: z.string().describe("Ticket ID to add comment to"),
      content: z.string().describe("Comment content (markdown supported). For work summaries, include: what was done, files changed, tests run."),
      author: z.enum(AUTHORS).describe("Who is adding the comment"),
      type: z.enum(COMMENT_TYPES).optional().describe("Type of comment (default: comment)"),
    },
    async ({ ticketId, content, author, type = "comment" }) => {
      const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
      if (!ticket) {
        return {
          content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
          isError: true,
        };
      }

      const id = randomUUID();
      const now = new Date().toISOString();

      db.prepare(
        "INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(id, ticketId, content.trim(), author, type, now);

      const comment = db.prepare("SELECT * FROM ticket_comments WHERE id = ?").get(id);
      log.info(`Added ${type} to ticket ${ticketId} by ${author}`);

      return {
        content: [{ type: "text", text: `Comment added to ticket "${ticket.title}"!\n\n${JSON.stringify(comment, null, 2)}` }],
      };
    }
  );

  // Get ticket comments
  server.tool(
    "get_ticket_comments",
    `Get all comments for a ticket.

Returns array of comments sorted by creation date (newest first).

Args:
  ticketId: The ticket ID to get comments for`,
    { ticketId: z.string().describe("Ticket ID") },
    async ({ ticketId }) => {
      const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
      if (!ticket) {
        return {
          content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
          isError: true,
        };
      }

      const comments = db.prepare(
        "SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at DESC"
      ).all(ticketId);

      return {
        content: [{
          type: "text",
          text: comments.length > 0
            ? JSON.stringify(comments, null, 2)
            : `No comments found for ticket "${ticket.title}".`,
        }],
      };
    }
  );
}
