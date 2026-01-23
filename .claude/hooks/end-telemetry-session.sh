#!/bin/bash
# end-telemetry-session.sh
# Stop hook for telemetry
#
# When a Claude Code session ends, this hook:
# 1. Processes any queued telemetry events
# 2. Prompts to end the telemetry session
#
# Note: We don't automatically call end_telemetry_session because
# the Stop hook runs when Claude is about to exit, and we can't
# make MCP calls from here. Instead, we notify the user.

set -e

# Use CLAUDE_PROJECT_DIR for reliable path resolution
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Check if we have an active telemetry session
TELEMETRY_FILE="$PROJECT_DIR/.claude/telemetry-session.json"
if [[ ! -f "$TELEMETRY_FILE" ]]; then
  # No active telemetry session
  exit 0
fi

SESSION_ID=$(jq -r '.sessionId // ""' "$TELEMETRY_FILE" 2>/dev/null || echo "")
if [[ -z "$SESSION_ID" ]]; then
  exit 0
fi

# Log file for debugging
LOG_FILE="$PROJECT_DIR/.claude/telemetry.log"
echo "[$(date -Iseconds)] Stop hook triggered, telemetry session: $SESSION_ID" >> "$LOG_FILE"

# Check if there are queued events
QUEUE_FILE="$PROJECT_DIR/.claude/telemetry-queue.jsonl"
QUEUED_COUNT=0
if [[ -f "$QUEUE_FILE" ]]; then
  QUEUED_COUNT=$(wc -l < "$QUEUE_FILE" | tr -d ' ')
fi

# Output notification
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  📊 TELEMETRY SESSION ACTIVE                                  ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Session: ${SESSION_ID:0:8}..."
echo "║  Queued Events: $QUEUED_COUNT"
echo "║                                                              ║"
echo "║  ⚠️  To finalize telemetry, call before ending:              ║"
echo "║      end_telemetry_session({ sessionId: \"$SESSION_ID\" })    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

exit 0
