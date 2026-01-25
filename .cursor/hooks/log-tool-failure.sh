#!/bin/bash
# log-tool-failure.sh
# Cursor postToolUseFailure hook for telemetry
#
# Captures tool end events for failed tool executions.
# - Retrieves correlation ID from preToolUse
# - Calculates execution duration
# - Writes end event with success=false to queue file
# - Captures error information

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

# Log file for debugging (create early so we can log errors)
LOG_FILE="$PROJECT_DIR/.cursor/telemetry.log"
mkdir -p "$(dirname "$LOG_FILE")"

# Parse session ID with error logging
SESSION_ID=$(jq -r '.sessionId // ""' "$TELEMETRY_FILE" 2>/dev/null)
if [[ $? -ne 0 ]]; then
  echo "[$(date -Iseconds)] ERROR: Failed to parse $TELEMETRY_FILE" >> "$LOG_FILE"
fi
SESSION_ID="${SESSION_ID:-}"
if [[ -z "$SESSION_ID" ]]; then
  exit 0
fi

# Queue file for batch processing
QUEUE_FILE="$PROJECT_DIR/.cursor/telemetry-queue.jsonl"
mkdir -p "$(dirname "$QUEUE_FILE")"

# Read hook input from stdin
INPUT=$(cat 2>/dev/null) || INPUT=""
if [[ -z "$INPUT" || "$INPUT" == "{}" ]]; then
  echo "[$(date -Iseconds)] WARNING: No hook input received from stdin" >> "$LOG_FILE"
  INPUT="{}"
fi

# Extract tool info from hook input with error logging
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // .tool // .name // ""' 2>/dev/null)
[[ $? -ne 0 ]] && echo "[$(date -Iseconds)] WARNING: Failed to parse tool_name from input" >> "$LOG_FILE"
TOOL_NAME="${TOOL_NAME:-unknown}"

ERROR=$(echo "$INPUT" | jq -r '.error // .message // ""' 2>/dev/null)
[[ $? -ne 0 ]] && echo "[$(date -Iseconds)] WARNING: Failed to parse error from input" >> "$LOG_FILE"
ERROR="${ERROR:-Unknown error}"

# Skip logging for telemetry-related tools to avoid recursion
if [[ "$TOOL_NAME" == *"telemetry"* ]]; then
  exit 0
fi

# Generate timestamp
NOW=$(date -Iseconds)
NOW_MS=$(date +%s%3N 2>/dev/null || echo "$(date +%s)000")

# Retrieve correlation ID and start time from queue file
CORR_FILE="$PROJECT_DIR/.cursor/tool-correlation-${TOOL_NAME//[^a-zA-Z0-9]/_}.queue"
CORR_LOCK="$PROJECT_DIR/.cursor/tool-correlation-${TOOL_NAME//[^a-zA-Z0-9]/_}.lock"
CORR_ID=""
START_MS="0"

if [[ -f "$CORR_FILE" ]] && [[ -s "$CORR_FILE" ]]; then
  (
    if ! flock -x 200 2>/dev/null; then
      echo "[$(date -Iseconds)] WARNING: flock unavailable, proceeding without lock" >> "$LOG_FILE"
    fi
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
fi
# Always clean up lock file
rm -f "$CORR_LOCK" 2>/dev/null

# Calculate duration with validation
if [[ -z "$START_MS" || "$START_MS" == "0" || ! "$START_MS" =~ ^[0-9]+$ ]]; then
  DURATION_MS=0
else
  DURATION_MS=$((NOW_MS - START_MS))
  [[ $DURATION_MS -lt 0 ]] && DURATION_MS=0
fi

# Summarize error
ERROR_SUMMARY=$(echo "$ERROR" | head -c 500)

# Create and queue the event
EVENT=$(jq -n \
  --arg sessionId "$SESSION_ID" \
  --arg event "end" \
  --arg toolName "$TOOL_NAME" \
  --arg correlationId "$CORR_ID" \
  --argjson durationMs "$DURATION_MS" \
  --argjson success "false" \
  --arg error "$ERROR_SUMMARY" \
  --arg timestamp "$NOW" \
  '{sessionId: $sessionId, event: $event, toolName: $toolName, correlationId: $correlationId, durationMs: $durationMs, success: $success, error: $error, timestamp: $timestamp}')

if ! echo "$EVENT" >> "$QUEUE_FILE" 2>>"$LOG_FILE"; then
  echo "[$(date -Iseconds)] ERROR: Failed to write failure event to queue" >> "$LOG_FILE"
fi
echo "[$(date -Iseconds)] Queued tool_failure: $TOOL_NAME (${DURATION_MS}ms, error: $ERROR_SUMMARY)" >> "$LOG_FILE"

exit 0
