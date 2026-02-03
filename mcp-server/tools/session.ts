/**
 * Consolidated session resource tool for Brain Dump MCP server.
 *
 * Merges 5 session + 3 event tools into 1 action-dispatched tool.
 * Business logic lives in core/session.ts.
 *
 * @module tools/session
 */
import { z } from "zod";
import { log } from "../lib/logging.js";
import { mcpError } from "../lib/mcp-response.ts";
import { requireParam, formatResult, formatEmpty } from "../lib/mcp-format.ts";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "better-sqlite3";
import { CoreError } from "../../core/errors.ts";
import {
  createSession,
  updateState,
  completeSession,
  getState,
  listSessions,
  emitEvent,
  getEvents,
  clearEvents,
  VALID_STATES,
  VALID_OUTCOMES,
  VALID_EVENT_TYPES,
} from "../../core/session.ts";
import {
  saveTasks,
  getTasks,
  clearTasks,
  getTaskSnapshots,
  TASK_STATUSES,
} from "../../core/tasks.ts";
import type { TaskInput } from "../../core/tasks.ts";
import type { RalphSessionState, RalphEventType } from "../../core/types.ts";
import type { SessionOutcome } from "../../core/session.ts";

const ACTIONS = [
  "create",
  "update-state",
  "complete",
  "get",
  "list",
  "emit-event",
  "get-events",
  "clear-events",
  "save-tasks",
  "get-tasks",
  "clear-tasks",
  "get-task-snapshots",
] as const;

const STATES = VALID_STATES as unknown as readonly [string, ...string[]];
const OUTCOMES = VALID_OUTCOMES as unknown as readonly [string, ...string[]];
const EVENT_TYPES = VALID_EVENT_TYPES as unknown as readonly [string, ...string[]];

/**
 * Register the consolidated session tool with the MCP server.
 */
export function registerSessionTool(server: McpServer, db: Database.Database): void {
  server.tool(
    "session",
    `Manage Ralph sessions and events in Brain Dump. Sessions track AI work state for progress visibility.

## Actions

### create
Create a new Ralph session for a ticket. Starts in 'idle' state.
Required params: ticketId

### update-state
Update the current state of a Ralph session for UI progress tracking.
Valid states: idle, analyzing, implementing, testing, committing, reviewing, done
Required params: sessionId, state
Optional params: metadata

### complete
Complete a Ralph session with an outcome.
Required params: sessionId, outcome
Optional params: errorMessage

### get
Get the current state of a Ralph session.
Optional params: sessionId, ticketId (provide one)

### list
List all Ralph sessions for a ticket.
Required params: ticketId
Optional params: limit

### emit-event
Emit an event for real-time UI streaming.
Required params: sessionId, eventType
Optional params: eventData

### get-events
Get events for a Ralph session.
Required params: sessionId
Optional params: since, limit

### clear-events
Clear all events for a Ralph session.
Required params: sessionId

### save-tasks
Save Claude's task list for a ticket. Replaces entire task list, preserves status history.
Optional params: ticketId (auto-detected from Ralph state), tasks (required), createSnapshot

### get-tasks
Retrieve Claude's tasks for a ticket.
Optional params: ticketId (auto-detected), includeHistory

### clear-tasks
Clear all Claude tasks for a ticket. Creates snapshot before clearing.
Optional params: ticketId (auto-detected)

### get-task-snapshots
Get historical snapshots of Claude's task list.
Required params: ticketId
Optional params: limit

## Parameters
- action: (required) The operation to perform
- ticketId: Ticket ID. Required for: create, list, get-task-snapshots. Optional for: get, save-tasks, get-tasks, clear-tasks
- sessionId: Ralph session ID. Required for: update-state, complete, emit-event, get-events, clear-events. Optional for: get
- state: Session state. Required for: update-state
- metadata: State transition context (JSON object). Optional for: update-state
- outcome: Session outcome (success, failure, timeout, cancelled). Required for: complete
- errorMessage: Error details. Optional for: complete
- eventType: Event type. Required for: emit-event
- eventData: Event data (JSON object). Optional for: emit-event
- since: ISO timestamp to get events after. Optional for: get-events
- limit: Max results. Optional for: list, get-events, get-task-snapshots
- tasks: Array of task objects with subject, status, activeForm?, description?. Required for: save-tasks
- createSnapshot: Create an audit snapshot. Optional for: save-tasks
- includeHistory: Include status change history. Optional for: get-tasks`,
    {
      action: z.enum(ACTIONS).describe("The operation to perform"),
      ticketId: z.string().optional().describe("Ticket ID"),
      sessionId: z.string().optional().describe("Ralph session ID"),
      state: z.enum(STATES).optional().describe("Session state"),
      metadata: z.record(z.unknown()).optional().describe("State transition context"),
      outcome: z.enum(OUTCOMES).optional().describe("Session outcome"),
      errorMessage: z.string().optional().describe("Error details"),
      eventType: z.enum(EVENT_TYPES).optional().describe("Event type"),
      eventData: z.record(z.unknown()).optional().describe("Event data"),
      since: z.string().optional().describe("ISO timestamp for event filtering"),
      limit: z.number().optional().describe("Max results"),
      tasks: z
        .array(
          z.object({
            id: z.string().optional(),
            subject: z.string(),
            status: z.enum(TASK_STATUSES as unknown as readonly [string, ...string[]]),
            activeForm: z.string().optional(),
            description: z.string().optional(),
          })
        )
        .optional()
        .describe("Array of task objects"),
      createSnapshot: z.boolean().optional().describe("Create audit snapshot"),
      includeHistory: z.boolean().optional().describe("Include status change history"),
    },
    async (params: {
      action: (typeof ACTIONS)[number];
      ticketId?: string | undefined;
      sessionId?: string | undefined;
      state?: string | undefined;
      metadata?: Record<string, unknown> | undefined;
      outcome?: string | undefined;
      errorMessage?: string | undefined;
      eventType?: string | undefined;
      eventData?: Record<string, unknown> | undefined;
      since?: string | undefined;
      limit?: number | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod optional shapes differ from TaskInput under exactOptionalPropertyTypes
      tasks?: any[] | undefined;
      createSnapshot?: boolean | undefined;
      includeHistory?: boolean | undefined;
    }) => {
      try {
        switch (params.action) {
          case "create": {
            const ticketId = requireParam(params.ticketId, "ticketId", "create");
            const result = createSession(db, ticketId);
            log.info(`Created session ${result.id} for ticket ${ticketId}`);
            return formatResult(result, "Ralph session created!");
          }

          case "update-state": {
            const sessionId = requireParam(params.sessionId, "sessionId", "update-state");
            const state = requireParam(params.state, "state", "update-state");

            const result = updateState(db, {
              sessionId,
              state: state as RalphSessionState,
              ...(params.metadata !== undefined ? { metadata: params.metadata } : {}),
            });

            log.info(`Session ${sessionId} state: ${result.previousState} -> ${state}`);
            return formatResult(
              result.session,
              `State updated: ${result.previousState} -> ${state}`
            );
          }

          case "complete": {
            const sessionId = requireParam(params.sessionId, "sessionId", "complete");
            const outcome = requireParam(params.outcome, "outcome", "complete");

            const result = completeSession(
              db,
              sessionId,
              outcome as SessionOutcome,
              params.errorMessage
            );

            log.info(`Completed session ${sessionId}: ${outcome}`);
            return formatResult(result, `Session completed: ${outcome}`);
          }

          case "get": {
            const result = getState(db, {
              ...(params.sessionId !== undefined ? { sessionId: params.sessionId } : {}),
              ...(params.ticketId !== undefined ? { ticketId: params.ticketId } : {}),
            });
            return formatResult(result);
          }

          case "list": {
            const ticketId = requireParam(params.ticketId, "ticketId", "list");
            const result = listSessions(db, ticketId, params.limit);

            if (result.sessions.length === 0) {
              return formatEmpty("sessions for this ticket");
            }
            return formatResult(result);
          }

          case "emit-event": {
            const sessionId = requireParam(params.sessionId, "sessionId", "emit-event");
            const eventType = requireParam(params.eventType, "eventType", "emit-event");

            const event = emitEvent(db, {
              sessionId,
              type: eventType as RalphEventType,
              ...(params.eventData !== undefined ? { data: params.eventData } : {}),
            });
            return formatResult(event);
          }

          case "get-events": {
            const sessionId = requireParam(params.sessionId, "sessionId", "get-events");
            const events = getEvents(db, sessionId, {
              ...(params.since !== undefined ? { since: params.since } : {}),
              ...(params.limit !== undefined ? { limit: params.limit } : {}),
            });

            if (events.length === 0) {
              return formatEmpty("events for this session");
            }
            return formatResult(events);
          }

          case "clear-events": {
            const sessionId = requireParam(params.sessionId, "sessionId", "clear-events");
            const count = clearEvents(db, sessionId);
            return formatResult(`Cleared ${count} event(s) for session ${sessionId}.`);
          }

          case "save-tasks": {
            if (!params.tasks || params.tasks.length === 0) {
              return mcpError(
                new Error("tasks parameter is required for save-tasks. Provide at least one task.")
              );
            }

            const result = saveTasks(
              db,
              params.tasks as TaskInput[],
              params.ticketId,
              params.createSnapshot
            );
            log.info(`Saved ${result.tasks.length} task(s) for ticket ${result.ticketId}`);
            return formatResult(
              result,
              `Saved ${result.tasks.length} task(s) for "${result.ticketTitle}".${result.snapshotCreated ? " Snapshot created." : ""}`
            );
          }

          case "get-tasks": {
            const result = getTasks(db, params.ticketId, params.includeHistory);

            if (result.tasks.length === 0) {
              return formatEmpty("Claude tasks for this ticket");
            }
            return formatResult(
              result,
              `Found ${result.tasks.length} task(s) for "${result.ticketTitle}"`
            );
          }

          case "clear-tasks": {
            const result = clearTasks(db, params.ticketId);
            log.info(`Cleared ${result.cleared} task(s) for ticket ${result.ticketId}`);
            return formatResult(
              result,
              `Cleared ${result.cleared} task(s) for "${result.ticketTitle}". Snapshot: ${result.snapshotId}`
            );
          }

          case "get-task-snapshots": {
            const ticketId = requireParam(params.ticketId, "ticketId", "get-task-snapshots");
            const result = getTaskSnapshots(db, ticketId, params.limit);

            if (result.snapshots.length === 0) {
              return formatEmpty("task snapshots for this ticket");
            }
            return formatResult(
              result,
              `Found ${result.snapshots.length} snapshot(s) for "${result.ticketTitle}"`
            );
          }
        }
      } catch (err) {
        if (err instanceof CoreError) {
          log.error(`session/${params.action} failed: ${err.message}`);
        }
        return mcpError(err);
      }
    }
  );
}
