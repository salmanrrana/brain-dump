/**
 * Conversation logging tools for Brain Dump MCP server.
 * Enterprise compliance logging for AI conversations.
 * @module tools/conversations
 */
import { z } from "zod";
import { randomUUID, createHmac } from "crypto";
import { hostname } from "os";
import { log } from "../lib/logging.js";
import { containsSecrets } from "../lib/secrets.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "better-sqlite3";

// ============================================
// Constants
// ============================================

const DATA_CLASSIFICATIONS = ["public", "internal", "confidential", "restricted"] as const;
const MESSAGE_ROLES = ["user", "assistant", "system", "tool"] as const;

// ============================================
// Type Definitions
// ============================================

/** Minimal project row for validation */
interface ProjectBasicRow {
  id: string;
  name: string;
}

/** Minimal ticket row for validation */
interface TicketBasicRow {
  id: string;
  title: string;
}

/** DB row for a conversation session */
interface DbConversationSessionRow {
  id: string;
  project_id: string | null;
  ticket_id: string | null;
  user_id: string | null;
  environment: string;
  session_metadata: string | null;
  data_classification: string;
  legal_hold: number;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

/** DB row for conversation session with JOINed names */
interface DbConversationSessionJoinedRow extends DbConversationSessionRow {
  project_name: string | null;
  ticket_title: string | null;
  message_count: number;
}

/** DB row for a conversation message */
interface DbConversationMessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  content_hash: string;
  tool_calls: string | null;
  token_count: number | null;
  model_id: string | null;
  sequence_number: number;
  contains_potential_secrets: number;
  created_at: string;
}

/** Max sequence number query result */
interface MaxSeqRow {
  max_seq: number | null;
}

/** Count query result */
interface CountRow {
  count: number;
}

/** Settings row for retention days */
interface SettingsRetentionRow {
  conversation_retention_days: number;
}

/** Session row for archive listing */
interface ArchiveSessionRow {
  id: string;
  project_id: string | null;
  ticket_id: string | null;
  environment: string;
  data_classification: string;
  started_at: string;
  ended_at: string | null;
  project_name: string | null;
  message_count: number;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Compute HMAC-SHA256 hash for tamper detection.
 * Uses a derived key from machine hostname + session ID for simplicity.
 * In production, this should use a proper secret management system.
 */
function computeContentHash(content: string, sessionId: string): string {
  const key = `brain-dump:${hostname()}:${sessionId}`;
  return createHmac("sha256", key).update(content).digest("hex");
}

// ============================================
// Tool Registration
// ============================================

/**
 * Register conversation logging tools with the MCP server.
 */
export function registerConversationTools(
  server: McpServer,
  db: Database.Database,
  detectEnvironment: () => string
): void {
  // ============================================
  // start_conversation_session
  // ============================================
  server.tool(
    "start_conversation_session",
    `Start a new conversation session for compliance logging.

Creates a new session record to track an AI conversation. Sessions can be linked
to projects and tickets for context. The environment is auto-detected but can
be overridden.

Use this at the start of significant work sessions to maintain an audit trail.

Args:
  projectId (optional): Link session to a specific project
  ticketId (optional): Link session to a specific ticket
  userId (optional): User identifier for multi-user tracking
  metadata (optional): JSON object with additional session context
  dataClassification (optional): Data sensitivity level (default: internal)

Returns the created session with its ID for use in subsequent logging calls.`,
    {
      projectId: z.string().optional().describe("Optional project ID to link the session to"),
      ticketId: z.string().optional().describe("Optional ticket ID to link the session to"),
      userId: z.string().optional().describe("Optional user identifier for multi-user tracking"),
      metadata: z
        .record(z.unknown())
        .optional()
        .describe("Optional JSON object with additional session context"),
      dataClassification: z
        .enum(DATA_CLASSIFICATIONS)
        .optional()
        .describe("Data sensitivity level (default: internal)"),
    },
    async ({
      projectId,
      ticketId,
      userId,
      metadata,
      dataClassification = "internal",
    }: {
      projectId?: string | undefined;
      ticketId?: string | undefined;
      userId?: string | undefined;
      metadata?: Record<string, unknown> | undefined;
      dataClassification?: (typeof DATA_CLASSIFICATIONS)[number] | undefined;
    }) => {
      // Validate projectId if provided
      if (projectId) {
        const project = db.prepare("SELECT id, name FROM projects WHERE id = ?").get(projectId) as
          | ProjectBasicRow
          | undefined;
        if (!project) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Project not found: ${projectId}. Use list_projects to see available projects.`,
              },
            ],
            isError: true,
          };
        }
      }

      // Validate ticketId if provided
      if (ticketId) {
        const ticket = db.prepare("SELECT id, title FROM tickets WHERE id = ?").get(ticketId) as
          | TicketBasicRow
          | undefined;
        if (!ticket) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Ticket not found: ${ticketId}. Use list_tickets to see available tickets.`,
              },
            ],
            isError: true,
          };
        }
      }

      const id = randomUUID();
      const now = new Date().toISOString();
      const environment = detectEnvironment();
      const metadataJson = metadata ? JSON.stringify(metadata) : null;

      try {
        db.prepare(
          `
          INSERT INTO conversation_sessions
          (id, project_id, ticket_id, user_id, environment, session_metadata, data_classification, started_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        ).run(
          id,
          projectId || null,
          ticketId || null,
          userId || null,
          environment,
          metadataJson,
          dataClassification,
          now,
          now
        );

        const session = db
          .prepare("SELECT * FROM conversation_sessions WHERE id = ?")
          .get(id) as DbConversationSessionRow;
        log.info(
          `Started conversation session ${id} (env: ${environment}, project: ${projectId || "none"}, ticket: ${ticketId || "none"})`
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `## Conversation Session Started

**Session ID:** ${id}
**Environment:** ${environment}
**Classification:** ${dataClassification}
${projectId ? `**Project:** ${projectId}` : ""}
${ticketId ? `**Ticket:** ${ticketId}` : ""}
${userId ? `**User:** ${userId}` : ""}
**Started:** ${now}

Use this session ID with \`log_conversation_message\` to log messages.

\`\`\`json
${JSON.stringify(session, null, 2)}
\`\`\``,
            },
          ],
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log.error(`Failed to create conversation session: ${errorMsg}`);
        return {
          content: [
            { type: "text" as const, text: `Failed to create conversation session: ${errorMsg}` },
          ],
          isError: true,
        };
      }
    }
  );

  // ============================================
  // log_conversation_message
  // ============================================
  server.tool(
    "log_conversation_message",
    `Log a message to an existing conversation session.

Records a single message (user, assistant, system, or tool) with tamper detection
via HMAC-SHA256 content hashing and automatic secret detection.

Use this to log each message in a conversation for compliance auditing.
Messages are assigned sequential numbers within the session.

Args:
  sessionId (required): The session ID to log the message to
  role (required): Message role - user, assistant, system, or tool
  content (required): Full message text
  toolCalls (optional): Array of tool call objects {name, parameters, result}
  tokenCount (optional): Token usage for this message
  modelId (optional): Model identifier (e.g., 'claude-3-opus')

Returns the created message with its ID and content hash for verification.`,
    {
      sessionId: z.string().describe("Session ID to log the message to"),
      role: z.enum(MESSAGE_ROLES).describe("Message role: user, assistant, system, or tool"),
      content: z.string().describe("Full message content"),
      toolCalls: z
        .array(
          z.object({
            name: z.string(),
            parameters: z.record(z.unknown()).optional(),
            result: z.unknown().optional(),
          })
        )
        .optional()
        .describe("Optional array of tool calls made in this message"),
      tokenCount: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Optional token count for this message"),
      modelId: z.string().optional().describe("Optional model identifier"),
    },
    async ({
      sessionId,
      role,
      content,
      toolCalls,
      tokenCount,
      modelId,
    }: {
      sessionId: string;
      role: (typeof MESSAGE_ROLES)[number];
      content: string;
      toolCalls?:
        | Array<{
            name: string;
            parameters?: Record<string, unknown> | undefined;
            result?: unknown;
          }>
        | undefined;
      tokenCount?: number | undefined;
      modelId?: string | undefined;
    }) => {
      // Validate session exists and is not ended
      const session = db
        .prepare("SELECT * FROM conversation_sessions WHERE id = ?")
        .get(sessionId) as DbConversationSessionRow | undefined;
      if (!session) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Session not found: ${sessionId}. Use start_conversation_session to create one.`,
            },
          ],
          isError: true,
        };
      }

      if (session.ended_at) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Session ${sessionId} has already ended. Start a new session to continue logging.`,
            },
          ],
          isError: true,
        };
      }

      // Get next sequence number for this session
      const lastMessage = db
        .prepare(
          "SELECT MAX(sequence_number) as max_seq FROM conversation_messages WHERE session_id = ?"
        )
        .get(sessionId) as MaxSeqRow | undefined;
      const sequenceNumber = (lastMessage?.max_seq || 0) + 1;

      // Compute content hash for tamper detection
      const contentHash = computeContentHash(content, sessionId);

      // Detect potential secrets
      const hasPotentialSecrets = containsSecrets(content);

      const id = randomUUID();
      const now = new Date().toISOString();
      const toolCallsJson = toolCalls ? JSON.stringify(toolCalls) : null;

      try {
        db.prepare(
          `
          INSERT INTO conversation_messages
          (id, session_id, role, content, content_hash, tool_calls, token_count, model_id, sequence_number, contains_potential_secrets, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        ).run(
          id,
          sessionId,
          role,
          content,
          contentHash,
          toolCallsJson,
          tokenCount || null,
          modelId || null,
          sequenceNumber,
          hasPotentialSecrets ? 1 : 0,
          now
        );

        log.info(
          `Logged ${role} message to session ${sessionId} (seq: ${sequenceNumber}${hasPotentialSecrets ? ", SECRETS DETECTED" : ""})`
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `## Message Logged

**Message ID:** ${id}
**Session:** ${sessionId}
**Role:** ${role}
**Sequence:** ${sequenceNumber}
**Content Hash:** ${contentHash}
${hasPotentialSecrets ? "**⚠️ Potential Secrets Detected:** Yes" : ""}
${tokenCount ? `**Tokens:** ${tokenCount}` : ""}
${modelId ? `**Model:** ${modelId}` : ""}
**Logged:** ${now}`,
            },
          ],
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log.error(`Failed to log conversation message: ${errorMsg}`);
        return {
          content: [{ type: "text" as const, text: `Failed to log message: ${errorMsg}` }],
          isError: true,
        };
      }
    }
  );

  // ============================================
  // end_conversation_session
  // ============================================
  server.tool(
    "end_conversation_session",
    `End a conversation session and prevent further message logging.

Marks a session as complete by setting the ended_at timestamp. After ending,
no more messages can be logged to this session.

Use this when a conversation is complete to finalize the audit trail.

Args:
  sessionId (required): The session ID to end

Returns the ended session with a summary including total message count.
If the session was already ended, returns current state without error.`,
    {
      sessionId: z.string().describe("Session ID to end"),
    },
    async ({ sessionId }: { sessionId: string }) => {
      // Validate session exists
      const session = db
        .prepare("SELECT * FROM conversation_sessions WHERE id = ?")
        .get(sessionId) as DbConversationSessionRow | undefined;
      if (!session) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Session not found: ${sessionId}. Use list_projects to see available sessions.`,
            },
          ],
          isError: true,
        };
      }

      // If already ended, return current state without error
      if (session.ended_at) {
        const countRow = db
          .prepare("SELECT COUNT(*) as count FROM conversation_messages WHERE session_id = ?")
          .get(sessionId) as CountRow | undefined;
        const messageCount = countRow?.count || 0;

        return {
          content: [
            {
              type: "text" as const,
              text: `## Session Already Ended

**Session ID:** ${sessionId}
**Ended:** ${session.ended_at}
**Total Messages:** ${messageCount}

This session was already ended. No changes made.`,
            },
          ],
        };
      }

      const now = new Date().toISOString();

      try {
        db.prepare("UPDATE conversation_sessions SET ended_at = ? WHERE id = ?").run(
          now,
          sessionId
        );

        const countRow = db
          .prepare("SELECT COUNT(*) as count FROM conversation_messages WHERE session_id = ?")
          .get(sessionId) as CountRow | undefined;
        const messageCount = countRow?.count || 0;

        const updatedSession = db
          .prepare("SELECT * FROM conversation_sessions WHERE id = ?")
          .get(sessionId) as DbConversationSessionRow;
        log.info(`Ended conversation session ${sessionId} (messages: ${messageCount})`);

        return {
          content: [
            {
              type: "text" as const,
              text: `## Session Ended

**Session ID:** ${sessionId}
**Started:** ${session.started_at}
**Ended:** ${now}
**Total Messages:** ${messageCount}
**Environment:** ${session.environment}
**Classification:** ${session.data_classification}

This session is now closed. No further messages can be logged.

\`\`\`json
${JSON.stringify(updatedSession, null, 2)}
\`\`\``,
            },
          ],
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log.error(`Failed to end conversation session: ${errorMsg}`);
        return {
          content: [{ type: "text" as const, text: `Failed to end session: ${errorMsg}` }],
          isError: true,
        };
      }
    }
  );

  // ============================================
  // list_conversation_sessions
  // ============================================
  server.tool(
    "list_conversation_sessions",
    `List conversation sessions with optional filters.

Query sessions with flexible filtering by project, ticket, environment, date range,
and active status. Each session includes a message count for context.

Args:
  projectId (optional): Filter by project ID
  ticketId (optional): Filter by ticket ID
  environment (optional): Filter by environment (claude-code, vscode, unknown)
  startDate (optional): Sessions started on or after this date (ISO format)
  endDate (optional): Sessions started on or before this date (ISO format)
  includeActive (optional, default true): Include sessions that haven't ended
  limit (optional, default 50, max 200): Maximum results to return

Returns array of sessions with message counts, sorted by started_at descending.`,
    {
      projectId: z.string().optional().describe("Filter by project ID"),
      ticketId: z.string().optional().describe("Filter by ticket ID"),
      environment: z
        .string()
        .optional()
        .describe("Filter by environment (claude-code, vscode, unknown)"),
      startDate: z
        .string()
        .optional()
        .describe("Sessions started on or after this date (ISO format)"),
      endDate: z
        .string()
        .optional()
        .describe("Sessions started on or before this date (ISO format)"),
      includeActive: z
        .boolean()
        .optional()
        .describe("Include sessions that haven't ended (default: true)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Maximum results (default: 50, max: 200)"),
    },
    async ({
      projectId,
      ticketId,
      environment,
      startDate,
      endDate,
      includeActive = true,
      limit = 50,
    }: {
      projectId?: string | undefined;
      ticketId?: string | undefined;
      environment?: string | undefined;
      startDate?: string | undefined;
      endDate?: string | undefined;
      includeActive?: boolean | undefined;
      limit?: number | undefined;
    }) => {
      try {
        // Build dynamic WHERE clause
        const conditions: string[] = [];
        const params: (string | number)[] = [];

        if (projectId) {
          conditions.push("cs.project_id = ?");
          params.push(projectId);
        }

        if (ticketId) {
          conditions.push("cs.ticket_id = ?");
          params.push(ticketId);
        }

        if (environment) {
          conditions.push("cs.environment = ?");
          params.push(environment);
        }

        if (startDate) {
          conditions.push("cs.started_at >= ?");
          params.push(startDate);
        }

        if (endDate) {
          conditions.push("cs.started_at <= ?");
          params.push(endDate);
        }

        if (!includeActive) {
          conditions.push("cs.ended_at IS NOT NULL");
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        // Query with message count subquery and optional JOINs for names
        const query = `
          SELECT
            cs.*,
            p.name as project_name,
            t.title as ticket_title,
            (SELECT COUNT(*) FROM conversation_messages cm WHERE cm.session_id = cs.id) as message_count
          FROM conversation_sessions cs
          LEFT JOIN projects p ON cs.project_id = p.id
          LEFT JOIN tickets t ON cs.ticket_id = t.id
          ${whereClause}
          ORDER BY cs.started_at DESC
          LIMIT ?
        `;

        params.push(limit);

        const sessions = db.prepare(query).all(...params) as DbConversationSessionJoinedRow[];

        log.info(
          `Listed ${sessions.length} conversation sessions (filters: project=${projectId || "any"}, ticket=${ticketId || "any"}, env=${environment || "any"})`
        );

        // Format response
        const sessionList = sessions.map((s) => ({
          id: s.id,
          projectId: s.project_id,
          projectName: s.project_name,
          ticketId: s.ticket_id,
          ticketTitle: s.ticket_title,
          userId: s.user_id,
          environment: s.environment,
          dataClassification: s.data_classification,
          messageCount: s.message_count,
          startedAt: s.started_at,
          endedAt: s.ended_at,
          isActive: !s.ended_at,
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: `## Conversation Sessions

**Found:** ${sessions.length} session${sessions.length !== 1 ? "s" : ""}
${projectId ? `**Project Filter:** ${projectId}` : ""}
${ticketId ? `**Ticket Filter:** ${ticketId}` : ""}
${environment ? `**Environment Filter:** ${environment}` : ""}
${startDate ? `**Start Date:** ${startDate}` : ""}
${endDate ? `**End Date:** ${endDate}` : ""}

\`\`\`json
${JSON.stringify(sessionList, null, 2)}
\`\`\``,
            },
          ],
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log.error(`Failed to list conversation sessions: ${errorMsg}`);
        return {
          content: [{ type: "text" as const, text: `Failed to list sessions: ${errorMsg}` }],
          isError: true,
        };
      }
    }
  );

  // ============================================
  // export_compliance_logs
  // ============================================
  server.tool(
    "export_compliance_logs",
    `Export conversation logs for compliance auditing.

Generates a JSON export with full session and message data, integrity verification,
and audit trail logging. Designed for SOC2, GDPR, and ISO 27001 compliance reviews.

Args:
  sessionId (optional): Export a specific session
  projectId (optional): Export all sessions for a project
  startDate (required): Start of date range (ISO format)
  endDate (required): End of date range (ISO format)
  includeContent (optional, default true): Include full message text
  verifyIntegrity (optional, default true): Recompute and verify HMAC hashes

Returns structured JSON with:
- exportMetadata: Export timestamp, date range, session count
- integrityReport: Hash verification results (if enabled)
- sessions: Full session data with nested messages

Access to this tool is logged to the audit_log_access table.`,
    {
      sessionId: z.string().optional().describe("Export a specific session by ID"),
      projectId: z.string().optional().describe("Export all sessions for a project"),
      startDate: z.string().describe("Start of date range (ISO format)"),
      endDate: z.string().describe("End of date range (ISO format)"),
      includeContent: z.boolean().optional().describe("Include full message text (default: true)"),
      verifyIntegrity: z.boolean().optional().describe("Verify HMAC hashes (default: true)"),
    },
    async ({
      sessionId: filterSessionId,
      projectId: filterProjectId,
      startDate,
      endDate,
      includeContent = true,
      verifyIntegrity = true,
    }: {
      sessionId?: string | undefined;
      projectId?: string | undefined;
      startDate: string;
      endDate: string;
      includeContent?: boolean | undefined;
      verifyIntegrity?: boolean | undefined;
    }) => {
      const exportId = randomUUID();
      const exportedAt = new Date().toISOString();

      try {
        // Build session query
        const conditions = ["cs.started_at >= ?", "cs.started_at <= ?"];
        const params: string[] = [startDate, endDate];

        if (filterSessionId) {
          conditions.push("cs.id = ?");
          params.push(filterSessionId);
        }

        if (filterProjectId) {
          conditions.push("cs.project_id = ?");
          params.push(filterProjectId);
        }

        const sessionsQuery = `
          SELECT
            cs.*,
            p.name as project_name,
            t.title as ticket_title
          FROM conversation_sessions cs
          LEFT JOIN projects p ON cs.project_id = p.id
          LEFT JOIN tickets t ON cs.ticket_id = t.id
          WHERE ${conditions.join(" AND ")}
          ORDER BY cs.started_at ASC
        `;

        const sessions = db
          .prepare(sessionsQuery)
          .all(...params) as DbConversationSessionJoinedRow[];

        if (sessions.length === 0) {
          // Log access even when no results
          db.prepare(
            `
            INSERT INTO audit_log_access (id, accessor_id, target_type, target_id, action, result, accessed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `
          ).run(
            exportId,
            "system",
            "compliance_export",
            exportId,
            "export",
            "no_sessions_found",
            exportedAt
          );

          return {
            content: [
              {
                type: "text" as const,
                text: `## Compliance Export

**Export ID:** ${exportId}
**Date Range:** ${startDate} to ${endDate}
**Sessions Found:** 0

No sessions found matching the specified criteria.`,
              },
            ],
          };
        }

        // Collect messages and verify integrity
        let totalMessages = 0;
        let validMessages = 0;
        const invalidMessageIds: string[] = [];

        const exportedSessions = sessions.map((session) => {
          const messages = db
            .prepare(
              "SELECT * FROM conversation_messages WHERE session_id = ? ORDER BY sequence_number ASC"
            )
            .all(session.id) as DbConversationMessageRow[];

          const processedMessages = messages.map((msg) => {
            totalMessages++;

            // Verify integrity if enabled
            let integrityValid: boolean | null = null;
            if (verifyIntegrity) {
              const expectedHash = computeContentHash(msg.content, session.id);
              integrityValid = expectedHash === msg.content_hash;
              if (integrityValid) {
                validMessages++;
              } else {
                invalidMessageIds.push(msg.id);
              }
            }

            return {
              id: msg.id,
              role: msg.role,
              content: includeContent ? msg.content : "[REDACTED]",
              contentHash: msg.content_hash,
              integrityValid,
              toolCalls: msg.tool_calls ? JSON.parse(msg.tool_calls) : null,
              tokenCount: msg.token_count,
              modelId: msg.model_id,
              sequenceNumber: msg.sequence_number,
              containsPotentialSecrets: !!msg.contains_potential_secrets,
              createdAt: msg.created_at,
            };
          });

          return {
            id: session.id,
            projectId: session.project_id,
            projectName: session.project_name,
            ticketId: session.ticket_id,
            ticketTitle: session.ticket_title,
            userId: session.user_id,
            environment: session.environment,
            dataClassification: session.data_classification,
            legalHold: !!session.legal_hold,
            sessionMetadata: session.session_metadata ? JSON.parse(session.session_metadata) : null,
            startedAt: session.started_at,
            endedAt: session.ended_at,
            messages: processedMessages,
          };
        });

        // Build export structure
        const exportData = {
          exportMetadata: {
            exportId,
            exportedAt,
            dateRange: { startDate, endDate },
            sessionCount: sessions.length,
            messageCount: totalMessages,
            includeContent,
            verifyIntegrity,
          },
          integrityReport: verifyIntegrity
            ? {
                totalMessages,
                validMessages,
                invalidMessages: totalMessages - validMessages,
                invalidMessageIds,
                integrityPassed: invalidMessageIds.length === 0,
              }
            : null,
          sessions: exportedSessions,
        };

        // Log successful export to audit table
        db.prepare(
          `
          INSERT INTO audit_log_access (id, accessor_id, target_type, target_id, action, result, accessed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `
        ).run(
          exportId,
          "system",
          "compliance_export",
          filterSessionId || filterProjectId || "date_range",
          "export",
          `exported_${sessions.length}_sessions_${totalMessages}_messages`,
          exportedAt
        );

        log.info(
          `Exported compliance logs: ${sessions.length} sessions, ${totalMessages} messages (integrity: ${verifyIntegrity ? (invalidMessageIds.length === 0 ? "PASSED" : "FAILED") : "SKIPPED"})`
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `## Compliance Export Complete

**Export ID:** ${exportId}
**Date Range:** ${startDate} to ${endDate}
**Sessions:** ${sessions.length}
**Messages:** ${totalMessages}
${
  verifyIntegrity
    ? `
**Integrity Check:** ${invalidMessageIds.length === 0 ? "✅ PASSED" : "⚠️ FAILED"}
**Valid Messages:** ${validMessages}/${totalMessages}
${invalidMessageIds.length > 0 ? `**Invalid Message IDs:** ${invalidMessageIds.join(", ")}` : ""}
`
    : "**Integrity Check:** Skipped"
}

\`\`\`json
${JSON.stringify(exportData, null, 2)}
\`\`\``,
            },
          ],
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        // Log failed export attempt
        try {
          db.prepare(
            `
            INSERT INTO audit_log_access (id, accessor_id, target_type, target_id, action, result, accessed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `
          ).run(
            exportId,
            "system",
            "compliance_export",
            filterSessionId || filterProjectId || "date_range",
            "export",
            `error: ${errorMsg}`,
            exportedAt
          );
        } catch {
          // Ignore audit logging errors
        }

        log.error(`Failed to export compliance logs: ${errorMsg}`);
        return {
          content: [
            { type: "text" as const, text: `Failed to export compliance logs: ${errorMsg}` },
          ],
          isError: true,
        };
      }
    }
  );

  // ============================================
  // archive_old_sessions
  // ============================================
  server.tool(
    "archive_old_sessions",
    `Archive (delete) conversation sessions older than the retention period.

Implements data retention policy by deleting sessions older than the specified
retention period. Sessions with legal_hold=true are NEVER deleted.

SAFETY: This tool performs a DRY RUN by default, showing what would be deleted.
Set confirm=true to actually delete sessions.

Args:
  retentionDays (optional): Days to retain sessions (default: from settings or 90)
  confirm (optional, default false): Set to true to actually delete

Returns:
  - Dry-run mode: Preview of sessions that would be deleted
  - Confirm mode: Summary of deleted sessions and messages

IMPORTANT: Sessions under legal hold are always preserved regardless of age.
All deletion actions are logged to the audit_log_access table.`,
    {
      retentionDays: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Days to retain sessions (default: from settings or 90)"),
      confirm: z
        .boolean()
        .optional()
        .describe("Set to true to actually delete (default: false, dry-run)"),
    },
    async ({
      retentionDays,
      confirm = false,
    }: {
      retentionDays?: number | undefined;
      confirm?: boolean | undefined;
    }) => {
      const archiveId = randomUUID();
      const archivedAt = new Date().toISOString();

      try {
        // Get retention days from settings if not specified
        let effectiveRetention = retentionDays;
        if (!effectiveRetention) {
          const settings = db
            .prepare("SELECT conversation_retention_days FROM settings LIMIT 1")
            .get() as SettingsRetentionRow | undefined;
          effectiveRetention = settings?.conversation_retention_days || 90;
        }

        // Calculate cutoff date
        const cutoffDate = new Date(
          Date.now() - effectiveRetention * 24 * 60 * 60 * 1000
        ).toISOString();

        // Find sessions older than cutoff that are NOT under legal hold
        const sessionsToDelete = db
          .prepare(
            `
          SELECT
            cs.id,
            cs.project_id,
            cs.ticket_id,
            cs.environment,
            cs.data_classification,
            cs.started_at,
            cs.ended_at,
            p.name as project_name,
            (SELECT COUNT(*) FROM conversation_messages cm WHERE cm.session_id = cs.id) as message_count
          FROM conversation_sessions cs
          LEFT JOIN projects p ON cs.project_id = p.id
          WHERE cs.started_at < ? AND cs.legal_hold = 0
          ORDER BY cs.started_at ASC
        `
          )
          .all(cutoffDate) as ArchiveSessionRow[];

        // Count sessions under legal hold (for reporting)
        const legalHoldRow = db
          .prepare(
            `
          SELECT COUNT(*) as count FROM conversation_sessions
          WHERE started_at < ? AND legal_hold = 1
        `
          )
          .get(cutoffDate) as CountRow | undefined;
        const legalHoldCount = legalHoldRow?.count || 0;

        const totalMessages = sessionsToDelete.reduce((sum, s) => sum + s.message_count, 0);

        if (sessionsToDelete.length === 0) {
          // Log the check even if nothing to delete
          db.prepare(
            `
            INSERT INTO audit_log_access (id, accessor_id, target_type, target_id, action, result, accessed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `
          ).run(
            archiveId,
            "system",
            "retention_cleanup",
            "none",
            confirm ? "delete" : "dry_run",
            "no_sessions_eligible",
            archivedAt
          );

          return {
            content: [
              {
                type: "text" as const,
                text: `## Retention Cleanup

**Archive ID:** ${archiveId}
**Retention Period:** ${effectiveRetention} days
**Cutoff Date:** ${cutoffDate}
**Mode:** ${confirm ? "DELETE" : "DRY RUN"}

**Eligible Sessions:** 0
**Sessions Under Legal Hold:** ${legalHoldCount}

No sessions eligible for archival.${legalHoldCount > 0 ? ` ${legalHoldCount} session(s) are older than the retention period but protected by legal hold.` : ""}`,
              },
            ],
          };
        }

        // DRY RUN: Show preview
        if (!confirm) {
          db.prepare(
            `
            INSERT INTO audit_log_access (id, accessor_id, target_type, target_id, action, result, accessed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `
          ).run(
            archiveId,
            "system",
            "retention_cleanup",
            "preview",
            "dry_run",
            `preview_${sessionsToDelete.length}_sessions_${totalMessages}_messages`,
            archivedAt
          );

          const sessionPreview = sessionsToDelete.map((s) => ({
            id: s.id,
            projectName: s.project_name,
            environment: s.environment,
            classification: s.data_classification,
            messageCount: s.message_count,
            startedAt: s.started_at,
            endedAt: s.ended_at,
          }));

          log.info(
            `Retention dry-run: ${sessionsToDelete.length} sessions (${totalMessages} messages) eligible for deletion`
          );

          return {
            content: [
              {
                type: "text" as const,
                text: `## Retention Cleanup - DRY RUN

**Archive ID:** ${archiveId}
**Retention Period:** ${effectiveRetention} days
**Cutoff Date:** ${cutoffDate}

**Sessions to Delete:** ${sessionsToDelete.length}
**Messages to Delete:** ${totalMessages}
**Sessions Under Legal Hold:** ${legalHoldCount} (protected)

⚠️ This is a preview. No data has been deleted.
To delete these sessions, run again with \`confirm: true\`.

### Sessions Eligible for Deletion

\`\`\`json
${JSON.stringify(sessionPreview, null, 2)}
\`\`\``,
              },
            ],
          };
        }

        // CONFIRM: Actually delete
        const sessionIds = sessionsToDelete.map((s) => s.id);

        // Use transaction for atomic deletion
        const deleteTransaction = db.transaction(() => {
          const placeholders = sessionIds.map(() => "?").join(",");

          const deletedMessages = db
            .prepare(`DELETE FROM conversation_messages WHERE session_id IN (${placeholders})`)
            .run(...sessionIds);

          const deletedSessions = db
            .prepare(`DELETE FROM conversation_sessions WHERE id IN (${placeholders})`)
            .run(...sessionIds);

          return {
            messagesDeleted: deletedMessages.changes,
            sessionsDeleted: deletedSessions.changes,
          };
        });

        const result = deleteTransaction();

        // Log the deletion
        db.prepare(
          `
          INSERT INTO audit_log_access (id, accessor_id, target_type, target_id, action, result, accessed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `
        ).run(
          archiveId,
          "system",
          "retention_cleanup",
          sessionIds.join(","),
          "delete",
          `deleted_${result.sessionsDeleted}_sessions_${result.messagesDeleted}_messages`,
          archivedAt
        );

        log.info(
          `Retention cleanup: deleted ${result.sessionsDeleted} sessions and ${result.messagesDeleted} messages (retention: ${effectiveRetention} days)`
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `## Retention Cleanup Complete

**Archive ID:** ${archiveId}
**Retention Period:** ${effectiveRetention} days
**Cutoff Date:** ${cutoffDate}

**Sessions Deleted:** ${result.sessionsDeleted}
**Messages Deleted:** ${result.messagesDeleted}
**Sessions Under Legal Hold:** ${legalHoldCount} (preserved)

✅ Archived sessions have been permanently deleted.
This action has been logged for compliance auditing.`,
            },
          ],
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        // Log failed archive attempt
        try {
          db.prepare(
            `
            INSERT INTO audit_log_access (id, accessor_id, target_type, target_id, action, result, accessed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `
          ).run(
            archiveId,
            "system",
            "retention_cleanup",
            "error",
            confirm ? "delete" : "dry_run",
            `error: ${errorMsg}`,
            archivedAt
          );
        } catch {
          // Ignore audit logging errors
        }

        log.error(`Failed to archive old sessions: ${errorMsg}`);
        return {
          content: [{ type: "text" as const, text: `Failed to archive sessions: ${errorMsg}` }],
          isError: true,
        };
      }
    }
  );
}
