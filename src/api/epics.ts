import { createServerFn } from "@tanstack/react-start";
import { db, sqlite } from "../lib/db";
import { epics, projects, tickets, epicWorkflowState } from "../lib/schema";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { ensureExists } from "../lib/utils";

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
    return db.select().from(epics).where(eq(epics.projectId, projectId)).all();
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

// =============================================================================
// EPIC WORKTREE STATE
// =============================================================================

/**
 * Worktree state response for an epic
 */
export interface EpicWorktreeStateResponse {
  epicId: string;
  worktreePath: string | null;
  worktreeStatus: "active" | "stale" | "orphaned" | null;
  worktreeCreatedAt: string | null;
}

/**
 * Get worktree states for all epics in a project.
 * Returns worktree path and status for each epic that has workflow state.
 */
export const getEpicWorktreeStates = createServerFn({ method: "GET" })
  .inputValidator((projectId: string) => {
    if (!projectId) {
      throw new Error("Project ID is required");
    }
    return projectId;
  })
  .handler(async ({ data: projectId }): Promise<EpicWorktreeStateResponse[]> => {
    // Verify project exists
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
    ensureExists(project, "Project", projectId);

    // Get all epics for the project
    const projectEpics = db
      .select({ id: epics.id })
      .from(epics)
      .where(eq(epics.projectId, projectId))
      .all();

    if (projectEpics.length === 0) {
      return [];
    }

    const epicIds = projectEpics.map((e) => e.id);

    // Fetch worktree state for these epics
    const states = db
      .select({
        epicId: epicWorkflowState.epicId,
        worktreePath: epicWorkflowState.worktreePath,
        worktreeStatus: epicWorkflowState.worktreeStatus,
        worktreeCreatedAt: epicWorkflowState.worktreeCreatedAt,
      })
      .from(epicWorkflowState)
      .where(inArray(epicWorkflowState.epicId, epicIds))
      .all();

    return states;
  });

/**
 * Get worktree states for ALL epics across all projects.
 * Used by the sidebar to show worktree badges on epic cards.
 */
export const getAllEpicWorktreeStates = createServerFn({ method: "GET" }).handler(
  async (): Promise<EpicWorktreeStateResponse[]> => {
    // Fetch all worktree states (only rows that have worktree info)
    const states = db
      .select({
        epicId: epicWorkflowState.epicId,
        worktreePath: epicWorkflowState.worktreePath,
        worktreeStatus: epicWorkflowState.worktreeStatus,
        worktreeCreatedAt: epicWorkflowState.worktreeCreatedAt,
      })
      .from(epicWorkflowState)
      .all();

    return states;
  }
);
