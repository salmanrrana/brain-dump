#!/bin/bash
# Mark that code review has been completed for this session
# Called after review agents finish

set -e

# Use CLAUDE_PROJECT_DIR if set, otherwise try to find git root
if [ -n "$CLAUDE_PROJECT_DIR" ]; then
    PROJECT_DIR="$CLAUDE_PROJECT_DIR"
else
    PROJECT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
fi

if [ -z "$PROJECT_DIR" ]; then
    exit 0
fi

# Create marker directory if it doesn't exist
mkdir -p "$PROJECT_DIR/.claude"

# Touch the marker file to indicate review was completed
touch "$PROJECT_DIR/.claude/.review-completed"

# Output success
echo '{"ok": true}'
