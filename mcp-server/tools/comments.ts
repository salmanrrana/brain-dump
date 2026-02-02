/**
 * Ticket comment tools for Brain Dump MCP server.
 *
 * These are thin wrappers around core/comment.ts functions.
 * Business logic lives in the core layer; this file only handles
 * MCP protocol formatting and Zod input schemas.
 *
 * @module tools/comments
 */
import { z } from "zod";
import { log } from "../lib/logging.js";
import { mcpError } from "../lib/mcp-response.ts";
import { detectAuthor } from "../lib/environment.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "better-sqlite3";
import { CoreError } from "../../core/errors.ts";
import { addComment, listComments } from "../../core/comment.ts";
import type { CommentAuthor, CommentType } from "../../core/comment.ts";

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
      try {
        const finalAuthor = (author || detectAuthor()) as CommentAuthor;

        const comment = addComment(db, {
          ticketId,
          content,
          author: finalAuthor,
          type: type as CommentType,
        });

        log.info(`Added ${type} to ticket ${ticketId} by ${finalAuthor}`);

        return {
          content: [
            {
              type: "text" as const,
              text: `Comment added!\n\n${JSON.stringify(comment)}`,
            },
          ],
        };
      } catch (err) {
        if (err instanceof CoreError) {
          log.error(`Failed to add comment to ticket ${ticketId}: ${err.message}`);
        }
        return mcpError(err);
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
      try {
        const comments = listComments(db, ticketId);

        return {
          content: [
            {
              type: "text" as const,
              text:
                comments.length > 0
                  ? JSON.stringify(comments)
                  : `No comments found for this ticket.`,
            },
          ],
        };
      } catch (err) {
        if (err instanceof CoreError) {
          log.error(`Failed to get comments for ticket ${ticketId}: ${err.message}`);
        }
        return mcpError(err);
      }
    }
  );
}
