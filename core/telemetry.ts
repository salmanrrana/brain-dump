/**
 * Telemetry business logic for the core layer.
 *
 * Extracted from mcp-server/tools/telemetry.ts.
 * All functions take a DbHandle and return typed results or throw CoreError subclasses.
 *
 * Telemetry captures AI interaction metrics: prompts, tool calls, and context loading.
 * Correlation IDs pair tool_start/tool_end events for duration tracking.
 */

import { randomUUID, createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import type { DbHandle } from "./types.ts";
import { SessionNotFoundError, ValidationError } from "./errors.ts";
import type { DbTelemetrySessionRow, DbTelemetryEventRow } from "./db-rows.ts";

// ============================================
// Constants
// ============================================

export const TELEMETRY_OUTCOMES = ["success", "failure", "timeout", "cancelled"] as const;
export type TelemetryOutcome = (typeof TELEMETRY_OUTCOMES)[number];

export const TOOL_EVENTS = ["start", "end"] as const;
export type ToolEventType = (typeof TOOL_EVENTS)[number];

// ============================================
// Types
// ============================================

/** Result of active ticket detection from Ralph state file or git branch */
export interface TicketDetectionResult {
  ticketId: string | null;
  source: string;
  shortId?: string | null;
  error?: string;
}

export interface StartTelemetrySessionParams {
  ticketId?: string;
  projectPath?: string;
  environment?: string;
}

export interface TelemetrySessionResult {
  id: string;
  ticketId: string | null;
  ticketTitle: string | null;
  environment: string;
  detectionSource: string;
  branchName: string | null;
  startedAt: string;
}

export interface LogPromptParams {
  sessionId: string;
  prompt: string;
  redact?: boolean;
  tokenCount?: number;
}

export interface LogPromptResult {
  eventId: string;
  promptLength: number;
  redacted: boolean;
}

export interface LogToolParams {
  sessionId: string;
  event: ToolEventType;
  toolName: string;
  correlationId?: string;
  params?: Record<string, unknown>;
  result?: string;
  success?: boolean;
  durationMs?: number;
  error?: string;
}

export interface LogToolResult {
  eventId: string;
  correlationId: string | null;
  eventType: string;
}

export interface LogContextParams {
  sessionId: string;
  hasDescription: boolean;
  hasAcceptanceCriteria: boolean;
  criteriaCount?: number;
  commentCount?: number;
  attachmentCount?: number;
  imageCount?: number;
}

export interface EndTelemetrySessionParams {
  sessionId: string;
  outcome?: TelemetryOutcome;
  totalTokens?: number;
}

export interface EndTelemetrySessionResult {
  sessionId: string;
  durationMs: number;
  totalPrompts: number;
  totalToolCalls: number;
  totalTokens: number | null;
  outcome: string | null;
}

export interface GetTelemetrySessionParams {
  sessionId?: string;
  ticketId?: string;
  includeEvents?: boolean;
  eventLimit?: number;
}

export interface TelemetrySessionDetail {
  id: string;
  ticketId: string | null;
  ticketTitle: string | null;
  projectId: string | null;
  environment: string | null;
  branchName: string | null;
  startedAt: string;
  endedAt: string | null;
  totalPrompts: number;
  totalToolCalls: number;
  totalDurationMs: number | null;
  totalTokens: number | null;
  outcome: string | null;
  events: TelemetryEventDetail[];
}

export interface TelemetryEventDetail {
  id: string;
  sessionId: string;
  ticketId: string | null;
  eventType: string;
  toolName: string | null;
  eventData: Record<string, unknown> | null;
  durationMs: number | null;
  isError: boolean;
  correlationId: string | null;
  createdAt: string;
}

export interface ListTelemetrySessionsParams {
  ticketId?: string;
  projectId?: string;
  since?: string;
  limit?: number;
}

export interface TelemetrySessionSummary {
  id: string;
  ticketId: string | null;
  ticketTitle: string | null;
  environment: string | null;
  startedAt: string;
  endedAt: string | null;
  totalPrompts: number;
  totalToolCalls: number;
  durationMin: number | null;
  outcome: string | null;
}

// ============================================
// Internal Helpers
// ============================================

function getTelemetrySessionRow(
  db: DbHandle,
  sessionId: string
): { id: string; ticket_id: string | null } {
  const session = db
    .prepare("SELECT id, ticket_id FROM telemetry_sessions WHERE id = ?")
    .get(sessionId) as { id: string; ticket_id: string | null } | undefined;
  if (!session) throw new SessionNotFoundError(sessionId);
  return session;
}

function getTicketTitle(db: DbHandle, ticketId: string | null): string | null {
  if (!ticketId) return null;
  const ticket = db.prepare("SELECT title FROM tickets WHERE id = ?").get(ticketId) as
    | { title: string }
    | undefined;
  return ticket?.title ?? null;
}

/**
 * Detect active ticket from Ralph state file or git branch.
 */
export function detectActiveTicket(projectPath: string): TicketDetectionResult {
  try {
    // First, try Ralph state file
    const ralphStatePath = join(projectPath, ".claude", "ralph-state.json");
    if (existsSync(ralphStatePath)) {
      try {
        const state = JSON.parse(readFileSync(ralphStatePath, "utf-8")) as {
          ticketId?: string;
        };
        if (state.ticketId) {
          return { ticketId: state.ticketId, source: "ralph-state" };
        }
      } catch {
        // Ralph state file is corrupted; fall through to git detection
      }
    }

    // Try to get ticket from branch name
    try {
      const branch = execFileSync("git", ["branch", "--show-current"], {
        cwd: projectPath,
        encoding: "utf-8",
        timeout: 5000,
      }).trim();

      // Branch format: feature/{short-id}-{slug}
      const match = branch.match(/^feature\/([a-f0-9]{8})-/);
      if (match?.[1]) {
        return { ticketId: null, source: "branch-partial", shortId: match[1] };
      }
    } catch {
      // Git not available or not a repository; fall through
    }

    return { ticketId: null, source: "none" };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { ticketId: null, source: "error", error: errorMsg };
  }
}

/**
 * Summarize tool parameters to avoid storing sensitive content.
 */
export function summarizeParams(params: Record<string, unknown>): string {
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
  return JSON.stringify(summary);
}

function parseEventData(row: DbTelemetryEventRow): TelemetryEventDetail {
  let eventData: Record<string, unknown> | null = null;
  if (row.event_data) {
    try {
      eventData = JSON.parse(row.event_data);
    } catch {
      throw new ValidationError(
        `Corrupted telemetry event data JSON for event ${row.id}. The event data may be damaged.`
      );
    }
  }
  return {
    id: row.id,
    sessionId: row.session_id,
    ticketId: row.ticket_id,
    eventType: row.event_type,
    toolName: row.tool_name,
    eventData,
    durationMs: row.duration_ms,
    isError: row.is_error === 1,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
  };
}

// ============================================
// Telemetry Functions
// ============================================

/**
 * Start a telemetry session for AI work on a ticket.
 *
 * Auto-detects ticket and environment if not provided.
 *
 * @param detectEnvironment - Function that returns the current environment name.
 *   Injected from the MCP server layer; core layer has no environment detection logic.
 */
export function startTelemetrySession(
  db: DbHandle,
  params: StartTelemetrySessionParams,
  detectEnvironment: () => string = () => "unknown"
): TelemetrySessionResult {
  const { ticketId, projectPath, environment } = params;

  const id = randomUUID();
  const now = new Date().toISOString();
  const detectedEnv = environment || detectEnvironment();

  // Try to detect ticket if not provided
  let resolvedTicketId: string | null = ticketId || null;
  let detectionSource = ticketId ? "provided" : "none";

  if (!resolvedTicketId && projectPath) {
    const detection = detectActiveTicket(projectPath);
    resolvedTicketId = detection.ticketId;
    detectionSource = detection.source;
  }

  // Get project/branch info from ticket
  let projectId: string | null = null;
  let branchName: string | null = null;
  let ticketTitle: string | null = null;

  if (resolvedTicketId) {
    const ticket = db
      .prepare("SELECT project_id, title, branch_name FROM tickets WHERE id = ?")
      .get(resolvedTicketId) as
      | { project_id: string; title: string; branch_name: string | null }
      | undefined;

    if (ticket) {
      projectId = ticket.project_id;
      branchName = ticket.branch_name;
      ticketTitle = ticket.title;
    }
  }

  db.prepare(
    `INSERT INTO telemetry_sessions
     (id, ticket_id, project_id, environment, branch_name, started_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, resolvedTicketId, projectId, detectedEnv, branchName, now);

  // Log session start event
  const eventId = randomUUID();
  db.prepare(
    `INSERT INTO telemetry_events
     (id, session_id, ticket_id, event_type, event_data, created_at)
     VALUES (?, ?, ?, 'session_start', ?, ?)`
  ).run(
    eventId,
    id,
    resolvedTicketId,
    JSON.stringify({
      environment: detectedEnv,
      ticketDetection: detectionSource,
      branchName,
    }),
    now
  );

  return {
    id,
    ticketId: resolvedTicketId,
    ticketTitle,
    environment: detectedEnv,
    detectionSource,
    branchName,
    startedAt: now,
  };
}

/**
 * Log a user prompt to the telemetry session.
 *
 * Optionally redacts the prompt by hashing it with SHA-256.
 *
 * @throws SessionNotFoundError if the session doesn't exist
 */
export function logPrompt(db: DbHandle, params: LogPromptParams): LogPromptResult {
  const { sessionId, prompt, redact = false, tokenCount } = params;

  const session = getTelemetrySessionRow(db, sessionId);

  const id = randomUUID();
  const now = new Date().toISOString();
  const storedPrompt = redact ? createHash("sha256").update(prompt).digest("hex") : prompt;

  db.prepare(
    `INSERT INTO telemetry_events
     (id, session_id, ticket_id, event_type, event_data, token_count, created_at)
     VALUES (?, ?, ?, 'prompt', ?, ?, ?)`
  ).run(
    id,
    sessionId,
    session.ticket_id,
    JSON.stringify({ prompt: storedPrompt, promptLength: prompt.length, redacted: redact }),
    tokenCount || null,
    now
  );

  db.prepare("UPDATE telemetry_sessions SET total_prompts = total_prompts + 1 WHERE id = ?").run(
    sessionId
  );

  return {
    eventId: id,
    promptLength: prompt.length,
    redacted: redact,
  };
}

/**
 * Log a tool call to the telemetry session.
 *
 * For 'start' events, generates a correlation ID if not provided.
 * For 'end' events, uses the provided correlation ID to pair with the start.
 *
 * @throws SessionNotFoundError if the session doesn't exist
 */
export function logTool(db: DbHandle, params: LogToolParams): LogToolResult {
  const {
    sessionId,
    event,
    toolName,
    correlationId,
    params: toolParams,
    result,
    success,
    durationMs,
    error,
  } = params;

  const session = getTelemetrySessionRow(db, sessionId);

  const id = randomUUID();
  const now = new Date().toISOString();
  const corrId = correlationId || (event === "start" ? randomUUID() : null);
  const eventType = event === "start" ? "tool_start" : "tool_end";

  const eventData: Record<string, unknown> = { toolName };
  if (toolParams) eventData.paramsSummary = summarizeParams(toolParams);
  if (result) eventData.resultSummary = result.substring(0, 500);
  if (success !== undefined) eventData.success = success;
  if (error) eventData.error = error;

  db.prepare(
    `INSERT INTO telemetry_events
     (id, session_id, ticket_id, event_type, tool_name, event_data, duration_ms, is_error, correlation_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    sessionId,
    session.ticket_id,
    eventType,
    toolName,
    JSON.stringify(eventData),
    durationMs || null,
    error ? 1 : 0,
    corrId,
    now
  );

  if (event === "end") {
    db.prepare(
      "UPDATE telemetry_sessions SET total_tool_calls = total_tool_calls + 1 WHERE id = ?"
    ).run(sessionId);
  }

  return {
    eventId: id,
    correlationId: corrId,
    eventType,
  };
}

/**
 * Log what context was loaded when AI started work on a ticket.
 *
 * @throws SessionNotFoundError if the session doesn't exist
 */
export function logContext(db: DbHandle, params: LogContextParams): string {
  const {
    sessionId,
    hasDescription,
    hasAcceptanceCriteria,
    criteriaCount = 0,
    commentCount = 0,
    attachmentCount = 0,
    imageCount = 0,
  } = params;

  const session = getTelemetrySessionRow(db, sessionId);

  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO telemetry_events
     (id, session_id, ticket_id, event_type, event_data, created_at)
     VALUES (?, ?, ?, 'context_loaded', ?, ?)`
  ).run(
    id,
    sessionId,
    session.ticket_id,
    JSON.stringify({
      hasDescription,
      hasAcceptanceCriteria,
      criteriaCount,
      commentCount,
      attachmentCount,
      imageCount,
    }),
    now
  );

  return id;
}

/**
 * End a telemetry session and compute final statistics.
 *
 * @throws SessionNotFoundError if the session doesn't exist
 * @throws ValidationError if the session is already ended
 */
export function endTelemetrySession(
  db: DbHandle,
  params: EndTelemetrySessionParams
): EndTelemetrySessionResult {
  const { sessionId, outcome, totalTokens } = params;

  const session = db.prepare("SELECT * FROM telemetry_sessions WHERE id = ?").get(sessionId) as
    | DbTelemetrySessionRow
    | undefined;

  if (!session) throw new SessionNotFoundError(sessionId);

  if (session.ended_at) {
    throw new ValidationError(
      `Telemetry session ${sessionId} already ended at ${session.ended_at}.`
    );
  }

  const now = new Date().toISOString();
  const startTime = new Date(session.started_at).getTime();
  const endTime = new Date(now).getTime();
  const totalDurationMs = endTime - startTime;

  // Log session end event
  const eventId = randomUUID();
  db.prepare(
    `INSERT INTO telemetry_events
     (id, session_id, ticket_id, event_type, event_data, created_at)
     VALUES (?, ?, ?, 'session_end', ?, ?)`
  ).run(
    eventId,
    sessionId,
    session.ticket_id,
    JSON.stringify({
      outcome,
      totalDurationMs,
      totalPrompts: session.total_prompts,
      totalToolCalls: session.total_tool_calls,
      totalTokens,
    }),
    now
  );

  db.prepare(
    `UPDATE telemetry_sessions
     SET ended_at = ?, total_duration_ms = ?, total_tokens = ?, outcome = ?
     WHERE id = ?`
  ).run(now, totalDurationMs, totalTokens || null, outcome || null, sessionId);

  return {
    sessionId,
    durationMs: totalDurationMs,
    totalPrompts: session.total_prompts,
    totalToolCalls: session.total_tool_calls,
    totalTokens: totalTokens ?? null,
    outcome: outcome ?? null,
  };
}

/**
 * Get telemetry data for a session, optionally including events.
 *
 * Supports lookup by session ID or by ticket ID (gets most recent session).
 *
 * @throws ValidationError if neither sessionId nor ticketId is provided
 * @throws SessionNotFoundError if no session is found
 */
export function getTelemetrySession(
  db: DbHandle,
  params: GetTelemetrySessionParams
): TelemetrySessionDetail {
  const { sessionId, ticketId, includeEvents = true, eventLimit = 100 } = params;

  if (!sessionId && !ticketId) {
    throw new ValidationError("Either sessionId or ticketId must be provided.");
  }

  let session: DbTelemetrySessionRow | undefined;
  if (sessionId) {
    session = db.prepare("SELECT * FROM telemetry_sessions WHERE id = ?").get(sessionId) as
      | DbTelemetrySessionRow
      | undefined;
  } else {
    session = db
      .prepare(
        `SELECT * FROM telemetry_sessions
         WHERE ticket_id = ?
         ORDER BY started_at DESC, rowid DESC
         LIMIT 1`
      )
      .get(ticketId) as DbTelemetrySessionRow | undefined;
  }

  if (!session) {
    throw new SessionNotFoundError(sessionId || ticketId!);
  }

  const events: TelemetryEventDetail[] = includeEvents
    ? (
        db
          .prepare(
            `SELECT * FROM telemetry_events
           WHERE session_id = ?
           ORDER BY created_at ASC
           LIMIT ?`
          )
          .all(session.id, eventLimit) as DbTelemetryEventRow[]
      ).map(parseEventData)
    : [];

  return {
    id: session.id,
    ticketId: session.ticket_id,
    ticketTitle: getTicketTitle(db, session.ticket_id),
    projectId: session.project_id,
    environment: session.environment,
    branchName: session.branch_name,
    startedAt: session.started_at,
    endedAt: session.ended_at,
    totalPrompts: session.total_prompts,
    totalToolCalls: session.total_tool_calls,
    totalDurationMs: session.total_duration_ms,
    totalTokens: session.total_tokens,
    outcome: session.outcome,
    events,
  };
}

/**
 * List telemetry sessions with optional filters.
 * Returns sessions sorted by start time (newest first).
 */
export function listTelemetrySessions(
  db: DbHandle,
  params: ListTelemetrySessionsParams = {}
): TelemetrySessionSummary[] {
  const { ticketId, projectId, since, limit = 20 } = params;

  let query = "SELECT * FROM telemetry_sessions WHERE 1=1";
  const queryParams: (string | number)[] = [];

  if (ticketId) {
    query += " AND ticket_id = ?";
    queryParams.push(ticketId);
  }
  if (projectId) {
    query += " AND project_id = ?";
    queryParams.push(projectId);
  }
  if (since) {
    query += " AND started_at >= ?";
    queryParams.push(since);
  }

  query += " ORDER BY started_at DESC LIMIT ?";
  queryParams.push(limit);

  const sessions = db.prepare(query).all(...queryParams) as DbTelemetrySessionRow[];

  return sessions.map((s) => ({
    id: s.id,
    ticketId: s.ticket_id,
    ticketTitle: getTicketTitle(db, s.ticket_id),
    environment: s.environment,
    startedAt: s.started_at,
    endedAt: s.ended_at,
    totalPrompts: s.total_prompts,
    totalToolCalls: s.total_tool_calls,
    durationMin: s.total_duration_ms ? Math.round(s.total_duration_ms / 60000) : null,
    outcome: s.outcome,
  }));
}
