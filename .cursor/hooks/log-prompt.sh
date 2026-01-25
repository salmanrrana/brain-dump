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

SESSION_ID=$(jq -r '.sessionId // ""' "$TELEMETRY_FILE" 2>/dev/null || echo "")
if [[ -z "$SESSION_ID" ]]; then
  exit 0
fi

# Log file for debugging
LOG_FILE="$PROJECT_DIR/.cursor/telemetry.log"

# Queue file for batch processing
QUEUE_FILE="$PROJECT_DIR/.cursor/telemetry-queue.jsonl"
mkdir -p "$(dirname "$QUEUE_FILE")"

# Read hook input from stdin
INPUT=$(cat 2>/dev/null || echo "{}")

# Extract prompt from hook input
PROMPT=$(echo "$INPUT" | jq -r '.prompt // .message // .content // ""' 2>/dev/null || echo "")

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

echo "$EVENT" >> "$QUEUE_FILE"
echo "[$(date -Iseconds)] Queued prompt event (${PROMPT_LENGTH} chars)" >> "$LOG_FILE"

exit 0
