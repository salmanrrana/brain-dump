/**
 * Event emission tools for Brain Dump MCP server.
 * Provides real-time event streaming for Ralph sessions.
 * @module tools/events
 */
import { z } from "zod";
import { randomUUID } from "crypto";
import { log } from "../lib/logging.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "better-sqlite3";

// Valid event types that Ralph can emit
const VALID_EVENT_TYPES = [
  "thinking", // Claude is processing
  "tool_start", // About to call a tool
  "tool_end", // Tool call completed
  "file_change", // File was modified
  "progress", // General progress update
  "state_change", // Session state transition
  "error", // Error occurred
] as const;

/**
 * Register event emission tools with the MCP server.
 */
export function registerEventTools(server: McpServer, db: Database.Database): void {
  // Emit Ralph event
  server.tool(
    "emit_ralph_event",
    `Emit an event for real-time UI streaming.

Use this tool to report your progress during Ralph sessions. The UI will display
these events in real-time to show users what you're working on.

## When to Call This Tool

| Event Type    | When to Use |
|---------------|-------------|
| thinking      | When starting to analyze or reason about a task |
| tool_start    | Before calling a tool (Edit, Write, Bash, etc.) |
| tool_end      | After a tool call completes (include success/failure) |
| file_change   | When you've modified a file |
| progress      | For general progress updates between major steps |
| state_change  | When transitioning between phases (analyzing → implementing → testing) |
| error         | When an error occurs that users should know about |

## Example Usage

Before reading specs:
  emit_ralph_event({ sessionId: "...", type: "thinking", data: { message: "Reading ticket specification..." } })

Before editing a file:
  emit_ralph_event({ sessionId: "...", type: "tool_start", data: { tool: "Edit", file: "src/api/users.ts" } })

After successful edit:
  emit_ralph_event({ sessionId: "...", type: "tool_end", data: { tool: "Edit", success: true } })

When changing state:
  emit_ralph_event({ sessionId: "...", type: "state_change", data: { state: "testing", message: "Running test suite..." } })

Args:
  sessionId: The Ralph session ID (usually the ticket ID you're working on)
  type: The event type (thinking, tool_start, tool_end, file_change, progress, state_change, error)
  data: Event-specific data object with optional fields:
    - message: Human-readable description of what's happening
    - tool: Tool name (for tool_start/tool_end events)
    - file: File path (for file_change and tool events)
    - state: Current state (for state_change events)
    - error: Error message (for error events)
    - success: Whether operation succeeded (for tool_end events)

Returns:
  The created event with its ID and timestamp.`,
    {
      sessionId: z.string().describe("The Ralph session ID (usually the ticket ID)"),
      type: z.enum(VALID_EVENT_TYPES).describe("The event type"),
      data: z
        .object({
          message: z.string().optional().describe("Human-readable description"),
          tool: z.string().optional().describe("Tool name for tool events"),
          file: z.string().optional().describe("File path for file-related events"),
          state: z.string().optional().describe("Current state for state_change events"),
          error: z.string().optional().describe("Error message for error events"),
          success: z.boolean().optional().describe("Success status for tool_end events"),
        })
        .passthrough()
        .optional()
        .describe("Event-specific data"),
    },
    async ({
      sessionId,
      type,
      data,
    }: {
      sessionId: string;
      type: (typeof VALID_EVENT_TYPES)[number];
      data?: Record<string, unknown> | undefined;
    }) => {
      const id = randomUUID();
      const now = new Date().toISOString();
      const jsonData = data ? JSON.stringify(data) : null;

      try {
        db.prepare(
          "INSERT INTO ralph_events (id, session_id, type, data, created_at) VALUES (?, ?, ?, ?, ?)"
        ).run(id, sessionId, type, jsonData, now);

        log.info(`Ralph event emitted: ${type} for session ${sessionId.substring(0, 8)}...`);

        const event = {
          id,
          sessionId,
          type,
          data: data || {},
          createdAt: now,
        };

        return {
          content: [
            {
              type: "text",
              text: `Event emitted successfully.\n\n${JSON.stringify(event, null, 2)}`,
            },
          ],
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log.error(
          `Failed to emit event (session: ${sessionId}, type: ${type}): ${errorMsg}`,
          err instanceof Error ? err : undefined
        );
        return {
          content: [
            {
              type: "text",
              text: `Failed to emit event: ${errorMsg}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Get Ralph events (for debugging and SSE endpoint support)
  server.tool(
    "get_ralph_events",
    `Get events for a Ralph session.

Retrieves events emitted during a Ralph session. Use this to check the event
history or debug event emission.

Args:
  sessionId: The Ralph session ID to get events for
  since: Optional ISO timestamp to get events after (for polling)
  limit: Maximum number of events to return (default: 50)

Returns:
  Array of events with their types, data, and timestamps.`,
    {
      sessionId: z.string().describe("The Ralph session ID"),
      since: z.string().optional().describe("ISO timestamp to get events after"),
      limit: z.number().optional().default(50).describe("Maximum events to return"),
    },
    async ({
      sessionId,
      since,
      limit = 50,
    }: {
      sessionId: string;
      since?: string | undefined;
      limit?: number | undefined;
    }) => {
      try {
        const events = since
          ? (db
              .prepare(
                "SELECT * FROM ralph_events WHERE session_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT ?"
              )
              .all(sessionId, since, limit) as Array<{
              id: string;
              session_id: string;
              type: string;
              data: string | null;
              created_at: string;
            }>)
          : (db
              .prepare(
                "SELECT * FROM ralph_events WHERE session_id = ? ORDER BY created_at ASC LIMIT ?"
              )
              .all(sessionId, limit) as Array<{
              id: string;
              session_id: string;
              type: string;
              data: string | null;
              created_at: string;
            }>);

        // Parse JSON data field
        const parsedEvents = events.map((event) => ({
          id: event.id,
          sessionId: event.session_id,
          type: event.type,
          data: event.data ? JSON.parse(event.data) : {},
          createdAt: event.created_at,
        }));

        log.info(
          `Retrieved ${parsedEvents.length} events for session ${sessionId.substring(0, 8)}...`
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  sessionId,
                  eventCount: parsedEvents.length,
                  events: parsedEvents,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log.error(
          `Failed to get events (session: ${sessionId}): ${errorMsg}`,
          err instanceof Error ? err : undefined
        );
        return {
          content: [
            {
              type: "text",
              text: `Failed to get events: ${errorMsg}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Clear Ralph events (for cleanup after session ends)
  server.tool(
    "clear_ralph_events",
    `Clear events for a Ralph session.

Removes all events for a session. Use this after a session completes to
clean up the events table.

Args:
  sessionId: The Ralph session ID to clear events for

Returns:
  Number of events deleted.`,
    {
      sessionId: z.string().describe("The Ralph session ID to clear"),
    },
    async ({ sessionId }: { sessionId: string }) => {
      try {
        const result = db
          .prepare("DELETE FROM ralph_events WHERE session_id = ?")
          .run(sessionId) as { changes: number };

        log.info(`Cleared ${result.changes} events for session ${sessionId.substring(0, 8)}...`);

        return {
          content: [
            {
              type: "text",
              text: `Cleared ${result.changes} events for session ${sessionId}.`,
            },
          ],
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log.error(
          `Failed to clear events (session: ${sessionId}): ${errorMsg}`,
          err instanceof Error ? err : undefined
        );
        return {
          content: [
            {
              type: "text",
              text: `Failed to clear events: ${errorMsg}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
