#!/bin/bash
# clear-pending-links.sh
# PostToolUse hook for sync_ticket_links
#
# Clears the pending links file after sync_ticket_links successfully runs.

set -e

# Read the hook input from stdin
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')
TOOL_RESULT=$(echo "$INPUT" | jq -r '.tool_result // ""')

# Only care about sync_ticket_links MCP calls
if [[ "$TOOL_NAME" != "mcp__brain-dump__sync_ticket_links" ]]; then
  exit 0
fi

# Check if the tool succeeded (look for "Sync Complete" in output)
if ! echo "$TOOL_RESULT" | grep -q "Sync Complete"; then
  exit 0
fi

# Use CLAUDE_PROJECT_DIR for reliable path resolution
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
PENDING_FILE="$PROJECT_DIR/.claude/pending-links.json"

# Clear the pending links
if [[ -f "$PENDING_FILE" ]]; then
  echo '{"pendingLinks":[]}' > "$PENDING_FILE"
fi

exit 0
