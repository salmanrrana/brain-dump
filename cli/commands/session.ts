/**
 * Session commands: create, update, update-state, complete, get, list,
 * emit-event, get-events, clear-events.
 *
 * Manages Ralph session lifecycle and events.
 */

import { readFileSync } from "fs";
import {
  createSession,
  updateState,
  completeSession,
  getState,
  listSessions,
  emitEvent,
  getEvents,
  clearEvents,
  clearActiveSessionsForProject,
  InvalidActionError,
  ValidationError,
} from "../../core/index.ts";
import type { RalphSessionState, SessionOutcome, RalphEventType } from "../../core/index.ts";
import {
  parseFlags,
  requireFlag,
  optionalFlag,
  boolFlag,
  numericFlag,
  requireEnumFlag,
} from "../lib/args.ts";
import { outputResult, outputError, showResourceHelp } from "../lib/output.ts";
import { getDb } from "../lib/db.ts";

const ACTIONS = [
  "create",
  "update",
  "update-state",
  "complete",
  "get",
  "list",
  "clear-active",
  "emit-event",
  "get-events",
  "clear-events",
];

export function handle(action: string, args: string[]): void {
  if (!action || action === "--help" || action === "help") {
    showResourceHelp("session");
  }

  const flags = parseFlags(args);
  const pretty = boolFlag(flags, "pretty");
  const { db } = getDb();

  try {
    switch (action) {
      case "create": {
        const ticketId = requireFlag(flags, "ticket");
        const result = createSession(db, ticketId);
        outputResult(result, pretty);
        break;
      }

      case "update": {
        const sessionId = requireFlag(flags, "session");
        const state = requireEnumFlag<RalphSessionState>(flags, "state", [
          "idle",
          "analyzing",
          "implementing",
          "testing",
          "committing",
          "reviewing",
          "done",
        ]);
        const message = optionalFlag(flags, "message");
        const result = updateState(db, {
          sessionId,
          state,
          ...(message !== undefined ? { metadata: { message } } : {}),
        });
        outputResult(result, pretty);
        break;
      }

      case "complete": {
        const sessionId = requireFlag(flags, "session");
        const outcome = requireEnumFlag<SessionOutcome>(flags, "outcome", [
          "success",
          "failure",
          "timeout",
          "cancelled",
        ]);
        const errorMessage = optionalFlag(flags, "error");
        const result = completeSession(
          db,
          sessionId,
          outcome,
          ...(errorMessage !== undefined ? ([errorMessage] as const) : [])
        );
        outputResult(result, pretty);
        break;
      }

      case "get": {
        const sessionId = optionalFlag(flags, "session");
        const ticketId = optionalFlag(flags, "ticket");
        const result = getState(db, {
          ...(sessionId !== undefined ? { sessionId } : {}),
          ...(ticketId !== undefined ? { ticketId } : {}),
        });
        outputResult(result, pretty);
        break;
      }

      case "list": {
        const ticketId = requireFlag(flags, "ticket");
        const result = listSessions(db, ticketId);
        outputResult(result, pretty);
        break;
      }

      case "update-state": {
        // Additive alias for MCP naming consistency (same as "update")
        const sessionId = requireFlag(flags, "session");
        const state = requireEnumFlag<RalphSessionState>(flags, "state", [
          "idle",
          "analyzing",
          "implementing",
          "testing",
          "committing",
          "reviewing",
          "done",
        ]);
        const message = optionalFlag(flags, "message");
        const result = updateState(db, {
          sessionId,
          state,
          ...(message !== undefined ? { metadata: { message } } : {}),
        });
        outputResult(result, pretty);
        break;
      }

      case "clear-active": {
        const projectId = requireFlag(flags, "project");
        const result = clearActiveSessionsForProject(db, projectId);
        outputResult(result, pretty);
        break;
      }

      case "emit-event": {
        const sessionId = requireFlag(flags, "session");
        const eventType = requireEnumFlag<RalphEventType>(flags, "event-type", [
          "thinking",
          "tool_start",
          "tool_end",
          "file_change",
          "progress",
          "state_change",
          "error",
        ]);
        const eventDataFile = optionalFlag(flags, "event-data-file");
        let eventData: Record<string, unknown> | undefined;
        if (eventDataFile) {
          try {
            const raw = readFileSync(eventDataFile, "utf-8");
            eventData = JSON.parse(raw) as Record<string, unknown>;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            throw new ValidationError(`Failed to read event data file "${eventDataFile}": ${msg}`);
          }
        }
        const result = emitEvent(db, {
          sessionId,
          type: eventType,
          ...(eventData !== undefined ? { data: eventData } : {}),
        });
        outputResult(result, pretty);
        break;
      }

      case "get-events": {
        const sessionId = requireFlag(flags, "session");
        const since = optionalFlag(flags, "since");
        const limit = numericFlag(flags, "limit");
        const result = getEvents(db, sessionId, {
          ...(since !== undefined ? { since } : {}),
          ...(limit !== undefined ? { limit } : {}),
        });
        outputResult(result, pretty);
        break;
      }

      case "clear-events": {
        const sessionId = requireFlag(flags, "session");
        const cleared = clearEvents(db, sessionId);
        outputResult({ cleared }, pretty);
        break;
      }

      default:
        throw new InvalidActionError("session", action, ACTIONS);
    }
  } catch (e) {
    outputError(e);
  }
}
