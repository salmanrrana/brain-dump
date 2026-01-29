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

# Only care about session state tools
case "$TOOL_NAME" in
  mcp__brain-dump__update_session_state|mcp__brain-dump__create_ralph_session|mcp__brain-dump__complete_ralph_session)
    # This is a session tool - log it
    ;;
  *)
    # Not a session tool - just pass through
    echo "$INPUT" | jq '.tool_result // empty'
    exit 0
    ;;
esac

# Use CLAUDE_PROJECT_DIR for reliable path resolution
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Extract state info
STATE=$(echo "$INPUT" | jq -r '.tool_input.state // "session"')
SESSION_ID=$(echo "$INPUT" | jq -r '.tool_input.sessionId // .tool_input.ticketId // "unknown"')
TIMESTAMP=$(date -Iseconds)

# Log to state change log
LOG_FILE="$PROJECT_DIR/.claude/ralph-state.log"
mkdir -p "$(dirname "$LOG_FILE")"

case "$TOOL_NAME" in
  *create_ralph_session)
    echo "[$TIMESTAMP] SESSION CREATED: ticket=$SESSION_ID" >> "$LOG_FILE"
    ;;
  *update_session_state)
    echo "[$TIMESTAMP] STATE CHANGED: session=$SESSION_ID state=$STATE" >> "$LOG_FILE"
    ;;
  *complete_ralph_session)
    OUTCOME=$(echo "$INPUT" | jq -r '.tool_input.outcome // "unknown"')
    echo "[$TIMESTAMP] SESSION COMPLETED: session=$SESSION_ID outcome=$OUTCOME" >> "$LOG_FILE"
    ;;
esac

# PostToolUse hooks should return the tool result unchanged
echo "$INPUT" | jq '.tool_result // empty'
