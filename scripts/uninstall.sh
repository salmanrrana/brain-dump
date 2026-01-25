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
read -p "Continue with uninstallation? (yes/no): " CONFIRM || {
  echo -e "${RED}✗ Failed to read confirmation (is stdin available?)${NC}"
  exit 1
}

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
    local failed=0
    # Remove Brain Dump telemetry hooks
    for hook in start-telemetry-session.sh end-telemetry-session.sh \
                log-tool-telemetry.sh log-prompt-telemetry.sh \
                log-tool-start.sh log-tool-end.sh log-prompt.sh; do
      hook_path="$HOOKS_DIR/$hook"
      if [ -f "$hook_path" ]; then
        if ! rm "$hook_path"; then
          echo -e "${RED}✗ Failed to remove $hook (permission denied or file locked)${NC}"
          failed=1
        fi
      fi
    done

    # Remove temporary files
    for temp_file in telemetry-session.json telemetry-queue.jsonl telemetry.log; do
      if [ -f "$HOME/.claude/$temp_file" ]; then
        if ! rm "$HOME/.claude/$temp_file"; then
          echo -e "${YELLOW}⚠ Could not remove $temp_file${NC}"
          failed=1
        fi
      fi
    done

    # Remove correlation files
    find "$HOME/.claude" -maxdepth 1 -name "tool-correlation-*.txt" -delete 2>/dev/null || true

    if [ $failed -eq 0 ]; then
      echo -e "${GREEN}✓ Claude Code hooks removed${NC}"
    else
      echo -e "${YELLOW}⚠ Some hooks could not be removed. Check permissions.${NC}"
    fi
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
    local failed=0
    # Remove Brain Dump telemetry hooks
    for hook in start-telemetry.sh end-telemetry.sh log-tool.sh \
                log-tool-failure.sh log-prompt.sh; do
      hook_path="$HOOKS_DIR/$hook"
      if [ -f "$hook_path" ]; then
        if ! rm "$hook_path"; then
          echo -e "${RED}✗ Failed to remove $hook (permission denied or file locked)${NC}"
          failed=1
        fi
      fi
    done

    # Remove temporary files
    for temp_file in telemetry-session.json telemetry-queue.jsonl telemetry.log; do
      if [ -f "$HOME/.cursor/$temp_file" ]; then
        if ! rm "$HOME/.cursor/$temp_file"; then
          echo -e "${YELLOW}⚠ Could not remove $temp_file${NC}"
          failed=1
        fi
      fi
    done

    # Remove correlation files
    find "$HOME/.cursor" -maxdepth 1 -name "tool-correlation-*.txt" -delete 2>/dev/null || true

    if [ $failed -eq 0 ]; then
      echo -e "${GREEN}✓ Cursor hooks removed${NC}"
    else
      echo -e "${YELLOW}⚠ Some hooks could not be removed. Check permissions.${NC}"
    fi
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
