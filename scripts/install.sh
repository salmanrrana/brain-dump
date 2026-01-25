#!/bin/bash
# Brain Dump Universal Installation Script
#
# This script configures Brain Dump for all detected AI coding environments:
# - Claude Code (.claude/)
# - Cursor (.cursor/)
# - OpenCode (~/.config/opencode/)
# - VS Code (.vscode/ + .github/)
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

  OPENCODE_CONFIG="$HOME/.config/opencode"
  OPENCODE_PLUGINS="$OPENCODE_CONFIG/plugins"
  OPENCODE_SKILLS="$OPENCODE_CONFIG/skills"
  OPENCODE_JSON="$OPENCODE_CONFIG/opencode.json"

  # Create directories
  if ! mkdir -p "$OPENCODE_PLUGINS"; then
    echo -e "${RED}✗ Failed to create OpenCode plugins directory: $OPENCODE_PLUGINS${NC}"
    exit 1
  fi

  if ! mkdir -p "$OPENCODE_SKILLS"; then
    echo -e "${RED}✗ Failed to create OpenCode skills directory: $OPENCODE_SKILLS${NC}"
    exit 1
  fi

  # Configure MCP server in opencode.json
  local mcp_configured=0
  echo -e "${YELLOW}Configuring MCP server...${NC}"
  if [ -f "$OPENCODE_JSON" ]; then
    echo "Existing opencode.json found. Checking for brain-dump server..."
    if grep -q '"brain-dump"' "$OPENCODE_JSON"; then
      echo -e "${GREEN}✓ Brain Dump MCP server already configured${NC}"
      mcp_configured=1
    else
      echo "Adding brain-dump server to existing config..."
      # Try to merge using node
      if command -v node >/dev/null 2>&1; then
        if OPENCODE_JSON="$OPENCODE_JSON" BRAIN_DUMP_DIR="$BRAIN_DUMP_DIR" node -e '
const fs = require("fs");
const configFile = process.env.OPENCODE_JSON;
const brainDumpDir = process.env.BRAIN_DUMP_DIR;

try {
    const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    config.mcp = config.mcp || {};
    config.mcp["brain-dump"] = {
        type: "local",
        command: ["node", brainDumpDir + "/mcp-server/index.js"],
        enabled: true
    };
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
} catch (err) {
    console.error("Error: " + err.message);
    process.exit(1);
}
' 2>/dev/null; then
          echo -e "${GREEN}✓ Added brain-dump to opencode.json${NC}"
          mcp_configured=1
        else
          echo -e "${RED}✗ Failed to update opencode.json${NC}"
          echo -e "${YELLOW}Please manually add the brain-dump server to your opencode.json:${NC}"
          echo ""
          echo '  "mcp": {'
          echo '    "brain-dump": {'
          echo '      "type": "local",'
          echo "      \"command\": [\"node\", \"$BRAIN_DUMP_DIR/mcp-server/index.js\"],"
          echo '      "enabled": true'
          echo '    }'
          echo '  }'
        fi
      else
        echo -e "${RED}✗ Node.js is required but not found${NC}"
        echo -e "${YELLOW}Please manually add the brain-dump server to your opencode.json:${NC}"
        echo ""
        echo '  "mcp": {'
        echo '    "brain-dump": {'
        echo '      "type": "local",'
        echo "      \"command\": [\"node\", \"$BRAIN_DUMP_DIR/mcp-server/index.js\"],"
        echo '      "enabled": true'
        echo '    }'
        echo '  }'
      fi
    fi
  else
    echo "Creating new opencode.json..."
    if cat > "$OPENCODE_JSON" << EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "mcp": {
    "brain-dump": {
      "type": "local",
      "command": ["node", "$BRAIN_DUMP_DIR/mcp-server/index.js"],
      "enabled": true
    }
  }
}
EOF
    then
      echo -e "${GREEN}✓ Created opencode.json with MCP server${NC}"
      mcp_configured=1
    else
      echo -e "${RED}✗ Failed to create opencode.json${NC}"
    fi
  fi

  # Check if MCP was configured successfully
  if [ $mcp_configured -eq 0 ]; then
    echo -e "${RED}✗ MCP server configuration failed${NC}"
    echo -e "${YELLOW}Brain Dump tools will not be available in OpenCode until MCP is configured.${NC}"
    exit 1
  fi

  # Copy telemetry plugin
  if [ -f "$BRAIN_DUMP_DIR/.opencode/plugins/brain-dump-telemetry.ts" ]; then
    if ! cp "$BRAIN_DUMP_DIR/.opencode/plugins/brain-dump-telemetry.ts" "$OPENCODE_PLUGINS/"; then
      echo -e "${RED}✗ Failed to copy telemetry plugin to $OPENCODE_PLUGINS${NC}"
      exit 1
    fi
    if ! chmod +x "$OPENCODE_PLUGINS/brain-dump-telemetry.ts"; then
      echo -e "${RED}✗ Failed to set execute permissions on telemetry plugin${NC}"
      exit 1
    fi
    echo -e "${GREEN}✓ Telemetry plugin installed to $OPENCODE_PLUGINS${NC}"
  else
    echo -e "${YELLOW}⚠ Telemetry plugin not found at $BRAIN_DUMP_DIR/.opencode/plugins/brain-dump-telemetry.ts${NC}"
  fi

  # Copy AGENTS.md workflow documentation
  if [ -f "$BRAIN_DUMP_DIR/.opencode/AGENTS.md" ]; then
    if ! cp "$BRAIN_DUMP_DIR/.opencode/AGENTS.md" "$OPENCODE_CONFIG/"; then
      echo -e "${RED}✗ Failed to copy workflow documentation${NC}"
      exit 1
    fi
    echo -e "${GREEN}✓ Workflow documentation (AGENTS.md) installed to $OPENCODE_CONFIG${NC}"
  else
    echo -e "${YELLOW}⚠ AGENTS.md not found at $BRAIN_DUMP_DIR/.opencode/AGENTS.md${NC}"
  fi

  # Copy skill
  if [ -d "$BRAIN_DUMP_DIR/.opencode/skills/brain-dump-workflow" ]; then
    if ! cp -r "$BRAIN_DUMP_DIR/.opencode/skills/brain-dump-workflow" "$OPENCODE_SKILLS/"; then
      echo -e "${RED}✗ Failed to copy skill to $OPENCODE_SKILLS${NC}"
      exit 1
    fi
    echo -e "${GREEN}✓ Brain Dump workflow skill installed to $OPENCODE_SKILLS${NC}"
  else
    echo -e "${YELLOW}⚠ Skill not found at $BRAIN_DUMP_DIR/.opencode/skills/brain-dump-workflow${NC}"
  fi

  echo -e "${GREEN}✓ OpenCode installation complete${NC}"
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
echo "  2. Run: ${YELLOW}brain-dump doctor${NC} to verify installation"
echo "  3. Read the documentation: ${YELLOW}CLAUDE.md${NC} or ${YELLOW}.opencode/README.md${NC}"
echo ""
echo -e "${BLUE}Useful commands:${NC}"
echo "  • ${YELLOW}./scripts/uninstall.sh${NC}     - Remove Brain Dump from all environments"
echo "  • ${YELLOW}brain-dump doctor${NC}         - Check environment status"
echo "  • ${YELLOW}pnpm dev${NC}                   - Start the development server"
echo ""
