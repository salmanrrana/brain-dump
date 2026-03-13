import { createServerFn } from "@tanstack/react-start";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db, sqlite } from "../lib/db";
import * as schema from "../lib/schema";
import { eq, desc } from "drizzle-orm";
import { safeJsonParse } from "../lib/utils";

const { telemetrySessions, telemetryEvents } = schema;

export type { TelemetrySession, NewTelemetrySession } from "../lib/schema";
export type { TelemetryEvent, NewTelemetryEvent } from "../lib/schema";

export type TelemetryEventRecord = typeof telemetryEvents.$inferSelect;
export type TelemetrySessionRecord = typeof telemetrySessions.$inferSelect;
type TelemetryDatabase = BetterSQLite3Database<typeof schema>;
type TelemetryEventValue =
  | string
  | number
  | boolean
  | null
  | TelemetryEventValue[]
  | { [key: string]: TelemetryEventValue };
type TelemetryEventData = { [key: string]: TelemetryEventValue };

export interface ParsedTelemetryEvent extends Omit<TelemetryEventRecord, "eventData"> {
  eventData: TelemetryEventData | null;
}

export interface TelemetrySessionWithEvents extends TelemetrySessionRecord {
  events: ParsedTelemetryEvent[];
  eventCount: number;
}

export type TelemetryUnavailableReason = "missing_schema" | "invalid_event_data";

export interface TelemetryUnavailableState {
  status: "unavailable";
  reason: TelemetryUnavailableReason;
  message: string;
}

export interface TelemetryStats {
  totalSessions: number;
  totalPrompts: number;
  totalToolCalls: number;
  totalDurationMs: number;
  avgSessionDurationMs: number;
  mostUsedTools: Array<{ toolName: string; count: number }>;
  successRate: number;
  errorCount: number;
  latestSession: TelemetrySessionRecord | null;
}

export interface TelemetryStatsAvailable extends TelemetryStats {
  status: "available";
}

export interface TelemetrySessionAvailable {
  status: "available";
  session: TelemetrySessionWithEvents | null;
}

export type TelemetryStatsResult = TelemetryStatsAvailable | TelemetryUnavailableState;
export type TelemetrySessionResult = TelemetrySessionAvailable | TelemetryUnavailableState;

const TELEMETRY_SCHEMA_MESSAGE =
  "Telemetry is unavailable for this ticket because this Brain Dump install still needs the telemetry schema upgrade.";
const TELEMETRY_EVENT_DATA_MESSAGE =
  "Telemetry timeline is unavailable because one or more stored event payloads are malformed.";

function createTelemetryUnavailableState(
  reason: TelemetryUnavailableReason,
  message: string
): TelemetryUnavailableState {
  return {
    status: "unavailable",
    reason,
    message,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isMissingTelemetrySchemaError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("no such table: telemetry_sessions") ||
    message.includes("no such table: telemetry_events")
  );
}

function getTelemetryUnavailableState(error: unknown): TelemetryUnavailableState | null {
  if (isMissingTelemetrySchemaError(error)) {
    return createTelemetryUnavailableState("missing_schema", TELEMETRY_SCHEMA_MESSAGE);
  }

  return null;
}

function parseTelemetryEventData(
  rawEventData: string | null
): TelemetryUnavailableState | TelemetryEventData | null {
  if (!rawEventData) {
    return null;
  }

  const parseErrorFallback = { __parseError: true as const };
  const parsed = safeJsonParse<TelemetryEventData | typeof parseErrorFallback>(
    rawEventData,
    parseErrorFallback
  );

  if (
    "__parseError" in parsed ||
    Array.isArray(parsed) ||
    typeof parsed !== "object" ||
    parsed === null
  ) {
    return createTelemetryUnavailableState("invalid_event_data", TELEMETRY_EVENT_DATA_MESSAGE);
  }

  return parsed;
}

function isTelemetryUnavailableState(
  value: TelemetryUnavailableState | TelemetryEventData | null
): value is TelemetryUnavailableState {
  return value !== null && "status" in value;
}

function createEmptyTelemetryStats(): TelemetryStatsAvailable {
  return {
    status: "available",
    totalSessions: 0,
    totalPrompts: 0,
    totalToolCalls: 0,
    totalDurationMs: 0,
    avgSessionDurationMs: 0,
    mostUsedTools: [],
    successRate: 0,
    errorCount: 0,
    latestSession: null,
  };
}

export function loadTelemetryStats(
  database: TelemetryDatabase,
  ticketId: string
): TelemetryStatsResult {
  try {
    const sessions = database
      .select()
      .from(telemetrySessions)
      .where(eq(telemetrySessions.ticketId, ticketId))
      .orderBy(desc(telemetrySessions.startedAt))
      .all();

    if (sessions.length === 0) {
      return createEmptyTelemetryStats();
    }

    let totalPrompts = 0;
    let totalToolCalls = 0;
    let totalDurationMs = 0;
    let successCount = 0;

    for (const session of sessions) {
      totalPrompts += session.totalPrompts ?? 0;
      totalToolCalls += session.totalToolCalls ?? 0;
      totalDurationMs += session.totalDurationMs ?? 0;
      if (session.outcome === "success") {
        successCount++;
      }
    }

    const toolEvents = database
      .select()
      .from(telemetryEvents)
      .where(eq(telemetryEvents.ticketId, ticketId))
      .all();

    const toolCounts = new Map<string, number>();
    let errorCount = 0;
    for (const event of toolEvents) {
      const toolName = event.toolName || "unknown";
      if (event.eventType === "tool_end") {
        toolCounts.set(toolName, (toolCounts.get(toolName) || 0) + 1);
      }
      if (event.isError || event.eventType === "error") {
        errorCount++;
      }
    }

    const mostUsedTools = Array.from(toolCounts.entries())
      .map(([toolName, count]) => ({ toolName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      status: "available",
      totalSessions: sessions.length,
      totalPrompts,
      totalToolCalls,
      totalDurationMs,
      avgSessionDurationMs: totalDurationMs / sessions.length,
      mostUsedTools,
      successRate: (successCount / sessions.length) * 100,
      errorCount,
      latestSession: sessions[0] ?? null,
    };
  } catch (error) {
    const unavailableState = getTelemetryUnavailableState(error);
    if (unavailableState) {
      return unavailableState;
    }

    throw error;
  }
}

export function loadLatestTelemetrySession(
  database: TelemetryDatabase,
  ticketId: string
): TelemetrySessionResult {
  try {
    const session = database
      .select()
      .from(telemetrySessions)
      .where(eq(telemetrySessions.ticketId, ticketId))
      .orderBy(desc(telemetrySessions.startedAt))
      .limit(1)
      .get();

    if (!session) {
      return {
        status: "available",
        session: null,
      };
    }

    const rawEvents = database
      .select()
      .from(telemetryEvents)
      .where(eq(telemetryEvents.sessionId, session.id))
      .orderBy(telemetryEvents.createdAt)
      .limit(100)
      .all();

    const events: ParsedTelemetryEvent[] = [];
    for (const rawEvent of rawEvents) {
      const parsedEventData = parseTelemetryEventData(rawEvent.eventData);
      if (isTelemetryUnavailableState(parsedEventData)) {
        return parsedEventData;
      }

      events.push({
        ...rawEvent,
        eventData: parsedEventData,
      });
    }

    return {
      status: "available",
      session: {
        ...session,
        events,
        eventCount: events.length,
      },
    };
  } catch (error) {
    const unavailableState = getTelemetryUnavailableState(error);
    if (unavailableState) {
      return unavailableState;
    }

    throw error;
  }
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
  .handler(async ({ data: ticketId }): Promise<TelemetryStatsResult> => {
    return loadTelemetryStats(db, ticketId);
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
  .handler(async ({ data: ticketId }): Promise<TelemetrySessionResult> => {
    return loadLatestTelemetrySession(db, ticketId);
  });

// =============================================================================
// Dashboard Telemetry Analytics
// =============================================================================

export interface DashboardTelemetryAnalytics {
  /** Top tools by call count (tool_end events) */
  toolCallDistribution: Array<{ toolName: string; count: number }>;
  /** Session outcomes breakdown */
  sessionOutcomes: {
    success: number;
    failure: number;
    timeout: number;
    cancelled: number;
    inProgress: number;
  };
  /** Sessions grouped by environment */
  environmentBreakdown: Array<{ environment: string; count: number }>;
  /** Sessions per day over last 30 days */
  sessionsOverTime: Array<{ date: string; count: number }>;
  /** Average session duration per day (minutes) over last 30 days */
  avgDurationOverTime: Array<{ date: string; avgMinutes: number }>;
  /** Token usage per day over last 30 days */
  tokenUsageOverTime: Array<{ date: string; tokens: number }>;
}

/**
 * Get aggregated telemetry analytics for the dashboard.
 * Aggregates across all sessions and projects.
 */
export const getDashboardTelemetryAnalytics = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardTelemetryAnalytics> => {
    const now = new Date();
    const formatDate = (date: Date): string => {
      const isoString = date.toISOString();
      return isoString.split("T")[0] ?? isoString.substring(0, 10);
    };

    try {
      // 1. Tool call distribution (top 15 tools by tool_end event count)
      const toolDistRows = sqlite
        .prepare(
          `SELECT tool_name, COUNT(*) as count
           FROM telemetry_events
           WHERE event_type = 'tool_end' AND tool_name IS NOT NULL
           GROUP BY tool_name
           ORDER BY count DESC
           LIMIT 15`
        )
        .all() as Array<{ tool_name: string; count: number }>;

      const toolCallDistribution = toolDistRows.map((r) => ({
        toolName: (r.tool_name || "unknown").replace("mcp__brain-dump__", ""),
        count: Number(r.count) || 0,
      }));

      // 2. Session outcomes
      const outcomeRows = sqlite
        .prepare(
          `SELECT outcome, COUNT(*) as count
           FROM telemetry_sessions
           GROUP BY outcome`
        )
        .all() as Array<{ outcome: string | null; count: number }>;

      const sessionOutcomes = {
        success: 0,
        failure: 0,
        timeout: 0,
        cancelled: 0,
        inProgress: 0,
      };
      for (const row of outcomeRows) {
        const count = Number(row.count) || 0;
        if (row.outcome === "success") sessionOutcomes.success = count;
        else if (row.outcome === "failure") sessionOutcomes.failure = count;
        else if (row.outcome === "timeout") sessionOutcomes.timeout = count;
        else if (row.outcome === "cancelled") sessionOutcomes.cancelled = count;
        else sessionOutcomes.inProgress += count;
      }

      // 3. Environment breakdown
      const envRows = sqlite
        .prepare(
          `SELECT environment, COUNT(*) as count
           FROM telemetry_sessions
           GROUP BY environment
           ORDER BY count DESC`
        )
        .all() as Array<{ environment: string; count: number }>;

      const environmentBreakdown = envRows.map((r) => ({
        environment: r.environment || "unknown",
        count: Number(r.count) || 0,
      }));

      // 4. Sessions over time (last 30 days)
      const sessionsTimeRows = sqlite
        .prepare(
          `SELECT date(started_at) as date, COUNT(*) as count
           FROM telemetry_sessions
           WHERE started_at >= datetime('now', '-30 days')
           GROUP BY date(started_at)
           ORDER BY date ASC`
        )
        .all() as Array<{ date: string; count: number }>;

      const sessionsTimeMap = new Map<string, number>();
      for (let i = 0; i < 30; i++) {
        const date = new Date(now.getTime() - (29 - i) * 24 * 60 * 60 * 1000);
        const dateStr = formatDate(date);
        sessionsTimeMap.set(dateStr, 0);
      }
      for (const row of sessionsTimeRows) {
        if (row.date) sessionsTimeMap.set(row.date, Number(row.count) || 0);
      }
      const sessionsOverTime = Array.from(sessionsTimeMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // 5. Avg session duration over time (last 30 days)
      const durationRows = sqlite
        .prepare(
          `SELECT date(started_at) as date,
                  AVG(total_duration_ms) as avg_ms
           FROM telemetry_sessions
           WHERE started_at >= datetime('now', '-30 days')
             AND total_duration_ms IS NOT NULL
             AND total_duration_ms > 0
           GROUP BY date(started_at)
           ORDER BY date ASC`
        )
        .all() as Array<{ date: string; avg_ms: number }>;

      const durationMap = new Map<string, number>();
      for (let i = 0; i < 30; i++) {
        const date = new Date(now.getTime() - (29 - i) * 24 * 60 * 60 * 1000);
        const dateStr = formatDate(date);
        durationMap.set(dateStr, 0);
      }
      for (const row of durationRows) {
        if (row.date) {
          durationMap.set(row.date, Math.round((Number(row.avg_ms) || 0) / 60000));
        }
      }
      const avgDurationOverTime = Array.from(durationMap.entries())
        .map(([date, avgMinutes]) => ({ date, avgMinutes }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // 6. Token usage over time (last 30 days)
      const tokenRows = sqlite
        .prepare(
          `SELECT date(started_at) as date,
                  SUM(total_tokens) as tokens
           FROM telemetry_sessions
           WHERE started_at >= datetime('now', '-30 days')
             AND total_tokens IS NOT NULL
             AND total_tokens > 0
           GROUP BY date(started_at)
           ORDER BY date ASC`
        )
        .all() as Array<{ date: string; tokens: number }>;

      const tokenMap = new Map<string, number>();
      for (let i = 0; i < 30; i++) {
        const date = new Date(now.getTime() - (29 - i) * 24 * 60 * 60 * 1000);
        const dateStr = formatDate(date);
        tokenMap.set(dateStr, 0);
      }
      for (const row of tokenRows) {
        if (row.date) tokenMap.set(row.date, Number(row.tokens) || 0);
      }
      const tokenUsageOverTime = Array.from(tokenMap.entries())
        .map(([date, tokens]) => ({ date, tokens }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return {
        toolCallDistribution,
        sessionOutcomes,
        environmentBreakdown,
        sessionsOverTime,
        avgDurationOverTime,
        tokenUsageOverTime,
      };
    } catch (error) {
      // Gracefully handle missing telemetry tables
      if (isMissingTelemetrySchemaError(error)) {
        return {
          toolCallDistribution: [],
          sessionOutcomes: { success: 0, failure: 0, timeout: 0, cancelled: 0, inProgress: 0 },
          environmentBreakdown: [],
          sessionsOverTime: [],
          avgDurationOverTime: [],
          tokenUsageOverTime: [],
        };
      }
      throw error;
    }
  }
);
