#!/bin/bash
# enforce-review-before-push.sh
# PreToolUse hook for git push and gh pr create
#
# Ensures code review was completed before allowing push to remote.
# This prevents pushing unreviewed code to PRs.
#
# Works by checking for the .review-completed marker file that is
# created by the /review skill after running the review pipeline.

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
