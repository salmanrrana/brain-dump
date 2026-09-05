#!/bin/bash
# enforce-state-before-write.sh
# PreToolUse hook for Write and Edit tools
#
# This hook requires an implementing, testing, or committing session state
# before writing or editing code files during a Ralph session.
#
# When NOT in Ralph mode (no state file), allows all operations.
# When in Ralph mode, blocks Write/Edit unless in correct state.

set -e

# Read the hook input from stdin
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')

# Only care about Write and Edit tools
if [[ "$TOOL_NAME" != "Write" && "$TOOL_NAME" != "Edit" ]]; then
  exit 0
fi

# Use CLAUDE_PROJECT_DIR for reliable path resolution
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Check if we're in Ralph mode (state file exists)
STATE_FILE="$PROJECT_DIR/.claude/ralph-state.json"
if [[ ! -f "$STATE_FILE" ]]; then
  # Not in Ralph mode - allow normal operation
  exit 0
fi

# Read current state from file
CURRENT_STATE=$(jq -r '.currentState // "unknown"' "$STATE_FILE" 2>/dev/null || echo "unknown")
SESSION_ID=$(jq -r '.sessionId // "unknown"' "$STATE_FILE" 2>/dev/null || echo "unknown")

# Check if current state allows writing code
# Valid states for code changes: implementing, testing, committing
if [[ "$CURRENT_STATE" == "implementing" || "$CURRENT_STATE" == "testing" || "$CURRENT_STATE" == "committing" ]]; then
  exit 0
fi

# Use the current PreToolUse decision envelope; jq safely escapes state values.
jq -n --arg state "$CURRENT_STATE" --arg session "$SESSION_ID" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: ("STATE ENFORCEMENT: You are in " + $state + " state but tried to write/edit code. First call session update-state with sessionId " + $session + " and state implementing, then retry. Valid write states: implementing, testing, committing.")
  }
}'
