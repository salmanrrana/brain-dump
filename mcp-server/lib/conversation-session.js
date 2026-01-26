/**
 * Conversation session management for Brain Dump MCP server.
 * Handles creating and ending conversation sessions for compliance logging.
 * @module lib/conversation-session
 */
import { randomUUID } from "crypto";
import { log } from "./logging.js";

/**
 * Create a conversation session for compliance logging.
 * Auto-links to project and ticket for context.
 * @param {import("better-sqlite3").Database} db
 * @param {string} ticketId
 * @param {string} projectId
 * @param {string} environment
 * @returns {{ success: boolean, sessionId?: string, error?: string }}
 */
export function createConversationSession(db, ticketId, projectId, environment) {
  const id = randomUUID();
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO conversation_sessions
      (id, project_id, ticket_id, environment, data_classification, started_at, created_at)
      VALUES (?, ?, ?, ?, 'internal', ?, ?)
    `).run(id, projectId, ticketId, environment, now, now);

    log.info(`Auto-created conversation session ${id} for ticket ${ticketId}`);
    return { success: true, sessionId: id };
  } catch (err) {
    log.error(`Failed to create conversation session for ticket ${ticketId}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * End any active conversation sessions for a ticket.
 * Sets ended_at timestamp and returns session summary.
 * @param {import("better-sqlite3").Database} db
 * @param {string} ticketId
 * @returns {{ success: boolean, sessionsEnded: number, messageCount?: number, error?: string }}
 */
export function endConversationSessions(db, ticketId) {
  const now = new Date().toISOString();

  try {
    // Find active sessions for this ticket
    const activeSessions = db.prepare(`
      SELECT id FROM conversation_sessions
      WHERE ticket_id = ? AND ended_at IS NULL
    `).all(ticketId);

    if (activeSessions.length === 0) {
      return { success: true, sessionsEnded: 0 };
    }

    // Count total messages across sessions
    const sessionIds = activeSessions.map(s => s.id);
    const messageCount = db.prepare(`
      SELECT COUNT(*) as count FROM conversation_messages
      WHERE session_id IN (${sessionIds.map(() => "?").join(",")})
    `).get(...sessionIds)?.count || 0;

    // End all active sessions
    db.prepare(`
      UPDATE conversation_sessions
      SET ended_at = ?
      WHERE ticket_id = ? AND ended_at IS NULL
    `).run(now, ticketId);

    log.info(`Auto-ended ${activeSessions.length} conversation session(s) for ticket ${ticketId} (${messageCount} messages)`);
    return { success: true, sessionsEnded: activeSessions.length, messageCount };
  } catch (err) {
    log.error(`Failed to end conversation sessions for ticket ${ticketId}: ${err.message}`);
    return { success: false, sessionsEnded: 0, error: err.message };
  }
}
