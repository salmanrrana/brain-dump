#!/bin/bash
# log-tool-failure.sh
# postToolUseFailure hook for Cursor telemetry
#
# Captures tool failures during AI sessions for telemetry.
# Records tool failures with error details and correlation to the original start event.
#
# Cursor hook differences from Claude Code:
# - Uses CURSOR_PROJECT_DIR environment variable
# - Stores files in .cursor/ instead of .claude/
# - Captured when a tool fails unexpectedly

set -e

# Read the hook input from stdin
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')
ERROR_MSG=$(echo "$INPUT" | jq -r '.error // ""')

# Use CURSOR_PROJECT_DIR for reliable path resolution
PROJECT_DIR="${CURSOR_PROJECT_DIR:-$(pwd)}"

# Check if we have an active telemetry session
TELEMETRY_FILE="$PROJECT_DIR/.cursor/telemetry-session.json"
if [[ ! -f "$TELEMETRY_FILE" ]]; then
  # No active telemetry session, silently skip
  exit 0
fi

SESSION_ID=$(jq -r '.sessionId // ""' "$TELEMETRY_FILE" 2>/dev/null || echo "")
if [[ -z "$SESSION_ID" ]]; then
  exit 0
fi

# Log file for debugging
LOG_FILE="$PROJECT_DIR/.cursor/telemetry.log"

# Queue file for batch processing
QUEUE_FILE="$PROJECT_DIR/.cursor/telemetry-queue.jsonl"
mkdir -p "$(dirname "$QUEUE_FILE")"

NOW=$(date -Iseconds)
NOW_MS=$(date +%s%3N 2>/dev/null || echo "$(date +%s)000")

# Retrieve correlation ID and start time
CORR_FILE="$PROJECT_DIR/.cursor/tool-correlation-${TOOL_NAME//[^a-zA-Z0-9]/_}.txt"
CORR_ID=""
START_MS="0"

if [[ -f "$CORR_FILE" ]]; then
  CORR_DATA=$(cat "$CORR_FILE")
  CORR_ID=$(echo "$CORR_DATA" | cut -d: -f1)
  START_MS=$(echo "$CORR_DATA" | cut -d: -f2)
  rm -f "$CORR_FILE"
fi

# Calculate duration
DURATION_MS=$((NOW_MS - START_MS))

# Limit error message length
ERROR_SUMMARY=$(echo "$ERROR_MSG" | head -c 500)

# Queue the failure event
EVENT=$(jq -n \
  --arg sessionId "$SESSION_ID" \
  --arg event "end" \
  --arg toolName "$TOOL_NAME" \
  --arg correlationId "$CORR_ID" \
  --argjson durationMs "$DURATION_MS" \
  --arg error "$ERROR_SUMMARY" \
  --arg timestamp "$NOW" \
  '{sessionId: $sessionId, event: $event, toolName: $toolName, correlationId: $correlationId, durationMs: $durationMs, success: false, error: $error, timestamp: $timestamp}')

echo "$EVENT" >> "$QUEUE_FILE"
echo "[$(date -Iseconds)] Queued tool_failure: $TOOL_NAME (${DURATION_MS}ms, error: $(echo "$ERROR_MSG" | head -c 50)...)" >> "$LOG_FILE"

exit 0
