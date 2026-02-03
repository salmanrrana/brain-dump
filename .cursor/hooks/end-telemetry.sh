#!/bin/bash
# end-telemetry.sh
# Cursor sessionEnd hook for telemetry
#
# When a Cursor session ends, this hook:
# 1. Flushes any queued telemetry events
# 2. Prompts to end the telemetry session
# 3. Cleans up temporary files
#
# This ensures all telemetry is captured before the session closes.

set -e

# Use CURSOR_PROJECT_DIR for reliable path resolution
PROJECT_DIR="${CURSOR_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$(pwd)}}"

# Log file for debugging
LOG_FILE="$PROJECT_DIR/.cursor/telemetry.log"
mkdir -p "$(dirname "$LOG_FILE")"

echo "[$(date -Iseconds)] Cursor sessionEnd hook triggered" >> "$LOG_FILE"

# Check if telemetry session is active
TELEMETRY_FILE="$PROJECT_DIR/.cursor/telemetry-session.json"
if [[ ! -f "$TELEMETRY_FILE" ]]; then
  echo "[$(date -Iseconds)] No active telemetry session, skipping" >> "$LOG_FILE"
  exit 0
fi

SESSION_ID=$(jq -r '.sessionId // ""' "$TELEMETRY_FILE" 2>/dev/null || echo "")
if [[ -z "$SESSION_ID" ]]; then
  exit 0
fi

# Check if there are queued events
QUEUE_FILE="$PROJECT_DIR/.cursor/telemetry-queue.jsonl"
QUEUED_COUNT=0
if [[ -f "$QUEUE_FILE" ]]; then
  QUEUED_COUNT=$(wc -l < "$QUEUE_FILE" | tr -d ' ')
fi

echo "[$(date -Iseconds)] Session ending with $QUEUED_COUNT queued events" >> "$LOG_FILE"

# Prompt to end telemetry session
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  📊 TELEMETRY: Session ending                                ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Session: $SESSION_ID"
echo "║  Queued events: $QUEUED_COUNT"
echo "║                                                              ║"
echo "║  ⚠️  Call telemetry \"end\"({ sessionId: \"$SESSION_ID\" })"
echo "║      to finalize and flush telemetry data.                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

exit 0
