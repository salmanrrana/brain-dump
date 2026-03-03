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
SKILLS_SOURCE_CLAUDE="$BRAIN_DUMP_DIR/.claude/skills"
COMMANDS_SOURCE="$BRAIN_DUMP_DIR/.claude/commands"

# =============================================================================
# Step 1: Configure MCP Server
# =============================================================================
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
        echo "Brain Dump entry found. Updating to latest config..."
    else
        echo "Adding brain-dump server to existing config..."
    fi
    # Always update/add to ensure config is current
    if command -v node >/dev/null 2>&1; then
        node_error=$(BRAIN_DUMP_DIR="$BRAIN_DUMP_DIR" MCP_CONFIG_FILE="$MCP_CONFIG_FILE" node -e '
const fs = require("fs");
const configFile = process.env.MCP_CONFIG_FILE;
const brainDumpDir = process.env.BRAIN_DUMP_DIR;

const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
config.mcpServers = config.mcpServers || {};
config.mcpServers["brain-dump"] = {
    command: "node",
    args: [brainDumpDir + "/mcp-server/dist/index.js"],
    env: { CURSOR: "1" }
};
fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
console.log("Config updated successfully");
' 2>&1) && echo -e "${GREEN}Brain Dump MCP server configured.${NC}" || {
            if [ -n "$node_error" ]; then
                echo -e "${YELLOW}JSON merge failed: $node_error${NC}"
            fi
            echo -e "${RED}Please manually add the brain-dump server to your mcp.json:${NC}"
            echo ""
            echo '  "brain-dump": {'
            echo '    "command": "node",'
            echo "    \"args\": [\"$BRAIN_DUMP_DIR/mcp-server/dist/index.js\"],"
            echo '    "env": { "CURSOR": "1" }'
            echo '  }'
        }
    else
        echo -e "${RED}Please manually add the brain-dump server to your mcp.json:${NC}"
        echo ""
        echo '  "brain-dump": {'
        echo '    "command": "node",'
        echo "    \"args\": [\"$BRAIN_DUMP_DIR/mcp-server/dist/index.js\"]"
        echo '  }'
    fi
else
    echo "Creating new mcp.json..."
    cat > "$MCP_CONFIG_FILE" << EOF
{
  "mcpServers": {
    "brain-dump": {
      "command": "node",
      "args": ["$BRAIN_DUMP_DIR/mcp-server/dist/index.js"],
      "env": {
        "CURSOR": "1"
      }
    }
  }
}
EOF
    echo -e "${GREEN}Created mcp.json${NC}"
fi

# =============================================================================
# Step 2: Configure Subagents (global)
# =============================================================================
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

    # Clean up previously-installed review/utility agents (now inlined into commands)
    STALE_AGENTS=("code-reviewer.md" "silent-failure-hunter.md" "code-simplifier.md" "context7-library-compliance.md" "react-best-practices.md" "cruft-detector.md" "senior-engineer.md" "inception.md")
    for stale in "${STALE_AGENTS[@]}"; do
        if [ -f "$AGENTS_TARGET/$stale" ]; then
            rm "$AGENTS_TARGET/$stale"
            echo -e "${YELLOW}Removed legacy agent: $stale${NC}"
        fi
    done

    echo -e "${GREEN}Subagents installed:${NC}"
    ls "$AGENTS_TARGET"/*.md 2>/dev/null | xargs -I {} basename {} | sed 's/^/  • /' || echo "  (none)"
else
    echo -e "${YELLOW}No agents found in Brain Dump (.github/agents/)${NC}"
fi

# =============================================================================
# Step 3: Configure Skills (global)
# =============================================================================
echo ""
echo -e "${BLUE}Step 3: Configure Skills (global)${NC}"
echo "──────────────────────────────────"
echo -e "${YELLOW}Location:${NC} $SKILLS_TARGET/"
echo -e "${YELLOW}Note:${NC} Only workflow-essential skills installed globally"

# Only install 3 global skills from .claude/skills/
# Project-specific skills (tanstack-*, brain-dump-tickets, etc.) stay local
GLOBAL_SKILLS=("brain-dump-workflow" "review" "review-aggregation")

if [ -d "$SKILLS_SOURCE_CLAUDE" ]; then
    mkdir -p "$SKILLS_TARGET"
    for skill_name in "${GLOBAL_SKILLS[@]}"; do
        skill_dir="$SKILLS_SOURCE_CLAUDE/$skill_name"
        if [ -d "$skill_dir" ]; then
            target_path="$SKILLS_TARGET/$skill_name"
            rm -rf "$target_path"
            cp -r "$skill_dir" "$target_path"
            echo -e "${GREEN}Installed: $skill_name${NC}"
        else
            echo -e "${YELLOW}Not found: $skill_name${NC}"
        fi
    done
else
    echo -e "${YELLOW}No skills found in Brain Dump (.claude/skills/)${NC}"
fi

# Clean up previously-installed project-specific skills
STALE_SKILLS=("tanstack-errors" "tanstack-forms" "tanstack-mutations" "tanstack-query" "tanstack-types" "brain-dump-tickets" "ralph-workflow" "react-best-practices" "web-design-guidelines")
for stale in "${STALE_SKILLS[@]}"; do
    stale_path="$SKILLS_TARGET/$stale"
    if [ -d "$stale_path" ] || [ -f "$stale_path" ]; then
        rm -rf "$stale_path"
        echo -e "${YELLOW}Removed legacy skill: $stale${NC}"
    fi
done
# Also clean up standalone skill files (e.g., brain-dump-workflow.skill.md)
for stale_file in "$SKILLS_TARGET"/*.skill.md; do
    if [ -f "$stale_file" ]; then
        rm "$stale_file"
        echo -e "${YELLOW}Removed legacy skill file: $(basename "$stale_file")${NC}"
    fi
done

echo -e "${GREEN}Global skills installed:${NC}"
ls -d "$SKILLS_TARGET"/*/ 2>/dev/null | xargs -I {} basename {} | sed 's/^/  • /' || echo "  (none)"

# =============================================================================
# Step 4: Configure Commands
# =============================================================================
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

# Clean up legacy telemetry hooks if they exist from previous installs
HOOKS_TARGET="$HOME/.cursor/hooks"
HOOKS_CONFIG="$CURSOR_CONFIG_DIR/hooks.json"
if [ -d "$HOOKS_TARGET" ]; then
    for old_hook in start-telemetry.sh end-telemetry.sh log-tool.sh log-tool-failure.sh log-prompt.sh; do
        if [ -f "$HOOKS_TARGET/$old_hook" ]; then
            rm "$HOOKS_TARGET/$old_hook"
            echo -e "${YELLOW}Removed legacy telemetry hook: $old_hook${NC}"
        fi
    done
    # Remove hooks dir if empty
    rmdir "$HOOKS_TARGET" 2>/dev/null || true
fi
# Remove legacy hooks.json if it references telemetry
if [ -f "$HOOKS_CONFIG" ]; then
    if grep -q "start-telemetry" "$HOOKS_CONFIG" 2>/dev/null; then
        rm "$HOOKS_CONFIG"
        echo -e "${YELLOW}Removed legacy hooks.json (telemetry hooks)${NC}"
    fi
fi

# =============================================================================
# Step 5: Configure Project Rules
# =============================================================================
echo ""
echo -e "${BLUE}Step 5: Configure Project Rules${NC}"
echo "────────────────────────────────"
echo -e "${YELLOW}Location:${NC} .cursor/rules/"

PROJECT_RULES="$BRAIN_DUMP_DIR/.cursor/rules"
if [ -d "$PROJECT_RULES" ] && [ "$(ls -A "$PROJECT_RULES" 2>/dev/null)" ]; then
    echo -e "${GREEN}Workflow rules present at $PROJECT_RULES:${NC}"
    ls "$PROJECT_RULES"/*.md 2>/dev/null | xargs -I {} basename {} | sed 's/^/  • /' || echo "  (none)"
else
    echo -e "${YELLOW}No project rules found in .cursor/rules/${NC}"
fi

# =============================================================================
# Step 6: Summary
# =============================================================================
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    Setup Complete!                         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}What's been configured:${NC}"
echo ""
echo -e "  ${GREEN}MCP Server:${NC}"
echo "    • brain-dump (ticket management, workflow, review, telemetry)"
echo ""
echo -e "  ${GREEN}Subagents (~/.cursor/agents/):${NC}"
echo "    • ralph - Autonomous coding agent"
echo "    • ticket-worker - Interactive ticket implementation"
echo "    • planner - Create implementation plans and tickets"
echo ""
echo -e "  ${GREEN}Skills (~/.cursor/skills/):${NC}"
echo "    • brain-dump-workflow - Universal quality workflow"
echo "    • review - Code review pipeline"
echo "    • review-aggregation - Combine review findings"
echo ""
echo -e "  ${GREEN}Commands (~/.cursor/commands/):${NC}"
echo "    • /review - Run initial code review (3 agents)"
echo "    • /extended-review - Run extended review (4 agents)"
echo "    • /inception - Start new project"
echo "    • /breakdown - Break down features"
echo ""
echo -e "  ${GREEN}Telemetry:${NC}"
echo "    • MCP self-instrumentation (no hooks needed)"
echo "    • Session tracking, tool usage, and prompts captured by MCP server"
echo ""
echo -e "${BLUE}Configuration Locations:${NC}"
echo "  • MCP:       $MCP_CONFIG_FILE"
echo "  • Subagents: $AGENTS_TARGET/ (global, all projects)"
echo "  • Skills:    $SKILLS_TARGET/ (global, all projects)"
echo "  • Commands:  $COMMANDS_TARGET/ (global, all projects)"
echo ""
echo -e "${BLUE}Using Brain Dump in Cursor:${NC}"
echo "  After restarting Cursor, you can:"
echo ""
echo -e "  ${GREEN}Use Subagents:${NC}"
echo "    Type @ralph to start autonomous ticket work"
echo "    Type @ticket-worker to work on a specific ticket"
echo "    Type @planner to create tickets from requirements"
echo ""
echo -e "  ${GREEN}Use Commands:${NC}"
echo "    Type /review to run code review pipeline"
echo "    Type /inception to start a new project"
echo ""
echo -e "  ${GREEN}Use MCP Tools:${NC}"
echo "    Ask Agent to 'list my projects' or 'create a ticket'"
echo "    Agent will automatically use brain-dump MCP tools"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Restart Cursor to load the MCP server and configurations"
echo "  2. Open any project and try: @ralph or /review"
echo "  3. Telemetry is handled automatically by MCP self-instrumentation"
echo ""
echo -e "${YELLOW}Note:${NC} Make sure Brain Dump's MCP server is built:"
echo "  cd $BRAIN_DUMP_DIR && pnpm build"
echo ""
