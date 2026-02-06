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
SKILLS_SOURCE_GITHUB="$BRAIN_DUMP_DIR/.github/skills"
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

# Copy skills from .github/skills
if [ -d "$SKILLS_SOURCE_GITHUB" ]; then
    mkdir -p "$SKILLS_TARGET"
    for skill_dir in "$SKILLS_SOURCE_GITHUB"/*/; do
        if [ -d "$skill_dir" ]; then
            skill_name=$(basename "$skill_dir")
            target_path="$SKILLS_TARGET/$skill_name"
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

# Also copy skills from .claude/skills (review, review-aggregation, brain-dump-workflow)
if [ -d "$SKILLS_SOURCE_CLAUDE" ]; then
    mkdir -p "$SKILLS_TARGET"
    for skill_dir in "$SKILLS_SOURCE_CLAUDE"/*/; do
        if [ -d "$skill_dir" ]; then
            skill_name=$(basename "$skill_dir")
            target_path="$SKILLS_TARGET/$skill_name"
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

# Also copy standalone skill files (not in directories)
for skill_file in "$SKILLS_SOURCE_GITHUB"/*.skill.md; do
    if [ -f "$skill_file" ]; then
        skill_name=$(basename "$skill_file")
        target_path="$SKILLS_TARGET/$skill_name"
        if [ -f "$target_path" ]; then
            if ! cmp -s "$skill_file" "$target_path"; then
                cp "$skill_file" "$target_path"
                echo -e "${GREEN}Updated: $skill_name${NC}"
            else
                echo -e "${YELLOW}Exists: $skill_name${NC}"
            fi
        else
            cp "$skill_file" "$target_path"
            echo -e "${GREEN}Added: $skill_name${NC}"
        fi
    fi
done

echo -e "${GREEN}Skills installed:${NC}"
ls -d "$SKILLS_TARGET"/*/ 2>/dev/null | xargs -I {} basename {} | sed 's/^/  • /' || true
ls "$SKILLS_TARGET"/*.skill.md 2>/dev/null | xargs -I {} basename {} | sed 's/^/  • /' || true

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

# --- Hook 1: start-telemetry.sh (sessionStart) ---
cat > "$HOOKS_TARGET/start-telemetry.sh" << 'HOOK_EOF'
#!/bin/bash
# start-telemetry.sh — sessionStart hook for telemetry
# Detects active ticket from .claude/ralph-state.json and prompts telemetry start.
set -e

PROJECT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
LOG_FILE="$HOME/.copilot/telemetry.log"
mkdir -p "$(dirname "$LOG_FILE")"

echo "[$(date -Iseconds)] sessionStart hook triggered" >> "$LOG_FILE"

# Check if telemetry is already active
TELEMETRY_FILE="$PROJECT_DIR/.claude/telemetry-session.json"
if [[ -f "$TELEMETRY_FILE" ]]; then
    SESSION_STARTED=$(jq -r '.startedAt // ""' "$TELEMETRY_FILE" 2>/dev/null || echo "")
    if [[ -n "$SESSION_STARTED" ]]; then
        SESSION_TIME=$(date -d "$SESSION_STARTED" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "$SESSION_STARTED" +%s 2>/dev/null || echo "0")
        NOW_TIME=$(date +%s)
        AGE_HOURS=$(( (NOW_TIME - SESSION_TIME) / 3600 ))
        if [[ $AGE_HOURS -lt 24 ]]; then
            echo "[$(date -Iseconds)] Telemetry session still active (${AGE_HOURS}h old), skipping" >> "$LOG_FILE"
            exit 0
        fi
    fi
fi

# Try to detect ticket from Ralph state file
RALPH_STATE="$PROJECT_DIR/.claude/ralph-state.json"
TICKET_ID=""
if [[ -f "$RALPH_STATE" ]]; then
    TICKET_ID=$(jq -r '.ticketId // ""' "$RALPH_STATE" 2>/dev/null || echo "")
fi

if [[ -n "$TICKET_ID" ]]; then
    echo ""
    echo "TELEMETRY: Active ticket detected: $TICKET_ID"
    echo "Call telemetry tool, action: \"start\", ticketId: \"$TICKET_ID\""
    echo ""
else
    echo ""
    echo "TELEMETRY: No active ticket detected."
    echo "To track this session, call: telemetry tool, action: \"start\", ticketId: \"<ticket-id>\""
    echo ""
fi

exit 0
HOOK_EOF
chmod +x "$HOOKS_TARGET/start-telemetry.sh"
echo -e "${GREEN}Created: start-telemetry.sh${NC}"

# --- Hook 2: end-telemetry.sh (sessionEnd) ---
cat > "$HOOKS_TARGET/end-telemetry.sh" << 'HOOK_EOF'
#!/bin/bash
# end-telemetry.sh — sessionEnd hook for telemetry
# Flushes telemetry queue and prompts session end.
set -e

PROJECT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
LOG_FILE="$HOME/.copilot/telemetry.log"
mkdir -p "$(dirname "$LOG_FILE")"

echo "[$(date -Iseconds)] sessionEnd hook triggered" >> "$LOG_FILE"

TELEMETRY_FILE="$PROJECT_DIR/.claude/telemetry-session.json"
if [[ ! -f "$TELEMETRY_FILE" ]]; then
    echo "[$(date -Iseconds)] No active telemetry session, skipping" >> "$LOG_FILE"
    exit 0
fi

SESSION_ID=$(jq -r '.sessionId // ""' "$TELEMETRY_FILE" 2>/dev/null || echo "")
if [[ -z "$SESSION_ID" ]]; then
    echo "[$(date -Iseconds)] Invalid telemetry session file" >> "$LOG_FILE"
    exit 0
fi

QUEUE_FILE="$HOME/.copilot/telemetry-queue.jsonl"
QUEUED_EVENTS=0
if [[ -f "$QUEUE_FILE" ]]; then
    QUEUED_EVENTS=$(wc -l < "$QUEUE_FILE" | tr -d ' ' || echo "0")
fi

echo "[$(date -Iseconds)] Ending telemetry session: $SESSION_ID ($QUEUED_EVENTS queued events)" >> "$LOG_FILE"

echo ""
echo "TELEMETRY: Session ending. Session ID: $SESSION_ID, Queued events: $QUEUED_EVENTS"
echo "Call telemetry tool, action: \"end\", sessionId: \"$SESSION_ID\""
echo ""

exit 0
HOOK_EOF
chmod +x "$HOOKS_TARGET/end-telemetry.sh"
echo -e "${GREEN}Created: end-telemetry.sh${NC}"

# --- Hook 3: log-prompt.sh (userPromptSubmitted) ---
cat > "$HOOKS_TARGET/log-prompt.sh" << 'HOOK_EOF'
#!/bin/bash
# log-prompt.sh — userPromptSubmitted hook for telemetry
# Records user prompts to telemetry queue.
set -e

PROJECT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
TELEMETRY_FILE="$PROJECT_DIR/.claude/telemetry-session.json"
if [[ ! -f "$TELEMETRY_FILE" ]]; then
    exit 0
fi

SESSION_ID=$(jq -r '.sessionId // ""' "$TELEMETRY_FILE" 2>/dev/null || echo "")
if [[ -z "$SESSION_ID" ]]; then
    exit 0
fi

LOG_FILE="$HOME/.copilot/telemetry.log"
echo "[$(date -Iseconds)] userPromptSubmitted hook triggered" >> "$LOG_FILE"

# Read input from stdin
INPUT=$(cat 2>/dev/null || echo "")

# Log prompt metadata (not content, for privacy)
if [[ -n "$INPUT" ]]; then
    PROMPT_LEN=$(echo -n "$INPUT" | wc -c | tr -d ' ')
    NOW=$(date -Iseconds)
    QUEUE_FILE="$HOME/.copilot/telemetry-queue.jsonl"
    mkdir -p "$(dirname "$QUEUE_FILE")"

    EVENT=$(jq -n \
        --arg sessionId "$SESSION_ID" \
        --arg event "prompt" \
        --argjson promptLength "$PROMPT_LEN" \
        --arg timestamp "$NOW" \
        '{sessionId: $sessionId, event: $event, promptLength: $promptLength, timestamp: $timestamp}')

    echo "$EVENT" >> "$QUEUE_FILE"
    echo "[$(date -Iseconds)] Prompt logged ($PROMPT_LEN chars)" >> "$LOG_FILE"
fi

exit 0
HOOK_EOF
chmod +x "$HOOKS_TARGET/log-prompt.sh"
echo -e "${GREEN}Created: log-prompt.sh${NC}"

# --- Hook 4: log-tool-start.sh (preToolUse) ---
cat > "$HOOKS_TARGET/log-tool-start.sh" << 'HOOK_EOF'
#!/bin/bash
# log-tool-start.sh — preToolUse hook for telemetry
# Records tool start events with correlation IDs for duration tracking.
set -e

PROJECT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
TELEMETRY_FILE="$PROJECT_DIR/.claude/telemetry-session.json"
if [[ ! -f "$TELEMETRY_FILE" ]]; then
    exit 0
fi

SESSION_ID=$(jq -r '.sessionId // ""' "$TELEMETRY_FILE" 2>/dev/null || echo "")
if [[ -z "$SESSION_ID" ]]; then
    exit 0
fi

LOG_FILE="$HOME/.copilot/telemetry.log"
QUEUE_FILE="$HOME/.copilot/telemetry-queue.jsonl"
mkdir -p "$(dirname "$QUEUE_FILE")"

INPUT=$(cat 2>/dev/null || echo "{}")

# Dual-format fallback: Copilot CLI may use toolName or tool_name or tool
TOOL_NAME=$(echo "$INPUT" | jq -r '.toolName // .tool_name // .tool // ""' 2>/dev/null || echo "unknown")
TOOL_INPUT=$(echo "$INPUT" | jq -r '.toolArgs // .params // .tool_input // {}' 2>/dev/null || echo "{}")

# Skip telemetry-related tools to avoid recursion
if [[ "$TOOL_NAME" == *"telemetry"* ]]; then
    exit 0
fi

NOW=$(date -Iseconds)
NOW_MS=$(date +%s%3N 2>/dev/null || echo "$(date +%s)000")

# Generate correlation ID
CORR_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "corr-$(date +%s)")

# Store correlation ID for end event pairing
CORR_FILE="$HOME/.copilot/tool-correlation-${TOOL_NAME//[^a-zA-Z0-9]/_}.queue"
echo "$CORR_ID:$NOW_MS" >> "$CORR_FILE"

# Summarize parameters (avoid full file content)
PARAMS_SUMMARY=$(echo "$TOOL_INPUT" | jq -c 'if type == "string" then (. | fromjson? // {}) else . end | to_entries | map({key: .key, value: (if .value | type == "string" then (if (.value | length) > 100 then "[" + (.value | length | tostring) + " chars]" else .value end) else .value end)}) | from_entries' 2>/dev/null || echo "{}")

EVENT=$(jq -n \
    --arg sessionId "$SESSION_ID" \
    --arg event "start" \
    --arg toolName "$TOOL_NAME" \
    --arg correlationId "$CORR_ID" \
    --argjson params "$PARAMS_SUMMARY" \
    --arg timestamp "$NOW" \
    '{sessionId: $sessionId, event: $event, toolName: $toolName, correlationId: $correlationId, params: $params, timestamp: $timestamp}')

echo "$EVENT" >> "$QUEUE_FILE"
echo "[$(date -Iseconds)] Queued tool_start: $TOOL_NAME (corr: $CORR_ID)" >> "$LOG_FILE"

exit 0
HOOK_EOF
chmod +x "$HOOKS_TARGET/log-tool-start.sh"
echo -e "${GREEN}Created: log-tool-start.sh${NC}"

# --- Hook 5: enforce-state-before-write.sh (preToolUse) ---
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

# --- Hook 6: log-tool-end.sh (postToolUse) ---
cat > "$HOOKS_TARGET/log-tool-end.sh" << 'HOOK_EOF'
#!/bin/bash
# log-tool-end.sh — postToolUse hook for telemetry
# Pairs with tool start, calculates duration, records completion.
set -e

PROJECT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
TELEMETRY_FILE="$PROJECT_DIR/.claude/telemetry-session.json"
if [[ ! -f "$TELEMETRY_FILE" ]]; then
    exit 0
fi

SESSION_ID=$(jq -r '.sessionId // ""' "$TELEMETRY_FILE" 2>/dev/null || echo "")
if [[ -z "$SESSION_ID" ]]; then
    exit 0
fi

LOG_FILE="$HOME/.copilot/telemetry.log"
QUEUE_FILE="$HOME/.copilot/telemetry-queue.jsonl"
mkdir -p "$(dirname "$QUEUE_FILE")"

INPUT=$(cat 2>/dev/null || echo "{}")

# Dual-format fallback
TOOL_NAME=$(echo "$INPUT" | jq -r '.toolName // .tool_name // .tool // ""' 2>/dev/null || echo "unknown")

# Skip telemetry-related tools
if [[ "$TOOL_NAME" == *"telemetry"* ]]; then
    exit 0
fi

NOW=$(date -Iseconds)
NOW_MS=$(date +%s%3N 2>/dev/null || echo "$(date +%s)000")

# Retrieve correlation ID (FIFO queue)
CORR_FILE="$HOME/.copilot/tool-correlation-${TOOL_NAME//[^a-zA-Z0-9]/_}.queue"
CORR_LOCK="$HOME/.copilot/tool-correlation-${TOOL_NAME//[^a-zA-Z0-9]/_}.lock"
CORR_ID=""
START_MS="0"

if [[ -f "$CORR_FILE" ]] && [[ -s "$CORR_FILE" ]]; then
    (
        flock -x 200 2>/dev/null || true
        if [[ -s "$CORR_FILE" ]]; then
            CORR_DATA=$(head -1 "$CORR_FILE" 2>/dev/null || echo "")
            if [[ -n "$CORR_DATA" ]]; then
                echo "$CORR_DATA" > "$CORR_FILE.data"
                tail -n +2 "$CORR_FILE" > "$CORR_FILE.tmp" 2>/dev/null && mv "$CORR_FILE.tmp" "$CORR_FILE" || rm -f "$CORR_FILE"
                [[ -f "$CORR_FILE" ]] && [[ ! -s "$CORR_FILE" ]] && rm -f "$CORR_FILE"
            fi
        fi
    ) 200>"$CORR_LOCK"

    if [[ -f "$CORR_FILE.data" ]]; then
        CORR_DATA=$(cat "$CORR_FILE.data")
        rm -f "$CORR_FILE.data"
        CORR_ID=$(echo "$CORR_DATA" | cut -d: -f1)
        START_MS=$(echo "$CORR_DATA" | cut -d: -f2)
    fi
    rm -f "$CORR_LOCK"
fi

# Calculate duration
if [[ -z "$START_MS" || "$START_MS" == "0" || ! "$START_MS" =~ ^[0-9]+$ ]]; then
    DURATION_MS=0
else
    DURATION_MS=$((NOW_MS - START_MS))
    [[ $DURATION_MS -lt 0 ]] && DURATION_MS=0
fi

RESULT=$(echo "$INPUT" | jq -r '.result // ""' 2>/dev/null || echo "")
RESULT_SUMMARY=$(echo "$RESULT" | head -c 500)

EVENT=$(jq -n \
    --arg sessionId "$SESSION_ID" \
    --arg event "end" \
    --arg toolName "$TOOL_NAME" \
    --arg correlationId "$CORR_ID" \
    --argjson durationMs "$DURATION_MS" \
    --argjson success "true" \
    --arg result "$RESULT_SUMMARY" \
    --arg timestamp "$NOW" \
    '{sessionId: $sessionId, event: $event, toolName: $toolName, correlationId: $correlationId, durationMs: $durationMs, success: $success, result: $result, timestamp: $timestamp}')

echo "$EVENT" >> "$QUEUE_FILE"
echo "[$(date -Iseconds)] Queued tool_end: $TOOL_NAME (${DURATION_MS}ms, success: true)" >> "$LOG_FILE"

exit 0
HOOK_EOF
chmod +x "$HOOKS_TARGET/log-tool-end.sh"
echo -e "${GREEN}Created: log-tool-end.sh${NC}"

# --- Hook 7: log-tool-failure.sh (errorOccurred) ---
cat > "$HOOKS_TARGET/log-tool-failure.sh" << 'HOOK_EOF'
#!/bin/bash
# log-tool-failure.sh — errorOccurred hook for telemetry
# Records tool failures with error details and duration.
set -e

PROJECT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
TELEMETRY_FILE="$PROJECT_DIR/.claude/telemetry-session.json"
if [[ ! -f "$TELEMETRY_FILE" ]]; then
    exit 0
fi

SESSION_ID=$(jq -r '.sessionId // ""' "$TELEMETRY_FILE" 2>/dev/null || echo "")
if [[ -z "$SESSION_ID" ]]; then
    exit 0
fi

LOG_FILE="$HOME/.copilot/telemetry.log"
QUEUE_FILE="$HOME/.copilot/telemetry-queue.jsonl"
mkdir -p "$(dirname "$QUEUE_FILE")"

INPUT=$(cat 2>/dev/null || echo "{}")

# Dual-format fallback
TOOL_NAME=$(echo "$INPUT" | jq -r '.toolName // .tool_name // .tool // ""' 2>/dev/null || echo "unknown")

# Skip telemetry-related tools
if [[ "$TOOL_NAME" == *"telemetry"* ]]; then
    exit 0
fi

NOW=$(date -Iseconds)
NOW_MS=$(date +%s%3N 2>/dev/null || echo "$(date +%s)000")

# Retrieve correlation ID (FIFO queue)
CORR_FILE="$HOME/.copilot/tool-correlation-${TOOL_NAME//[^a-zA-Z0-9]/_}.queue"
CORR_LOCK="$HOME/.copilot/tool-correlation-${TOOL_NAME//[^a-zA-Z0-9]/_}.lock"
CORR_ID=""
START_MS="0"

if [[ -f "$CORR_FILE" ]] && [[ -s "$CORR_FILE" ]]; then
    (
        flock -x 200 2>/dev/null || true
        if [[ -s "$CORR_FILE" ]]; then
            CORR_DATA=$(head -1 "$CORR_FILE" 2>/dev/null || echo "")
            if [[ -n "$CORR_DATA" ]]; then
                echo "$CORR_DATA" > "$CORR_FILE.data"
                tail -n +2 "$CORR_FILE" > "$CORR_FILE.tmp" 2>/dev/null && mv "$CORR_FILE.tmp" "$CORR_FILE" || rm -f "$CORR_FILE"
                [[ -f "$CORR_FILE" ]] && [[ ! -s "$CORR_FILE" ]] && rm -f "$CORR_FILE"
            fi
        fi
    ) 200>"$CORR_LOCK"

    if [[ -f "$CORR_FILE.data" ]]; then
        CORR_DATA=$(cat "$CORR_FILE.data")
        rm -f "$CORR_FILE.data"
        CORR_ID=$(echo "$CORR_DATA" | cut -d: -f1)
        START_MS=$(echo "$CORR_DATA" | cut -d: -f2)
    fi
    rm -f "$CORR_LOCK"
fi

# Calculate duration
if [[ -z "$START_MS" || "$START_MS" == "0" || ! "$START_MS" =~ ^[0-9]+$ ]]; then
    DURATION_MS=0
else
    DURATION_MS=$((NOW_MS - START_MS))
    [[ $DURATION_MS -lt 0 ]] && DURATION_MS=0
fi

ERROR=$(echo "$INPUT" | jq -r '.error // .message // ""' 2>/dev/null || echo "")
ERROR_MSG=$(echo "$ERROR" | head -c 500)

EVENT=$(jq -n \
    --arg sessionId "$SESSION_ID" \
    --arg event "end" \
    --arg toolName "$TOOL_NAME" \
    --arg correlationId "$CORR_ID" \
    --argjson durationMs "$DURATION_MS" \
    --argjson success "false" \
    --arg error "$ERROR_MSG" \
    --arg timestamp "$NOW" \
    '{sessionId: $sessionId, event: $event, toolName: $toolName, correlationId: $correlationId, durationMs: $durationMs, success: $success, error: $error, timestamp: $timestamp}')

echo "$EVENT" >> "$QUEUE_FILE"
echo "[$(date -Iseconds)] Queued tool_end: $TOOL_NAME (${DURATION_MS}ms, success: false, error: $ERROR_MSG)" >> "$LOG_FILE"

exit 0
HOOK_EOF
chmod +x "$HOOKS_TARGET/log-tool-failure.sh"
echo -e "${GREEN}Created: log-tool-failure.sh${NC}"

# --- Create hooks.json config ---
echo ""
echo -e "${YELLOW}Creating hooks config...${NC}"

if [ -f "$HOOKS_CONFIG" ]; then
    if grep -q "start-telemetry" "$HOOKS_CONFIG"; then
        echo -e "${YELLOW}Existing hooks.json already has telemetry hooks. Updating...${NC}"
    fi
fi

cat > "$HOOKS_CONFIG" << HOOKS_JSON_EOF
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      { "type": "command", "bash": "$HOME/.copilot/hooks/start-telemetry.sh" }
    ],
    "preToolUse": [
      { "type": "command", "bash": "$HOME/.copilot/hooks/log-tool-start.sh" },
      { "type": "command", "bash": "$HOME/.copilot/hooks/enforce-state-before-write.sh" }
    ],
    "postToolUse": [
      { "type": "command", "bash": "$HOME/.copilot/hooks/log-tool-end.sh" }
    ],
    "sessionEnd": [
      { "type": "command", "bash": "$HOME/.copilot/hooks/end-telemetry.sh" }
    ],
    "userPromptSubmitted": [
      { "type": "command", "bash": "$HOME/.copilot/hooks/log-prompt.sh" }
    ],
    "errorOccurred": [
      { "type": "command", "bash": "$HOME/.copilot/hooks/log-tool-failure.sh" }
    ]
  }
}
HOOKS_JSON_EOF
echo -e "${GREEN}✓ Created hooks.json with 6 event types${NC}"

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
echo "    • inception - Start new projects"
echo "    • code-reviewer - Automated code review"
echo "    • silent-failure-hunter - Find error handling issues"
echo "    • code-simplifier - Simplify and refine code"
echo "    • context7-library-compliance - Verify library usage"
echo "    • react-best-practices - React/Next.js patterns"
echo "    • cruft-detector - Find unnecessary code"
echo "    • senior-engineer - Synthesize review findings"
echo ""
echo -e "  ${GREEN}Skills (~/.copilot/skills/):${NC}"
echo "    • brain-dump-tickets - Ticket management workflows"
echo "    • brain-dump-workflow - Universal quality workflow"
echo "    • ralph-workflow - Autonomous workflow patterns"
echo "    • review / review-aggregation - Code review pipeline"
echo "    • tanstack-* - TanStack library patterns (errors, forms, mutations, query, types)"
echo ""
echo -e "  ${GREEN}Hooks (~/.copilot/hooks/):${NC}"
echo "    • start-telemetry.sh - Track session start (sessionStart)"
echo "    • end-telemetry.sh - Track session end (sessionEnd)"
echo "    • log-prompt.sh - Track user prompts (userPromptSubmitted)"
echo "    • log-tool-start.sh - Track tool start (preToolUse)"
echo "    • log-tool-end.sh - Track tool completion (postToolUse)"
echo "    • log-tool-failure.sh - Track tool errors (errorOccurred)"
echo "    • enforce-state-before-write.sh - Ralph state enforcement (preToolUse)"
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
echo "    copilot --allow-tool 'brain-dump(*)'"
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
echo "  1. Start a new Copilot CLI session to load MCP server and hooks"
echo "  2. In your repo, use: @ralph or ask about Brain Dump tickets"
echo "  3. Hooks will automatically track telemetry and enforce workflow"
echo ""
echo -e "${YELLOW}Note:${NC} Make sure Brain Dump's MCP server is built:"
echo "  cd $BRAIN_DUMP_DIR && pnpm build"
echo ""
