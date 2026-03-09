import { createServerFn } from "@tanstack/react-start";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db } from "../lib/db";
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
      status: "available",
      totalSessions: sessions.length,
      totalPrompts,
      totalToolCalls,
      totalDurationMs,
      avgSessionDurationMs: totalDurationMs / sessions.length,
      mostUsedTools,
      successRate: (successCount / sessions.length) * 100,
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
