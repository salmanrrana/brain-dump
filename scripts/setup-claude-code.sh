#!/bin/bash
# Brain Dumpy Claude Code Setup Script
# Configures Claude Code to use Brain Dumpy's MCP server and auto-review hooks
#
# This script:
# 1. Configures the Brain Dumpy MCP server in ~/.claude.json
# 2. Installs required plugins (pr-review-toolkit, code-simplifier)
# 3. Copies hooks and agents to .claude directory
#
# After running, Brain Dumpy tools and auto-review will be available in all Claude Code sessions.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║       Brain Dumpy - Claude Code Setup                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAIN_DUMPY_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${YELLOW}Brain Dumpy location:${NC} $BRAIN_DUMPY_DIR"

# Claude Code config file
CLAUDE_CONFIG="$HOME/.claude.json"
PROJECT_CLAUDE_DIR="$BRAIN_DUMPY_DIR/.claude"

echo ""
echo -e "${BLUE}Step 1: Configure MCP Server${NC}"
echo "─────────────────────────────"

if [ -f "$CLAUDE_CONFIG" ]; then
    echo -e "${YELLOW}Existing ~/.claude.json found.${NC}"

    if grep -q '"brain-dump"' "$CLAUDE_CONFIG"; then
        echo -e "${GREEN}Brain Dumpy MCP server already configured.${NC}"
    else
        echo -e "${YELLOW}Please manually add the brain-dump server to your ~/.claude.json:${NC}"
        echo ""
        echo -e "${BLUE}Add this to your mcpServers section:${NC}"
        echo ""
        cat << EOF
{
  "mcpServers": {
    "brain-dump": {
      "command": "node",
      "args": ["$BRAIN_DUMPY_DIR/mcp-server/index.js"]
    }
  }
}
EOF
        echo ""
    fi
else
    echo "Creating ~/.claude.json..."
    cat > "$CLAUDE_CONFIG" << EOF
{
  "mcpServers": {
    "brain-dump": {
      "command": "node",
      "args": ["$BRAIN_DUMPY_DIR/mcp-server/index.js"]
    }
  }
}
EOF
    echo -e "${GREEN}Created $CLAUDE_CONFIG${NC}"
fi

echo ""
echo -e "${BLUE}Step 2: Install Required Plugins${NC}"
echo "──────────────────────────────────"

# Check if claude CLI is available
if command -v claude &> /dev/null; then
    echo "Installing pr-review-toolkit plugin..."
    claude plugin install pr-review-toolkit 2>/dev/null || echo -e "${YELLOW}pr-review-toolkit already installed or install failed${NC}"

    echo "Installing code-simplifier plugin..."
    claude plugin install code-simplifier 2>/dev/null || echo -e "${YELLOW}code-simplifier already installed or install failed${NC}"

    echo -e "${GREEN}Plugins configured.${NC}"
else
    echo -e "${YELLOW}Claude CLI not found. Please install plugins manually:${NC}"
    echo "  claude plugin install pr-review-toolkit"
    echo "  claude plugin install code-simplifier"
fi

echo ""
echo -e "${BLUE}Step 3: Configure Hooks${NC}"
echo "────────────────────────"

# Create .claude directory if it doesn't exist
mkdir -p "$PROJECT_CLAUDE_DIR/hooks"

# Copy hooks if they exist in the source
HOOKS_SOURCE="$BRAIN_DUMPY_DIR/.claude/hooks"
if [ -d "$HOOKS_SOURCE" ]; then
    echo "Hooks directory already exists in project."
    echo -e "${GREEN}Hooks configured:${NC}"
    ls -la "$HOOKS_SOURCE"/*.md 2>/dev/null | awk '{print "  • " $NF}' | xargs -I {} basename {}
else
    echo -e "${YELLOW}Creating hooks directory...${NC}"
    mkdir -p "$HOOKS_SOURCE"
fi

# Update settings.local.json with hooks if not already present
SETTINGS_FILE="$PROJECT_CLAUDE_DIR/settings.local.json"
if [ -f "$SETTINGS_FILE" ]; then
    if grep -q '"hooks"' "$SETTINGS_FILE"; then
        echo -e "${GREEN}Hooks already configured in settings.local.json${NC}"
    else
        echo -e "${YELLOW}Hooks not found in settings.local.json${NC}"
        echo "Please add the hooks section from .claude/hooks/hooks.json to your settings.local.json"
    fi
else
    echo -e "${YELLOW}settings.local.json not found.${NC}"
    echo "Run 'claude' in the project directory to generate it, then re-run this script."
fi

echo ""
echo -e "${BLUE}Step 4: Configure Agents and Commands${NC}"
echo "───────────────────────────────────────"

# Check for agents directory
AGENTS_DIR="$PROJECT_CLAUDE_DIR/agents"
if [ -d "$AGENTS_DIR" ]; then
    echo -e "${GREEN}Agents configured:${NC}"
    ls "$AGENTS_DIR"/*.md 2>/dev/null | xargs -I {} basename {} | sed 's/^/  • /'
else
    echo -e "${YELLOW}No agents directory found.${NC}"
fi

# Check for commands directory
COMMANDS_DIR="$PROJECT_CLAUDE_DIR/commands"
if [ -d "$COMMANDS_DIR" ]; then
    echo -e "${GREEN}Commands configured:${NC}"
    ls "$COMMANDS_DIR"/*.md 2>/dev/null | xargs -I {} basename {} | sed 's/^/  • /'
else
    echo -e "${YELLOW}No commands directory found.${NC}"
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    Setup Complete!                         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}What's been configured:${NC}"
echo "  • MCP Server: brain-dump (ticket management tools)"
echo "  • Plugins: pr-review-toolkit, code-simplifier"
echo "  • Hooks: Auto-review (triggers after code changes)"
echo "  • Agents: breakdown, inception, simplify"
echo "  • Commands: /breakdown, /inception, /simplify, /review"
echo ""
echo -e "${BLUE}Auto-Review Hook:${NC}"
echo "  The Stop hook automatically triggers code review after completing"
echo "  a coding task. It runs these agents in sequence:"
echo "    1. pr-review-toolkit:code-reviewer"
echo "    2. pr-review-toolkit:silent-failure-hunter"
echo "    3. code-simplifier:code-simplifier"
echo ""
echo -e "${BLUE}To disable auto-review:${NC}"
echo "  Remove or empty the 'hooks.Stop' array in .claude/settings.local.json"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Restart any running Claude Code sessions"
echo "  2. Open Brain Dumpy and click 'Start with Claude' or 'Start with Ralph'"
echo "  3. Or use MCP tools directly: claude 'List all my projects'"
echo ""
echo -e "${YELLOW}Note:${NC} Make sure Brain Dumpy is running at least once to initialize the database."
echo ""
