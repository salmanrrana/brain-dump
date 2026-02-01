/**
 * Ticket comment tools for Brain Dump MCP server.
 * @module tools/comments
 */
import { z } from "zod";
import { randomUUID } from "crypto";
import { log } from "../lib/logging.js";
import { detectAuthor } from "../lib/environment.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "better-sqlite3";
import type { DbTicket, DbTicketComment } from "../types.js";

const AUTHORS = ["claude", "ralph", "user", "opencode", "cursor", "vscode", "ai"] as const;
const COMMENT_TYPES = ["comment", "work_summary", "test_report", "progress"] as const;

/**
 * Register ticket comment tools with the MCP server.
 */
export function registerCommentTools(server: McpServer, db: Database.Database): void {
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
      content: z
        .string()
        .describe(
          "Comment content (markdown supported). For work summaries, include: what was done, files changed, tests run."
        ),
      author: z
        .enum(AUTHORS)
        .optional()
        .describe("Who is adding the comment (auto-detected from environment if not provided)"),
      type: z.enum(COMMENT_TYPES).optional().describe("Type of comment (default: comment)"),
    },
    async ({
      ticketId,
      content,
      author,
      type = "comment",
    }: {
      ticketId: string;
      content: string;
      author?: (typeof AUTHORS)[number] | undefined;
      type?: (typeof COMMENT_TYPES)[number] | undefined;
    }) => {
      // Auto-detect author if not provided
      const finalAuthor = author || detectAuthor();

      const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as
        | DbTicket
        | undefined;
      if (!ticket) {
        return {
          content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
          isError: true,
        };
      }

      const id = randomUUID();
      const now = new Date().toISOString();

      try {
        db.prepare(
          "INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(id, ticketId, content.trim(), finalAuthor, type, now);

        const comment = db
          .prepare("SELECT * FROM ticket_comments WHERE id = ?")
          .get(id) as DbTicketComment;
        log.info(`Added ${type} to ticket ${ticketId} by ${finalAuthor}`);

        return {
          content: [
            {
              type: "text",
              text: `Comment added to ticket "${ticket.title}"!\n\n${JSON.stringify(comment)}`,
            },
          ],
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log.error(`Failed to add comment to ticket "${ticket.title}": ${errorMsg}`);
        return {
          content: [
            {
              type: "text",
              text: `Failed to add comment: ${errorMsg}`,
            },
          ],
          isError: true,
        };
      }
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
    async ({ ticketId }: { ticketId: string }) => {
      const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as
        | DbTicket
        | undefined;
      if (!ticket) {
        return {
          content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
          isError: true,
        };
      }

      const comments = db
        .prepare("SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at DESC")
        .all(ticketId) as DbTicketComment[];

      return {
        content: [
          {
            type: "text",
            text:
              comments.length > 0
                ? JSON.stringify(comments)
                : `No comments found for ticket "${ticket.title}".`,
          },
        ],
      };
    }
  );
}
