import { createServerFn } from "@tanstack/react-start";
import { db } from "../lib/db";
import { claudeTasks, type ClaudeTask, type ClaudeTaskStatus } from "../lib/schema";
import { eq, asc } from "drizzle-orm";

// Re-export types from schema
export type { ClaudeTask, ClaudeTaskStatus };

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
    return db
      .select()
      .from(claudeTasks)
      .where(eq(claudeTasks.ticketId, ticketId))
      .orderBy(asc(claudeTasks.position))
      .all();
  });
