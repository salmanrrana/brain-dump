import { createServerFn } from "@tanstack/react-start";
import { db } from "../lib/db";
import { epics, projects } from "../lib/schema";
import { eq } from "drizzle-orm";
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
    const project = db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get();
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
    const project = db
      .select()
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .get();
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

// Delete an epic (tickets become orphaned - epic_id set to null)
export const deleteEpic = createServerFn({ method: "POST" })
  .inputValidator((id: string) => {
    if (!id) {
      throw new Error("Epic ID is required");
    }
    return id;
  })
  .handler(async ({ data: id }) => {
    const existing = db.select().from(epics).where(eq(epics.id, id)).get();
    ensureExists(existing, "Epic", id);

    db.delete(epics).where(eq(epics.id, id)).run();

    return { success: true, deletedId: id };
  });
