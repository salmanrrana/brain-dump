#!/bin/bash
# Brain Dump Uninstallation Script
#
# Safely removes Brain Dump configuration from all environments
# without breaking other configurations.
#
# Usage:
#   ./scripts/uninstall.sh              # Uninstall from all environments
#   ./scripts/uninstall.sh --help       # Show help
#
# The script:
# 1. Detects which environments have Brain Dump installed
# 2. Removes Brain Dump files
# 3. Cleans up settings/config merges
# 4. Preserves other environment configurations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║        Brain Dump - Uninstallation Script                  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${YELLOW}This script will remove Brain Dump from detected environments.${NC}"
echo -e "${YELLOW}Other configurations will be preserved.${NC}"
echo ""
read -p "Continue with uninstallation? (yes/no): " CONFIRM

if [[ "$CONFIRM" != "yes" ]]; then
  echo "Uninstallation cancelled."
  exit 0
fi

echo ""

# ─────────────────────────────────────────────────────────────────
# Claude Code Uninstall
# ─────────────────────────────────────────────────────────────────

uninstall_claude_code() {
  echo -e "${BLUE}Uninstalling Claude Code configuration...${NC}"

  HOOKS_DIR="$HOME/.claude/hooks"

  if [ -d "$HOOKS_DIR" ]; then
    # Remove Brain Dump telemetry hooks
    rm -f "$HOOKS_DIR/start-telemetry-session.sh"
    rm -f "$HOOKS_DIR/end-telemetry-session.sh"
    rm -f "$HOOKS_DIR/log-tool-telemetry.sh"
    rm -f "$HOOKS_DIR/log-prompt-telemetry.sh"
    rm -f "$HOOKS_DIR/log-tool-start.sh"
    rm -f "$HOOKS_DIR/log-tool-end.sh"
    rm -f "$HOOKS_DIR/log-prompt.sh"

    # Remove temporary files
    rm -f "$HOME/.claude/telemetry-session.json"
    rm -f "$HOME/.claude/telemetry-queue.jsonl"
    rm -f "$HOME/.claude/telemetry.log"
    rm -f "$HOME/.claude/tool-correlation-"*.txt

    echo -e "${GREEN}✓ Claude Code hooks removed${NC}"
  fi

  # Clean up settings.json if it exists
  SETTINGS_FILE="$HOME/.claude/settings.json"
  if [ -f "$SETTINGS_FILE" ]; then
    # This is simplified - production would use jq to clean up hook entries
    echo -e "${YELLOW}Note:${NC} Manually remove Brain Dump hooks from $SETTINGS_FILE if needed"
  fi

  echo ""
}

# ─────────────────────────────────────────────────────────────────
# Cursor Uninstall
# ─────────────────────────────────────────────────────────────────

uninstall_cursor() {
  echo -e "${BLUE}Uninstalling Cursor configuration...${NC}"

  HOOKS_DIR="$HOME/.cursor/hooks"

  if [ -d "$HOOKS_DIR" ]; then
    # Remove Brain Dump telemetry hooks
    rm -f "$HOOKS_DIR/start-telemetry.sh"
    rm -f "$HOOKS_DIR/end-telemetry.sh"
    rm -f "$HOOKS_DIR/log-tool.sh"
    rm -f "$HOOKS_DIR/log-tool-failure.sh"
    rm -f "$HOOKS_DIR/log-prompt.sh"

    # Remove temporary files
    rm -f "$HOME/.cursor/telemetry-session.json"
    rm -f "$HOME/.cursor/telemetry-queue.jsonl"
    rm -f "$HOME/.cursor/telemetry.log"
    rm -f "$HOME/.cursor/tool-correlation-"*.txt

    echo -e "${GREEN}✓ Cursor hooks removed${NC}"
  fi

  # Clean up hooks.json if it only contains Brain Dump
  HOOKS_CONFIG="$HOME/.cursor/hooks.json"
  if [ -f "$HOOKS_CONFIG" ]; then
    if grep -q "start-telemetry" "$HOOKS_CONFIG"; then
      echo -e "${YELLOW}Note:${NC} Manually remove Brain Dump hooks from $HOOKS_CONFIG if needed"
    fi
  fi

  echo ""
}

# ─────────────────────────────────────────────────────────────────
# OpenCode Uninstall
# ─────────────────────────────────────────────────────────────────

uninstall_opencode() {
  echo -e "${BLUE}Uninstalling OpenCode configuration...${NC}"

  PLUGINS_DIR="$HOME/.config/opencode/plugins"

  if [ -d "$PLUGINS_DIR" ]; then
    rm -f "$PLUGINS_DIR/brain-dump-telemetry.ts"
    echo -e "${GREEN}✓ OpenCode plugin removed${NC}"
  fi

  CONFIG_DIR="$HOME/.config/opencode"
  if [ -d "$CONFIG_DIR" ]; then
    rm -f "$CONFIG_DIR/AGENTS.md"
    echo -e "${GREEN}✓ OpenCode documentation removed${NC}"
  fi

  echo ""
}

# ─────────────────────────────────────────────────────────────────
# VS Code Uninstall
# ─────────────────────────────────────────────────────────────────

uninstall_vscode() {
  echo -e "${BLUE}VS Code configuration (manual removal)${NC}"
  echo "  • Remove .vscode/mcp.json if present"
  echo "  • Remove .github/copilot-instructions.md if present"
  echo -e "${GREEN}✓ VS Code files handled manually${NC}"
  echo ""
}

# ─────────────────────────────────────────────────────────────────
# Main Uninstallation
# ─────────────────────────────────────────────────────────────────

echo -e "${BLUE}Removing Brain Dump from detected environments...${NC}"
echo ""

REMOVE_COUNT=0

# Check and uninstall from each environment
if command -v claude &>/dev/null 2>&1; then
  uninstall_claude_code
  REMOVE_COUNT=$((REMOVE_COUNT + 1))
fi

if [ -d "$HOME/.cursor" ] 2>/dev/null || [ -d "/Applications/Cursor.app" ] 2>/dev/null; then
  uninstall_cursor
  REMOVE_COUNT=$((REMOVE_COUNT + 1))
fi

if command -v opencode &>/dev/null 2>&1; then
  uninstall_opencode
  REMOVE_COUNT=$((REMOVE_COUNT + 1))
fi

if command -v code &>/dev/null 2>&1; then
  uninstall_vscode
  REMOVE_COUNT=$((REMOVE_COUNT + 1))
fi

# ─────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────

if [ $REMOVE_COUNT -eq 0 ]; then
  echo -e "${YELLOW}No Brain Dump installations found.${NC}"
  exit 0
fi

echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Uninstallation Complete!                         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Summary:${NC}"
echo "  • Environments cleaned: $REMOVE_COUNT"
echo ""
echo -e "${BLUE}What's been removed:${NC}"
echo "  • Telemetry hooks and plugins"
echo "  • Temporary telemetry files"
echo "  • Configuration documentation"
echo ""
echo -e "${YELLOW}Note:${NC} Some configuration entries may need manual cleanup from:"
echo "  • ~/.claude/settings.json"
echo "  • ~/.cursor/hooks.json"
echo ""
echo -e "${BLUE}To reinstall Brain Dump:${NC}"
echo "  ./scripts/install.sh"
echo ""
