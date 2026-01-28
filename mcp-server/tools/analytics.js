/**
 * MCP tools for tool usage analytics.
 * Provides queries and reports on MCP tool usage patterns.
 * @module tools/analytics
 */

import { z } from "zod";
import { getAnalytics } from "../lib/tool-usage-analytics.js";
import { DB_PATH } from "../lib/environment.js";

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
      const analytics = getAnalytics(DB_PATH);
      const stats = analytics.getToolStats(toolName);

      if (!stats) {
        return {
          content: [
            {
              type: "text",
              text: `No usage data found for tool '${toolName}'. This tool has not been used yet or has no recorded history.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Tool Usage Statistics: ${toolName}\n\n` +
              `Total Invocations: ${stats.totalInvocations}\n` +
              `Total Successes: ${stats.totalSuccesses}\n` +
              `Total Errors: ${stats.totalErrors}\n` +
              `Success Rate: ${stats.successRate}%\n` +
              `Average Duration: ${stats.averageDuration}ms\n` +
              `Last Used: ${stats.lastUsed}\n` +
              `Used in ${stats.uniqueSessions} session(s)\n` +
              `Used with ${stats.uniqueTickets} ticket(s)\n` +
              `Contexts: ${stats.contexts.join(", ") || "unknown"}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving tool statistics: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
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
      const summary = analytics.getAnalyticsSummary({
        minInvocations,
        context,
      });

      if (!summary.tools || summary.tools.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No tool usage data available yet. Tools will appear here once they are used.",
            },
          ],
        };
      }

      let text = "Tool Usage Analytics Summary\n";
      text += `=====================================\n\n`;

      text += `Total Tools with Usage: ${summary.totalTools}\n`;
      text += `Total Invocations: ${summary.totalInvocations}\n`;
      text += `Average Invocations per Tool: ${summary.averageInvocationsPerTool}\n`;
      text += `Tools with Errors: ${summary.toolsWithErrors}\n`;
      text += `Average Success Rate: ${summary.averageSuccessRate.toFixed(1)}%\n`;
      text += `\nTop Tools by Usage:\n`;
      text += `-------------------------------------\n`;

      // Show top 10 tools
      const topTools = summary.tools.slice(0, 10);
      for (const tool of topTools) {
        const status =
          tool.errors > 0 ? "⚠️" : tool.invocations > 100 ? "✓" : "→";
        text += `${status} ${tool.name}: ${tool.invocations} calls (${tool.successRate}% success)\n`;
      }

      if (summary.tools.length > 10) {
        text += `... and ${summary.tools.length - 10} more tools`;
      }

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving analytics summary: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
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
      const candidates = analytics.getConsolidationCandidates({
        maxInvocations,
        daysUnused,
      });

      if (!candidates || candidates.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No consolidation candidates found. All tools meet usage thresholds (>${maxInvocations} invocations or used within ${daysUnused} days).`,
            },
          ],
        };
      }

      let text = `Consolidation Candidates (${candidates.length} tools)\n`;
      text += `=============================================\n\n`;
      text += `Criteria: ≤${maxInvocations} invocations OR unused for ≥${daysUnused} days\n\n`;

      for (const candidate of candidates) {
        const hoursUnused = candidate.hoursUnused || 0;
        const daysText =
          hoursUnused > 24
            ? `${Math.round(hoursUnused / 24)} days`
            : `${hoursUnused} hours`;
        text += `• ${candidate.name}\n`;
        text += `  Invocations: ${candidate.invocations}\n`;
        text += `  Errors: ${candidate.errors}\n`;
        text += `  Unused for: ${daysText}\n`;
        text += `  Contexts used in: ${candidate.contexts}\n`;
        text += `  Reason: ${candidate.reason}\n\n`;
      }

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving consolidation candidates: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
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
      const exportData = analytics.exportAnalytics({ format });

      return {
        content: [
          {
            type: "text",
            text: exportData,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error exporting analytics: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * Register analytics tools with the MCP server.
 * @param {McpServer} server - The MCP server instance
 * @param {Database} db - The database instance (unused, kept for API consistency)
 */
export function registerAnalyticsTools(server, db) {
  server.tool("get_tool_usage_stats", getToolUsageStats.inputSchema, getToolUsageStats.handler);
  server.tool("get_tool_usage_summary", getToolUsageSummary.inputSchema, getToolUsageSummary.handler);
  server.tool("get_consolidation_candidates", getConsolidationCandidates.inputSchema, getConsolidationCandidates.handler);
  server.tool("export_tool_analytics", exportToolAnalytics.inputSchema, exportToolAnalytics.handler);
}
