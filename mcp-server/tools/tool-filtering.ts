/**
 * Tool filtering tools for context-aware MCP tool visibility.
 * Provides tools for querying and testing the context-aware tool filtering system.
 * @module tools/tool-filtering
 */

import { z } from "zod";
import { log } from "../lib/logging.js";
import { ToolFilteringEngine, FILTER_MODES } from "../lib/tool-filtering.js";
import { getToolMetadata, getToolStatistics } from "../lib/tool-metadata.js";

// Global filtering engine instance (created in index.js)
let filteringEngine = null;

/**
 * Initialize the tool filtering engine.
 * @param {import("better-sqlite3").Database} db - Database connection
 * @param {Object} options - Filtering options
 */
export function initToolFiltering(db, options = {}) {
  filteringEngine = new ToolFilteringEngine(db, options);
  log.info("Tool filtering engine initialized");
  return filteringEngine;
}

/**
 * Get the filtering engine instance.
 * @returns {ToolFilteringEngine|null}
 */
export function getFilteringEngine() {
  return filteringEngine;
}

/**
 * Wrap response content in MCP format.
 * @param {string} text - Response text content
 * @param {boolean} isError - Whether this is an error response
 * @returns {Object} MCP-formatted response
 */
function formatResponse(text, isError = false) {
  const response = { content: [{ type: "text", text }] };
  if (isError) {
    response.isError = true;
  }
  return response;
}

/**
 * Register tool filtering tools with the MCP server.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {import("better-sqlite3").Database} db
 */
export function registerToolFilteringTools(server, db) {
  // Initialize filtering engine if not already done
  if (!filteringEngine) {
    // Read the enableContextAwareToolFiltering setting from database
    try {
      const settings = db.prepare("SELECT enable_context_aware_tool_filtering FROM settings WHERE id = 'default' LIMIT 1").get();
      const filteringEnabled = settings?.enable_context_aware_tool_filtering ?? false;
      initToolFiltering(db, { enabled: filteringEnabled });
    } catch (err) {
      // If settings table doesn't exist or query fails, disable filtering
      log.warn("Could not read context-aware filtering setting, disabling filtering", err);
      initToolFiltering(db, { enabled: false });
    }
  }

  // =========================================================================
  // get_filtered_tools - Get tools visible in current context
  // =========================================================================
  server.tool(
    "get_filtered_tools",
    `Get MCP tools visible in the current context.

This tool returns only the tools relevant to the user's current activity:
- ticket_work context: tools for implementing features
- planning context: tools for planning and design
- review context: tools for code review
- admin context: administrative and setup tools

This reduces tool count from 65 to 10-15 per context, improving LLM decision-making.

Args:
  contextType: (Optional) Specific context to filter for. If not provided,
              will detect from active ticket or session.
  ticketId: (Optional) Ticket ID for context detection
  sessionId: (Optional) Session ID for context detection
  shadowMode: (Optional) If true, also show hidden tools (for testing)

Returns:
  List of visible tool names, total count, and reduction percentage.`,
    {
      contextType: z
        .enum(["ticket_work", "planning", "review", "admin"])
        .optional()
        .describe("Context type"),
      ticketId: z.string().optional().describe("Ticket ID for detection"),
      sessionId: z.string().optional().describe("Session ID for detection"),
      shadowMode: z.boolean().optional().describe("Show hidden tools for testing"),
    },
    async ({ contextType, ticketId, sessionId, shadowMode }) => {
      try {
        const result = filteringEngine.filterTools({
          contextType,
          ticketId,
          sessionId,
          shadowMode: shadowMode || false,
        });

        const summary = `
Context: ${result.contextType}
Visible Tools: ${result.visibleTools.length}/${result.totalTools}
Reduction: ${result.reducedCount} tools hidden (${result.reducePercent}%)
Mode: ${result.mode}
${result.enabled ? "✓ Filtering enabled" : "✗ Filtering disabled"}

Visible Tools:
${result.visibleTools.map((tool, i) => `${i + 1}. ${tool}`).join("\n")}
${shadowMode && result.hiddenTools.length > 0
  ? `\nHidden Tools (Shadow Mode):\n${result.hiddenTools.map((tool, i) => `${i + 1}. ${tool}`).join("\n")}`
  : ""}`;

        return formatResponse(summary);
      } catch (err) {
        log.error("Failed to get filtered tools", err);
        return formatResponse(`Error: ${err.message}`, true);
      }
    }
  );

  // =========================================================================
  // get_tool_metadata - Get metadata for a specific tool
  // =========================================================================
  server.tool(
    "get_tool_metadata",
    `Get detailed metadata for a specific MCP tool.

Metadata includes:
- Tool name and description
- Category (workflow, ticket_management, etc.)
- Relevant contexts (ticket_work, planning, review, admin)
- Priority level (1=critical, 2=important, 3=useful, 4=advanced)

Args:
  toolName: Name of the tool to get metadata for

Returns:
  Tool metadata including category, contexts, priority, and description.`,
    {
      toolName: z.string().describe("Tool name"),
    },
    async ({ toolName }) => {
      try {
        const metadata = getToolMetadata(toolName);

        if (!metadata) {
          return formatResponse(
            `Tool not found: ${toolName}\n\nUse get_tool_statistics to see all available tools.`,
            true
          );
        }

        const priorityLabels = {
          1: "Critical",
          2: "Important",
          3: "Useful",
          4: "Advanced",
        };

        const summary = `
Tool: ${metadata.name}
Description: ${metadata.description}
Category: ${metadata.category}
Priority: ${priorityLabels[metadata.priority] || "Unknown"}
Relevant Contexts: ${metadata.contexts.join(", ")}`;

        return formatResponse(summary);
      } catch (err) {
        log.error("Failed to get tool metadata", err);
        return formatResponse(`Error: ${err.message}`, true);
      }
    }
  );

  // =========================================================================
  // get_tool_statistics - Get statistics about all tools
  // =========================================================================
  server.tool(
    "get_tool_statistics",
    `Get statistics about all MCP tools.

Shows:
- Total tool count
- Tools per category
- Tools per context
- Filtering effectiveness

This helps understand the tool distribution and impact of context-aware filtering.

Returns:
  Statistics about tool distribution and categorization.`,
    {},
    async () => {
      try {
        const stats = getToolStatistics();

        const categoryList = Object.entries(stats.byCategory)
          .map(([cat, count]) => `  - ${cat}: ${count}`)
          .join("\n");

        const contextList = Object.entries(stats.byContext)
          .map(([ctx, count]) => `  - ${ctx}: ${count}`)
          .join("\n");

        const summary = `
Total Tools: ${stats.totalTools}

Tools by Category:
${categoryList}

Tools by Context:
${contextList}

Context Reduction (when filtering enabled):
- ticket_work: 65 → ~18 tools (73% reduction)
- planning: 65 → ~16 tools (75% reduction)
- review: 65 → ~15 tools (77% reduction)
- admin: 65 → ~32 tools (51% reduction)`;

        return formatResponse(summary);
      } catch (err) {
        log.error("Failed to get tool statistics", err);
        return formatResponse(`Error: ${err.message}`, true);
      }
    }
  );

  // =========================================================================
  // set_filter_mode - Change tool filtering mode
  // =========================================================================
  server.tool(
    "set_filter_mode",
    `Change the tool filtering mode.

Modes:
- strict: Only critical tools (priority 1)
- default: Critical and important tools (priority 1-2)
- permissive: Critical, important, and useful tools (priority 1-3)
- full: All tools including advanced (priority 1-4)

Args:
  mode: Filter mode to use

Returns:
  Confirmation of mode change.`,
    {
      mode: z
        .enum(["strict", "default", "permissive", "full"])
        .describe("Filter mode"),
    },
    async ({ mode }) => {
      try {
        filteringEngine.setMode(mode);
        const modeInfo = FILTER_MODES[mode];

        return formatResponse(
          `Filter mode changed to: ${mode}\nDescription: ${modeInfo.description}`
        );
      } catch (err) {
        log.error("Failed to set filter mode", err);
        return formatResponse(`Error: ${err.message}`, true);
      }
    }
  );

  // =========================================================================
  // set_filtering_enabled - Enable/disable tool filtering
  // =========================================================================
  server.tool(
    "set_filtering_enabled",
    `Enable or disable context-aware tool filtering.

When disabled, all 65 tools are shown regardless of context.

Args:
  enabled: Whether to enable filtering

Returns:
  Confirmation of the setting change.`,
    {
      enabled: z.boolean().describe("Enable or disable filtering"),
    },
    async ({ enabled }) => {
      try {
        filteringEngine.setEnabled(enabled);

        return formatResponse(
          `Tool filtering ${enabled ? "enabled" : "disabled"}`
        );
      } catch (err) {
        log.error("Failed to set filtering", err);
        return formatResponse(`Error: ${err.message}`, true);
      }
    }
  );

  // =========================================================================
  // check_tool_visibility - Check if a tool is visible in a context
  // =========================================================================
  server.tool(
    "check_tool_visibility",
    `Check if a tool is visible in a specific context.

Args:
  toolName: Name of the tool to check
  contextType: (Optional) Context to check. If not provided, will detect.
  ticketId: (Optional) Ticket ID for context detection
  sessionId: (Optional) Session ID for context detection

Returns:
  Whether the tool is visible and why (or why not).`,
    {
      toolName: z.string().describe("Tool name"),
      contextType: z
        .enum(["ticket_work", "planning", "review", "admin"])
        .optional()
        .describe("Context type"),
      ticketId: z.string().optional().describe("Ticket ID"),
      sessionId: z.string().optional().describe("Session ID"),
    },
    async ({ toolName, contextType, ticketId, sessionId }) => {
      try {
        const metadata = getToolMetadata(toolName);

        if (!metadata) {
          return formatResponse(
            `Tool not found: ${toolName}`,
            true
          );
        }

        const isVisible = filteringEngine.isToolVisible(toolName, {
          contextType,
          ticketId,
          sessionId,
        });

        const result = filteringEngine.filterTools({
          contextType,
          ticketId,
          sessionId,
        });

        const summary = `
Tool: ${toolName}
Visible: ${isVisible ? "Yes ✓" : "No ✗"}
Context: ${result.contextType}
Category: ${metadata.category}
Priority: ${["Critical", "Important", "Useful", "Advanced"][metadata.priority - 1]}
Relevant Contexts: ${metadata.contexts.join(", ")}
${!isVisible ? `\nReason: Not relevant to ${result.contextType} context` : ""}`;

        return formatResponse(summary);
      } catch (err) {
        log.error("Failed to check tool visibility", err);
        return formatResponse(`Error: ${err.message}`, true);
      }
    }
  );
}
