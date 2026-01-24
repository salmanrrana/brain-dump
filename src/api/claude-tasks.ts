import { createServerFn } from "@tanstack/react-start";
import { db } from "../lib/db";
import { claudeTasks } from "../lib/schema";
import { eq, asc } from "drizzle-orm";

/**
 * Claude task status types matching the schema.
 */
export type ClaudeTaskStatus = "pending" | "in_progress" | "completed";

/**
 * Claude task interface for API responses.
 */
export interface ClaudeTask {
  id: string;
  ticketId: string;
  subject: string;
  description: string | null;
  status: ClaudeTaskStatus;
  activeForm: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

/**
 * Get all Claude tasks for a specific ticket.
 * Tasks are returned ordered by position (ascending).
 */
export const getClaudeTasks = createServerFn({ method: "GET" })
  .inputValidator((data: string) => {
    if (!data || typeof data !== "string") {
      throw new Error("Ticket ID is required");
    }
    if (!/^[a-zA-Z0-9-]+$/.test(data)) {
      throw new Error("Invalid ticket ID format");
    }
    return data;
  })
  .handler(async ({ data: ticketId }): Promise<ClaudeTask[]> => {
    const tasks = db
      .select()
      .from(claudeTasks)
      .where(eq(claudeTasks.ticketId, ticketId))
      .orderBy(asc(claudeTasks.position))
      .all();

    return tasks.map((task) => ({
      id: task.id,
      ticketId: task.ticketId,
      subject: task.subject,
      description: task.description,
      status: task.status as ClaudeTaskStatus,
      activeForm: task.activeForm,
      position: task.position,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt,
    }));
  });
