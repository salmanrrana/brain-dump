#!/bin/bash
# spawn-after-pr.sh
# PostToolUse hook for gh pr create
#
# After a PR is created, this hook can optionally spawn a new terminal
# with Claude ready to work on the next ticket.
#
# Features:
# - Only triggers after successful `gh pr create` commands
# - Checks for active Ralph session and next ticket suggestion
# - Respects AUTO_SPAWN_NEXT_TICKET environment variable
# - Creates a fresh context by starting Claude in a new terminal window

set -e

# Read the hook input from stdin
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input // ""')
TOOL_RESULT=$(echo "$INPUT" | jq -r '.tool_result // ""')

# Only care about Bash commands
if [[ "$TOOL_NAME" != "Bash" ]]; then
  exit 0
fi

# Check if this was a gh pr create command
COMMAND=$(echo "$TOOL_INPUT" | jq -r '.command // ""')
if ! echo "$COMMAND" | grep -qE '^gh pr create'; then
  exit 0
fi

# Check if the PR was created successfully (look for PR URL in output)
if ! echo "$TOOL_RESULT" | grep -qE 'https://github.com/.*/pull/[0-9]+'; then
  exit 0
fi

# Check if auto-spawn is enabled
AUTO_SPAWN="${AUTO_SPAWN_NEXT_TICKET:-0}"
if [[ "$AUTO_SPAWN" != "1" ]]; then
  exit 0
fi

# Use CLAUDE_PROJECT_DIR for reliable path resolution
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Check for Ralph state file to find current ticket
RALPH_STATE="$PROJECT_DIR/.claude/ralph-state.json"
if [[ ! -f "$RALPH_STATE" ]]; then
  exit 0
fi

# Get the current ticket ID from Ralph state
CURRENT_TICKET_ID=$(jq -r '.ticketId // ""' "$RALPH_STATE" 2>/dev/null || echo "")
if [[ -z "$CURRENT_TICKET_ID" ]]; then
  exit 0
fi

# Log the spawn intent
LOG_FILE="$PROJECT_DIR/.claude/ralph-state.log"
mkdir -p "$(dirname "$LOG_FILE")"
echo "[$(date -Iseconds)] PR CREATED - checking for next ticket after: $CURRENT_TICKET_ID" >> "$LOG_FILE"

# Query Brain Dump for next ticket (via the PRD file)
PRD_FILE="$PROJECT_DIR/plans/prd.json"
if [[ ! -f "$PRD_FILE" ]]; then
  exit 0
fi

# Find next incomplete ticket from PRD
# This is a simplified approach - looks for first ticket with passes: false
NEXT_TICKET_ID=$(jq -r '
  .userStories
  | map(select(.passes == false and .id != "'"$CURRENT_TICKET_ID"'"))
  | sort_by(if .priority == "high" then 0 elif .priority == "medium" then 1 else 2 end)
  | .[0].id // ""
' "$PRD_FILE" 2>/dev/null || echo "")

if [[ -z "$NEXT_TICKET_ID" ]]; then
  echo "[$(date -Iseconds)] No next ticket found - sprint may be complete" >> "$LOG_FILE"
  exit 0
fi

echo "[$(date -Iseconds)] SPAWNING next ticket: $NEXT_TICKET_ID" >> "$LOG_FILE"

# Create a temporary script to run in the new terminal
SPAWN_SCRIPT=$(mktemp /tmp/ralph-next-XXXXXX.sh)
cat > "$SPAWN_SCRIPT" << SCRIPT
#!/bin/bash
cd "$PROJECT_DIR"

# Start Claude with context for the next ticket
echo "PR created successfully!"
echo "Starting Claude for next ticket: $NEXT_TICKET_ID"
echo ""

# Run Claude with a prompt to start the next ticket
claude --prompt "The previous ticket's PR was just created. Please call the workflow tool with action 'start-work' and ticketId '$NEXT_TICKET_ID'"
SCRIPT
chmod +x "$SPAWN_SCRIPT"

# Detect terminal and spawn
if [[ "$(uname)" == "Darwin" ]]; then
  # macOS - prefer Ghostty, then iTerm2, then Terminal.app
  if command -v ghostty &> /dev/null || test -d "/Applications/Ghostty.app"; then
    open -n -a Ghostty --args -e "$SPAWN_SCRIPT" &
  elif test -d "/Applications/iTerm.app"; then
    osascript -e "tell application \"iTerm\" to create window with default profile command \"$SPAWN_SCRIPT\"" &
  else
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
