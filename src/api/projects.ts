import { createServerFn } from "@tanstack/react-start";
import { db } from "../lib/db";
import { projects } from "../lib/schema";
import { eq } from "drizzle-orm";
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
}

// Get all projects
export const getProjects = createServerFn({ method: "GET" }).handler(
  async () => {
    const allProjects = db.select().from(projects).all();
    return allProjects;
  }
);

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

    if (Object.keys(updateData).length > 0) {
      db.update(projects).set(updateData).where(eq(projects.id, id)).run();
    }

    return db.select().from(projects).where(eq(projects.id, id)).get();
  });

// Delete a project (cascades to epics and tickets)
export const deleteProject = createServerFn({ method: "POST" })
  .inputValidator((id: string) => {
    if (!id) {
      throw new Error("Project ID is required");
    }
    return id;
  })
  .handler(async ({ data: id }) => {
    const existing = db.select().from(projects).where(eq(projects.id, id)).get();
    ensureExists(existing, "Project", id);

    db.delete(projects).where(eq(projects.id, id)).run();

    return { success: true, deletedId: id };
  });
