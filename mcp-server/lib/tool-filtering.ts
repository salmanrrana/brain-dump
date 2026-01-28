/**
 * Tool filtering system for context-aware MCP tool visibility.
 * Filters available tools based on active context to reduce cognitive load
 * and improve LLM decision-making by showing only relevant tools.
 * @module lib/tool-filtering
 */

import { getToolMetadata, getToolsForContext } from "./tool-metadata.js";
import { detectContext } from "./context-detection.js";
import { log } from "./logging.js";

/**
 * Filter options for tool visibility.
 *
 * @typedef {Object} FilterOptions
 * @property {boolean} [enabled=true] - Whether filtering is enabled
 * @property {string} [mode='default'] - Filtering mode: 'default', 'strict', 'permissive'
 * @property {number} [maxPriority=3] - Maximum tool priority (1=critical, 4=advanced)
 * @property {string[]} [alwaysShow] - Tools to always show regardless of context
 * @property {string[]} [neverShow] - Tools to never show
 */

/**
 * Tool filtering modes and their characteristics.
 */
export const FILTER_MODES = {
  // Only show critical tools (priority 1) for the current context
  strict: { maxPriority: 1, description: "Critical tools only" },

  // Default: show critical and important tools (priority 1-2)
  default: { maxPriority: 2, description: "Critical and important tools" },

  // Show all tools with reasonable priority (priority 1-3)
  permissive: {
    maxPriority: 3,
    description: "Critical, important, and useful tools",
  },

  // Show all tools (priority 1-4)
  full: { maxPriority: 4, description: "All tools" },
};

/**
 * Context-specific tool visibility with shadow mode support.
 *
 * Shadow mode allows testing filtering rules without enforcing them,
 * helping validate the filtering configuration.
 */
export class ToolFilteringEngine {
  private db: any;
  private enabled: boolean;
  private mode: string;
  private maxPriority: number;
  private alwaysShow: Set<string>;
  private neverShow: Set<string>;

  /**
   * Create a tool filtering engine.
   * @param {import("better-sqlite3").Database} db - Database connection
   * @param {FilterOptions} [options] - Filtering options
   */
  constructor(db: any, options: Record<string, any> = {}) {
    this.db = db;
    this.enabled = options.enabled !== false;
    this.mode = options.mode || "default";
    this.maxPriority = FILTER_MODES[this.mode]?.maxPriority || 2;
    this.alwaysShow = new Set(options.alwaysShow || []);
    this.neverShow = new Set(options.neverShow || []);

    // Add context-relevant tools that should always be available
    this.alwaysShow.add("detect_context");
    this.alwaysShow.add("detect_all_contexts");

    log.debug(`Tool filtering initialized: mode=${this.mode}, enabled=${this.enabled}`);
  }

  /**
   * Get the active context for filtering.
   * @param {Object} options - Context detection options
   * @returns {Object} Active context
   */
  _getContext(options: Record<string, any> = {}): Record<string, unknown> {
    try {
      return detectContext(this.db, options);
    } catch (err) {
      log.error("Failed to detect context for tool filtering", err);
      // Return admin context as safe default
      return {
        type: "admin",
        description: "Administrative/setup context (fallback)",
      };
    }
  }

  /**
   * Filter tools for a specific context.
   * @param {Object} options - Filtering options
   * @param {string} [options.contextType] - Context type to filter for. If not provided, will detect.
   * @param {string} [options.ticketId] - Ticket ID for context detection
   * @param {string} [options.sessionId] - Session ID for context detection
   * @param {boolean} [options.shadowMode] - If true, don't enforce filtering
   * @returns {Object} Filtering result
   */
  filterTools(options: { contextType?: string; ticketId?: string; sessionId?: string; shadowMode?: boolean } = {}): Record<string, unknown> {
    const {
      contextType,
      ticketId,
      sessionId,
      shadowMode = false,
    } = options;

    // Get active context
    let detectedContext;
    if (contextType) {
      detectedContext = { type: contextType };
    } else {
      detectedContext = this._getContext({ ticketId, sessionId });
    }

    const context = detectedContext.type || "admin";

    // Get tools relevant to this context
    const relevantTools = new Set(
      getToolsForContext(context, this.maxPriority)
    );

    // Apply alwaysShow and neverShow rules
    for (const tool of this.alwaysShow) {
      relevantTools.add(tool);
    }

    for (const tool of this.neverShow) {
      relevantTools.delete(tool);
    }

    const visibleTools = Array.from(relevantTools).sort();

    // In shadow mode, also return what would be hidden (for testing)
    const hiddenTools = shadowMode
      ? TOOL_METADATA_REGISTRY.filter(
          (tool) => !visibleTools.includes(tool.name)
        ).map((tool) => tool.name)
      : [];

    return {
      context: detectedContext,
      contextType: context,
      visibleTools,
      hiddenTools: shadowMode ? hiddenTools : undefined,
      totalTools: TOOL_METADATA_REGISTRY.length,
      reducedCount: TOOL_METADATA_REGISTRY.length - visibleTools.length,
      reducePercent: Math.round(
        ((TOOL_METADATA_REGISTRY.length - visibleTools.length) /
          TOOL_METADATA_REGISTRY.length) *
          100
      ),
      mode: this.mode,
      enabled: this.enabled,
      shadowMode,
    };
  }

  /**
   * Check if a tool should be visible in a context.
   * @param {string} toolName - Tool name to check
   * @param {Object} [options] - Context options
   * @returns {boolean} True if tool is visible
   */
  isToolVisible(toolName, options = {}) {
    if (!this.enabled) return true;

    // Check explicit rules first
    if (this.neverShow.has(toolName)) return false;
    if (this.alwaysShow.has(toolName)) return true;

    // Get relevant tools for context
    const result = this.filterTools(options);
    return result.visibleTools.includes(toolName);
  }

  /**
   * Get statistics about tool filtering.
   * @returns {Object} Filtering statistics
   */
  getStatistics() {
    const stats = {
      enabled: this.enabled,
      mode: this.mode,
      maxPriority: this.maxPriority,
      totalTools: 0,
      byContext: {},
      reductionPercent: {},
    };

    // Import metadata here to avoid circular dependency issues
    const toolNames = new Set();

    // Count tools per context
    for (const contextType of [
      "ticket_work",
      "planning",
      "review",
      "admin",
    ]) {
      const visibleTools = getToolsForContext(contextType, this.maxPriority);
      const filtered = visibleTools.filter(
        (t) =>
          !this.neverShow.has(t) &&
          (this.alwaysShow.has(t) || getToolMetadata(t)?.contexts.includes(contextType))
      );

      stats.byContext[contextType] = {
        visible: filtered.length,
        total: visibleTools.length,
      };

      visibleTools.forEach((t) => toolNames.add(t));
    }

    stats.totalTools = toolNames.size;

    return stats;
  }

  /**
   * Add a tool to always show.
   * @param {string} toolName - Tool name
   */
  addAlwaysShow(toolName) {
    this.alwaysShow.add(toolName);
  }

  /**
   * Remove a tool from always show.
   * @param {string} toolName - Tool name
   */
  removeAlwaysShow(toolName) {
    this.alwaysShow.delete(toolName);
  }

  /**
   * Add a tool to never show.
   * @param {string} toolName - Tool name
   */
  addNeverShow(toolName) {
    this.neverShow.add(toolName);
  }

  /**
   * Remove a tool from never show.
   * @param {string} toolName - Tool name
   */
  removeNeverShow(toolName) {
    this.neverShow.delete(toolName);
  }

  /**
   * Enable or disable filtering.
   * @param {boolean} enabled - Whether to enable filtering
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    log.info(`Tool filtering ${enabled ? "enabled" : "disabled"}`);
  }

  /**
   * Change filtering mode.
   * @param {string} mode - Filtering mode (strict, default, permissive, full)
   */
  setMode(mode) {
    if (!FILTER_MODES[mode]) {
      throw new Error(`Invalid filter mode: ${mode}`);
    }
    this.mode = mode;
    this.maxPriority = FILTER_MODES[mode].maxPriority;
    log.info(`Tool filtering mode changed to: ${mode}`);
  }
}

/**
 * Import tool metadata for statistics.
 * This is a workaround to avoid circular imports.
 */
import { TOOL_METADATA_REGISTRY } from "./tool-metadata.js";
