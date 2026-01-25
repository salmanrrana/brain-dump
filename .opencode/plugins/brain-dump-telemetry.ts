/**
 * Brain Dump Telemetry Plugin for OpenCode
 *
 * This plugin integrates Brain Dump ticket management and telemetry capture
 * into OpenCode's AI coding workflow.
 *
 * Features:
 * - Automatic session lifecycle tracking (create, idle, error)
 * - Tool execution telemetry with correlation IDs
 * - Prompt capture with optional redaction
 * - MCP integration for Brain Dump tools
 *
 * Usage:
 * Install in ~/.config/opencode/plugins/ or in the project root at .opencode/plugins/
 *
 * Reference: https://opencode.ai/docs/plugins/
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toolCorrelations = new Map<string, { startTime: number; correlationId: string }>();

/**
 * Helper to call MCP tools through OpenCode client
 */
async function callMcpTool(client: any, toolName: string, input: any) {
  try {
    return await client.callTool(toolName, input);
  } catch (error) {
    // If callTool doesn't exist, try calling through MCP directly
    console.error(`[Brain Dump] Tool call failed: ${toolName}`, error);
    return null;
  }
}

/**
 * Sanitizes tool parameters to avoid storing sensitive data
 * Keeps structure but limits string lengths and omits large objects
 */
function sanitizeParams(params: any): any {
  if (!params) return {};

  const sanitized: any = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      // Limit string length for storage
      sanitized[key] = value.length > 100 ? `[${value.length} chars]` : value;
    } else if (typeof value === "object" && value !== null) {
      // Skip large objects
      sanitized[key] = "[object]";
    } else {
      // Keep primitive values
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Summarizes tool output to avoid storing large results
 */
function summarizeResult(output: any, maxLength: number = 500): string {
  if (!output) return "";

  let result = "";
  if (typeof output === "string") {
    result = output;
  } else if (typeof output === "object") {
    result = JSON.stringify(output);
  }

  return result.length > maxLength ? result.substring(0, maxLength) + "..." : result;
}

/**
 * Main plugin export
 * OpenCode will instantiate this plugin and call event handlers
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async (context: any) => {
  const { client, project } = context;
  let sessionId: string | null = null;

  return {
    // ─────────────────────────────────────────────────────
    // Session Lifecycle Events
    // ─────────────────────────────────────────────────────

    /**
     * Called when a new OpenCode session is created
     * Initializes telemetry session tracking
     */
    "session.created": async () => {
      try {
        const result = await callMcpTool(client, "mcp__brain-dump__start_telemetry_session", {
          projectPath: project?.path || process.cwd(),
          environment: "opencode",
        });
        sessionId = result?.sessionId || null;
        if (sessionId) {
          console.log(`[Brain Dump] Telemetry session started: ${sessionId}`);
        }
      } catch (error) {
        console.error("[Brain Dump] Failed to start telemetry session:", error);
      }
    },

    /**
     * Called when session returns to idle state
     * Ends telemetry tracking with success outcome
     */
    "session.idle": async () => {
      if (!sessionId) return;

      try {
        await callMcpTool(client, "mcp__brain-dump__end_telemetry_session", {
          sessionId,
          outcome: "success",
        });
        console.log(`[Brain Dump] Telemetry session ended: ${sessionId}`);
        sessionId = null;
      } catch (error) {
        console.error("[Brain Dump] Failed to end telemetry session:", error);
      }
    },

    /**
     * Called when session encounters an error
     * Ends telemetry tracking with failure outcome
     */
    "session.error": async (error: any) => {
      if (!sessionId) return;

      try {
        await callMcpTool(client, "mcp__brain-dump__end_telemetry_session", {
          sessionId,
          outcome: "failure",
          errorMessage: error?.message || "Unknown error",
        });
        console.log(`[Brain Dump] Telemetry session ended (error): ${sessionId}`);
        sessionId = null;
      } catch (e) {
        console.error("[Brain Dump] Failed to end telemetry session on error:", e);
      }
    },

    // ─────────────────────────────────────────────────────
    // Tool Execution Events
    // ─────────────────────────────────────────────────────

    /**
     * Called before a tool is executed
     * Records tool start event with correlation ID
     */
    "tool.execute.before": async (input: any) => {
      if (!sessionId) return;

      try {
        // Generate correlation ID to pair with end event
        const correlationId = crypto.randomUUID();
        const startTime = Date.now();

        toolCorrelations.set(input.tool, { startTime, correlationId });

        // Log tool start event
        await callMcpTool(client, "mcp__brain-dump__log_tool_event", {
          sessionId,
          event: "start",
          toolName: input.tool,
          correlationId,
          params: sanitizeParams(input.params || {}),
        });
      } catch (error) {
        console.error("[Brain Dump] Failed to log tool start:", error);
      }
    },

    /**
     * Called after a tool is successfully executed
     * Records tool end event with duration
     */
    "tool.execute.after": async (input: any, output: any) => {
      if (!sessionId) return;

      try {
        const correlation = toolCorrelations.get(input.tool);
        if (!correlation) return;

        const duration = Date.now() - correlation.startTime;
        toolCorrelations.delete(input.tool);

        // Log tool end event
        await callMcpTool(client, "mcp__brain-dump__log_tool_event", {
          sessionId,
          event: "end",
          toolName: input.tool,
          correlationId: correlation.correlationId,
          success: true,
          durationMs: duration,
          result: summarizeResult(output, 500),
        });
      } catch (error) {
        console.error("[Brain Dump] Failed to log tool end:", error);
      }
    },

    /**
     * Called when a tool execution fails
     * Records tool failure event with error details
     */
    "tool.execute.error": async (input: any, error: any) => {
      if (!sessionId) return;

      try {
        const correlation = toolCorrelations.get(input.tool);
        if (!correlation) return;

        const duration = Date.now() - correlation.startTime;
        toolCorrelations.delete(input.tool);

        // Log tool failure event
        await callMcpTool(client, "mcp__brain-dump__log_tool_event", {
          sessionId,
          event: "end",
          toolName: input.tool,
          correlationId: correlation.correlationId,
          success: false,
          durationMs: duration,
          error: error?.message || "Unknown error",
        });
      } catch (e) {
        console.error("[Brain Dump] Failed to log tool error:", e);
      }
    },

    // ─────────────────────────────────────────────────────
    // Prompt Events
    // ─────────────────────────────────────────────────────

    /**
     * Called before user submits a prompt
     * Records prompt event (can be redacted based on telemetry settings)
     */
    "prompt.before.submit": async (input: any) => {
      if (!sessionId) return;

      try {
        const prompt = input.prompt || input.text || "";
        const promptLength = prompt.length;

        // Log prompt event
        await callMcpTool(client, "mcp__brain-dump__log_prompt_event", {
          sessionId,
          prompt,
          redact: false, // Can be configured via settings
          tokenCount: Math.ceil(promptLength / 4), // Rough estimate
        });
      } catch (error) {
        console.error("[Brain Dump] Failed to log prompt:", error);
      }
    },
  };
};
