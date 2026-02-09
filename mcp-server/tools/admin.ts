/**
 * Consolidated admin resource tool for Brain Dump MCP server.
 *
 * Merges 4 health/settings tools into 1 action-dispatched tool.
 * Business logic lives in core/health.ts.
 *
 * @module tools/admin
 */
import { z } from "zod";
import { log } from "../lib/logging.js";
import { mcpError } from "../lib/mcp-response.ts";
import { requireParam, formatResult, formatEmpty } from "../lib/mcp-format.ts";
import { listBackups } from "../lib/backup.js";
import { checkLock } from "../lib/lock.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "better-sqlite3";
import { CoreError } from "../../core/errors.ts";
import {
  getDatabaseHealth,
  getEnvironment,
  getProjectSettings,
  updateProjectSettings,
} from "../../core/health.ts";
import type { WorkingMethod, EnvironmentDetector } from "../../core/health.ts";
import {
  startConversation,
  logMessage,
  endConversation,
  listConversations,
  exportComplianceLogs,
  archiveOldSessions,
  DATA_CLASSIFICATIONS,
  MESSAGE_ROLES,
} from "../../core/compliance.ts";
import type { ComplianceDependencies, MessageRole } from "../../core/compliance.ts";
import type { DataClassification } from "../../core/types.ts";
import { containsSecrets } from "../lib/secrets.ts";

const ACTIONS = [
  "health",
  "environment",
  "settings",
  "update-settings",
  "start-conversation",
  "log-message",
  "end-conversation",
  "list-conversations",
  "export-logs",
  "archive-sessions",
] as const;
const WORKING_METHODS = [
  "auto",
  "claude-code",
  "vscode",
  "opencode",
  "cursor",
  "copilot-cli",
  "codex",
] as const;
const CLASSIFICATIONS = DATA_CLASSIFICATIONS as unknown as readonly [string, ...string[]];
const ROLES = MESSAGE_ROLES as unknown as readonly [string, ...string[]];

/**
 * Register the consolidated admin tool with the MCP server.
 */
export function registerAdminTool(
  server: McpServer,
  db: Database.Database,
  detectEnvironment: () => string,
  getEnvironmentInfo: () => {
    environment: string;
    workspacePath: string | null;
    envVarsDetected: string[];
  }
): void {
  const healthDeps = { listBackups, checkLock };
  const envDetector: EnvironmentDetector = { detectEnvironment, getEnvironmentInfo };

  server.tool(
    "admin",
    `Brain Dump administration, health monitoring, and compliance logging.

## Actions

### health
Get comprehensive database health report including integrity check, backup status, and statistics.
No additional params required.

### environment
Get current environment information (auto-detects Claude Code, VS Code, etc.).
No additional params required.

### settings
Get project settings including working method preference.
Required params: projectId

### update-settings
Update project settings (working method preference).
Required params: projectId, workingMethod

### start-conversation
Start a new conversation session for compliance logging. Auto-detects environment.
Optional params: projectId, ticketId, userId, metadata, dataClassification

### log-message
Log a message to an existing conversation session with tamper detection and secret scanning.
Required params: sessionId, role, content
Optional params: toolCalls, tokenCount, modelId

### end-conversation
End a conversation session and prevent further message logging.
Required params: sessionId

### list-conversations
List conversation sessions with optional filters, sorted by start date (newest first).
Optional params: projectId, ticketId, environment, startDate, endDate, includeActive, limit

### export-logs
Export conversation logs for compliance auditing (SOC2, GDPR, ISO 27001).
Required params: startDate, endDate
Optional params: sessionId, projectId, includeContent, verifyIntegrity

### archive-sessions
Archive (delete) conversation sessions older than retention period. DRY RUN by default.
Sessions with legal_hold=true are NEVER deleted.
Optional params: retentionDays, confirm

## Parameters
- action: (required) The operation to perform
- projectId: Project ID. Required for: settings, update-settings. Optional for: start-conversation, list-conversations, export-logs
- workingMethod: Working method (auto, claude-code, vscode, opencode, cursor, copilot-cli, codex). Required for: update-settings
- sessionId: Conversation session ID. Required for: log-message, end-conversation. Optional for: export-logs
- ticketId: Ticket ID. Optional for: start-conversation, list-conversations
- userId: User identifier. Optional for: start-conversation
- metadata: JSON object with additional context. Optional for: start-conversation
- dataClassification: Data sensitivity (public, internal, confidential, restricted). Optional for: start-conversation
- role: Message role (user, assistant, system, tool). Required for: log-message
- content: Message content. Required for: log-message
- toolCalls: Array of tool call objects. Optional for: log-message
- tokenCount: Token count for message. Optional for: log-message
- modelId: Model identifier. Optional for: log-message
- environment: Environment filter. Optional for: list-conversations
- startDate: Start date (ISO format). Required for: export-logs. Optional for: list-conversations
- endDate: End date (ISO format). Required for: export-logs. Optional for: list-conversations
- includeActive: Include active sessions. Optional for: list-conversations
- includeContent: Include message content in export. Optional for: export-logs
- verifyIntegrity: Verify HMAC hashes. Optional for: export-logs
- retentionDays: Days to retain (default: from settings or 90). Optional for: archive-sessions
- confirm: Confirm deletion. Optional for: archive-sessions`,
    {
      action: z.enum(ACTIONS).describe("The operation to perform"),
      projectId: z.string().optional().describe("Project ID"),
      workingMethod: z.enum(WORKING_METHODS).optional().describe("Working method preference"),
      sessionId: z.string().optional().describe("Conversation session ID"),
      ticketId: z.string().optional().describe("Ticket ID"),
      userId: z.string().optional().describe("User identifier"),
      metadata: z.record(z.unknown()).optional().describe("Additional session context"),
      dataClassification: z.enum(CLASSIFICATIONS).optional().describe("Data sensitivity level"),
      role: z.enum(ROLES).optional().describe("Message role"),
      content: z.string().optional().describe("Message content"),
      toolCalls: z
        .array(
          z.object({
            name: z.string(),
            parameters: z.record(z.unknown()).optional(),
            result: z.unknown().optional(),
          })
        )
        .optional()
        .describe("Tool call objects"),
      tokenCount: z.number().optional().describe("Token count for message"),
      modelId: z.string().optional().describe("Model identifier"),
      environment: z.string().optional().describe("Environment filter"),
      startDate: z.string().optional().describe("Start date (ISO format)"),
      endDate: z.string().optional().describe("End date (ISO format)"),
      includeActive: z.boolean().optional().describe("Include active sessions"),
      includeContent: z.boolean().optional().describe("Include message content in export"),
      verifyIntegrity: z.boolean().optional().describe("Verify HMAC hashes"),
      retentionDays: z.number().optional().describe("Days to retain"),
      confirm: z.boolean().optional().describe("Confirm deletion"),
      limit: z.number().optional().describe("Max results"),
    },
    async (params: {
      action: (typeof ACTIONS)[number];
      projectId?: string | undefined;
      workingMethod?: (typeof WORKING_METHODS)[number] | undefined;
      sessionId?: string | undefined;
      ticketId?: string | undefined;
      userId?: string | undefined;
      metadata?: Record<string, unknown> | undefined;
      dataClassification?: string | undefined;
      role?: string | undefined;
      content?: string | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod optional shapes differ under exactOptionalPropertyTypes
      toolCalls?: any[] | undefined;
      tokenCount?: number | undefined;
      modelId?: string | undefined;
      environment?: string | undefined;
      startDate?: string | undefined;
      endDate?: string | undefined;
      includeActive?: boolean | undefined;
      includeContent?: boolean | undefined;
      verifyIntegrity?: boolean | undefined;
      retentionDays?: number | undefined;
      confirm?: boolean | undefined;
      limit?: number | undefined;
    }) => {
      const complianceDeps: ComplianceDependencies = { detectEnvironment, containsSecrets };

      try {
        switch (params.action) {
          case "health": {
            const report = getDatabaseHealth(db, healthDeps);
            log.info(`Health check: ${report.status}`);
            return formatResult(report);
          }

          case "environment": {
            const result = getEnvironment(db, envDetector);
            return formatResult(result);
          }

          case "settings": {
            const projectId = requireParam(params.projectId, "projectId", "settings");
            const result = getProjectSettings(db, projectId, detectEnvironment);
            return formatResult(result);
          }

          case "update-settings": {
            const projectId = requireParam(params.projectId, "projectId", "update-settings");
            const workingMethod = requireParam(
              params.workingMethod,
              "workingMethod",
              "update-settings"
            );

            const result = updateProjectSettings(
              db,
              projectId,
              workingMethod as WorkingMethod,
              detectEnvironment
            );

            log.info(`Updated settings for project ${projectId}: workingMethod=${workingMethod}`);
            return formatResult(result, "Project settings updated!");
          }

          case "start-conversation": {
            const result = startConversation(
              db,
              {
                ...(params.projectId !== undefined ? { projectId: params.projectId } : {}),
                ...(params.ticketId !== undefined ? { ticketId: params.ticketId } : {}),
                ...(params.userId !== undefined ? { userId: params.userId } : {}),
                ...(params.metadata !== undefined ? { metadata: params.metadata } : {}),
                ...(params.dataClassification !== undefined
                  ? { dataClassification: params.dataClassification as DataClassification }
                  : {}),
              },
              complianceDeps
            );

            log.info(`Started conversation session: ${result.id}`);
            return formatResult(result, "Conversation session started!");
          }

          case "log-message": {
            const sessionId = requireParam(params.sessionId, "sessionId", "log-message");
            const role = requireParam(params.role, "role", "log-message");
            const content = requireParam(params.content, "content", "log-message");

            const result = logMessage(
              db,
              {
                sessionId,
                role: role as MessageRole,
                content,
                ...(params.toolCalls !== undefined ? { toolCalls: params.toolCalls } : {}),
                ...(params.tokenCount !== undefined ? { tokenCount: params.tokenCount } : {}),
                ...(params.modelId !== undefined ? { modelId: params.modelId } : {}),
              },
              complianceDeps
            );

            log.info(`Logged message #${result.sequenceNumber} to session ${sessionId}`);
            return formatResult(
              result,
              `Message logged (seq: ${result.sequenceNumber})${result.containsPotentialSecrets ? " ⚠️ Contains potential secrets" : ""}`
            );
          }

          case "end-conversation": {
            const sessionId = requireParam(params.sessionId, "sessionId", "end-conversation");
            const result = endConversation(db, sessionId);

            if (result.alreadyEnded) {
              return formatResult(result, "Session was already ended.");
            }

            log.info(`Ended conversation session: ${sessionId} (${result.messageCount} messages)`);
            return formatResult(
              result,
              `Session ended. ${result.messageCount} message(s) recorded.`
            );
          }

          case "list-conversations": {
            const results = listConversations(db, {
              ...(params.projectId !== undefined ? { projectId: params.projectId } : {}),
              ...(params.ticketId !== undefined ? { ticketId: params.ticketId } : {}),
              ...(params.environment !== undefined ? { environment: params.environment } : {}),
              ...(params.startDate !== undefined ? { startDate: params.startDate } : {}),
              ...(params.endDate !== undefined ? { endDate: params.endDate } : {}),
              ...(params.includeActive !== undefined
                ? { includeActive: params.includeActive }
                : {}),
              ...(params.limit !== undefined ? { limit: params.limit } : {}),
            });

            if (results.length === 0) {
              return formatEmpty("conversation sessions");
            }
            return formatResult(results, `Found ${results.length} conversation session(s)`);
          }

          case "export-logs": {
            const startDate = requireParam(params.startDate, "startDate", "export-logs");
            const endDate = requireParam(params.endDate, "endDate", "export-logs");

            const result = exportComplianceLogs(db, {
              startDate,
              endDate,
              ...(params.sessionId !== undefined ? { sessionId: params.sessionId } : {}),
              ...(params.projectId !== undefined ? { projectId: params.projectId } : {}),
              ...(params.includeContent !== undefined
                ? { includeContent: params.includeContent }
                : {}),
              ...(params.verifyIntegrity !== undefined
                ? { verifyIntegrity: params.verifyIntegrity }
                : {}),
            });

            log.info(
              `Exported compliance logs: ${result.exportMetadata.sessionCount} sessions, ${result.exportMetadata.messageCount} messages`
            );
            return formatResult(result);
          }

          case "archive-sessions": {
            const result = archiveOldSessions(db, {
              ...(params.retentionDays !== undefined
                ? { retentionDays: params.retentionDays }
                : {}),
              ...(params.confirm !== undefined ? { confirm: params.confirm } : {}),
            });

            if (result.dryRun) {
              return formatResult(
                result,
                `DRY RUN: Would delete ${result.sessionsToDelete} session(s) and ${result.messagesToDelete} message(s). ${result.legalHoldCount} session(s) under legal hold preserved.`
              );
            }

            log.info(
              `Archived ${result.sessionsDeleted} session(s) and ${result.messagesDeleted} message(s)`
            );
            return formatResult(
              result,
              `Archived ${result.sessionsDeleted} session(s) and ${result.messagesDeleted} message(s). ${result.legalHoldCount} legal hold session(s) preserved.`
            );
          }
        }
      } catch (err) {
        if (err instanceof CoreError) {
          log.error(`admin/${params.action} failed: ${err.message}`);
        }
        return mcpError(err);
      }
    }
  );
}
