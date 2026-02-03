#!/bin/bash
# clear-pending-links.sh
# PostToolUse hook for workflow (action: sync-links)
#
# Clears the pending links file after workflow sync-links successfully runs.

set -e

# Read the hook input from stdin
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')
TOOL_RESULT=$(echo "$INPUT" | jq -r '.tool_result // ""')

# Only care about workflow MCP calls with action: sync-links
if [[ "$TOOL_NAME" != "mcp__brain-dump__workflow" ]]; then
  exit 0
fi

# Check that this is the sync-links action
TOOL_INPUT_JSON=$(echo "$INPUT" | jq -r '.tool_input // "{}"')
ACTION=$(echo "$TOOL_INPUT_JSON" | jq -r '.action // ""')
if [[ "$ACTION" != "sync-links" ]]; then
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
