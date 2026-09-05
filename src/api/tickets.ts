import { createServerFn } from "@tanstack/react-start";
import { db, sqlite } from "../lib/db";
import {
  tickets,
  projects,
  epics,
  ticketComments,
  verificationJobs,
  type Ticket,
} from "../lib/schema";
import { eq, and, sql, type SQL } from "drizzle-orm";
import { tagFilterConditions } from "../lib/sql-helpers";
import { randomUUID } from "crypto";
import { ensureExists, safeJsonStringify } from "../lib/utils";
import { handleEpicCompletionLearnings } from "../../core/index";
import { syncPrdBlockedStateForDbTicketIfPresent } from "../../core/prd-sync.ts";
import { normalizeUserWritableAttachmentFilenames } from "../../core/attachments.ts";
import {
  canDirectlyUpdateTicketStatus,
  recordDirectImplementationEntry,
  getDirectStatusUpdateErrorMessage,
  isActiveTicketStatus,
} from "../../core/workflow-steps.ts";
import type { VerificationJobStatus } from "../../core/verification/index.ts";
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
    return {
      ...input,
      attachments: normalizeUserWritableAttachmentFilenames(input.attachments),
    };
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
      if (!isActiveTicketStatus(updates.status)) {
        throw new Error(`Invalid status: ${updates.status}`);
      }
      if (!canDirectlyUpdateTicketStatus(existing.status, updates.status)) {
        throw new Error(getDirectStatusUpdateErrorMessage(existing.status, updates.status));
      }
      updateData.status = updates.status;
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
      const now = new Date().toISOString();
      updateData.updatedAt = now;
      sqlite.transaction(() => {
        db.update(tickets).set(updateData).where(eq(tickets.id, id)).run();
        recordDirectImplementationEntry(sqlite, id, existing.status, updates.status, now);
      })();
    }

    if (updates.isBlocked !== undefined || updates.blockedReason !== undefined) {
      // Ralph's loop reads blocked state from the scoped PRD; a UI unblock
      // that only touches the DB would leave the loop refusing to resume.
      const prdSync = syncPrdBlockedStateForDbTicketIfPresent(sqlite, id);
      if (!prdSync.success) {
        log.error(`Failed to sync PRD blocked state after ticket ${id} update: ${prdSync.message}`);
      }
    }

    if (updates.isBlocked === false && existing.isBlocked) {
      // A human unblock is the reset for both loop circuit breakers: the
      // review-round budget (completeWork) and the verification failure
      // streak. Without this, an unblocked ticket would trip the breaker
      // again on its very next complete-work.
      sqlite
        .prepare(
          `UPDATE ticket_workflow_state
           SET review_iteration = 0, verification_streak_reset_at = ?, updated_at = ?
           WHERE ticket_id = ?`
        )
        .run(new Date().toISOString(), new Date().toISOString(), id);
    }

    return db.select().from(tickets).where(eq(tickets.id, id)).get();
  });

// Update ticket status only
export const updateTicketStatus = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; status: TicketStatus }) => {
    if (!input.id) {
      throw new Error("Ticket ID is required");
    }
    if (!isActiveTicketStatus(input.status)) {
      throw new Error(`Invalid status: ${input.status}`);
    }
    return input;
  })
  .handler(async ({ data: { id, status } }) => {
    const existingResult = db.select().from(tickets).where(eq(tickets.id, id)).get();
    const existing = ensureExists(existingResult, "Ticket", id);

    const now = new Date().toISOString();
    const updateData: Partial<typeof tickets.$inferInsert> = {
      status,
      updatedAt: now,
    };

    if (!canDirectlyUpdateTicketStatus(existing.status, status)) {
      throw new Error(getDirectStatusUpdateErrorMessage(existing.status, status));
    }

    if (existing.status === status) return existing;
    sqlite.transaction(() => {
      db.update(tickets).set(updateData).where(eq(tickets.id, id)).run();
      recordDirectImplementationEntry(sqlite, id, existing.status, status, now);
    })();

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
          handleEpicCompletionLearnings({ completedTicketId: id }, { db: sqlite });
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
  verificationJobStatus?: VerificationJobStatus | null;
  verificationJobAttemptCount?: number | null;
  verificationJobNextRunAt?: string | null;
  verificationJobLastError?: string | null;
}

/** Columns selected for summary queries — omits heavy text fields (description, linkedFiles, attachments). */
const TICKET_SUMMARY_COLUMNS = {
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
  verificationJobStatus: verificationJobs.status,
  verificationJobAttemptCount: verificationJobs.attemptCount,
  verificationJobNextRunAt: verificationJobs.nextRunAt,
  verificationJobLastError: sql<string | null>`substr(${verificationJobs.lastError}, 1, 240)`,
};

/**
 * Returns ticket summaries (no description/linkedFiles/attachments) with optional filters.
 * Use this for board, list, and dashboard views where full ticket content is not needed.
 */
export const getTicketSummaries = createServerFn({ method: "GET" })
  .inputValidator((filters: TicketFilters) => filters)
  .handler(async ({ data: filters }): Promise<TicketSummary[]> => {
    const conditions: SQL[] = [];

    if (filters.projectId) conditions.push(eq(tickets.projectId, filters.projectId));
    if (filters.epicId) conditions.push(eq(tickets.epicId, filters.epicId));
    if (filters.status) conditions.push(eq(tickets.status, filters.status));
    if (filters.tags && filters.tags.length > 0) {
      conditions.push(...tagFilterConditions(filters.tags));
    }

    let query = db
      .select(TICKET_SUMMARY_COLUMNS)
      .from(tickets)
      .leftJoin(verificationJobs, eq(verificationJobs.ticketId, tickets.id));
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    return query.orderBy(tickets.position).all();
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
