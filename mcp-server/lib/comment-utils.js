/**
 * Shared comment utilities for Brain Dump MCP server.
 * Provides consistent comment creation, fetching, and formatting with proper error handling.
 * @module lib/comment-utils
 */
import { randomUUID } from "crypto";
import { log } from "./logging.js";
import { detectAuthor } from "./environment.js";

/**
 * Maximum number of comments to include in workflow start-work context.
 * If there are more comments, only the most recent ones are included.
 */
export const MAX_COMMENTS_IN_CONTEXT = 10;

/** Comment type to display label mapping */
export const COMMENT_TYPE_LABELS = {
  work_summary: "📋 Work Summary",
  test_report: "🧪 Test Report",
  progress: "📈 Progress",
  comment: "💬 Comment",
};

/**
 * Add a comment to a ticket with proper error handling.
 * @param {import("better-sqlite3").Database} db
 * @param {string} ticketId
 * @param {string} content
 * @param {string} author - One of: "claude", "ralph", "user", "opencode", "cursor", "vscode", or null to auto-detect
 * @param {string} type - One of: "comment", "work_summary", "test_report", "progress"
 * @returns {{ success: boolean, id?: string, error?: string }}
 */
export function addComment(db, ticketId, content, author = null, type = "comment") {
  // Auto-detect author if not provided (or explicitly null)
  if (author === null || author === undefined) {
    author = detectAuthor();
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  try {
    db.prepare(
      "INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, ticketId, content.trim(), author, type, now);
    log.info(`Added ${type} to ticket ${ticketId} by ${author}`);
    return { success: true, id };
  } catch (err) {
    log.error(`Failed to add ${type} to ticket ${ticketId}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Fetch and format comments for a ticket.
 * Returns the most recent comments (up to MAX_COMMENTS_IN_CONTEXT).
 *
 * @param {import("better-sqlite3").Database} db
 * @param {string} ticketId
 * @returns {{ comments: Array<{content: string, author: string, type: string, created_at: string}>, totalCount: number, truncated: boolean }}
 */
export function fetchTicketComments(db, ticketId) {
  try {
    // Get total count first
    const countResult = db.prepare(`
      SELECT COUNT(*) as count FROM ticket_comments WHERE ticket_id = ?
    `).get(ticketId);
    const totalCount = countResult?.count || 0;

    if (totalCount === 0) {
      return { comments: [], totalCount: 0, truncated: false };
    }

    // Fetch most recent comments (ordered by created_at DESC, then reverse for chronological display)
    const comments = db.prepare(`
      SELECT content, author, type, created_at
      FROM ticket_comments
      WHERE ticket_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(ticketId, MAX_COMMENTS_IN_CONTEXT);

    // Reverse to get chronological order (oldest first among the selected)
    comments.reverse();

    return {
      comments,
      totalCount,
      truncated: totalCount > MAX_COMMENTS_IN_CONTEXT,
    };
  } catch (err) {
    log.error(`Failed to fetch comments for ticket ${ticketId}:`, err);
    return {
      comments: [],
      totalCount: 0,
      truncated: false,
      error: err.message,
    };
  }
}

/**
 * Format a single comment for display.
 * @param {{ content: string, author: string, type: string, created_at: string }} comment
 * @returns {string}
 */
export function formatComment(comment) {
  const date = new Date(comment.created_at);
  const dateStr = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const typeLabel = COMMENT_TYPE_LABELS[comment.type] || "💬 Comment";

  return `**${comment.author}** (${typeLabel}) - ${dateStr}:\n${comment.content}`;
}

/**
 * Build the comments section for ticket context.
 * @param {Array<{content: string, author: string, type: string, created_at: string}>} comments
 * @param {number} totalCount
 * @param {boolean} truncated
 * @returns {string}
 */
export function buildCommentsSection(comments, totalCount, truncated) {
  if (comments.length === 0) {
    return "";
  }

  const header = truncated
    ? `### Previous Comments (${comments.length} of ${totalCount} shown)\n\n*Note: ${totalCount - comments.length} older comment(s) not shown. Check the ticket UI for full history.*\n\n`
    : `### Previous Comments (${totalCount})\n\n`;

  const formattedComments = comments.map(formatComment).join("\n\n---\n\n");

  return `${header}${formattedComments}\n`;
}
