#!/bin/bash
# check-pending-links.sh
# SessionStart hook
#
# Checks for pending commit/PR links that weren't synced in previous sessions
# and reminds Claude to run the workflow tool with action "sync-links" to catch up.

set -e

# Use CLAUDE_PROJECT_DIR for reliable path resolution
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
PENDING_FILE="$PROJECT_DIR/.claude/pending-links.json"

# Exit silently if no pending links file
if [[ ! -f "$PENDING_FILE" ]]; then
  exit 0
fi

# Check if there are any pending links
if ! command -v jq &> /dev/null; then
  # No jq, can't parse JSON
  exit 0
fi

PENDING_COUNT=$(jq '.pendingLinks | length' "$PENDING_FILE" 2>/dev/null || echo "0")

if [[ "$PENDING_COUNT" == "0" ]]; then
  exit 0
fi

# Output reminder for Claude
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  📌 PENDING LINKS DETECTED                                    ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Found $PENDING_COUNT commit(s)/PR(s) that may not be linked yet."
echo "║                                                              ║"
echo "║  ⚠️  ACTION: Call workflow tool, action: \"sync-links\"          ║"
echo "╠══════════════════════════════════════════════════════════════╣"

# Show details of pending links
jq -r '.pendingLinks[] | "║  - \(.type): \(.commitHash // .prNumber) (\(.message // "PR"))"' "$PENDING_FILE" 2>/dev/null | head -5

echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

exit 0
