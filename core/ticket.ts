/**
 * Ticket business logic for the core layer.
 *
 * Extracted from mcp-server/tools/tickets.ts.
 * All functions take a DbHandle and return typed results or throw CoreError subclasses.
 */

import { randomUUID } from "crypto";
import type { DbHandle, TicketStatus, Priority, DeleteResult, TicketWithProject } from "./types.ts";
import {
  TicketNotFoundError,
  EpicNotFoundError,
  ProjectNotFoundError,
  ValidationError,
} from "./errors.ts";
import type { DbTicketRow, DbProjectRow, DbEpicRow, DbTicketSummaryRow } from "./db-rows.ts";

// ============================================
// Internal Helpers
// ============================================

function safeJsonParse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Convert a raw DB ticket row into a TicketWithProject.
 * Requires the project row to be fetched separately.
 */
function toTicketWithProject(
  row: DbTicketRow,
  project: { id: string; name: string; path: string },
  epicTitle: string | null = null
): TicketWithProject {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as TicketStatus,
    priority: row.priority as Priority | null,
    position: row.position,
    projectId: row.project_id,
    epicId: row.epic_id,
    tags: safeJsonParse<string[]>(row.tags, []),
    subtasks: safeJsonParse(row.subtasks, []),
    isBlocked: row.is_blocked === 1,
    blockedReason: row.blocked_reason,
    linkedFiles: safeJsonParse<string[]>(row.linked_files, []),
    attachments: safeJsonParse(row.attachments, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    linkedCommits: safeJsonParse(row.linked_commits, []),
    branchName: row.branch_name,
    prNumber: row.pr_number,
    prUrl: row.pr_url,
    prStatus: row.pr_status as TicketWithProject["prStatus"],
    project: { id: project.id, name: project.name, path: project.path },
    epicTitle,
  };
}

function getTicketRow(db: DbHandle, ticketId: string): DbTicketRow {
  const row = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as
    | DbTicketRow
    | undefined;
  if (!row) throw new TicketNotFoundError(ticketId);
  return row;
}

function getProjectRow(db: DbHandle, projectId: string): DbProjectRow {
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as
    | DbProjectRow
    | undefined;
  if (!row) throw new ProjectNotFoundError(projectId);
  return row;
}

function getTicketWithProject(db: DbHandle, ticketId: string): TicketWithProject {
  const row = db
    .prepare(
      `SELECT t.*, p.name as project_name, p.path as project_path, e.title as epic_title
       FROM tickets t
       JOIN projects p ON t.project_id = p.id
       LEFT JOIN epics e ON t.epic_id = e.id
       WHERE t.id = ?`
    )
    .get(ticketId) as
    | (DbTicketRow & { project_name: string; project_path: string; epic_title: string | null })
    | undefined;

  if (!row) throw new TicketNotFoundError(ticketId);

  return toTicketWithProject(
    row,
    { id: row.project_id, name: row.project_name, path: row.project_path },
    row.epic_title
  );
}

/**
 * Convert a DB summary row into a TicketSummary.
 * Used by both listTickets and listTicketsByEpic.
 */
function toTicketSummary(row: DbTicketSummaryRow): TicketSummary {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    epicId: row.epic_id,
    isBlocked: row.is_blocked === 1,
    branchName: row.branch_name,
    prNumber: row.pr_number,
    prStatus: row.pr_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    projectName: row.project_name,
  };
}

// ============================================
// Acceptance Criterion Types
// ============================================

interface AcceptanceCriterion {
  id: string;
  criterion?: string | undefined;
  text?: string | undefined;
  completed?: boolean | undefined;
  status?: string | undefined;
  verifiedBy?: string | undefined;
  verifiedAt?: string | undefined;
  verificationNote?: string | undefined;
}

// ============================================
// Attachment Types
// ============================================

interface TicketAttachment {
  id: string;
  filename: string;
  type?: string;
  description?: string;
  priority?: string;
  uploadedBy?: string;
  uploadedAt?: string;
  linkedCriteria?: string[];
}

// ============================================
// Valid Constants
// ============================================

const VALID_STATUSES: TicketStatus[] = [
  "backlog",
  "ready",
  "in_progress",
  "ai_review",
  "human_review",
  "done",
];

const VALID_PRIORITIES: Priority[] = ["low", "medium", "high"];

// ============================================
// Public API
// ============================================

export interface CreateTicketParams {
  projectId: string;
  title: string;
  description?: string | undefined;
  priority?: Priority | undefined;
  epicId?: string | undefined;
  tags?: string[] | undefined;
}

/**
 * Create a new ticket in the backlog.
 * @throws ProjectNotFoundError if the project doesn't exist
 * @throws EpicNotFoundError if the epic ID is provided but doesn't exist
 */
export function createTicket(db: DbHandle, params: CreateTicketParams): TicketWithProject {
  const { projectId, title, description, priority, epicId, tags } = params;

  getProjectRow(db, projectId);

  if (epicId) {
    const epic = db.prepare("SELECT * FROM epics WHERE id = ?").get(epicId) as
      | DbEpicRow
      | undefined;
    if (!epic) throw new EpicNotFoundError(epicId);
  }

  if (priority && !VALID_PRIORITIES.includes(priority)) {
    throw new ValidationError(
      `Invalid priority: ${priority}. Valid: ${VALID_PRIORITIES.join(", ")}`
    );
  }

  const maxPos = db
    .prepare(
      "SELECT MAX(position) as maxPos FROM tickets WHERE project_id = ? AND status = 'backlog'"
    )
    .get(projectId) as { maxPos: number | null } | undefined;
  const position = (maxPos?.maxPos ?? 0) + 1;

  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO tickets (id, title, description, status, priority, position, project_id, epic_id, tags, created_at, updated_at)
     VALUES (?, ?, ?, 'backlog', ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    title.trim(),
    description?.trim() || null,
    priority || null,
    position,
    projectId,
    epicId || null,
    tags ? JSON.stringify(tags) : null,
    now,
    now
  );

  return getTicketWithProject(db, id);
}

export interface ListTicketsFilters {
  projectId?: string | undefined;
  status?: TicketStatus | undefined;
  limit?: number | undefined;
}

/**
 * Ticket summary returned by listTickets (minimal fields for token efficiency).
 */
export interface TicketSummary {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  epicId: string | null;
  isBlocked: boolean;
  branchName: string | null;
  prNumber: number | null;
  prStatus: string | null;
  createdAt: string;
  updatedAt: string;
  projectName: string;
}

/**
 * List tickets with optional filters. Returns summary fields only.
 */
export function listTickets(db: DbHandle, filters: ListTicketsFilters = {}): TicketSummary[] {
  const { projectId, status, limit = 20 } = filters;

  let query = `SELECT t.id, t.title, t.status, t.priority, t.epic_id, t.is_blocked,
    t.branch_name, t.pr_number, t.pr_status, t.created_at, t.updated_at,
    p.name as project_name
    FROM tickets t JOIN projects p ON t.project_id = p.id WHERE 1=1`;
  const params: (string | number)[] = [];

  if (projectId) {
    query += " AND t.project_id = ?";
    params.push(projectId);
  }
  if (status) {
    query += " AND t.status = ?";
    params.push(status);
  }

  query += " ORDER BY t.created_at DESC LIMIT ?";
  params.push(Math.min(limit, 100));

  const rows = db.prepare(query).all(...params) as DbTicketSummaryRow[];
  return rows.map(toTicketSummary);
}

/**
 * Get a single ticket with full detail.
 * @throws TicketNotFoundError if the ticket doesn't exist
 */
export function getTicket(db: DbHandle, ticketId: string): TicketWithProject {
  return getTicketWithProject(db, ticketId);
}

/**
 * Update a ticket's status.
 * @throws TicketNotFoundError if the ticket doesn't exist
 */
export function updateTicketStatus(
  db: DbHandle,
  ticketId: string,
  status: TicketStatus
): TicketWithProject {
  if (!VALID_STATUSES.includes(status)) {
    throw new ValidationError(`Invalid status: ${status}. Valid: ${VALID_STATUSES.join(", ")}`);
  }

  // Verify ticket exists
  getTicketRow(db, ticketId);

  const now = new Date().toISOString();
  const completedAt = status === "done" ? now : null;

  db.prepare("UPDATE tickets SET status = ?, updated_at = ?, completed_at = ? WHERE id = ?").run(
    status,
    now,
    completedAt,
    ticketId
  );

  return getTicketWithProject(db, ticketId);
}

export type CriterionStatus = "pending" | "passed" | "failed" | "skipped";

export interface UpdateCriterionResult {
  ticket: TicketWithProject;
  criterionText: string;
  previousStatus: string;
  newStatus: string;
}

/**
 * Update an acceptance criterion's status within a ticket.
 * @throws TicketNotFoundError if the ticket doesn't exist
 * @throws ValidationError if the criterion is not found
 */
export function updateAcceptanceCriterion(
  db: DbHandle,
  ticketId: string,
  criterionId: string,
  status: CriterionStatus,
  verificationNote?: string
): UpdateCriterionResult {
  const ticketRow = getTicketRow(db, ticketId);

  const criteria: AcceptanceCriterion[] = safeJsonParse(ticketRow.subtasks, []);

  const criterionIndex = criteria.findIndex((c) => c.id === criterionId);
  if (criterionIndex === -1) {
    const availableIds = criteria.map((c) => `  - ${c.id}: "${c.criterion || c.text}"`).join("\n");
    throw new ValidationError(
      `Criterion not found: ${criterionId}\n\nAvailable criteria:\n${availableIds || "(none)"}`,
      { criterionId }
    );
  }

  const criterion = criteria[criterionIndex]!;
  const previousStatus = criterion.status || (criterion.completed ? "passed" : "pending");

  // Update to new format if it was legacy format
  criterion.criterion = criterion.criterion ?? criterion.text ?? "";
  criterion.text = undefined;
  criterion.completed = undefined;

  criterion.status = status;
  criterion.verifiedBy = "claude";
  criterion.verifiedAt = new Date().toISOString();
  if (verificationNote) {
    criterion.verificationNote = verificationNote;
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE tickets SET subtasks = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify(criteria),
    now,
    ticketId
  );

  return {
    ticket: getTicketWithProject(db, ticketId),
    criterionText: criterion.criterion,
    previousStatus,
    newStatus: status,
  };
}

/**
 * Delete a ticket and its associated comments.
 * Uses dry-run pattern: confirm=false returns preview, confirm=true deletes.
 * @throws TicketNotFoundError if the ticket doesn't exist
 */
export function deleteTicket(
  db: DbHandle,
  ticketId: string,
  confirm: boolean = false
): DeleteResult {
  const row = db
    .prepare(
      `SELECT t.*, p.name as project_name, e.title as epic_title
       FROM tickets t
       JOIN projects p ON t.project_id = p.id
       LEFT JOIN epics e ON t.epic_id = e.id
       WHERE t.id = ?`
    )
    .get(ticketId) as
    | (DbTicketRow & { project_name: string; epic_title: string | null })
    | undefined;

  if (!row) throw new TicketNotFoundError(ticketId);

  const commentCount = (
    db
      .prepare("SELECT COUNT(*) as count FROM ticket_comments WHERE ticket_id = ?")
      .get(ticketId) as { count: number }
  ).count;

  if (!confirm) {
    return {
      dryRun: true,
      wouldDelete: {
        entity: "ticket",
        id: ticketId,
        title: row.title,
        childCount: commentCount,
      },
      warning: `This will delete ticket "${row.title}" and ${commentCount} comment(s). Set confirm=true to proceed.`,
    };
  }

  db.transaction(() => {
    db.prepare("DELETE FROM ticket_comments WHERE ticket_id = ?").run(ticketId);
    db.prepare("DELETE FROM tickets WHERE id = ?").run(ticketId);
  })();

  return {
    dryRun: false,
    deleted: {
      entity: "ticket",
      id: ticketId,
      title: row.title,
      childrenDeleted: commentCount,
    },
  };
}

export interface UpdateAttachmentMetadataParams {
  type?: string | undefined;
  description?: string | undefined;
  priority?: string | undefined;
  linkedCriteria?: string[] | undefined;
}

export interface UpdateAttachmentResult {
  attachment: TicketAttachment;
}

/**
 * Update metadata for a ticket attachment.
 * @throws TicketNotFoundError if the ticket doesn't exist
 * @throws ValidationError if the attachment is not found
 */
export function updateAttachmentMetadata(
  db: DbHandle,
  ticketId: string,
  attachmentId: string,
  metadata: UpdateAttachmentMetadataParams
): UpdateAttachmentResult {
  const ticketRow = getTicketRow(db, ticketId);

  const attachments: (string | TicketAttachment)[] = safeJsonParse(ticketRow.attachments, []);

  // Normalize attachments (handle legacy string format)
  const normalizedAttachments: TicketAttachment[] = attachments.map((item, index) => {
    if (typeof item === "string") {
      return {
        id: `legacy-${index}-${item}`,
        filename: item,
        type: "reference",
        priority: "primary",
        uploadedBy: "human",
        uploadedAt: new Date().toISOString(),
      };
    }
    return item as TicketAttachment;
  });

  const attachmentIndex = normalizedAttachments.findIndex(
    (a) => a.id === attachmentId || a.filename === attachmentId
  );

  if (attachmentIndex === -1) {
    const availableAttachments = normalizedAttachments
      .map((a) => `  - ${a.id}: "${a.filename}" (${a.type})`)
      .join("\n");
    throw new ValidationError(
      `Attachment not found: ${attachmentId}\n\nAvailable attachments:\n${availableAttachments || "(none)"}`,
      { attachmentId }
    );
  }

  const attachment = normalizedAttachments[attachmentIndex]!;
  if (metadata.type !== undefined) attachment.type = metadata.type;
  if (metadata.description !== undefined) attachment.description = metadata.description;
  if (metadata.priority !== undefined) attachment.priority = metadata.priority;
  if (metadata.linkedCriteria !== undefined) attachment.linkedCriteria = metadata.linkedCriteria;

  const now = new Date().toISOString();
  db.prepare("UPDATE tickets SET attachments = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify(normalizedAttachments),
    now,
    ticketId
  );

  return { attachment };
}

export interface ListTicketsByEpicFilters {
  epicId: string;
  projectId?: string | undefined;
  status?: TicketStatus | undefined;
  limit?: number | undefined;
}

/**
 * List all tickets in a specific epic. Returns summary fields only.
 * @throws EpicNotFoundError if the epic doesn't exist
 */
export function listTicketsByEpic(
  db: DbHandle,
  filters: ListTicketsByEpicFilters
): TicketSummary[] {
  const { epicId, projectId, status, limit = 100 } = filters;

  const epic = db.prepare("SELECT * FROM epics WHERE id = ?").get(epicId) as DbEpicRow | undefined;
  if (!epic) throw new EpicNotFoundError(epicId);

  let query = `
    SELECT t.id, t.title, t.status, t.priority, t.position, t.is_blocked, t.epic_id,
      t.branch_name, t.pr_number, t.pr_status, t.created_at, t.updated_at,
      p.name as project_name
    FROM tickets t
    JOIN projects p ON t.project_id = p.id
    WHERE t.epic_id = ?
  `;
  const params: (string | number)[] = [epicId];

  if (projectId) {
    query += " AND t.project_id = ?";
    params.push(projectId);
  }
  if (status) {
    query += " AND t.status = ?";
    params.push(status);
  }

  query += " ORDER BY t.position ASC LIMIT ?";
  params.push(Math.min(limit, 100));

  const rows = db.prepare(query).all(...params) as DbTicketSummaryRow[];
  return rows.map(toTicketSummary);
}
