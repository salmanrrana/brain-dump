/**
 * Brain Dump State Enforcement Plugin for OpenCode
 *
 * Enforces the Universal Quality Workflow (UQW) state machine by blocking
 * Write/Edit operations unless the Ralph session is in a code-writing state.
 *
 * The Ralph state machine has 7 states, but only 3 allow code writing:
 * - implementing: actively writing code
 * - testing: running tests or fixing test failures
 * - committing: preparing commits
 *
 * When not in Ralph mode (no .claude/ralph-state.json file), all operations
 * are allowed (fail open).
 *
 * Reference: https://opencode.ai/docs/plugins/
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const VALID_WRITING_STATES = ["implementing", "testing", "committing"];
const ENFORCEABLE_TOOLS = ["Write", "Edit", "NotebookEdit"];

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
     * Called before Write/Edit/NotebookEdit tools execute.
     * Checks if current Ralph state allows code writing.
     * Throws error if state doesn't allow it (blocking the operation).
     * Allows all operations when not in Ralph mode (fail open).
     */
    "tool.execute.before": async (input: any) => {
      const toolName = input.tool || "";

      // Only enforce on code-writing tools
      if (!ENFORCEABLE_TOOLS.includes(toolName)) {
        return;
      }

      // Check for Ralph state file
      const stateFilePath = join(projectPath, ".claude", "ralph-state.json");
      if (!existsSync(stateFilePath)) {
        // Not in Ralph mode - allow operation
        return;
      }

      // Read and parse state file
      let ralphState: any;
      try {
        const content = readFileSync(stateFilePath, "utf-8");
        ralphState = JSON.parse(content);
      } catch (error) {
        // If state file is corrupted or unreadable, allow operation (fail open)
        // This prevents the plugin from breaking the workflow
        return;
      }

      // Validate required fields exist before using them
      const currentState = ralphState.currentState;
      if (!currentState || typeof currentState !== "string") {
        // State file is missing required fields - treat as corrupt, allow operation
        return;
      }

      const sessionId = ralphState.sessionId;
      if (!sessionId || typeof sessionId !== "string") {
        // State file is missing sessionId - can't provide helpful error anyway
        return;
      }

      // Check if current state allows writing
      if (!VALID_WRITING_STATES.includes(currentState)) {
        const validStates = VALID_WRITING_STATES.join(", ");
        throw new Error(
          `STATE ENFORCEMENT: You are in '${currentState}' state but tried to write/edit code.\n\n` +
            `Valid states for writing code: ${validStates}\n\n` +
            `To fix this, call:\n` +
            `update_session_state({ sessionId: "${sessionId}", state: "implementing" })`
        );
      }
    },
  };
};
