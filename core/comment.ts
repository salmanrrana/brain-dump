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
import { createProviderRalphUploader } from "./attachment-types.ts";

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
  | "cursor-agent"
  | "ai"
  | "brain-dump"
  | `ralph:${string}`
  | `${string} ralph`;
export type CommentType =
  | "comment"
  | "work_summary"
  | "test_report"
  | "progress"
  | "change_request"
  | "verification_report";

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

export interface ActivityLogEntry {
  id: string;
  ticketId: string;
  ticketTitle: string;
  content: string;
  author: string;
  type: string;
  createdAt: string;
}

export interface GetActivityLogParams {
  projectId?: string | undefined;
  ticketId?: string | undefined;
  limit?: number | undefined;
}

export interface AddCommentParams {
  ticketId: string;
  content: string;
  author?: CommentAuthor | undefined;
  type?: CommentType | undefined;
}

export interface VerificationReportStep {
  order: number;
  status: string;
  description?: string | undefined;
  expected?: string | undefined;
  actual?: string | undefined;
  coverage?: string[] | undefined;
  evidenceAttachments?: string[] | undefined;
}

export interface AddVerificationReportParams {
  ticketId: string;
  provider: string;
  runId: string;
  status: string;
  summary?: string | undefined;
  manifestAttachmentId?: string | undefined;
  integrityStatus?: string | undefined;
  steps: VerificationReportStep[];
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

function formatVerificationReportContent(params: AddVerificationReportParams): string {
  const lines = [
    `<!-- verification-run:${params.runId} -->`,
    `## Verification ${params.status}`,
    "",
    params.summary ?? `Run ${params.runId} completed with status: ${params.status}.`,
    "",
    `- Run ID: ${params.runId}`,
    `- Integrity: ${params.integrityStatus ?? "unknown"}`,
  ];

  if (params.manifestAttachmentId) {
    lines.push(`- Manifest: ${params.manifestAttachmentId}`);
  }

  lines.push(
    "",
    "| Step | Status | Coverage | Result | Evidence |",
    "| --- | --- | --- | --- | --- |"
  );
  for (const step of params.steps) {
    const details = step.actual ?? step.expected ?? step.description ?? "See evidence";
    const coverage = step.coverage?.length ? step.coverage.join(", ") : "-";
    const evidence = step.evidenceAttachments?.length ? step.evidenceAttachments.join(", ") : "-";
    lines.push(
      `| ${step.order} | ${step.status} | ${coverage.replace(/\|/g, "\\|")} | ${details.replace(/\|/g, "\\|")} | ${evidence} |`
    );
  }

  return lines.join("\n");
}

export function addVerificationReportComment(
  db: DbHandle,
  params: AddVerificationReportParams
): Comment {
  getTicketRow(db, params.ticketId);
  const marker = `<!-- verification-run:${params.runId} -->`;
  const content = formatVerificationReportContent(params);
  const author = createProviderRalphUploader(params.provider);
  const existing = db
    .prepare(
      "SELECT * FROM ticket_comments WHERE ticket_id = ? AND type = 'verification_report' AND content LIKE ? ORDER BY created_at DESC, rowid DESC LIMIT 1"
    )
    .get(params.ticketId, `${marker}%`) as DbCommentRow | undefined;

  if (existing) {
    db.prepare("UPDATE ticket_comments SET content = ?, author = ? WHERE id = ?").run(
      content,
      author,
      existing.id
    );
    const row = db
      .prepare("SELECT * FROM ticket_comments WHERE id = ?")
      .get(existing.id) as DbCommentRow;
    return toComment(row);
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at) VALUES (?, ?, ?, ?, 'verification_report', ?)"
  ).run(id, params.ticketId, content, author, now);
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

/**
 * Get a chronological activity log across tickets.
 * Joins comments with ticket titles for a unified activity stream.
 * Supports filtering by project and/or ticket.
 */
export function getActivityLog(db: DbHandle, params: GetActivityLogParams): ActivityLogEntry[] {
  const { projectId, ticketId, limit = 20 } = params;

  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (projectId) {
    conditions.push("t.project_id = ?");
    values.push(projectId);
  }

  if (ticketId) {
    conditions.push("tc.ticket_id = ?");
    values.push(ticketId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `SELECT tc.id, tc.ticket_id, t.title AS ticket_title,
              tc.content, tc.author, tc.type, tc.created_at
       FROM ticket_comments tc
       JOIN tickets t ON tc.ticket_id = t.id
       ${where}
       ORDER BY tc.created_at DESC, tc.rowid DESC
       LIMIT ?`
    )
    .all(...values, limit) as Array<{
    id: string;
    ticket_id: string;
    ticket_title: string;
    content: string;
    author: string;
    type: string;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    ticketId: r.ticket_id,
    ticketTitle: r.ticket_title,
    content: r.content,
    author: r.author,
    type: r.type,
    createdAt: r.created_at,
  }));
}
