import { createServerFn } from "@tanstack/react-start";
import { db } from "../lib/db";
import { telemetrySessions, telemetryEvents } from "../lib/schema";
import { eq, desc, and } from "drizzle-orm";

// Telemetry types
export type TelemetryEventType =
  | "session_start"
  | "session_end"
  | "prompt"
  | "tool_start"
  | "tool_end"
  | "mcp_call"
  | "task_created"
  | "task_started"
  | "task_completed"
  | "context_loaded"
  | "error";

export interface TelemetrySession {
  id: string;
  ticketId: string | null;
  projectId: string | null;
  environment: string;
  branchName: string | null;
  claudeSessionId: string | null;
  startedAt: string;
  endedAt: string | null;
  totalPrompts: number | null;
  totalToolCalls: number | null;
  totalDurationMs: number | null;
  totalTokens: number | null;
  outcome: string | null;
}

export interface TelemetryEvent {
  id: string;
  sessionId: string;
  ticketId: string | null;
  eventType: string;
  toolName: string | null;
  eventData: string | null;
  durationMs: number | null;
  tokenCount: number | null;
  isError: boolean | null;
  correlationId: string | null;
  createdAt: string;
}

export interface ParsedTelemetryEvent extends Omit<TelemetryEvent, "eventData"> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventData: Record<string, any> | null;
}

export interface TelemetrySessionWithEvents extends TelemetrySession {
  events: ParsedTelemetryEvent[];
  eventCount: number;
}

// Get telemetry sessions for a ticket
export const getTelemetrySessions = createServerFn({ method: "GET" })
  .inputValidator((data: { ticketId?: string; projectId?: string; limit?: number }) => {
    if (!data.ticketId && !data.projectId) {
      throw new Error("Either ticketId or projectId is required");
    }
    return data;
  })
  .handler(async ({ data }): Promise<TelemetrySession[]> => {
    const { ticketId, projectId, limit = 20 } = data;

    let query = db.select().from(telemetrySessions);

    if (ticketId) {
      query = query.where(eq(telemetrySessions.ticketId, ticketId)) as typeof query;
    } else if (projectId) {
      query = query.where(eq(telemetrySessions.projectId, projectId)) as typeof query;
    }

    const sessions = query.orderBy(desc(telemetrySessions.startedAt)).limit(limit).all();

    return sessions;
  });

// Get a single telemetry session with its events
export const getTelemetrySession = createServerFn({ method: "GET" })
  .inputValidator((data: { sessionId: string; includeEvents?: boolean; eventLimit?: number }) => {
    if (!data.sessionId || typeof data.sessionId !== "string") {
      throw new Error("Session ID is required");
    }
    return data;
  })
  .handler(async ({ data }): Promise<TelemetrySessionWithEvents | null> => {
    const { sessionId, includeEvents = true, eventLimit = 100 } = data;

    const session = db
      .select()
      .from(telemetrySessions)
      .where(eq(telemetrySessions.id, sessionId))
      .get();

    if (!session) {
      return null;
    }

    let events: ParsedTelemetryEvent[] = [];
    let eventCount = 0;

    if (includeEvents) {
      const rawEvents = db
        .select()
        .from(telemetryEvents)
        .where(eq(telemetryEvents.sessionId, sessionId))
        .orderBy(telemetryEvents.createdAt)
        .limit(eventLimit)
        .all();

      events = rawEvents.map((e) => ({
        ...e,
        eventData: e.eventData ? JSON.parse(e.eventData) : null,
      }));
      eventCount = rawEvents.length;
    }

    return {
      ...session,
      events,
      eventCount,
    };
  });

// Get the most recent session for a ticket
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

    const events = rawEvents.map((e) => ({
      ...e,
      eventData: e.eventData ? JSON.parse(e.eventData) : null,
    }));

    return {
      ...session,
      events,
      eventCount: events.length,
    };
  });

// Get telemetry stats for a ticket (aggregated across all sessions)
export interface TelemetryStats {
  totalSessions: number;
  totalPrompts: number;
  totalToolCalls: number;
  totalDurationMs: number;
  avgSessionDurationMs: number;
  mostUsedTools: Array<{ toolName: string; count: number }>;
  successRate: number;
  latestSession: TelemetrySession | null;
}

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
      .where(and(eq(telemetryEvents.ticketId, ticketId), eq(telemetryEvents.eventType, "tool_end")))
      .all();

    const toolCounts = new Map<string, number>();
    for (const event of toolEvents) {
      const toolName = event.toolName || "unknown";
      toolCounts.set(toolName, (toolCounts.get(toolName) || 0) + 1);
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
