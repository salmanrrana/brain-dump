#!/bin/bash
# log-prompt.sh
# beforeSubmitPrompt hook for Cursor telemetry
#
# Captures user prompts during AI sessions for telemetry.
# The prompt is captured before Cursor processes it.
#
# Privacy note: Prompts may contain sensitive data. This hook
# writes to a local queue file which is processed in batches.
# Consider enabling prompt redaction in telemetry settings if needed.
#
# Cursor hook differences from Claude Code:
# - Uses CURSOR_PROJECT_DIR environment variable
# - Hook name is 'beforeSubmitPrompt' instead of 'UserPromptSubmit'
# - Stores files in .cursor/ instead of .claude/

set -e

# Read the hook input from stdin
INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // ""')

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

# Get length of prompt
PROMPT_LENGTH=${#PROMPT}

# Check if we should redact the prompt
REDACT_PROMPTS=$(jq -r '.redactPrompts // false' "$TELEMETRY_FILE" 2>/dev/null || echo "false")

STORED_PROMPT="$PROMPT"
IS_REDACTED="false"

if [[ "$REDACT_PROMPTS" == "true" ]]; then
  # Hash the prompt instead of storing it
  STORED_PROMPT=$(echo -n "$PROMPT" | shasum -a 256 | cut -d' ' -f1)
  IS_REDACTED="true"
fi

# Queue the event
EVENT=$(jq -n \
  --arg sessionId "$SESSION_ID" \
  --arg eventType "prompt" \
  --arg prompt "$STORED_PROMPT" \
  --argjson promptLength "$PROMPT_LENGTH" \
  --argjson redacted "$([ "$IS_REDACTED" == "true" ] && echo "true" || echo "false")" \
  --arg timestamp "$NOW" \
  '{sessionId: $sessionId, eventType: $eventType, prompt: $prompt, promptLength: $promptLength, redacted: $redacted, timestamp: $timestamp}')

echo "$EVENT" >> "$QUEUE_FILE"
echo "[$(date -Iseconds)] Queued prompt event: ${PROMPT_LENGTH} chars (redacted: $IS_REDACTED)" >> "$LOG_FILE"

exit 0
