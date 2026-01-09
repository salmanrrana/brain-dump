import { createServerFn } from "@tanstack/react-start";
import { db } from "../lib/db";
import { tickets, projects, epics } from "../lib/schema";
import { eq, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

// Types
export type TicketStatus = "backlog" | "ready" | "in_progress" | "review" | "done";
export type TicketPriority = "high" | "medium" | "low";

export interface Subtask {
  id: string;
  text: string;
  completed: boolean;
}

export interface CreateTicketInput {
  title: string;
  description?: string;
  projectId: string;
  epicId?: string;
  priority?: TicketPriority;
  tags?: string[];
}

export interface UpdateTicketInput {
  title?: string;
  description?: string | null;
  status?: TicketStatus;
  priority?: TicketPriority;
  epicId?: string | null;
  tags?: string[];
  subtasks?: Subtask[];
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
  .handler(async ({ data: filters }) => {
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
      for (const tag of filters.tags) {
        sql += ` AND EXISTS (
          SELECT 1 FROM json_each(tickets.tags)
          WHERE json_each.value = ?
        )`;
        params.push(tag);
      }

      sql += " ORDER BY position";

      const { sqlite } = await import("../lib/db");
      const stmt = sqlite.prepare(sql);
      return stmt.all(...params) as typeof tickets.$inferSelect[];
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
    const ticket = db.select().from(tickets).where(eq(tickets.id, id)).get();
    if (!ticket) {
      throw new Error(`Ticket not found: ${id}`);
    }
    return ticket;
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
    const project = db
      .select()
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .get();
    if (!project) {
      throw new Error(`Project not found: ${input.projectId}`);
    }

    // Verify epic exists if provided
    if (input.epicId) {
      const epic = db
        .select()
        .from(epics)
        .where(eq(epics.id, input.epicId))
        .get();
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
      .where(
        and(
          eq(tickets.projectId, input.projectId),
          eq(tickets.status, "backlog")
        )
      )
      .get();

    const position = (maxPosition?.maxPos ?? 0) + 1;

    const id = randomUUID();
    const newTicket = {
      id,
      title: input.title.trim(),
      description: input.description?.trim() ?? null,
      projectId: input.projectId,
      epicId: input.epicId ?? null,
      status: "backlog" as TicketStatus,
      priority: input.priority ?? null,
      position,
      tags: input.tags ? JSON.stringify(input.tags) : null,
      subtasks: null,
      isBlocked: false,
      blockedReason: null,
      linkedFiles: null,
      attachments: null,
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
    const existing = db.select().from(tickets).where(eq(tickets.id, id)).get();
    if (!existing) {
      throw new Error(`Ticket not found: ${id}`);
    }

    // Verify epic exists if being updated
    if (updates.epicId !== undefined && updates.epicId !== null) {
      const epic = db
        .select()
        .from(epics)
        .where(eq(epics.id, updates.epicId))
        .get();
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
    if (updates.tags !== undefined)
      updateData.tags = updates.tags ? JSON.stringify(updates.tags) : null;
    if (updates.subtasks !== undefined)
      updateData.subtasks = updates.subtasks
        ? JSON.stringify(updates.subtasks)
        : null;
    if (updates.isBlocked !== undefined) updateData.isBlocked = updates.isBlocked;
    if (updates.blockedReason !== undefined)
      updateData.blockedReason = updates.blockedReason;
    if (updates.linkedFiles !== undefined)
      updateData.linkedFiles = updates.linkedFiles
        ? JSON.stringify(updates.linkedFiles)
        : null;

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
      "review",
      "done",
    ];
    if (!validStatuses.includes(input.status)) {
      throw new Error(`Invalid status: ${input.status}`);
    }
    return input;
  })
  .handler(async ({ data: { id, status } }) => {
    const existing = db.select().from(tickets).where(eq(tickets.id, id)).get();
    if (!existing) {
      throw new Error(`Ticket not found: ${id}`);
    }

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

    return db.select().from(tickets).where(eq(tickets.id, id)).get();
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
    const existing = db.select().from(tickets).where(eq(tickets.id, id)).get();
    if (!existing) {
      throw new Error(`Ticket not found: ${id}`);
    }

    db.update(tickets)
      .set({ position, updatedAt: new Date().toISOString() })
      .where(eq(tickets.id, id))
      .run();

    return db.select().from(tickets).where(eq(tickets.id, id)).get();
  });

// Delete a ticket
export const deleteTicket = createServerFn({ method: "POST" })
  .inputValidator((id: string) => {
    if (!id) {
      throw new Error("Ticket ID is required");
    }
    return id;
  })
  .handler(async ({ data: id }) => {
    const existing = db.select().from(tickets).where(eq(tickets.id, id)).get();
    if (!existing) {
      throw new Error(`Ticket not found: ${id}`);
    }

    db.delete(tickets).where(eq(tickets.id, id)).run();

    return { success: true, deletedId: id };
  });
