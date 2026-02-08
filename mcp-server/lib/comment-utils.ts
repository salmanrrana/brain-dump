/**
 * Shared comment utilities for Brain Dump MCP server.
 * Provides consistent comment creation, fetching, and formatting with proper error handling.
 * @module lib/comment-utils
 */
import { randomUUID } from "crypto";
import { log } from "./logging.js";
import { detectAuthor } from "./environment.js";
import Database from "better-sqlite3";

// ============================================
// Type Definitions
// ============================================

/** Comment type labels for display */
interface CommentTypeLabels {
  work_summary: string;
  test_report: string;
  progress: string;
  comment: string;
}

/** Comment type - must match database values */
type CommentType = "comment" | "work_summary" | "test_report" | "progress";

/** Author type - who created the comment */
type CommentAuthor =
  | "claude"
  | "ralph"
  | "user"
  | "opencode"
  | "cursor"
  | "vscode"
  | null;

/** Comment record from database */
interface TicketComment {
  content: string;
  author: string;
  type: string;
  created_at: string;
}

/** Result from adding a comment */
interface AddCommentResult {
  success: boolean;
  id?: string;
  error?: string;
}

/** Result from fetching comments */
interface FetchCommentsResult {
  comments: TicketComment[];
  totalCount: number;
  truncated: boolean;
  error?: string;
}

// ============================================
// Constants
// ============================================

/**
 * Maximum number of comments to include in workflow start-work context.
 * If there are more comments, only the most recent ones are included.
 */
export const MAX_COMMENTS_IN_CONTEXT = 10;

/** Comment type to display label mapping */
export const COMMENT_TYPE_LABELS: CommentTypeLabels = {
  work_summary: "📋 Work Summary",
  test_report: "🧪 Test Report",
  progress: "📈 Progress",
  comment: "💬 Comment",
};

// ============================================
// Main Functions
// ============================================

/**
 * Add a comment to a ticket with proper error handling.
 */
export function addComment(
  db: Database.Database,
  ticketId: string,
  content: string,
  author: CommentAuthor = null,
  type: CommentType = "comment"
): AddCommentResult {
  // Auto-detect author if not provided (or explicitly null)
  let finalAuthor: string;
  if (author === null || author === undefined) {
    finalAuthor = detectAuthor();
  } else {
    finalAuthor = author;
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  try {
    db.prepare(
      "INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, ticketId, content.trim(), finalAuthor, type, now);
    log.info(`Added ${type} to ticket ${ticketId} by ${finalAuthor}`);
    return { success: true, id };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error(`Failed to add ${type} to ticket ${ticketId}: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

/**
 * Fetch and format comments for a ticket.
 * Returns the most recent comments (up to MAX_COMMENTS_IN_CONTEXT).
 */
export function fetchTicketComments(
  db: Database.Database,
  ticketId: string
): FetchCommentsResult {
  try {
    // Get total count first
    const countResult = db
      .prepare(`
      SELECT COUNT(*) as count FROM ticket_comments WHERE ticket_id = ?
    `)
      .get(ticketId) as { count: number } | undefined;
    const totalCount = countResult?.count || 0;

    if (totalCount === 0) {
      return { comments: [], totalCount: 0, truncated: false };
    }

    // Fetch most recent comments (ordered by created_at DESC, then reverse for chronological display)
    const comments = db
      .prepare(
        `
      SELECT content, author, type, created_at
      FROM ticket_comments
      WHERE ticket_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `
      )
      .all(ticketId, MAX_COMMENTS_IN_CONTEXT) as TicketComment[];

    // Reverse to get chronological order (oldest first among the selected)
    comments.reverse();

    return {
      comments,
      totalCount,
      truncated: totalCount > MAX_COMMENTS_IN_CONTEXT,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error(
      `Failed to fetch comments for ticket ${ticketId}:`,
      err instanceof Error ? err : new Error(errorMsg)
    );
    return {
      comments: [],
      totalCount: 0,
      truncated: false,
      error: errorMsg,
    };
  }
}

/**
 * Format a single comment for display.
 */
export function formatComment(comment: TicketComment): string {
  const date = new Date(comment.created_at);
  const dateStr = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const typeLabel =
    COMMENT_TYPE_LABELS[comment.type as keyof CommentTypeLabels] ||
    "💬 Comment";

  return `**${comment.author}** (${typeLabel}) - ${dateStr}:\n${comment.content}`;
}

/**
 * Build the comments section for ticket context.
 */
export function buildCommentsSection(
  comments: TicketComment[],
  totalCount: number,
  truncated: boolean
): string {
  if (comments.length === 0) {
    return "";
  }

  const header = truncated
    ? `### Previous Comments (${comments.length} of ${totalCount} shown)\n\n*Note: ${totalCount - comments.length} older comment(s) not shown. Check the ticket UI for full history.*\n\n`
    : `### Previous Comments (${totalCount})\n\n`;

  const formattedComments = comments.map(formatComment).join("\n\n---\n\n");

  return `${header}${formattedComments}\n`;
}
