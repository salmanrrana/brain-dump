#!/bin/bash
# Check for uncommitted source code changes that require review
# This hook detects changes from both main conversation AND sub-agents
# by checking git status instead of relying on tool usage in the transcript

set -e

# Use CLAUDE_PROJECT_DIR if set, otherwise try to find git root
if [ -n "$CLAUDE_PROJECT_DIR" ]; then
    PROJECT_DIR="$CLAUDE_PROJECT_DIR"
else
    PROJECT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
fi

if [ -z "$PROJECT_DIR" ]; then
    # Not in a git repo, allow
    echo '{"ok": true}'
    exit 0
fi

cd "$PROJECT_DIR"

# Check for a marker file that indicates review was already run this session
REVIEW_MARKER="$PROJECT_DIR/.claude/.review-completed"
if [ -f "$REVIEW_MARKER" ]; then
    # Check if marker is from the current session (within last 5 minutes)
    MARKER_AGE=$(($(date +%s) - $(stat -f %m "$REVIEW_MARKER" 2>/dev/null || stat -c %Y "$REVIEW_MARKER" 2>/dev/null || echo 0)))
    if [ "$MARKER_AGE" -lt 300 ]; then
        # Review was run recently, allow
        echo '{"ok": true}'
        exit 0
    fi
fi

# Get uncommitted changes in source files (staged and unstaged)
# Exclude common non-code files
SOURCE_CHANGES=$(git diff --name-only HEAD 2>/dev/null | grep -E '\.(ts|tsx|js|jsx|py|go|rs|java|c|cpp|h|hpp)$' | grep -v '\.d\.ts$' | grep -v 'node_modules' | head -20 || echo "")
STAGED_CHANGES=$(git diff --cached --name-only 2>/dev/null | grep -E '\.(ts|tsx|js|jsx|py|go|rs|java|c|cpp|h|hpp)$' | grep -v '\.d\.ts$' | grep -v 'node_modules' | head -20 || echo "")

# Combine and deduplicate
ALL_CHANGES=$(echo -e "${SOURCE_CHANGES}\n${STAGED_CHANGES}" | sort -u | grep -v '^$' || echo "")

if [ -z "$ALL_CHANGES" ]; then
    # No source code changes detected
    echo '{"ok": true}'
    exit 0
fi

# Count changed files
CHANGE_COUNT=$(echo "$ALL_CHANGES" | wc -l | tr -d ' ')

# Check if this is a minor change (1-2 files, small diff)
if [ "$CHANGE_COUNT" -le 2 ]; then
    # Check diff size
    DIFF_LINES=$(git diff HEAD -- $ALL_CHANGES 2>/dev/null | wc -l | tr -d ' ')
    if [ "$DIFF_LINES" -lt 50 ]; then
        # Minor change, skip review
        echo '{"ok": true}'
        exit 0
    fi
fi

# Format the file list for the message
FILE_LIST=$(echo "$ALL_CHANGES" | head -5 | tr '\n' ', ' | sed 's/,$//')
if [ "$CHANGE_COUNT" -gt 5 ]; then
    FILE_LIST="$FILE_LIST, and $((CHANGE_COUNT - 5)) more"
fi

# Source code changes detected, trigger review
cat <<EOF
{
  "ok": false,
  "reason": "CODE REVIEW REQUIRED: Detected $CHANGE_COUNT uncommitted source file(s): $FILE_LIST. Run /review to analyze changes with the code review pipeline (code-reviewer, silent-failure-hunter, code-simplifier)."
}
EOF
