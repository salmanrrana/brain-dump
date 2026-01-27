#!/bin/bash
# enforce-state-before-write.sh
# PreToolUse hook for Write and Edit tools
#
# This hook enforces that Claude must be in the 'implementing' or 'testing' state
# before writing or editing code files during a Ralph session.
#
# When NOT in Ralph mode (no state file), allows all operations.
# When in Ralph mode, blocks Write/Edit unless in correct state.
#
# Optional HMAC verification: When ENABLE_RALPH_STATE_HMAC=1, verifies
# the state file hasn't been tampered with. Logs warning but doesn't block
# on HMAC failure (defense in depth, not hard blocker).

set -e

# Read the hook input from stdin
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')

# Only care about Write and Edit tools
if [[ "$TOOL_NAME" != "Write" && "$TOOL_NAME" != "Edit" ]]; then
  echo '{"decision": "allow"}'
  exit 0
fi

# Use CLAUDE_PROJECT_DIR for reliable path resolution
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Check if we're in Ralph mode (state file exists)
STATE_FILE="$PROJECT_DIR/.claude/ralph-state.json"
if [[ ! -f "$STATE_FILE" ]]; then
  # Not in Ralph mode - allow normal operation
  echo '{"decision": "allow"}'
  exit 0
fi

# Optional HMAC verification when enabled
if [[ "$ENABLE_RALPH_STATE_HMAC" == "1" || "$ENABLE_RALPH_STATE_HMAC" == "true" ]]; then
  # Find the verify script - try multiple locations
  VERIFY_SCRIPT=""
  if [[ -f "$PROJECT_DIR/mcp-server/lib/verify-state-hmac.js" ]]; then
    VERIFY_SCRIPT="$PROJECT_DIR/mcp-server/lib/verify-state-hmac.js"
  elif [[ -f "$HOME/.brain-dump/mcp-server/lib/verify-state-hmac.js" ]]; then
    VERIFY_SCRIPT="$HOME/.brain-dump/mcp-server/lib/verify-state-hmac.js"
  fi

  if [[ -n "$VERIFY_SCRIPT" ]]; then
    # Run HMAC verification - capture stdout (JSON) and stderr separately
    # Note: Any warnings/errors from node go to stderr (file descriptor 3)
    HMAC_RESULT=$(node "$VERIFY_SCRIPT" "$STATE_FILE" 2>/dev/null) || true
    HMAC_VALID=$(echo "$HMAC_RESULT" | jq -r '.valid // false' 2>/dev/null || echo "false")

    if [[ "$HMAC_VALID" != "true" ]]; then
      HMAC_REASON=$(echo "$HMAC_RESULT" | jq -r '.reason // "unknown"' 2>/dev/null || echo "unknown")
      # Log warning to stderr but don't block - defense in depth
      echo "[SECURITY WARNING] Ralph state HMAC verification failed: $HMAC_REASON" >&2
    fi
  fi
fi

# Read current state from file
CURRENT_STATE=$(jq -r '.currentState // "unknown"' "$STATE_FILE" 2>/dev/null || echo "unknown")
SESSION_ID=$(jq -r '.sessionId // "unknown"' "$STATE_FILE" 2>/dev/null || echo "unknown")

# Check if current state allows writing code
# Valid states for code changes: implementing, testing, committing
if [[ "$CURRENT_STATE" == "implementing" || "$CURRENT_STATE" == "testing" || "$CURRENT_STATE" == "committing" ]]; then
  echo '{"decision": "allow"}'
  exit 0
fi

# Block with helpful guidance
cat <<EOF
{
  "decision": "block",
  "message": "STATE ENFORCEMENT: You are in '$CURRENT_STATE' state but tried to write/edit code.\n\nTo write code, you MUST first call:\n\n  update_session_state({ sessionId: \"$SESSION_ID\", state: \"implementing\" })\n\nAfter updating your state, retry this operation.\n\nValid states for writing code: implementing, testing, committing"
}
EOF
