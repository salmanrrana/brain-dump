/**
 * Session commands: create, update, complete, get, list.
 *
 * Manages Ralph session lifecycle.
 */

import {
  createSession,
  updateState,
  completeSession,
  getState,
  listSessions,
  InvalidActionError,
} from "../../core/index.ts";
import type { RalphSessionState, SessionOutcome } from "../../core/index.ts";
import { parseFlags, requireFlag, optionalFlag, boolFlag } from "../lib/args.ts";
import { outputResult, outputError, showResourceHelp } from "../lib/output.ts";
import { getDb } from "../lib/db.ts";

const ACTIONS = ["create", "update", "complete", "get", "list"];

export function handle(action: string, args: string[]): void {
  if (!action || action === "--help" || action === "help") {
    showResourceHelp(
      "session",
      ACTIONS,
      "Flags:\n  --ticket <id>      Ticket ID\n  --session <id>     Session ID\n  --state <state>    idle|analyzing|implementing|testing|committing|reviewing|done\n  --outcome <out>    success|failure|timeout|cancelled\n  --message <text>   State metadata message\n  --error <text>     Error message (for failure outcome)\n  --pretty           Human-readable output"
    );
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
        const state = requireFlag(flags, "state") as RalphSessionState;
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
        const outcome = requireFlag(flags, "outcome") as SessionOutcome;
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

      default:
        throw new InvalidActionError("session", action, ACTIONS);
    }
  } catch (e) {
    outputError(e);
  }
}
