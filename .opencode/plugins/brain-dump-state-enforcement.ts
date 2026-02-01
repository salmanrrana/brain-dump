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
        // State file is corrupted - this is critical, don't silently ignore
        throw new Error(
          `STATE ENFORCEMENT: Ralph state file is corrupted at ${stateFilePath}\n\n` +
            `This usually happens if the file was edited incorrectly or the system crashed during writing.\n\n` +
            `Error: ${error instanceof Error ? error.message : String(error)}\n\n` +
            `To recover, run: rm .claude/ralph-state.json`
        );
      }

      // Validate required fields exist
      const currentState = ralphState.currentState;
      if (!currentState || typeof currentState !== "string") {
        throw new Error(
          `STATE ENFORCEMENT: Ralph state file is missing 'currentState' field.\n\n` +
            `The state file at ${stateFilePath} is incomplete or corrupted.\n\n` +
            `To recover, run: rm .claude/ralph-state.json`
        );
      }

      const sessionId = ralphState.sessionId;
      if (!sessionId || typeof sessionId !== "string") {
        throw new Error(
          `STATE ENFORCEMENT: Ralph state file is missing 'sessionId' field.\n\n` +
            `The state file at ${stateFilePath} is incomplete or corrupted.\n\n` +
            `To recover, run: rm .claude/ralph-state.json`
        );
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
