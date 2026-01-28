/**
 * Tool usage analytics tracker for MCP tools.
 * Tracks which tools are actually being used to help identify consolidation candidates.
 * @module lib/tool-usage-analytics
 */

import Database from "better-sqlite3";
import { log, getErrorMessage } from "./logging.js";

/** Type for tool usage statistics stored in memory */
interface ToolUsageStats {
  toolName: string;
  sessionId: string | null;
  ticketId: string | null;
  projectId: string | null;
  context: string | null;
  invocations: number;
  successCount: number;
  errorCount: number;
  totalDuration: number;
}

/** Type for recordToolUsage options */
interface RecordToolUsageOptions {
  sessionId?: string | null;
  ticketId?: string | null;
  projectId?: string | null;
  context?: string | null;
  success?: boolean;
  duration?: number;
  error?: Error | null;
}

/**
 * Tool usage analytics tracker.
 * Maintains in-memory cache of tool usage within a session,
 * with periodic flushing to the database.
 */
export class ToolUsageAnalytics {
  private db: Database | null = null;
  private sessionUsage: Map<string, ToolUsageStats> = new Map();
  private flushInterval: number = 60000;
  private flushInProgress: boolean = false;
  private timer: NodeJS.Timeout | null = null;
  private initializationError: string | null = null;

  constructor(dbPath: string) {
    try {
      this.db = new Database(dbPath);

      // Verify database is responsive
      this.db.prepare("SELECT 1").get();

      // Verify schema exists
      const tableExists = this.db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='tool_usage_events'
      `).get();

      if (!tableExists) {
        throw new Error(
          'Database schema missing: tool_usage_events table not found. ' +
          'Database must be initialized with proper schema before use.'
        );
      }

      this.sessionUsage = new Map(); // Map of toolName -> usage stats for current session
      this.flushInterval = 60000; // Flush to DB every 60 seconds
      this.flushInProgress = false; // Track concurrent flush operations
      this.startFlushTimer();

      log.info(`Analytics database initialized: ${dbPath}`);
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      log.error(
        `Failed to initialize analytics database at ${dbPath}:`,
        error instanceof Error ? error : new Error(errorMsg)
      );
      this.initializationError = errorMsg;
      this.db = null;
      this.sessionUsage = new Map();
      throw new Error(
        `Analytics initialization failed: ${errorMsg}. ` +
        `Check database path, permissions, and ensure schema is initialized.`
      );
    }
  }

  /**
   * Record a tool invocation.
   * @param {string} toolName - Name of the tool called
   * @param {Object} options - Additional info
   * @param {string} options.sessionId - Ralph session ID if applicable
   * @param {string} options.ticketId - Current ticket ID
   * @param {string} options.projectId - Current project ID
   * @param {string} options.context - Active context (ticket_work, planning, review, admin)
   * @param {boolean} options.success - Whether the tool call succeeded
   * @param {number} options.duration - Execution time in milliseconds
   * @param {Error} options.error - Error if tool failed
   */
  recordToolUsage(toolName: string, options: RecordToolUsageOptions = {}): void {
    const {
      sessionId = null,
      ticketId = null,
      projectId = null,
      context = "unknown",
      success = true,
      duration = 0,
      error = null,
    } = options;

    // Get or create usage entry for this tool
    const key = `${toolName}:${sessionId}:${ticketId}:${projectId}`;
    if (!this.sessionUsage.has(key)) {
      this.sessionUsage.set(key, {
        toolName,
        sessionId,
        ticketId,
        projectId,
        context,
        invocations: 0,
        successCount: 0,
        errorCount: 0,
        totalDuration: 0,
      });
    }

    // Update stats
    const stats = this.sessionUsage.get(key);
    stats.invocations++;
    stats.totalDuration += duration;
    if (success) {
      stats.successCount++;
    } else {
      stats.errorCount++;
      if (error) {
        log.warn(`Tool '${toolName}' failed:`, error);
      }
    }

    if (!success) {
      log.debug(`Tool usage recorded: ${toolName} (failed, duration: ${duration}ms)`);
    } else if (duration > 1000) {
      log.debug(`Tool usage recorded: ${toolName} (slow, duration: ${duration}ms)`);
    }
  }

  /**
   * Flush current session usage to database.
   */
  async flushToDatabase() {
    if (this.sessionUsage.size === 0) {
      return;
    }

    try {
      const stmt = this.db.prepare(`
        INSERT INTO tool_usage_events
        (id, tool_name, session_id, ticket_id, project_id, context, invocations, success_count, error_count, total_duration, last_used_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          invocations = invocations + excluded.invocations,
          success_count = success_count + excluded.success_count,
          error_count = error_count + excluded.error_count,
          total_duration = total_duration + excluded.total_duration,
          last_used_at = datetime('now')
      `);

      for (const stats of this.sessionUsage.values()) {
        const id = `${stats.toolName}:${stats.sessionId}:${stats.ticketId}:${stats.projectId}`;
        stmt.run(
          id,
          stats.toolName,
          stats.sessionId,
          stats.ticketId,
          stats.projectId,
          stats.context,
          stats.invocations,
          stats.successCount,
          stats.errorCount,
          stats.totalDuration
        );
      }

      log.debug(
        `Flushed ${this.sessionUsage.size} tool usage records to database`
      );
      this.sessionUsage.clear();
    } catch (error) {
      log.error("Failed to flush tool usage to database:", error);
    }
  }

  /**
   * Calculate success rate as a percentage string.
   * @private
   * @param {number} successes - Number of successful invocations
   * @param {number} total - Total number of invocations
   * @returns {string|number} Success rate or 0 if no invocations
   */
  #calculateSuccessRate(successes: number, total: number): string | number {
    return total > 0 ? (successes / total * 100).toFixed(1) : 0;
  }

  /**
   * Start the periodic flush timer.
   * @private
   */
  startFlushTimer() {
    this.timer = setInterval(async () => {
      // Prevent concurrent flushes
      if (this.flushInProgress) {
        log.debug('Previous analytics flush still in progress, skipping this cycle');
        return;
      }

      try {
        this.flushInProgress = true;
        await this.flushToDatabase();
      } catch (error) {
        log.error(
          'Analytics flush failed in timer',
          error instanceof Error ? error : new Error(getErrorMessage(error))
        );
        // Don't clear sessionUsage on error - we'll retry next cycle
      } finally {
        this.flushInProgress = false;
      }
    }, this.flushInterval);
  }

  /**
   * Stop the periodic flush timer and flush remaining data.
   */
  async shutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
    }
    // Wait for any in-progress flush to complete
    let retries = 0;
    while (this.flushInProgress && retries < 10) {
      await new Promise(resolve => setTimeout(resolve, 100));
      retries++;
    }
    try {
      await this.flushToDatabase();
    } catch (error) {
      log.error(
        'Final analytics flush failed during shutdown',
        error instanceof Error ? error : new Error(getErrorMessage(error))
      );
    }
    if (this.db) {
      this.db.close();
    }
  }

  /**
   * Get usage statistics for a specific tool.
   * @param {string} toolName - Name of the tool
   * @returns {Object|null} Tool statistics or null if not found
   */
  getToolStats(toolName: string): Record<string, unknown> | null {
    try {
      // Defensive check for database
      if (!this.db) {
        throw new Error('Analytics database not initialized. Check server logs for initialization errors.');
      }

      // Validate input
      if (!toolName || typeof toolName !== 'string') {
        throw new Error('toolName must be a non-empty string');
      }

      const stmt = this.db.prepare(`
        SELECT
          tool_name as toolName,
          COUNT(*) as totalRecords,
          SUM(invocations) as totalInvocations,
          SUM(success_count) as totalSuccesses,
          SUM(error_count) as totalErrors,
          SUM(total_duration) as totalDuration,
          AVG(total_duration) as averageDuration,
          MAX(last_used_at) as lastUsed,
          COUNT(DISTINCT session_id) as uniqueSessions,
          COUNT(DISTINCT ticket_id) as uniqueTickets,
          GROUP_CONCAT(DISTINCT context) as contexts
        FROM tool_usage_events
        WHERE tool_name = ?
        GROUP BY tool_name
      `);

      const result = stmt.get(toolName);
      if (!result) {
        return null;
      }

      return {
        toolName: result.toolName,
        totalRecords: result.totalRecords,
        totalInvocations: result.totalInvocations || 0,
        totalSuccesses: result.totalSuccesses || 0,
        totalErrors: result.totalErrors || 0,
        successRate: this.#calculateSuccessRate(result.totalSuccesses, result.totalInvocations),
        totalDuration: result.totalDuration || 0,
        averageDuration: result.averageDuration ? Math.round(result.averageDuration) : 0,
        lastUsed: result.lastUsed,
        uniqueSessions: result.uniqueSessions || 0,
        uniqueTickets: result.uniqueTickets || 0,
        contexts: result.contexts ? result.contexts.split(",") : [],
      };
    } catch (error) {
      log.error(`Failed to get tool stats for '${toolName}':`, error);
      return null;
    }
  }

  /**
   * Get overall analytics summary.
   * @param {Object} options - Filter options
   * @param {number} options.minInvocations - Only include tools with at least N invocations
   * @param {string} options.context - Filter by context type
   * @returns {Object} Analytics summary
   */
  getAnalyticsSummary(options: { minInvocations?: number; context?: string | null } = {}): Record<string, unknown> {
    const { minInvocations = 0, context = null } = options;

    try {
      // Validate inputs
      if (typeof minInvocations !== 'number' || minInvocations < 0) {
        throw new Error('minInvocations must be a non-negative number');
      }
      if (context && typeof context !== 'string') {
        throw new Error('context must be a string');
      }

      // Validate context is one of the allowed values
      const validContexts = ["ticket_work", "planning", "review", "admin"];
      if (context && !validContexts.includes(context)) {
        throw new Error(`Invalid context: ${context}. Must be one of: ${validContexts.join(', ')}`);
      }

      // Defensive check for database
      if (!this.db) {
        throw new Error('Analytics database not initialized. Check server logs for initialization errors.');
      }

      const query = context
        ? `
          SELECT
            tool_name as toolName,
            SUM(invocations) as totalInvocations,
            SUM(success_count) as totalSuccesses,
            SUM(error_count) as totalErrors,
            COUNT(DISTINCT session_id) as uniqueSessions,
            MAX(last_used_at) as lastUsed
          FROM tool_usage_events
          WHERE context = ?
          GROUP BY tool_name
          HAVING SUM(invocations) >= ?
          ORDER BY SUM(invocations) DESC
        `
        : `
          SELECT
            tool_name as toolName,
            SUM(invocations) as totalInvocations,
            SUM(success_count) as totalSuccesses,
            SUM(error_count) as totalErrors,
            COUNT(DISTINCT session_id) as uniqueSessions,
            MAX(last_used_at) as lastUsed
          FROM tool_usage_events
          GROUP BY tool_name
          HAVING SUM(invocations) >= ?
          ORDER BY SUM(invocations) DESC
        `;

      const stmt = this.db.prepare(query);
      const tools = context ? stmt.all(context, minInvocations) : stmt.all(minInvocations);

      // Calculate summary statistics
      const stats = {
        totalTools: tools.length,
        totalInvocations: tools.reduce((sum, t) => sum + (t.totalInvocations || 0), 0),
        averageInvocationsPerTool:
          tools.length > 0
            ? Math.round(
                tools.reduce((sum, t) => sum + (t.totalInvocations || 0), 0) /
                  tools.length
              )
            : 0,
        toolsWithErrors: tools.filter((t) => (t.totalErrors || 0) > 0).length,
        averageSuccessRate:
          tools.length > 0
            ? (
                tools.reduce((sum, t) => {
                  const total = (t.totalSuccesses || 0) + (t.totalErrors || 0);
                  return total > 0 ? sum + (t.totalSuccesses / total) : sum;
                }, 0) / tools.length
              ) * 100
            : 0,
        tools: tools.map((t) => ({
          name: t.toolName,
          invocations: t.totalInvocations || 0,
          successes: t.totalSuccesses || 0,
          errors: t.totalErrors || 0,
          successRate: this.#calculateSuccessRate(t.totalSuccesses, t.totalInvocations),
          sessions: t.uniqueSessions || 0,
          lastUsed: t.lastUsed,
        })),
      };

      return stats;
    } catch (error) {
      log.error("Failed to get analytics summary:", error);
      return {
        totalTools: 0,
        totalInvocations: 0,
        tools: [],
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Get tools that are rarely used and candidates for consolidation.
   * @param {Object} options - Filter options
   * @param {number} options.maxInvocations - Include tools with <= N invocations (default: 5)
   * @param {number} options.daysUnused - Include tools unused for >= N days (default: 30)
   * @returns {Array} Candidate tools for consolidation
   */
  getConsolidationCandidates(options: { maxInvocations?: number; daysUnused?: number } = {}): Array<Record<string, unknown>> {
    const { maxInvocations = 5, daysUnused = 30 } = options;

    try {
      // Defensive check for database
      if (!this.db) {
        throw new Error('Analytics database not initialized. Check server logs for initialization errors.');
      }

      // Validate inputs
      if (typeof maxInvocations !== 'number' || maxInvocations < 0) {
        throw new Error('maxInvocations must be a non-negative number');
      }
      if (typeof daysUnused !== 'number' || daysUnused < 0) {
        throw new Error('daysUnused must be a non-negative number');
      }

      const stmt = this.db.prepare(`
        SELECT
          tool_name as toolName,
          SUM(invocations) as totalInvocations,
          SUM(error_count) as totalErrors,
          MAX(last_used_at) as lastUsed,
          ROUND(
            (julianday('now') - julianday(MAX(last_used_at))) * 24
          ) as hoursUnused,
          COUNT(DISTINCT context) as contextCount
        FROM tool_usage_events
        GROUP BY tool_name
        HAVING SUM(invocations) <= ? OR ROUND(
          (julianday('now') - julianday(MAX(last_used_at))) * 24
        ) >= ?
        ORDER BY SUM(invocations) ASC, MAX(last_used_at) ASC
      `);

      const candidates = stmt.all(maxInvocations, daysUnused * 24);

      return candidates.map((c) => ({
        name: c.toolName,
        invocations: c.totalInvocations || 0,
        errors: c.totalErrors || 0,
        hoursUnused: c.hoursUnused || 0,
        lastUsed: c.lastUsed,
        contexts: c.contextCount || 0,
        reason:
          (c.totalInvocations || 0) <= maxInvocations
            ? "Rarely used"
            : "Not used recently",
      }));
    } catch (error) {
      log.error("Failed to get consolidation candidates:", error);
      return [];
    }
  }

  /**
   * Export analytics data as JSON.
   * @param {Object} options - Export options
   * @param {string} options.format - Export format (json, csv)
   * @returns {string} Exported data
   */
  exportAnalytics(options: { format?: string } = {}): string {
    const { format = "json" } = options;

    try {
      const summary = this.getAnalyticsSummary();
      const candidates = this.getConsolidationCandidates();

      const exportData = {
        exportedAt: new Date().toISOString(),
        summary,
        consolidationCandidates: candidates,
      };

      if (format === "json") {
        return JSON.stringify(exportData, null, 2);
      } else if (format === "csv") {
        // Simple CSV export
        let csv =
          "Tool,Invocations,Successes,Errors,SuccessRate,Sessions,LastUsed\n";
        const tools = (summary.tools as Array<Record<string, unknown>>) || [];
        for (const tool of tools) {
          csv += `"${tool.name}",${tool.invocations},${tool.successes},${tool.errors},${tool.successRate},${tool.sessions},"${tool.lastUsed}"\n`;
        }
        return csv;
      }

      return JSON.stringify(exportData);
    } catch (error) {
      log.error("Failed to export analytics:", error);
      return JSON.stringify({ error: "Failed to export analytics" });
    }
  }
}

// Singleton instance (lazy initialized)
let analyticsInstance = null;

/**
 * Get the analytics tracker singleton.
 * @param {string} dbPath - Path to the database
 * @returns {ToolUsageAnalytics} Analytics instance
 */
export function getAnalytics(dbPath) {
  if (!analyticsInstance && dbPath) {
    analyticsInstance = new ToolUsageAnalytics(dbPath);
  }
  return analyticsInstance;
}
