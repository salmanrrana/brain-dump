#!/bin/bash
# enforce-session-before-work.sh
# PreToolUse hook for Read tool on spec/plan files
#
# This hook enforces that Claude must create a session before reading
# spec or plan files, which typically indicates starting work on a ticket.
#
# IMPORTANT: This hook is DISABLED by default because it would interfere
# with normal codebase exploration. Enable it only if you want strict
# session enforcement for all spec file reads.
#
# When enabled, it requires a Ralph session to exist before reading:
# - plans/prd.json
# - plans/specs/*.md
# - Any file with "spec" in the path

set -e

# Read the hook input from stdin
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')

# Only care about Read tool
if [[ "$TOOL_NAME" != "Read" ]]; then
  echo '{"decision": "allow"}'
  exit 0
fi

# Only enforce for spec/plan files
# Skip enforcement for general reads
case "$FILE_PATH" in
  *plans/prd.json|*plans/specs/*|*spec*.md)
    # This is a spec file - check for session
    ;;
  *)
    # Not a spec file - allow
    echo '{"decision": "allow"}'
    exit 0
    ;;
esac

# Check if session exists (state file present)
STATE_FILE=".claude/ralph-state.json"
if [[ -f "$STATE_FILE" ]]; then
  # Session exists - allow reading spec
  echo '{"decision": "allow"}'
  exit 0
fi

# No session - block with guidance
# Extract ticket ID from the file path if possible
TICKET_ID=""
if [[ "$FILE_PATH" =~ plans/specs/([^/]+)- ]]; then
  TICKET_ID="${BASH_REMATCH[1]}"
fi

GUIDANCE=""
if [[ -n "$TICKET_ID" ]]; then
  GUIDANCE="create_ralph_session({ ticketId: \"$TICKET_ID\" })"
else
  GUIDANCE="create_ralph_session({ ticketId: \"<your-ticket-id>\" })"
fi

cat <<EOF
{
  "decision": "block",
  "message": "SESSION REQUIRED: You're reading a spec file, which means you're starting work on a ticket.\n\nYou MUST create a session first:\n\n  $GUIDANCE\n\nAfter creating the session, retry reading this file.\n\nThis ensures your work is properly tracked in Brain Dump."
}
EOF
