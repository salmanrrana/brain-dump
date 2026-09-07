/**
 * Comment business logic for the core layer.
 *
 * Extracted from mcp-server/tools/comments.ts.
 * All functions take a DbHandle and return typed results or throw CoreError subclasses.
 */

import { randomUUID } from "crypto";
import type {
  DbHandle,
  Comment,
  CommentActorKind,
  CommentPhase,
  CommentProvenance,
} from "./types.ts";
import { TicketNotFoundError } from "./errors.ts";
import type { DbTicketRow, DbCommentRow } from "./db-rows.ts";
import { createProviderRalphUploader } from "./attachment-types.ts";
import { getProviderDefinition, PROVIDER_IDS } from "./providers.ts";
import { resolveCommentProvenance, type CommentProvenanceInput } from "./comment-provenance.ts";

export {
  COMMENT_ACTOR_KIND_LABELS,
  COMMENT_PHASE_LABELS,
  resolveCommentProvenance,
  type CommentProvenanceInput,
} from "./comment-provenance.ts";

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
  | "pi"
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

export type CommentIdentityRole = "implementation" | "reviewer";

export interface ResolveCommentIdentityParams {
  phase: CommentPhase;
  actorKind: CommentActorKind;
  role?: CommentIdentityRole | undefined;
  author?: CommentAuthor | undefined;
  provider?: string | null | undefined;
  modelProvider?: string | null | undefined;
  modelName?: string | null | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

export interface ResolvedCommentIdentity extends CommentProvenance {
  author: CommentAuthor;
}

function trimToNull(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

export function resolveCommentAuthor(environment: string, isRalphSession = false): CommentAuthor {
  const provider = PROVIDER_IDS.find((providerId) => providerId === environment);
  const baseAuthor = provider ? getProviderDefinition(provider).commentAuthor : "ai";
  return (isRalphSession ? `ralph:${baseAuthor}` : baseAuthor) as CommentAuthor;
}

export function resolveCommentProviderFromAuthor(
  author: CommentAuthor | string | null | undefined
): string | null {
  const normalized = author
    ?.replace(/^ralph:/, "")
    .replace(/ ralph$/, "")
    .trim();
  if (!normalized || normalized === "ai" || normalized === "ralph" || normalized === "user") {
    return null;
  }
  return (
    PROVIDER_IDS.find(
      (providerId) => getProviderDefinition(providerId).commentAuthor === normalized
    ) ?? null
  );
}

/**
 * Resolve the legacy author plus structured provenance for a canonical producer.
 * Exact model values come only from explicit inputs or the launch environment;
 * provider defaults are never used as a model guess.
 */
export function resolveCommentIdentity(
  params: ResolveCommentIdentityParams
): ResolvedCommentIdentity {
  const env = params.env ?? process.env;
  const reviewerAuthor = trimToNull(env.BRAIN_DUMP_REVIEWER_AUTHOR) as CommentAuthor | null;
  const author =
    params.author ??
    (params.role === "reviewer" && reviewerAuthor ? reviewerAuthor : undefined) ??
    "ai";
  const provider = trimToNull(params.provider) ?? resolveCommentProviderFromAuthor(author);

  if (params.actorKind === "system") {
    return {
      author,
      ...resolveCommentProvenance({
        phase: params.phase,
        actorKind: "system",
        provider,
      }),
    };
  }

  const envModelProvider =
    params.role === "reviewer"
      ? env.BRAIN_DUMP_REVIEWER_MODEL_PROVIDER
      : env.BRAIN_DUMP_LAUNCH_MODEL_PROVIDER;
  const envModelName =
    params.role === "reviewer" ? env.BRAIN_DUMP_REVIEWER_MODEL : env.BRAIN_DUMP_LAUNCH_MODEL;
  const modelName = trimToNull(params.modelName) ?? trimToNull(envModelName);
  const modelProvider = modelName
    ? (trimToNull(params.modelProvider) ?? trimToNull(envModelProvider))
    : null;

  return {
    author,
    ...resolveCommentProvenance({
      phase: params.phase,
      actorKind: "ai",
      provider,
      modelProvider,
      modelName,
    }),
  };
}

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
    phase: row.phase,
    actorKind: row.actor_kind,
    provider: row.provider,
    modelProvider: row.model_provider,
    modelName: row.model_name,
    createdAt: row.created_at,
  };
}

interface DbActivityLogRow extends DbCommentRow {
  ticket_title: string;
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

export interface ActivityLogEntry extends CommentProvenance {
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

export interface AddCommentParams extends CommentProvenanceInput {
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
  coverageRationale?: string | undefined;
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
  const provenance = resolveCommentProvenance(params);

  db.prepare(
    `INSERT INTO ticket_comments (
      id, ticket_id, content, author, type,
      phase, actor_kind, provider, model_provider, model_name, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    ticketId,
    content.trim(),
    author,
    type,
    provenance.phase,
    provenance.actorKind,
    provenance.provider,
    provenance.modelProvider,
    provenance.modelName,
    now
  );

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
    const coverageParts = step.coverage?.length ? [...step.coverage] : [];
    if (step.coverageRationale) coverageParts.push(`Rationale: ${step.coverageRationale}`);
    const coverage = coverageParts.length ? coverageParts.join(", ") : "-";
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
  const provenance = resolveCommentProvenance({
    phase: "ai_verification",
    actorKind: "system",
    provider: params.provider,
  });
  const existing = db
    .prepare(
      "SELECT * FROM ticket_comments WHERE ticket_id = ? AND type = 'verification_report' AND content LIKE ? ORDER BY created_at DESC, rowid DESC LIMIT 1"
    )
    .get(params.ticketId, `${marker}%`) as DbCommentRow | undefined;

  if (existing) {
    db.prepare(
      `UPDATE ticket_comments
       SET content = ?, author = ?, phase = ?, actor_kind = ?, provider = ?,
           model_provider = ?, model_name = ?
       WHERE id = ?`
    ).run(
      content,
      author,
      provenance.phase,
      provenance.actorKind,
      provenance.provider,
      provenance.modelProvider,
      provenance.modelName,
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
    `INSERT INTO ticket_comments (
      id, ticket_id, content, author, type,
      phase, actor_kind, provider, model_provider, model_name, created_at
    ) VALUES (?, ?, ?, ?, 'verification_report', ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.ticketId,
    content,
    author,
    provenance.phase,
    provenance.actorKind,
    provenance.provider,
    provenance.modelProvider,
    provenance.modelName,
    now
  );
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
              tc.content, tc.author, tc.type, tc.phase, tc.actor_kind,
              tc.provider, tc.model_provider, tc.model_name, tc.created_at
       FROM ticket_comments tc
       JOIN tickets t ON tc.ticket_id = t.id
       ${where}
       ORDER BY tc.created_at DESC, tc.rowid DESC
       LIMIT ?`
    )
    .all(...values, limit) as DbActivityLogRow[];

  return rows.map((r) => ({
    id: r.id,
    ticketId: r.ticket_id,
    ticketTitle: r.ticket_title,
    content: r.content,
    author: r.author,
    type: r.type,
    phase: r.phase,
    actorKind: r.actor_kind,
    provider: r.provider,
    modelProvider: r.model_provider,
    modelName: r.model_name,
    createdAt: r.created_at,
  }));
}
