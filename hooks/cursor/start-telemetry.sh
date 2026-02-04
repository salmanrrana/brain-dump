#!/bin/bash
# start-telemetry.sh
# sessionStart hook for Cursor telemetry
#
# When a Cursor session starts, this hook:
# 1. Detects if we're working on a Brain Dump ticket (from Ralph state)
# 2. Creates a telemetry session to track the work
# 3. Writes the session ID to .cursor/telemetry-session.json for other hooks to use
#
# This ensures all AI interactions are captured for audit trails.
#
# Cursor hook differences from Claude Code:
# - Uses CURSOR_PROJECT_DIR environment variable (set by Cursor automatically)
# - Stores files in .cursor/ instead of .claude/
# - Follows Cursor hook naming conventions

set -e

# Use CURSOR_PROJECT_DIR for reliable path resolution
PROJECT_DIR="${CURSOR_PROJECT_DIR:-$(pwd)}"

# Log file for debugging
LOG_FILE="$PROJECT_DIR/.cursor/telemetry.log"
mkdir -p "$(dirname "$LOG_FILE")"

echo "[$(date -Iseconds)] sessionStart hook triggered" >> "$LOG_FILE"

# Check if telemetry is already active
TELEMETRY_FILE="$PROJECT_DIR/.cursor/telemetry-session.json"
if [[ -f "$TELEMETRY_FILE" ]]; then
  # Check if session is still valid (less than 24 hours old)
  SESSION_STARTED=$(jq -r '.startedAt // ""' "$TELEMETRY_FILE" 2>/dev/null || echo "")
  if [[ -n "$SESSION_STARTED" ]]; then
    SESSION_TIME=$(date -d "$SESSION_STARTED" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "$SESSION_STARTED" +%s 2>/dev/null || echo "0")
    NOW_TIME=$(date +%s)
    AGE_HOURS=$(( (NOW_TIME - SESSION_TIME) / 3600 ))

    if [[ $AGE_HOURS -lt 24 ]]; then
      echo "[$(date -Iseconds)] Telemetry session still active (${AGE_HOURS}h old), skipping" >> "$LOG_FILE"
      exit 0
    fi
  fi
fi

# Try to detect ticket from Ralph state file
RALPH_STATE="$PROJECT_DIR/.claude/ralph-state.json"
TICKET_ID=""

if [[ -f "$RALPH_STATE" ]]; then
  TICKET_ID=$(jq -r '.ticketId // ""' "$RALPH_STATE" 2>/dev/null || echo "")
  if [[ -n "$TICKET_ID" ]]; then
    echo "[$(date -Iseconds)] Found ticket from Ralph state: $TICKET_ID" >> "$LOG_FILE"
  fi
fi

# Output notification to tell Cursor to start telemetry
if [[ -n "$TICKET_ID" ]]; then
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  📊 TELEMETRY: Active ticket detected                        ║"
  echo "╠══════════════════════════════════════════════════════════════╣"
  echo "║  Ticket: $TICKET_ID"
  echo "║                                                              ║"
  echo "║  ⚠️  Call telemetry \"start\"({ ticketId: \"$TICKET_ID\" })"
  echo "║      to begin tracking this session.                         ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
else
  # No ticket detected, but still offer telemetry
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  📊 TELEMETRY: No active ticket detected                     ║"
  echo "╠══════════════════════════════════════════════════════════════╣"
  echo "║  To track this session for a ticket, call:                   ║"
  echo "║  telemetry \"start\"({ ticketId: \"<ticket-id>\" })              ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
fi

exit 0
