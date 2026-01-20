#!/bin/bash
# chain-extended-review.sh
# SubagentStop hook that triggers extended review after pr-review-toolkit agents complete
#
# This hook fires when any agent completes. It tracks which pr-review-toolkit agents
# have finished and triggers extended review after the threshold is met.
#
# Environment variables available:
# - CLAUDE_PROJECT_DIR: Project root directory
# - TOOL_RESULT: JSON result from the completed agent
# - AGENT_TYPE: The type of agent that completed

set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
TRACKING_FILE="$PROJECT_DIR/.claude/.extended-review-pending"
THRESHOLD=2  # Trigger after this many pr-review-toolkit agents complete

# pr-review-toolkit agent identifiers to track
PR_REVIEW_AGENTS=(
  "pr-review-toolkit:code-reviewer"
  "pr-review-toolkit:silent-failure-hunter"
  "pr-review-toolkit:code-simplifier"
)

# Check if the completed agent is a pr-review-toolkit agent
is_pr_review_agent() {
  local agent="$1"
  for pr_agent in "${PR_REVIEW_AGENTS[@]}"; do
    if [[ "$agent" == "$pr_agent" ]]; then
      return 0
    fi
  done
  return 1
}

# Initialize tracking file if it doesn't exist
init_tracking() {
  if [[ ! -f "$TRACKING_FILE" ]]; then
    echo "0" > "$TRACKING_FILE"
  fi
}

# Increment the completion counter
increment_counter() {
  local count
  count=$(cat "$TRACKING_FILE" 2>/dev/null || echo "0")
  count=$((count + 1))
  echo "$count" > "$TRACKING_FILE"
  echo "$count"
}

# Reset the tracking file
reset_tracking() {
  rm -f "$TRACKING_FILE"
}

# Main logic
main() {
  local agent_type="${AGENT_TYPE:-unknown}"

  # Only process pr-review-toolkit agents
  if ! is_pr_review_agent "$agent_type"; then
    exit 0
  fi

  init_tracking

  local count
  count=$(increment_counter)

  # Check if we've reached the threshold
  if [[ "$count" -ge "$THRESHOLD" ]]; then
    # Reset for next time
    reset_tracking

    # Signal that extended review should run
    # The actual triggering happens via the hook output being read by Claude
    echo "TRIGGER_EXTENDED_REVIEW"
    echo ""
    echo "pr-review-toolkit agents completed ($count/$THRESHOLD threshold reached)."
    echo "Please run /extended-review to continue with deeper analysis:"
    echo "- context7-library-compliance: Verify library usage against docs"
    echo "- react-best-practices: Review React/Next.js patterns (if applicable)"
    echo "- cruft-detector: Find unnecessary code and shallow tests"
    echo "- senior-engineer: Synthesize all findings with recommendations"
  fi
}

main "$@"
