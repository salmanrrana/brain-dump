#!/bin/bash
# merge-telemetry-hooks.sh
# Safely merges telemetry hook configuration into ~/.claude/settings.json
#
# This script adds telemetry hooks without overwriting existing configuration.
# It uses jq to safely merge JSON structures.

set -e

# Configuration
CLAUDE_SETTINGS="$HOME/.claude/settings.json"
HOOKS_DIR="$HOME/.claude/hooks"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Merging telemetry hooks into Claude Code settings...${NC}"
echo ""

# Check if settings file exists
if [[ ! -f "$CLAUDE_SETTINGS" ]]; then
  echo -e "${YELLOW}Warning: $CLAUDE_SETTINGS does not exist. Please run setup-claude-code.sh first.${NC}"
  exit 1
fi

# Verify hooks exist
if [[ ! -f "$HOOKS_DIR/start-telemetry-session.sh" ]]; then
  echo -e "${YELLOW}Error: Telemetry hooks not found in $HOOKS_DIR${NC}"
  exit 1
fi

# Create a temporary file for the updated settings
TEMP_SETTINGS=$(mktemp)

# Merge telemetry hooks into settings using jq
jq '.hooks.SessionStart |= (. + [{"hooks": [{"type": "command", "command": "$HOME/.claude/hooks/start-telemetry-session.sh"}]}]) |
    .hooks.Stop |= (. + [{"hooks": [{"type": "command", "command": "$HOME/.claude/hooks/end-telemetry-session.sh"}]}]) |
    .hooks.PreToolUse |= (. + [{"hooks": [{"type": "command", "command": "$HOME/.claude/hooks/log-tool-start.sh"}]}]) |
    .hooks.PostToolUse |= (. + [{"hooks": [{"type": "command", "command": "$HOME/.claude/hooks/log-tool-end.sh"}]}]) |
    .hooks.PostToolUseFailure |= (. // [] | . + [{"hooks": [{"type": "command", "command": "$HOME/.claude/hooks/log-tool-failure.sh"}]}]) |
    .hooks.UserPromptSubmit |= (. // [] | . + [{"hooks": [{"type": "command", "command": "$HOME/.claude/hooks/log-prompt.sh"}]}])' \
  "$CLAUDE_SETTINGS" > "$TEMP_SETTINGS"

# Backup original and replace with updated version
cp "$CLAUDE_SETTINGS" "${CLAUDE_SETTINGS}.backup"
mv "$TEMP_SETTINGS" "$CLAUDE_SETTINGS"

echo -e "${GREEN}✓ Telemetry hooks merged successfully!${NC}"
echo ""
echo -e "${BLUE}Configured hooks:${NC}"
echo "  • SessionStart → start-telemetry-session.sh"
echo "  • Stop → end-telemetry-session.sh"
echo "  • PreToolUse → log-tool-start.sh"
echo "  • PostToolUse → log-tool-end.sh"
echo "  • PostToolUseFailure → log-tool-failure.sh"
echo "  • UserPromptSubmit → log-prompt.sh"
echo ""
echo -e "${YELLOW}Backup saved to: ${CLAUDE_SETTINGS}.backup${NC}"
echo ""
