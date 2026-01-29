#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: ./plans/ralph.sh <max_iterations>"
  echo ""
  echo "Example: ./plans/ralph.sh 10"
  echo ""
  echo "Runs Claude Code in a loop, working through the PRD"
  echo "until all items pass or max iterations is reached."
  exit 1
fi

MAX_ITERATIONS=$1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PROGRESS_FILE="$PROJECT_DIR/plans/progress.txt"

cd "$PROJECT_DIR"

# Rotate progress file if it exceeds 500 lines
rotate_progress_file() {
  if [ -f "$PROGRESS_FILE" ]; then
    LINE_COUNT=$(wc -l < "$PROGRESS_FILE" | tr -d ' ')
    if [ "$LINE_COUNT" -gt 500 ]; then
      ARCHIVE_DIR="$PROJECT_DIR/plans/archives"
      mkdir -p "$ARCHIVE_DIR"
      TIMESTAMP=$(date '+%Y%m%d-%H%M%S')
      ARCHIVE_FILE="$ARCHIVE_DIR/progress-$TIMESTAMP.txt"

      # Keep last 100 lines in active file, archive the rest
      LINES_TO_ARCHIVE=$((LINE_COUNT - 100))
      head -n "$LINES_TO_ARCHIVE" "$PROGRESS_FILE" > "$ARCHIVE_FILE"
      tail -n 100 "$PROGRESS_FILE" > "$PROGRESS_FILE.tmp"

      # Add header to rotated file
      {
        echo "# Ralph Progress Log"
        echo "# Previous entries archived to: archives/progress-$TIMESTAMP.txt"
        echo ""
        cat "$PROGRESS_FILE.tmp"
      } > "$PROGRESS_FILE"
      rm -f "$PROGRESS_FILE.tmp"

      echo "📦 Archived $LINES_TO_ARCHIVE lines to archives/progress-$TIMESTAMP.txt"
    fi
  fi
}

# Run rotation before starting
rotate_progress_file

for ((i=1; i<=MAX_ITERATIONS; i++)); do
  echo ""
  echo "=========================================="
  echo "Ralph iteration $i of $MAX_ITERATIONS"
  echo "$(date '+%Y-%m-%d %H:%M:%S')"
  echo "=========================================="
  echo ""

  OUTPUT=$(claude -p "$(cat <<'EOF'
You are Ralph, an autonomous coding agent. Focus on implementation - MCP tools handle workflow.

## Your Task
1. Read plans/prd.json to see incomplete tickets (passes: false)
2. Read recent progress context: \`tail -100 plans/progress.txt\` (use Bash tool)
3. Strategically pick ONE ticket (consider priority, dependencies, foundation work)
4. Call start_ticket_work(ticketId) - this creates branch and posts progress
5. Implement the feature:
   - Write the code
   - Run tests: pnpm test
   - Verify acceptance criteria
6. Git commit: git commit -m "feat(<ticket-id>): <description>"
7. Call complete_ticket_work(ticketId, "summary of changes") - this updates PRD and posts summary
8. If all tickets complete, output: PRD_COMPLETE

## Rules
- ONE ticket per iteration
- Run tests before completing
- Keep changes minimal and focused
- If stuck, note in progress.txt and move on
EOF
)")

  echo "$OUTPUT"

  if echo "$OUTPUT" | grep -q "PRD_COMPLETE"; then
    echo ""
    echo "=========================================="
    echo "All PRD items complete! Ralph is done."
    echo "=========================================="
    exit 0
  fi
done

echo ""
echo "=========================================="
echo "Reached max iterations ($MAX_ITERATIONS)"
echo "=========================================="
