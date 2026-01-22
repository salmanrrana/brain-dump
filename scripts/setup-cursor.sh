#!/bin/bash
# Brain Dump Cursor Setup Script
# Configures Cursor to use Brain Dump's MCP server, subagents, skills, and commands globally
#
# This script follows Cursor documentation conventions:
#   - MCP Server: ~/.cursor/mcp.json (global user config)
#   - Subagents: ~/.cursor/agents/ (user-level subagents)
#   - Skills: ~/.cursor/skills/ (user-level skills)
#   - Commands: ~/.cursor/commands/ (user-level commands)
#
# After running, Brain Dump tools and agents will be available in ALL your Cursor projects.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║       Brain Dump - Cursor Global Setup                    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAIN_DUMP_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${YELLOW}Brain Dump location:${NC} $BRAIN_DUMP_DIR"

# Cursor config directories (all global, in ~/.cursor/)
CURSOR_CONFIG_DIR="$HOME/.cursor"
MCP_CONFIG_FILE="$CURSOR_CONFIG_DIR/mcp.json"
AGENTS_TARGET="$CURSOR_CONFIG_DIR/agents"
SKILLS_TARGET="$CURSOR_CONFIG_DIR/skills"
COMMANDS_TARGET="$CURSOR_CONFIG_DIR/commands"

# Source directories in brain-dump
AGENTS_SOURCE="$BRAIN_DUMP_DIR/.github/agents"
SKILLS_SOURCE_GITHUB="$BRAIN_DUMP_DIR/.github/skills"
SKILLS_SOURCE_CLAUDE="$BRAIN_DUMP_DIR/.claude/skills"
COMMANDS_SOURCE="$BRAIN_DUMP_DIR/.claude/commands"

echo ""
echo -e "${BLUE}Step 1: Configure MCP Server${NC}"
echo "─────────────────────────────"
echo -e "${YELLOW}Location:${NC} $MCP_CONFIG_FILE"

# Create .cursor directory if it doesn't exist
mkdir -p "$CURSOR_CONFIG_DIR"

# Check if mcp.json already exists
if [ -f "$MCP_CONFIG_FILE" ]; then
    echo "Existing mcp.json found. Checking for brain-dump server..."
    if grep -q '"brain-dump"' "$MCP_CONFIG_FILE"; then
        echo -e "${GREEN}Brain Dump MCP server already configured.${NC}"
    else
        echo "Adding brain-dump server to existing config..."
        # Try to merge using node
        if command -v node >/dev/null 2>&1; then
            node_error=$(node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('$MCP_CONFIG_FILE', 'utf8'));
config.mcpServers = config.mcpServers || {};
config.mcpServers['brain-dump'] = {
    command: 'node',
    args: ['$BRAIN_DUMP_DIR/mcp-server/index.js']
};
fs.writeFileSync('$MCP_CONFIG_FILE', JSON.stringify(config, null, 2));
console.log('Config updated successfully');
" 2>&1) && echo -e "${GREEN}Added brain-dump to mcp.json${NC}" || {
                if [ -n "$node_error" ]; then
                    echo -e "${YELLOW}JSON merge failed: $node_error${NC}"
                fi
                echo -e "${RED}Please manually add the brain-dump server to your mcp.json:${NC}"
                echo ""
                echo '  "brain-dump": {'
                echo '    "command": "node",'
                echo "    \"args\": [\"$BRAIN_DUMP_DIR/mcp-server/index.js\"]"
                echo '  }'
            }
        else
            echo -e "${RED}Please manually add the brain-dump server to your mcp.json:${NC}"
            echo ""
            echo '  "brain-dump": {'
            echo '    "command": "node",'
            echo "    \"args\": [\"$BRAIN_DUMP_DIR/mcp-server/index.js\"]"
            echo '  }'
        fi
    fi
else
    echo "Creating new mcp.json..."
    cat > "$MCP_CONFIG_FILE" << EOF
{
  "mcpServers": {
    "brain-dump": {
      "command": "node",
      "args": ["$BRAIN_DUMP_DIR/mcp-server/index.js"]
    }
  }
}
EOF
    echo -e "${GREEN}Created mcp.json${NC}"
fi

echo ""
echo -e "${BLUE}Step 2: Configure Subagents (global)${NC}"
echo "───────────────────────────────────────────"
echo -e "${YELLOW}Per Cursor docs:${NC} https://cursor.com/docs/context/subagents"
echo -e "${YELLOW}Location:${NC} $AGENTS_TARGET/"
echo -e "${YELLOW}Note:${NC} Global subagents are available in ALL Cursor projects"

if [ -d "$AGENTS_SOURCE" ]; then
    mkdir -p "$AGENTS_TARGET"
    for agent_file in "$AGENTS_SOURCE"/*.agent.md; do
        if [ -f "$agent_file" ]; then
            # Convert .agent.md to .md for Cursor
            agent_name=$(basename "$agent_file" .agent.md)
            target_path="$AGENTS_TARGET/$agent_name.md"
            
            # Copy files directly (Cursor may not follow symlinks)
            if [ -f "$target_path" ]; then
                if ! cmp -s "$agent_file" "$target_path"; then
                    cp "$agent_file" "$target_path"
                    echo -e "${GREEN}Updated: $agent_name.md${NC}"
                else
                    echo -e "${YELLOW}Exists: $agent_name.md${NC}"
                fi
            else
                cp "$agent_file" "$target_path"
                echo -e "${GREEN}Added: $agent_name.md${NC}"
            fi
        fi
    done
    
    echo -e "${GREEN}Subagents installed:${NC}"
    ls "$AGENTS_TARGET"/*.md 2>/dev/null | xargs -I {} basename {} | sed 's/^/  • /' || echo "  (none)"
else
    echo -e "${YELLOW}No agents found in Brain Dump (.github/agents/)${NC}"
fi

echo ""
echo -e "${BLUE}Step 3: Configure Skills${NC}"
echo "─────────────────────────"
echo -e "${YELLOW}Location:${NC} $SKILLS_TARGET/"
echo -e "${YELLOW}Note:${NC} Per Cursor docs, global skills go to ~/.cursor/skills/"

# Copy skills from .github/skills
if [ -d "$SKILLS_SOURCE_GITHUB" ]; then
    mkdir -p "$SKILLS_TARGET"
    for skill_dir in "$SKILLS_SOURCE_GITHUB"/*/; do
        if [ -d "$skill_dir" ]; then
            skill_name=$(basename "$skill_dir")
            target_path="$SKILLS_TARGET/$skill_name"
            # Copy directories directly (Cursor may not follow symlinks)
            if [ -d "$target_path" ]; then
                if ! diff -rq "$skill_dir" "$target_path" >/dev/null 2>&1; then
                    rm -rf "$target_path"
                    cp -r "$skill_dir" "$target_path"
                    echo -e "${GREEN}Updated: $skill_name${NC}"
                else
                    echo -e "${YELLOW}Exists: $skill_name${NC}"
                fi
            else
                [ -L "$target_path" ] && rm "$target_path"
                cp -r "$skill_dir" "$target_path"
                echo -e "${GREEN}Added: $skill_name${NC}"
            fi
        fi
    done
else
    echo -e "${YELLOW}No skills found in Brain Dump (.github/skills/)${NC}"
fi

# Also copy skills from .claude/skills (review, review-aggregation)
if [ -d "$SKILLS_SOURCE_CLAUDE" ]; then
    mkdir -p "$SKILLS_TARGET"
    for skill_dir in "$SKILLS_SOURCE_CLAUDE"/*/; do
        if [ -d "$skill_dir" ]; then
            skill_name=$(basename "$skill_dir")
            target_path="$SKILLS_TARGET/$skill_name"
            # Copy directories directly (Cursor may not follow symlinks)
            if [ -d "$target_path" ]; then
                if ! diff -rq "$skill_dir" "$target_path" >/dev/null 2>&1; then
                    rm -rf "$target_path"
                    cp -r "$skill_dir" "$target_path"
                    echo -e "${GREEN}Updated: $skill_name${NC}"
                else
                    echo -e "${YELLOW}Exists: $skill_name${NC}"
                fi
            else
                [ -L "$target_path" ] && rm "$target_path"
                cp -r "$skill_dir" "$target_path"
                echo -e "${GREEN}Added: $skill_name${NC}"
            fi
        fi
    done
fi

echo -e "${GREEN}Skills installed:${NC}"
ls -d "$SKILLS_TARGET"/*/ 2>/dev/null | xargs -I {} basename {} | sed 's/^/  • /' || echo "  (none)"

echo ""
echo -e "${BLUE}Step 4: Configure Commands${NC}"
echo "──────────────────────────────"
echo -e "${YELLOW}Location:${NC} $COMMANDS_TARGET/"

if [ -d "$COMMANDS_SOURCE" ]; then
    mkdir -p "$COMMANDS_TARGET"
    for command_file in "$COMMANDS_SOURCE"/*.md; do
        if [ -f "$command_file" ]; then
            command_name=$(basename "$command_file")
            target_path="$COMMANDS_TARGET/$command_name"
            # Copy files directly (Cursor may not follow symlinks)
            if [ -f "$target_path" ]; then
                if ! cmp -s "$command_file" "$target_path"; then
                    cp "$command_file" "$target_path"
                    echo -e "${GREEN}Updated: $command_name${NC}"
                else
                    echo -e "${YELLOW}Exists: $command_name${NC}"
                fi
            else
                cp "$command_file" "$target_path"
                echo -e "${GREEN}Added: $command_name${NC}"
            fi
        fi
    done
    
    echo -e "${GREEN}Commands installed:${NC}"
    ls "$COMMANDS_TARGET"/*.md 2>/dev/null | xargs -I {} basename {} | sed 's/^/  • /' || echo "  (none)"
else
    echo -e "${YELLOW}No commands found in Brain Dump (.claude/commands/)${NC}"
fi

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
echo "  ${GREEN}Subagents (~/.cursor/agents/):${NC}"
echo "    • ralph - Autonomous coding agent"
echo "    • ticket-worker - Interactive ticket implementation"
echo "    • planner - Create implementation plans and tickets"
echo "    • code-reviewer - Automated code review"
echo "    • silent-failure-hunter - Find error handling issues"
echo "    • code-simplifier - Simplify and refine code"
echo "    • inception - Start new projects"
echo "    • context7-library-compliance - Verify library usage"
echo "    • react-best-practices - React/Next.js patterns"
echo "    • cruft-detector - Find unnecessary code"
echo "    • senior-engineer - Synthesize review findings"
echo ""
echo "  ${GREEN}Skills (~/.cursor/skills/):${NC}"
echo "    • brain-dump-tickets - Ticket management workflows"
echo "    • ralph-workflow - Autonomous workflow patterns"
echo "    • review - Code review pipeline"
echo "    • review-aggregation - Combine review findings"
echo "    • tanstack-* - TanStack library patterns (errors, forms, mutations, query, types)"
echo ""
echo "  ${GREEN}Commands (~/.cursor/commands/):${NC}"
echo "    • /review - Run initial code review (3 agents)"
echo "    • /extended-review - Run extended review (4 agents)"
echo "    • /inception - Start new project"
echo "    • /breakdown - Break down features"
echo ""
echo -e "${BLUE}Configuration Locations:${NC}"
echo "  • MCP:      $MCP_CONFIG_FILE"
echo "  • Subagents: $AGENTS_TARGET/ (global, all projects)"
echo "  • Skills:   $SKILLS_TARGET/ (global, all projects)"
echo "  • Commands: $COMMANDS_TARGET/ (global, all projects)"
echo ""
echo -e "${BLUE}Using Brain Dump in Cursor:${NC}"
echo "  After restarting Cursor, you can:"
echo ""
echo "  ${GREEN}Use Subagents:${NC}"
echo "    Type @ralph to start autonomous ticket work"
echo "    Type @ticket-worker to work on a specific ticket"
echo "    Type @planner to create tickets from requirements"
echo ""
echo "  ${GREEN}Use Commands:${NC}"
echo "    Type /review to run code review pipeline"
echo "    Type /inception to start a new project"
echo ""
echo "  ${GREEN}Use MCP Tools:${NC}"
echo "    Ask Agent to 'list my projects' or 'create a ticket'"
echo "    Agent will automatically use brain-dump MCP tools"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Restart Cursor to load the MCP server and configurations"
echo "  2. Open any project and try: @ralph or /review"
echo "  3. Use MCP tools: Ask Agent to 'list my Brain Dump projects'"
echo ""
echo -e "${YELLOW}Note:${NC} Make sure Brain Dump is running at least once to initialize the database."
echo ""
