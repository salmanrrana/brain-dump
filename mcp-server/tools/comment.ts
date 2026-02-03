/**
 * Consolidated comment resource tool for Brain Dump MCP server.
 *
 * Merges 2 individual comment tools into 1 action-dispatched tool.
 * Business logic lives in core/comment.ts.
 *
 * @module tools/comment
 */
import { z } from "zod";
import { log } from "../lib/logging.js";
import { mcpError } from "../lib/mcp-response.ts";
import { requireParam, formatResult, formatEmpty } from "../lib/mcp-format.ts";
import { detectAuthor } from "../lib/environment.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "better-sqlite3";
import { CoreError } from "../../core/errors.ts";
import { addComment, listComments } from "../../core/comment.ts";
import type { CommentAuthor, CommentType } from "../../core/comment.ts";

const ACTIONS = ["add", "list"] as const;
const AUTHORS = ["claude", "ralph", "user", "opencode", "cursor", "vscode", "ai"] as const;
const COMMENT_TYPES = ["comment", "work_summary", "test_report", "progress"] as const;

/**
 * Register the consolidated comment tool with the MCP server.
 */
export function registerCommentTool(server: McpServer, db: Database.Database): void {
  server.tool(
    "comment",
    `Manage ticket comments in Brain Dump. Comments provide audit trails for AI work.

## Actions

### add
Add a comment or work summary to a ticket. Creates an audit trail.
Required params: ticketId, content
Optional params: author, commentType

### list
Get all comments for a ticket, sorted by creation date (newest first).
Required params: ticketId

## Parameters
- action: (required) The operation to perform
- ticketId: Ticket ID. Required for: add, list
- content: Comment text (markdown supported). Required for: add
- author: Who is adding the comment (auto-detected if omitted). Optional for: add
- commentType: Type of comment (comment, work_summary, test_report, progress). Optional for: add`,
    {
      action: z.enum(ACTIONS).describe("The operation to perform"),
      ticketId: z.string().optional().describe("Ticket ID. Required for: add, list"),
      content: z
        .string()
        .optional()
        .describe("Comment content (markdown supported). Required for: add"),
      author: z.enum(AUTHORS).optional().describe("Comment author (auto-detected if omitted)"),
      commentType: z.enum(COMMENT_TYPES).optional().describe("Comment type (default: comment)"),
    },
    async (params: {
      action: (typeof ACTIONS)[number];
      ticketId?: string | undefined;
      content?: string | undefined;
      author?: (typeof AUTHORS)[number] | undefined;
      commentType?: (typeof COMMENT_TYPES)[number] | undefined;
    }) => {
      try {
        switch (params.action) {
          case "add": {
            const ticketId = requireParam(params.ticketId, "ticketId", "add");
            const content = requireParam(params.content, "content", "add");
            const finalAuthor = (params.author || detectAuthor()) as CommentAuthor;
            const commentType = (params.commentType || "comment") as CommentType;

            const comment = addComment(db, {
              ticketId,
              content,
              author: finalAuthor,
              type: commentType,
            });

            log.info(`Added ${commentType} to ticket ${ticketId} by ${finalAuthor}`);
            return formatResult(comment, "Comment added!");
          }

          case "list": {
            const ticketId = requireParam(params.ticketId, "ticketId", "list");
            const comments = listComments(db, ticketId);

            if (comments.length === 0) {
              return formatEmpty("comments for this ticket");
            }
            return formatResult(comments);
          }
        }
      } catch (err) {
        if (err instanceof CoreError) {
          log.error(`comment/${params.action} failed: ${err.message}`);
        }
        return mcpError(err);
      }
    }
  );
}
