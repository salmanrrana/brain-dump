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
export function detectContext(db, options = {}) {
  const { ticketId, projectId, sessionId } = options;

  // Try to find active ticket if not provided
  let activeTicketId = ticketId;
  let activeTicket = null;
  let activeProject = null;
  let activeSession = null;

  // Step 1: Check for active session
  if (sessionId) {
    try {
      activeSession = db
        .prepare(
          `SELECT * FROM conversation_sessions
           WHERE id = ? AND ended_at IS NULL LIMIT 1`
        )
        .get(sessionId);

      if (activeSession) {
        activeTicketId = activeSession.ticket_id;
      }
    } catch (err) {
      log.debug(`Session lookup failed (expected if table doesn't exist): ${err.message}`);
    }
  }

  // Step 2: Look up ticket and its status
  if (activeTicketId) {
    try {
      activeTicket = db
        .prepare(
          `SELECT t.*, p.id as project_id
           FROM tickets t
           LEFT JOIN projects p ON t.project_id = p.id
           WHERE t.id = ? LIMIT 1`
        )
        .get(activeTicketId);
    } catch (err) {
      log.debug(`Ticket lookup failed: ${err.message}`);
    }
  }

  // Step 3: Look up project if we have a project ID
  const effectiveProjectId = activeTicket?.project_id || projectId;
  if (effectiveProjectId) {
    try {
      activeProject = db
        .prepare("SELECT * FROM projects WHERE id = ? LIMIT 1")
        .get(effectiveProjectId);
    } catch (err) {
      log.debug(`Project lookup failed: ${err.message}`);
    }
  }

  // Step 4: Determine context based on ticket status
  if (activeTicket) {
    const { status, id: ticketId } = activeTicket;

    if (status === "in_progress") {
      return {
        type: "ticket_work",
        ticketId,
        projectId: effectiveProjectId,
        status,
        description: "Active ticket implementation",
        metadata: {
          ticket: activeTicket,
          project: activeProject,
          session: activeSession,
          stateFile: {
            sessionId,
            ticketId,
            currentState: "implementing",
          },
        },
      };
    }

    if (status === "ai_review" || status === "human_review") {
      return {
        type: "review",
        ticketId,
        projectId: effectiveProjectId,
        status,
        description: "Code review phase",
        metadata: {
          ticket: activeTicket,
          project: activeProject,
          session: activeSession,
          reviewPhase: status === "ai_review" ? "automated" : "manual",
          stateFile: {
            sessionId,
            ticketId,
            currentState: "reviewing",
          },
        },
      };
    }

    if (status === "backlog" || status === "ready") {
      return {
        type: "planning",
        ticketId,
        projectId: effectiveProjectId,
        status,
        description: "Ticket planning/readiness",
        metadata: {
          ticket: activeTicket,
          project: activeProject,
          session: activeSession,
          readinessLevel: status === "ready" ? "ready_to_work" : "needs_planning",
          stateFile: {
            sessionId,
            ticketId,
            currentState: "planning",
          },
        },
      };
    }

    if (status === "done") {
      return {
        type: "admin",
        ticketId,
        projectId: effectiveProjectId,
        status,
        description: "Ticket completed - administrative context",
        metadata: {
          ticket: activeTicket,
          project: activeProject,
          session: activeSession,
          stateFile: {
            sessionId,
            ticketId,
            currentState: "complete",
          },
        },
      };
    }
  }

  // Step 5: Default to admin context if no active ticket
  return {
    type: "admin",
    projectId: effectiveProjectId,
    description: "Administrative/setup context",
    metadata: {
      project: activeProject,
      session: activeSession,
      reason: "no_active_ticket",
      stateFile: {
        sessionId,
        currentState: "admin",
      },
    },
  };
}

/**
 * Get all currently active contexts across all sessions.
 * Useful for understanding system state and multi-window workflows.
 *
 * @param {import("better-sqlite3").Database} db
 * @returns {Array<Object>} List of active contexts with their details
 */
export function detectAllActiveContexts(db) {
  const activeContexts = [];

  try {
    // Find all active sessions
    const activeSessions = db
      .prepare(
        `SELECT DISTINCT session_id, ticket_id, project_id
         FROM conversation_sessions
         WHERE ended_at IS NULL`
      )
      .all();

    for (const session of activeSessions) {
      const context = detectContext(db, {
        sessionId: session.session_id,
        ticketId: session.ticket_id,
        projectId: session.project_id,
      });
      activeContexts.push(context);
    }
  } catch (err) {
    log.debug(`Failed to detect all active contexts: ${err.message}`);
  }

  return activeContexts;
}

/**
 * Determine if a given context is suitable for a particular tool category.
 * Used by tool filtering to determine visibility.
 *
 * @param {Object} context - Context object from detectContext()
 * @param {string} toolCategory - Tool category to check (e.g., 'ticket_work', 'planning', 'review', 'admin')
 * @returns {boolean} True if tool category is relevant to context
 */
export function isContextRelevant(context, toolCategory) {
  if (!context || !toolCategory) return false;

  const contextType = context.type || "idle";

  // Map context types to relevant tool categories
  const categoryMap = {
    ticket_work: ["ticket_work", "code", "testing", "git", "general"],
    planning: ["planning", "ticket_management", "general"],
    review: ["review", "code", "testing", "general"],
    admin: ["admin", "settings", "general", "project_management"],
    idle: ["general", "admin"],
  };

  const relevantCategories = categoryMap[contextType] || [];
  return relevantCategories.includes(toolCategory);
}

/**
 * Get a human-readable summary of the current context.
 * Useful for logging and debugging context detection.
 *
 * @param {Object} context - Context object from detectContext()
 * @returns {string} Human-readable context summary
 */
export function getContextSummary(context) {
  if (!context) return "Unknown context";

  const { type, ticketId, projectId, status, description } = context;

  if (ticketId) {
    return `${type} context: Ticket ${ticketId} (${status}) in project ${projectId || "unknown"}`;
  }

  if (projectId) {
    return `${type} context: Project ${projectId}`;
  }

  return `${type} context: ${description || "No active work"}`;
}
