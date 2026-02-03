#!/bin/bash
# record-state-change.sh
# PostToolUse hook for MCP session state tools
#
# This hook logs state changes for debugging and audit purposes.
# It doesn't block anything - just records when state transitions occur.

set -e

# Read the hook input from stdin
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')

# Only care about the consolidated session tool
if [[ "$TOOL_NAME" != "mcp__brain-dump__session" ]]; then
  echo "$INPUT" | jq '.tool_result // empty'
  exit 0
fi

# Check the action to determine what kind of session operation
TOOL_INPUT_JSON=$(echo "$INPUT" | jq -r '.tool_input // "{}"')
ACTION=$(echo "$TOOL_INPUT_JSON" | jq -r '.action // ""')

# Only log session state-related actions
case "$ACTION" in
  create|update-state|complete)
    # This is a session state action - log it
    ;;
  *)
    # Not a state action - just pass through
    echo "$INPUT" | jq '.tool_result // empty'
    exit 0
    ;;
esac

# Use CLAUDE_PROJECT_DIR for reliable path resolution
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Extract state info
STATE=$(echo "$TOOL_INPUT_JSON" | jq -r '.state // "session"')
SESSION_ID=$(echo "$TOOL_INPUT_JSON" | jq -r '.sessionId // .ticketId // "unknown"')
TIMESTAMP=$(date -Iseconds)

# Log to state change log
LOG_FILE="$PROJECT_DIR/.claude/ralph-state.log"
mkdir -p "$(dirname "$LOG_FILE")"

case "$ACTION" in
  create)
    echo "[$TIMESTAMP] SESSION CREATED: ticket=$SESSION_ID" >> "$LOG_FILE"
    ;;
  update-state)
    echo "[$TIMESTAMP] STATE CHANGED: session=$SESSION_ID state=$STATE" >> "$LOG_FILE"
    ;;
  complete)
    OUTCOME=$(echo "$TOOL_INPUT_JSON" | jq -r '.outcome // "unknown"')
    echo "[$TIMESTAMP] SESSION COMPLETED: session=$SESSION_ID outcome=$OUTCOME" >> "$LOG_FILE"
    ;;
esac

# PostToolUse hooks should return the tool result unchanged
echo "$INPUT" | jq '.tool_result // empty'
