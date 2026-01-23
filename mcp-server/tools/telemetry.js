/**
 * Telemetry tools for Brain Dump MCP server.
 * Captures AI interaction telemetry during ticket work sessions.
 * @module tools/telemetry
 */
import { z } from "zod";
import { randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import { log } from "../lib/logging.js";

// Valid telemetry event types (documented for reference)
// - session_start: Session began
// - session_end: Session ended
// - prompt: User prompt submitted
// - tool_start: Tool call started
// - tool_end: Tool call completed
// - mcp_call: MCP tool invocation
// - task_created: Claude Task created
// - task_started: Claude Task started
// - task_completed: Claude Task completed
// - context_loaded: Context loaded (files, comments, images)
// - error: Error occurred

/**
 * Detect active ticket from Ralph state file or git branch.
 * @param {string} projectPath - The project directory
 * @returns {{ticketId: string | null, source: string}}
 */
function detectActiveTicket(projectPath) {
  try {
    // First, try Ralph state file
    const ralphStatePath = join(projectPath, ".claude", "ralph-state.json");
    if (existsSync(ralphStatePath)) {
      const state = JSON.parse(readFileSync(ralphStatePath, "utf-8"));
      if (state.ticketId) {
        return { ticketId: state.ticketId, source: "ralph-state" };
      }
    }

    // Try to get ticket from branch name using execFileSync (safe, no shell injection)
    try {
      const branch = execFileSync("git", ["branch", "--show-current"], {
        cwd: projectPath,
        encoding: "utf-8",
      }).trim();

      // Branch format: feature/{short-id}-{slug}
      const match = branch.match(/^feature\/([a-f0-9]{8})-/);
      if (match) {
        // We have the short ID, but need the full UUID
        // This is a limitation - we'd need DB access to resolve it
        return { ticketId: null, source: "branch-partial", shortId: match[1] };
      }
    } catch {
      // Git not available or not in a repo
    }

    return { ticketId: null, source: "none" };
  } catch (err) {
    return { ticketId: null, source: "error", error: err.message };
  }
}

/**
 * Summarize tool parameters to avoid storing sensitive content.
 * @param {Record<string, unknown>} params
 * @returns {string}
 */
function summarizeParams(params) {
  const summary = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      // Truncate strings and note length
      summary[key] = value.length > 100 ? `[${value.length} chars]` : value;
    } else if (Array.isArray(value)) {
      summary[key] = `[array, ${value.length} items]`;
    } else if (typeof value === "object" && value !== null) {
      summary[key] = `[object, ${Object.keys(value).length} keys]`;
    } else {
      summary[key] = value;
    }
  }
  return JSON.stringify(summary);
}

/**
 * Register telemetry tools with the MCP server.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {import("better-sqlite3").Database} db
 * @param {Function} detectEnvironment - Function to detect current environment
 */
export function registerTelemetryTools(server, db, detectEnvironment) {
  // ============================================
  // start_telemetry_session
  // ============================================
  server.tool(
    "start_telemetry_session",
    `Start a telemetry session for AI work on a ticket.

This tool is typically called automatically by the SessionStart hook when
Claude starts working on a ticket. It creates a new telemetry session to
track all prompts, tool calls, and other interactions.

Args:
  ticketId: Optional ticket ID (auto-detected from Ralph state or branch if not provided)
  projectPath: Optional project path (uses current directory if not provided)
  environment: Optional environment name (auto-detected if not provided)

Returns:
  The created session with its ID for use in subsequent telemetry calls.`,
    {
      ticketId: z.string().optional().describe("The ticket ID (auto-detected if not provided)"),
      projectPath: z.string().optional().describe("Project path (auto-detected if not provided)"),
      environment: z.string().optional().describe("Environment name (auto-detected if not provided)"),
    },
    async ({ ticketId, projectPath, environment }) => {
      const id = randomUUID();
      const now = new Date().toISOString();

      // Detect environment if not provided
      const detectedEnv = environment || detectEnvironment();

      // Try to detect ticket if not provided
      let resolvedTicketId = ticketId;
      let detectionSource = "provided";

      if (!resolvedTicketId && projectPath) {
        const detection = detectActiveTicket(projectPath);
        resolvedTicketId = detection.ticketId;
        detectionSource = detection.source;
      }

      // Get project ID from ticket if we have one
      let projectId = null;
      let branchName = null;
      let ticketTitle = null;

      if (resolvedTicketId) {
        const ticket = db
          .prepare(
            `SELECT t.project_id, t.title, t.branch_name
             FROM tickets t
             WHERE t.id = ?`
          )
          .get(resolvedTicketId);

        if (ticket) {
          projectId = ticket.project_id;
          branchName = ticket.branch_name;
          ticketTitle = ticket.title;
        }
      }

      try {
        db.prepare(
          `INSERT INTO telemetry_sessions
           (id, ticket_id, project_id, environment, branch_name, started_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(id, resolvedTicketId || null, projectId, detectedEnv, branchName, now);

        // Log session start event
        const eventId = randomUUID();
        db.prepare(
          `INSERT INTO telemetry_events
           (id, session_id, ticket_id, event_type, event_data, created_at)
           VALUES (?, ?, ?, 'session_start', ?, ?)`
        ).run(
          eventId,
          id,
          resolvedTicketId || null,
          JSON.stringify({
            environment: detectedEnv,
            ticketDetection: detectionSource,
            branchName,
          }),
          now
        );

        log.info(`Started telemetry session ${id} for ticket ${resolvedTicketId || "unknown"}`);

        return {
          content: [
            {
              type: "text",
              text: `## Telemetry Session Started

**Session ID:** ${id}
**Ticket:** ${ticketTitle || resolvedTicketId || "Not detected"}
**Environment:** ${detectedEnv}
**Detection:** ${detectionSource}
${branchName ? `**Branch:** ${branchName}` : ""}
**Started:** ${now}

Use this session ID for subsequent telemetry calls:
- \`log_prompt_event\` - Log user prompts
- \`log_tool_event\` - Log tool calls
- \`end_telemetry_session\` - Complete the session`,
            },
          ],
        };
      } catch (err) {
        log.error(`Failed to start telemetry session: ${err.message}`);
        return {
          content: [
            {
              type: "text",
              text: `Failed to start telemetry session: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ============================================
  // log_prompt_event
  // ============================================
  server.tool(
    "log_prompt_event",
    `Log a user prompt to the telemetry session.

This is called by the UserPromptSubmit hook to capture what prompts
the user sends to the AI during ticket work.

Args:
  sessionId: The telemetry session ID
  prompt: The full prompt text
  redact: If true, hash the prompt instead of storing it plainly (for privacy)
  tokenCount: Optional token count for the prompt

Returns:
  Confirmation of the logged event.`,
    {
      sessionId: z.string().describe("The telemetry session ID"),
      prompt: z.string().describe("The full prompt text"),
      redact: z.boolean().optional().default(false).describe("Hash the prompt for privacy"),
      tokenCount: z.number().optional().describe("Token count for the prompt"),
    },
    async ({ sessionId, prompt, redact = false, tokenCount }) => {
      // Verify session exists
      const session = db.prepare("SELECT id, ticket_id FROM telemetry_sessions WHERE id = ?").get(sessionId);

      if (!session) {
        return {
          content: [
            {
              type: "text",
              text: `Telemetry session not found: ${sessionId}. Use start_telemetry_session first.`,
            },
          ],
          isError: true,
        };
      }

      const id = randomUUID();
      const now = new Date().toISOString();

      // Optionally redact the prompt
      let storedPrompt = prompt;
      let isRedacted = false;

      if (redact) {
        const { createHash } = await import("crypto");
        storedPrompt = createHash("sha256").update(prompt).digest("hex");
        isRedacted = true;
      }

      const eventData = {
        prompt: storedPrompt,
        promptLength: prompt.length,
        redacted: isRedacted,
      };

      try {
        db.prepare(
          `INSERT INTO telemetry_events
           (id, session_id, ticket_id, event_type, event_data, token_count, created_at)
           VALUES (?, ?, ?, 'prompt', ?, ?, ?)`
        ).run(id, sessionId, session.ticket_id, JSON.stringify(eventData), tokenCount || null, now);

        // Update session stats
        db.prepare("UPDATE telemetry_sessions SET total_prompts = total_prompts + 1 WHERE id = ?").run(sessionId);

        log.info(`Logged prompt event for session ${sessionId.substring(0, 8)}...`);

        return {
          content: [
            {
              type: "text",
              text: `Prompt logged successfully (${prompt.length} chars${isRedacted ? ", redacted" : ""})`,
            },
          ],
        };
      } catch (err) {
        log.error(`Failed to log prompt event: ${err.message}`);
        return {
          content: [
            {
              type: "text",
              text: `Failed to log prompt event: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ============================================
  // log_tool_event
  // ============================================
  server.tool(
    "log_tool_event",
    `Log a tool call to the telemetry session.

This is called by PreToolUse and PostToolUse hooks to capture
what tools the AI uses, their parameters, and results.

Args:
  sessionId: The telemetry session ID
  event: 'start' or 'end' - whether tool is starting or completed
  toolName: Name of the tool (e.g., 'Edit', 'Bash', 'mcp__brain-dump__create_ticket')
  correlationId: Unique ID to pair start/end events (required for 'end' events)
  params: Optional parameter summary (sanitized, not full content)
  result: Optional result summary (for 'end' events)
  success: Whether the tool call succeeded (for 'end' events)
  durationMs: Duration in milliseconds (for 'end' events)
  error: Error message if failed (for 'end' events)

Returns:
  The correlation ID for pairing start/end events.`,
    {
      sessionId: z.string().describe("The telemetry session ID"),
      event: z.enum(["start", "end"]).describe("Whether tool is starting or completed"),
      toolName: z.string().describe("Name of the tool"),
      correlationId: z.string().optional().describe("Unique ID to pair start/end events"),
      params: z.record(z.unknown()).optional().describe("Parameter summary (sanitized)"),
      result: z.string().optional().describe("Result summary"),
      success: z.boolean().optional().describe("Whether tool call succeeded"),
      durationMs: z.number().optional().describe("Duration in milliseconds"),
      error: z.string().optional().describe("Error message if failed"),
    },
    async ({ sessionId, event, toolName, correlationId, params, result, success, durationMs, error }) => {
      // Verify session exists
      const session = db.prepare("SELECT id, ticket_id FROM telemetry_sessions WHERE id = ?").get(sessionId);

      if (!session) {
        return {
          content: [
            {
              type: "text",
              text: `Telemetry session not found: ${sessionId}. Use start_telemetry_session first.`,
            },
          ],
          isError: true,
        };
      }

      const id = randomUUID();
      const now = new Date().toISOString();

      // For start events, generate a correlation ID if not provided
      const corrId = correlationId || (event === "start" ? randomUUID() : null);

      const eventType = event === "start" ? "tool_start" : "tool_end";

      // Build event data - sanitize params to avoid storing sensitive content
      const eventData = {
        toolName,
        ...(params && { paramsSummary: summarizeParams(params) }),
        ...(result && { resultSummary: result.substring(0, 500) }),
        ...(success !== undefined && { success }),
        ...(error && { error }),
      };

      try {
        db.prepare(
          `INSERT INTO telemetry_events
           (id, session_id, ticket_id, event_type, tool_name, event_data, duration_ms, is_error, correlation_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          sessionId,
          session.ticket_id,
          eventType,
          toolName,
          JSON.stringify(eventData),
          durationMs || null,
          error ? 1 : 0,
          corrId,
          now
        );

        // Update session stats on tool_end
        if (event === "end") {
          db.prepare("UPDATE telemetry_sessions SET total_tool_calls = total_tool_calls + 1 WHERE id = ?").run(
            sessionId
          );
        }

        log.info(`Logged ${eventType} event: ${toolName} for session ${sessionId.substring(0, 8)}...`);

        return {
          content: [
            {
              type: "text",
              text:
                event === "start"
                  ? `Tool start logged: ${toolName} (correlation: ${corrId})`
                  : `Tool end logged: ${toolName} (${success ? "success" : "failed"}${durationMs ? `, ${durationMs}ms` : ""})`,
            },
          ],
        };
      } catch (err) {
        log.error(`Failed to log tool event: ${err.message}`);
        return {
          content: [
            {
              type: "text",
              text: `Failed to log tool event: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ============================================
  // log_context_event
  // ============================================
  server.tool(
    "log_context_event",
    `Log what context was loaded when AI started work on a ticket.

This is called by start_ticket_work to record what context the AI received,
creating an audit trail of the information provided.

Args:
  sessionId: The telemetry session ID
  hasDescription: Whether ticket had a description
  hasAcceptanceCriteria: Whether ticket had acceptance criteria
  criteriaCount: Number of acceptance criteria
  commentCount: Number of comments loaded
  attachmentCount: Number of attachments loaded
  imageCount: Number of images loaded

Returns:
  Confirmation of the logged event.`,
    {
      sessionId: z.string().describe("The telemetry session ID"),
      hasDescription: z.boolean().describe("Whether ticket had a description"),
      hasAcceptanceCriteria: z.boolean().describe("Whether ticket had acceptance criteria"),
      criteriaCount: z.number().default(0).describe("Number of acceptance criteria"),
      commentCount: z.number().default(0).describe("Number of comments loaded"),
      attachmentCount: z.number().default(0).describe("Number of attachments loaded"),
      imageCount: z.number().default(0).describe("Number of images loaded"),
    },
    async ({ sessionId, hasDescription, hasAcceptanceCriteria, criteriaCount, commentCount, attachmentCount, imageCount }) => {
      // Verify session exists
      const session = db.prepare("SELECT id, ticket_id FROM telemetry_sessions WHERE id = ?").get(sessionId);

      if (!session) {
        return {
          content: [
            {
              type: "text",
              text: `Telemetry session not found: ${sessionId}. Use start_telemetry_session first.`,
            },
          ],
          isError: true,
        };
      }

      const id = randomUUID();
      const now = new Date().toISOString();

      const eventData = {
        hasDescription,
        hasAcceptanceCriteria,
        criteriaCount,
        commentCount,
        attachmentCount,
        imageCount,
      };

      try {
        db.prepare(
          `INSERT INTO telemetry_events
           (id, session_id, ticket_id, event_type, event_data, created_at)
           VALUES (?, ?, ?, 'context_loaded', ?, ?)`
        ).run(id, sessionId, session.ticket_id, JSON.stringify(eventData), now);

        log.info(`Logged context_loaded event for session ${sessionId.substring(0, 8)}...`);

        return {
          content: [
            {
              type: "text",
              text: `Context loaded event logged: ${criteriaCount} criteria, ${commentCount} comments, ${imageCount} images`,
            },
          ],
        };
      } catch (err) {
        log.error(`Failed to log context event: ${err.message}`);
        return {
          content: [
            {
              type: "text",
              text: `Failed to log context event: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ============================================
  // end_telemetry_session
  // ============================================
  server.tool(
    "end_telemetry_session",
    `End a telemetry session and compute final statistics.

This is called by the Stop hook when the Claude session ends.
It marks the session as complete and computes summary statistics.

Args:
  sessionId: The telemetry session ID
  outcome: Optional outcome ('success', 'failure', 'timeout', 'cancelled')
  totalTokens: Optional total token count for the session

Returns:
  Session summary with statistics.`,
    {
      sessionId: z.string().describe("The telemetry session ID"),
      outcome: z.enum(["success", "failure", "timeout", "cancelled"]).optional().describe("Session outcome"),
      totalTokens: z.number().optional().describe("Total token count"),
    },
    async ({ sessionId, outcome, totalTokens }) => {
      // Get session
      const session = db.prepare("SELECT * FROM telemetry_sessions WHERE id = ?").get(sessionId);

      if (!session) {
        return {
          content: [
            {
              type: "text",
              text: `Telemetry session not found: ${sessionId}`,
            },
          ],
          isError: true,
        };
      }

      if (session.ended_at) {
        return {
          content: [
            {
              type: "text",
              text: `Session ${sessionId} already ended at ${session.ended_at}`,
            },
          ],
          isError: true,
        };
      }

      const now = new Date().toISOString();
      const startTime = new Date(session.started_at).getTime();
      const endTime = new Date(now).getTime();
      const totalDurationMs = endTime - startTime;

      try {
        // Log session end event
        const eventId = randomUUID();
        db.prepare(
          `INSERT INTO telemetry_events
           (id, session_id, ticket_id, event_type, event_data, created_at)
           VALUES (?, ?, ?, 'session_end', ?, ?)`
        ).run(
          eventId,
          sessionId,
          session.ticket_id,
          JSON.stringify({
            outcome,
            totalDurationMs,
            totalPrompts: session.total_prompts,
            totalToolCalls: session.total_tool_calls,
            totalTokens,
          }),
          now
        );

        // Update session
        db.prepare(
          `UPDATE telemetry_sessions
           SET ended_at = ?, total_duration_ms = ?, total_tokens = ?, outcome = ?
           WHERE id = ?`
        ).run(now, totalDurationMs, totalTokens || null, outcome || null, sessionId);

        const durationMin = Math.round(totalDurationMs / 60000);

        log.info(`Ended telemetry session ${sessionId}: ${session.total_prompts} prompts, ${session.total_tool_calls} tools, ${durationMin}min`);

        return {
          content: [
            {
              type: "text",
              text: `## Telemetry Session Ended

**Session ID:** ${sessionId.substring(0, 8)}...
**Duration:** ${durationMin} minutes
**Outcome:** ${outcome || "not specified"}

### Statistics
- **Prompts:** ${session.total_prompts}
- **Tool Calls:** ${session.total_tool_calls}
${totalTokens ? `- **Total Tokens:** ${totalTokens}` : ""}`,
            },
          ],
        };
      } catch (err) {
        log.error(`Failed to end telemetry session: ${err.message}`);
        return {
          content: [
            {
              type: "text",
              text: `Failed to end telemetry session: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ============================================
  // get_telemetry_session
  // ============================================
  server.tool(
    "get_telemetry_session",
    `Get telemetry data for a session.

Retrieves session details and events for analysis or debugging.

Args:
  sessionId: The telemetry session ID (optional if ticketId provided)
  ticketId: Get the most recent session for a ticket (optional)
  includeEvents: Whether to include event details (default: true)
  eventLimit: Maximum events to return (default: 100)

Returns:
  Session data with events.`,
    {
      sessionId: z.string().optional().describe("The telemetry session ID"),
      ticketId: z.string().optional().describe("Get recent session for a ticket"),
      includeEvents: z.boolean().optional().default(true).describe("Include event details"),
      eventLimit: z.number().optional().default(100).describe("Maximum events to return"),
    },
    async ({ sessionId, ticketId, includeEvents = true, eventLimit = 100 }) => {
      if (!sessionId && !ticketId) {
        return {
          content: [
            {
              type: "text",
              text: "Either sessionId or ticketId must be provided.",
            },
          ],
          isError: true,
        };
      }

      let session;
      if (sessionId) {
        session = db.prepare("SELECT * FROM telemetry_sessions WHERE id = ?").get(sessionId);
      } else {
        session = db
          .prepare(
            `SELECT * FROM telemetry_sessions
             WHERE ticket_id = ?
             ORDER BY started_at DESC
             LIMIT 1`
          )
          .get(ticketId);
      }

      if (!session) {
        return {
          content: [
            {
              type: "text",
              text: `No telemetry session found for: ${sessionId || ticketId}`,
            },
          ],
          isError: true,
        };
      }

      let events = [];
      if (includeEvents) {
        events = db
          .prepare(
            `SELECT * FROM telemetry_events
             WHERE session_id = ?
             ORDER BY created_at ASC
             LIMIT ?`
          )
          .all(session.id, eventLimit);

        // Parse event data
        events = events.map((e) => ({
          ...e,
          eventData: e.event_data ? JSON.parse(e.event_data) : null,
        }));
      }

      // Get ticket title if linked
      let ticketTitle = null;
      if (session.ticket_id) {
        const ticket = db.prepare("SELECT title FROM tickets WHERE id = ?").get(session.ticket_id);
        ticketTitle = ticket?.title;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                session: {
                  id: session.id,
                  ticketId: session.ticket_id,
                  ticketTitle,
                  environment: session.environment,
                  branchName: session.branch_name,
                  startedAt: session.started_at,
                  endedAt: session.ended_at,
                  totalPrompts: session.total_prompts,
                  totalToolCalls: session.total_tool_calls,
                  totalDurationMs: session.total_duration_ms,
                  totalTokens: session.total_tokens,
                  outcome: session.outcome,
                },
                eventCount: events.length,
                events: includeEvents ? events : "omitted",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ============================================
  // list_telemetry_sessions
  // ============================================
  server.tool(
    "list_telemetry_sessions",
    `List telemetry sessions with optional filters.

Args:
  ticketId: Filter by ticket ID
  projectId: Filter by project ID
  since: Only sessions started after this date (ISO format)
  limit: Maximum sessions to return (default: 20)

Returns:
  Array of session summaries.`,
    {
      ticketId: z.string().optional().describe("Filter by ticket ID"),
      projectId: z.string().optional().describe("Filter by project ID"),
      since: z.string().optional().describe("Sessions started after this date"),
      limit: z.number().optional().default(20).describe("Maximum sessions to return"),
    },
    async ({ ticketId, projectId, since, limit = 20 }) => {
      let query = "SELECT * FROM telemetry_sessions WHERE 1=1";
      const params = [];

      if (ticketId) {
        query += " AND ticket_id = ?";
        params.push(ticketId);
      }
      if (projectId) {
        query += " AND project_id = ?";
        params.push(projectId);
      }
      if (since) {
        query += " AND started_at >= ?";
        params.push(since);
      }

      query += " ORDER BY started_at DESC LIMIT ?";
      params.push(limit);

      const sessions = db.prepare(query).all(...params);

      // Enrich with ticket titles
      const enriched = sessions.map((s) => {
        let ticketTitle = null;
        if (s.ticket_id) {
          const ticket = db.prepare("SELECT title FROM tickets WHERE id = ?").get(s.ticket_id);
          ticketTitle = ticket?.title;
        }

        return {
          id: s.id,
          ticketId: s.ticket_id,
          ticketTitle,
          environment: s.environment,
          startedAt: s.started_at,
          endedAt: s.ended_at,
          totalPrompts: s.total_prompts,
          totalToolCalls: s.total_tool_calls,
          durationMin: s.total_duration_ms ? Math.round(s.total_duration_ms / 60000) : null,
          outcome: s.outcome,
        };
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                sessionCount: enriched.length,
                sessions: enriched,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
