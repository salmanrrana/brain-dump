#!/bin/bash
# capture-claude-tasks.sh - PostToolUse hook for Claude task tools
# Automatically saves Claude's task breakdowns to Brain Dump database
# for real-time visibility during Ralph sessions.
#
# Supports both task tool generations:
# - TodoWrite (legacy): tool_input.todos carries the FULL list -> full replace
# - TaskCreate / TaskUpdate (current): tool_input carries ONE task delta
#   -> incremental create/update keyed by the harness task id

set -e

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')

case "$TOOL_NAME" in
  TodoWrite|TaskCreate|TaskUpdate) ;;
  *) exit 0 ;;
esac

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

LOG_FILE="$PROJECT_DIR/.claude/claude-tasks.log"
mkdir -p "$(dirname "$LOG_FILE")"

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

MODE=""
PAYLOAD=""

if [[ "$TOOL_NAME" == "TodoWrite" ]]; then
  TODOS=$(echo "$INPUT" | jq -c '.tool_input.todos // []')
  if [[ "$TODOS" == "[]" ]] || [[ -z "$TODOS" ]]; then
    exit 0
  fi
  # Preserve the harness task id when present so status history survives
  # re-saves; save-tasks-to-db.cjs falls back to a fresh UUID without one.
  MODE="replace"
  PAYLOAD=$(echo "$TODOS" | jq -c '[.[] | {
    id: (.id // null),
    subject: .content,
    description: null,
    status: .status,
    activeForm: .activeForm
  }]')
elif [[ "$TOOL_NAME" == "TaskCreate" ]]; then
  MODE="create"
  # Current hooks return tool_response.task.id; older hooks returned text.
  HARNESS_ID=$(echo "$INPUT" | jq -r '
    (.tool_response // .tool_result // "") |
    if type == "object" then (.task.id // .id // "" | tostring)
    elif type == "string" then (try capture("Task #(?<id>[0-9]+)").id catch "")
    else "" end')
  if [[ -z "$HARNESS_ID" ]]; then
    echo "[$(date -Iseconds)] ERROR: TaskCreate response has no task id" >> "$LOG_FILE"
    exit 1
  fi
  PAYLOAD=$(echo "$INPUT" | jq -c --arg hid "$HARNESS_ID" '{
    id: (if $hid == "" then null else $hid end),
    subject: (.tool_input.subject // ""),
    description: (.tool_input.description // null),
    status: "pending",
    activeForm: (.tool_input.activeForm // null)
  }')
  if [[ "$(echo "$PAYLOAD" | jq -r '.subject')" == "" ]]; then
    exit 0
  fi
else
  MODE="update"
  PAYLOAD=$(echo "$INPUT" | jq -c '{
    id: (.tool_input.taskId // null),
    subject: (.tool_input.subject // null),
    description: (.tool_input.description // null),
    status: (.tool_input.status // null),
    activeForm: (.tool_input.activeForm // null)
  }')
  if [[ "$(echo "$PAYLOAD" | jq -r '.id')" == "null" ]]; then
    exit 0
  fi
fi

echo "[$(date -Iseconds)] CAPTURE ($MODE via $TOOL_NAME) for ticket $TICKET_ID" >> "$LOG_FILE"

cd "$PROJECT_DIR"
HARNESS_SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
SAVE_EXIT_CODE=0
PROJECT_DIR="$PROJECT_DIR" BRAIN_DUMP_TASK_SESSION_ID="$HARNESS_SESSION_ID" \
  node "$HELPER_SCRIPT" "$TICKET_ID" "$PAYLOAD" "$MODE" >> "$LOG_FILE" 2>&1 || SAVE_EXIT_CODE=$?

if [ $SAVE_EXIT_CODE -eq 0 ]; then
  echo "[$(date -Iseconds)] SUCCESS: $MODE saved for ticket $TICKET_ID" >> "$LOG_FILE"
  exit 0
else
  echo "[$(date -Iseconds)] ERROR: $MODE failed for ticket $TICKET_ID (exit code: $SAVE_EXIT_CODE)" >> "$LOG_FILE"
  exit 1
fi
