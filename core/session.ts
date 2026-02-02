/**
 * Ralph session and event business logic for the core layer.
 *
 * Extracted from mcp-server/tools/sessions.ts and mcp-server/tools/events.ts.
 * All functions take a DbHandle and return typed results or throw CoreError subclasses.
 *
 * Session state machine: idle → analyzing → implementing → testing → committing → reviewing → done
 * (testing → implementing is also valid when tests fail)
 */

import { randomUUID } from "crypto";
import { writeFileSync, mkdirSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import type {
  DbHandle,
  RalphSession,
  RalphSessionState,
  StateHistoryEntry,
  RalphEvent,
  RalphEventType,
} from "./types.ts";
import {
  TicketNotFoundError,
  SessionNotFoundError,
  InvalidStateError,
  ValidationError,
} from "./errors.ts";
import type {
  DbRalphSessionRow,
  DbRalphSessionWithProjectRow,
  DbRalphEventRow,
  DbTicketRow,
} from "./db-rows.ts";

// ============================================
// Constants
// ============================================

export const VALID_STATES: readonly RalphSessionState[] = [
  "idle",
  "analyzing",
  "implementing",
  "testing",
  "committing",
  "reviewing",
  "done",
] as const;

export const VALID_OUTCOMES = ["success", "failure", "timeout", "cancelled"] as const;
export type SessionOutcome = (typeof VALID_OUTCOMES)[number];

export const VALID_EVENT_TYPES: readonly RalphEventType[] = [
  "thinking",
  "tool_start",
  "tool_end",
  "file_change",
  "progress",
  "state_change",
  "error",
] as const;

// ============================================
// Types
// ============================================

/** Data written to ralph-state.json for hook enforcement */
export interface RalphStateFileData {
  sessionId: string;
  ticketId: string;
  currentState: string;
  stateHistory: string[];
  startedAt: string;
}

export interface CreateSessionResult extends RalphSession {
  ticketTitle: string;
  stateFileWritten: boolean;
}

export interface UpdateStateResult {
  session: RalphSession;
  previousState: RalphSessionState;
  ticketTitle: string | null;
}

export interface CompleteSessionResult extends RalphSession {
  ticketTitle: string | null;
  durationMs: number;
}

export interface GetStateResult extends RalphSession {
  ticketTitle: string | null;
}

export interface SessionSummary {
  id: string;
  currentState: RalphSessionState;
  outcome: string | null;
  startedAt: string;
  completedAt: string | null;
  stateCount: number;
}

export interface ListSessionsResult {
  ticketId: string;
  ticketTitle: string | null;
  sessions: SessionSummary[];
}

export interface UpdateStateParams {
  sessionId: string;
  state: RalphSessionState;
  metadata?: Record<string, unknown>;
}

export interface EmitEventParams {
  sessionId: string;
  type: RalphEventType;
  data?: Record<string, unknown>;
}

// ============================================
// Internal Helpers
// ============================================

function getTicketRow(db: DbHandle, ticketId: string): DbTicketRow {
  const row = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as
    | DbTicketRow
    | undefined;
  if (!row) throw new TicketNotFoundError(ticketId);
  return row;
}

function parseStateHistory(stateHistoryJson: string | null | undefined): StateHistoryEntry[] {
  if (!stateHistoryJson) return [];
  try {
    return JSON.parse(stateHistoryJson) as StateHistoryEntry[];
  } catch {
    throw new ValidationError(`Corrupted state history JSON. The session data may be damaged.`);
  }
}

function toRalphSession(row: DbRalphSessionRow): RalphSession {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    currentState: row.current_state as RalphSessionState,
    stateHistory: parseStateHistory(row.state_history),
    outcome: row.outcome as RalphSession["outcome"],
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function toRalphEvent(row: DbRalphEventRow): RalphEvent {
  let data: Record<string, unknown> | null = null;
  if (row.data) {
    try {
      data = JSON.parse(row.data);
    } catch {
      throw new ValidationError(
        `Corrupted event data JSON for event ${row.id}. The event data may be damaged.`
      );
    }
  }
  return {
    id: row.id,
    sessionId: row.session_id,
    type: row.type as RalphEventType,
    data,
    createdAt: row.created_at,
  };
}

// ============================================
// Ralph State File Management
// ============================================

/**
 * Write or update the ralph-state.json file for hooks to read.
 * This enables hook-based state enforcement by providing a local file
 * that PreToolUse hooks can check to determine the current session state.
 *
 * @returns true if the file was written successfully, false if it failed
 */
export function writeRalphStateFile(projectPath: string, stateData: RalphStateFileData): boolean {
  try {
    const claudeDir = join(projectPath, ".claude");
    const stateFilePath = join(claudeDir, "ralph-state.json");

    mkdirSync(claudeDir, { recursive: true });

    const fileContent = {
      ...stateData,
      updatedAt: new Date().toISOString(),
    };

    writeFileSync(stateFilePath, JSON.stringify(fileContent, null, 2));
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove the ralph-state.json file when a session completes.
 * This prevents stale state from affecting future non-Ralph work.
 *
 * @returns true if the file was removed (or didn't exist), false on error
 */
export function removeRalphStateFile(projectPath: string): boolean {
  try {
    const stateFilePath = join(projectPath, ".claude", "ralph-state.json");
    if (existsSync(stateFilePath)) {
      unlinkSync(stateFilePath);
    }
    return true;
  } catch {
    return false;
  }
}

// ============================================
// Session Functions
// ============================================

/**
 * Create a new Ralph session for a ticket.
 *
 * Verifies the ticket exists, checks for existing active sessions,
 * creates the session in 'idle' state, writes the state file, and
 * emits a state_change event.
 *
 * @throws TicketNotFoundError if the ticket doesn't exist
 * @throws InvalidStateError if an active session already exists for this ticket
 */
export function createSession(db: DbHandle, ticketId: string): CreateSessionResult {
  // Verify ticket exists and get project path
  const ticket = db
    .prepare(
      `SELECT t.id, t.title, p.path as project_path, t.project_id
       FROM tickets t
       JOIN projects p ON t.project_id = p.id
       WHERE t.id = ?`
    )
    .get(ticketId) as
    | { id: string; title: string; project_path: string; project_id: string }
    | undefined;
  if (!ticket) throw new TicketNotFoundError(ticketId);

  // Check for existing active session
  const existingSession = db
    .prepare(
      "SELECT id, current_state FROM ralph_sessions WHERE ticket_id = ? AND completed_at IS NULL"
    )
    .get(ticketId) as { id: string; current_state: string } | undefined;

  if (existingSession) {
    throw new InvalidStateError(
      `ticket ${ticketId}`,
      "has active session",
      "no active session",
      `create session (existing: ${existingSession.id}, state: ${existingSession.current_state})`
    );
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const initialHistory: StateHistoryEntry[] = [{ state: "idle", timestamp: now }];

  db.prepare(
    `INSERT INTO ralph_sessions (id, ticket_id, project_id, current_state, state_history, started_at)
     VALUES (?, ?, ?, 'idle', ?, ?)`
  ).run(id, ticketId, ticket.project_id, JSON.stringify(initialHistory), now);

  // Write local state file for hooks
  const stateFileWritten = writeRalphStateFile(ticket.project_path, {
    sessionId: id,
    ticketId,
    currentState: "idle",
    stateHistory: ["idle"],
    startedAt: now,
  });

  // Emit state_change event for UI
  const eventId = randomUUID();
  db.prepare(
    "INSERT INTO ralph_events (id, session_id, type, data, created_at) VALUES (?, ?, 'state_change', ?, ?)"
  ).run(eventId, id, JSON.stringify({ state: "idle", message: "Session started" }), now);

  return {
    id,
    ticketId,
    currentState: "idle",
    stateHistory: initialHistory,
    outcome: null,
    errorMessage: null,
    startedAt: now,
    completedAt: null,
    ticketTitle: ticket.title,
    stateFileWritten,
  };
}

/**
 * Update the current state of a Ralph session.
 *
 * Transitions the session to a new state, updating both the database
 * and the local state file for hook enforcement.
 *
 * @throws SessionNotFoundError if the session doesn't exist
 * @throws InvalidStateError if the session is already completed
 */
export function updateState(db: DbHandle, params: UpdateStateParams): UpdateStateResult {
  const { sessionId, state, metadata } = params;

  const session = db
    .prepare(
      `SELECT rs.*, t.title as ticket_title, p.path as project_path
       FROM ralph_sessions rs
       JOIN tickets t ON rs.ticket_id = t.id
       JOIN projects p ON t.project_id = p.id
       WHERE rs.id = ?`
    )
    .get(sessionId) as DbRalphSessionWithProjectRow | undefined;

  if (!session) throw new SessionNotFoundError(sessionId);

  if (session.completed_at) {
    throw new InvalidStateError(
      `session ${sessionId}`,
      `completed (${session.outcome})`,
      "active",
      "update state"
    );
  }

  const previousState = session.current_state as RalphSessionState;
  const now = new Date().toISOString();

  const stateHistory = parseStateHistory(session.state_history);
  const entry: StateHistoryEntry = { state, timestamp: now };
  if (metadata) entry.metadata = metadata;
  stateHistory.push(entry);

  const stateNames = stateHistory.map((h) => h.state);

  db.prepare("UPDATE ralph_sessions SET current_state = ?, state_history = ? WHERE id = ?").run(
    state,
    JSON.stringify(stateHistory),
    sessionId
  );

  // Update local state file
  if (session.project_path) {
    writeRalphStateFile(session.project_path, {
      sessionId,
      ticketId: session.ticket_id,
      currentState: state,
      stateHistory: stateNames,
      startedAt: session.started_at,
    });
  }

  // Emit state_change event
  const eventId = randomUUID();
  const eventData: Record<string, unknown> = {
    state,
    previousState,
    message: metadata?.["message"] || `Transitioned to ${state}`,
  };
  if (metadata?.["file"]) eventData.file = metadata["file"];
  if (metadata?.["testResult"]) eventData.testResult = metadata["testResult"];
  db.prepare(
    "INSERT INTO ralph_events (id, session_id, type, data, created_at) VALUES (?, ?, 'state_change', ?, ?)"
  ).run(eventId, sessionId, JSON.stringify(eventData), now);

  return {
    session: {
      id: session.id,
      ticketId: session.ticket_id,
      currentState: state,
      stateHistory,
      outcome: session.outcome as RalphSession["outcome"],
      errorMessage: session.error_message,
      startedAt: session.started_at,
      completedAt: session.completed_at,
    },
    previousState,
    ticketTitle: session.ticket_title,
  };
}

/**
 * Complete a Ralph session with an outcome.
 *
 * Marks the session as done, adds 'done' to state history, removes the
 * state file, and emits a completion event.
 *
 * @throws SessionNotFoundError if the session doesn't exist
 * @throws InvalidStateError if the session is already completed
 */
export function completeSession(
  db: DbHandle,
  sessionId: string,
  outcome: SessionOutcome,
  errorMessage?: string
): CompleteSessionResult {
  const session = db
    .prepare(
      `SELECT rs.*, t.title as ticket_title, p.path as project_path
       FROM ralph_sessions rs
       JOIN tickets t ON rs.ticket_id = t.id
       JOIN projects p ON t.project_id = p.id
       WHERE rs.id = ?`
    )
    .get(sessionId) as DbRalphSessionWithProjectRow | undefined;

  if (!session) throw new SessionNotFoundError(sessionId);

  if (session.completed_at) {
    throw new InvalidStateError(
      `session ${sessionId}`,
      `completed (${session.outcome})`,
      "active",
      "complete session"
    );
  }

  const now = new Date().toISOString();

  const stateHistory = parseStateHistory(session.state_history);
  stateHistory.push({
    state: "done",
    timestamp: now,
    metadata: { outcome, errorMessage },
  });

  db.prepare(
    `UPDATE ralph_sessions
     SET current_state = 'done', state_history = ?, outcome = ?, error_message = ?, completed_at = ?
     WHERE id = ?`
  ).run(JSON.stringify(stateHistory), outcome, errorMessage || null, now, sessionId);

  // Remove local state file
  if (session.project_path) {
    removeRalphStateFile(session.project_path);
  }

  // Emit completion event
  const eventId = randomUUID();
  const eventData: Record<string, unknown> = {
    state: "done",
    outcome,
    message: outcome === "success" ? "Session completed successfully" : `Session ended: ${outcome}`,
    ...(errorMessage && { error: errorMessage }),
  };
  db.prepare(
    "INSERT INTO ralph_events (id, session_id, type, data, created_at) VALUES (?, ?, 'state_change', ?, ?)"
  ).run(eventId, sessionId, JSON.stringify(eventData), now);

  const startedAt = new Date(session.started_at).getTime();
  const completedAt = new Date(now).getTime();

  return {
    id: session.id,
    ticketId: session.ticket_id,
    currentState: "done",
    stateHistory,
    outcome,
    errorMessage: errorMessage || null,
    startedAt: session.started_at,
    completedAt: now,
    ticketTitle: session.ticket_title,
    durationMs: completedAt - startedAt,
  };
}

/**
 * Get the current state of a Ralph session.
 *
 * Supports lookup by session ID or by ticket ID (gets most recent session).
 *
 * @throws ValidationError if neither sessionId nor ticketId is provided
 * @throws SessionNotFoundError if no session is found
 */
export function getState(
  db: DbHandle,
  options: { sessionId?: string; ticketId?: string }
): GetStateResult {
  const { sessionId, ticketId } = options;

  if (!sessionId && !ticketId) {
    throw new ValidationError("Either sessionId or ticketId must be provided.");
  }

  let row: DbRalphSessionRow | undefined;
  if (sessionId) {
    row = db.prepare("SELECT * FROM ralph_sessions WHERE id = ?").get(sessionId) as
      | DbRalphSessionRow
      | undefined;
  } else {
    row = db
      .prepare(
        "SELECT * FROM ralph_sessions WHERE ticket_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1"
      )
      .get(ticketId) as DbRalphSessionRow | undefined;
  }

  if (!row) {
    throw new SessionNotFoundError(sessionId || ticketId!);
  }

  const session = toRalphSession(row);

  // Get ticket title
  const ticket = db.prepare("SELECT title FROM tickets WHERE id = ?").get(row.ticket_id) as
    | { title: string }
    | undefined;

  return {
    ...session,
    ticketTitle: ticket?.title ?? null,
  };
}

/**
 * List all Ralph sessions for a ticket, sorted by start time (newest first).
 *
 * @throws TicketNotFoundError if the ticket doesn't exist
 */
export function listSessions(
  db: DbHandle,
  ticketId: string,
  limit: number = 10
): ListSessionsResult {
  getTicketRow(db, ticketId);

  const rows = db
    .prepare(
      `SELECT * FROM ralph_sessions
       WHERE ticket_id = ?
       ORDER BY started_at DESC
       LIMIT ?`
    )
    .all(ticketId, limit) as DbRalphSessionRow[];

  const ticket = db.prepare("SELECT title FROM tickets WHERE id = ?").get(ticketId) as
    | { title: string }
    | undefined;

  const sessions: SessionSummary[] = rows.map((s) => ({
    id: s.id,
    currentState: s.current_state as RalphSessionState,
    outcome: s.outcome,
    startedAt: s.started_at,
    completedAt: s.completed_at,
    stateCount: parseStateHistory(s.state_history).length,
  }));

  return {
    ticketId,
    ticketTitle: ticket?.title ?? null,
    sessions,
  };
}

// ============================================
// Event Functions
// ============================================

/**
 * Emit an event for real-time UI streaming during a Ralph session.
 *
 * Events are stored in the database for retrieval by the UI.
 */
export function emitEvent(db: DbHandle, params: EmitEventParams): RalphEvent {
  const { sessionId, type, data } = params;
  const id = randomUUID();
  const now = new Date().toISOString();
  const jsonData = data ? JSON.stringify(data) : null;

  db.prepare(
    "INSERT INTO ralph_events (id, session_id, type, data, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, sessionId, type, jsonData, now);

  return {
    id,
    sessionId,
    type,
    data: data || null,
    createdAt: now,
  };
}

/**
 * Get events for a Ralph session, optionally filtering by timestamp.
 * Events are returned in ascending chronological order.
 */
export function getEvents(
  db: DbHandle,
  sessionId: string,
  options: { since?: string; limit?: number } = {}
): RalphEvent[] {
  const { since, limit = 50 } = options;

  const rows = since
    ? (db
        .prepare(
          "SELECT * FROM ralph_events WHERE session_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT ?"
        )
        .all(sessionId, since, limit) as DbRalphEventRow[])
    : (db
        .prepare("SELECT * FROM ralph_events WHERE session_id = ? ORDER BY created_at ASC LIMIT ?")
        .all(sessionId, limit) as DbRalphEventRow[]);

  return rows.map(toRalphEvent);
}

/**
 * Clear all events for a Ralph session.
 *
 * @returns The number of events deleted
 */
export function clearEvents(db: DbHandle, sessionId: string): number {
  const result = db.prepare("DELETE FROM ralph_events WHERE session_id = ?").run(sessionId) as {
    changes: number;
  };

  return result.changes;
}
