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
  resolveTokenUsageAttribution,
  recalculateCosts,
  deepRecalculateCosts,
  detectActiveTicket,
  InvalidActionError,
} from "../../core/index.ts";
import type { TelemetryOutcome, ToolEventType, RecordUsageParams } from "../../core/index.ts";
import { parseFlags, requireFlag, optionalFlag, boolFlag, numericFlag } from "../lib/args.ts";
import { outputResult, outputError, showResourceHelp } from "../lib/output.ts";
import { getDb } from "../lib/db.ts";
import { statSync } from "fs";
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

function transcriptMtimeIso(transcriptPath: string | undefined): string | undefined {
  if (!transcriptPath) return undefined;
  try {
    return statSync(transcriptPath).mtime.toISOString();
  } catch {
    return undefined;
  }
}

function warnAttribution(message: string): void {
  console.error(`[brain-dump] WARNING: ${message}`);
}

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
        const projectPathFlag = optionalFlag(flags, "project-path");
        const transcriptPathFlag = optionalFlag(flags, "transcript");
        const eventTimeFlag = optionalFlag(flags, "event-time");
        const eventStartFlag = optionalFlag(flags, "event-start");
        const eventEndFlag = optionalFlag(flags, "event-end");
        const projectPath = projectPathFlag ? resolve(projectPathFlag) : undefined;
        const transcriptPath = transcriptPathFlag ? resolve(transcriptPathFlag) : undefined;
        const inferredEventTime = eventTimeFlag ?? transcriptMtimeIso(transcriptPath);

        let resolvedSessionId = sessionIdFlag;
        let resolvedTicketId = ticketIdFlag;

        if (!resolvedSessionId && !resolvedTicketId) {
          const detection = detectActiveTicket(projectPath ?? resolve(process.cwd()));
          if (detection.ticketId) {
            resolvedTicketId = detection.ticketId;
            const activeSession = db
              .prepare(
                `SELECT id FROM telemetry_sessions
                 WHERE ticket_id = ? AND ended_at IS NULL
                 ORDER BY started_at DESC LIMIT 1`
              )
              .get(detection.ticketId) as { id: string } | undefined;
            if (activeSession) resolvedSessionId = activeSession.id;
          }
        }

        const attribution = resolveTokenUsageAttribution(db, {
          ...(resolvedSessionId ? { telemetrySessionId: resolvedSessionId } : {}),
          ...(resolvedTicketId ? { ticketId: resolvedTicketId } : {}),
          ...(projectPath ? { projectPath } : {}),
          ...(transcriptPath ? { transcriptPath } : {}),
          ...(inferredEventTime ? { eventTime: inferredEventTime } : {}),
          ...(eventStartFlag ? { eventStart: eventStartFlag } : {}),
          ...(eventEndFlag ? { eventEnd: eventEndFlag } : {}),
        });

        if (attribution.warning) warnAttribution(attribution.warning);
        if (attribution.skipped) {
          outputResult(
            {
              recorded: false,
              skipped: true,
              warning: attribution.warning,
            },
            pretty
          );
          break;
        }

        resolvedSessionId = attribution.telemetrySessionId;
        resolvedTicketId = attribution.ticketId;

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
