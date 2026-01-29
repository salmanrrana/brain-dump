#!/bin/bash
# end-telemetry.sh
# sessionEnd hook for Cursor telemetry
#
# When a Cursor session ends, this hook:
# 1. Reads the session ID from telemetry-session.json
# 2. Flushes any remaining events from the queue
# 3. Outputs notification for Cursor to call end_telemetry_session
# 4. Cleans up session files
#
# Cursor hook differences from Claude Code:
# - Uses CURSOR_PROJECT_DIR environment variable
# - Stores files in .cursor/ instead of .claude/
# - Hook name is 'sessionEnd' instead of 'Stop'

set -e

# Use CURSOR_PROJECT_DIR for reliable path resolution
PROJECT_DIR="${CURSOR_PROJECT_DIR:-$(pwd)}"

# Log file for debugging
LOG_FILE="$PROJECT_DIR/.cursor/telemetry.log"
mkdir -p "$(dirname "$LOG_FILE")"

echo "[$(date -Iseconds)] sessionEnd hook triggered" >> "$LOG_FILE"

# Check if telemetry session exists
TELEMETRY_FILE="$PROJECT_DIR/.cursor/telemetry-session.json"
if [[ ! -f "$TELEMETRY_FILE" ]]; then
  echo "[$(date -Iseconds)] No active telemetry session, skipping" >> "$LOG_FILE"
  exit 0
fi

# Read session ID
SESSION_ID=$(jq -r '.sessionId // ""' "$TELEMETRY_FILE" 2>/dev/null || echo "")
if [[ -z "$SESSION_ID" ]]; then
  echo "[$(date -Iseconds)] Invalid telemetry session file" >> "$LOG_FILE"
  exit 0
fi

echo "[$(date -Iseconds)] Ending telemetry session: $SESSION_ID" >> "$LOG_FILE"

# Queue file
QUEUE_FILE="$PROJECT_DIR/.cursor/telemetry-queue.jsonl"

# Count queued events
QUEUED_EVENTS=0
if [[ -f "$QUEUE_FILE" ]]; then
  QUEUED_EVENTS=$(wc -l < "$QUEUE_FILE" || echo "0")
fi

echo "[$(date -Iseconds)] Queue has $QUEUED_EVENTS events to flush" >> "$LOG_FILE"

# Output notification
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  📊 TELEMETRY: Session ending                               ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Session ID: $SESSION_ID"
echo "║  Queued events: $QUEUED_EVENTS"
echo "║                                                              ║"
echo "║  ⚠️  Call end_telemetry_session({ sessionId: \"$SESSION_ID\" })"
echo "║      to finalize and flush telemetry.                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

exit 0
