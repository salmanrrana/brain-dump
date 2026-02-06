#!/bin/bash
# Brain Dump Universal Installation Script
#
# This script configures Brain Dump for all detected AI coding environments:
# - Claude Code (.claude/)
# - Cursor (.cursor/)
# - OpenCode (~/.config/opencode/)
# - VS Code (.vscode/ + .github/)
# - Copilot CLI (~/.copilot/)
#
# Usage:
#   ./scripts/install.sh              # Install all detected environments
#   ./scripts/install.sh --help       # Show help
#
# The script:
# 1. Detects which environments are installed
# 2. Installs hooks/plugins/configs for each
# 3. Merges with existing configs (doesn't overwrite)
# 4. Reports what was installed

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAIN_DUMP_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║     Brain Dump - Universal Installation Script             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─────────────────────────────────────────────────────────────────
# Environment Detection
# ─────────────────────────────────────────────────────────────────

echo -e "${BLUE}Detecting installed environments...${NC}"
echo ""

CLAUDE_CODE_AVAILABLE=0
CURSOR_AVAILABLE=0
OPENCODE_AVAILABLE=0
VSCODE_AVAILABLE=0
COPILOT_CLI_AVAILABLE=0

# Detect Claude Code
if command -v claude &>/dev/null 2>&1; then
  CLAUDE_CODE_AVAILABLE=1
  echo -e "${GREEN}✓${NC} Claude Code detected"
else
  echo -e "${YELLOW}○${NC} Claude Code not found"
fi

# Detect Cursor
if [ -d "$HOME/.cursor" ] 2>/dev/null || [ -d "/Applications/Cursor.app" ] 2>/dev/null; then
  CURSOR_AVAILABLE=1
  echo -e "${GREEN}✓${NC} Cursor detected"
else
  echo -e "${YELLOW}○${NC} Cursor not found"
fi

# Detect OpenCode
if command -v opencode &>/dev/null 2>&1; then
  OPENCODE_AVAILABLE=1
  echo -e "${GREEN}✓${NC} OpenCode detected"
else
  echo -e "${YELLOW}○${NC} OpenCode not found"
fi

# Detect VS Code
if command -v code &>/dev/null 2>&1; then
  VSCODE_AVAILABLE=1
  echo -e "${GREEN}✓${NC} VS Code detected"
else
  echo -e "${YELLOW}○${NC} VS Code not found"
fi

# Detect Copilot CLI
if command -v copilot &>/dev/null 2>&1 || [ -f "$HOME/.copilot/config.json" ] 2>/dev/null; then
  COPILOT_CLI_AVAILABLE=1
  echo -e "${GREEN}✓${NC} Copilot CLI detected"
else
  echo -e "${YELLOW}○${NC} Copilot CLI not found"
fi

echo ""

# ─────────────────────────────────────────────────────────────────
# Installation Functions
# ─────────────────────────────────────────────────────────────────

install_claude_code() {
  echo -e "${BLUE}Installing Claude Code configuration...${NC}"

  if [ -f "$BRAIN_DUMP_DIR/scripts/setup-claude-code.sh" ]; then
    if ! bash "$BRAIN_DUMP_DIR/scripts/setup-claude-code.sh"; then
      echo -e "${RED}✗ Claude Code installation failed${NC}"
      exit 1
    fi
    echo -e "${GREEN}✓ Claude Code installation complete${NC}"
  else
    echo -e "${RED}✗ setup-claude-code.sh not found${NC}"
    exit 1
  fi
  echo ""
}

install_cursor() {
  echo -e "${BLUE}Installing Cursor configuration...${NC}"

  if [ -f "$BRAIN_DUMP_DIR/scripts/setup-cursor.sh" ]; then
    if ! bash "$BRAIN_DUMP_DIR/scripts/setup-cursor.sh"; then
      echo -e "${RED}✗ Cursor installation failed${NC}"
      exit 1
    fi
    echo -e "${GREEN}✓ Cursor installation complete${NC}"
  else
    echo -e "${RED}✗ setup-cursor.sh not found${NC}"
    exit 1
  fi
  echo ""
}

install_opencode() {
  echo -e "${BLUE}Installing OpenCode configuration...${NC}"

  if [ -f "$BRAIN_DUMP_DIR/scripts/setup-opencode.sh" ]; then
    if ! bash "$BRAIN_DUMP_DIR/scripts/setup-opencode.sh"; then
      echo -e "${RED}✗ OpenCode installation failed${NC}"
      exit 1
    fi
    echo -e "${GREEN}✓ OpenCode installation complete${NC}"
  else
    echo -e "${RED}✗ setup-opencode.sh not found${NC}"
    exit 1
  fi
  echo ""
}

install_vscode() {
  echo -e "${BLUE}Installing VS Code configuration...${NC}"

  if [ -f "$BRAIN_DUMP_DIR/scripts/setup-vscode.sh" ]; then
    if ! bash "$BRAIN_DUMP_DIR/scripts/setup-vscode.sh"; then
      echo -e "${RED}✗ VS Code installation failed${NC}"
      exit 1
    fi
    echo -e "${GREEN}✓ VS Code installation complete${NC}"
  else
    echo -e "${RED}✗ setup-vscode.sh not found${NC}"
    exit 1
  fi
  echo ""
}

install_copilot_cli() {
  echo -e "${BLUE}Installing Copilot CLI configuration...${NC}"

  if [ -f "$BRAIN_DUMP_DIR/scripts/setup-copilot-cli.sh" ]; then
    if ! bash "$BRAIN_DUMP_DIR/scripts/setup-copilot-cli.sh"; then
      echo -e "${RED}✗ Copilot CLI installation failed${NC}"
      exit 1
    fi
    echo -e "${GREEN}✓ Copilot CLI installation complete${NC}"
  else
    echo -e "${RED}✗ setup-copilot-cli.sh not found${NC}"
    exit 1
  fi
  echo ""
}

# ─────────────────────────────────────────────────────────────────
# Main Installation
# ─────────────────────────────────────────────────────────────────

echo -e "${BLUE}Installing Brain Dump for detected environments...${NC}"
echo ""

INSTALL_COUNT=0

if [ $CLAUDE_CODE_AVAILABLE -eq 1 ]; then
  install_claude_code
  INSTALL_COUNT=$((INSTALL_COUNT + 1))
fi

if [ $CURSOR_AVAILABLE -eq 1 ]; then
  install_cursor
  INSTALL_COUNT=$((INSTALL_COUNT + 1))
fi

if [ $OPENCODE_AVAILABLE -eq 1 ]; then
  install_opencode
  INSTALL_COUNT=$((INSTALL_COUNT + 1))
fi

if [ $VSCODE_AVAILABLE -eq 1 ]; then
  install_vscode
  INSTALL_COUNT=$((INSTALL_COUNT + 1))
fi

if [ $COPILOT_CLI_AVAILABLE -eq 1 ]; then
  install_copilot_cli
  INSTALL_COUNT=$((INSTALL_COUNT + 1))
fi

# ─────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────

if [ $INSTALL_COUNT -eq 0 ]; then
  echo -e "${RED}✗ No environments detected${NC}"
  echo ""
  echo "Brain Dump supports:"
  echo "  • Claude Code (https://claude.com/claude-code)"
  echo "  • Cursor (https://cursor.com)"
  echo "  • OpenCode (https://opencode.ai)"
  echo "  • VS Code + Copilot"
  echo "  • Copilot CLI (https://githubnext.com/projects/copilot-cli)"
  echo ""
  echo "Install one of these tools and try again."
  exit 1
fi

echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Installation Complete!                        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Summary:${NC}"
echo "  • Environments configured: $INSTALL_COUNT"
echo ""
echo -e "${BLUE}What to do next:${NC}"
echo "  1. Restart your IDE(s) to load new configurations"
echo -e "  2. Run: ${YELLOW}brain-dump doctor${NC} to verify installation"
echo -e "  3. Read the documentation: ${YELLOW}CLAUDE.md${NC} or ${YELLOW}.opencode/README.md${NC}"
echo ""
echo -e "${BLUE}Useful commands:${NC}"
echo -e "  • ${YELLOW}./scripts/uninstall.sh${NC}     - Remove Brain Dump from all environments"
echo -e "  • ${YELLOW}brain-dump doctor${NC}         - Check environment status"
echo -e "  • ${YELLOW}pnpm dev${NC}                   - Start the development server"
echo ""
