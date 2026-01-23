#!/bin/bash
# log-tool-telemetry.sh
# PreToolUse/PostToolUse hook for telemetry
#
# Captures tool usage during AI sessions for telemetry.
# - PreToolUse: Records tool_start with parameters
# - PostToolUse: Records tool_end with result/duration
#
# This script writes to a local queue file, which is processed
# in batches to avoid slowing down tool calls.

set -e

# Read the hook input from stdin
INPUT=$(cat)
HOOK_TYPE=$(echo "$INPUT" | jq -r '.hook_type // "unknown"')
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input // "{}"')
TOOL_RESULT=$(echo "$INPUT" | jq -r '.tool_result // ""')

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

# Generate correlation ID for pairing start/end events
NOW=$(date -Iseconds)
NOW_MS=$(date +%s%3N 2>/dev/null || echo "$(date +%s)000")

# Skip logging for telemetry-related tools to avoid recursion
if [[ "$TOOL_NAME" == *"telemetry"* ]]; then
  exit 0
fi

# Create event record
if [[ "$HOOK_TYPE" == "PreToolUse" || "$HOOK_TYPE" == "pre" ]]; then
  # Generate a correlation ID and store it for the end event
  CORR_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "corr-$(date +%s)")

  # Store correlation ID in a temp file for the end event
  CORR_FILE="$PROJECT_DIR/.claude/tool-correlation-${TOOL_NAME//[^a-zA-Z0-9]/_}.txt"
  echo "$CORR_ID:$NOW_MS" > "$CORR_FILE"

  # Summarize parameters (avoid storing full file contents)
  PARAMS_SUMMARY=$(echo "$TOOL_INPUT" | jq -c 'to_entries | map({key: .key, value: (if .value | type == "string" then (if (.value | length) > 100 then "[" + (.value | length | tostring) + " chars]" else .value end) else .value end)}) | from_entries' 2>/dev/null || echo "{}")

  # Queue the event
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

elif [[ "$HOOK_TYPE" == "PostToolUse" || "$HOOK_TYPE" == "post" ]]; then
  # Retrieve correlation ID and start time
  CORR_FILE="$PROJECT_DIR/.claude/tool-correlation-${TOOL_NAME//[^a-zA-Z0-9]/_}.txt"
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

  # Check if there was an error
  IS_ERROR="false"
  ERROR_MSG=""
  if echo "$TOOL_RESULT" | grep -qi "error\|failed\|exception"; then
    IS_ERROR="true"
    ERROR_MSG=$(echo "$TOOL_RESULT" | head -c 500)
  fi

  # Summarize result
  RESULT_SUMMARY=$(echo "$TOOL_RESULT" | head -c 500)

  # Queue the event
  EVENT=$(jq -n \
    --arg sessionId "$SESSION_ID" \
    --arg event "end" \
    --arg toolName "$TOOL_NAME" \
    --arg correlationId "$CORR_ID" \
    --argjson durationMs "$DURATION_MS" \
    --argjson success "$([ "$IS_ERROR" == "true" ] && echo "false" || echo "true")" \
    --arg result "$RESULT_SUMMARY" \
    --arg error "$ERROR_MSG" \
    --arg timestamp "$NOW" \
    '{sessionId: $sessionId, event: $event, toolName: $toolName, correlationId: $correlationId, durationMs: $durationMs, success: $success, result: $result, error: $error, timestamp: $timestamp}')

  echo "$EVENT" >> "$QUEUE_FILE"
  echo "[$(date -Iseconds)] Queued tool_end: $TOOL_NAME (${DURATION_MS}ms, success: $([ "$IS_ERROR" == "true" ] && echo "false" || echo "true"))" >> "$LOG_FILE"
fi

exit 0
