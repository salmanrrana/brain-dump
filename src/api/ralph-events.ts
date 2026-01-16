import { createServerFn } from "@tanstack/react-start";
import { db } from "../lib/db";
import { ralphEvents } from "../lib/schema";
import { eq, gt, and, desc } from "drizzle-orm";

/**
 * Get events for a Ralph session.
 * Used for polling-based event streaming from the UI.
 */
export const getRalphEvents = createServerFn({ method: "GET" })
  .inputValidator((data: { sessionId: string; since?: string; limit?: number }) => data)
  .handler(async ({ data }) => {
    const { sessionId, since, limit = 50 } = data;

    try {
      let events;
      if (since) {
        events = db
          .select()
          .from(ralphEvents)
          .where(and(eq(ralphEvents.sessionId, sessionId), gt(ralphEvents.createdAt, since)))
          .orderBy(ralphEvents.createdAt)
          .limit(limit)
          .all();
      } else {
        events = db
          .select()
          .from(ralphEvents)
          .where(eq(ralphEvents.sessionId, sessionId))
          .orderBy(ralphEvents.createdAt)
          .limit(limit)
          .all();
      }

      // Parse JSON data field
      const parsedEvents = events.map((event) => ({
        id: event.id,
        sessionId: event.sessionId,
        type: event.type,
        data: event.data ? JSON.parse(event.data) : {},
        createdAt: event.createdAt,
      }));

      return {
        success: true,
        sessionId,
        eventCount: parsedEvents.length,
        events: parsedEvents,
        lastEventTime:
          parsedEvents.length > 0 ? parsedEvents[parsedEvents.length - 1]?.createdAt : since,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        message: `Failed to get events: ${message}`,
        events: [],
      };
    }
  });

/**
 * Get the latest event for a Ralph session.
 * Useful for quick status checks.
 */
export const getLatestRalphEvent = createServerFn({ method: "GET" })
  .inputValidator((data: { sessionId: string }) => data)
  .handler(async ({ data }) => {
    const { sessionId } = data;

    try {
      const event = db
        .select()
        .from(ralphEvents)
        .where(eq(ralphEvents.sessionId, sessionId))
        .orderBy(desc(ralphEvents.createdAt))
        .limit(1)
        .get();

      if (!event) {
        return {
          success: true,
          sessionId,
          event: null,
        };
      }

      return {
        success: true,
        sessionId,
        event: {
          id: event.id,
          sessionId: event.sessionId,
          type: event.type,
          data: event.data ? JSON.parse(event.data) : {},
          createdAt: event.createdAt,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        message: `Failed to get latest event: ${message}`,
        event: null,
      };
    }
  });

/**
 * Clear events for a Ralph session.
 * Called when a session ends to clean up.
 */
export const clearRalphEvents = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string }) => data)
  .handler(async ({ data }) => {
    const { sessionId } = data;

    try {
      const result = db.delete(ralphEvents).where(eq(ralphEvents.sessionId, sessionId)).run();

      return {
        success: true,
        sessionId,
        deletedCount: result.changes,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        message: `Failed to clear events: ${message}`,
      };
    }
  });

/**
 * Get event statistics for a Ralph session.
 * Returns counts by event type.
 */
export const getRalphEventStats = createServerFn({ method: "GET" })
  .inputValidator((data: { sessionId: string }) => data)
  .handler(async ({ data }) => {
    const { sessionId } = data;

    try {
      const events = db
        .select()
        .from(ralphEvents)
        .where(eq(ralphEvents.sessionId, sessionId))
        .all();

      // Count events by type
      const stats: Record<string, number> = {};
      for (const event of events) {
        stats[event.type] = (stats[event.type] || 0) + 1;
      }

      return {
        success: true,
        sessionId,
        totalEvents: events.length,
        byType: stats,
        firstEventTime: events.length > 0 ? events[0]?.createdAt : null,
        lastEventTime: events.length > 0 ? events[events.length - 1]?.createdAt : null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        message: `Failed to get event stats: ${message}`,
      };
    }
  });
