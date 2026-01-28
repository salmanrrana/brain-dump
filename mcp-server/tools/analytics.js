/**
 * MCP tools for tool usage analytics.
 * Provides queries and reports on MCP tool usage patterns.
 * @module tools/analytics
 */

import { z } from "zod";
import { getAnalytics } from "../lib/tool-usage-analytics.js";
import { getErrorMessage } from "../lib/logging.js";
import { DB_PATH } from "../lib/environment.js";

/**
 * Create an MCP response with text content.
 * @param {string} text - The response text
 * @param {boolean} isError - Whether this is an error response
 * @returns {Object} MCP-formatted response
 */
function createMCPResponse(text, isError = false) {
  return {
    content: [{ type: "text", text }],
    ...(isError && { isError: true }),
  };
}

/**
 * Get tool usage statistics for a specific tool.
 * Useful for understanding adoption and reliability of individual tools.
 */
export const getToolUsageStats = {
  inputSchema: z.object({
    toolName: z.string().describe("Name of the tool to get statistics for"),
  }),
  handler: async ({ toolName }) => {
    try {
      // Validate input
      if (!toolName || typeof toolName !== 'string') {
        return createMCPResponse(
          `Invalid input: toolName must be a non-empty string`,
          true
        );
      }

      const analytics = getAnalytics(DB_PATH);

      // Check if analytics initialized properly
      if (!analytics) {
        return createMCPResponse(
          `Analytics system unavailable: database connection failed. ` +
          `Check that the database file is accessible and not corrupted.`,
          true
        );
      }

      // Check for initialization errors
      if (analytics.initializationError) {
        return createMCPResponse(
          `Analytics system initialization failed: ${analytics.initializationError}`,
          true
        );
      }

      const stats = analytics.getToolStats(toolName);

      if (!stats) {
        return createMCPResponse(
          `No usage data found for tool '${toolName}'. This tool has not been used yet or has no recorded history.`
        );
      }

      const text = `Tool Usage Statistics: ${toolName}\n\n` +
        `Total Invocations: ${stats.totalInvocations}\n` +
        `Total Successes: ${stats.totalSuccesses}\n` +
        `Total Errors: ${stats.totalErrors}\n` +
        `Success Rate: ${stats.successRate}%\n` +
        `Average Duration: ${stats.averageDuration}ms\n` +
        `Last Used: ${stats.lastUsed}\n` +
        `Used in ${stats.uniqueSessions} session(s)\n` +
        `Used with ${stats.uniqueTickets} ticket(s)\n` +
        `Contexts: ${stats.contexts.join(", ") || "unknown"}`;

      return createMCPResponse(text);
    } catch (error) {
      return createMCPResponse(
        `Error retrieving tool statistics: ${getErrorMessage(error)}`,
        true
      );
    }
  },
};

/**
 * Get overall tool usage analytics summary.
 * Shows which tools are most used and provides health metrics.
 */
export const getToolUsageSummary = {
  inputSchema: z.object({
    minInvocations: z
      .number()
      .optional()
      .describe(
        "Only include tools with at least this many invocations (default: 0)"
      ),
    context: z
      .enum(["ticket_work", "planning", "review", "admin"])
      .optional()
      .describe("Filter by context type (optional)"),
  }),
  handler: async ({ minInvocations = 0, context = null }) => {
    try {
      const analytics = getAnalytics(DB_PATH);

      // Check if analytics initialized properly
      if (!analytics) {
        return createMCPResponse(
          `Analytics system unavailable: database connection failed. ` +
          `Check that the database file is accessible and not corrupted.`,
          true
        );
      }

      // Check for initialization errors
      if (analytics.initializationError) {
        return createMCPResponse(
          `Analytics system initialization failed: ${analytics.initializationError}`,
          true
        );
      }

      const summary = analytics.getAnalyticsSummary({
        minInvocations,
        context,
      });

      if (!summary.tools || summary.tools.length === 0) {
        return createMCPResponse(
          "No tool usage data available yet. Tools will appear here once they are used."
        );
      }

      const lines = [
        "Tool Usage Analytics Summary",
        "=====================================",
        "",
        `Total Tools with Usage: ${summary.totalTools}`,
        `Total Invocations: ${summary.totalInvocations}`,
        `Average Invocations per Tool: ${summary.averageInvocationsPerTool}`,
        `Tools with Errors: ${summary.toolsWithErrors}`,
        `Average Success Rate: ${summary.averageSuccessRate.toFixed(1)}%`,
        "",
        "Top Tools by Usage:",
        "-------------------------------------",
      ];

      const topTools = summary.tools.slice(0, 10);
      for (const tool of topTools) {
        const status =
          tool.errors > 0 ? "⚠️" : tool.invocations > 100 ? "✓" : "→";
        lines.push(`${status} ${tool.name}: ${tool.invocations} calls (${tool.successRate}% success)`);
      }

      if (summary.tools.length > 10) {
        lines.push(`... and ${summary.tools.length - 10} more tools`);
      }

      return createMCPResponse(lines.join("\n"));
    } catch (error) {
      return createMCPResponse(
        `Error retrieving analytics summary: ${getErrorMessage(error)}`,
        true
      );
    }
  },
};

/**
 * Identify tools that are candidates for consolidation or removal.
 * Shows rarely-used tools and tools that haven't been used recently.
 */
export const getConsolidationCandidates = {
  inputSchema: z.object({
    maxInvocations: z
      .number()
      .optional()
      .describe("Include tools with at most this many invocations (default: 5)"),
    daysUnused: z
      .number()
      .optional()
      .describe("Include tools unused for at least this many days (default: 30)"),
  }),
  handler: async ({ maxInvocations = 5, daysUnused = 30 }) => {
    try {
      const analytics = getAnalytics(DB_PATH);

      // Check if analytics initialized properly
      if (!analytics) {
        return createMCPResponse(
          `Analytics system unavailable: database connection failed. ` +
          `Check that the database file is accessible and not corrupted.`,
          true
        );
      }

      // Check for initialization errors
      if (analytics.initializationError) {
        return createMCPResponse(
          `Analytics system initialization failed: ${analytics.initializationError}`,
          true
        );
      }

      const candidates = analytics.getConsolidationCandidates({
        maxInvocations,
        daysUnused,
      });

      if (!candidates || candidates.length === 0) {
        return createMCPResponse(
          `No consolidation candidates found. All tools meet usage thresholds (>${maxInvocations} invocations or used within ${daysUnused} days).`
        );
      }

      const lines = [
        `Consolidation Candidates (${candidates.length} tools)`,
        "=============================================",
        "",
        `Criteria: ≤${maxInvocations} invocations OR unused for ≥${daysUnused} days`,
        "",
      ];

      for (const candidate of candidates) {
        const hoursUnused = candidate.hoursUnused || 0;
        const daysText =
          hoursUnused > 24
            ? `${Math.round(hoursUnused / 24)} days`
            : `${hoursUnused} hours`;
        lines.push(
          `• ${candidate.name}`,
          `  Invocations: ${candidate.invocations}`,
          `  Errors: ${candidate.errors}`,
          `  Unused for: ${daysText}`,
          `  Contexts used in: ${candidate.contexts}`,
          `  Reason: ${candidate.reason}`,
          ""
        );
      }

      return createMCPResponse(lines.join("\n"));
    } catch (error) {
      return createMCPResponse(
        `Error retrieving consolidation candidates: ${getErrorMessage(error)}`,
        true
      );
    }
  },
};

/**
 * Export tool usage analytics as JSON or CSV.
 * Useful for creating reports or analyzing trends over time.
 */
export const exportToolAnalytics = {
  inputSchema: z.object({
    format: z
      .enum(["json", "csv"])
      .optional()
      .describe("Export format (default: json)"),
  }),
  handler: async ({ format = "json" }) => {
    try {
      const analytics = getAnalytics(DB_PATH);

      // Check if analytics initialized properly
      if (!analytics) {
        return createMCPResponse(
          `Analytics system unavailable: database connection failed. ` +
          `Check that the database file is accessible and not corrupted.`,
          true
        );
      }

      // Check for initialization errors
      if (analytics.initializationError) {
        return createMCPResponse(
          `Analytics system initialization failed: ${analytics.initializationError}`,
          true
        );
      }

      const exportData = analytics.exportAnalytics({ format });
      return createMCPResponse(exportData);
    } catch (error) {
      return createMCPResponse(
        `Error exporting analytics: ${getErrorMessage(error)}`,
        true
      );
    }
  },
};

/**
 * Register analytics tools with the MCP server.
 * @param {McpServer} server - The MCP server instance
 */
export function registerAnalyticsTools(server) {
  server.tool(
    "get_tool_usage_stats",
    `Get usage statistics for a specific MCP tool.

Useful for understanding adoption and reliability of individual tools.

Returns statistics including invocations, success rate, average duration, and contexts used.`,
    getToolUsageStats.inputSchema,
    getToolUsageStats.handler
  );

  server.tool(
    "get_tool_usage_summary",
    `Get overall tool usage analytics summary.

Shows which tools are most used and provides health metrics including average success rates.

Optionally filter by minimum invocations or workflow context (ticket_work, planning, review, admin).`,
    getToolUsageSummary.inputSchema,
    getToolUsageSummary.handler
  );

  server.tool(
    "get_consolidation_candidates",
    `Identify MCP tools that are candidates for consolidation or removal.

Shows rarely-used tools (≤5 invocations by default) and tools that haven't been used recently (≥30 days by default).

Useful for reducing tool clutter and focusing on high-value tools.`,
    getConsolidationCandidates.inputSchema,
    getConsolidationCandidates.handler
  );

  server.tool(
    "export_tool_analytics",
    `Export tool usage analytics data as JSON or CSV.

Useful for creating reports or analyzing trends over time in external tools.

Returns complete tool usage statistics including all aggregated metrics.`,
    exportToolAnalytics.inputSchema,
    exportToolAnalytics.handler
  );
}
