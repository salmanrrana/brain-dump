#!/bin/bash
# enforce-review-before-push.sh
# PreToolUse hook for git push and gh pr create
#
# Enforces two workflow rules:
# 1. Code review must be completed before pushing (via /review skill)
# 2. Direct pushes to main/master are blocked during epic work
#
# Works by checking:
# - .review-completed marker file for code review status
# - epic_workflow_state table for active epic work (blocks main push)

set -e

# Read the hook input from stdin
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input // ""')

# Only care about Bash commands
if [[ "$TOOL_NAME" != "Bash" ]]; then
  echo '{"decision": "approve"}'
  exit 0
fi

# Check if this is a git push or gh pr create command
COMMAND=$(echo "$TOOL_INPUT" | jq -r '.command // ""')

# Match git push or gh pr create commands
if ! echo "$COMMAND" | grep -qE '^(git push|gh pr create)'; then
  echo '{"decision": "approve"}'
  exit 0
fi

# Use CLAUDE_PROJECT_DIR for reliable path resolution
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Check for uncommitted source code changes that need review
cd "$PROJECT_DIR" 2>/dev/null || {
  echo '{"decision": "approve"}'
  exit 0
}

# =============================================================================
# EPIC WORKFLOW ENFORCEMENT
# Block direct pushes to main/master during epic work
# =============================================================================

# Check if this is a push to main/master
is_push_to_main() {
  # Extract the target branch from git push command
  # Patterns: "git push origin main", "git push -u origin main", "git push"
  if echo "$COMMAND" | grep -qE 'git push.*\b(main|master)\b'; then
    return 0
  fi
  # Check for default push (no branch specified - pushes current branch)
  # Only block if current branch IS main/master
  if echo "$COMMAND" | grep -qE '^git push(\s+-[a-z]+)*\s*(origin)?\s*$'; then
    local current_branch
    current_branch=$(git branch --show-current 2>/dev/null || echo "")
    if [[ "$current_branch" == "main" || "$current_branch" == "master" ]]; then
      return 0
    fi
  fi
  return 1
}

# Check if epic work is in progress (via ralph-state.json or epic_workflow_state)
check_epic_work_in_progress() {
  # Check for Ralph state file (indicates active work session)
  local ralph_state="$PROJECT_DIR/.claude/ralph-state.json"
  if [[ -f "$ralph_state" ]]; then
    local ticket_id
    ticket_id=$(jq -r '.ticketId // ""' "$ralph_state" 2>/dev/null || echo "")
    if [[ -n "$ticket_id" ]]; then
      # There's an active Ralph session - check if ticket belongs to an epic
      # Query the database to see if ticket has an epic_id
      local db_path="$HOME/.local/share/brain-dump/brain-dump.db"
      if [[ ! -f "$db_path" ]]; then
        db_path="$HOME/Library/Application Support/brain-dump/brain-dump.db"
      fi
      if [[ -f "$db_path" ]]; then
        local epic_id
        epic_id=$(sqlite3 "$db_path" "SELECT epic_id FROM tickets WHERE id = '$ticket_id' AND epic_id IS NOT NULL LIMIT 1;" 2>/dev/null || echo "")
        if [[ -n "$epic_id" ]]; then
          # Check if epic has incomplete tickets
          local incomplete_count
          incomplete_count=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM tickets WHERE epic_id = '$epic_id' AND status != 'done';" 2>/dev/null || echo "0")
          if [[ "$incomplete_count" -gt 0 ]]; then
            echo "$epic_id"
            return 0
          fi
        fi
      fi
    fi
  fi
  echo ""
  return 1
}

# Check if pushing to main during epic work
if is_push_to_main; then
  epic_id=$(check_epic_work_in_progress)
  if [[ -n "$epic_id" ]]; then
    # Get epic title for better error message
    db_path="$HOME/.local/share/brain-dump/brain-dump.db"
    if [[ ! -f "$db_path" ]]; then
      db_path="$HOME/Library/Application Support/brain-dump/brain-dump.db"
    fi
    epic_title=$(sqlite3 "$db_path" "SELECT title FROM epics WHERE id = '$epic_id' LIMIT 1;" 2>/dev/null || echo "Epic")
    epic_branch=$(sqlite3 "$db_path" "SELECT epic_branch_name FROM epic_workflow_state WHERE epic_id = '$epic_id' LIMIT 1;" 2>/dev/null || echo "feature/epic-*")

    cat <<EOF
{
  "decision": "block",
  "reason": "EPIC WORK IN PROGRESS - Direct push to main/master is blocked.

📋 Active Epic: $epic_title

All work during an epic should be committed to the epic branch:
  Branch: $epic_branch

To push your changes:
  1. Checkout the epic branch: git checkout $epic_branch
  2. Push to the epic branch: git push -u origin $epic_branch
  3. Create/update the PR for the epic branch

The epic PR will be merged to main when all tickets are complete and reviewed."
}
EOF
    exit 0
  fi
fi

# =============================================================================
# CODE REVIEW ENFORCEMENT
# =============================================================================

# Get uncommitted changes in source files
SOURCE_CHANGES=$(git diff --name-only HEAD 2>/dev/null | grep -E '\.(ts|tsx|js|jsx|py|go|rs|java|c|cpp|h|hpp)$' | grep -v '\.d\.ts$' | grep -v 'node_modules' | head -20 || echo "")
STAGED_CHANGES=$(git diff --cached --name-only 2>/dev/null | grep -E '\.(ts|tsx|js|jsx|py|go|rs|java|c|cpp|h|hpp)$' | grep -v '\.d\.ts$' | grep -v 'node_modules' | head -20 || echo "")

# Combine and deduplicate
ALL_CHANGES=$(echo -e "${SOURCE_CHANGES}\n${STAGED_CHANGES}" | sort -u | grep -v '^$' || echo "")

# If no source code changes, allow push
if [[ -z "$ALL_CHANGES" ]]; then
  echo '{"decision": "approve"}'
  exit 0
fi

# Check for review completed marker
REVIEW_MARKER="$PROJECT_DIR/.claude/.review-completed"
if [[ -f "$REVIEW_MARKER" ]]; then
  # Check if marker is recent (within 30 minutes for push operations)
  MARKER_AGE=$(($(date +%s) - $(stat -f %m "$REVIEW_MARKER" 2>/dev/null || stat -c %Y "$REVIEW_MARKER" 2>/dev/null || echo 0)))
  if [[ "$MARKER_AGE" -lt 1800 ]]; then
    # Review was run recently, allow push
    echo '{"decision": "approve"}'
    exit 0
  fi
fi

# Count changed files for the message
CHANGE_COUNT=$(echo "$ALL_CHANGES" | wc -l | tr -d ' ')

# Review not completed or marker too old - block push
cat <<EOF
{
  "decision": "block",
  "reason": "CODE REVIEW REQUIRED before push. Detected $CHANGE_COUNT uncommitted source file(s). Run \`/review\` first to analyze changes with the code review pipeline (code-reviewer, silent-failure-hunter, code-simplifier). After review completes, retry the push command."
}
EOF
