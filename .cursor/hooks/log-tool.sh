#!/bin/bash
# log-tool.sh
# Cursor preToolUse and postToolUse hook for telemetry
#
# This script handles both start and end events:
# - For preToolUse: generates correlation ID, queues start event
# - For postToolUse: retrieves correlation ID, calculates duration, queues end event
#
# The hook type is determined by the event data passed via stdin.

set -e

# Use CURSOR_PROJECT_DIR for reliable path resolution
PROJECT_DIR="${CURSOR_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$(pwd)}}"

# Check if we have an active telemetry session (check both .cursor and .claude)
TELEMETRY_FILE="$PROJECT_DIR/.cursor/telemetry-session.json"
if [[ ! -f "$TELEMETRY_FILE" ]]; then
  TELEMETRY_FILE="$PROJECT_DIR/.claude/telemetry-session.json"
fi
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
mkdir -p "$(dirname "$LOG_FILE")"

# Queue file for batch processing
QUEUE_FILE="$PROJECT_DIR/.cursor/telemetry-queue.jsonl"
mkdir -p "$(dirname "$QUEUE_FILE")"

# Read hook input from stdin
INPUT=$(cat 2>/dev/null || echo "{}")

# Extract tool info from hook input
# Cursor provides: tool_name, conversation_id, generation_id, params/input
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // .tool // .name // ""' 2>/dev/null || echo "unknown")
TOOL_INPUT=$(echo "$INPUT" | jq -r '.params // .input // {}' 2>/dev/null || echo "{}")
RESULT=$(echo "$INPUT" | jq -r '.result // .output // ""' 2>/dev/null || echo "")

# Skip logging for telemetry-related tools to avoid recursion
if [[ "$TOOL_NAME" == *"telemetry"* ]]; then
  exit 0
fi

# Generate timestamps
NOW=$(date -Iseconds)
NOW_MS=$(date +%s%3N 2>/dev/null || echo "$(date +%s)000")

# Correlation file for this tool
CORR_FILE="$PROJECT_DIR/.cursor/tool-correlation-${TOOL_NAME//[^a-zA-Z0-9]/_}.queue"
CORR_LOCK="$PROJECT_DIR/.cursor/tool-correlation-${TOOL_NAME//[^a-zA-Z0-9]/_}.lock"

# Determine if this is a start (preToolUse) or end (postToolUse) event
# If we have a result or output, it's an end event
if [[ -n "$RESULT" ]] || echo "$INPUT" | jq -e '.result // .output' > /dev/null 2>&1; then
  # This is an END event (postToolUse)

  CORR_ID=""
  START_MS="0"

  if [[ -f "$CORR_FILE" ]] && [[ -s "$CORR_FILE" ]]; then
    # Use flock for atomic read-and-remove
    (
      flock -x 200 2>/dev/null || true
      if [[ -s "$CORR_FILE" ]]; then
        CORR_DATA=$(head -1 "$CORR_FILE" 2>/dev/null || echo "")
        if [[ -n "$CORR_DATA" ]]; then
          echo "$CORR_DATA" > "$CORR_FILE.data"
          tail -n +2 "$CORR_FILE" > "$CORR_FILE.tmp" 2>/dev/null && mv "$CORR_FILE.tmp" "$CORR_FILE" || rm -f "$CORR_FILE"
          [[ -f "$CORR_FILE" ]] && [[ ! -s "$CORR_FILE" ]] && rm -f "$CORR_FILE"
        fi
      fi
    ) 200>"$CORR_LOCK"

    if [[ -f "$CORR_FILE.data" ]]; then
      CORR_DATA=$(cat "$CORR_FILE.data")
      rm -f "$CORR_FILE.data"
      CORR_ID=$(echo "$CORR_DATA" | cut -d: -f1)
      START_MS=$(echo "$CORR_DATA" | cut -d: -f2)
    fi
    rm -f "$CORR_LOCK"
  fi

  # Calculate duration with validation
  if [[ -z "$START_MS" || "$START_MS" == "0" || ! "$START_MS" =~ ^[0-9]+$ ]]; then
    DURATION_MS=0
  else
    DURATION_MS=$((NOW_MS - START_MS))
    [[ $DURATION_MS -lt 0 ]] && DURATION_MS=0
  fi

  RESULT_SUMMARY=$(echo "$RESULT" | head -c 500)

  EVENT=$(jq -n \
    --arg sessionId "$SESSION_ID" \
    --arg event "end" \
    --arg toolName "$TOOL_NAME" \
    --arg correlationId "$CORR_ID" \
    --argjson durationMs "$DURATION_MS" \
    --argjson success "true" \
    --arg result "$RESULT_SUMMARY" \
    --arg timestamp "$NOW" \
    '{sessionId: $sessionId, event: $event, toolName: $toolName, correlationId: $correlationId, durationMs: $durationMs, success: $success, result: $result, timestamp: $timestamp}')

  echo "$EVENT" >> "$QUEUE_FILE"
  echo "[$(date -Iseconds)] Queued tool_end: $TOOL_NAME (${DURATION_MS}ms)" >> "$LOG_FILE"

else
  # This is a START event (preToolUse)

  # Generate correlation ID
  CORR_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "corr-$(date +%s)")

  # Store correlation ID for the end event
  echo "$CORR_ID:$NOW_MS" >> "$CORR_FILE"

  # Summarize parameters
  PARAMS_SUMMARY=$(echo "$TOOL_INPUT" | jq -c 'to_entries | map({key: .key, value: (if .value | type == "string" then (if (.value | length) > 100 then "[" + (.value | length | tostring) + " chars]" else .value end) else .value end)}) | from_entries' 2>/dev/null || echo "{}")

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
fi

exit 0
