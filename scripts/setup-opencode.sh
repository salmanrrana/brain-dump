#!/bin/bash
# Brain Dump OpenCode Setup Script
# Configures OpenCode to use Brain Dump's MCP server and plugins
#
# This script:
# 1. Detects OpenCode installation
# 2. Configures the Brain Dump MCP server
# 3. Installs OpenCode plugins
# 4. Copies workflow documentation (AGENTS.md)
# 5. Installs OpenCode skills
#
# After running, Brain Dump tools will be available in OpenCode sessions.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║      Brain Dump - OpenCode Setup                          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAIN_DUMP_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${YELLOW}Brain Dump location:${NC} $BRAIN_DUMP_DIR"

# Check if OpenCode is installed
if ! command -v opencode &> /dev/null; then
  echo -e "${RED}✗ OpenCode not detected${NC}"
  echo ""
  echo "OpenCode must be installed to use this setup script."
  echo "Visit https://opencode.ai to download and install."
  exit 1
fi

echo -e "${GREEN}✓ OpenCode detected${NC}"
echo ""

# OpenCode config directories
OPENCODE_CONFIG="$HOME/.config/opencode"
OPENCODE_PLUGINS="$OPENCODE_CONFIG/plugins"
OPENCODE_SKILLS="$OPENCODE_CONFIG/skills"
OPENCODE_JSON="$OPENCODE_CONFIG/opencode.json"

# ─────────────────────────────────────────────────────────────────
# Step 1: Create OpenCode directories
# ─────────────────────────────────────────────────────────────────

echo -e "${BLUE}Step 1: Verify OpenCode directories${NC}"
echo "──────────────────────────────────────"

if ! mkdir -p "$OPENCODE_PLUGINS"; then
  echo -e "${RED}✗ Failed to create OpenCode plugins directory: $OPENCODE_PLUGINS${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Plugins directory ready: $OPENCODE_PLUGINS${NC}"

if ! mkdir -p "$OPENCODE_SKILLS"; then
  echo -e "${RED}✗ Failed to create OpenCode skills directory: $OPENCODE_SKILLS${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Skills directory ready: $OPENCODE_SKILLS${NC}"

echo ""

# ─────────────────────────────────────────────────────────────────
# Step 2: Configure MCP server
# ─────────────────────────────────────────────────────────────────

echo -e "${BLUE}Step 2: Configure MCP Server${NC}"
echo "──────────────────────────────"

MCP_CONFIGURED=0

if [ -f "$OPENCODE_JSON" ]; then
  echo -e "${YELLOW}Existing opencode.json found.${NC}"

  if grep -q '"brain-dump"' "$OPENCODE_JSON"; then
    echo -e "${GREEN}✓ Brain Dump MCP server already configured${NC}"
    MCP_CONFIGURED=1
  else
    echo "Adding brain-dump server to existing config..."
    # Try to merge using node
    if command -v node >/dev/null 2>&1; then
      # Helper function to print manual setup instructions
      print_manual_setup() {
        echo -e "${YELLOW}Please manually add the brain-dump server to your opencode.json:${NC}"
        echo ""
        echo '  "mcp": {'
        echo '    "brain-dump": {'
        echo '      "type": "local",'
        echo "      \"command\": [\"npx\", \"tsx\", \"$BRAIN_DUMP_DIR/mcp-server/index.ts\"],"
        echo '      "enabled": true'
        echo '    }'
        echo '  }'
      }

      NODE_ERROR_FILE=$(mktemp)
      if OPENCODE_JSON="$OPENCODE_JSON" BRAIN_DUMP_DIR="$BRAIN_DUMP_DIR" node -e '
const fs = require("fs");
const configFile = process.env.OPENCODE_JSON;
const brainDumpDir = process.env.BRAIN_DUMP_DIR;

try {
    const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    config.mcp = config.mcp || {};
    config.mcp["brain-dump"] = {
        type: "local",
        command: ["npx", "tsx", brainDumpDir + "/mcp-server/index.ts"],
        enabled: true
    };
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
} catch (err) {
    console.error("Error: " + err.message);
    process.exit(1);
}
' 2>"$NODE_ERROR_FILE"; then
        echo -e "${GREEN}✓ Added brain-dump server to opencode.json${NC}"
        MCP_CONFIGURED=1
        rm -f "$NODE_ERROR_FILE"
      else
        echo -e "${RED}✗ Failed to update opencode.json${NC}"
        if [ -s "$NODE_ERROR_FILE" ]; then
          echo -e "${YELLOW}Error details: $(cat "$NODE_ERROR_FILE")${NC}"
        fi
        rm -f "$NODE_ERROR_FILE"
        print_manual_setup
      fi
    else
      echo -e "${RED}✗ Node.js is required but not found${NC}"
      print_manual_setup
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
      "command": ["npx", "tsx", "$BRAIN_DUMP_DIR/mcp-server/index.ts"],
      "enabled": true
    }
  }
}
EOF
  then
    echo -e "${GREEN}✓ Created opencode.json with MCP server${NC}"
    MCP_CONFIGURED=1
  else
    echo -e "${RED}✗ Failed to create opencode.json${NC}"
  fi
fi

if [ $MCP_CONFIGURED -eq 0 ]; then
  echo -e "${RED}✗ MCP server configuration failed${NC}"
  exit 1
fi

echo ""

# ─────────────────────────────────────────────────────────────────
# Step 3: Copy plugins
# ─────────────────────────────────────────────────────────────────

echo -e "${BLUE}Step 3: Install OpenCode Plugins${NC}"
echo "──────────────────────────────────"

PLUGINS_COPIED=0

# List of plugins to copy
PLUGINS=(
  "brain-dump-telemetry.ts"
  "brain-dump-state-enforcement.ts"
  "brain-dump-auto-pr.ts"
  "brain-dump-commit-tracking.ts"
  "brain-dump-review-marker.ts"
  "brain-dump-review-guard.ts"
)

for plugin in "${PLUGINS[@]}"; do
  if [ -f "$BRAIN_DUMP_DIR/.opencode/plugins/$plugin" ]; then
    if cp "$BRAIN_DUMP_DIR/.opencode/plugins/$plugin" "$OPENCODE_PLUGINS/"; then
      if chmod +x "$OPENCODE_PLUGINS/$plugin" && [ -x "$OPENCODE_PLUGINS/$plugin" ]; then
        echo -e "${GREEN}✓ $plugin${NC}"
        PLUGINS_COPIED=$((PLUGINS_COPIED + 1))
      else
        echo -e "${RED}✗ Failed to set executable bit on $plugin${NC}"
      fi
    else
      echo -e "${RED}✗ Failed to copy $plugin${NC}"
    fi
  else
    echo -e "${YELLOW}⚠ $plugin not found${NC}"
  fi
done

if [ $PLUGINS_COPIED -eq 0 ]; then
  echo -e "${RED}✗ No plugins were copied${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Copied $PLUGINS_COPIED plugins to $OPENCODE_PLUGINS${NC}"
echo ""

# ─────────────────────────────────────────────────────────────────
# Step 4: Copy workflow documentation
# ─────────────────────────────────────────────────────────────────

echo -e "${BLUE}Step 4: Install Workflow Documentation${NC}"
echo "────────────────────────────────────────"

if [ -f "$BRAIN_DUMP_DIR/.opencode/AGENTS.md" ]; then
  if cp "$BRAIN_DUMP_DIR/.opencode/AGENTS.md" "$OPENCODE_CONFIG/"; then
    echo -e "${GREEN}✓ AGENTS.md (workflow documentation)${NC}"
  else
    echo -e "${RED}✗ Failed to copy AGENTS.md${NC}"
    exit 1
  fi
else
  echo -e "${RED}✗ AGENTS.md not found at $BRAIN_DUMP_DIR/.opencode/AGENTS.md${NC}"
  echo -e "${YELLOW}AGENTS.md is required for OpenCode workflow guidance${NC}"
  exit 1
fi

echo ""

# ─────────────────────────────────────────────────────────────────
# Step 5: Copy skills
# ─────────────────────────────────────────────────────────────────

echo -e "${BLUE}Step 5: Install OpenCode Skills${NC}"
echo "────────────────────────────────"

if [ -d "$BRAIN_DUMP_DIR/.opencode/skills/brain-dump-workflow" ]; then
  if cp -r "$BRAIN_DUMP_DIR/.opencode/skills/brain-dump-workflow" "$OPENCODE_SKILLS/"; then
    echo -e "${GREEN}✓ brain-dump-workflow skill${NC}"
  else
    echo -e "${RED}✗ Failed to copy skill${NC}"
  fi
else
  echo -e "${YELLOW}⚠ Skill not found at $BRAIN_DUMP_DIR/.opencode/skills/brain-dump-workflow${NC}"
fi

echo ""

# ─────────────────────────────────────────────────────────────────
# Verification
# ─────────────────────────────────────────────────────────────────

echo -e "${BLUE}Verification${NC}"
echo "─────────────"

echo ""
if [ -f "$OPENCODE_JSON" ]; then
  echo -e "${GREEN}✓ opencode.json configured${NC}"
else
  echo -e "${RED}✗ opencode.json not found${NC}"
fi

if [ -d "$OPENCODE_PLUGINS" ] && [ "$(ls -A "$OPENCODE_PLUGINS" 2>/dev/null | wc -l)" -gt 0 ]; then
  echo -e "${GREEN}✓ Plugins installed ($(ls -1 "$OPENCODE_PLUGINS" | wc -l) files)${NC}"
else
  echo -e "${RED}✗ No plugins found in $OPENCODE_PLUGINS${NC}"
fi

if [ -f "$OPENCODE_CONFIG/AGENTS.md" ]; then
  echo -e "${GREEN}✓ Workflow documentation installed${NC}"
else
  echo -e "${YELLOW}⚠ AGENTS.md not found${NC}"
fi

echo ""

# ─────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────

echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║            OpenCode Setup Complete!                        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${BLUE}Configuration locations:${NC}"
echo "  OpenCode config: $OPENCODE_CONFIG"
echo "  Plugins: $OPENCODE_PLUGINS"
echo "  Skills: $OPENCODE_SKILLS"
echo ""

echo -e "${BLUE}What's been configured:${NC}"
echo ""
echo "  ${GREEN}MCP Server:${NC}"
echo "    • brain-dump (ticket management tools)"
echo ""
echo "  ${GREEN}Plugins:${NC}"
echo "    • brain-dump-telemetry - Track AI work sessions"
echo "    • brain-dump-state-enforcement - Enforce workflow state transitions"
echo "    • brain-dump-auto-pr - Auto-create draft PRs"
echo "    • brain-dump-commit-tracking - Track commits to tickets"
echo "    • brain-dump-review-marker - Mark code review completion"
echo "    • brain-dump-review-guard - Prevent push without review"
echo ""
echo "  ${GREEN}Documentation:${NC}"
echo "    • AGENTS.md - Comprehensive workflow guidance"
echo ""

echo -e "${BLUE}Next steps:${NC}"
echo "  1. Restart OpenCode to load new configurations"
echo "  2. Read ${YELLOW}.opencode/AGENTS.md${NC} for workflow guidance"
echo "  3. Run: ${YELLOW}brain-dump doctor${NC} to verify installation"
echo "  4. Start working on a ticket with Brain Dump"
echo ""
