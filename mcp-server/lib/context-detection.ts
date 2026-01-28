/**
 * Context detection system for MCP server.
 * Detects active context (ticket_work, planning, review, admin) from ticket status,
 * session state, and project state.
 *
 * Context types:
 * - ticket_work: Active ticket implementation (status: in_progress)
 * - planning: Ticket planning/readiness (status: backlog, ready)
 * - review: Code review phase (status: ai_review, human_review)
 * - admin: Administrative/setup tasks (settings, project management)
 * - idle: No active context
 *
 * @module lib/context-detection
 */

import { log } from "./logging.js";

// Status constants for context detection
const TICKET_STATUSES = {
  IN_PROGRESS: "in_progress",
  AI_REVIEW: "ai_review",
  HUMAN_REVIEW: "human_review",
  BACKLOG: "backlog",
  READY: "ready",
  DONE: "done",
};

const CONTEXT_TYPES = {
  TICKET_WORK: "ticket_work",
  PLANNING: "planning",
  REVIEW: "review",
  ADMIN: "admin",
};

const STATE_NAMES = {
  IMPLEMENTING: "implementing",
  REVIEWING: "reviewing",
  PLANNING: "planning",
  COMPLETE: "complete",
  ADMIN: "admin",
};

/**
 * Detect the active context based on current session and ticket state.
 *
 * @param {import("better-sqlite3").Database} db
 * @param {Object} options
 * @param {string} [options.ticketId] - Current ticket ID if any
 * @param {string} [options.projectId] - Current project ID if any
 * @param {string} [options.sessionId] - Current session ID if any
 * @returns {Object} Context object with type and metadata
 */
export function detectContext(db: any, options: { ticketId?: string; projectId?: string; sessionId?: string } = {}): Record<string, any> {
  const { ticketId, projectId, sessionId } = options;

  let activeTicketId = ticketId;
  let activeTicket = null;
  let activeProject = null;
  let activeSession = null;

  // Check for active session
  if (sessionId) {
    activeSession = tryQueryDb(
      db,
      `SELECT * FROM conversation_sessions WHERE id = ? AND ended_at IS NULL LIMIT 1`,
      [sessionId],
      "Session lookup"
    );
    if (activeSession) {
      activeTicketId = activeSession.ticket_id;
    }
  }

  // Look up ticket and its status
  if (activeTicketId) {
    activeTicket = tryQueryDb(
      db,
      `SELECT t.*, p.id as project_id FROM tickets t
       LEFT JOIN projects p ON t.project_id = p.id WHERE t.id = ? LIMIT 1`,
      [activeTicketId],
      "Ticket lookup"
    );
  }

  // Look up project if we have a project ID
  const effectiveProjectId = activeTicket?.project_id || projectId;
  if (effectiveProjectId) {
    activeProject = tryQueryDb(
      db,
      "SELECT * FROM projects WHERE id = ? LIMIT 1",
      [effectiveProjectId],
      "Project lookup"
    );
  }

  // Determine context based on ticket status
  if (activeTicket) {
    const { status, id: currentTicketId } = activeTicket;

    switch (status) {
      case TICKET_STATUSES.IN_PROGRESS:
        return buildContext({
          type: CONTEXT_TYPES.TICKET_WORK,
          ticketId: currentTicketId,
          projectId: effectiveProjectId,
          status,
          description: "Active ticket implementation",
          currentState: STATE_NAMES.IMPLEMENTING,
          activeTicket,
          activeProject,
          activeSession,
          sessionId,
        });

      case TICKET_STATUSES.AI_REVIEW:
      case TICKET_STATUSES.HUMAN_REVIEW:
        return buildContext({
          type: CONTEXT_TYPES.REVIEW,
          ticketId: currentTicketId,
          projectId: effectiveProjectId,
          status,
          description: "Code review phase",
          currentState: STATE_NAMES.REVIEWING,
          reviewPhase: status === TICKET_STATUSES.AI_REVIEW ? "automated" : "manual",
          activeTicket,
          activeProject,
          activeSession,
          sessionId,
        });

      case TICKET_STATUSES.BACKLOG:
      case TICKET_STATUSES.READY:
        return buildContext({
          type: CONTEXT_TYPES.PLANNING,
          ticketId: currentTicketId,
          projectId: effectiveProjectId,
          status,
          description: "Ticket planning/readiness",
          currentState: STATE_NAMES.PLANNING,
          readinessLevel: status === TICKET_STATUSES.READY ? "ready_to_work" : "needs_planning",
          activeTicket,
          activeProject,
          activeSession,
          sessionId,
        });

      case TICKET_STATUSES.DONE:
        return buildContext({
          type: CONTEXT_TYPES.ADMIN,
          ticketId: currentTicketId,
          projectId: effectiveProjectId,
          status,
          description: "Ticket completed - administrative context",
          currentState: STATE_NAMES.COMPLETE,
          activeTicket,
          activeProject,
          activeSession,
          sessionId,
        });
    }
  }

  // Default to admin context if no active ticket
  return buildContext({
    type: CONTEXT_TYPES.ADMIN,
    projectId: effectiveProjectId,
    description: "Administrative/setup context",
    currentState: STATE_NAMES.ADMIN,
    reason: "no_active_ticket",
    activeProject,
    activeSession,
    sessionId,
  });
}

/**
 * Get all currently active contexts across all sessions.
 * Useful for understanding system state and multi-window workflows.
 *
 * @param {import("better-sqlite3").Database} db
 * @returns {Array<Object>} List of active contexts with their details
 */
export function detectAllActiveContexts(db: any): Array<Record<string, any>> {
  const activeSessions = tryQueryDbAll(
    db,
    `SELECT DISTINCT id, ticket_id, project_id FROM conversation_sessions WHERE ended_at IS NULL`,
    [],
    "Detect all active contexts"
  );

  if (!activeSessions || activeSessions.length === 0) {
    return [];
  }

  return activeSessions.map((session) =>
    detectContext(db, {
      sessionId: session.id,
      ticketId: session.ticket_id,
      projectId: session.project_id,
    })
  );
}

// Map context types to relevant tool categories
const TOOL_CATEGORY_MAP = {
  [CONTEXT_TYPES.TICKET_WORK]: ["ticket_work", "code", "testing", "git", "general"],
  [CONTEXT_TYPES.PLANNING]: ["planning", "ticket_management", "general"],
  [CONTEXT_TYPES.REVIEW]: ["review", "code", "testing", "general"],
  [CONTEXT_TYPES.ADMIN]: ["admin", "settings", "general", "project_management"],
  idle: ["general", "admin"],
};

/**
 * Determine if a given context is suitable for a particular tool category.
 * Used by tool filtering to determine visibility.
 *
 * @param {Object} context - Context object from detectContext()
 * @param {string} toolCategory - Tool category to check (e.g., 'ticket_work', 'planning', 'review', 'admin')
 * @returns {boolean} True if tool category is relevant to context
 */
export function isContextRelevant(context: any, toolCategory: any): boolean {
  if (!context || !toolCategory) return false;

  const contextType = context.type || "idle";
  const relevantCategories = TOOL_CATEGORY_MAP[contextType] || [];
  return relevantCategories.includes(toolCategory);
}

/**
 * Get a human-readable summary of the current context.
 * Useful for logging and debugging context detection.
 *
 * @param {Object} context - Context object from detectContext()
 * @returns {string} Human-readable context summary
 */
export function getContextSummary(context: any): string {
  if (!context) return "Unknown context";

  const { type, ticketId, projectId, status, description } = context;

  if (ticketId) {
    const project = projectId || "unknown";
    return `${type} context: Ticket ${ticketId} (${status}) in project ${project}`;
  }

  if (projectId) {
    return `${type} context: Project ${projectId}`;
  }

  return `${type} context: ${description || "No active work"}`;
}

/**
 * Safe database query wrapper with error handling.
 *
 * @param {import("better-sqlite3").Database} db
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @param {string} operation - Operation name for logging
 * @returns {Object|null} Single row query result or null on error
 * @private
 */
function tryQueryDb(db: any, sql: string, params: any[], operation: string): any {
  try {
    return db.prepare(sql).get(...params);
  } catch (err) {
    log.debug(`${operation} failed (expected if table doesn't exist): ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Safe database query wrapper for multiple rows with error handling.
 *
 * @param {import("better-sqlite3").Database} db
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @param {string} operation - Operation name for logging
 * @returns {Array<Object>} Array of rows, empty array on error
 * @private
 */
function tryQueryDbAll(db: any, sql: string, params: any[], operation: string): any[] {
  try {
    return db.prepare(sql).all(...params);
  } catch (err) {
    log.debug(`${operation} failed (expected if table doesn't exist): ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/**
 * Build a context object with common structure.
 *
 * @param {Object} options - Context options
 * @returns {Object} Formatted context object
 * @private
 */
function buildContext(options: any): Record<string, any> {
  const {
    type,
    ticketId,
    projectId,
    status,
    description,
    currentState,
    reviewPhase,
    readinessLevel,
    reason,
    activeTicket,
    activeProject,
    activeSession,
    sessionId,
  } = options;

  const baseContext: Record<string, any> = {
    type,
    description,
    metadata: {
      ticket: activeTicket || undefined,
      project: activeProject || undefined,
      session: activeSession || undefined,
      stateFile: {
        sessionId,
        currentState,
      },
    },
  };

  // Add optional fields
  if (ticketId) {
    baseContext.ticketId = ticketId;
    baseContext.status = status;
    baseContext.metadata.stateFile.ticketId = ticketId;
  }

  if (projectId) {
    baseContext.projectId = projectId;
  }

  if (reviewPhase) {
    baseContext.metadata.reviewPhase = reviewPhase;
  }

  if (readinessLevel) {
    baseContext.metadata.readinessLevel = readinessLevel;
  }

  if (reason) {
    baseContext.metadata.reason = reason;
  }

  return baseContext;
}
