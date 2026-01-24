import { createServerFn } from "@tanstack/react-start";
import { db } from "../lib/db";
import { claudeTasks, type ClaudeTask, type ClaudeTaskStatus } from "../lib/schema";
import { eq, asc } from "drizzle-orm";

export type { ClaudeTask, ClaudeTaskStatus };

/**
 * Get Claude tasks for a ticket, ordered by position.
 * Tasks are displayed in the UI to show AI work progress in real-time.
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
    try {
      return db
        .select()
        .from(claudeTasks)
        .where(eq(claudeTasks.ticketId, ticketId))
        .orderBy(asc(claudeTasks.position))
        .all();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Failed to fetch Claude tasks", {
        ticketId,
        error: message,
      });
      throw err;
    }
  });
