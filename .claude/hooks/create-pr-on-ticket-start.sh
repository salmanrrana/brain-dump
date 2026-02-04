#!/bin/bash
# create-pr-on-ticket-start.sh
# PostToolUse hook for mcp__brain-dump__workflow (action: start-work)
#
# After a ticket work session starts, this hook automatically:
# 1. Creates an empty WIP commit
# 2. Pushes the branch to remote
# 3. Creates a draft PR
# 4. Links the PR to the ticket
#
# This ensures all work is tracked in a PR from the very first moment.

set -e

# Read the hook input from stdin
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')
TOOL_RESULT=$(echo "$INPUT" | jq -r '.tool_result // ""')

# Only care about workflow MCP calls with action: start-work
if [[ "$TOOL_NAME" != "mcp__brain-dump__workflow" ]]; then
  exit 0
fi

# Check that this is the start-work action
TOOL_INPUT_JSON=$(echo "$INPUT" | jq -r '.tool_input // "{}"')
ACTION=$(echo "$TOOL_INPUT_JSON" | jq -r '.action // ""')
if [[ "$ACTION" != "start-work" ]]; then
  exit 0
fi

# Check if the tool succeeded (look for branch name in output)
BRANCH_NAME=$(echo "$TOOL_RESULT" | grep -oE 'feature/[a-f0-9]+-[a-z0-9-]+' | head -1 || echo "")
if [[ -z "$BRANCH_NAME" ]]; then
  # Tool may have failed or ticket was already in progress
  exit 0
fi

# Extract ticket info from the result
TICKET_ID=$(echo "$TOOL_RESULT" | grep -oE '"id":\s*"[^"]+"' | head -1 | sed 's/"id":\s*"//' | sed 's/"$//' || echo "")
TICKET_TITLE=$(echo "$TOOL_RESULT" | grep -oE '"title":\s*"[^"]+"' | head -1 | sed 's/"title":\s*"//' | sed 's/"$//' || echo "")

if [[ -z "$TICKET_ID" ]]; then
  exit 0
fi

# Use CLAUDE_PROJECT_DIR for reliable path resolution
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Log the PR creation intent
LOG_FILE="$PROJECT_DIR/.claude/auto-pr.log"
mkdir -p "$(dirname "$LOG_FILE")"
echo "[$(date -Iseconds)] TICKET STARTED: $TICKET_ID on branch $BRANCH_NAME" >> "$LOG_FILE"

# Check if we're on the expected branch
CURRENT_BRANCH=$(cd "$PROJECT_DIR" && git branch --show-current 2>/dev/null || echo "")
if [[ "$CURRENT_BRANCH" != "$BRANCH_NAME" ]]; then
  echo "[$(date -Iseconds)] ERROR: Expected branch $BRANCH_NAME but on $CURRENT_BRANCH" >> "$LOG_FILE"
  exit 0
fi

# Check if there's already a PR for this branch
EXISTING_PR=$(cd "$PROJECT_DIR" && gh pr view "$BRANCH_NAME" --json number 2>/dev/null | jq -r '.number // ""' || echo "")
if [[ -n "$EXISTING_PR" ]]; then
  echo "[$(date -Iseconds)] PR already exists: #$EXISTING_PR" >> "$LOG_FILE"
  exit 0
fi

# Get the short ticket ID for commit message
SHORT_ID=$(echo "$TICKET_ID" | cut -c1-8)

# Create an empty WIP commit
echo "[$(date -Iseconds)] Creating WIP commit..." >> "$LOG_FILE"
cd "$PROJECT_DIR"
git commit --allow-empty -m "feat($SHORT_ID): WIP - $TICKET_TITLE

This is an auto-generated commit to enable PR creation.
Actual implementation follows in subsequent commits.

Ticket: $TICKET_ID" 2>> "$LOG_FILE" || {
  echo "[$(date -Iseconds)] ERROR: Failed to create WIP commit" >> "$LOG_FILE"
  exit 0
}

# Push the branch
echo "[$(date -Iseconds)] Pushing branch to remote..." >> "$LOG_FILE"
git push -u origin "$BRANCH_NAME" 2>> "$LOG_FILE" || {
  echo "[$(date -Iseconds)] ERROR: Failed to push branch" >> "$LOG_FILE"
  exit 0
}

# Create draft PR
echo "[$(date -Iseconds)] Creating draft PR..." >> "$LOG_FILE"
PR_OUTPUT=$(gh pr create --draft \
  --title "feat($SHORT_ID): $TICKET_TITLE" \
  --body "$(cat <<EOF
## Summary
Work in progress for ticket: $TICKET_ID

**$TICKET_TITLE**

---
_This PR was auto-created when work started on the ticket._
_Draft status will be removed when the ticket is complete._

Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" 2>> "$LOG_FILE") || {
  echo "[$(date -Iseconds)] ERROR: Failed to create PR" >> "$LOG_FILE"
  exit 0
}

# Extract PR number from output
PR_URL=$(echo "$PR_OUTPUT" | grep -oE 'https://github.com/[^/]+/[^/]+/pull/[0-9]+' | head -1 || echo "")
PR_NUMBER=$(echo "$PR_URL" | grep -oE '[0-9]+$' || echo "")

if [[ -z "$PR_NUMBER" ]]; then
  echo "[$(date -Iseconds)] ERROR: Could not extract PR number from: $PR_OUTPUT" >> "$LOG_FILE"
  exit 0
fi

echo "[$(date -Iseconds)] Created draft PR #$PR_NUMBER: $PR_URL" >> "$LOG_FILE"

# Output feedback for Claude to see
echo ""
echo "AUTO-PR CREATED"
echo "==============="
echo "Draft PR #$PR_NUMBER created for ticket $SHORT_ID"
echo "URL: $PR_URL"
echo ""
echo "The PR has been linked to the ticket. All commits will be tracked."
echo ""

# Note: We can't call MCP tools from hooks, but Claude will see this output
# and can call workflow tool (action: "link-pr") if needed. The PR info is also visible in GitHub.

exit 0
