/**
 * Telemetry commands: start, end, get, list, log-tool, log-prompt.
 */

import {
  startTelemetrySession,
  endTelemetrySession,
  getTelemetrySession,
  listTelemetrySessions,
  logTool,
  logPrompt,
  InvalidActionError,
} from "../../core/index.ts";
import type { TelemetryOutcome, ToolEventType } from "../../core/index.ts";
import { parseFlags, requireFlag, optionalFlag, boolFlag, numericFlag } from "../lib/args.ts";
import { outputResult, outputError, showResourceHelp } from "../lib/output.ts";
import { getDb } from "../lib/db.ts";

const ACTIONS = ["start", "end", "get", "list", "log-tool", "log-prompt"];

export function handle(action: string, args: string[]): void {
  if (!action || action === "--help" || action === "help") {
    showResourceHelp(
      "telemetry",
      ACTIONS,
      "Flags:\n  --session <id>       Session ID\n  --ticket <id>        Ticket ID\n  --project <path>     Project path\n  --outcome <out>      success|failure|timeout|cancelled\n  --tokens <n>         Total token count\n  --since <date>       ISO date filter\n  --limit <n>          Max results\n  --tool <name>        Tool name (for log-tool)\n  --event <type>       start|end (for log-tool)\n  --prompt <text>      Prompt text (for log-prompt)\n  --pretty             Human-readable output"
    );
  }

  const flags = parseFlags(args);
  const pretty = boolFlag(flags, "pretty");
  const { db } = getDb();

  try {
    switch (action) {
      case "start": {
        const ticketId = optionalFlag(flags, "ticket");
        const projectPath = optionalFlag(flags, "project");
        const environment = optionalFlag(flags, "env");
        const result = startTelemetrySession(db, {
          ...(ticketId !== undefined ? { ticketId } : {}),
          ...(projectPath !== undefined ? { projectPath } : {}),
          ...(environment !== undefined ? { environment } : {}),
        });
        outputResult(result, pretty);
        break;
      }

      case "end": {
        const sessionId = requireFlag(flags, "session");
        const outcome = optionalFlag(flags, "outcome") as TelemetryOutcome | undefined;
        const totalTokens = numericFlag(flags, "tokens");
        const result = endTelemetrySession(db, {
          sessionId,
          ...(outcome !== undefined ? { outcome } : {}),
          ...(totalTokens !== undefined ? { totalTokens } : {}),
        });
        outputResult(result, pretty);
        break;
      }

      case "get": {
        const sessionId = optionalFlag(flags, "session");
        const ticketId = optionalFlag(flags, "ticket");
        const result = getTelemetrySession(db, {
          ...(sessionId !== undefined ? { sessionId } : {}),
          ...(ticketId !== undefined ? { ticketId } : {}),
        });
        outputResult(result, pretty);
        break;
      }

      case "list": {
        const ticketId = optionalFlag(flags, "ticket");
        const projectId = optionalFlag(flags, "project");
        const since = optionalFlag(flags, "since");
        const limit = numericFlag(flags, "limit");
        const result = listTelemetrySessions(db, {
          ...(ticketId !== undefined ? { ticketId } : {}),
          ...(projectId !== undefined ? { projectId } : {}),
          ...(since !== undefined ? { since } : {}),
          ...(limit !== undefined ? { limit } : {}),
        });
        outputResult(result, pretty);
        break;
      }

      case "log-tool": {
        const sessionId = requireFlag(flags, "session");
        const event = requireFlag(flags, "event") as ToolEventType;
        const toolName = requireFlag(flags, "tool");
        const correlationId = optionalFlag(flags, "correlation-id");
        const success = boolFlag(flags, "success") ? true : undefined;
        const result = logTool(db, {
          sessionId,
          event,
          toolName,
          ...(correlationId !== undefined ? { correlationId } : {}),
          ...(success !== undefined ? { success } : {}),
        });
        outputResult(result, pretty);
        break;
      }

      case "log-prompt": {
        const sessionId = requireFlag(flags, "session");
        const prompt = requireFlag(flags, "prompt");
        const redact = boolFlag(flags, "redact");
        const result = logPrompt(db, {
          sessionId,
          prompt,
          ...(redact ? { redact } : {}),
        });
        outputResult(result, pretty);
        break;
      }

      default:
        throw new InvalidActionError("telemetry", action, ACTIONS);
    }
  } catch (e) {
    outputError(e);
  }
}
