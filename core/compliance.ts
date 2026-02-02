/**
 * Conversation logging / compliance business logic for the core layer.
 *
 * Extracted from mcp-server/tools/conversations.ts.
 * All functions take a DbHandle and return typed results or throw CoreError subclasses.
 */

import { randomUUID, createHmac } from "crypto";
import { hostname } from "os";
import type { DbHandle, DataClassification } from "./types.ts";
import {
  ValidationError,
  ProjectNotFoundError,
  TicketNotFoundError,
  SessionNotFoundError,
} from "./errors.ts";

// ============================================
// Constants
// ============================================

export const DATA_CLASSIFICATIONS = ["public", "internal", "confidential", "restricted"] as const;
export const MESSAGE_ROLES = ["user", "assistant", "system", "tool"] as const;

export type MessageRole = (typeof MESSAGE_ROLES)[number];

// ============================================
// Internal DB Row Types
// ============================================

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

interface DbConversationSessionJoinedRow extends DbConversationSessionRow {
  project_name: string | null;
  ticket_title: string | null;
  message_count: number;
}

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

interface MaxSeqRow {
  max_seq: number | null;
}

interface CountRow {
  count: number;
}

interface SettingsRetentionRow {
  conversation_retention_days: number;
}

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
// Dependencies (injected by callers)
// ============================================

export interface ComplianceDependencies {
  detectEnvironment: () => string;
  containsSecrets: (content: string) => boolean;
}

// ============================================
// Public Types
// ============================================

export interface StartConversationParams {
  projectId?: string;
  ticketId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  dataClassification?: DataClassification;
}

export interface ConversationSessionResult {
  id: string;
  environment: string;
  dataClassification: string;
  projectId: string | null;
  ticketId: string | null;
  userId: string | null;
  startedAt: string;
}

export interface LogMessageParams {
  sessionId: string;
  role: MessageRole;
  content: string;
  toolCalls?: Array<{
    name: string;
    parameters?: Record<string, unknown>;
    result?: unknown;
  }>;
  tokenCount?: number;
  modelId?: string;
}

export interface LogMessageResult {
  id: string;
  sessionId: string;
  role: string;
  sequenceNumber: number;
  contentHash: string;
  containsPotentialSecrets: boolean;
}

export interface EndConversationResult {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  messageCount: number;
  alreadyEnded: boolean;
}

export interface ListConversationsParams {
  projectId?: string;
  ticketId?: string;
  environment?: string;
  startDate?: string;
  endDate?: string;
  includeActive?: boolean;
  limit?: number;
}

export interface ConversationSessionSummary {
  id: string;
  projectId: string | null;
  projectName: string | null;
  ticketId: string | null;
  ticketTitle: string | null;
  userId: string | null;
  environment: string;
  dataClassification: string;
  messageCount: number;
  startedAt: string;
  endedAt: string | null;
  isActive: boolean;
}

export interface ExportParams {
  sessionId?: string;
  projectId?: string;
  startDate: string;
  endDate: string;
  includeContent?: boolean;
  verifyIntegrity?: boolean;
}

export interface ExportedMessage {
  id: string;
  role: string;
  content: string;
  contentHash: string;
  integrityValid: boolean | null;
  toolCalls: unknown;
  tokenCount: number | null;
  modelId: string | null;
  sequenceNumber: number;
  containsPotentialSecrets: boolean;
  createdAt: string;
}

export interface ExportedSession {
  id: string;
  projectId: string | null;
  projectName: string | null;
  ticketId: string | null;
  ticketTitle: string | null;
  userId: string | null;
  environment: string;
  dataClassification: string;
  legalHold: boolean;
  sessionMetadata: unknown;
  startedAt: string;
  endedAt: string | null;
  messages: ExportedMessage[];
}

export interface IntegrityReport {
  totalMessages: number;
  validMessages: number;
  invalidMessages: number;
  invalidMessageIds: string[];
  integrityPassed: boolean;
}

export interface ComplianceExport {
  exportMetadata: {
    exportId: string;
    exportedAt: string;
    dateRange: { startDate: string; endDate: string };
    sessionCount: number;
    messageCount: number;
    includeContent: boolean;
    verifyIntegrity: boolean;
  };
  integrityReport: IntegrityReport | null;
  sessions: ExportedSession[];
}

export interface ArchiveParams {
  retentionDays?: number;
  confirm?: boolean;
}

export interface ArchivePreview {
  dryRun: true;
  archiveId: string;
  retentionDays: number;
  cutoffDate: string;
  sessionsToDelete: number;
  messagesToDelete: number;
  legalHoldCount: number;
  sessions: Array<{
    id: string;
    projectName: string | null;
    environment: string;
    classification: string;
    messageCount: number;
    startedAt: string;
    endedAt: string | null;
  }>;
}

export interface ArchiveConfirmed {
  dryRun: false;
  archiveId: string;
  retentionDays: number;
  cutoffDate: string;
  sessionsDeleted: number;
  messagesDeleted: number;
  legalHoldCount: number;
}

export type ArchiveResult = ArchivePreview | ArchiveConfirmed;

// ============================================
// Internal Helpers
// ============================================

function computeContentHash(content: string, sessionId: string): string {
  const key = `brain-dump:${hostname()}:${sessionId}`;
  return createHmac("sha256", key).update(content).digest("hex");
}

function logAuditAccess(
  db: DbHandle,
  id: string,
  targetType: string,
  targetId: string,
  action: string,
  result: string
): void {
  try {
    db.prepare(
      `INSERT INTO audit_log_access (id, accessor_id, target_type, target_id, action, result, accessed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, "system", targetType, targetId, action, result, new Date().toISOString());
  } catch {
    // Audit logging errors are non-fatal
  }
}

// ============================================
// Public API
// ============================================

/**
 * Start a new conversation session for compliance logging.
 */
export function startConversation(
  db: DbHandle,
  params: StartConversationParams,
  deps: ComplianceDependencies
): ConversationSessionResult {
  const { projectId, ticketId, userId, metadata, dataClassification = "internal" } = params;

  if (projectId) {
    const project = db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId) as
      | { id: string }
      | undefined;
    if (!project) throw new ProjectNotFoundError(projectId);
  }

  if (ticketId) {
    const ticket = db.prepare("SELECT id FROM tickets WHERE id = ?").get(ticketId) as
      | { id: string }
      | undefined;
    if (!ticket) throw new TicketNotFoundError(ticketId);
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const environment = deps.detectEnvironment();
  const metadataJson = metadata ? JSON.stringify(metadata) : null;

  db.prepare(
    `INSERT INTO conversation_sessions
     (id, project_id, ticket_id, user_id, environment, session_metadata, data_classification, started_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
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

  return {
    id,
    environment,
    dataClassification,
    projectId: projectId || null,
    ticketId: ticketId || null,
    userId: userId || null,
    startedAt: now,
  };
}

/**
 * Log a message to an existing conversation session.
 */
export function logMessage(
  db: DbHandle,
  params: LogMessageParams,
  deps: ComplianceDependencies
): LogMessageResult {
  const { sessionId, role, content, toolCalls, tokenCount, modelId } = params;

  const session = db.prepare("SELECT * FROM conversation_sessions WHERE id = ?").get(sessionId) as
    | DbConversationSessionRow
    | undefined;

  if (!session) {
    throw new SessionNotFoundError(sessionId);
  }

  if (session.ended_at) {
    throw new ValidationError(
      `Session ${sessionId} has already ended. Start a new session to continue logging.`
    );
  }

  const lastMessage = db
    .prepare(
      "SELECT MAX(sequence_number) as max_seq FROM conversation_messages WHERE session_id = ?"
    )
    .get(sessionId) as MaxSeqRow | undefined;
  const sequenceNumber = (lastMessage?.max_seq || 0) + 1;

  const contentHash = computeContentHash(content, sessionId);
  const hasPotentialSecrets = deps.containsSecrets(content);

  const id = randomUUID();
  const now = new Date().toISOString();
  const toolCallsJson = toolCalls ? JSON.stringify(toolCalls) : null;

  db.prepare(
    `INSERT INTO conversation_messages
     (id, session_id, role, content, content_hash, tool_calls, token_count, model_id, sequence_number, contains_potential_secrets, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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

  return {
    id,
    sessionId,
    role,
    sequenceNumber,
    contentHash,
    containsPotentialSecrets: hasPotentialSecrets,
  };
}

/**
 * End a conversation session and prevent further message logging.
 */
export function endConversation(db: DbHandle, sessionId: string): EndConversationResult {
  const session = db.prepare("SELECT * FROM conversation_sessions WHERE id = ?").get(sessionId) as
    | DbConversationSessionRow
    | undefined;

  if (!session) {
    throw new SessionNotFoundError(sessionId);
  }

  const countRow = db
    .prepare("SELECT COUNT(*) as count FROM conversation_messages WHERE session_id = ?")
    .get(sessionId) as CountRow | undefined;
  const messageCount = countRow?.count || 0;

  if (session.ended_at) {
    return {
      sessionId,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      messageCount,
      alreadyEnded: true,
    };
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE conversation_sessions SET ended_at = ? WHERE id = ?").run(now, sessionId);

  return {
    sessionId,
    startedAt: session.started_at,
    endedAt: now,
    messageCount,
    alreadyEnded: false,
  };
}

/**
 * List conversation sessions with optional filters.
 */
export function listConversations(
  db: DbHandle,
  params: ListConversationsParams = {}
): ConversationSessionSummary[] {
  const {
    projectId,
    ticketId,
    environment,
    startDate,
    endDate,
    includeActive = true,
    limit = 50,
  } = params;

  const conditions: string[] = [];
  const queryParams: (string | number)[] = [];

  if (projectId) {
    conditions.push("cs.project_id = ?");
    queryParams.push(projectId);
  }
  if (ticketId) {
    conditions.push("cs.ticket_id = ?");
    queryParams.push(ticketId);
  }
  if (environment) {
    conditions.push("cs.environment = ?");
    queryParams.push(environment);
  }
  if (startDate) {
    conditions.push("cs.started_at >= ?");
    queryParams.push(startDate);
  }
  if (endDate) {
    conditions.push("cs.started_at <= ?");
    queryParams.push(endDate);
  }
  if (!includeActive) {
    conditions.push("cs.ended_at IS NOT NULL");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

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

  queryParams.push(limit);

  const sessions = db.prepare(query).all(...queryParams) as DbConversationSessionJoinedRow[];

  return sessions.map((s) => ({
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
}

/**
 * Export conversation logs for compliance auditing.
 */
export function exportComplianceLogs(db: DbHandle, params: ExportParams): ComplianceExport {
  const {
    sessionId: filterSessionId,
    projectId: filterProjectId,
    startDate,
    endDate,
    includeContent = true,
    verifyIntegrity = true,
  } = params;

  const exportId = randomUUID();
  const exportedAt = new Date().toISOString();

  const conditions = ["cs.started_at >= ?", "cs.started_at <= ?"];
  const queryParams: string[] = [startDate, endDate];

  if (filterSessionId) {
    conditions.push("cs.id = ?");
    queryParams.push(filterSessionId);
  }
  if (filterProjectId) {
    conditions.push("cs.project_id = ?");
    queryParams.push(filterProjectId);
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
    .all(...queryParams) as DbConversationSessionJoinedRow[];

  // Log access
  logAuditAccess(
    db,
    exportId,
    "compliance_export",
    filterSessionId || filterProjectId || "date_range",
    "export",
    sessions.length === 0 ? "no_sessions_found" : `exported_${sessions.length}_sessions`
  );

  let totalMessages = 0;
  let validMessages = 0;
  const invalidMessageIds: string[] = [];

  const exportedSessions: ExportedSession[] = sessions.map((session) => {
    const messages = db
      .prepare(
        "SELECT * FROM conversation_messages WHERE session_id = ? ORDER BY sequence_number ASC"
      )
      .all(session.id) as DbConversationMessageRow[];

    const processedMessages: ExportedMessage[] = messages.map((msg) => {
      totalMessages++;

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

  return {
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
}

/**
 * Archive (delete) conversation sessions older than the retention period.
 * Sessions with legal_hold=true are NEVER deleted.
 */
export function archiveOldSessions(db: DbHandle, params: ArchiveParams = {}): ArchiveResult {
  const { retentionDays, confirm = false } = params;
  const archiveId = randomUUID();

  // Get retention days from settings if not specified
  let effectiveRetention = retentionDays;
  if (!effectiveRetention) {
    const settings = db
      .prepare("SELECT conversation_retention_days FROM settings LIMIT 1")
      .get() as SettingsRetentionRow | undefined;
    effectiveRetention = settings?.conversation_retention_days || 90;
  }

  const cutoffDate = new Date(Date.now() - effectiveRetention * 24 * 60 * 60 * 1000).toISOString();

  const sessionsToDelete = db
    .prepare(
      `SELECT
         cs.id, cs.project_id, cs.ticket_id, cs.environment,
         cs.data_classification, cs.started_at, cs.ended_at,
         p.name as project_name,
         (SELECT COUNT(*) FROM conversation_messages cm WHERE cm.session_id = cs.id) as message_count
       FROM conversation_sessions cs
       LEFT JOIN projects p ON cs.project_id = p.id
       WHERE cs.started_at < ? AND cs.legal_hold = 0
       ORDER BY cs.started_at ASC`
    )
    .all(cutoffDate) as ArchiveSessionRow[];

  const legalHoldRow = db
    .prepare(
      "SELECT COUNT(*) as count FROM conversation_sessions WHERE started_at < ? AND legal_hold = 1"
    )
    .get(cutoffDate) as CountRow | undefined;
  const legalHoldCount = legalHoldRow?.count || 0;

  const totalMessages = sessionsToDelete.reduce((sum, s) => sum + s.message_count, 0);

  if (sessionsToDelete.length === 0) {
    logAuditAccess(
      db,
      archiveId,
      "retention_cleanup",
      "none",
      confirm ? "delete" : "dry_run",
      "no_sessions_eligible"
    );

    // Return a "nothing to do" preview
    if (!confirm) {
      return {
        dryRun: true,
        archiveId,
        retentionDays: effectiveRetention,
        cutoffDate,
        sessionsToDelete: 0,
        messagesToDelete: 0,
        legalHoldCount,
        sessions: [],
      };
    }
    return {
      dryRun: false,
      archiveId,
      retentionDays: effectiveRetention,
      cutoffDate,
      sessionsDeleted: 0,
      messagesDeleted: 0,
      legalHoldCount,
    };
  }

  // DRY RUN
  if (!confirm) {
    logAuditAccess(
      db,
      archiveId,
      "retention_cleanup",
      "preview",
      "dry_run",
      `preview_${sessionsToDelete.length}_sessions_${totalMessages}_messages`
    );

    return {
      dryRun: true,
      archiveId,
      retentionDays: effectiveRetention,
      cutoffDate,
      sessionsToDelete: sessionsToDelete.length,
      messagesToDelete: totalMessages,
      legalHoldCount,
      sessions: sessionsToDelete.map((s) => ({
        id: s.id,
        projectName: s.project_name,
        environment: s.environment,
        classification: s.data_classification,
        messageCount: s.message_count,
        startedAt: s.started_at,
        endedAt: s.ended_at,
      })),
    };
  }

  // CONFIRM: Actually delete
  const sessionIds = sessionsToDelete.map((s) => s.id);

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

  logAuditAccess(
    db,
    archiveId,
    "retention_cleanup",
    sessionIds.join(","),
    "delete",
    `deleted_${result.sessionsDeleted}_sessions_${result.messagesDeleted}_messages`
  );

  return {
    dryRun: false,
    archiveId,
    retentionDays: effectiveRetention,
    cutoffDate,
    sessionsDeleted: result.sessionsDeleted,
    messagesDeleted: result.messagesDeleted,
    legalHoldCount,
  };
}
