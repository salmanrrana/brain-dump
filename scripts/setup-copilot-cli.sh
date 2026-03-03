#!/bin/bash
# Brain Dump Copilot CLI Setup Script
# Configures Copilot CLI to use Brain Dump's MCP server, agents, skills, and hooks globally.
#
# This script follows Copilot CLI conventions:
#   - MCP Server: ~/.copilot/mcp-config.json (global user config)
#   - Agents: ~/.copilot/agents/*.agent.md (user-level agents)
#   - Skills: ~/.copilot/skills/ (shared with VS Code)
#   - Hooks: ~/.copilot/hooks.json + ~/.copilot/hooks/ (global hooks)
#
# After running, Brain Dump tools, agents, and hooks are available in ALL Copilot CLI projects.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║       Brain Dump - Copilot CLI Global Setup               ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAIN_DUMP_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${YELLOW}Brain Dump location:${NC} $BRAIN_DUMP_DIR"

# Copilot CLI config directories
COPILOT_DIR="$HOME/.copilot"
MCP_CONFIG_FILE="$COPILOT_DIR/mcp-config.json"
AGENTS_TARGET="$COPILOT_DIR/agents"
SKILLS_TARGET="$COPILOT_DIR/skills"
HOOKS_TARGET="$COPILOT_DIR/hooks"
HOOKS_CONFIG="$COPILOT_DIR/hooks.json"

# Source directories in brain-dump
AGENTS_SOURCE="$BRAIN_DUMP_DIR/.github/agents"
SKILLS_SOURCE_CLAUDE="$BRAIN_DUMP_DIR/.claude/skills"

# =============================================================================
# Step 1: Configure MCP Server
# =============================================================================
echo ""
echo -e "${BLUE}Step 1: Configure MCP Server${NC}"
echo "─────────────────────────────"
echo -e "${YELLOW}Location:${NC} $MCP_CONFIG_FILE"

mkdir -p "$COPILOT_DIR"

if [ -f "$MCP_CONFIG_FILE" ]; then
    echo "Existing mcp-config.json found. Updating brain-dump entry..."
    if command -v node >/dev/null 2>&1; then
        node_error=$(MCP_CONFIG_FILE="$MCP_CONFIG_FILE" BRAIN_DUMP_DIR="$BRAIN_DUMP_DIR" node -e '
const fs = require("fs");
const configFile = process.env.MCP_CONFIG_FILE;
const brainDumpDir = process.env.BRAIN_DUMP_DIR;

try {
    const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    config.mcpServers = config.mcpServers || {};
    config.mcpServers["brain-dump"] = {
        type: "local",
        command: "node",
        args: [brainDumpDir + "/mcp-server/dist/index.js"],
        env: { COPILOT_CLI: "1" },
        tools: ["*"]
    };
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    console.log("Config updated successfully");
} catch (err) {
    console.error("Error: " + err.message);
    process.exit(1);
}
' 2>&1) && echo -e "${GREEN}✓ Brain Dump MCP server configured${NC}" || {
            if [ -n "$node_error" ]; then
                echo -e "${YELLOW}JSON merge failed: $node_error${NC}"
            fi
            echo -e "${RED}Please manually add the brain-dump server to $MCP_CONFIG_FILE${NC}"
        }
    else
        echo -e "${RED}Node.js not found. Please manually add the brain-dump server to $MCP_CONFIG_FILE${NC}"
    fi
else
    echo "Creating new mcp-config.json..."
    cat > "$MCP_CONFIG_FILE" << EOF
{
  "mcpServers": {
    "brain-dump": {
      "type": "local",
      "command": "node",
      "args": ["$BRAIN_DUMP_DIR/mcp-server/dist/index.js"],
      "env": {
        "COPILOT_CLI": "1"
      },
      "tools": ["*"]
    }
  }
}
EOF
    echo -e "${GREEN}✓ Created mcp-config.json${NC}"
fi

# =============================================================================
# Step 2: Configure Agents (global)
# =============================================================================
echo ""
echo -e "${BLUE}Step 2: Configure Agents (global)${NC}"
echo "──────────────────────────────────"
echo -e "${YELLOW}Location:${NC} $AGENTS_TARGET/"
echo -e "${YELLOW}Note:${NC} Copilot CLI uses .agent.md extension (same as VS Code)"

if [ -d "$AGENTS_SOURCE" ]; then
    mkdir -p "$AGENTS_TARGET"
    for agent_file in "$AGENTS_SOURCE"/*.agent.md; do
        if [ -f "$agent_file" ]; then
            agent_name=$(basename "$agent_file")
            target_path="$AGENTS_TARGET/$agent_name"

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

    # Clean up previously-installed review/utility agents (now inlined into commands)
    STALE_AGENTS=("code-reviewer.agent.md" "silent-failure-hunter.agent.md" "code-simplifier.agent.md" "context7-library-compliance.agent.md" "react-best-practices.agent.md" "cruft-detector.agent.md" "senior-engineer.agent.md" "inception.agent.md")
    for stale in "${STALE_AGENTS[@]}"; do
        if [ -f "$AGENTS_TARGET/$stale" ]; then
            rm "$AGENTS_TARGET/$stale"
            echo -e "${YELLOW}Removed legacy agent: $stale${NC}"
        fi
    done

    echo -e "${GREEN}Agents installed:${NC}"
    ls "$AGENTS_TARGET"/*.agent.md 2>/dev/null | xargs -I {} basename {} | sed 's/^/  • /' || echo "  (none)"
else
    echo -e "${YELLOW}No agents found in Brain Dump (.github/agents/)${NC}"
fi

# =============================================================================
# Step 3: Configure Skills (global, shared with VS Code)
# =============================================================================
echo ""
echo -e "${BLUE}Step 3: Configure Skills (global)${NC}"
echo "──────────────────────────────────"
echo -e "${YELLOW}Location:${NC} $SKILLS_TARGET/"
echo -e "${YELLOW}Note:${NC} Shared with VS Code setup — idempotent copy"

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
# Also clean up standalone skill files
for stale_file in "$SKILLS_TARGET"/*.skill.md; do
    if [ -f "$stale_file" ]; then
        rm "$stale_file"
        echo -e "${YELLOW}Removed legacy skill file: $(basename "$stale_file")${NC}"
    fi
done

echo -e "${GREEN}Global skills installed:${NC}"
ls -d "$SKILLS_TARGET"/*/ 2>/dev/null | xargs -I {} basename {} | sed 's/^/  • /' || echo "  (none)"

# =============================================================================
# Step 4: Configure Hooks (global)
# =============================================================================
echo ""
echo -e "${BLUE}Step 4: Configure Hooks (global)${NC}"
echo "─────────────────────────────────"
echo -e "${YELLOW}Location:${NC} $HOOKS_TARGET/"
echo -e "${YELLOW}Config:${NC} $HOOKS_CONFIG"

mkdir -p "$HOOKS_TARGET"

# Check for jq dependency (required by all hook scripts)
if ! command -v jq >/dev/null 2>&1; then
    echo -e "${YELLOW}Warning: jq not found. Hooks require jq for JSON parsing.${NC}"
    echo -e "${YELLOW}Install jq: https://jqlang.github.io/jq/download/${NC}"
    echo ""
fi

# --- enforce-state-before-write.sh (preToolUse) ---
cat > "$HOOKS_TARGET/enforce-state-before-write.sh" << 'HOOK_EOF'
#!/bin/bash
# enforce-state-before-write.sh — preToolUse hook for Ralph state enforcement
# Blocks Write/Edit/Create tools unless in implementing/testing/committing state.
# When NOT in Ralph mode (no state file), allows all operations.
set -e

INPUT=$(cat 2>/dev/null || echo "{}")

# Dual-format: Copilot CLI uses toolName, Claude Code uses tool_name
TOOL_NAME_RAW=$(echo "$INPUT" | jq -r '.toolName // .tool_name // .tool // ""' 2>/dev/null || echo "")
TOOL_NAME=$(echo "$TOOL_NAME_RAW" | tr '[:upper:]' '[:lower:]')

# Only care about write/edit/create tools
if [[ "$TOOL_NAME" != "write" && "$TOOL_NAME" != "edit" && "$TOOL_NAME" != "create" ]]; then
    echo '{"permissionDecision": "allow"}'
    exit 0
fi

# Find project root
PROJECT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
STATE_FILE="$PROJECT_DIR/.claude/ralph-state.json"

if [[ ! -f "$STATE_FILE" ]]; then
    # Not in Ralph mode — allow normal operation
    echo '{"permissionDecision": "allow"}'
    exit 0
fi

CURRENT_STATE=$(jq -r '.currentState // "unknown"' "$STATE_FILE" 2>/dev/null || echo "unknown")
SESSION_ID=$(jq -r '.sessionId // "unknown"' "$STATE_FILE" 2>/dev/null || echo "unknown")

if [[ "$CURRENT_STATE" == "implementing" || "$CURRENT_STATE" == "testing" || "$CURRENT_STATE" == "committing" ]]; then
    echo '{"permissionDecision": "allow"}'
    exit 0
fi

# Block with guidance
cat <<BLOCK_EOF
{
  "permissionDecision": "deny",
  "reason": "STATE ENFORCEMENT: You are in '$CURRENT_STATE' state but tried to write/edit code.\n\nTo write code, call the session tool:\n  action: \"update-state\", sessionId: \"$SESSION_ID\", state: \"implementing\"\n\nValid states for writing code: implementing, testing, committing"
}
BLOCK_EOF
HOOK_EOF
chmod +x "$HOOKS_TARGET/enforce-state-before-write.sh"
echo -e "${GREEN}Created: enforce-state-before-write.sh${NC}"

# --- Create hooks.json config ---
echo ""
echo -e "${YELLOW}Creating hooks config...${NC}"

# Clean up old telemetry hooks if they exist from previous installs
for old_hook in start-telemetry.sh end-telemetry.sh log-prompt.sh log-tool-start.sh log-tool-end.sh log-tool-failure.sh; do
    if [ -f "$HOOKS_TARGET/$old_hook" ]; then
        rm "$HOOKS_TARGET/$old_hook"
        echo -e "${YELLOW}Removed legacy hook: $old_hook${NC}"
    fi
done

cat > "$HOOKS_CONFIG" << HOOKS_JSON_EOF
{
  "version": 1,
  "hooks": {
    "preToolUse": [
      { "type": "command", "bash": "$HOME/.copilot/hooks/enforce-state-before-write.sh" }
    ]
  }
}
HOOKS_JSON_EOF
echo -e "${GREEN}✓ Created hooks.json (preToolUse: enforce-state-before-write)${NC}"

echo -e "${GREEN}Hook scripts installed:${NC}"
ls "$HOOKS_TARGET"/*.sh 2>/dev/null | xargs -I {} basename {} | sed 's/^/  • /' || echo "  (none)"

# =============================================================================
# Step 5: Summary
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
echo "    • Format: type=local, env COPILOT_CLI=1, tools=[*]"
echo ""
echo -e "  ${GREEN}Agents (~/.copilot/agents/):${NC}"
echo "    • ralph - Autonomous coding agent"
echo "    • ticket-worker - Interactive ticket implementation"
echo "    • planner - Create implementation plans and tickets"
echo ""
echo -e "  ${GREEN}Skills (~/.copilot/skills/):${NC}"
echo "    • brain-dump-workflow - Universal quality workflow"
echo "    • review - Code review pipeline"
echo "    • review-aggregation - Combine review findings"
echo ""
echo -e "  ${GREEN}Hooks (~/.copilot/hooks/):${NC}"
echo "    • enforce-state-before-write.sh - Ralph state enforcement (preToolUse)"
echo ""
echo -e "  ${GREEN}Telemetry:${NC}"
echo "    • MCP self-instrumentation (no hooks needed)"
echo "    • Session tracking, tool usage, and prompts captured by MCP server"
echo ""
echo -e "${BLUE}Configuration Locations:${NC}"
echo "  • MCP:      $MCP_CONFIG_FILE"
echo "  • Agents:   $AGENTS_TARGET/ (global, all projects)"
echo "  • Skills:   $SKILLS_TARGET/ (global, shared with VS Code)"
echo "  • Hooks:    $HOOKS_CONFIG (event config)"
echo "  • Scripts:  $HOOKS_TARGET/ (hook scripts)"
echo ""
echo -e "${BLUE}Using Brain Dump in Copilot CLI:${NC}"
echo ""
echo -e "  ${GREEN}Auto-approve Brain Dump tools:${NC}"
echo "    copilot --allow-tool 'brain-dump'"
echo ""
echo -e "  ${GREEN}Auto-approve all tools:${NC}"
echo "    copilot --allow-all-tools"
echo ""
echo -e "  ${GREEN}Use Agents:${NC}"
echo "    @ralph to start autonomous ticket work"
echo "    @ticket-worker to work on a specific ticket"
echo "    @planner to create tickets from requirements"
echo ""
echo -e "  ${GREEN}Use MCP Tools:${NC}"
echo "    Ask Copilot to 'list my projects' or 'create a ticket'"
echo "    Copilot will automatically use brain-dump MCP tools"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Start a new Copilot CLI session to load MCP server"
echo "  2. In your repo, use: @ralph or ask about Brain Dump tickets"
echo "  3. Telemetry is handled automatically by MCP self-instrumentation"
echo ""
echo -e "${YELLOW}Note:${NC} Make sure Brain Dump's MCP server is built:"
echo "  cd $BRAIN_DUMP_DIR && pnpm build"
echo ""
