#!/bin/bash
# log-tool-start.sh
# PreToolUse hook for telemetry
#
# Captures tool start events for telemetry tracking.
# - Generates a correlation ID
# - Writes start event to queue file
# - Stores correlation ID for matching with end event

set -e

# Use CLAUDE_PROJECT_DIR for reliable path resolution
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Check if we have an active telemetry session
TELEMETRY_FILE="$PROJECT_DIR/.claude/telemetry-session.json"
if [[ ! -f "$TELEMETRY_FILE" ]]; then
  # No active telemetry session, silently skip
  exit 0
fi

SESSION_ID=$(jq -r '.sessionId // ""' "$TELEMETRY_FILE" 2>/dev/null || echo "")
if [[ -z "$SESSION_ID" ]]; then
  exit 0
fi

# Log file for debugging
LOG_FILE="$PROJECT_DIR/.claude/telemetry.log"

# Queue file for batch processing
QUEUE_FILE="$PROJECT_DIR/.claude/telemetry-queue.jsonl"
mkdir -p "$(dirname "$QUEUE_FILE")"

# Read hook input from stdin
INPUT=$(cat 2>/dev/null || echo "{}")

# Extract tool info from hook input
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool // ""' 2>/dev/null || echo "unknown")
TOOL_INPUT=$(echo "$INPUT" | jq -r '.params // {}' 2>/dev/null || echo "{}")

# Skip logging for telemetry-related tools to avoid recursion
if [[ "$TOOL_NAME" == *"telemetry"* ]]; then
  exit 0
fi

# Generate timestamps
NOW=$(date -Iseconds)
NOW_MS=$(date +%s%3N 2>/dev/null || echo "$(date +%s)000")

# Generate correlation ID for pairing start/end events
CORR_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "corr-$(date +%s)")

# Store correlation ID for the end event using a queue file to handle parallel tool calls
# Each tool has its own queue file with entries in LIFO order (stack)
CORR_FILE="$PROJECT_DIR/.claude/tool-correlation-${TOOL_NAME//[^a-zA-Z0-9]/_}.queue"
echo "$CORR_ID:$NOW_MS" >> "$CORR_FILE"

# Summarize parameters (avoid storing full file contents)
PARAMS_SUMMARY=$(echo "$TOOL_INPUT" | jq -c 'to_entries | map({key: .key, value: (if .value | type == "string" then (if (.value | length) > 100 then "[" + (.value | length | tostring) + " chars]" else .value end) else .value end)}) | from_entries' 2>/dev/null || echo "{}")

# Create and queue the event
EVENT=$(jq -n \
  --arg sessionId "$SESSION_ID" \
  --arg event "start" \
  --arg toolName "$TOOL_NAME" \
  --arg correlationId "$CORR_ID" \
  --argjson params "$PARAMS_SUMMARY" \
  --arg timestamp "$NOW" \
  '{sessionId: $sessionId, event: $event, toolName: $toolName, correlationId: $correlationId, params: $params, timestamp: $timestamp}')

echo "$EVENT" >> "$QUEUE_FILE"
echo "[$(date -Iseconds)] Queued tool_start: $TOOL_NAME (corr: $CORR_ID)" >> "$LOG_FILE"

exit 0
