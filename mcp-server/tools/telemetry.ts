/**
 * Consolidated telemetry resource tool for Brain Dump MCP server.
 *
 * Merges 7 individual telemetry tools into 1 action-dispatched tool.
 * Business logic lives in core/telemetry.ts.
 *
 * @module tools/telemetry
 */
import { z } from "zod";
import { log } from "../lib/logging.js";
import { mcpError } from "../lib/mcp-response.ts";
import { requireParam, formatResult, formatEmpty } from "../lib/mcp-format.ts";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "better-sqlite3";
import { CoreError } from "../../core/errors.ts";
import {
  startTelemetrySession,
  logPrompt,
  logTool,
  logContext,
  endTelemetrySession,
  getTelemetrySession,
  listTelemetrySessions,
  TELEMETRY_OUTCOMES,
  TOOL_EVENTS,
} from "../../core/telemetry.ts";
import type { TelemetryOutcome, ToolEventType } from "../../core/telemetry.ts";

const ACTIONS = ["start", "log-prompt", "log-tool", "log-context", "end", "get", "list"] as const;
const OUTCOMES = TELEMETRY_OUTCOMES as unknown as readonly [string, ...string[]];
const EVENTS = TOOL_EVENTS as unknown as readonly [string, ...string[]];

/**
 * Register the consolidated telemetry tool with the MCP server.
 */
export function registerTelemetryTool(
  server: McpServer,
  db: Database.Database,
  detectEnvironment: () => string
): void {
  server.tool(
    "telemetry",
    `Manage telemetry sessions in Brain Dump. Captures AI interaction metrics.

### start - Start a telemetry session for AI work
### log-prompt - Log a user prompt (supports redaction for privacy)
### log-tool - Log a tool call start/end with correlation ID for duration tracking
### log-context - Log what context was loaded when starting ticket work
### end - End session and compute final statistics
### get - Get telemetry data (provide sessionId or ticketId)
### list - List telemetry sessions with optional filters`,
    {
      action: z.enum(ACTIONS).describe("The operation to perform"),
      sessionId: z.string().optional().describe("Telemetry session ID"),
      ticketId: z.string().optional().describe("Ticket ID"),
      projectPath: z.string().optional().describe("Project path"),
      environment: z.string().optional().describe("Environment name"),
      prompt: z.string().optional().describe("Prompt text"),
      redact: z.boolean().optional().describe("Hash prompt for privacy"),
      tokenCount: z.number().optional().describe("Token count"),
      toolEvent: z.enum(EVENTS).optional().describe("Tool event type (start or end)"),
      toolName: z.string().optional().describe("Tool name"),
      correlationId: z.string().optional().describe("Correlation ID"),
      toolParams: z.record(z.unknown()).optional().describe("Parameter summary"),
      toolResult: z.string().optional().describe("Result summary"),
      success: z.boolean().optional().describe("Whether tool call succeeded"),
      durationMs: z.number().optional().describe("Duration in ms"),
      error: z.string().optional().describe("Error message"),
      hasDescription: z.boolean().optional().describe("Whether ticket had description"),
      hasAcceptanceCriteria: z.boolean().optional().describe("Whether ticket had criteria"),
      criteriaCount: z.number().optional().describe("Number of criteria"),
      commentCount: z.number().optional().describe("Number of comments"),
      attachmentCount: z.number().optional().describe("Number of attachments"),
      imageCount: z.number().optional().describe("Number of images"),
      outcome: z.enum(OUTCOMES).optional().describe("Session outcome"),
      totalTokens: z.number().optional().describe("Total token count"),
      includeEvents: z.boolean().optional().describe("Include event details"),
      eventLimit: z.number().optional().describe("Max events"),
      projectId: z.string().optional().describe("Filter by project"),
      since: z.string().optional().describe("Sessions after this date"),
      limit: z.number().optional().describe("Max results"),
    },
    async (params: {
      action: (typeof ACTIONS)[number];
      sessionId?: string | undefined;
      ticketId?: string | undefined;
      projectPath?: string | undefined;
      environment?: string | undefined;
      prompt?: string | undefined;
      redact?: boolean | undefined;
      tokenCount?: number | undefined;
      toolEvent?: string | undefined;
      toolName?: string | undefined;
      correlationId?: string | undefined;
      toolParams?: Record<string, unknown> | undefined;
      toolResult?: string | undefined;
      success?: boolean | undefined;
      durationMs?: number | undefined;
      error?: string | undefined;
      hasDescription?: boolean | undefined;
      hasAcceptanceCriteria?: boolean | undefined;
      criteriaCount?: number | undefined;
      commentCount?: number | undefined;
      attachmentCount?: number | undefined;
      imageCount?: number | undefined;
      outcome?: string | undefined;
      totalTokens?: number | undefined;
      includeEvents?: boolean | undefined;
      eventLimit?: number | undefined;
      projectId?: string | undefined;
      since?: string | undefined;
      limit?: number | undefined;
    }) => {
      try {
        switch (params.action) {
          case "start": {
            const result = startTelemetrySession(
              db,
              {
                ...(params.ticketId !== undefined ? { ticketId: params.ticketId } : {}),
                ...(params.projectPath !== undefined ? { projectPath: params.projectPath } : {}),
                ...(params.environment !== undefined ? { environment: params.environment } : {}),
              },
              detectEnvironment
            );
            log.info(`Started telemetry session ${result.id}`);
            return formatResult(result, "Telemetry session started!");
          }

          case "log-prompt": {
            const sessionId = requireParam(params.sessionId, "sessionId", "log-prompt");
            const prompt = requireParam(params.prompt, "prompt", "log-prompt");

            const result = logPrompt(db, {
              sessionId,
              prompt,
              ...(params.redact !== undefined ? { redact: params.redact } : {}),
              ...(params.tokenCount !== undefined ? { tokenCount: params.tokenCount } : {}),
            });
            return formatResult(result);
          }

          case "log-tool": {
            const sessionId = requireParam(params.sessionId, "sessionId", "log-tool");
            const toolEvent = requireParam(params.toolEvent, "toolEvent", "log-tool");
            const toolName = requireParam(params.toolName, "toolName", "log-tool");

            const result = logTool(db, {
              sessionId,
              event: toolEvent as ToolEventType,
              toolName,
              ...(params.correlationId !== undefined
                ? { correlationId: params.correlationId }
                : {}),
              ...(params.toolParams !== undefined ? { params: params.toolParams } : {}),
              ...(params.toolResult !== undefined ? { result: params.toolResult } : {}),
              ...(params.success !== undefined ? { success: params.success } : {}),
              ...(params.durationMs !== undefined ? { durationMs: params.durationMs } : {}),
              ...(params.error !== undefined ? { error: params.error } : {}),
            });
            return formatResult(result);
          }

          case "log-context": {
            const sessionId = requireParam(params.sessionId, "sessionId", "log-context");
            const hasDescription = requireParam(
              params.hasDescription,
              "hasDescription",
              "log-context"
            );
            const hasAcceptanceCriteria = requireParam(
              params.hasAcceptanceCriteria,
              "hasAcceptanceCriteria",
              "log-context"
            );

            const eventId = logContext(db, {
              sessionId,
              hasDescription,
              hasAcceptanceCriteria,
              ...(params.criteriaCount !== undefined
                ? { criteriaCount: params.criteriaCount }
                : {}),
              ...(params.commentCount !== undefined ? { commentCount: params.commentCount } : {}),
              ...(params.attachmentCount !== undefined
                ? { attachmentCount: params.attachmentCount }
                : {}),
              ...(params.imageCount !== undefined ? { imageCount: params.imageCount } : {}),
            });
            return formatResult({ eventId }, "Context event logged.");
          }

          case "end": {
            const sessionId = requireParam(params.sessionId, "sessionId", "end");

            const result = endTelemetrySession(db, {
              sessionId,
              ...(params.outcome !== undefined
                ? { outcome: params.outcome as TelemetryOutcome }
                : {}),
              ...(params.totalTokens !== undefined ? { totalTokens: params.totalTokens } : {}),
            });

            log.info(`Ended telemetry session ${sessionId}`);
            return formatResult(result, "Telemetry session ended.");
          }

          case "get": {
            const result = getTelemetrySession(db, {
              ...(params.sessionId !== undefined ? { sessionId: params.sessionId } : {}),
              ...(params.ticketId !== undefined ? { ticketId: params.ticketId } : {}),
              ...(params.includeEvents !== undefined
                ? { includeEvents: params.includeEvents }
                : {}),
              ...(params.eventLimit !== undefined ? { eventLimit: params.eventLimit } : {}),
            });
            return formatResult(result);
          }

          case "list": {
            const sessions = listTelemetrySessions(db, {
              ...(params.ticketId !== undefined ? { ticketId: params.ticketId } : {}),
              ...(params.projectId !== undefined ? { projectId: params.projectId } : {}),
              ...(params.since !== undefined ? { since: params.since } : {}),
              ...(params.limit !== undefined ? { limit: params.limit } : {}),
            });

            if (sessions.length === 0) {
              return formatEmpty("telemetry sessions", {
                ticketId: params.ticketId,
                projectId: params.projectId,
              });
            }
            return formatResult(sessions);
          }
        }
      } catch (err) {
        if (err instanceof CoreError) {
          log.error(`telemetry/${params.action} failed: ${err.message}`);
        }
        return mcpError(err);
      }
    }
  );
}
