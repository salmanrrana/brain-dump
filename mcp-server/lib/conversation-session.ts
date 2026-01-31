/**
 * Conversation session management for Brain Dump MCP server.
 * Handles creating and ending conversation sessions for compliance logging.
 * @module lib/conversation-session
 */
import { randomUUID } from "crypto";
import { log } from "./logging.js";
import Database from "better-sqlite3";

// ============================================
// Type Definitions
// ============================================

/** Result from creating a conversation session */
interface CreateSessionResult {
  success: boolean;
  sessionId?: string;
  error?: string;
}

/** Session record from database */
interface SessionRecord {
  id: string;
}

/** Count result from query */
interface CountResult {
  count: number;
}

/** Result from ending conversation sessions */
interface EndSessionsResult {
  success: boolean;
  sessionsEnded: number;
  messageCount?: number;
  error?: string;
}

// ============================================
// Main Functions
// ============================================

/**
 * Create a conversation session for compliance logging.
 * Auto-links to project and ticket for context.
 */
export function createConversationSession(
  db: Database.Database,
  ticketId: string,
  projectId: string,
  environment: string
): CreateSessionResult {
  const id = randomUUID();
  const now = new Date().toISOString();

  try {
    db.prepare(
      `
      INSERT INTO conversation_sessions
      (id, project_id, ticket_id, environment, data_classification, started_at, created_at)
      VALUES (?, ?, ?, ?, 'internal', ?, ?)
    `
    ).run(id, projectId, ticketId, environment, now, now);

    log.info(
      `Auto-created conversation session ${id} for ticket ${ticketId}`
    );
    return { success: true, sessionId: id };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error(
      `Failed to create conversation session for ticket ${ticketId}: ${errorMsg}`
    );
    return { success: false, error: errorMsg };
  }
}

/**
 * End any active conversation sessions for a ticket.
 * Sets ended_at timestamp and returns session summary.
 */
export function endConversationSessions(
  db: Database.Database,
  ticketId: string
): EndSessionsResult {
  const now = new Date().toISOString();

  try {
    // Find active sessions for this ticket
    const activeSessions = db
      .prepare(
        `
      SELECT id FROM conversation_sessions
      WHERE ticket_id = ? AND ended_at IS NULL
    `
      )
      .all(ticketId) as SessionRecord[];

    if (activeSessions.length === 0) {
      return { success: true, sessionsEnded: 0 };
    }

    // Count total messages across sessions
    const sessionIds = activeSessions.map((s) => s.id);
    const messageCount = (
      db
        .prepare(
          `
      SELECT COUNT(*) as count FROM conversation_messages
      WHERE session_id IN (${sessionIds.map(() => "?").join(",")})
    `
        )
        .get(...sessionIds) as CountResult | undefined
    )?.count || 0;

    // End all active sessions
    db.prepare(
      `
      UPDATE conversation_sessions
      SET ended_at = ?
      WHERE ticket_id = ? AND ended_at IS NULL
    `
    ).run(now, ticketId);

    log.info(
      `Auto-ended ${activeSessions.length} conversation session(s) for ticket ${ticketId} (${messageCount} messages)`
    );
    return {
      success: true,
      sessionsEnded: activeSessions.length,
      messageCount,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error(
      `Failed to end conversation sessions for ticket ${ticketId}: ${errorMsg}`
    );
    return { success: false, sessionsEnded: 0, error: errorMsg };
  }
}
