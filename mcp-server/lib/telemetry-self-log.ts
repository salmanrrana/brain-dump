/**
 * Telemetry self-logging utility for MCP tools.
 * Enables tools to log their own invocations in environments without hooks (VS Code, OpenCode).
 * @module lib/telemetry-self-log
 */
import { randomUUID } from "crypto";
import { log } from "./logging.js";

/**
 * Get the active telemetry session for a ticket.
 * @param {import("better-sqlite3").Database} db
 * @param {string} ticketId
 * @returns {{ id: string, ticket_id: string } | null}
 */
export function getActiveTelemetrySession(db, ticketId) {
  if (!ticketId) return null;

  try {
    // Find an active (not ended) telemetry session for this ticket
    const session = db.prepare(
      `SELECT id, ticket_id FROM telemetry_sessions
       WHERE ticket_id = ? AND ended_at IS NULL
       ORDER BY started_at DESC
       LIMIT 1`
    ).get(ticketId);

    return session || null;
  } catch (err) {
    log.warn(`Failed to get active telemetry session: ${err.message}`);
    return null;
  }
}

/**
 * Log an MCP call event to the telemetry system.
 * Used internally by workflow tools to self-log their invocations.
 * @param {import("better-sqlite3").Database} db
 * @param {object} options
 * @param {string} options.sessionId - The telemetry session ID
 * @param {string} options.ticketId - The ticket ID
 * @param {"start" | "end"} options.event - Whether this is start or end of the call
 * @param {string} options.toolName - Name of the MCP tool (e.g., "complete_ticket_work")
 * @param {string} [options.correlationId] - Unique ID to pair start/end events
 * @param {Record<string, unknown>} [options.params] - Tool parameters (sanitized)
 * @param {boolean} [options.success] - Whether the call succeeded (for end events)
 * @param {number} [options.durationMs] - Duration in milliseconds (for end events)
 * @param {string} [options.error] - Error message if failed (for end events)
 * @returns {string | null} The correlation ID for pairing start/end events
 */
export function logMcpCallEvent(db: any, {
  sessionId,
  ticketId,
  event,
  toolName,
  correlationId,
  params,
  success,
  durationMs,
  error,
}: {
  sessionId?: any;
  ticketId?: any;
  event?: string;
  toolName?: string;
  correlationId?: string;
  params?: any;
  success?: boolean;
  durationMs?: number;
  error?: any;
} = {}) {
  const id = randomUUID();
  const now = new Date().toISOString();

  // For start events, generate a correlation ID if not provided
  const corrId = correlationId || (event === "start" ? randomUUID() : null);

  // Use mcp_call event type to distinguish from hook-logged tool_start/tool_end
  const eventType = "mcp_call";

  // Build event data
  const eventData = {
    toolName,
    phase: event, // "start" or "end"
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
  } catch (err) {
    log.warn(`Failed to log MCP call event: ${err.message}`);
    return null;
  }
}

/**
 * Summarize tool parameters to avoid storing sensitive content.
 * @param {Record<string, unknown>} params
 * @returns {Record<string, unknown>}
 */
function summarizeParams(params) {
  const summary = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      // Truncate strings and note length
      summary[key] = value.length > 100 ? `[${value.length} chars]` : value;
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
 * @param {import("better-sqlite3").Database} db
 * @param {string} toolName - Name of the MCP tool
 * @param {(params: any) => string | null} getTicketId - Function to extract ticketId from params
 * @param {(params: any) => Promise<any>} handler - The actual tool handler
 * @returns {(params: any) => Promise<any>}
 */
export function withTelemetry(db, toolName, getTicketId, handler) {
  return async (params) => {
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
      params,
    });

    try {
      const result = await handler(params);

      // Determine success from result
      const success = !result?.isError;

      logMcpCallEvent(db, {
        sessionId: session.id,
        ticketId: session.ticket_id,
        event: "end",
        toolName,
        correlationId,
        success,
        durationMs: Date.now() - startTime,
      });

      return result;
    } catch (err) {
      logMcpCallEvent(db, {
        sessionId: session.id,
        ticketId: session.ticket_id,
        event: "end",
        toolName,
        correlationId,
        success: false,
        durationMs: Date.now() - startTime,
        error: err.message,
      });

      throw err;
    }
  };
}
