#!/bin/bash
# link-commit-to-ticket.sh
# PostToolUse hook for git commit
#
# After a git commit is made, this hook:
# 1. Extracts the commit hash from the output
# 2. Finds the active ticket from Ralph state or branch name
# 3. Links the commit to the ticket via MCP
# 4. Ensures the PR is linked if one exists for the branch
#
# This ensures all commits are tracked against their tickets.

set -e

# Read the hook input from stdin
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input // ""')
TOOL_RESULT=$(echo "$INPUT" | jq -r '.tool_result // ""')

# Only care about Bash commands
if [[ "$TOOL_NAME" != "Bash" ]]; then
  exit 0
fi

# Check if this was a git commit command
COMMAND=$(echo "$TOOL_INPUT" | jq -r '.command // ""')
if ! echo "$COMMAND" | grep -qE '^git commit'; then
  exit 0
fi

# Check if the commit succeeded (look for commit hash in output)
COMMIT_HASH=$(echo "$TOOL_RESULT" | grep -oE '\[[a-z-]+ [a-f0-9]+\]' | grep -oE '[a-f0-9]{7,}' | head -1 || echo "")
if [[ -z "$COMMIT_HASH" ]]; then
  # Commit may have failed or been a no-op
  exit 0
fi

# Use CLAUDE_PROJECT_DIR for reliable path resolution
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Log file for debugging
LOG_FILE="$PROJECT_DIR/.claude/commit-link.log"
mkdir -p "$(dirname "$LOG_FILE")"

echo "[$(date -Iseconds)] COMMIT: $COMMIT_HASH" >> "$LOG_FILE"

# Try to find ticket ID from Ralph state file
RALPH_STATE="$PROJECT_DIR/.claude/ralph-state.json"
TICKET_ID=""

if [[ -f "$RALPH_STATE" ]]; then
  TICKET_ID=$(jq -r '.ticketId // ""' "$RALPH_STATE" 2>/dev/null || echo "")
fi

# If no Ralph state, try to extract ticket ID from branch name
if [[ -z "$TICKET_ID" ]]; then
  BRANCH=$(cd "$PROJECT_DIR" && git branch --show-current 2>/dev/null || echo "")
  # Branch format: feature/{short-id}-{slug}
  SHORT_ID=$(echo "$BRANCH" | sed -n 's/^feature\/\([a-f0-9]\{8\}\)-.*/\1/p')
  if [[ -n "$SHORT_ID" ]]; then
    echo "[$(date -Iseconds)] Found short ID from branch: $SHORT_ID" >> "$LOG_FILE"
    # Note: We can't easily look up the full ticket ID without DB access
    # The workflow "link-commit" action needs the full UUID
  fi
fi

if [[ -z "$TICKET_ID" ]]; then
  echo "[$(date -Iseconds)] No active ticket found, skipping commit link" >> "$LOG_FILE"
  exit 0
fi

echo "[$(date -Iseconds)] Linking commit $COMMIT_HASH to ticket $TICKET_ID" >> "$LOG_FILE"

# Get commit message for display
COMMIT_MSG=$(cd "$PROJECT_DIR" && git log -1 --format=%s "$COMMIT_HASH" 2>/dev/null || echo "")

# Write to pending links file so SessionStart hook can remind Claude
PENDING_FILE="$PROJECT_DIR/.claude/pending-links.json"
mkdir -p "$(dirname "$PENDING_FILE")"

# Initialize file if doesn't exist
if [[ ! -f "$PENDING_FILE" ]]; then
  echo '{"pendingLinks":[]}' > "$PENDING_FILE"
fi

# Add this commit to pending links (using jq if available, otherwise append manually)
if command -v jq &> /dev/null; then
  TEMP_FILE=$(mktemp "${TMPDIR:-/tmp}/pending-links.XXXXXX" 2>/dev/null || mktemp -t pending-links.XXXXXX 2>/dev/null || true)
  if [[ -z "$TEMP_FILE" ]]; then
    echo "[$(date -Iseconds)] Failed to create temp file for pending-links update" >> "$LOG_FILE"
    exit 1
  fi
  jq --arg type "commit" \
     --arg ticketId "$TICKET_ID" \
     --arg commitHash "$COMMIT_HASH" \
     --arg message "$COMMIT_MSG" \
     --arg timestamp "$(date -Iseconds)" \
     '.pendingLinks += [{"type": $type, "ticketId": $ticketId, "commitHash": $commitHash, "message": $message, "timestamp": $timestamp}]' \
     "$PENDING_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$PENDING_FILE"
fi

# Output prominent feedback for Claude to see and act on
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  🔗 COMMIT READY TO LINK                                     ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Commit: $COMMIT_HASH"
echo "║  Message: $COMMIT_MSG"
echo "║  Ticket: $TICKET_ID"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  ⚠️  ACTION REQUIRED: Call the workflow tool with action        ║"
echo "║      \"sync-links\" to link this commit to the ticket.        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Also check if there's a PR for this branch that should be linked
BRANCH=$(cd "$PROJECT_DIR" && git branch --show-current 2>/dev/null || echo "")
if [[ -n "$BRANCH" ]]; then
  PR_NUMBER=$(cd "$PROJECT_DIR" && gh pr view "$BRANCH" --json number 2>/dev/null | jq -r '.number // ""' || echo "")
  if [[ -n "$PR_NUMBER" ]]; then
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║  📋 PR #$PR_NUMBER exists for this branch"
    echo "║  ⚠️  Call workflow tool, action: \"sync-links\" to link PR      ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
  fi
fi

exit 0
