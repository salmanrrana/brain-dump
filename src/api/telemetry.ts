import { createServerFn } from "@tanstack/react-start";
import { db } from "../lib/db";
import { telemetrySessions, telemetryEvents } from "../lib/schema";
import { eq, desc } from "drizzle-orm";

export type { TelemetrySession, NewTelemetrySession } from "../lib/schema";
export type { TelemetryEvent, NewTelemetryEvent } from "../lib/schema";

export type TelemetryEventRecord = typeof telemetryEvents.$inferSelect;
export type TelemetrySessionRecord = typeof telemetrySessions.$inferSelect;

export interface ParsedTelemetryEvent extends Omit<TelemetryEventRecord, "eventData"> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventData: Record<string, any> | null;
}

export interface TelemetrySessionWithEvents extends TelemetrySessionRecord {
  events: ParsedTelemetryEvent[];
  eventCount: number;
}

export interface TelemetryStats {
  totalSessions: number;
  totalPrompts: number;
  totalToolCalls: number;
  totalDurationMs: number;
  avgSessionDurationMs: number;
  mostUsedTools: Array<{ toolName: string; count: number }>;
  successRate: number;
  latestSession: TelemetrySessionRecord | null;
}

/**
 * Get telemetry stats for a ticket (aggregated across all sessions)
 */
export const getTelemetryStats = createServerFn({ method: "GET" })
  .inputValidator((data: string) => {
    if (!data || typeof data !== "string") {
      throw new Error("Ticket ID is required");
    }
    return data;
  })
  .handler(async ({ data: ticketId }): Promise<TelemetryStats> => {
    const sessions = db
      .select()
      .from(telemetrySessions)
      .where(eq(telemetrySessions.ticketId, ticketId))
      .orderBy(desc(telemetrySessions.startedAt))
      .all();

    if (sessions.length === 0) {
      return {
        totalSessions: 0,
        totalPrompts: 0,
        totalToolCalls: 0,
        totalDurationMs: 0,
        avgSessionDurationMs: 0,
        mostUsedTools: [],
        successRate: 0,
        latestSession: null,
      };
    }

    // Aggregate stats
    let totalPrompts = 0;
    let totalToolCalls = 0;
    let totalDurationMs = 0;
    let successCount = 0;

    for (const session of sessions) {
      totalPrompts += session.totalPrompts ?? 0;
      totalToolCalls += session.totalToolCalls ?? 0;
      totalDurationMs += session.totalDurationMs ?? 0;
      if (session.outcome === "success") successCount++;
    }

    // Get tool usage breakdown
    const toolEvents = db
      .select()
      .from(telemetryEvents)
      .where(eq(telemetryEvents.ticketId, ticketId))
      .all();

    const toolCounts = new Map<string, number>();
    for (const event of toolEvents) {
      const toolName = event.toolName || "unknown";
      if (event.eventType === "tool_end") {
        toolCounts.set(toolName, (toolCounts.get(toolName) || 0) + 1);
      }
    }

    const mostUsedTools = Array.from(toolCounts.entries())
      .map(([toolName, count]) => ({ toolName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalSessions: sessions.length,
      totalPrompts,
      totalToolCalls,
      totalDurationMs,
      avgSessionDurationMs: totalDurationMs / sessions.length,
      mostUsedTools,
      successRate: sessions.length > 0 ? (successCount / sessions.length) * 100 : 0,
      latestSession: sessions[0] ?? null,
    };
  });

/**
 * Get the most recent session for a ticket with its events
 */
export const getLatestTelemetrySession = createServerFn({ method: "GET" })
  .inputValidator((data: string) => {
    if (!data || typeof data !== "string") {
      throw new Error("Ticket ID is required");
    }
    return data;
  })
  .handler(async ({ data: ticketId }): Promise<TelemetrySessionWithEvents | null> => {
    const session = db
      .select()
      .from(telemetrySessions)
      .where(eq(telemetrySessions.ticketId, ticketId))
      .orderBy(desc(telemetrySessions.startedAt))
      .limit(1)
      .get();

    if (!session) {
      return null;
    }

    const rawEvents = db
      .select()
      .from(telemetryEvents)
      .where(eq(telemetryEvents.sessionId, session.id))
      .orderBy(telemetryEvents.createdAt)
      .limit(100)
      .all();

    const events = rawEvents.map((e: (typeof rawEvents)[0]) => ({
      ...e,
      eventData: e.eventData ? JSON.parse(e.eventData) : null,
    })) as ParsedTelemetryEvent[];

    return {
      ...session,
      events,
      eventCount: events.length,
    };
  });
