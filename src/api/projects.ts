import { createServerFn } from "@tanstack/react-start";
import { db, sqlite } from "../lib/db";
import { projects, epics, tickets, ticketComments } from "../lib/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { ensureExists } from "../lib/utils";

// Types
export interface CreateProjectInput {
  name: string;
  path: string;
  color?: string;
}

export interface UpdateProjectInput {
  name?: string;
  path?: string;
  color?: string;
  workingMethod?: "auto" | "claude-code" | "vscode" | "opencode";
}

// Get all projects
export const getProjects = createServerFn({ method: "GET" }).handler(async () => {
  const allProjects = db.select().from(projects).all();
  return allProjects;
});

// Create a new project
export const createProject = createServerFn({ method: "POST" })
  .inputValidator((input: CreateProjectInput) => {
    if (!input.name || input.name.trim().length === 0) {
      throw new Error("Project name is required");
    }
    if (!input.path || input.path.trim().length === 0) {
      throw new Error("Project path is required");
    }
    if (!existsSync(input.path)) {
      throw new Error(`Directory does not exist: ${input.path}`);
    }
    return input;
  })
  .handler(async ({ data: input }) => {
    const id = randomUUID();
    const newProject = {
      id,
      name: input.name.trim(),
      path: input.path.trim(),
      color: input.color ?? null,
    };

    db.insert(projects).values(newProject).run();

    return db.select().from(projects).where(eq(projects.id, id)).get();
  });

// Update a project
export const updateProject = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; updates: UpdateProjectInput }) => {
    if (!input.id) {
      throw new Error("Project ID is required");
    }
    if (input.updates.path && !existsSync(input.updates.path)) {
      throw new Error(`Directory does not exist: ${input.updates.path}`);
    }
    return input;
  })
  .handler(async ({ data: { id, updates } }) => {
    const existing = db.select().from(projects).where(eq(projects.id, id)).get();
    ensureExists(existing, "Project", id);

    const updateData: Partial<typeof projects.$inferInsert> = {};
    if (updates.name !== undefined) updateData.name = updates.name.trim();
    if (updates.path !== undefined) updateData.path = updates.path.trim();
    if (updates.color !== undefined) updateData.color = updates.color;
    if (updates.workingMethod !== undefined) updateData.workingMethod = updates.workingMethod;

    if (Object.keys(updateData).length > 0) {
      db.update(projects).set(updateData).where(eq(projects.id, id)).run();
    }

    return db.select().from(projects).where(eq(projects.id, id)).get();
  });

// Delete a project with dry-run preview support
// Note: This cascades to delete ALL epics, tickets, and comments
export interface DeleteProjectInput {
  projectId: string;
  confirm?: boolean;
}

export interface ProjectTicketInfo {
  id: string;
  title: string;
  status: string;
  epicId: string | null;
}

export interface ProjectEpicInfo {
  id: string;
  title: string;
}

export interface DeleteProjectPreview {
  preview: true;
  project: {
    id: string;
    name: string;
    path: string;
  };
  epics: ProjectEpicInfo[];
  tickets: ProjectTicketInfo[];
  commentCount: number;
}

export interface DeleteProjectResult {
  deleted: true;
  project: {
    id: string;
    name: string;
  };
  epicCount: number;
  ticketCount: number;
  commentCount: number;
}

export const deleteProject = createServerFn({ method: "POST" })
  .inputValidator((input: DeleteProjectInput) => {
    if (!input.projectId) {
      throw new Error("Project ID is required");
    }
    return input;
  })
  .handler(
    async ({
      data: { projectId, confirm = false },
    }): Promise<DeleteProjectPreview | DeleteProjectResult> => {
      const projectResult = db.select().from(projects).where(eq(projects.id, projectId)).get();
      const project = ensureExists(projectResult, "Project", projectId);

      // Gather all data that would be deleted
      const projectEpics = db
        .select({
          id: epics.id,
          title: epics.title,
        })
        .from(epics)
        .where(eq(epics.projectId, projectId))
        .all();

      const projectTickets = db
        .select({
          id: tickets.id,
          title: tickets.title,
          status: tickets.status,
          epicId: tickets.epicId,
        })
        .from(tickets)
        .where(eq(tickets.projectId, projectId))
        .all();

      // Count comments across all tickets
      let commentCount = 0;
      if (projectTickets.length > 0) {
        const ticketIds = projectTickets.map((t: (typeof projectTickets)[0]) => t.id);
        const commentResult = db
          .select({ count: sql<number>`COUNT(*)` })
          .from(ticketComments)
          .where(inArray(ticketComments.ticketId, ticketIds))
          .get();
        commentCount = commentResult?.count ?? 0;
      }

      // Dry-run: return preview of what would be deleted
      if (!confirm) {
        return {
          preview: true,
          project: {
            id: project.id,
            name: project.name,
            path: project.path,
          },
          epics: projectEpics,
          tickets: projectTickets,
          commentCount,
        };
      }

      // Actually delete (use transaction for atomicity)
      // Note: FK cascade should handle most of this, but we do it explicitly for clarity
      try {
        sqlite.transaction(() => {
          // 1. Delete comments for all project tickets
          if (projectTickets.length > 0) {
            const ticketIds = projectTickets.map((t: (typeof projectTickets)[0]) => t.id);
            db.delete(ticketComments).where(inArray(ticketComments.ticketId, ticketIds)).run();
          }

          // 2. Delete tickets
          db.delete(tickets).where(eq(tickets.projectId, projectId)).run();

          // 3. Delete epics
          db.delete(epics).where(eq(epics.projectId, projectId)).run();

          // 4. Delete project
          db.delete(projects).where(eq(projects.id, projectId)).run();
        })();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (message.includes("SQLITE_BUSY")) {
          throw new Error(
            "Failed to delete project: The database is busy. Please try again in a moment."
          );
        }
        throw new Error(`Failed to delete project: ${message}`);
      }

      return {
        deleted: true,
        project: {
          id: project.id,
          name: project.name,
        },
        epicCount: projectEpics.length,
        ticketCount: projectTickets.length,
        commentCount,
      };
    }
  );
