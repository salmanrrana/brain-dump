#!/bin/bash
# Copilot CLI preToolUse hook for Brain Dump UQW enforcement.
# - Enforces session state before file writes
# - Blocks git push / gh pr create until review is complete
#
# Copilot CLI hook input (JSON) example:
# {
#   "toolName": "edit",
#   "toolArgs": "{\"path\":\"src/index.js\"}",
#   "cwd": "/path/to/repo",
#   "sessionId": "..."
# }

set -e

INPUT=$(cat)
TOOL_NAME_RAW=$(echo "$INPUT" | jq -r '.toolName // ""' 2>/dev/null || echo "")
TOOL_NAME=$(echo "$TOOL_NAME_RAW" | tr '[:upper:]' '[:lower:]')
TOOL_ARGS_RAW=$(echo "$INPUT" | jq -r '.toolArgs // ""' 2>/dev/null || echo "{}")
TOOL_ARGS=$(echo "$TOOL_ARGS_RAW" | jq -c '.' 2>/dev/null || echo "{}")

CWD=$(echo "$INPUT" | jq -r '.cwd // ""' 2>/dev/null || echo "")
PROJECT_DIR="${CWD:-$(pwd)}"

CURRENT_TICKET_FILE="$HOME/.brain-dump/current-ticket.json"
STATE_FILE="$PROJECT_DIR/.claude/ralph-state.json"

ACTIVE_TICKET=""
SESSION_STATE=""
SESSION_ID=""

if [[ -f "$STATE_FILE" ]]; then
  ACTIVE_TICKET=$(jq -r '.ticketId // ""' "$STATE_FILE" 2>/dev/null || echo "")
  SESSION_STATE=$(jq -r '.currentState // ""' "$STATE_FILE" 2>/dev/null || echo "")
  SESSION_ID=$(jq -r '.sessionId // ""' "$STATE_FILE" 2>/dev/null || echo "")
fi

if [[ -z "$ACTIVE_TICKET" && -f "$CURRENT_TICKET_FILE" ]]; then
  CT_PROJECT=$(jq -r '.projectPath // ""' "$CURRENT_TICKET_FILE" 2>/dev/null || echo "")
  CT_TICKET=$(jq -r '.ticketId // ""' "$CURRENT_TICKET_FILE" 2>/dev/null || echo "")
  if [[ -n "$CT_PROJECT" && -n "$CT_TICKET" ]]; then
    if [[ "$PROJECT_DIR" == "$CT_PROJECT"* ]]; then
      ACTIVE_TICKET="$CT_TICKET"
    fi
  fi
fi

# =============================================================================
# ENFORCE STATE BEFORE WRITE/EDIT/CREATE
# =============================================================================

if [[ "$TOOL_NAME" == "edit" || "$TOOL_NAME" == "create" || "$TOOL_NAME" == "write" ]]; then
  # If not working on a Brain Dump ticket, allow.
  if [[ -z "$ACTIVE_TICKET" ]]; then
    echo '{"permissionDecision":"allow"}'
    exit 0
  fi

  # If session state file is missing, require session creation.
  if [[ -z "$SESSION_STATE" ]]; then
    cat <<EOF
{"permissionDecision":"deny","reason":"STATE ENFORCEMENT: No active Brain Dump session found for this ticket.\\n\\nCall the session tool first:\\n  action: \\"create\\", ticketId: \\"$ACTIVE_TICKET\\"\\nThen update state to \\"implementing\\":\\n  action: \\"update-state\\", state: \\"implementing\\"\\n\\nAfter updating your state, retry this operation."}
EOF
    exit 0
  fi

  if [[ "$SESSION_STATE" == "implementing" || "$SESSION_STATE" == "testing" || "$SESSION_STATE" == "committing" ]]; then
    echo '{"permissionDecision":"allow"}'
    exit 0
  fi

  cat <<EOF
{"permissionDecision":"deny","reason":"STATE ENFORCEMENT: You are in '$SESSION_STATE' state but tried to write/edit code.\\n\\nTo write code, call the session tool:\\n  action: \\"update-state\\", sessionId: \\"$SESSION_ID\\", state: \\"implementing\\"\\n\\nValid states for writing code: implementing, testing, committing."}
EOF
  exit 0
fi

# =============================================================================
# ENFORCE REVIEW BEFORE PUSH/PR CREATE
# =============================================================================

if [[ "$TOOL_NAME" == "bash" ]]; then
  COMMAND=$(echo "$TOOL_ARGS" | jq -r '.command // ""' 2>/dev/null || echo "")

  if echo "$COMMAND" | grep -qE '^(git push|gh pr create)'; then
    # Only enforce if we're in an active Brain Dump ticket session.
    if [[ -z "$ACTIVE_TICKET" ]]; then
      echo '{"permissionDecision":"allow"}'
      exit 0
    fi

    REVIEW_MARKER="$PROJECT_DIR/.claude/.review-completed"
    if [[ ! -f "$REVIEW_MARKER" ]]; then
      cat <<EOF
{"permissionDecision":"deny","reason":"REVIEW REQUIRED: Complete AI review before pushing or creating a PR.\\n\\nRun /review-ticket (or the review tool) and then mark review complete by running:\\n  ./.claude/hooks/mark-review-completed.sh\\n\\nAfter review is complete, retry this command."}
EOF
      exit 0
    fi
  fi
fi

echo '{"permissionDecision":"allow"}'
exit 0
