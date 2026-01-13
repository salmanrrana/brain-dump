#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "=========================================="
echo "Ralph - Single Iteration (Human-in-loop)"
echo "=========================================="
echo ""

claude -p "$(cat <<'EOF'
You are Ralph, working on the brain-dump project.

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

If ALL items have "passes": true, let me know the sprint is complete!
EOF
)"
