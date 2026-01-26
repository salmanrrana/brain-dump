#!/bin/bash
# merge-telemetry-hooks.sh
# Safely merges telemetry hook configuration into ~/.claude/settings.json
#
# This script adds telemetry hooks without overwriting existing configuration.
# It uses jq to safely merge JSON structures and is IDEMPOTENT - running it
# multiple times will not create duplicate hooks.

set -e

# Configuration
CLAUDE_SETTINGS="$HOME/.claude/settings.json"
HOOKS_DIR="$HOME/.claude/hooks"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Cleanup handler for temp files
TEMP_SETTINGS=""
cleanup() {
  [[ -n "$TEMP_SETTINGS" && -f "$TEMP_SETTINGS" ]] && rm -f "$TEMP_SETTINGS"
  [[ -n "$TEMP_SETTINGS" && -f "${TEMP_SETTINGS}.new" ]] && rm -f "${TEMP_SETTINGS}.new"
}
trap cleanup EXIT

echo -e "${BLUE}Merging telemetry hooks into Claude Code settings...${NC}"
echo ""

# Check if jq is installed
if ! command -v jq >/dev/null 2>&1; then
  echo -e "${RED}Error: jq is required but not installed.${NC}" >&2
  echo -e "Install with: brew install jq (macOS) or apt install jq (Linux)" >&2
  exit 1
fi

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

# Check which telemetry hooks are already configured
check_hook_exists() {
  local hook_file="$1"
  grep -q "$hook_file" "$CLAUDE_SETTINGS" 2>/dev/null
}

HOOKS_ADDED=0

# Create a temporary file for the updated settings
TEMP_SETTINGS=$(mktemp)
cp "$CLAUDE_SETTINGS" "$TEMP_SETTINGS"

# Add each telemetry hook only if it doesn't already exist
# SessionStart - start-telemetry-session.sh
if ! check_hook_exists "start-telemetry-session.sh"; then
  jq '.hooks.SessionStart = (.hooks.SessionStart // []) + [{"hooks": [{"type": "command", "command": "$HOME/.claude/hooks/start-telemetry-session.sh"}]}]' \
    "$TEMP_SETTINGS" > "${TEMP_SETTINGS}.new" && mv "${TEMP_SETTINGS}.new" "$TEMP_SETTINGS"
  echo -e "  ${GREEN}+${NC} SessionStart → start-telemetry-session.sh"
  HOOKS_ADDED=$((HOOKS_ADDED + 1))
else
  echo -e "  ${YELLOW}✓${NC} SessionStart → start-telemetry-session.sh (already configured)"
fi

# Stop - end-telemetry-session.sh
if ! check_hook_exists "end-telemetry-session.sh"; then
  jq '.hooks.Stop = (.hooks.Stop // []) + [{"hooks": [{"type": "command", "command": "$HOME/.claude/hooks/end-telemetry-session.sh"}]}]' \
    "$TEMP_SETTINGS" > "${TEMP_SETTINGS}.new" && mv "${TEMP_SETTINGS}.new" "$TEMP_SETTINGS"
  echo -e "  ${GREEN}+${NC} Stop → end-telemetry-session.sh"
  HOOKS_ADDED=$((HOOKS_ADDED + 1))
else
  echo -e "  ${YELLOW}✓${NC} Stop → end-telemetry-session.sh (already configured)"
fi

# PreToolUse - log-tool-start.sh
if ! check_hook_exists "log-tool-start.sh"; then
  jq '.hooks.PreToolUse = (.hooks.PreToolUse // []) + [{"hooks": [{"type": "command", "command": "$HOME/.claude/hooks/log-tool-start.sh"}]}]' \
    "$TEMP_SETTINGS" > "${TEMP_SETTINGS}.new" && mv "${TEMP_SETTINGS}.new" "$TEMP_SETTINGS"
  echo -e "  ${GREEN}+${NC} PreToolUse → log-tool-start.sh"
  HOOKS_ADDED=$((HOOKS_ADDED + 1))
else
  echo -e "  ${YELLOW}✓${NC} PreToolUse → log-tool-start.sh (already configured)"
fi

# PostToolUse - log-tool-end.sh
if ! check_hook_exists "log-tool-end.sh"; then
  jq '.hooks.PostToolUse = (.hooks.PostToolUse // []) + [{"hooks": [{"type": "command", "command": "$HOME/.claude/hooks/log-tool-end.sh"}]}]' \
    "$TEMP_SETTINGS" > "${TEMP_SETTINGS}.new" && mv "${TEMP_SETTINGS}.new" "$TEMP_SETTINGS"
  echo -e "  ${GREEN}+${NC} PostToolUse → log-tool-end.sh"
  HOOKS_ADDED=$((HOOKS_ADDED + 1))
else
  echo -e "  ${YELLOW}✓${NC} PostToolUse → log-tool-end.sh (already configured)"
fi

# PostToolUseFailure - log-tool-failure.sh
if ! check_hook_exists "log-tool-failure.sh"; then
  jq '.hooks.PostToolUseFailure = (.hooks.PostToolUseFailure // []) + [{"hooks": [{"type": "command", "command": "$HOME/.claude/hooks/log-tool-failure.sh"}]}]' \
    "$TEMP_SETTINGS" > "${TEMP_SETTINGS}.new" && mv "${TEMP_SETTINGS}.new" "$TEMP_SETTINGS"
  echo -e "  ${GREEN}+${NC} PostToolUseFailure → log-tool-failure.sh"
  HOOKS_ADDED=$((HOOKS_ADDED + 1))
else
  echo -e "  ${YELLOW}✓${NC} PostToolUseFailure → log-tool-failure.sh (already configured)"
fi

# UserPromptSubmit - log-prompt.sh
if ! check_hook_exists "log-prompt.sh"; then
  jq '.hooks.UserPromptSubmit = (.hooks.UserPromptSubmit // []) + [{"hooks": [{"type": "command", "command": "$HOME/.claude/hooks/log-prompt.sh"}]}]' \
    "$TEMP_SETTINGS" > "${TEMP_SETTINGS}.new" && mv "${TEMP_SETTINGS}.new" "$TEMP_SETTINGS"
  echo -e "  ${GREEN}+${NC} UserPromptSubmit → log-prompt.sh"
  HOOKS_ADDED=$((HOOKS_ADDED + 1))
else
  echo -e "  ${YELLOW}✓${NC} UserPromptSubmit → log-prompt.sh (already configured)"
fi

echo ""

# Only update the settings file if hooks were added
if [[ $HOOKS_ADDED -gt 0 ]]; then
  # Backup original and replace with updated version
  cp "$CLAUDE_SETTINGS" "${CLAUDE_SETTINGS}.backup"
  mv "$TEMP_SETTINGS" "$CLAUDE_SETTINGS"
  echo -e "${GREEN}✓ Added $HOOKS_ADDED telemetry hook(s) successfully!${NC}"
  echo -e "${YELLOW}Backup saved to: ${CLAUDE_SETTINGS}.backup${NC}"
else
  rm -f "$TEMP_SETTINGS"
  echo -e "${GREEN}✓ All telemetry hooks already configured. No changes needed.${NC}"
fi
echo ""
