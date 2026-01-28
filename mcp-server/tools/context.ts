/**
 * Context detection tools for Brain Dump MCP server.
 * Provides tools for detecting and querying active context (ticket_work, planning, review, admin).
 * @module tools/context
 */

import { z } from "zod";
import { log } from "../lib/logging.js";
import {
  detectContext,
  detectAllActiveContexts,
  isContextRelevant,
  getContextSummary,
} from "../lib/context-detection.js";

/**
 * Wrap response content in MCP format.
 *
 * @param {string} text - Response text content
 * @param {boolean} isError - Whether this is an error response
 * @returns {Object} MCP-formatted response
 */
function formatResponse(text: string, isError = false): Record<string, unknown> {
  const response: Record<string, unknown> = { content: [{ type: "text", text }] };
  if (isError) {
    response.isError = true;
  }
  return response;
}

/**
 * Execute tool handler with error handling and response formatting.
 *
 * @param {Function} handler - Handler function returning text content
 * @param {string} toolName - Name of the tool for error logging
 * @returns {Promise<Object>} MCP-formatted response
 */
async function executeWithErrorHandling(handler: () => Promise<string> | string, toolName: string = "unknown"): Promise<Record<string, unknown>> {
  try {
    const text = await handler();
    return formatResponse(text);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorType = err?.constructor?.name || "Unknown";

    // Programming errors indicate bugs in the tool implementation
    if (err instanceof TypeError || err instanceof ReferenceError) {
      log.error(`Tool bug in ${toolName}: ${errorType}: ${errorMessage}`, err instanceof Error ? err : new Error(String(err)));
      return formatResponse(`Internal tool error in ${toolName}: ${errorMessage}. This is a bug - please report it.`, true);
    }

    // All other errors - operational failures
    log.error(`Tool execution failed in ${toolName}: ${errorMessage}`, err instanceof Error ? err : new Error(String(err)));
    return formatResponse(`Failed to execute ${toolName}: ${errorMessage}`, true);
  }
}

/**
 * Register context tools with the MCP server.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {import("better-sqlite3").Database} db
 */
export function registerContextTools(server: any, db: any): void {
  // detect_context tool
  server.tool(
    "detect_context",
    `Detect the active context based on current session and ticket state.

Returns the active context type (ticket_work, planning, review, admin) and metadata
about the current ticket, project, and session state.

Context types:
- ticket_work: Active ticket implementation (ticket status: in_progress)
- planning: Ticket planning/readiness (ticket status: backlog, ready)
- review: Code review phase (ticket status: ai_review, human_review)
- admin: Administrative/setup tasks (no active ticket or ticket is done)

Use this to understand what tools and workflows are relevant to the user's
current activity.

Args:
  ticketId: (Optional) Specific ticket ID to detect context for. If not provided,
            no context will be found unless sessionId is provided.
  projectId: (Optional) Project ID for fallback context if no ticket is found.
  sessionId: (Optional) Conversation session ID. If provided, will lookup the
            associated ticket and project from the session.

Returns:
  Context object with type, status, and metadata including current ticket,
  project, session, and state file information for Ralph compatibility.`,
    {
      ticketId: z.string().optional().describe("Ticket ID"),
      projectId: z.string().optional().describe("Project ID"),
      sessionId: z.string().optional().describe("Conversation session ID"),
    },
    async ({ ticketId, projectId, sessionId }) => {
      return executeWithErrorHandling(() => {
        const context = detectContext(db, { ticketId, projectId, sessionId });
        return JSON.stringify(context, null, 2);
      }, "detect_context");
    }
  );

  // detect_all_contexts tool
  server.tool(
    "detect_all_contexts",
    `Detect all currently active contexts across all sessions.

Returns a list of all active contexts with their details. Useful for understanding
system state when multiple users or windows are working in parallel.

This queries all non-ended conversation sessions and detects the context for each one.

Returns:
  Array of context objects, one for each active session.`,
    {},
    async () => {
      return executeWithErrorHandling(() => {
        const contexts = detectAllActiveContexts(db);
        if (contexts.length === 0) {
          return "No active contexts found. No conversation sessions are currently active.";
        }
        return JSON.stringify(contexts, null, 2);
      }, "detect_all_contexts");
    }
  );

  // get_context_summary tool
  server.tool(
    "get_context_summary",
    `Get a human-readable summary of the current context.

Returns a plain-text summary of what context is currently active, useful for
logging, debugging, and understanding the system state at a glance.

Args:
  ticketId: (Optional) Ticket ID to get summary for
  projectId: (Optional) Project ID for fallback
  sessionId: (Optional) Conversation session ID

Returns:
  Human-readable context summary string`,
    {
      ticketId: z.string().optional().describe("Ticket ID"),
      projectId: z.string().optional().describe("Project ID"),
      sessionId: z.string().optional().describe("Conversation session ID"),
    },
    async ({ ticketId, projectId, sessionId }) => {
      return executeWithErrorHandling(() => {
        const context = detectContext(db, { ticketId, projectId, sessionId });
        return getContextSummary(context);
      }, "get_context_summary");
    }
  );

  // is_context_relevant tool
  server.tool(
    "is_context_relevant",
    `Check if a tool category is relevant to the current context.

This is used by context-aware tool filtering to determine which tools should
be visible and recommended to the user. Returns true if the given tool category
should be available in the detected context.

Args:
  toolCategory: Tool category to check (e.g., 'ticket_work', 'code', 'review', 'admin', 'planning')
  ticketId: (Optional) Ticket ID to check context for
  projectId: (Optional) Project ID for fallback
  sessionId: (Optional) Conversation session ID

Returns:
  Boolean indicating whether the tool category is relevant to the context`,
    {
      toolCategory: z
        .string()
        .describe(
          "Tool category to check (ticket_work, planning, review, admin, code, testing, git, general, settings, project_management)"
        ),
      ticketId: z.string().optional().describe("Ticket ID"),
      projectId: z.string().optional().describe("Project ID"),
      sessionId: z.string().optional().describe("Conversation session ID"),
    },
    async ({ toolCategory, ticketId, projectId, sessionId }) => {
      return executeWithErrorHandling(() => {
        const context = detectContext(db, { ticketId, projectId, sessionId });
        const relevant = isContextRelevant(context, toolCategory);
        const contextSummary = getContextSummary(context);
        const status = relevant ? "RELEVANT" : "NOT RELEVANT";
        return `Tool category '${toolCategory}' is ${status} to current context.\n\nContext: ${contextSummary}`;
      }, "is_context_relevant");
    }
  );
}
