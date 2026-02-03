/**
 * Shared MCP formatting utilities for consolidated resource tools.
 *
 * Provides helper functions for action-dispatched tools:
 * - requireParam: runtime validation for action-specific required params
 * - formatResult: consistent MCP content formatting
 * - formatEmpty: standard "not found" messages
 *
 * @module lib/mcp-format
 */

import { ValidationError } from "../../core/errors.ts";

/** Standard MCP success response type (index signature required by MCP SDK) */
export interface McpResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/**
 * Require a parameter for a specific action, throwing ValidationError if missing.
 *
 * @example
 * const id = requireParam(ticketId, "ticketId", "get");
 * // id is now typed as non-undefined
 */
export function requireParam<T>(
  value: T | undefined | null,
  paramName: string,
  actionName: string
): T {
  if (value === undefined || value === null) {
    throw new ValidationError(`'${paramName}' is required for action '${actionName}'`);
  }
  return value;
}

/**
 * Format data as a standard MCP success response.
 *
 * @param data - The data to serialize (will be JSON.stringified if not already a string)
 * @param prefix - Optional human-readable prefix before the JSON data
 */
export function formatResult(data: unknown, prefix?: string): McpResult {
  const text =
    typeof data === "string"
      ? data
      : prefix
        ? `${prefix}\n\n${JSON.stringify(data)}`
        : JSON.stringify(data);

  return {
    content: [{ type: "text" as const, text }],
  };
}

/**
 * Format a "no results found" message for a resource type.
 */
export function formatEmpty(resourceName: string, filters?: Record<string, unknown>): McpResult {
  let msg = `No ${resourceName} found`;
  if (filters) {
    const filterParts = Object.entries(filters)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`);
    if (filterParts.length > 0) {
      msg += ` matching: ${filterParts.join(", ")}`;
    }
  }
  msg += ".";
  return {
    content: [{ type: "text" as const, text: msg }],
  };
}
