#!/bin/bash
# enforce-state-before-write.sh
# PreToolUse hook for Write and Edit tools
#
# This hook enforces that Claude must be in the 'implementing' or 'testing' state
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
  echo '{"decision": "allow"}'
  exit 0
fi

# Check if we're in Ralph mode (state file exists)
STATE_FILE=".claude/ralph-state.json"
if [[ ! -f "$STATE_FILE" ]]; then
  # Not in Ralph mode - allow normal operation
  echo '{"decision": "allow"}'
  exit 0
fi

# Read current state from file
CURRENT_STATE=$(jq -r '.currentState // "unknown"' "$STATE_FILE" 2>/dev/null || echo "unknown")
SESSION_ID=$(jq -r '.sessionId // "unknown"' "$STATE_FILE" 2>/dev/null || echo "unknown")

# Check if current state allows writing code
# Valid states for code changes: implementing, testing, committing
if [[ "$CURRENT_STATE" == "implementing" || "$CURRENT_STATE" == "testing" || "$CURRENT_STATE" == "committing" ]]; then
  echo '{"decision": "allow"}'
  exit 0
fi

# Block with helpful guidance
cat <<EOF
{
  "decision": "block",
  "message": "STATE ENFORCEMENT: You are in '$CURRENT_STATE' state but tried to write/edit code.\n\nTo write code, you MUST first call:\n\n  update_session_state({ sessionId: \"$SESSION_ID\", state: \"implementing\" })\n\nAfter updating your state, retry this operation.\n\nValid states for writing code: implementing, testing, committing"
}
EOF
