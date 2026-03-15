import { createServerFn } from "@tanstack/react-start";
import { db, sqlite } from "../lib/db";
import { tickets, ralphSessions, type RalphSessionState } from "../lib/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { safeJsonParse } from "../lib/utils";

// ============================================================================
// TYPES
// ============================================================================

// JSON value type for metadata (compatible with exactOptionalPropertyTypes)
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface ActiveRalphSession {
  id: string;
  ticketId: string;
  /** Project ID the ticket belongs to - used for determining projects with active AI */
  projectId: string;
  currentState: RalphSessionState;
  startedAt: string;
  stateHistory: Array<{
    state: string;
    timestamp: string;
    metadata?: Record<string, JsonValue> | undefined;
  }> | null;
}

// ============================================================================
// SERVER FUNCTIONS
// ============================================================================

/**
 * Get active Ralph session for a ticket (if any).
 * An active session is one that has not been completed (completedAt is null).
 */
export const getActiveRalphSession = createServerFn({ method: "GET" })
  .inputValidator((ticketId: string) => ticketId)
  .handler(async ({ data: ticketId }): Promise<ActiveRalphSession | null> => {
    // Join with tickets to get projectId for the session
    const session = db
      .select({
        id: ralphSessions.id,
        ticketId: ralphSessions.ticketId,
        projectId: tickets.projectId,
        currentState: ralphSessions.currentState,
        startedAt: ralphSessions.startedAt,
        stateHistory: ralphSessions.stateHistory,
      })
      .from(ralphSessions)
      .innerJoin(tickets, eq(ralphSessions.ticketId, tickets.id))
      .where(and(eq(ralphSessions.ticketId, ticketId), isNull(ralphSessions.completedAt)))
      .orderBy(desc(ralphSessions.startedAt))
      .limit(1)
      .get();

    if (!session) {
      return null;
    }

    return {
      id: session.id,
      ticketId: session.ticketId,
      projectId: session.projectId,
      currentState: session.currentState as RalphSessionState,
      startedAt: session.startedAt,
      stateHistory: safeJsonParse(session.stateHistory, null),
    };
  });

/**
 * Get all active Ralph sessions (for batch fetching on kanban board).
 * Returns a map of ticketId -> session for efficient lookup.
 * Includes projectId for each session to determine which projects have active AI.
 */
export const getActiveRalphSessions = createServerFn({ method: "GET" }).handler(
  async (): Promise<Record<string, ActiveRalphSession>> => {
    // Join with tickets to get projectId for each session
    const sessions = db
      .select({
        id: ralphSessions.id,
        ticketId: ralphSessions.ticketId,
        projectId: tickets.projectId,
        currentState: ralphSessions.currentState,
        startedAt: ralphSessions.startedAt,
        stateHistory: ralphSessions.stateHistory,
      })
      .from(ralphSessions)
      .innerJoin(tickets, eq(ralphSessions.ticketId, tickets.id))
      .where(isNull(ralphSessions.completedAt))
      .orderBy(desc(ralphSessions.startedAt))
      .all();

    const result: Record<string, ActiveRalphSession> = {};
    for (const session of sessions) {
      // Only keep the most recent session per ticket
      if (!result[session.ticketId]) {
        result[session.ticketId] = {
          id: session.id,
          ticketId: session.ticketId,
          projectId: session.projectId,
          currentState: session.currentState as RalphSessionState,
          startedAt: session.startedAt,
          stateHistory: safeJsonParse(session.stateHistory, null),
        };
      }
    }

    return result;
  }
);

/**
 * Clear all active (stale) Ralph sessions for a project.
 * Marks them as cancelled so the "AI active" badge disappears.
 */
export const clearActiveSessionsForProject = createServerFn({ method: "POST" })
  .inputValidator((projectId: string) => projectId)
  .handler(async ({ data: projectId }) => {
    const { clearActiveSessionsForProject: clearSessions } = await import("../../core/index.ts");
    const result = clearSessions(sqlite, projectId);
    return result;
  });
