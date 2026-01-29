#!/bin/bash
# Brain Dump OpenCode Setup Script
# Configures OpenCode to use Brain Dump's MCP server, agents, and skills
#
# This script:
# 1. Installs OpenCode if not present (via Homebrew or direct download)
# 2. Configures the Brain Dump MCP server in .opencode/opencode.json
# 3. Creates fallback agents for missing plugins
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
echo "║       Brain Dump - OpenCode Setup                         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAIN_DUMP_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${YELLOW}Brain Dump location:${NC} $BRAIN_DUMP_DIR"

# Change to brain dump directory for relative paths
cd "$BRAIN_DUMP_DIR"

# Helper functions
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Create fallback agent files if missing
create_fallback_agent() {
    local agent_name="$1"
    local agent_label="${agent_name}-fallback"
    local agent_path=".opencode/agent/${agent_label}.md"

    if [ -f "$agent_path" ]; then
        echo -e "${YELLOW}${agent_label} agent exists${NC}"
        return 0
    fi

    case "$agent_name" in
        code-reviewer)
            cat > "$agent_path" << 'EOF'
---
description: Fallback code reviewer when pr-review-toolkit is unavailable
mode: subagent
model: anthropic/claude-sonnet-4-20250514
temperature: 0.1
permission:
  bash: deny
  write: deny
  edit: deny
---

Fallback code reviewer for when specialized tools are unavailable.

## Review Process
1. Identify changed files (git diff HEAD~1)
2. Check style, error handling, security, logic
3. Hunt silent failures (empty catches, fire-and-forget async)
4. Provide structured report with critical/important/minor issues
EOF
            ;;
        code-simplifier)
            cat > "$agent_path" << 'EOF'
---
description: Fallback code simplifier when code-simplifier plugin is unavailable
mode: subagent
model: anthropic/claude-sonnet-4-20250514
temperature: 0.2
---

Fallback code simplifier for when specialized tools are unavailable.

## Simplification Principles
1. **Remove Redundancy** - Duplicate code, unused imports, commented code
2. **Improve Clarity** - Descriptive names, extract magic numbers
3. **Reduce Complexity** - Flatten nesting, early returns, split functions
4. **Enhance Readability** - Consistent formatting, logical grouping

## What NOT to Change
- Don't add new features or change public APIs
- Don't "improve" working error handling  
- Don't add abstractions for single-use code
- Don't optimize prematurely
EOF
            ;;
        *)
            echo -e "${YELLOW}Unknown fallback agent: ${agent_name}${NC}"
            return 1
            ;;
    esac

    echo -e "${GREEN}Created ${agent_label} agent${NC}"
}

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Darwin*)    OS="macos" ;;
        Linux*)     OS="linux" ;;
        MINGW*|MSYS*|CYGWIN*) OS="windows" ;;
        *)          OS="unknown" ;;
    esac
}

detect_os

echo ""
echo -e "${BLUE}Step 1: Check OpenCode Installation${NC}"
echo "─────────────────────────────────────"

if command_exists opencode; then
    echo -e "${GREEN}OpenCode already installed: $(opencode --version 2>/dev/null || echo "unknown")${NC}"
else
    echo -e "${YELLOW}OpenCode not found. Attempting installation...${NC}"
    
    # Try installation methods: brew → direct download
    if command_exists brew; then
        echo "Attempting Homebrew installation..."
        if brew install opencode 2>/dev/null; then
            echo -e "${GREEN}OpenCode installed via Homebrew${NC}"
        else
            echo -e "${YELLOW}Homebrew installation failed, trying direct download...${NC}"
        fi
    fi
    
    # Check again if installation succeeded
    if ! command_exists opencode; then
        # Direct download fallback
        url=""
        case "$OS" in
            macos) url="https://github.com/anomalyco/opencode/releases/latest/download/opencode-macos" ;;
            linux) url="https://github.com/anomalyco/opencode/releases/latest/download/opencode-linux" ;;
            *) 
                echo -e "${YELLOW}Windows requires manual installation${NC}"
                echo "Visit: https://github.com/anomalyco/opencode/releases"
                ;;
        esac
        
        if [ -n "$url" ]; then
            # Try to download to a temp location first, then validate before moving
            temp_binary="/tmp/opencode-$$"
            if curl -L -o "$temp_binary" "$url" 2>/dev/null && chmod +x "$temp_binary"; then
                # Validate the downloaded binary works
                if "$temp_binary" --version >/dev/null 2>&1; then
                    # Try to move to /usr/local/bin (may require sudo)
                    if mv "$temp_binary" /usr/local/bin/opencode 2>/dev/null || sudo mv "$temp_binary" /usr/local/bin/opencode 2>/dev/null; then
                        echo -e "${GREEN}OpenCode installed via direct download${NC}"
                    else
                        echo -e "${YELLOW}Downloaded binary is valid but could not be moved to /usr/local/bin${NC}"
                        echo -e "${YELLOW}You may need sudo permissions. Binary saved to: $temp_binary${NC}"
                        echo -e "${YELLOW}Install manually:${NC}"
                        echo "  sudo mv $temp_binary /usr/local/bin/opencode"
                        echo "  # or: brew install opencode"
                    fi
                else
                    echo -e "${YELLOW}Downloaded binary is not functional, removing...${NC}"
                    rm -f "$temp_binary"
                    echo -e "${YELLOW}OpenCode installation failed. Install manually:${NC}"
                    echo "  brew install opencode"
                    echo "  # or download from: https://github.com/anomalyco/opencode/releases"
                fi
            else
                rm -f "$temp_binary"
                echo -e "${YELLOW}OpenCode installation failed. Install manually:${NC}"
                echo "  brew install opencode"
                echo "  # or download from: https://github.com/anomalyco/opencode/releases"
            fi
        fi
    fi
fi

echo ""
echo -e "${BLUE}Step 2: Configure OpenCode${NC}"
echo "───────────────────────────"

# Ensure .opencode directory exists
if [ ! -d ".opencode" ]; then
    echo -e "${YELLOW}Creating .opencode directory...${NC}"
    if ! mkdir -p ".opencode/agent" ".opencode/skill"; then
        echo -e "${RED}Failed to create .opencode directories${NC}"
        echo "Check permissions in: $(pwd)"
        exit 1
    fi
    echo -e "${GREEN}Created .opencode directories${NC}"
fi

MCP_SERVER_PATH="$BRAIN_DUMP_DIR/mcp-server/dist/index.js"
OPENCODE_CONFIG=".opencode/opencode.json"

# Create or update opencode.json with correct configuration
if [ ! -f "$OPENCODE_CONFIG" ]; then
    echo "Creating OpenCode configuration..."
    cat > "$OPENCODE_CONFIG" << EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "mcp": {
    "brain-dump": {
      "type": "local",
      "command": ["node", "mcp-server/dist/index.js"],
      "enabled": true,
      "environment": {
        "BRAIN_DUMP_PATH": ".",
        "OPENCODE": "1"
      }
    }
  },
  "tools": {
    "brain-dump_*": true
  },
  "permission": {
    "skill": {
      "*": "allow"
    }
  }
}
EOF
    echo -e "${GREEN}Created OpenCode configuration${NC}"
else
    echo -e "${YELLOW}Existing opencode.json found.${NC}"
    
    # Check if type is "stdio" and update to "local"
    if grep -q '"type": "stdio"' "$OPENCODE_CONFIG"; then
        echo "Updating OpenCode MCP type from 'stdio' to 'local'..."
        # Create backup
        cp "$OPENCODE_CONFIG" "$OPENCODE_CONFIG.backup"
        
        # Update the configuration
        if command_exists node; then
            node_output=$(node -e "
const fs = require('fs');
try {
    const config = JSON.parse(fs.readFileSync('$OPENCODE_CONFIG', 'utf8'));
    if (config.mcp && config.mcp['brain-dump']) {
        config.mcp['brain-dump'].type = 'local';
        config.mcp['brain-dump'].command = ['node', 'mcp-server/dist/index.js'];
        config.mcp['brain-dump'].enabled = true;
        config.mcp['brain-dump'].environment = config.mcp['brain-dump'].environment || {};
        config.mcp['brain-dump'].environment.BRAIN_DUMP_PATH = '.';
    } else {
        config.mcp = config.mcp || {};
        config.mcp['brain-dump'] = {
            type: 'local',
            command: ['node', 'mcp-server/dist/index.js'],
            enabled: true,
            environment: { BRAIN_DUMP_PATH: '.' }
        };
    }
    config.tools = config.tools || {};
    config.tools['brain-dump_*'] = true;
    config.permission = config.permission || {};
    config.permission.skill = config.permission.skill || {};
    config.permission.skill['*'] = 'allow';
    const newConfig = JSON.stringify(config, null, 2);
    // Validate the new JSON can be parsed
    JSON.parse(newConfig);
    fs.writeFileSync('$OPENCODE_CONFIG', newConfig);
    console.log('Configuration updated successfully');
} catch (error) {
    console.error('JSON manipulation failed:', error.message);
    process.exit(1);
}
" 2>&1)
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}Updated OpenCode configuration to use 'local' type${NC}"
                rm "$OPENCODE_CONFIG.backup" 2>/dev/null || true
            else
                echo -e "${YELLOW}Failed to update configuration: $node_output${NC}"
                echo -e "${YELLOW}Restoring backup...${NC}"
                mv "$OPENCODE_CONFIG.backup" "$OPENCODE_CONFIG" 2>/dev/null || true
            fi
        else
            echo -e "${YELLOW}Node not available for config update${NC}"
        fi
    else
        echo -e "${GREEN}OpenCode configuration already exists${NC}"
    fi
fi

# Validate configuration
if grep -q '"brain-dump"' "$OPENCODE_CONFIG"; then
    echo -e "${GREEN}Brain Dump MCP server configured${NC}"
else
    echo -e "${YELLOW}Warning: MCP server not configured in opencode.json${NC}"
fi

# Count configured items
if [ -d ".opencode/agent" ]; then
    agent_count=$(ls .opencode/agent/*.md 2>/dev/null | wc -l | tr -d ' ')
    [ -z "$agent_count" ] && agent_count=0
else
    agent_count=0
fi

if [ -d ".opencode/skill" ]; then
    skill_count=$(find .opencode/skill -name "SKILL.md" 2>/dev/null | wc -l | tr -d ' ')
    [ -z "$skill_count" ] && skill_count=0
else
    skill_count=0
fi

[ "$agent_count" -gt 0 ] && echo -e "${GREEN}Found $agent_count agents${NC}"
[ "$skill_count" -gt 0 ] && echo -e "${GREEN}Found $skill_count skills${NC}"

echo ""
echo -e "${BLUE}Step 3: Create Fallback Agents${NC}"
echo "────────────────────────────────"

create_fallback_agent "code-reviewer"
create_fallback_agent "code-simplifier"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    Setup Complete!                         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}What's been configured:${NC}"
echo ""
echo "  ${GREEN}MCP Server:${NC}"
echo "    • brain-dump (ticket management tools)"
echo ""
echo "  ${GREEN}Agents (.opencode/agent/):${NC}"
echo "    • ralph - Autonomous backlog worker (primary)"
echo "    • ticket-worker - Interactive single ticket implementation"
echo "    • planner - Requirements analysis and ticket creation"
echo "    • inception - New project startup"
echo "    • code-reviewer-fallback - Fallback code review"
echo "    • code-simplifier-fallback - Fallback code simplification"
echo ""
echo "  ${GREEN}Skills (.opencode/skill/):${NC}"
echo "    • brain-dump-workflow - Brain Dump workflow guidance"
echo "    • tanstack-* - TanStack library patterns"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Start Brain Dump: cd $BRAIN_DUMP_DIR && pnpm dev"
echo "  2. Run OpenCode: opencode ."
echo "  3. Use MCP tools: opencode 'List all my projects'"
echo ""
echo -e "${YELLOW}Note:${NC} Make sure Brain Dump is running at least once to initialize the database."
echo ""
