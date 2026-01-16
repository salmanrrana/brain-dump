/**
 * Session state management tools for Brain Dump MCP server.
 * Provides state machine observability for Ralph sessions.
 * Includes local state file writing for hook-based state enforcement.
 * @module tools/sessions
 */
import { z } from "zod";
import { randomUUID } from "crypto";
import { writeFileSync, mkdirSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { log } from "../lib/logging.js";

/**
 * Write or update the ralph-state.json file for hooks to read.
 * This enables hook-based state enforcement by providing a local file
 * that PreToolUse hooks can check to determine the current session state.
 *
 * @param {string} projectPath - The project directory path
 * @param {object} stateData - The state data to write
 * @param {string} stateData.sessionId - The session ID
 * @param {string} stateData.ticketId - The ticket ID
 * @param {string} stateData.currentState - Current state (idle, analyzing, etc.)
 * @param {string[]} stateData.stateHistory - Array of previous states
 * @param {string} stateData.startedAt - ISO timestamp when session started
 * @returns {boolean} - Whether the write was successful
 */
function writeRalphStateFile(projectPath, stateData) {
  try {
    const claudeDir = join(projectPath, ".claude");
    const stateFilePath = join(claudeDir, "ralph-state.json");

    // Ensure .claude directory exists
    mkdirSync(claudeDir, { recursive: true });

    const fileContent = {
      ...stateData,
      updatedAt: new Date().toISOString(),
    };

    writeFileSync(stateFilePath, JSON.stringify(fileContent, null, 2));
    log.info(`Wrote ralph-state.json for hooks: state=${stateData.currentState}`);
    return true;
  } catch (err) {
    log.warn(`Failed to write ralph-state.json: ${err.message}`);
    return false;
  }
}

/**
 * Remove the ralph-state.json file when a session completes.
 * This prevents stale state from affecting future non-Ralph work.
 *
 * @param {string} projectPath - The project directory path
 * @returns {boolean} - Whether the removal was successful
 */
function removeRalphStateFile(projectPath) {
  try {
    const stateFilePath = join(projectPath, ".claude", "ralph-state.json");
    if (existsSync(stateFilePath)) {
      unlinkSync(stateFilePath);
      log.info("Removed ralph-state.json after session completion");
    }
    return true;
  } catch (err) {
    log.warn(`Failed to remove ralph-state.json: ${err.message}`);
    return false;
  }
}

/**
 * Safely parse state history JSON, returning empty array on failure.
 * @param {string | null | undefined} stateHistoryJson - The raw JSON string
 * @returns {Array<{state: string, timestamp: string, metadata?: object}>}
 */
function parseStateHistory(stateHistoryJson) {
  if (!stateHistoryJson) return [];
  try {
    return JSON.parse(stateHistoryJson);
  } catch {
    return [];
  }
}

// Valid session states that Ralph can transition through
const VALID_STATES = [
  "idle",         // Session created but work not started
  "analyzing",    // Reading specs, understanding requirements
  "implementing", // Writing/editing code
  "testing",      // Running tests, verifying behavior
  "committing",   // Creating git commits
  "reviewing",    // Self-review before completing
  "done",         // Session completed
];

// Valid session outcomes
const VALID_OUTCOMES = ["success", "failure", "timeout", "cancelled"];

/**
 * Register session state management tools with the MCP server.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {import("better-sqlite3").Database} db
 */
export function registerSessionTools(server, db) {
  // Create a new Ralph session
  server.tool(
    "create_ralph_session",
    `Create a new Ralph session for a ticket.

A session tracks your work state as you implement a ticket. Create a session
when you start working on a ticket to enable state tracking and progress visibility.

The session starts in 'idle' state. Use update_session_state to transition
through states as you work.

Args:
  ticketId: The ticket ID you're working on

Returns:
  The created session with its ID and initial state.`,
    {
      ticketId: z.string().describe("The ticket ID to create a session for"),
    },
    async ({ ticketId }) => {
      // Verify ticket exists and get project path for state file
      const ticket = db.prepare(
        `SELECT t.id, t.title, p.path as project_path
         FROM tickets t
         JOIN projects p ON t.project_id = p.id
         WHERE t.id = ?`
      ).get(ticketId);
      if (!ticket) {
        return {
          content: [{
            type: "text",
            text: `Ticket not found: ${ticketId}. Use list_tickets to see available tickets.`,
          }],
          isError: true,
        };
      }

      // Check if there's already an active session for this ticket
      const existingSession = db.prepare(
        "SELECT id, current_state FROM ralph_sessions WHERE ticket_id = ? AND completed_at IS NULL"
      ).get(ticketId);

      if (existingSession) {
        return {
          content: [{
            type: "text",
            text: `Session already exists for ticket ${ticketId}.\n\nSession ID: ${existingSession.id}\nCurrent State: ${existingSession.current_state}\n\nUse update_session_state to change the state, or complete_ralph_session to finish it.`,
          }],
        };
      }

      const id = randomUUID();
      const now = new Date().toISOString();
      const initialHistory = JSON.stringify([{ state: "idle", timestamp: now }]);

      try {
        db.prepare(
          `INSERT INTO ralph_sessions (id, ticket_id, current_state, state_history, started_at)
           VALUES (?, ?, 'idle', ?, ?)`
        ).run(id, ticketId, initialHistory, now);

        // Write local state file for hooks to read
        writeRalphStateFile(ticket.project_path, {
          sessionId: id,
          ticketId,
          currentState: "idle",
          stateHistory: ["idle"],
          startedAt: now,
        });

        // Emit state_change event for UI
        try {
          const eventId = randomUUID();
          db.prepare(
            "INSERT INTO ralph_events (id, session_id, type, data, created_at) VALUES (?, ?, 'state_change', ?, ?)"
          ).run(eventId, id, JSON.stringify({ state: "idle", message: "Session started" }), now);
        } catch (eventErr) {
          log.warn(`Failed to emit session start event: ${eventErr.message}`);
        }

        log.info(`Created Ralph session ${id} for ticket ${ticketId}`);

        return {
          content: [{
            type: "text",
            text: `## Ralph Session Created

**Session ID:** ${id}
**Ticket:** ${ticket.title}
**State:** idle
**Started:** ${now}

Use \`update_session_state\` to report your progress:
- \`analyzing\` - When reading specs and understanding requirements
- \`implementing\` - When writing or editing code
- \`testing\` - When running tests
- \`committing\` - When creating git commits
- \`reviewing\` - When doing final self-review`,
          }],
        };
      } catch (err) {
        log.error(`Failed to create session: ${err.message}`, { ticketId });
        return {
          content: [{
            type: "text",
            text: `Failed to create session: ${err.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  // Update session state
  server.tool(
    "update_session_state",
    `Update the current state of a Ralph session for UI progress tracking.

Call this tool as you transition through work phases. The UI displays your
current state to help users understand your progress.

Valid states (in typical order):
1. idle → analyzing (when reading the spec)
2. analyzing → implementing (when starting to code)
3. implementing → testing (when running tests)
4. testing → implementing (if tests fail, go back to fix)
5. implementing/testing → committing (when ready to commit)
6. committing → reviewing (final self-review)
7. reviewing → done (session complete)

Args:
  sessionId: The Ralph session ID (from create_ralph_session)
  state: The new state to transition to
  metadata: Optional context about the state transition

Returns:
  Updated session with state history.`,
    {
      sessionId: z.string().describe("The Ralph session ID"),
      state: z.enum(VALID_STATES).describe("The new state to transition to"),
      metadata: z.object({
        message: z.string().optional().describe("Description of what you're doing"),
        file: z.string().optional().describe("Current file being worked on"),
        testResult: z.string().optional().describe("Test result summary"),
      }).passthrough().optional().describe("Optional context about the state transition"),
    },
    async ({ sessionId, state, metadata }) => {
      // Get current session with project path for state file
      const session = db.prepare(
        `SELECT rs.*, t.title as ticket_title, p.path as project_path
         FROM ralph_sessions rs
         JOIN tickets t ON rs.ticket_id = t.id
         JOIN projects p ON t.project_id = p.id
         WHERE rs.id = ?`
      ).get(sessionId);

      if (!session) {
        return {
          content: [{
            type: "text",
            text: `Session not found: ${sessionId}. Use create_ralph_session to create one first.`,
          }],
          isError: true,
        };
      }

      if (session.completed_at) {
        return {
          content: [{
            type: "text",
            text: `Session ${sessionId} is already completed with outcome: ${session.outcome}. Cannot update state.`,
          }],
          isError: true,
        };
      }

      const previousState = session.current_state;
      const now = new Date().toISOString();

      // Parse and update state history
      const stateHistory = parseStateHistory(session.state_history);

      stateHistory.push({
        state,
        timestamp: now,
        metadata: metadata || undefined,
      });

      // Extract just the state names for the simple history array
      const stateNames = stateHistory.map(h => h.state);

      try {
        db.prepare(
          "UPDATE ralph_sessions SET current_state = ?, state_history = ? WHERE id = ?"
        ).run(state, JSON.stringify(stateHistory), sessionId);

        // Update local state file for hooks
        writeRalphStateFile(session.project_path, {
          sessionId,
          ticketId: session.ticket_id,
          currentState: state,
          stateHistory: stateNames,
          startedAt: session.started_at,
        });

        // Emit state_change event for UI
        try {
          const eventId = randomUUID();
          const eventData = {
            state,
            previousState,
            message: metadata?.message || `Transitioned to ${state}`,
            ...(metadata?.file && { file: metadata.file }),
            ...(metadata?.testResult && { testResult: metadata.testResult }),
          };
          db.prepare(
            "INSERT INTO ralph_events (id, session_id, type, data, created_at) VALUES (?, ?, 'state_change', ?, ?)"
          ).run(eventId, sessionId, JSON.stringify(eventData), now);
        } catch (eventErr) {
          log.warn(`Failed to emit state change event: ${eventErr.message}`);
        }

        log.info(`Session ${sessionId}: ${previousState} → ${state}`);

        return {
          content: [{
            type: "text",
            text: `## State Updated

**Session:** ${sessionId.substring(0, 8)}...
**Ticket:** ${session.ticket_title || session.ticket_id}
**Transition:** ${previousState} → **${state}**
${metadata?.message ? `**Context:** ${metadata.message}` : ""}

State history: ${stateNames.join(" → ")}`,
          }],
        };
      } catch (err) {
        log.error(`Failed to update session state: ${err.message}`, { sessionId, state });
        return {
          content: [{
            type: "text",
            text: `Failed to update session state: ${err.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  // Complete a Ralph session
  server.tool(
    "complete_ralph_session",
    `Complete a Ralph session with an outcome.

Call this when you've finished working on a ticket (either successfully or not).
This marks the session as complete and records the final outcome.

Args:
  sessionId: The Ralph session ID
  outcome: The session outcome (success, failure, timeout, cancelled)
  errorMessage: Optional error details if outcome is 'failure'

Returns:
  Final session state with outcome.`,
    {
      sessionId: z.string().describe("The Ralph session ID"),
      outcome: z.enum(VALID_OUTCOMES).describe("The session outcome"),
      errorMessage: z.string().optional().describe("Error details if outcome is 'failure'"),
    },
    async ({ sessionId, outcome, errorMessage }) => {
      // Get session with project path for cleanup
      const session = db.prepare(
        `SELECT rs.*, t.title as ticket_title, p.path as project_path
         FROM ralph_sessions rs
         JOIN tickets t ON rs.ticket_id = t.id
         JOIN projects p ON t.project_id = p.id
         WHERE rs.id = ?`
      ).get(sessionId);

      if (!session) {
        return {
          content: [{
            type: "text",
            text: `Session not found: ${sessionId}`,
          }],
          isError: true,
        };
      }

      if (session.completed_at) {
        return {
          content: [{
            type: "text",
            text: `Session ${sessionId} is already completed with outcome: ${session.outcome}`,
          }],
          isError: true,
        };
      }

      const now = new Date().toISOString();

      // Add 'done' to state history
      const stateHistory = parseStateHistory(session.state_history);

      stateHistory.push({
        state: "done",
        timestamp: now,
        metadata: { outcome, errorMessage },
      });

      try {
        db.prepare(
          `UPDATE ralph_sessions
           SET current_state = 'done', state_history = ?, outcome = ?, error_message = ?, completed_at = ?
           WHERE id = ?`
        ).run(JSON.stringify(stateHistory), outcome, errorMessage || null, now, sessionId);

        // Remove local state file - session is complete, no longer need hooks enforcement
        removeRalphStateFile(session.project_path);

        // Emit completion event
        try {
          const eventId = randomUUID();
          const eventData = {
            state: "done",
            outcome,
            message: outcome === "success" ? "Session completed successfully" : `Session ended: ${outcome}`,
            ...(errorMessage && { error: errorMessage }),
          };
          db.prepare(
            "INSERT INTO ralph_events (id, session_id, type, data, created_at) VALUES (?, ?, 'state_change', ?, ?)"
          ).run(eventId, sessionId, JSON.stringify(eventData), now);
        } catch (eventErr) {
          log.warn(`Failed to emit completion event: ${eventErr.message}`);
        }

        log.info(`Session ${sessionId} completed with outcome: ${outcome}`);

        // Calculate duration
        const startedAt = new Date(session.started_at);
        const completedAt = new Date(now);
        const durationMs = completedAt.getTime() - startedAt.getTime();
        const durationMin = Math.round(durationMs / 60000);

        return {
          content: [{
            type: "text",
            text: `## Session Completed

**Session:** ${sessionId.substring(0, 8)}...
**Ticket:** ${session.ticket_title || session.ticket_id}
**Outcome:** ${outcome}
**Duration:** ${durationMin} minutes
${errorMessage ? `**Error:** ${errorMessage}` : ""}

State history: ${stateHistory.map(h => h.state).join(" → ")}`,
          }],
        };
      } catch (err) {
        log.error(`Failed to complete session: ${err.message}`, { sessionId, outcome });
        return {
          content: [{
            type: "text",
            text: `Failed to complete session: ${err.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  // Get session state (for querying current progress)
  server.tool(
    "get_session_state",
    `Get the current state of a Ralph session.

Use this to check your current progress state or debug state issues.

Args:
  sessionId: The Ralph session ID (optional if ticketId provided)
  ticketId: Get the active session for a ticket (optional if sessionId provided)

Returns:
  Current session state with history.`,
    {
      sessionId: z.string().optional().describe("The Ralph session ID"),
      ticketId: z.string().optional().describe("Get active session for a ticket"),
    },
    async ({ sessionId, ticketId }) => {
      if (!sessionId && !ticketId) {
        return {
          content: [{
            type: "text",
            text: "Either sessionId or ticketId must be provided.",
          }],
          isError: true,
        };
      }

      let session;
      if (sessionId) {
        session = db.prepare("SELECT * FROM ralph_sessions WHERE id = ?").get(sessionId);
      } else {
        // Get most recent session for ticket
        session = db.prepare(
          "SELECT * FROM ralph_sessions WHERE ticket_id = ? ORDER BY started_at DESC LIMIT 1"
        ).get(ticketId);
      }

      if (!session) {
        const identifier = sessionId || ticketId;
        return {
          content: [{
            type: "text",
            text: `No session found for: ${identifier}`,
          }],
          isError: true,
        };
      }

      const stateHistory = parseStateHistory(session.state_history);
      const ticket = db.prepare("SELECT title FROM tickets WHERE id = ?").get(session.ticket_id);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            sessionId: session.id,
            ticketId: session.ticket_id,
            ticketTitle: ticket?.title,
            currentState: session.current_state,
            outcome: session.outcome,
            errorMessage: session.error_message,
            startedAt: session.started_at,
            completedAt: session.completed_at,
            stateHistory,
          }, null, 2),
        }],
      };
    }
  );

  // List sessions for a ticket
  server.tool(
    "list_ticket_sessions",
    `List all Ralph sessions for a ticket.

Shows the history of work sessions on a ticket, useful for understanding
past attempts and their outcomes.

Args:
  ticketId: The ticket ID to list sessions for
  limit: Maximum sessions to return (default: 10)

Returns:
  Array of sessions with states and outcomes.`,
    {
      ticketId: z.string().describe("The ticket ID"),
      limit: z.number().optional().default(10).describe("Maximum sessions to return"),
    },
    async ({ ticketId, limit = 10 }) => {
      const sessions = db.prepare(
        `SELECT * FROM ralph_sessions
         WHERE ticket_id = ?
         ORDER BY started_at DESC
         LIMIT ?`
      ).all(ticketId, limit);

      if (sessions.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No sessions found for ticket: ${ticketId}`,
          }],
        };
      }

      const ticket = db.prepare("SELECT title FROM tickets WHERE id = ?").get(ticketId);

      const sessionSummaries = sessions.map(s => ({
        id: s.id,
        currentState: s.current_state,
        outcome: s.outcome,
        startedAt: s.started_at,
        completedAt: s.completed_at,
        stateCount: parseStateHistory(s.state_history).length,
      }));

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            ticketId,
            ticketTitle: ticket?.title,
            sessionCount: sessions.length,
            sessions: sessionSummaries,
          }, null, 2),
        }],
      };
    }
  );
}
