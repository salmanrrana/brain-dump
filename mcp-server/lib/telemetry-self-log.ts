/**
 * Telemetry self-logging middleware for MCP tools.
 *
 * Instruments all MCP tool handlers to automatically log start/end events
 * with duration and correlation IDs. Auto-creates telemetry sessions when
 * an active ticket is detected (via ralph-state.json or tool params).
 *
 * Replaces 6 external telemetry hooks:
 * - log-tool-start.sh (PreToolUse)
 * - log-tool-end.sh (PostToolUse)
 * - log-tool-failure.sh (PostToolUseFailure)
 * - start-telemetry-session.sh (SessionStart)
 * - end-telemetry-session.sh (Stop)
 * - log-prompt.sh (UserPromptSubmit)
 *
 * @module lib/telemetry-self-log
 */
import { randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { log } from "./logging.js";
import type Database from "better-sqlite3";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { startTelemetrySession, endTelemetrySession } from "../../core/telemetry.ts";

// ============================================
// Module State
// ============================================

/** Cached active telemetry session (avoids DB lookups on every call) */
let cachedSession: { id: string; ticketId: string } | null = null;

/** Whether the session was auto-created by this module (vs. externally) */
let isAutoCreatedSession = false;

/** Tools to exclude from instrumentation (avoid noisy self-logging) */
const EXCLUDED_TOOLS = new Set(["telemetry"]);

// ============================================
// Types
// ============================================

interface EventData {
  toolName: string;
  phase: "start" | "end";
  params?: Record<string, unknown>;
  success?: boolean;
  error?: string;
}

// ============================================
// Helpers
// ============================================

/**
 * Summarize tool parameters to avoid storing sensitive content.
 */
function summarizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
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
 * Detect active ticket from ralph-state.json in the project directory.
 */
function detectTicketFromRalphState(): string | null {
  try {
    const ralphStatePath = join(process.cwd(), ".claude", "ralph-state.json");
    if (existsSync(ralphStatePath)) {
      const state = JSON.parse(readFileSync(ralphStatePath, "utf-8")) as {
        ticketId?: string;
      };
      return state.ticketId ?? null;
    }
  } catch {
    // Ignore errors reading ralph-state
  }
  return null;
}

/**
 * Extract ticketId from tool params (many tools accept ticketId).
 */
function extractTicketId(params: unknown): string | null {
  if (params && typeof params === "object" && "ticketId" in params) {
    const val = (params as Record<string, unknown>).ticketId;
    if (typeof val === "string" && val.length > 0) return val;
  }
  return null;
}

/**
 * Get or auto-create a telemetry session for the active ticket.
 * Returns null if no ticket is active.
 */
function resolveSession(
  db: Database.Database,
  ticketId: string | null,
  detectEnvironment: () => string
): { id: string; ticketId: string } | null {
  // Return cached session if ticket matches
  if (cachedSession) {
    if (!ticketId || cachedSession.ticketId === ticketId) {
      return cachedSession;
    }
  }

  // Determine ticket ID: from params, or from ralph-state
  const resolvedTicketId = ticketId ?? detectTicketFromRalphState();
  if (!resolvedTicketId) return null;

  // Check for existing active session in DB
  try {
    const existing = db
      .prepare(
        `SELECT id, ticket_id FROM telemetry_sessions
         WHERE ticket_id = ? AND ended_at IS NULL
         ORDER BY started_at DESC
         LIMIT 1`
      )
      .get(resolvedTicketId) as { id: string; ticket_id: string } | undefined;

    if (existing) {
      cachedSession = { id: existing.id, ticketId: existing.ticket_id };
      return cachedSession;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Failed to check existing telemetry session: ${msg}`);
    return null;
  }

  // Auto-create a new session
  try {
    const result = startTelemetrySession(db, { ticketId: resolvedTicketId }, detectEnvironment);
    cachedSession = { id: result.id, ticketId: resolvedTicketId };
    isAutoCreatedSession = true;
    log.info(`Auto-created telemetry session ${result.id} for ticket ${resolvedTicketId}`);
    return cachedSession;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Failed to auto-create telemetry session: ${msg}`);
    return null;
  }
}

/**
 * Log an MCP tool call event to the telemetry DB.
 */
function logToolEvent(
  db: Database.Database,
  sessionId: string,
  ticketId: string,
  toolName: string,
  phase: "start" | "end",
  correlationId: string | null,
  options?: {
    params?: Record<string, unknown>;
    success?: boolean;
    durationMs?: number;
    error?: string;
  }
): string | null {
  const id = randomUUID();
  const now = new Date().toISOString();
  const corrId = correlationId ?? (phase === "start" ? randomUUID() : null);

  const eventData: EventData = {
    toolName,
    phase,
    ...(options?.params && { params: summarizeParams(options.params) }),
    ...(options?.success !== undefined && { success: options.success }),
    ...(options?.error && { error: options.error }),
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
      "mcp_call",
      toolName,
      JSON.stringify(eventData),
      options?.durationMs ?? null,
      options?.error ? 1 : 0,
      corrId,
      now
    );

    if (phase === "end") {
      db.prepare(
        "UPDATE telemetry_sessions SET total_tool_calls = total_tool_calls + 1 WHERE id = ?"
      ).run(sessionId);
    }

    return corrId;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Failed to log tool event: ${msg}`);
    return null;
  }
}

// ============================================
// Public API
// ============================================

/**
 * Instrument an McpServer so all subsequently registered tools are
 * automatically wrapped with telemetry logging.
 *
 * Call this BEFORE registering any tools. It patches `server.tool()`
 * to wrap each handler with start/end event logging, duration tracking,
 * and auto-session creation.
 */
export function instrumentServer(
  server: McpServer,
  db: Database.Database,
  detectEnvironment: () => string
): void {
  // Save the original tool method
  const originalTool = server.tool.bind(server);

  // Override server.tool() to wrap handlers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).tool = function (...args: unknown[]): unknown {
    const toolName = args[0] as string;

    // Find the handler (last argument that is a function)
    let handlerIndex = -1;
    for (let i = args.length - 1; i >= 0; i--) {
      if (typeof args[i] === "function") {
        handlerIndex = i;
        break;
      }
    }

    if (handlerIndex >= 0 && !EXCLUDED_TOOLS.has(toolName)) {
      const originalHandler = args[handlerIndex] as (...handlerArgs: unknown[]) => Promise<unknown>;

      args[handlerIndex] = async (...handlerArgs: unknown[]) => {
        // Extract ticketId from first arg (tool params)
        const toolParams = handlerArgs[0] as Record<string, unknown> | undefined;
        const ticketId = extractTicketId(toolParams);

        const session = resolveSession(db, ticketId, detectEnvironment);

        // No session — just run the handler
        if (!session) {
          return originalHandler(...handlerArgs);
        }

        const startTime = Date.now();
        const correlationId = logToolEvent(
          db,
          session.id,
          session.ticketId,
          toolName,
          "start",
          null,
          toolParams ? { params: toolParams } : undefined
        );

        try {
          const result = await originalHandler(...handlerArgs);

          const isError =
            result &&
            typeof result === "object" &&
            (result as Record<string, unknown>).isError === true;

          logToolEvent(db, session.id, session.ticketId, toolName, "end", correlationId, {
            success: !isError,
            durationMs: Date.now() - startTime,
          });

          return result;
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);

          logToolEvent(db, session.id, session.ticketId, toolName, "end", correlationId, {
            success: false,
            durationMs: Date.now() - startTime,
            error: errorMsg,
          });

          throw err;
        }
      };
    }

    // Call the original tool registration with (possibly wrapped) handler
    return (originalTool as (...a: unknown[]) => unknown)(...args);
  };
}

/**
 * End any auto-created telemetry session.
 * Call this during server shutdown to finalize metrics.
 */
export function endActiveSession(db: Database.Database): void {
  if (!cachedSession) return;

  try {
    // Only auto-end sessions we auto-created
    if (isAutoCreatedSession) {
      endTelemetrySession(db, {
        sessionId: cachedSession.id,
        outcome: "success",
      });
      log.info(`Auto-ended telemetry session ${cachedSession.id}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Failed to auto-end telemetry session: ${msg}`);
  } finally {
    cachedSession = null;
    isAutoCreatedSession = false;
  }
}

/**
 * Clear cached session state. Useful for testing.
 */
export function resetSessionCache(): void {
  cachedSession = null;
  isAutoCreatedSession = false;
}
