#!/bin/bash
# log-prompt.sh
# UserPromptSubmit hook for telemetry
#
# Captures user prompts submitted during AI sessions.
# - Reads session ID from telemetry-session.json
# - Outputs notification for Claude to call telemetry "log-prompt"

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
echo "[$(date -Iseconds)] UserPromptSubmit hook triggered" >> "$LOG_FILE"

# Read the user prompt from stdin
PROMPT=$(cat 2>/dev/null || echo "")

# Only output notification, let Claude handle the MCP call
# This preserves prompt privacy - hook doesn't log it
if [[ -n "$PROMPT" ]]; then
  echo "[$(date -Iseconds)] Prompt submitted ($(echo -n "$PROMPT" | wc -c) chars)" >> "$LOG_FILE"
fi

exit 0
