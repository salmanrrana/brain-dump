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

# Check which VS Code is installed
if [ -d "$VSCODE_USER_DIR" ]; then
    VSCODE_TARGET="$VSCODE_USER_DIR"
    echo -e "${GREEN}Found VS Code${NC}"
elif [ -d "$VSCODE_INSIDERS_USER_DIR" ]; then
    VSCODE_TARGET="$VSCODE_INSIDERS_USER_DIR"
    echo -e "${GREEN}Found VS Code Insiders${NC}"
else
    echo -e "${YELLOW}VS Code user directory not found. Will create it.${NC}"
    VSCODE_TARGET="$VSCODE_USER_DIR"
    mkdir -p "$VSCODE_TARGET"
fi

echo ""
echo -e "${BLUE}Step 1: Configure MCP Server${NC}"
echo "─────────────────────────────"
echo -e "${YELLOW}Location:${NC} $VSCODE_TARGET/mcp.json"

# MCP config goes in VS Code User profile directory (not ~/.vscode)
MCP_CONFIG_FILE="$VSCODE_TARGET/mcp.json"

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
config.servers = config.servers || {};
config.servers['brain-dump'] = {
    type: 'stdio',
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
                echo '    "type": "stdio",'
                echo '    "command": "node",'
                echo "    \"args\": [\"$BRAIN_DUMP_DIR/mcp-server/index.js\"]"
                echo '  }'
            }
        else
            echo -e "${RED}Please manually add the brain-dump server to your mcp.json:${NC}"
            echo ""
            echo '  "brain-dump": {'
            echo '    "type": "stdio",'
            echo '    "command": "node",'
            echo "    \"args\": [\"$BRAIN_DUMP_DIR/mcp-server/index.js\"]"
            echo '  }'
        fi
    fi
else
    echo "Creating new mcp.json..."
    cat > "$MCP_CONFIG_FILE" << EOF
{
  "servers": {
    "brain-dump": {
      "type": "stdio",
      "command": "node",
      "args": ["$BRAIN_DUMP_DIR/mcp-server/index.js"]
    }
  }
}
EOF
    echo -e "${GREEN}Created mcp.json${NC}"
fi

echo ""
echo -e "${BLUE}Step 2: Configure Agents (global)${NC}"
echo "──────────────────────────────────"
echo -e "${YELLOW}Per VS Code docs:${NC} https://code.visualstudio.com/docs/copilot/customization/custom-agents"
echo -e "${YELLOW}Location:${NC} $VSCODE_TARGET/prompts/"
echo -e "${YELLOW}Note:${NC} Global agents are available in ALL VS Code workspaces"

AGENTS_SOURCE="$BRAIN_DUMP_DIR/.github/agents"
# VS Code stores user-level agents in the prompts folder
AGENTS_TARGET="$VSCODE_TARGET/prompts"

if [ -d "$AGENTS_SOURCE" ]; then
    mkdir -p "$AGENTS_TARGET"
    for agent_file in "$AGENTS_SOURCE"/*.agent.md; do
        if [ -f "$agent_file" ]; then
            agent_name=$(basename "$agent_file")
            target_path="$AGENTS_TARGET/$agent_name"
            # Copy files directly (VS Code may not follow symlinks)
            if [ -f "$target_path" ]; then
                if ! cmp -s "$agent_file" "$target_path"; then
                    cp "$agent_file" "$target_path"
                    echo -e "${GREEN}Updated: $agent_name${NC}"
                else
                    echo -e "${YELLOW}Exists: $agent_name${NC}"
                fi
            else
                cp "$agent_file" "$target_path"
                echo -e "${GREEN}Added: $agent_name${NC}"
            fi
        fi
    done
else
    echo -e "${YELLOW}No agents found in Brain Dump (.github/agents/)${NC}"
fi

echo ""
echo -e "${BLUE}Step 3: Configure Skills${NC}"
echo "─────────────────────────"
echo -e "${YELLOW}Location:${NC} $COPILOT_SKILLS_DIR/"
echo -e "${YELLOW}Note:${NC} Per VS Code docs, global skills go to ~/.copilot/skills/"

SKILLS_SOURCE="$BRAIN_DUMP_DIR/.github/skills"

if [ -d "$SKILLS_SOURCE" ]; then
    mkdir -p "$COPILOT_SKILLS_DIR"
    for skill_dir in "$SKILLS_SOURCE"/*/; do
        [ -d "$skill_dir" ] && link_item "$skill_dir" "$COPILOT_SKILLS_DIR/$(basename "$skill_dir")"
    done
else
    echo -e "${YELLOW}No skills found in Brain Dump (.github/skills/)${NC}"
fi

echo ""
echo -e "${BLUE}Step 4: Configure Prompts${NC}"
echo "──────────────────────────"
echo -e "${YELLOW}Location:${NC} $VSCODE_TARGET/prompts/"

PROMPTS_SOURCE="$BRAIN_DUMP_DIR/.github/prompts"
PROMPTS_TARGET="$VSCODE_TARGET/prompts"

if [ -d "$PROMPTS_SOURCE" ]; then
    mkdir -p "$PROMPTS_TARGET"
    for prompt_file in "$PROMPTS_SOURCE"/*.prompt.md; do
        [ -f "$prompt_file" ] && link_item "$prompt_file" "$PROMPTS_TARGET/$(basename "$prompt_file")"
    done
else
    echo -e "${YELLOW}No prompts found in Brain Dump (.github/prompts/)${NC}"
fi

echo ""
echo -e "${BLUE}Step 5: Configure Auto-Review Workflow${NC}"
echo "───────────────────────────────────────"

# Create auto-review skill for VS Code in the Copilot skills directory
AUTO_REVIEW_SKILL_DIR="$COPILOT_SKILLS_DIR/auto-review"
if [ ! -d "$AUTO_REVIEW_SKILL_DIR" ]; then
    mkdir -p "$AUTO_REVIEW_SKILL_DIR"
    cat > "$AUTO_REVIEW_SKILL_DIR/SKILL.md" << 'EOF'
---
name: auto-review
description: Run the complete code review pipeline on recent changes. Use after completing a feature or fixing a bug to review code quality, error handling, and simplification opportunities.
---

# Auto-Review Skill

This skill runs the complete code review pipeline after completing a coding task.

## Usage

After completing a feature or fixing a bug, invoke this skill to review your changes:

```
/auto-review
```

Or mention agents directly:
```
@code-reviewer please review my recent changes
```

## Review Pipeline

The auto-review workflow runs these three agents:

1. **@code-reviewer** - Reviews code against project guidelines
   - Checks CLAUDE.md/coding standards compliance
   - Reports style issues, potential bugs, security concerns
   - Reports only high-confidence issues (confidence >= 80)

2. **@silent-failure-hunter** - Finds silent failures and error handling issues
   - Empty catch blocks that swallow errors
   - Fire-and-forget async calls
   - Missing user feedback on errors
   - Overly broad catch blocks

3. **@code-simplifier** - Simplifies and refines code
   - Removes redundancy
   - Improves readability
   - Preserves all functionality

## Handoff Flow

The agents are configured with handoffs so they can chain together:
- code-reviewer → silent-failure-hunter → code-simplifier

## Manual Review

You can also call individual agents:
- `@code-reviewer` - Code quality and style
- `@silent-failure-hunter` - Error handling issues
- `@code-simplifier` - Code simplification
EOF
    echo -e "${GREEN}Created auto-review skill${NC}"
else
    echo -e "${YELLOW}Auto-review skill already exists${NC}"
fi

# Create auto-review prompt for quick access
AUTO_REVIEW_PROMPT="$PROMPTS_TARGET/auto-review.prompt.md"
if [ ! -f "$AUTO_REVIEW_PROMPT" ]; then
    mkdir -p "$PROMPTS_TARGET"
    cat > "$AUTO_REVIEW_PROMPT" << 'EOF'
---
description: Run the complete code review pipeline on recent changes
---

# Auto-Review Pipeline

Please run the complete code review pipeline on my recent changes:

1. First, use @code-reviewer to review the code against project guidelines
2. Then, use @silent-failure-hunter to check for error handling issues
3. Finally, use @code-simplifier to simplify and refine the code

Focus on:
- Files modified in the current git diff
- High-confidence issues only (confidence >= 80)
- Preserving all functionality during simplification

Start with the code review.
EOF
    echo -e "${GREEN}Created /auto-review prompt${NC}"
else
    echo -e "${YELLOW}Auto-review prompt already exists${NC}"
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    Setup Complete!                         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}What's been configured:${NC}"
echo "  • MCP Server: brain-dump (ticket management tools)"
echo "  • Agents: Defined in AGENTS.md (Ralph, Ticket Worker, Planner, Code Reviewer, etc.)"
echo "  • VS Code Setting: chat.useAgentsMdFile = true"
echo "  • Skills: brain-dump-tickets, ralph-workflow, auto-review"
echo "  • Prompts: start-ticket, complete-ticket, create-tickets, auto-review"
echo ""
echo -e "${BLUE}Configuration Locations:${NC}"
echo "  • MCP:      $VSCODE_TARGET/mcp.json"
echo "  • Agents:   $VSCODE_TARGET/prompts/*.agent.md (global, all workspaces)"
echo "  • Prompts:  $VSCODE_TARGET/prompts/*.prompt.md"
echo "  • Skills:   $COPILOT_SKILLS_DIR/"
echo ""
echo -e "${BLUE}Auto-Review in VS Code:${NC}"
echo "  Unlike Claude Code (which uses hooks), VS Code requires manual invocation."
echo "  After completing a coding task, use one of these methods:"
echo ""
echo "    1. Prompt: /auto-review"
echo "    2. Agent: @code-reviewer → @silent-failure-hunter → @code-simplifier"
echo "    3. Chat: 'Please review my recent changes'"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Restart VS Code to load the MCP server"
echo "  2. Open Copilot Chat and try: @ralph or /start-ticket"
echo "  3. After coding, use /auto-review to review changes"
echo ""
echo -e "${YELLOW}Note:${NC} Make sure Brain Dump is running at least once to initialize the database."
echo ""
