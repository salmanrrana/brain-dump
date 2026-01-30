/**
 * Telemetry self-logging utility for MCP tools.
 * Enables tools to log their own invocations in environments without hooks (VS Code, OpenCode).
 * @module lib/telemetry-self-log
 */
import { randomUUID } from "crypto";
import { log } from "./logging.js";
import Database from "better-sqlite3";

// ============================================
// Type Definitions
// ============================================

/** Telemetry session record */
interface TelemetrySession {
  id: string;
  ticket_id: string;
}

/** MCP call event type */
type McpCallEvent = "start" | "end";

/** Options for logging an MCP call event */
interface LogMcpCallOptions {
  sessionId: string;
  ticketId: string;
  event: McpCallEvent;
  toolName: string;
  correlationId?: string;
  params?: Record<string, unknown>;
  success?: boolean;
  durationMs?: number;
  error?: string;
}

/** Event data structure */
interface EventData {
  toolName: string;
  phase: McpCallEvent;
  params?: Record<string, unknown>;
  success?: boolean;
  error?: string;
}

/** MCP tool handler function type */
type McpHandler<T> = (params: unknown) => Promise<T>;

/** Function to extract ticket ID from params */
type GetTicketIdFn = (params: unknown) => string | null;

// ============================================
// Main Functions
// ============================================

/**
 * Get the active telemetry session for a ticket.
 */
export function getActiveTelemetrySession(
  db: Database.Database,
  ticketId: string | null
): TelemetrySession | null {
  if (!ticketId) return null;

  try {
    // Find an active (not ended) telemetry session for this ticket
    const session = db
      .prepare(
        `SELECT id, ticket_id FROM telemetry_sessions
       WHERE ticket_id = ? AND ended_at IS NULL
       ORDER BY started_at DESC
       LIMIT 1`
      )
      .get(ticketId) as TelemetrySession | undefined;

    return session || null;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.warn(`Failed to get active telemetry session: ${errorMsg}`);
    return null;
  }
}

/**
 * Log an MCP call event to the telemetry system.
 * Used internally by workflow tools to self-log their invocations.
 */
export function logMcpCallEvent(
  db: Database.Database,
  options: LogMcpCallOptions
): string | null {
  const {
    sessionId,
    ticketId,
    event,
    toolName,
    correlationId,
    params,
    success,
    durationMs,
    error,
  } = options;

  const id = randomUUID();
  const now = new Date().toISOString();

  // For start events, generate a correlation ID if not provided
  const corrId = correlationId || (event === "start" ? randomUUID() : null);

  // Use mcp_call event type to distinguish from hook-logged tool_start/tool_end
  const eventType = "mcp_call";

  // Build event data
  const eventData: EventData = {
    toolName,
    phase: event,
    ...(params && { params: summarizeParams(params) }),
    ...(success !== undefined && { success }),
    ...(error && { error }),
  };

  try {
    db.prepare(
      `INSERT INTO telemetry_events
       (id, session_id, ticket_id, event_type, tool_name, event_data, duration_ms, is_error, correlation_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      sessionId,
      ticketId,
      eventType,
      toolName,
      JSON.stringify(eventData),
      durationMs || null,
      error ? 1 : 0,
      corrId,
      now
    );

    // Update session stats on end events
    if (event === "end") {
      db.prepare(
        "UPDATE telemetry_sessions SET total_tool_calls = total_tool_calls + 1 WHERE id = ?"
      ).run(sessionId);
    }

    log.info(`Logged ${eventType}:${event} for ${toolName}`);
    return corrId;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.warn(`Failed to log MCP call event: ${errorMsg}`);
    return null;
  }
}

/**
 * Summarize tool parameters to avoid storing sensitive content.
 */
function summarizeParams(
  params: Record<string, unknown>
): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      // Truncate strings and note length
      summary[key] =
        value.length > 100 ? `[${value.length} chars]` : value;
    } else if (Array.isArray(value)) {
      summary[key] = `[array, ${value.length} items]`;
    } else if (typeof value === "object" && value !== null) {
      summary[key] = `[object, ${Object.keys(value).length} keys]`;
    } else {
      summary[key] = value;
    }
  }
  return summary;
}

/**
 * Create a self-logging wrapper for MCP tool handlers.
 * Automatically logs start/end events when the tool is called.
 */
export function withTelemetry<T>(
  db: Database.Database,
  toolName: string,
  getTicketId: GetTicketIdFn,
  handler: McpHandler<T>
): McpHandler<T> {
  return async (params: unknown) => {
    const ticketId = getTicketId(params);
    const session = getActiveTelemetrySession(db, ticketId);

    // If no active session, just run the handler without telemetry
    if (!session) {
      return handler(params);
    }

    const startTime = Date.now();
    const correlationId = logMcpCallEvent(db, {
      sessionId: session.id,
      ticketId: session.ticket_id,
      event: "start",
      toolName,
      params: params as Record<string, unknown>,
    });

    try {
      const result = await handler(params);

      // Determine success from result
      const success = !((result as Record<string, unknown>)?.isError);

      const endParams: LogMcpCallOptions = {
        sessionId: session.id,
        ticketId: session.ticket_id,
        event: "end",
        toolName,
        success,
        durationMs: Date.now() - startTime,
      };
      if (correlationId) endParams.correlationId = correlationId;
      logMcpCallEvent(db, endParams);

      return result;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorParams: LogMcpCallOptions = {
        sessionId: session.id,
        ticketId: session.ticket_id,
        event: "end",
        toolName,
        success: false,
        durationMs: Date.now() - startTime,
        error: errorMsg,
      };
      if (correlationId) errorParams.correlationId = correlationId;
      logMcpCallEvent(db, errorParams);

      throw err;
    }
  };
}
