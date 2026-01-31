/**
 * Brain Dump State Enforcement Plugin for OpenCode
 *
 * This plugin enforces the Universal Quality Workflow (UQW) state machine by blocking
 * Write/Edit operations unless the Ralph session is in a valid code-writing state.
 *
 * The Ralph state machine has 7 states, but only 3 allow code writing:
 * - implementing: actively writing code
 * - testing: running tests or fixing test failures
 * - committing: preparing commits
 *
 * When not in Ralph mode (no .claude/ralph-state.json file), the plugin allows
 * all operations (fail open).
 *
 * Features:
 * - Reads .claude/ralph-state.json to check current state
 * - Blocks Write/Edit tools if in wrong state with helpful error message
 * - Error message includes exact MCP command to fix state
 * - Gracefully degrades when not in Ralph mode
 *
 * Reference: https://opencode.ai/docs/plugins/
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Valid states that allow code writing
const VALID_WRITING_STATES = ["implementing", "testing", "committing"];

/**
 * Reads the Ralph state file and returns the current state and sessionId
 * Returns null if not in Ralph mode (file doesn't exist)
 */
function getRalphState(projectPath: string): { state: string; sessionId: string } | null {
  try {
    const stateFilePath = join(projectPath, ".claude", "ralph-state.json");

    // If state file doesn't exist, we're not in Ralph mode
    if (!existsSync(stateFilePath)) {
      return null;
    }

    const content = readFileSync(stateFilePath, "utf-8");
    const state = JSON.parse(content);

    return {
      state: state.currentState || "unknown",
      sessionId: state.sessionId || "unknown",
    };
  } catch (error) {
    // If we can't read the file, gracefully degrade and allow the operation
    // This prevents the plugin from breaking the workflow if the state file is corrupted
    return null;
  }
}

/**
 * Formats an error message that helps the user fix the state enforcement issue
 */
function formatStateEnforcementError(currentState: string, sessionId: string): string {
  const validStates = VALID_WRITING_STATES.join(", ");
  const updateCommand = `update_session_state({ sessionId: "${sessionId}", state: "implementing" })`;

  return (
    `STATE ENFORCEMENT: You are in '${currentState}' state but tried to write/edit code.\n\n` +
    `Valid states for writing code: ${validStates}\n\n` +
    `To fix this, call:\n${updateCommand}`
  );
}

/**
 * Main plugin export
 * OpenCode will instantiate this plugin and call event handlers
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async (context: any) => {
  const { project } = context;
  const projectPath = project?.path || process.cwd();

  return {
    /**
     * Called before Write or Edit tools execute
     * Checks if the current state allows code writing
     * Throws error if in wrong state (blocking the operation)
     */
    "tool.execute.before": async (input: any) => {
      // Only enforce on Write/Edit tools
      const toolName = input.tool || "";
      if (toolName !== "Write" && toolName !== "Edit" && toolName !== "NotebookEdit") {
        return; // Allow other tools
      }

      // Get current Ralph state
      const ralphState = getRalphState(projectPath);

      // If not in Ralph mode, allow all operations (fail open)
      if (!ralphState) {
        return;
      }

      // Check if current state allows code writing
      const { state, sessionId } = ralphState;
      if (!VALID_WRITING_STATES.includes(state)) {
        throw new Error(formatStateEnforcementError(state, sessionId));
      }
    },
  };
};
