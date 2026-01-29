#!/bin/bash
# capture-claude-tasks.sh - PostToolUse hook for TodoWrite
# Automatically saves Claude's task breakdowns to Brain Dump database
# for real-time visibility during Ralph sessions.

set -e

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')

# Only process TodoWrite operations
if [[ "$TOOL_NAME" != "TodoWrite" ]]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
RALPH_STATE="$PROJECT_DIR/.claude/ralph-state.json"

# Skip if not in active Ralph session
if [[ ! -f "$RALPH_STATE" ]]; then
  exit 0
fi

TICKET_ID=$(jq -r '.ticketId // ""' "$RALPH_STATE" 2>/dev/null || echo "")
if [[ -z "$TICKET_ID" ]]; then
  exit 0
fi

TODOS=$(echo "$INPUT" | jq -c '.tool_input.todos // []')
if [[ "$TODOS" == "[]" ]] || [[ -z "$TODOS" ]]; then
  exit 0
fi

TASK_COUNT=$(echo "$TODOS" | jq 'length')

# TodoWrite uses "content" field; MCP tool expects "subject"
TRANSFORMED_TASKS=$(echo "$TODOS" | jq -c '[.[] | {
  subject: .content,
  description: null,
  status: .status,
  activeForm: .activeForm
}]')

LOG_FILE="$PROJECT_DIR/.claude/claude-tasks.log"
mkdir -p "$(dirname "$LOG_FILE")"
echo "[$(date -Iseconds)] CAPTURE: $TASK_COUNT tasks for ticket $TICKET_ID" >> "$LOG_FILE"

# Check multiple installation paths for helper script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPER_SCRIPT="$SCRIPT_DIR/save-tasks-to-db.cjs"
if [[ ! -f "$HELPER_SCRIPT" ]]; then
  HELPER_SCRIPT="$PROJECT_DIR/.claude/hooks/save-tasks-to-db.cjs"
fi
if [[ ! -f "$HELPER_SCRIPT" ]]; then
  HELPER_SCRIPT="$HOME/.claude/hooks/save-tasks-to-db.cjs"
fi

if [[ ! -f "$HELPER_SCRIPT" ]]; then
  echo "[$(date -Iseconds)] ERROR: save-tasks-to-db.cjs not found" >> "$LOG_FILE"
  exit 1
fi

cd "$PROJECT_DIR"
PROJECT_DIR="$PROJECT_DIR" node "$HELPER_SCRIPT" "$TICKET_ID" "$TRANSFORMED_TASKS" >> "$LOG_FILE" 2>&1
SAVE_EXIT_CODE=$?

if [ $SAVE_EXIT_CODE -eq 0 ]; then
  echo "[$(date -Iseconds)] SUCCESS: Saved $TASK_COUNT tasks for ticket $TICKET_ID" >> "$LOG_FILE"
  exit 0
else
  echo "[$(date -Iseconds)] ERROR: Failed to save $TASK_COUNT tasks for ticket $TICKET_ID (exit code: $SAVE_EXIT_CODE)" >> "$LOG_FILE"
  exit 1
fi
