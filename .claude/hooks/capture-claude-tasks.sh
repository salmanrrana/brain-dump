#!/bin/bash
# capture-claude-tasks.sh
# PostToolUse hook for TodoWrite
#
# After Claude uses TodoWrite to create/update tasks, this hook:
# 1. Checks if a Ralph session is active
# 2. Extracts the task list from the tool input
# 3. Saves tasks to Brain Dump database via helper script
#
# This automatically captures Claude's task breakdowns for visibility
# in the Brain Dump UI.

set -e

# Read the hook input from stdin
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')

# Only care about TodoWrite
if [[ "$TOOL_NAME" != "TodoWrite" ]]; then
  exit 0
fi

# Use CLAUDE_PROJECT_DIR for reliable path resolution
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Check if Ralph session is active
RALPH_STATE="$PROJECT_DIR/.claude/ralph-state.json"
if [[ ! -f "$RALPH_STATE" ]]; then
  # No active Ralph session - skip capture silently
  exit 0
fi

# Read ticket ID from Ralph state
TICKET_ID=$(jq -r '.ticketId // ""' "$RALPH_STATE" 2>/dev/null || echo "")
if [[ -z "$TICKET_ID" ]]; then
  exit 0
fi

# Extract todos from tool input
TODOS=$(echo "$INPUT" | jq -c '.tool_input.todos // []')
if [[ "$TODOS" == "[]" ]] || [[ -z "$TODOS" ]]; then
  exit 0
fi

# Count tasks for display
TASK_COUNT=$(echo "$TODOS" | jq 'length')

# Transform todos format: content -> subject for MCP tool
# The TodoWrite tool uses "content" but save_claude_tasks expects "subject"
TRANSFORMED_TASKS=$(echo "$TODOS" | jq -c '[.[] | {
  subject: .content,
  description: null,
  status: .status,
  activeForm: .activeForm
}]')

# Log for debugging
LOG_FILE="$PROJECT_DIR/.claude/claude-tasks.log"
mkdir -p "$(dirname "$LOG_FILE")"
echo "[$(date -Iseconds)] CAPTURE: $TASK_COUNT tasks for ticket $TICKET_ID" >> "$LOG_FILE"

# Find the helper script - try both local project and global installation
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPER_SCRIPT="$SCRIPT_DIR/save-tasks-to-db.cjs"

# Also check project-local hooks directory
if [[ ! -f "$HELPER_SCRIPT" ]]; then
  HELPER_SCRIPT="$PROJECT_DIR/.claude/hooks/save-tasks-to-db.cjs"
fi

# Fall back to global hooks location
if [[ ! -f "$HELPER_SCRIPT" ]]; then
  HELPER_SCRIPT="$HOME/.claude/hooks/save-tasks-to-db.cjs"
fi

if [[ ! -f "$HELPER_SCRIPT" ]]; then
  echo "[$(date -Iseconds)] ERROR: save-tasks-to-db.cjs not found" >> "$LOG_FILE"
  exit 0
fi

# Save tasks directly to the database via helper script
# Run in background to not block Claude
(
  cd "$PROJECT_DIR"
  PROJECT_DIR="$PROJECT_DIR" node "$HELPER_SCRIPT" "$TICKET_ID" "$TRANSFORMED_TASKS" >> "$LOG_FILE" 2>&1
) &

exit 0
