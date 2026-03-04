#!/bin/bash
# Brain Dump VS Code Setup Script
# Configures VS Code to use Brain Dump as "ground control" for AI agents
#
# This script follows VS Code documentation conventions:
#   - Agents: VS Code User profile (~/Library/Application Support/Code/User/agents/ on macOS)
#   - Skills: ~/.copilot/skills/ (global skills per VS Code docs)
#   - MCP: VS Code User profile (~/Library/Application Support/Code/User/mcp.json)
#   - Prompts: VS Code User profile (~/Library/Application Support/Code/User/prompts/)
#
# Installs to BOTH VS Code and VS Code Insiders if both are present.
# After running, Brain Dump tools and agents will be available in ALL your projects.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║       Brain Dump - VS Code Ground Control Setup           ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAIN_DUMP_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${YELLOW}Brain Dump location:${NC} $BRAIN_DUMP_DIR"

# Detect OS and set VS Code paths
detect_vscode_paths() {
    case "$(uname -s)" in
        Linux*)
            VSCODE_USER_DIR="$HOME/.config/Code/User"
            VSCODE_INSIDERS_USER_DIR="$HOME/.config/Code - Insiders/User"
            COPILOT_SKILLS_DIR="$HOME/.copilot/skills"
            ;;
        Darwin*)
            VSCODE_USER_DIR="$HOME/Library/Application Support/Code/User"
            VSCODE_INSIDERS_USER_DIR="$HOME/Library/Application Support/Code - Insiders/User"
            COPILOT_SKILLS_DIR="$HOME/.copilot/skills"
            ;;
        MINGW*|MSYS*|CYGWIN*)
            VSCODE_USER_DIR="$APPDATA/Code/User"
            VSCODE_INSIDERS_USER_DIR="$APPDATA/Code - Insiders/User"
            COPILOT_SKILLS_DIR="$USERPROFILE/.copilot/skills"
            ;;
        *)
            echo -e "${RED}Unsupported operating system${NC}"
            exit 1
            ;;
    esac
}

detect_vscode_paths

# Link or update a symlink (handles broken symlinks and wrong targets)
link_item() {
    local source="${1%/}"  # Normalize: remove trailing slash from glob expansion
    local target="$2"
    local name=$(basename "$source")

    # Check if target is a symlink
    if [ -L "$target" ]; then
        local current_target=$(readlink "$target")
        if [ "$current_target" = "$source" ]; then
            # Symlink already points to correct location
            echo -e "${YELLOW}Exists: $name${NC}"
            return 0
        else
            # Symlink points to wrong location - update it
            rm "$target"
            if ln -s "$source" "$target" 2>/dev/null; then
                echo -e "${GREEN}Updated: $name (was pointing to wrong location)${NC}"
            else
                cp -r "$source" "$target"
                echo -e "${GREEN}Updated: $name${NC}"
                echo -e "${YELLOW}  Warning: Created copy instead of symlink (updates to source won't sync)${NC}"
            fi
            return 0
        fi
    elif [ -e "$target" ]; then
        # Regular file/dir exists - skip
        echo -e "${YELLOW}Exists: $name (not a symlink)${NC}"
        return 0
    else
        # Doesn't exist - create
        if ln -s "$source" "$target" 2>/dev/null; then
            echo -e "${GREEN}Added: $name${NC}"
        else
            cp -r "$source" "$target"
            echo -e "${GREEN}Added: $name${NC}"
            echo -e "${YELLOW}  Warning: Created copy instead of symlink (updates to source won't sync)${NC}"
        fi
        return 0
    fi
}

# ─────────────────────────────────────────────────────────────────
# Collect all VS Code installations (install to ALL found variants)
# ─────────────────────────────────────────────────────────────────
VSCODE_TARGETS=()
if [ -d "$VSCODE_USER_DIR" ]; then
    VSCODE_TARGETS+=("$VSCODE_USER_DIR")
    echo -e "${GREEN}Found VS Code${NC}"
fi
if [ -d "$VSCODE_INSIDERS_USER_DIR" ]; then
    VSCODE_TARGETS+=("$VSCODE_INSIDERS_USER_DIR")
    echo -e "${GREEN}Found VS Code Insiders${NC}"
fi
if [ ${#VSCODE_TARGETS[@]} -eq 0 ]; then
    echo -e "${YELLOW}No VS Code installation found. Will create standard directory.${NC}"
    mkdir -p "$VSCODE_USER_DIR"
    VSCODE_TARGETS+=("$VSCODE_USER_DIR")
fi

# ─────────────────────────────────────────────────────────────────
# Install MCP, agents, and prompts to each VS Code variant
# ─────────────────────────────────────────────────────────────────
install_to_vscode_target() {
    local VSCODE_TARGET="$1"
    local target_label="$2"

    echo ""
    echo -e "${BLUE}━━━ Installing to $target_label ━━━${NC}"
    echo -e "${YELLOW}Location:${NC} $VSCODE_TARGET"

    # ── Step 1: Configure MCP Server ──
    echo ""
    echo -e "${BLUE}  MCP Server${NC}"

    local MCP_CONFIG_FILE="$VSCODE_TARGET/mcp.json"

    if [ -f "$MCP_CONFIG_FILE" ]; then
        # Check if file is empty or has content
        if [ ! -s "$MCP_CONFIG_FILE" ]; then
            echo "  Empty mcp.json found. Creating fresh config..."
            cat > "$MCP_CONFIG_FILE" << EOF
{
  "servers": {
    "brain-dump": {
      "type": "stdio",
      "command": "node",
      "args": ["$BRAIN_DUMP_DIR/mcp-server/dist/index.js"]
    }
  }
}
EOF
            echo -e "  ${GREEN}Created mcp.json${NC}"
        elif grep -q '"brain-dump"' "$MCP_CONFIG_FILE"; then
            echo "  Updating brain-dump config..."
            if command -v node >/dev/null 2>&1; then
                node_error=$(MCP_CONFIG_FILE="$MCP_CONFIG_FILE" BRAIN_DUMP_DIR="$BRAIN_DUMP_DIR" node -e '
const fs = require("fs");
const configFile = process.env.MCP_CONFIG_FILE;
const brainDumpDir = process.env.BRAIN_DUMP_DIR;

try {
    const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    config.servers = config.servers || {};
    config.servers["brain-dump"] = {
        type: "stdio",
        command: "node",
        args: [brainDumpDir + "/mcp-server/dist/index.js"]
    };
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    console.log("Config updated successfully");
} catch (err) {
    console.error("Error: " + err.message);
    process.exit(1);
}
' 2>&1) && echo -e "  ${GREEN}Brain Dump MCP server updated.${NC}" || {
                    echo -e "  ${YELLOW}Update failed: $node_error${NC}"
                }
            else
                echo -e "  ${GREEN}Brain Dump MCP server already configured.${NC}"
            fi
        else
            echo "  Adding brain-dump server to existing config..."
            if command -v node >/dev/null 2>&1; then
                node_error=$(MCP_CONFIG_FILE="$MCP_CONFIG_FILE" BRAIN_DUMP_DIR="$BRAIN_DUMP_DIR" node -e '
const fs = require("fs");
const configFile = process.env.MCP_CONFIG_FILE;
const brainDumpDir = process.env.BRAIN_DUMP_DIR;

try {
    const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    config.servers = config.servers || {};
    config.servers["brain-dump"] = {
        type: "stdio",
        command: "node",
        args: [brainDumpDir + "/mcp-server/dist/index.js"]
    };
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    console.log("Config updated successfully");
} catch (err) {
    console.error("Error: " + err.message);
    process.exit(1);
}
' 2>&1) && echo -e "  ${GREEN}Added brain-dump to mcp.json${NC}" || {
                    echo -e "  ${YELLOW}JSON merge failed: $node_error${NC}"
                    echo -e "  ${RED}Please manually add the brain-dump server to your mcp.json${NC}"
                }
            else
                echo -e "  ${RED}Please manually add the brain-dump server to your mcp.json${NC}"
            fi
        fi
    else
        echo "  Creating new mcp.json..."
        cat > "$MCP_CONFIG_FILE" << EOF
{
  "servers": {
    "brain-dump": {
      "type": "stdio",
      "command": "node",
      "args": ["$BRAIN_DUMP_DIR/mcp-server/dist/index.js"]
    }
  }
}
EOF
        echo -e "  ${GREEN}Created mcp.json${NC}"
    fi

    # ── Step 2: Configure Agents ──
    echo ""
    echo -e "${BLUE}  Agents${NC}"

    local AGENTS_SOURCE="$BRAIN_DUMP_DIR/.github/agents"
    local AGENTS_TARGET="$VSCODE_TARGET/prompts"

    if [ -d "$AGENTS_SOURCE" ]; then
        mkdir -p "$AGENTS_TARGET"
        for agent_file in "$AGENTS_SOURCE"/*.agent.md; do
            if [ -f "$agent_file" ]; then
                agent_name=$(basename "$agent_file")
                target_path="$AGENTS_TARGET/$agent_name"
                if [ -f "$target_path" ]; then
                    if ! cmp -s "$agent_file" "$target_path"; then
                        cp "$agent_file" "$target_path"
                        echo -e "  ${GREEN}Updated: $agent_name${NC}"
                    else
                        echo -e "  ${YELLOW}Exists: $agent_name${NC}"
                    fi
                else
                    cp "$agent_file" "$target_path"
                    echo -e "  ${GREEN}Added: $agent_name${NC}"
                fi
            fi
        done

        # Clean up previously-installed review/utility agents (now inlined into commands)
        STALE_AGENTS=("code-reviewer.agent.md" "silent-failure-hunter.agent.md" "code-simplifier.agent.md" "context7-library-compliance.agent.md" "react-best-practices.agent.md" "cruft-detector.agent.md" "senior-engineer.agent.md" "inception.agent.md")
        for stale in "${STALE_AGENTS[@]}"; do
            if [ -f "$AGENTS_TARGET/$stale" ]; then
                rm "$AGENTS_TARGET/$stale"
                echo -e "  ${YELLOW}Removed legacy agent: $stale${NC}"
            fi
        done
    else
        echo -e "  ${YELLOW}No agents found in Brain Dump (.github/agents/)${NC}"
    fi

    # ── Step 3: Configure Prompts ──
    echo ""
    echo -e "${BLUE}  Prompts${NC}"

    local PROMPTS_SOURCE="$BRAIN_DUMP_DIR/.github/prompts"
    local PROMPTS_TARGET="$VSCODE_TARGET/prompts"

    if [ -d "$PROMPTS_SOURCE" ]; then
        mkdir -p "$PROMPTS_TARGET"
        for prompt_file in "$PROMPTS_SOURCE"/*.prompt.md; do
            if [ -f "$prompt_file" ]; then
                prompt_name=$(basename "$prompt_file")
                target_path="$PROMPTS_TARGET/$prompt_name"
                if [ -f "$target_path" ]; then
                    if ! cmp -s "$prompt_file" "$target_path"; then
                        cp "$prompt_file" "$target_path"
                        echo -e "  ${GREEN}Updated: $prompt_name${NC}"
                    else
                        echo -e "  ${YELLOW}Exists: $prompt_name${NC}"
                    fi
                else
                    [ -L "$target_path" ] && rm "$target_path"
                    cp "$prompt_file" "$target_path"
                    echo -e "  ${GREEN}Added: $prompt_name${NC}"
                fi
            fi
        done
    else
        echo -e "  ${YELLOW}No prompts found in Brain Dump (.github/prompts/)${NC}"
    fi

    # ── Step 4: Configure Auto-Review Prompt ──
    local AUTO_REVIEW_PROMPT="$PROMPTS_TARGET/auto-review.prompt.md"
    mkdir -p "$PROMPTS_TARGET"
    cat > "$AUTO_REVIEW_PROMPT" << 'EOF'
---
description: Run the complete code review pipeline on recent changes
---

# Auto-Review Pipeline

Please run the `/review` command on my recent changes.

This will launch three review passes in parallel:
1. **Code quality** - Project guidelines, style, potential bugs
2. **Silent failure detection** - Error handling issues, swallowed errors
3. **Code simplification** - Redundancy removal, readability improvements

Focus on files modified in the current git diff.
EOF
    echo -e "  ${GREEN}Updated /auto-review prompt${NC}"

    # Remove legacy auto-review skill directory (replaced by /review command)
    if [ -d "$COPILOT_SKILLS_DIR/auto-review" ]; then
        rm -rf "$COPILOT_SKILLS_DIR/auto-review"
        echo -e "  ${YELLOW}Removed legacy auto-review skill (now command-based)${NC}"
    fi
}

# ─────────────────────────────────────────────────────────────────
# Run installation for each VS Code variant
# ─────────────────────────────────────────────────────────────────
for target in "${VSCODE_TARGETS[@]}"; do
    if [ "$target" = "$VSCODE_USER_DIR" ]; then
        install_to_vscode_target "$target" "VS Code"
    else
        install_to_vscode_target "$target" "VS Code Insiders"
    fi
done

# ─────────────────────────────────────────────────────────────────
# Step 3: Configure Skills (shared across all VS Code variants)
# ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}━━━ Global Skills (shared) ━━━${NC}"
echo -e "${YELLOW}Location:${NC} $COPILOT_SKILLS_DIR/"
echo -e "${YELLOW}Note:${NC} Only workflow-essential skills installed globally"

# Only install 3 global skills from .claude/skills/
# Project-specific skills (tanstack-*, brain-dump-tickets, etc.) stay local
SKILLS_SOURCE_CLAUDE="$BRAIN_DUMP_DIR/.claude/skills"
GLOBAL_SKILLS=("brain-dump-workflow" "review" "review-aggregation")

if [ -d "$SKILLS_SOURCE_CLAUDE" ]; then
    mkdir -p "$COPILOT_SKILLS_DIR"
    for skill_name in "${GLOBAL_SKILLS[@]}"; do
        skill_dir="$SKILLS_SOURCE_CLAUDE/$skill_name"
        if [ -d "$skill_dir" ]; then
            target_path="$COPILOT_SKILLS_DIR/$skill_name"
            rm -rf "$target_path"
            cp -r "$skill_dir" "$target_path"
            echo -e "  ${GREEN}Installed: $skill_name${NC}"
        else
            echo -e "  ${YELLOW}Not found: $skill_name${NC}"
        fi
    done
else
    echo -e "${YELLOW}No skills found in Brain Dump (.claude/skills/)${NC}"
fi

# Clean up previously-installed project-specific skills
STALE_SKILLS=("tanstack-errors" "tanstack-forms" "tanstack-mutations" "tanstack-query" "tanstack-types" "brain-dump-tickets" "ralph-workflow" "react-best-practices" "web-design-guidelines" "auto-review")
for stale in "${STALE_SKILLS[@]}"; do
    stale_path="$COPILOT_SKILLS_DIR/$stale"
    if [ -d "$stale_path" ] || [ -f "$stale_path" ]; then
        rm -rf "$stale_path"
        echo -e "  ${YELLOW}Removed legacy skill: $stale${NC}"
    fi
done
# Also clean up standalone skill files (e.g., brain-dump-workflow.skill.md)
for stale_file in "$COPILOT_SKILLS_DIR"/*.skill.md; do
    if [ -f "$stale_file" ]; then
        rm "$stale_file"
        echo -e "  ${YELLOW}Removed legacy skill file: $(basename "$stale_file")${NC}"
    fi
done

# ─────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    Setup Complete!                         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Installed to:${NC}"
for target in "${VSCODE_TARGETS[@]}"; do
    echo "  • $target"
done
echo ""
echo -e "${BLUE}What's been configured:${NC}"
echo ""
echo -e "  ${GREEN}MCP Server:${NC}"
echo "    • brain-dump (ticket management, workflow, review, telemetry)"
echo ""
echo -e "  ${GREEN}Agents:${NC}"
echo "    • ralph - Autonomous coding agent"
echo "    • ticket-worker - Interactive ticket implementation"
echo "    • planner - Create implementation plans and tickets"
echo ""
echo -e "  ${GREEN}Skills ($COPILOT_SKILLS_DIR/):${NC}"
echo "    • brain-dump-workflow - Universal quality workflow"
echo "    • review - Code review pipeline"
echo "    • review-aggregation - Combine review findings"
echo ""
echo -e "  ${GREEN}Prompts:${NC}"
echo "    • /start-ticket, /complete-ticket, /create-tickets"
echo "    • /auto-review - Runs /review command pipeline"
echo ""
echo -e "  ${GREEN}Telemetry:${NC}"
echo "    • MCP self-instrumentation (no hooks needed)"
echo "    • Session tracking, tool usage, and prompts captured by MCP server"
echo ""
echo -e "${BLUE}Code Review in VS Code:${NC}"
echo "  Unlike Claude Code (which uses hooks), VS Code requires manual invocation."
echo "  After completing a coding task, use /auto-review or ask the agent to"
echo "  run the /review command. Review personas are inlined into the command."
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Restart VS Code to load the MCP server"
echo "  2. Open Copilot Chat and try: @ralph or /start-ticket"
echo "  3. After coding, use /auto-review to review changes"
echo ""
echo -e "${YELLOW}Note:${NC} Make sure Brain Dump's MCP server is built:"
echo "  cd $BRAIN_DUMP_DIR && pnpm build"
echo ""
