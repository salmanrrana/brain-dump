import { createServerFn } from "@tanstack/react-start";
import { db, sqlite } from "../lib/db";
import { epics, projects, tickets, epicWorkflowState, reviewFindings } from "../lib/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { ensureExists } from "../lib/utils";
import { createLogger } from "../lib/logger";

const log = createLogger("epics-api");

export interface EpicLearningEntry {
  ticketId: string;
  ticketTitle: string;
  learnings: Array<{
    type: "pattern" | "anti-pattern" | "tool-usage" | "workflow";
    description: string;
    suggestedUpdate?: {
      file: string;
      section: string;
      content: string;
    };
  }>;
  appliedAt: string;
}

export interface EpicDetailResult {
  epic: {
    id: string;
    title: string;
    description: string | null;
    projectId: string;
    color: string | null;
    createdAt: string;
  };
  project: {
    id: string;
    name: string;
    path: string;
    color: string | null;
  };
  tickets: Array<{
    id: string;
    title: string;
    status: string;
    priority: string | null;
    isBlocked: boolean | null;
    blockedReason: string | null;
    branchName: string | null;
    prNumber: number | null;
    prUrl: string | null;
    prStatus: string | null;
  }>;
  ticketsByStatus: Record<string, number>;
  workflowState: {
    id: string;
    ticketsTotal: number;
    ticketsDone: number;
    currentTicketId: string | null;
    learnings: EpicLearningEntry[];
    epicBranchName: string | null;
    prNumber: number | null;
    prUrl: string | null;
    prStatus: string | null;
  } | null;
  findingsSummary: {
    critical: number;
    major: number;
    minor: number;
    suggestion: number;
    fixed: number;
    total: number;
  };
  criticalFindings: Array<{
    id: string;
    ticketId: string;
    ticketTitle: string;
    category: string;
    agent: string;
    description: string;
    filePath: string | null;
    lineNumber: number | null;
    status: string;
    createdAt: string;
    fixedAt: string | null;
  }>;
}

// Types
export interface CreateEpicInput {
  title: string;
  description?: string;
  projectId: string;
  color?: string;
}

export interface UpdateEpicInput {
  title?: string;
  description?: string;
  color?: string;
}

// Get all epics for a project
export const getEpicsByProject = createServerFn({ method: "GET" })
  .inputValidator((projectId: string) => {
    if (!projectId) {
      throw new Error("Project ID is required");
    }
    return projectId;
  })
  .handler(async ({ data: projectId }) => {
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
    ensureExists(project, "Project", projectId);
    return db
      .select()
      .from(epics)
      .where(eq(epics.projectId, projectId))
      .orderBy(desc(epics.createdAt))
      .all();
  });

// Create a new epic
export const createEpic = createServerFn({ method: "POST" })
  .inputValidator((input: CreateEpicInput) => {
    if (!input.title || input.title.trim().length === 0) {
      throw new Error("Epic title is required");
    }
    if (!input.projectId) {
      throw new Error("Project ID is required");
    }
    return input;
  })
  .handler(async ({ data: input }) => {
    // Verify project exists
    const project = db.select().from(projects).where(eq(projects.id, input.projectId)).get();
    ensureExists(project, "Project", input.projectId);

    const id = randomUUID();
    const newEpic = {
      id,
      title: input.title.trim(),
      description: input.description?.trim() ?? null,
      projectId: input.projectId,
      color: input.color ?? null,
    };

    db.insert(epics).values(newEpic).run();

    return db.select().from(epics).where(eq(epics.id, id)).get();
  });

// Update an epic
export const updateEpic = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; updates: UpdateEpicInput }) => {
    if (!input.id) {
      throw new Error("Epic ID is required");
    }
    return input;
  })
  .handler(async ({ data: { id, updates } }) => {
    const existing = db.select().from(epics).where(eq(epics.id, id)).get();
    ensureExists(existing, "Epic", id);

    const updateData: Partial<typeof epics.$inferInsert> = {};
    if (updates.title !== undefined) updateData.title = updates.title.trim();
    if (updates.description !== undefined)
      updateData.description = updates.description?.trim() ?? null;
    if (updates.color !== undefined) updateData.color = updates.color;

    if (Object.keys(updateData).length > 0) {
      db.update(epics).set(updateData).where(eq(epics.id, id)).run();
    }

    return db.select().from(epics).where(eq(epics.id, id)).get();
  });

// Delete an epic with dry-run preview support
// Note: Tickets are NOT deleted, just unlinked (epic_id set to null via FK constraint)
export interface DeleteEpicInput {
  epicId: string;
  confirm?: boolean;
}

export interface UnlinkedTicket {
  id: string;
  title: string;
  status: string;
}

export interface DeleteEpicPreview {
  preview: true;
  epic: {
    id: string;
    title: string;
    description: string | null;
    projectId: string;
  };
  ticketsToUnlink: UnlinkedTicket[];
}

export interface DeleteEpicResult {
  deleted: true;
  epic: {
    id: string;
    title: string;
  };
  ticketsUnlinked: number;
}

export const deleteEpic = createServerFn({ method: "POST" })
  .inputValidator((input: DeleteEpicInput) => {
    if (!input.epicId) {
      throw new Error("Epic ID is required");
    }
    return input;
  })
  .handler(
    async ({
      data: { epicId, confirm = false },
    }): Promise<DeleteEpicPreview | DeleteEpicResult> => {
      const epicResult = db.select().from(epics).where(eq(epics.id, epicId)).get();
      const epic = ensureExists(epicResult, "Epic", epicId);

      // Get tickets that would be unlinked (not deleted)
      const ticketsToUnlink = db
        .select({
          id: tickets.id,
          title: tickets.title,
          status: tickets.status,
        })
        .from(tickets)
        .where(eq(tickets.epicId, epicId))
        .all();

      // Dry-run: return preview of what would be affected
      if (!confirm) {
        return {
          preview: true,
          epic: {
            id: epic.id,
            title: epic.title,
            description: epic.description,
            projectId: epic.projectId,
          },
          ticketsToUnlink,
        };
      }

      // Actually delete (tickets get unlinked via FK onDelete: "set null")
      // Use transaction for atomicity
      try {
        sqlite.transaction(() => {
          // Explicitly unlink tickets (even though FK would handle it)
          db.update(tickets)
            .set({ epicId: null, updatedAt: new Date().toISOString() })
            .where(eq(tickets.epicId, epicId))
            .run();
          // Delete the epic
          db.delete(epics).where(eq(epics.id, epicId)).run();
        })();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (message.includes("SQLITE_BUSY")) {
          throw new Error(
            "Failed to delete epic: The database is busy. Please try again in a moment."
          );
        }
        throw new Error(`Failed to delete epic: ${message}`);
      }

      return {
        deleted: true,
        epic: {
          id: epic.id,
          title: epic.title,
        },
        ticketsUnlinked: ticketsToUnlink.length,
      };
    }
  );

// Get epic detail with all related data for the Epic Detail page
export const getEpicDetail = createServerFn({ method: "GET" })
  .inputValidator((epicId: string) => {
    if (!epicId) {
      throw new Error("Epic ID is required");
    }
    return epicId;
  })
  .handler(async ({ data: epicId }): Promise<EpicDetailResult> => {
    // Fetch epic
    const epicResult = db.select().from(epics).where(eq(epics.id, epicId)).get();
    const epic = ensureExists(epicResult, "Epic", epicId);

    // Fetch project
    const projectResult = db.select().from(projects).where(eq(projects.id, epic.projectId)).get();
    const project = ensureExists(projectResult, "Project", epic.projectId);

    // Fetch tickets for this epic
    const epicTickets = db
      .select({
        id: tickets.id,
        title: tickets.title,
        status: tickets.status,
        priority: tickets.priority,
        isBlocked: tickets.isBlocked,
        blockedReason: tickets.blockedReason,
        branchName: tickets.branchName,
        prNumber: tickets.prNumber,
        prUrl: tickets.prUrl,
        prStatus: tickets.prStatus,
      })
      .from(tickets)
      .where(eq(tickets.epicId, epicId))
      .all();

    const criticalFindings = db
      .select({
        id: reviewFindings.id,
        ticketId: reviewFindings.ticketId,
        ticketTitle: tickets.title,
        category: reviewFindings.category,
        agent: reviewFindings.agent,
        description: reviewFindings.description,
        filePath: reviewFindings.filePath,
        lineNumber: reviewFindings.lineNumber,
        status: reviewFindings.status,
        createdAt: reviewFindings.createdAt,
        fixedAt: reviewFindings.fixedAt,
      })
      .from(reviewFindings)
      .innerJoin(tickets, eq(reviewFindings.ticketId, tickets.id))
      .where(and(eq(tickets.epicId, epicId), eq(reviewFindings.severity, "critical")))
      .orderBy(desc(reviewFindings.createdAt))
      .all();

    const findingsCounts = db
      .select({
        severity: reviewFindings.severity,
        status: reviewFindings.status,
        count: sql<number>`COUNT(*)`,
      })
      .from(reviewFindings)
      .innerJoin(tickets, eq(reviewFindings.ticketId, tickets.id))
      .where(eq(tickets.epicId, epicId))
      .groupBy(reviewFindings.severity, reviewFindings.status)
      .all();

    const findingsSummary: EpicDetailResult["findingsSummary"] = {
      critical: 0,
      major: 0,
      minor: 0,
      suggestion: 0,
      fixed: 0,
      total: 0,
    };

    for (const row of findingsCounts) {
      findingsSummary.total += row.count;

      if (row.status === "fixed") {
        findingsSummary.fixed += row.count;
      }

      const severity = row.severity as keyof EpicDetailResult["findingsSummary"];
      if (severity in findingsSummary && severity !== "fixed" && severity !== "total") {
        findingsSummary[severity] += row.count;
      }
    }

    // Compute ticketsByStatus
    const ticketsByStatus: Record<string, number> = {};
    for (const ticket of epicTickets) {
      ticketsByStatus[ticket.status] = (ticketsByStatus[ticket.status] ?? 0) + 1;
    }

    // Fetch workflow state (may not exist)
    const workflowStateResult = db
      .select()
      .from(epicWorkflowState)
      .where(eq(epicWorkflowState.epicId, epicId))
      .get();

    let workflowState: EpicDetailResult["workflowState"] = null;

    if (workflowStateResult) {
      // Parse learnings JSON with try/catch fallback to empty array
      let parsedLearnings: EpicLearningEntry[] = [];
      if (workflowStateResult.learnings) {
        try {
          parsedLearnings = JSON.parse(workflowStateResult.learnings);
        } catch (err) {
          log.error(
            `Failed to parse epic learnings JSON for epic ${epicId}`,
            err instanceof Error ? err : new Error(String(err))
          );
          parsedLearnings = [];
        }
      }

      workflowState = {
        id: workflowStateResult.id,
        ticketsTotal: workflowStateResult.ticketsTotal ?? 0,
        ticketsDone: workflowStateResult.ticketsDone ?? 0,
        currentTicketId: workflowStateResult.currentTicketId,
        learnings: parsedLearnings,
        epicBranchName: workflowStateResult.epicBranchName,
        prNumber: workflowStateResult.prNumber,
        prUrl: workflowStateResult.prUrl,
        prStatus: workflowStateResult.prStatus,
      };
    }

    return {
      epic: {
        id: epic.id,
        title: epic.title,
        description: epic.description,
        projectId: epic.projectId,
        color: epic.color,
        createdAt: epic.createdAt,
      },
      project: {
        id: project.id,
        name: project.name,
        path: project.path,
        color: project.color,
      },
      tickets: epicTickets,
      ticketsByStatus,
      workflowState,
      findingsSummary,
      criticalFindings,
    };
  });
