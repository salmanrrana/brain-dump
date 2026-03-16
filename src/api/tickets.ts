import { createServerFn } from "@tanstack/react-start";
import { db, sqlite } from "../lib/db";
import { tickets, projects, epics, ticketComments, type Ticket } from "../lib/schema";
import { eq, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { ensureExists, safeJsonStringify } from "../lib/utils";
import { autoExtractLearnings } from "../../core/index";
import { createLogger } from "../lib/logger";

const log = createLogger("tickets-api");

// Types — derived from the schema's $type<>() annotations
export type TicketStatus = Ticket["status"];
export type TicketPriority = NonNullable<Ticket["priority"]>;

export interface Subtask {
  id: string;
  text: string;
  completed: boolean;
}

/** Status for acceptance criteria verification */
export type AcceptanceCriterionStatus = "pending" | "passed" | "failed" | "skipped";

/** Who verified the acceptance criterion */
export type AcceptanceCriterionVerifier =
  | "human"
  | "claude"
  | "ralph"
  | "opencode"
  | "cursor"
  | "windsurf"
  | "copilot"
  | "test"
  | "ci";

/**
 * Acceptance Criterion - a verifiable requirement for ticket completion.
 * AI agents can mark criteria as passed with verification notes.
 */
export interface AcceptanceCriterion {
  id: string;
  criterion: string;
  status: AcceptanceCriterionStatus;
  verifiedBy?: AcceptanceCriterionVerifier | undefined;
  verifiedAt?: string | undefined;
  verificationNote?: string | undefined;
}

export interface CreateTicketInput {
  id?: string;
  title: string;
  description?: string;
  projectId: string;
  epicId?: string;
  priority?: TicketPriority;
  tags?: string[];
  attachments?: string[];
}

export interface UpdateTicketInput {
  title?: string;
  description?: string | null;
  status?: TicketStatus;
  priority?: TicketPriority;
  epicId?: string | null;
  tags?: string[];
  /** @deprecated Use acceptanceCriteria instead */
  subtasks?: Subtask[];
  /** Acceptance criteria with verification status */
  acceptanceCriteria?: AcceptanceCriterion[];
  isBlocked?: boolean;
  blockedReason?: string | null;
  linkedFiles?: string[];
}

export interface TicketFilters {
  projectId?: string;
  epicId?: string;
  status?: TicketStatus;
  tags?: string[];
}

// Get tickets with optional filters
export const getTickets = createServerFn({ method: "GET" })
  .inputValidator((filters: TicketFilters) => filters)
  .handler(async ({ data: filters }): Promise<Ticket[]> => {
    // If tag filtering is needed, use raw SQL for JSON handling
    if (filters.tags && filters.tags.length > 0) {
      let sql = `
        SELECT * FROM tickets
        WHERE 1=1
      `;
      const params: string[] = [];

      if (filters.projectId) {
        sql += " AND project_id = ?";
        params.push(filters.projectId);
      }
      if (filters.epicId) {
        sql += " AND epic_id = ?";
        params.push(filters.epicId);
      }
      if (filters.status) {
        sql += " AND status = ?";
        params.push(filters.status);
      }

      // AND filter for tags - ticket must have ALL selected tags
      // json_valid guard prevents crash on malformed tags data
      for (const tag of filters.tags) {
        sql += ` AND json_valid(tickets.tags) AND EXISTS (
          SELECT 1 FROM json_each(tickets.tags)
          WHERE json_each.value = ?
        )`;
        params.push(tag);
      }

      sql += " ORDER BY position";

      // Use the already-imported sqlite instance for raw SQL queries
      const stmt = sqlite.prepare(sql);
      return stmt.all(...params) as Ticket[];
    }

    // Standard ORM query when no tag filtering
    let query = db.select().from(tickets);

    // Build dynamic WHERE conditions
    const conditions = [];
    if (filters.projectId) {
      conditions.push(eq(tickets.projectId, filters.projectId));
    }
    if (filters.epicId) {
      conditions.push(eq(tickets.epicId, filters.epicId));
    }
    if (filters.status) {
      conditions.push(eq(tickets.status, filters.status));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    return query.orderBy(tickets.position).all();
  });

// Get single ticket by ID
export const getTicket = createServerFn({ method: "GET" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    const ticketResult = db.select().from(tickets).where(eq(tickets.id, id)).get();
    return ensureExists(ticketResult, "Ticket", id);
  });

// Create a new ticket
export const createTicket = createServerFn({ method: "POST" })
  .inputValidator((input: CreateTicketInput) => {
    if (!input.title || input.title.trim().length === 0) {
      throw new Error("Ticket title is required");
    }
    if (!input.projectId) {
      throw new Error("Project ID is required");
    }
    return input;
  })
  .handler(async ({ data: input }) => {
    // Verify project exists
    const project = db.select().from(projects).where(eq(projects.id, input.projectId)).get();
    if (!project) {
      throw new Error(`Project not found: ${input.projectId}`);
    }

    // Verify epic exists if provided
    if (input.epicId) {
      const epic = db.select().from(epics).where(eq(epics.id, input.epicId)).get();
      if (!epic) {
        throw new Error(`Epic not found: ${input.epicId}`);
      }
      // Verify epic belongs to same project
      if (epic.projectId !== input.projectId) {
        throw new Error("Epic does not belong to the specified project");
      }
    }

    // Get the highest position in the backlog for this project
    const maxPosition = db
      .select({ maxPos: sql<number>`MAX(position)` })
      .from(tickets)
      .where(and(eq(tickets.projectId, input.projectId), eq(tickets.status, "backlog")))
      .get();

    const position = (maxPosition?.maxPos ?? 0) + 1;

    const id = input.id ?? randomUUID();
    const newTicket = {
      id,
      title: input.title.trim(),
      description: input.description?.trim() ?? null,
      projectId: input.projectId,
      epicId: input.epicId ?? null,
      status: "backlog" as TicketStatus,
      priority: input.priority ?? null,
      position,
      tags: safeJsonStringify(input.tags),
      subtasks: null,
      isBlocked: false,
      blockedReason: null,
      linkedFiles: null,
      attachments: safeJsonStringify(input.attachments),
    };

    db.insert(tickets).values(newTicket).run();

    return db.select().from(tickets).where(eq(tickets.id, id)).get();
  });

// Update a ticket
export const updateTicket = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; updates: UpdateTicketInput }) => {
    if (!input.id) {
      throw new Error("Ticket ID is required");
    }
    return input;
  })
  .handler(async ({ data: { id, updates } }) => {
    const existingResult = db.select().from(tickets).where(eq(tickets.id, id)).get();
    const existing = ensureExists(existingResult, "Ticket", id);

    // Verify epic exists if being updated
    if (updates.epicId !== undefined && updates.epicId !== null) {
      const epic = db.select().from(epics).where(eq(epics.id, updates.epicId)).get();
      if (!epic) {
        throw new Error(`Epic not found: ${updates.epicId}`);
      }
      if (epic.projectId !== existing.projectId) {
        throw new Error("Epic does not belong to the ticket's project");
      }
    }

    const updateData: Partial<typeof tickets.$inferInsert> = {};
    if (updates.title !== undefined) updateData.title = updates.title.trim();
    if (updates.description !== undefined)
      updateData.description = updates.description?.trim() ?? null;
    if (updates.status !== undefined) {
      updateData.status = updates.status;
      // Set completedAt when moving to done
      if (updates.status === "done") {
        updateData.completedAt = new Date().toISOString();
      } else if (existing.status === "done") {
        // Clear completedAt when moving out of done
        updateData.completedAt = null;
      }
    }
    if (updates.priority !== undefined) updateData.priority = updates.priority;
    if (updates.epicId !== undefined) updateData.epicId = updates.epicId;
    if (updates.tags !== undefined) updateData.tags = safeJsonStringify(updates.tags);
    // Support both legacy subtasks and new acceptanceCriteria
    // Acceptance criteria takes precedence if both are provided
    if (updates.acceptanceCriteria !== undefined) {
      updateData.subtasks = safeJsonStringify(updates.acceptanceCriteria);
    } else if (updates.subtasks !== undefined) {
      // Legacy subtasks support - will be removed in future version
      updateData.subtasks = safeJsonStringify(updates.subtasks);
    }
    if (updates.isBlocked !== undefined) updateData.isBlocked = updates.isBlocked;
    if (updates.blockedReason !== undefined) updateData.blockedReason = updates.blockedReason;
    if (updates.linkedFiles !== undefined)
      updateData.linkedFiles = safeJsonStringify(updates.linkedFiles);

    if (Object.keys(updateData).length > 0) {
      updateData.updatedAt = new Date().toISOString();
      db.update(tickets).set(updateData).where(eq(tickets.id, id)).run();
    }

    return db.select().from(tickets).where(eq(tickets.id, id)).get();
  });

// Update ticket status only
export const updateTicketStatus = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; status: TicketStatus }) => {
    if (!input.id) {
      throw new Error("Ticket ID is required");
    }
    const validStatuses: TicketStatus[] = [
      "backlog",
      "ready",
      "in_progress",
      "ai_review",
      "human_review",
      "done",
    ];
    if (!validStatuses.includes(input.status)) {
      throw new Error(`Invalid status: ${input.status}`);
    }
    return input;
  })
  .handler(async ({ data: { id, status } }) => {
    const existingResult = db.select().from(tickets).where(eq(tickets.id, id)).get();
    const existing = ensureExists(existingResult, "Ticket", id);

    const updateData: Partial<typeof tickets.$inferInsert> = {
      status,
      updatedAt: new Date().toISOString(),
    };

    // Set completedAt when moving to done
    if (status === "done") {
      updateData.completedAt = new Date().toISOString();
    } else if (existing.status === "done") {
      // Clear completedAt when moving out of done
      updateData.completedAt = null;
    }

    db.update(tickets).set(updateData).where(eq(tickets.id, id)).run();

    const updated = db.select().from(tickets).where(eq(tickets.id, id)).get();

    // Auto-trigger learnings when all tickets in an epic are done
    if (status === "done" && existing.epicId) {
      try {
        const epicTickets = db
          .select({ status: tickets.status })
          .from(tickets)
          .where(eq(tickets.epicId, existing.epicId))
          .all();

        const allDone = epicTickets.every((t) => t.status === "done");
        if (allDone) {
          autoExtractLearnings(sqlite, existing.epicId);
          log.info(`Auto-extracted learnings for completed epic ${existing.epicId}`);
        }
      } catch (err) {
        log.error(
          `Failed to auto-extract learnings for epic ${existing.epicId}`,
          err instanceof Error ? err : new Error(String(err))
        );
      }
    }

    return updated;
  });

// Update ticket position only
export const updateTicketPosition = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; position: number }) => {
    if (!input.id) {
      throw new Error("Ticket ID is required");
    }
    if (typeof input.position !== "number" || isNaN(input.position)) {
      throw new Error("Position must be a number");
    }
    return input;
  })
  .handler(async ({ data: { id, position } }) => {
    const existingResult = db.select().from(tickets).where(eq(tickets.id, id)).get();
    ensureExists(existingResult, "Ticket", id);

    db.update(tickets)
      .set({ position, updatedAt: new Date().toISOString() })
      .where(eq(tickets.id, id))
      .run();

    return db.select().from(tickets).where(eq(tickets.id, id)).get();
  });

// ─── Summary / Count Endpoints ───────────────────────────────────────────────

/**
 * Returns ticket counts grouped by projectId.
 * Uses SQL COUNT/GROUP BY — no full ticket objects are transferred.
 */
export const getProjectTicketCounts = createServerFn({ method: "GET" }).handler(async () => {
  const rows = db
    .select({
      projectId: tickets.projectId,
      count: sql<number>`COUNT(*)`,
    })
    .from(tickets)
    .groupBy(tickets.projectId)
    .all();

  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.projectId] = row.count;
  }
  return counts;
});

/**
 * Returns ticket counts grouped by epicId for a given project.
 * Uses SQL COUNT/GROUP BY — no full ticket objects are transferred.
 */
export const getEpicTicketCounts = createServerFn({ method: "GET" })
  .inputValidator((projectId: string) => projectId)
  .handler(async ({ data: projectId }) => {
    const rows = db
      .select({
        epicId: tickets.epicId,
        count: sql<number>`COUNT(*)`,
      })
      .from(tickets)
      .where(and(eq(tickets.projectId, projectId), sql`${tickets.epicId} IS NOT NULL`))
      .groupBy(tickets.epicId)
      .all();

    const counts: Record<string, number> = {};
    for (const row of rows) {
      if (row.epicId) {
        counts[row.epicId] = row.count;
      }
    }
    return counts;
  });

// ─── Ticket Summaries (lightweight list queries) ────────────────────────────

/**
 * Summary type for board/list display — omits heavy text fields
 * (description, linkedFiles, attachments) that are only needed in detail views.
 */
export interface TicketSummary {
  id: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority | null;
  position: number;
  projectId: string;
  epicId: string | null;
  tags: string | null;
  subtasks: string | null;
  isBlocked: boolean | null;
  blockedReason: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  branchName: string | null;
  prNumber: number | null;
  prUrl: string | null;
  prStatus: "draft" | "open" | "merged" | "closed" | null;
}

/**
 * Returns ticket summaries (no description/linkedFiles/attachments) with optional filters.
 * Use this for board, list, and dashboard views where full ticket content is not needed.
 */
export const getTicketSummaries = createServerFn({ method: "GET" })
  .inputValidator((filters: TicketFilters) => filters)
  .handler(async ({ data: filters }): Promise<TicketSummary[]> => {
    const selectedColumns = {
      id: tickets.id,
      title: tickets.title,
      status: tickets.status,
      priority: tickets.priority,
      position: tickets.position,
      projectId: tickets.projectId,
      epicId: tickets.epicId,
      tags: tickets.tags,
      subtasks: tickets.subtasks,
      isBlocked: tickets.isBlocked,
      blockedReason: tickets.blockedReason,
      createdAt: tickets.createdAt,
      updatedAt: tickets.updatedAt,
      completedAt: tickets.completedAt,
      branchName: tickets.branchName,
      prNumber: tickets.prNumber,
      prUrl: tickets.prUrl,
      prStatus: tickets.prStatus,
    };

    // Tag filtering requires raw SQL for JSON handling
    if (filters.tags && filters.tags.length > 0) {
      const cols = `id, title, status, priority, position, project_id, epic_id, tags, subtasks, is_blocked, blocked_reason, created_at, updated_at, completed_at, branch_name, pr_number, pr_url, pr_status`;
      let sqlStr = `SELECT ${cols} FROM tickets WHERE 1=1`;
      const params: string[] = [];

      if (filters.projectId) {
        sqlStr += " AND project_id = ?";
        params.push(filters.projectId);
      }
      if (filters.epicId) {
        sqlStr += " AND epic_id = ?";
        params.push(filters.epicId);
      }
      if (filters.status) {
        sqlStr += " AND status = ?";
        params.push(filters.status);
      }

      for (const tag of filters.tags) {
        sqlStr += ` AND json_valid(tickets.tags) AND EXISTS (
          SELECT 1 FROM json_each(tickets.tags)
          WHERE json_each.value = ?
        )`;
        params.push(tag);
      }

      sqlStr += " ORDER BY position";
      const stmt = sqlite.prepare(sqlStr);
      return stmt.all(...params) as TicketSummary[];
    }

    // Standard ORM query with specific column selection
    let query = db.select(selectedColumns).from(tickets);

    const conditions = [];
    if (filters.projectId) {
      conditions.push(eq(tickets.projectId, filters.projectId));
    }
    if (filters.epicId) {
      conditions.push(eq(tickets.epicId, filters.epicId));
    }
    if (filters.status) {
      conditions.push(eq(tickets.status, filters.status));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    return query.orderBy(tickets.position).all();
  });

// ─── Paginated Ticket Summaries ──────────────────────────────────────────────

export interface PaginatedTicketFilters extends TicketFilters {
  /** Max tickets per page (default 50) */
  limit?: number;
  /** Offset for pagination (default 0) */
  offset?: number;
}

export interface PaginatedTicketResult {
  tickets: TicketSummary[];
  /** Total matching tickets (before pagination) */
  total: number;
  /** Whether more pages exist */
  hasMore: boolean;
}

const DEFAULT_TICKET_PAGE_SIZE = 50;

/**
 * Paginated ticket summaries. Returns a page of lightweight ticket summaries
 * with total count and hasMore flag. Omits heavy text fields.
 */
export const getPaginatedTicketSummaries = createServerFn({ method: "GET" })
  .inputValidator((filters: PaginatedTicketFilters) => filters)
  .handler(async ({ data: filters }): Promise<PaginatedTicketResult> => {
    const { limit = DEFAULT_TICKET_PAGE_SIZE, offset = 0, ...ticketFilters } = filters;
    const pageSize = Math.min(Math.max(1, limit), 200);
    const safeOffset = Math.max(0, offset);

    // Build WHERE conditions
    const conditions = [];
    if (ticketFilters.projectId) {
      conditions.push(eq(tickets.projectId, ticketFilters.projectId));
    }
    if (ticketFilters.epicId) {
      conditions.push(eq(tickets.epicId, ticketFilters.epicId));
    }
    if (ticketFilters.status) {
      conditions.push(eq(tickets.status, ticketFilters.status));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Total count
    let countQuery = db.select({ count: sql<number>`COUNT(*)` }).from(tickets);
    if (whereClause) {
      countQuery = countQuery.where(whereClause) as typeof countQuery;
    }
    const countResult = countQuery.get();
    const total = countResult?.count ?? 0;

    // Tag filtering uses raw SQL (same pattern as getTicketSummaries)
    if (ticketFilters.tags && ticketFilters.tags.length > 0) {
      const cols = `id, title, status, priority, position, project_id, epic_id, tags, subtasks, is_blocked, blocked_reason, created_at, updated_at, completed_at, branch_name, pr_number, pr_url, pr_status`;
      let sqlStr = `SELECT ${cols} FROM tickets WHERE 1=1`;
      const params: (string | number)[] = [];

      if (ticketFilters.projectId) {
        sqlStr += " AND project_id = ?";
        params.push(ticketFilters.projectId);
      }
      if (ticketFilters.epicId) {
        sqlStr += " AND epic_id = ?";
        params.push(ticketFilters.epicId);
      }
      if (ticketFilters.status) {
        sqlStr += " AND status = ?";
        params.push(ticketFilters.status);
      }

      for (const tag of ticketFilters.tags) {
        sqlStr += ` AND json_valid(tickets.tags) AND EXISTS (
          SELECT 1 FROM json_each(tickets.tags)
          WHERE json_each.value = ?
        )`;
        params.push(tag);
      }

      sqlStr += " ORDER BY position LIMIT ? OFFSET ?";
      params.push(pageSize, safeOffset);

      const stmt = sqlite.prepare(sqlStr);
      const ticketRows = stmt.all(...params) as TicketSummary[];
      return { tickets: ticketRows, total, hasMore: safeOffset + ticketRows.length < total };
    }

    // Standard ORM query with pagination
    const selectedColumns = {
      id: tickets.id,
      title: tickets.title,
      status: tickets.status,
      priority: tickets.priority,
      position: tickets.position,
      projectId: tickets.projectId,
      epicId: tickets.epicId,
      tags: tickets.tags,
      subtasks: tickets.subtasks,
      isBlocked: tickets.isBlocked,
      blockedReason: tickets.blockedReason,
      createdAt: tickets.createdAt,
      updatedAt: tickets.updatedAt,
      completedAt: tickets.completedAt,
      branchName: tickets.branchName,
      prNumber: tickets.prNumber,
      prUrl: tickets.prUrl,
      prStatus: tickets.prStatus,
    };

    let query = db.select(selectedColumns).from(tickets);
    if (whereClause) {
      query = query.where(whereClause) as typeof query;
    }

    const ticketRows = query.orderBy(tickets.position).limit(pageSize).offset(safeOffset).all();

    return { tickets: ticketRows, total, hasMore: safeOffset + ticketRows.length < total };
  });

// Delete a ticket with dry-run preview support
export interface DeleteTicketInput {
  ticketId: string;
  confirm?: boolean;
}

export interface DeleteTicketPreview {
  preview: true;
  ticket: {
    id: string;
    title: string;
    status: string;
    projectId: string;
    epicId: string | null;
    description: string | null;
  };
  commentCount: number;
}

export interface DeleteTicketResult {
  deleted: true;
  ticket: {
    id: string;
    title: string;
  };
  commentCount: number;
}

export const deleteTicket = createServerFn({ method: "POST" })
  .inputValidator((input: DeleteTicketInput) => {
    if (!input.ticketId) {
      throw new Error("Ticket ID is required");
    }
    return input;
  })
  .handler(
    async ({
      data: { ticketId, confirm = false },
    }): Promise<DeleteTicketPreview | DeleteTicketResult> => {
      const ticketResult = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
      const ticket = ensureExists(ticketResult, "Ticket", ticketId);

      // Count comments that would be deleted
      const commentCountResult = db
        .select({ count: sql<number>`COUNT(*)` })
        .from(ticketComments)
        .where(eq(ticketComments.ticketId, ticketId))
        .get();
      const commentCount = commentCountResult?.count ?? 0;

      // Dry-run: return preview of what would be deleted
      if (!confirm) {
        return {
          preview: true,
          ticket: {
            id: ticket.id,
            title: ticket.title,
            status: ticket.status,
            projectId: ticket.projectId,
            epicId: ticket.epicId,
            description: ticket.description,
          },
          commentCount,
        };
      }

      // Actually delete (comments cascade automatically via FK constraint)
      // Use transaction for atomicity
      try {
        sqlite.transaction(() => {
          // Delete comments first (even though FK cascade would handle it)
          db.delete(ticketComments).where(eq(ticketComments.ticketId, ticketId)).run();
          // Delete the ticket
          db.delete(tickets).where(eq(tickets.id, ticketId)).run();
        })();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (message.includes("SQLITE_BUSY")) {
          throw new Error(
            "Failed to delete ticket: The database is busy. Please try again in a moment."
          );
        }
        throw new Error(`Failed to delete ticket: ${message}`);
      }

      return {
        deleted: true,
        ticket: {
          id: ticket.id,
          title: ticket.title,
        },
        commentCount,
      };
    }
  );
