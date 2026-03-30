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

# Legacy telemetry hooks are cleaned up in Step 8 (hooks configuration)

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
# Step 6: Detect Cursor Agent CLI (best-effort)
# =============================================================================
echo ""
echo -e "${BLUE}Step 6: Detect Cursor Agent CLI${NC}"
echo "─────────────────────────────────"

CURSOR_AGENT_CLI=""
CURSOR_AGENT_STATUS="not found"

# Strategy 1: Check 'agent' in PATH and verify it's Cursor's binary
if command -v agent >/dev/null 2>&1; then
    AGENT_HELP=$(agent --help 2>&1 || true)
    if echo "$AGENT_HELP" | grep -qi "Cursor Agent"; then
        CURSOR_AGENT_CLI=$(command -v agent)
        CURSOR_AGENT_STATUS="found ($CURSOR_AGENT_CLI)"
        AGENT_VERSION=$(agent --version 2>&1 || true)
        echo -e "${GREEN}✓ Cursor Agent CLI detected: $CURSOR_AGENT_CLI${NC}"
        echo -e "  Version: $AGENT_VERSION"
    else
        echo -e "${YELLOW}○ 'agent' found in PATH but not Cursor Agent CLI${NC}"
    fi
fi

# Strategy 2: Fallback to ~/.local/bin/agent
if [ -z "$CURSOR_AGENT_CLI" ] && [ -x "$HOME/.local/bin/agent" ]; then
    AGENT_HELP=$("$HOME/.local/bin/agent" --help 2>&1 || true)
    if echo "$AGENT_HELP" | grep -qi "Cursor Agent"; then
        CURSOR_AGENT_CLI="$HOME/.local/bin/agent"
        CURSOR_AGENT_STATUS="found ($CURSOR_AGENT_CLI)"
        AGENT_VERSION=$("$HOME/.local/bin/agent" --version 2>&1 || true)
        echo -e "${GREEN}✓ Cursor Agent CLI detected: $CURSOR_AGENT_CLI${NC}"
        echo -e "  Version: $AGENT_VERSION"
    fi
fi

# Strategy 3: Fallback to 'cursor-agent' in PATH
if [ -z "$CURSOR_AGENT_CLI" ] && command -v cursor-agent >/dev/null 2>&1 && cursor-agent --help 2>&1 | grep -qi "Cursor Agent"; then
    CURSOR_AGENT_CLI=$(command -v cursor-agent)
    CURSOR_AGENT_STATUS="found ($CURSOR_AGENT_CLI)"
    AGENT_VERSION=$(cursor-agent --version 2>&1 || true)
    echo -e "${GREEN}✓ Cursor Agent CLI detected: $CURSOR_AGENT_CLI${NC}"
    echo -e "  Version: $AGENT_VERSION"
fi

if [ -z "$CURSOR_AGENT_CLI" ]; then
    echo -e "${YELLOW}○ Cursor Agent CLI not found${NC}"
    echo -e "  Install: ${BLUE}curl https://cursor.com/install -fsS | bash${NC}"
    echo -e "  (Editor setup continues — CLI is optional)"
fi

# =============================================================================
# Step 7: Configure cli-config.json (Cursor Agent permissions)
# =============================================================================
echo ""
echo -e "${BLUE}Step 7: Configure cli-config.json${NC}"
echo "───────────────────────────────────"

CLI_CONFIG_FILE="$CURSOR_CONFIG_DIR/cli-config.json"
echo -e "${YELLOW}Location:${NC} $CLI_CONFIG_FILE"

# Brain Dump-managed permission entries for approval-free Ralph
# Cursor uses exact "Shell(command)" string matching
BRAIN_DUMP_ALLOW_PERMISSIONS='["Shell(git)","Shell(node)","Shell(pnpm)","Shell(npm)","Shell(bash)","Shell(sh)","Shell(rg)","Shell(find)","Shell(ls)","Shell(cat)","Shell(sed)","Shell(grep)","Shell(mkdir)","Shell(cp)","Shell(mv)","Shell(echo)","Shell(test)","Shell(which)"]'
BRAIN_DUMP_DENY_PERMISSIONS='["Shell(rm -rf /)","Shell(sudo)","Shell(shutdown)","Shell(reboot)"]'

if [ -f "$CLI_CONFIG_FILE" ]; then
    echo "Existing cli-config.json found. Merging Brain Dump permissions..."
    if command -v node >/dev/null 2>&1; then
        node_error=$(CLI_CONFIG_FILE="$CLI_CONFIG_FILE" BD_ALLOW="$BRAIN_DUMP_ALLOW_PERMISSIONS" BD_DENY="$BRAIN_DUMP_DENY_PERMISSIONS" node -e '
const fs = require("fs");
const configFile = process.env.CLI_CONFIG_FILE;
const bdAllow = JSON.parse(process.env.BD_ALLOW);
const bdDeny = JSON.parse(process.env.BD_DENY);

try {
    const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    config.permissions = config.permissions || {};

    // Merge allow: add BD entries, preserve existing user entries
    const existingAllow = config.permissions.allow || [];
    const mergedAllow = [...new Set([...existingAllow, ...bdAllow])];
    config.permissions.allow = mergedAllow;

    // Merge deny: add BD entries, preserve existing user entries
    const existingDeny = config.permissions.deny || [];
    const mergedDeny = [...new Set([...existingDeny, ...bdDeny])];
    config.permissions.deny = mergedDeny;

    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    console.log("Permissions merged successfully");
} catch (err) {
    console.error("Error: " + err.message);
    process.exit(1);
}
' 2>&1) && echo -e "${GREEN}✓ Brain Dump permissions merged into cli-config.json${NC}" || {
            if [ -n "$node_error" ]; then
                echo -e "${YELLOW}JSON merge failed: $node_error${NC}"
            fi
            echo -e "${RED}Please manually add permissions to $CLI_CONFIG_FILE${NC}"
        }
    else
        echo -e "${RED}Node.js not found. Please manually configure $CLI_CONFIG_FILE${NC}"
    fi
else
    echo "Creating new cli-config.json..."
    cat > "$CLI_CONFIG_FILE" << EOF
{
  "permissions": {
    "allow": [
      "Shell(git)", "Shell(node)", "Shell(pnpm)", "Shell(npm)",
      "Shell(bash)", "Shell(sh)", "Shell(rg)", "Shell(find)",
      "Shell(ls)", "Shell(cat)", "Shell(sed)", "Shell(grep)",
      "Shell(mkdir)", "Shell(cp)", "Shell(mv)", "Shell(echo)",
      "Shell(test)", "Shell(which)"
    ],
    "deny": [
      "Shell(rm -rf /)", "Shell(sudo)", "Shell(shutdown)", "Shell(reboot)"
    ]
  }
}
EOF
    echo -e "${GREEN}✓ Created cli-config.json with Brain Dump permissions${NC}"
fi

# =============================================================================
# Step 8: Configure State Enforcement Hook (optional)
# =============================================================================
echo ""
echo -e "${BLUE}Step 8: Configure State Enforcement Hook${NC}"
echo "──────────────────────────────────────────"

HOOKS_TARGET="$CURSOR_CONFIG_DIR/hooks"
HOOKS_CONFIG="$CURSOR_CONFIG_DIR/hooks.json"
echo -e "${YELLOW}Location:${NC} $HOOKS_TARGET/"
echo -e "${YELLOW}Config:${NC} $HOOKS_CONFIG"

mkdir -p "$HOOKS_TARGET"

# Check for jq dependency (required by hook scripts)
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

# Dual-format: Cursor uses toolName, Claude Code uses tool_name
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

# --- Merge hooks.json (preserve existing hooks) ---
if [ -f "$HOOKS_CONFIG" ]; then
    echo "Existing hooks.json found. Merging Brain Dump hook..."
    if command -v node >/dev/null 2>&1; then
        node_error=$(HOOKS_CONFIG="$HOOKS_CONFIG" HOOKS_TARGET="$HOOKS_TARGET" node -e '
const fs = require("fs");
const configFile = process.env.HOOKS_CONFIG;
const hooksDir = process.env.HOOKS_TARGET;

try {
    const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    config.hooks = config.hooks || {};
    config.hooks.preToolUse = config.hooks.preToolUse || [];

    const hookPath = hooksDir + "/enforce-state-before-write.sh";
    const hasHook = config.hooks.preToolUse.some(h =>
        h.bash && h.bash.includes("enforce-state-before-write")
    );
    if (!hasHook) {
        config.hooks.preToolUse.push({
            type: "command",
            bash: hookPath
        });
    }

    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    console.log("Hook merged successfully");
} catch (err) {
    console.error("Error: " + err.message);
    process.exit(1);
}
' 2>&1) && echo -e "${GREEN}✓ Brain Dump hook merged into hooks.json${NC}" || {
            if [ -n "$node_error" ]; then
                echo -e "${YELLOW}JSON merge failed: $node_error${NC}"
            fi
            echo -e "${RED}Please manually add the hook to $HOOKS_CONFIG${NC}"
        }
    else
        echo -e "${RED}Node.js not found. Please manually configure $HOOKS_CONFIG${NC}"
    fi
else
    cat > "$HOOKS_CONFIG" << HOOKS_JSON_EOF
{
  "version": 1,
  "hooks": {
    "preToolUse": [
      { "type": "command", "bash": "$HOOKS_TARGET/enforce-state-before-write.sh" }
    ]
  }
}
HOOKS_JSON_EOF
    echo -e "${GREEN}✓ Created hooks.json (preToolUse: enforce-state-before-write)${NC}"
fi

# Clean up legacy telemetry hooks if they exist
for old_hook in start-telemetry.sh end-telemetry.sh log-tool.sh log-tool-failure.sh log-prompt.sh; do
    if [ -f "$HOOKS_TARGET/$old_hook" ]; then
        rm "$HOOKS_TARGET/$old_hook"
        echo -e "${YELLOW}Removed legacy telemetry hook: $old_hook${NC}"
    fi
done

echo -e "${GREEN}Hook scripts installed:${NC}"
ls "$HOOKS_TARGET"/*.sh 2>/dev/null | xargs -I {} basename {} | sed 's/^/  • /' || echo "  (none)"

# =============================================================================
# Step 9: Summary
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
echo -e "  ${GREEN}Cursor Agent CLI:${NC}"
if [ -n "$CURSOR_AGENT_CLI" ]; then
    echo "    • Status: $CURSOR_AGENT_STATUS"
    echo "    • Permissions: $CLI_CONFIG_FILE"
    echo "    • Hooks: $HOOKS_CONFIG"
else
    echo "    • Status: not installed (optional)"
    echo -e "    • Install: ${BLUE}curl https://cursor.com/install -fsS | bash${NC}"
fi
echo ""
echo -e "  ${GREEN}Telemetry:${NC}"
echo "    • MCP self-instrumentation (no hooks needed)"
echo "    • Session tracking, tool usage, and prompts captured by MCP server"
echo ""
echo -e "${BLUE}Configuration Locations:${NC}"
echo "  • MCP:        $MCP_CONFIG_FILE"
echo "  • Subagents:  $AGENTS_TARGET/ (global, all projects)"
echo "  • Skills:     $SKILLS_TARGET/ (global, all projects)"
echo "  • Commands:   $COMMANDS_TARGET/ (global, all projects)"
echo "  • CLI Config: $CLI_CONFIG_FILE"
echo "  • Hooks:      $HOOKS_CONFIG"
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
if [ -n "$CURSOR_AGENT_CLI" ]; then
    echo -e "  ${GREEN}Use Cursor Agent CLI:${NC}"
    echo "    agent --force --approve-mcps --trust -p 'your prompt'"
    echo "    Ralph will auto-launch with cursor-agent backend"
    echo ""
fi
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Restart Cursor to load the MCP server and configurations"
echo "  2. Open any project and try: @ralph or /review"
echo "  3. Telemetry is handled automatically by MCP self-instrumentation"
echo ""
echo -e "${YELLOW}Note:${NC} Make sure Brain Dump's MCP server is built:"
echo "  cd $BRAIN_DUMP_DIR && pnpm build"
echo ""
