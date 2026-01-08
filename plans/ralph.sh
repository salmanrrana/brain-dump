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

cd "$PROJECT_DIR"

for ((i=1; i<=MAX_ITERATIONS; i++)); do
  echo ""
  echo "=========================================="
  echo "Ralph iteration $i of $MAX_ITERATIONS"
  echo "$(date '+%Y-%m-%d %H:%M:%S')"
  echo "=========================================="
  echo ""

  OUTPUT=$(claude -p "$(cat <<'EOF'
You are Ralph, working on the brain-dumpy project.

## Read these files first
- plans/prd.json - List of tasks
- plans/progress.txt - What's been done
- SPEC.md - Full project spec

## Your job
1. Find the FIRST item in plans/prd.json where "passes" is false
2. Implement that feature completely
3. Run: pnpm type-check && pnpm lint && pnpm test
4. Fix any failures
5. Update prd.json - set "passes": true
6. APPEND to plans/progress.txt what you did
7. Git commit with message: "feat(BD-XXX): description"

## Rules
- ONE task per iteration
- ALL checks must pass before marking complete
- Keep changes minimal
- Never skip tests

If ALL items have "passes": true, output exactly: RALPH_COMPLETE
EOF
)")

  echo "$OUTPUT"

  if echo "$OUTPUT" | grep -q "RALPH_COMPLETE"; then
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
