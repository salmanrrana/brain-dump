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
You are Ralph, an autonomous coding agent. Complete the full implementation, AI review, and demo handoff before moving to another ticket.

## Your Task
1. Read plans/prd.json to see scoped tickets
2. Read recent progress context: \`tail -100 plans/progress.txt\` (use Bash tool)
3. For each \`passes: false\` candidate, call ticket "get"({ ticketId }) to check live status
4. If any candidate is already in ai_review, resume it first: review findings, fix critical/major issues, check-complete, generate-demo
5. Otherwise strategically pick ONE ticket in backlog, ready, or in_progress
6. Call workflow "start-work"({ ticketId }) - this creates branch and posts progress
7. Implement the feature:
   - Write the code
   - Discover and run this project's validation commands from docs/config
   - Do not assume pnpm/npm; if no automated validation exists, run a targeted manual smoke check
   - Verify acceptance criteria
   - Add a comment with commentType "test_report" summarizing exact validation results
8. Git commit: git commit -m "feat(<ticket-id>): <description>"
9. Call workflow "complete-work"({ ticketId, summary: "summary of changes" }) - this moves the ticket to ai_review
10. Run AI review, submit/fix findings, call review "check-complete", then review "generate-demo" with at least 3 manual steps
11. Stop after the ticket reaches human_review
12. If all scoped tickets are in human_review or done, output: PRD_COMPLETE

## Rules
- ONE ticket per iteration
- Run project-specific validation before completing
- Keep changes minimal and focused
- A ticket in ai_review is not complete; resume it before starting backlog/ready work
- If stuck, note in progress.txt and move on only after the ticket cannot be advanced safely
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
