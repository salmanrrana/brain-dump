/**
 * Shared MCP response formatting utilities.
 *
 * Provides consistent error and success response formatting
 * for all MCP tool handlers.
 */

import { CoreError } from "../../core/errors.ts";

/** Convert any error into a standardized MCP error response. */
export function mcpError(err: unknown): {
  content: [{ type: "text"; text: string }];
  isError: true;
} {
  const msg =
    err instanceof CoreError ? err.message : err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: msg }],
    isError: true,
  };
}
