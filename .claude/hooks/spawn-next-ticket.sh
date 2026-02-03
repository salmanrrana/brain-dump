#!/bin/bash
# spawn-next-ticket.sh
# PostToolUse hook for workflow (action: complete-work)
#
# After a ticket is completed, this hook can optionally spawn a new terminal
# with Claude already running, ready to work on the next ticket.
#
# Features:
# - Checks for a next ticket suggestion in the tool result
# - Only spawns if user has configured AUTO_SPAWN_NEXT_TICKET=1
# - Creates a fresh context by starting Claude in a new terminal window

set -e

# Read the hook input from stdin
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')

# Only care about workflow tool with action: complete-work
if [[ "$TOOL_NAME" != "mcp__brain-dump__workflow" ]]; then
  echo "$INPUT" | jq '.tool_result // empty'
  exit 0
fi

# Check that this is the complete-work action
TOOL_INPUT_JSON=$(echo "$INPUT" | jq -r '.tool_input // "{}"')
ACTION=$(echo "$TOOL_INPUT_JSON" | jq -r '.action // ""')
if [[ "$ACTION" != "complete-work" ]]; then
  echo "$INPUT" | jq '.tool_result // empty'
  exit 0
fi

# Check if auto-spawn is enabled via environment variable or settings
AUTO_SPAWN="${AUTO_SPAWN_NEXT_TICKET:-0}"
if [[ "$AUTO_SPAWN" != "1" ]]; then
  # Auto-spawn not enabled, just pass through
  echo "$INPUT" | jq '.tool_result // empty'
  exit 0
fi

# Use CLAUDE_PROJECT_DIR for reliable path resolution
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Extract next ticket info from the tool result
TOOL_RESULT=$(echo "$INPUT" | jq -r '.tool_result // ""')

# Look for the next ticket pattern in the result
# Pattern: workflow tool with action "start-work" and ticketId
NEXT_TICKET_ID=$(echo "$TOOL_RESULT" | grep -oE '"ticketId":\s*"[^"]+"' | head -1 | sed 's/"ticketId":\s*"//;s/"$//' || echo "")
# Fallback: try the old pattern for backward compatibility
if [[ -z "$NEXT_TICKET_ID" ]]; then
  NEXT_TICKET_ID=$(echo "$TOOL_RESULT" | grep -oE 'start_ticket_work\("[^"]+"\)' | head -1 | sed 's/start_ticket_work("//;s/")//' || echo "")
fi

if [[ -z "$NEXT_TICKET_ID" ]]; then
  # No next ticket suggested, just pass through
  echo "$INPUT" | jq '.tool_result // empty'
  exit 0
fi

# Log the spawn intent
LOG_FILE="$PROJECT_DIR/.claude/ralph-state.log"
mkdir -p "$(dirname "$LOG_FILE")"
echo "[$(date -Iseconds)] NEXT TICKET SPAWN: ticket=$NEXT_TICKET_ID" >> "$LOG_FILE"

# Create a temporary script to run in the new terminal
SPAWN_SCRIPT=$(mktemp /tmp/ralph-next-XXXXXX.sh)
cat > "$SPAWN_SCRIPT" << SCRIPT
#!/bin/bash
cd "$PROJECT_DIR"

# Start Claude with context for the next ticket
echo "Starting Claude for ticket: $NEXT_TICKET_ID"
echo ""

# Run Claude with a prompt to start the next ticket
claude --prompt "Please call the workflow tool with action 'start-work' and ticketId '$NEXT_TICKET_ID'"
SCRIPT
chmod +x "$SPAWN_SCRIPT"

# Detect terminal and spawn
# Use the Brain Dump terminal detection via the settings
# For now, use a simple approach that works on macOS

if [[ "$(uname)" == "Darwin" ]]; then
  # macOS - prefer Ghostty, then iTerm2, then Terminal.app
  if command -v ghostty &> /dev/null || test -d "/Applications/Ghostty.app"; then
    open -n -a Ghostty --args -e "$SPAWN_SCRIPT" &
  elif test -d "/Applications/iTerm.app"; then
    osascript -e "tell application \"iTerm\" to create window with default profile command \"$SPAWN_SCRIPT\"" &
  else
    # Fall back to Terminal.app
    osascript -e "tell application \"Terminal\" to do script \"$SPAWN_SCRIPT\"" &
  fi
else
  # Linux - try common terminals
  if command -v ghostty &> /dev/null; then
    ghostty -e "$SPAWN_SCRIPT" &
  elif command -v kitty &> /dev/null; then
    kitty bash "$SPAWN_SCRIPT" &
  elif command -v gnome-terminal &> /dev/null; then
    gnome-terminal -- bash "$SPAWN_SCRIPT" &
  fi
fi

# Pass through the original result unchanged
echo "$INPUT" | jq '.tool_result // empty'
