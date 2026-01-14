#!/bin/bash
# Brain Dump VS Code Setup Script
# Configures VS Code to use Brain Dump as "ground control" for AI agents
#
# This script:
# 1. Configures the Brain Dump MCP server globally
# 2. Symlinks agents, skills, and prompts to VS Code user profile
# 3. Sets up auto-review workflow agents (code-reviewer, code-simplifier)
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
BRAIN_DUMPY_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${YELLOW}Brain Dump location:${NC} $BRAIN_DUMPY_DIR"

# Detect OS and set VS Code paths
detect_vscode_paths() {
    case "$(uname -s)" in
        Linux*)
            VSCODE_USER_DIR="$HOME/.config/Code/User"
            VSCODE_INSIDERS_USER_DIR="$HOME/.config/Code - Insiders/User"
            VSCODE_MCP_DIR="$HOME/.vscode"
            ;;
        Darwin*)
            VSCODE_USER_DIR="$HOME/Library/Application Support/Code/User"
            VSCODE_INSIDERS_USER_DIR="$HOME/Library/Application Support/Code - Insiders/User"
            VSCODE_MCP_DIR="$HOME/.vscode"
            ;;
        MINGW*|MSYS*|CYGWIN*)
            VSCODE_USER_DIR="$APPDATA/Code/User"
            VSCODE_INSIDERS_USER_DIR="$APPDATA/Code - Insiders/User"
            VSCODE_MCP_DIR="$USERPROFILE/.vscode"
            ;;
        *)
            echo -e "${RED}Unsupported operating system${NC}"
            exit 1
            ;;
    esac
}

detect_vscode_paths

# Link or copy a file/directory to target, skipping if it already exists
link_item() {
    local source="$1"
    local target="$2"
    local name=$(basename "$source")

    if [ -L "$target" ] || [ -e "$target" ]; then
        echo -e "${YELLOW}Exists: $name (skipping)${NC}"
    else
        ln -s "$source" "$target" 2>/dev/null || cp -r "$source" "$target"
        echo -e "${GREEN}Added: $name${NC}"
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
fi

echo ""
echo -e "${BLUE}Step 1: Configure MCP Server${NC}"
echo "─────────────────────────────"

# Create MCP config directory
mkdir -p "$VSCODE_MCP_DIR"

MCP_CONFIG_FILE="$VSCODE_MCP_DIR/mcp.json"

# Check if mcp.json already exists
if [ -f "$MCP_CONFIG_FILE" ]; then
    echo -e "${YELLOW}Existing mcp.json found. Checking for brain-dump server...${NC}"
    if grep -q '"brain-dump"' "$MCP_CONFIG_FILE"; then
        echo -e "${GREEN}Brain Dump MCP server already configured.${NC}"
    else
        echo -e "${YELLOW}Adding brain-dump server to existing config...${NC}"
        # This is a simple approach - for complex configs, manual editing may be needed
        echo -e "${RED}Please manually add the brain-dump server to your mcp.json:${NC}"
        echo ""
        echo '  "brain-dump": {'
        echo '    "type": "stdio",'
        echo '    "command": "node",'
        echo "    \"args\": [\"$BRAIN_DUMPY_DIR/mcp-server/index.js\"]"
        echo '  }'
    fi
else
    echo "Creating new mcp.json..."
    cat > "$MCP_CONFIG_FILE" << EOF
{
  "servers": {
    "brain-dump": {
      "type": "stdio",
      "command": "node",
      "args": ["$BRAIN_DUMPY_DIR/mcp-server/index.js"]
    }
  }
}
EOF
    echo -e "${GREEN}Created $MCP_CONFIG_FILE${NC}"
fi

echo ""
echo -e "${BLUE}Step 2: Configure Agents${NC}"
echo "─────────────────────────"

AGENTS_SOURCE="$BRAIN_DUMPY_DIR/.github/agents"
AGENTS_TARGET="$VSCODE_TARGET/agents"

if [ -d "$AGENTS_SOURCE" ]; then
    mkdir -p "$AGENTS_TARGET"
    for agent_file in "$AGENTS_SOURCE"/*.agent.md; do
        [ -f "$agent_file" ] && link_item "$agent_file" "$AGENTS_TARGET/$(basename "$agent_file")"
    done
else
    echo -e "${YELLOW}No agents found in Brain Dump${NC}"
fi

echo ""
echo -e "${BLUE}Step 3: Configure Skills${NC}"
echo "─────────────────────────"

SKILLS_SOURCE="$BRAIN_DUMPY_DIR/.github/skills"
SKILLS_TARGET="$VSCODE_TARGET/skills"

if [ -d "$SKILLS_SOURCE" ]; then
    mkdir -p "$SKILLS_TARGET"
    for skill_dir in "$SKILLS_SOURCE"/*/; do
        [ -d "$skill_dir" ] && link_item "$skill_dir" "$SKILLS_TARGET/$(basename "$skill_dir")"
    done
else
    echo -e "${YELLOW}No skills found in Brain Dump (optional)${NC}"
fi

echo ""
echo -e "${BLUE}Step 4: Configure Prompts${NC}"
echo "──────────────────────────"

PROMPTS_SOURCE="$BRAIN_DUMPY_DIR/.github/prompts"
PROMPTS_TARGET="$VSCODE_TARGET/prompts"

if [ -d "$PROMPTS_SOURCE" ]; then
    mkdir -p "$PROMPTS_TARGET"
    for prompt_file in "$PROMPTS_SOURCE"/*.prompt.md; do
        [ -f "$prompt_file" ] && link_item "$prompt_file" "$PROMPTS_TARGET/$(basename "$prompt_file")"
    done
else
    echo -e "${YELLOW}No prompts found in Brain Dump (optional)${NC}"
fi

echo ""
echo -e "${BLUE}Step 5: Configure Auto-Review Workflow${NC}"
echo "───────────────────────────────────────"

# Create auto-review skill for VS Code
AUTO_REVIEW_SKILL_DIR="$SKILLS_TARGET/auto-review"
if [ ! -d "$AUTO_REVIEW_SKILL_DIR" ]; then
    mkdir -p "$AUTO_REVIEW_SKILL_DIR"
    cat > "$AUTO_REVIEW_SKILL_DIR/SKILL.md" << 'EOF'
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
echo "  • Agents: Ralph, Ticket Worker, Planner, Code Reviewer, Silent Failure Hunter, Code Simplifier"
echo "  • Skills: auto-review"
echo "  • Prompts: /auto-review"
echo ""
echo -e "${BLUE}Auto-Review in VS Code:${NC}"
echo "  Unlike Claude Code (which uses hooks), VS Code requires manual invocation."
echo "  After completing a coding task, use one of these methods:"
echo ""
echo "    1. Prompt: /auto-review"
echo "    2. Agent: @code-reviewer → @silent-failure-hunter → @code-simplifier"
echo "    3. Chat: 'Please review my recent changes'"
echo ""
echo -e "${BLUE}Review Pipeline (same as Claude Code):${NC}"
echo "    1. @code-reviewer - Project guideline compliance"
echo "    2. @silent-failure-hunter - Error handling issues"
echo "    3. @code-simplifier - Code simplification"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Restart VS Code to load the MCP server"
echo "  2. Open Copilot Chat and try: @ralph or /start-ticket"
echo "  3. After coding, use /auto-review to review changes"
echo "  4. For background agents, enable: github.copilot.chat.cli.customAgents.enabled"
echo ""
echo -e "${YELLOW}Note:${NC} Make sure Brain Dump is running at least once to initialize the database."
echo ""
