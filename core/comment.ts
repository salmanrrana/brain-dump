/**
 * Comment business logic for the core layer.
 *
 * Extracted from mcp-server/tools/comments.ts.
 * All functions take a DbHandle and return typed results or throw CoreError subclasses.
 */

import { randomUUID } from "crypto";
import type { DbHandle, Comment } from "./types.ts";
import { TicketNotFoundError } from "./errors.ts";
import type { DbTicketRow, DbCommentRow } from "./db-rows.ts";

// ============================================
// Types
// ============================================

export type CommentAuthor =
  | "claude"
  | "ralph"
  | "user"
  | "opencode"
  | "cursor"
  | "vscode"
  | "copilot"
  | "codex"
  | "ai"
  | "brain-dump";
export type CommentType = "comment" | "work_summary" | "test_report" | "progress";

// ============================================
// Internal Helpers
// ============================================

function toComment(row: DbCommentRow): Comment {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    content: row.content,
    author: row.author,
    type: row.type as Comment["type"],
    createdAt: row.created_at,
  };
}

function getTicketRow(db: DbHandle, ticketId: string): DbTicketRow {
  const row = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as
    | DbTicketRow
    | undefined;
  if (!row) throw new TicketNotFoundError(ticketId);
  return row;
}

// ============================================
// Public API
// ============================================

export interface AddCommentParams {
  ticketId: string;
  content: string;
  author?: CommentAuthor | undefined;
  type?: CommentType | undefined;
}

/**
 * Add a comment or work summary to a ticket.
 * @throws TicketNotFoundError if the ticket doesn't exist
 */
export function addComment(db: DbHandle, params: AddCommentParams): Comment {
  const { ticketId, content, author = "claude", type = "comment" } = params;

  getTicketRow(db, ticketId);

  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    "INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, ticketId, content.trim(), author, type, now);

  const row = db.prepare("SELECT * FROM ticket_comments WHERE id = ?").get(id) as DbCommentRow;
  return toComment(row);
}

/**
 * List all comments for a ticket, sorted by creation date (newest first).
 * @throws TicketNotFoundError if the ticket doesn't exist
 */
export function listComments(db: DbHandle, ticketId: string): Comment[] {
  getTicketRow(db, ticketId);

  const rows = db
    .prepare(
      "SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at DESC, rowid DESC"
    )
    .all(ticketId) as DbCommentRow[];

  return rows.map(toComment);
}
