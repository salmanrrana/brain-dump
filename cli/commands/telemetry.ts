/**
 * Telemetry commands: start, end, get, list, log-tool, log-prompt, log-context, record-usage.
 */

import {
  startTelemetrySession,
  endTelemetrySession,
  getTelemetrySession,
  listTelemetrySessions,
  logTool,
  logPrompt,
  logContext,
  recordUsage,
  recalculateCosts,
  deepRecalculateCosts,
  detectActiveTicket,
  InvalidActionError,
} from "../../core/index.ts";
import type { TelemetryOutcome, ToolEventType, RecordUsageParams } from "../../core/index.ts";
import { parseFlags, requireFlag, optionalFlag, boolFlag, numericFlag } from "../lib/args.ts";
import { outputResult, outputError, showResourceHelp } from "../lib/output.ts";
import { getDb } from "../lib/db.ts";
import { resolve } from "path";

const ACTIONS = [
  "start",
  "end",
  "get",
  "list",
  "log-tool",
  "log-prompt",
  "log-context",
  "record-usage",
  "recalculate-costs",
  "deep-recalculate-costs",
];

export async function handle(action: string, args: string[]): Promise<void> {
  if (!action || action === "--help" || action === "help") {
    showResourceHelp("telemetry");
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

      case "log-context": {
        const sessionId = requireFlag(flags, "session");
        const hasDescription = boolFlag(flags, "has-description");
        const hasAcceptanceCriteria = boolFlag(flags, "has-criteria");
        const criteriaCount = numericFlag(flags, "criteria-count");
        const commentCount = numericFlag(flags, "comment-count");
        const attachmentCount = numericFlag(flags, "attachment-count");
        const imageCount = numericFlag(flags, "image-count");
        const result = logContext(db, {
          sessionId,
          hasDescription,
          hasAcceptanceCriteria,
          ...(criteriaCount !== undefined ? { criteriaCount } : {}),
          ...(commentCount !== undefined ? { commentCount } : {}),
          ...(attachmentCount !== undefined ? { attachmentCount } : {}),
          ...(imageCount !== undefined ? { imageCount } : {}),
        });
        outputResult(result, pretty);
        break;
      }

      case "record-usage": {
        const model = requireFlag(flags, "model");
        const inputTokens = numericFlag(flags, "input");
        const outputTokens = numericFlag(flags, "output");

        if (inputTokens === undefined) {
          throw new Error("Missing required flag: --input (input token count)");
        }
        if (outputTokens === undefined) {
          throw new Error("Missing required flag: --output (output token count)");
        }

        const cacheReadTokens = numericFlag(flags, "cache-read");
        const cacheCreateTokens = numericFlag(flags, "cache-create");
        const source = optionalFlag(flags, "source") ?? "jsonl-hook";
        const sessionIdFlag = optionalFlag(flags, "session");
        const ticketIdFlag = optionalFlag(flags, "ticket");

        // Auto-detect session from ralph-state.json if not provided
        let resolvedSessionId = sessionIdFlag;
        let resolvedTicketId = ticketIdFlag;

        if (!resolvedSessionId) {
          const detection = detectActiveTicket(resolve(process.cwd()));
          if (detection.ticketId) {
            resolvedTicketId = resolvedTicketId || detection.ticketId;
            // Find most recent active telemetry session for this ticket
            const activeSession = db
              .prepare(
                `SELECT id FROM telemetry_sessions
                 WHERE ticket_id = ? AND ended_at IS NULL
                 ORDER BY started_at DESC LIMIT 1`
              )
              .get(detection.ticketId) as { id: string } | undefined;
            if (activeSession) {
              resolvedSessionId = activeSession.id;
            }
          }

          // Fallback: find any active telemetry session
          if (!resolvedSessionId) {
            const anyActive = db
              .prepare(
                `SELECT id FROM telemetry_sessions
                 WHERE ended_at IS NULL
                 ORDER BY started_at DESC LIMIT 1`
              )
              .get() as { id: string } | undefined;
            if (anyActive) {
              resolvedSessionId = anyActive.id;
            }
          }
        }

        if (!resolvedSessionId && !resolvedTicketId) {
          throw new Error(
            "No active telemetry session found. Provide --session or --ticket, " +
              "or ensure a Ralph session is active (.claude/ralph-state.json)."
          );
        }

        const usageParams: RecordUsageParams = {
          model,
          inputTokens,
          outputTokens,
          source,
          ...(resolvedSessionId !== undefined ? { telemetrySessionId: resolvedSessionId } : {}),
          ...(resolvedTicketId !== undefined ? { ticketId: resolvedTicketId } : {}),
          ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
          ...(cacheCreateTokens !== undefined ? { cacheCreationTokens: cacheCreateTokens } : {}),
        };

        const result = recordUsage(db, usageParams);
        outputResult(result, pretty);
        break;
      }

      case "recalculate-costs": {
        const result = recalculateCosts(db);
        outputResult(result, pretty);
        break;
      }

      case "deep-recalculate-costs": {
        const result = await deepRecalculateCosts(db);
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
