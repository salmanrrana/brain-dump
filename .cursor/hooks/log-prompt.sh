#!/bin/bash
# log-prompt.sh
# Cursor beforeSubmitPrompt hook for telemetry
#
# Captures user prompts for telemetry tracking.
# - Records the prompt text (summarized for privacy)
# - Queues event for batch processing

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

# Extract prompt from hook input with error logging
PROMPT=$(echo "$INPUT" | jq -r '.prompt // .message // .content // ""' 2>/dev/null)
[[ $? -ne 0 ]] && echo "[$(date -Iseconds)] WARNING: Failed to parse prompt from input" >> "$LOG_FILE"
PROMPT="${PROMPT:-}"

# Generate timestamp
NOW=$(date -Iseconds)

# Summarize prompt (first 500 chars for privacy)
PROMPT_SUMMARY=$(echo "$PROMPT" | head -c 500)
PROMPT_LENGTH=${#PROMPT}

# Create and queue the event
EVENT=$(jq -n \
  --arg sessionId "$SESSION_ID" \
  --arg event "prompt" \
  --arg prompt "$PROMPT_SUMMARY" \
  --argjson promptLength "$PROMPT_LENGTH" \
  --arg timestamp "$NOW" \
  '{sessionId: $sessionId, event: $event, prompt: $prompt, promptLength: $promptLength, timestamp: $timestamp}')

if ! echo "$EVENT" >> "$QUEUE_FILE" 2>>"$LOG_FILE"; then
  echo "[$(date -Iseconds)] ERROR: Failed to write prompt event to queue" >> "$LOG_FILE"
fi
echo "[$(date -Iseconds)] Queued prompt event (${PROMPT_LENGTH} chars)" >> "$LOG_FILE"

exit 0
