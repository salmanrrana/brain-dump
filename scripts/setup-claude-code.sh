#!/bin/bash
# Brain Dump Claude Code Setup Script
# Configures Claude Code to use Brain Dump's MCP server, agents, hooks, and commands
#
# This script:
# 1. Configures the Brain Dump MCP server in ~/.claude.json
# 2. Installs required plugins (pr-review-toolkit, code-simplifier, context7)
# 3. Copies agents, commands, hooks, and skills to ~/.claude/
# 4. Configures hooks in ~/.claude/settings.json
#
# After running, Brain Dump tools and auto-review will be available in all Claude Code sessions.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║       Brain Dump - Claude Code Setup                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAIN_DUMP_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${YELLOW}Brain Dump location:${NC} $BRAIN_DUMP_DIR"

# Claude Code config files
CLAUDE_SETTINGS="$HOME/.claude/settings.json"
GLOBAL_CLAUDE_DIR="$HOME/.claude"

# Source directories in brain-dump
SOURCE_AGENTS="$BRAIN_DUMP_DIR/.claude/agents"
SOURCE_COMMANDS="$BRAIN_DUMP_DIR/.claude/commands"
SOURCE_HOOKS="$BRAIN_DUMP_DIR/.claude/hooks"
SOURCE_SKILLS="$BRAIN_DUMP_DIR/.claude/skills"

echo ""
echo -e "${BLUE}Step 1: Configure MCP Server${NC}"
echo "─────────────────────────────"

if [ -f "$CLAUDE_CONFIG" ]; then
    echo -e "${YELLOW}Existing ~/.claude.json found.${NC}"

    if grep -q '"brain-dump"' "$CLAUDE_CONFIG"; then
        echo -e "${GREEN}✓ Brain Dump MCP server already configured${NC}"
        # Also check if it points to dist or index.js and update if needed
        if grep -q 'mcp-server/dist/index.js' "$CLAUDE_CONFIG"; then
            echo -e "${YELLOW}Updating MCP server path (dist → direct)...${NC}"
            if command -v sed >/dev/null 2>&1; then
                sed -i.bak 's|mcp-server/dist/index\.js|mcp-server/index.js|g' "$CLAUDE_CONFIG"
                echo -e "${GREEN}✓ MCP server path updated${NC}"
            fi
        fi
    else
        echo -e "${YELLOW}Brain Dump MCP server not found in ~/.claude.json${NC}"
        echo -e "${YELLOW}Please use: claude mcp add brain-dump -- node $BRAIN_DUMP_DIR/mcp-server/index.js${NC}"
    fi
else
    echo "Creating ~/.claude.json..."
    cat > "$CLAUDE_CONFIG" << EOF
{
  "mcpServers": {
    "brain-dump": {
      "command": "node",
      "args": ["$BRAIN_DUMP_DIR/mcp-server/index.js"]
    }
  }
}
EOF
    echo -e "${GREEN}✓ Created $CLAUDE_CONFIG${NC}"
fi

echo ""
echo -e "${BLUE}Step 2: Install Required Plugins${NC}"
echo "──────────────────────────────────"

# Check if claude CLI is available
if command -v claude &> /dev/null; then
    echo "Installing pr-review-toolkit plugin..."
    claude plugins install pr-review-toolkit 2>/dev/null || echo -e "${YELLOW}pr-review-toolkit already installed or install failed${NC}"

    echo "Installing code-simplifier plugin..."
    claude plugins install code-simplifier 2>/dev/null || echo -e "${YELLOW}code-simplifier already installed or install failed${NC}"

    echo "Installing context7 plugin..."
    claude plugins install context7 2>/dev/null || echo -e "${YELLOW}context7 already installed or install failed${NC}"

    echo -e "${GREEN}Plugins configured.${NC}"
else
    echo -e "${YELLOW}Claude CLI not found. Please install plugins manually:${NC}"
    echo "  claude plugins install pr-review-toolkit"
    echo "  claude plugins install code-simplifier"
    echo "  claude plugins install context7"
fi

echo ""
echo -e "${BLUE}Step 3: Copy Agents to Global Location${NC}"
echo "────────────────────────────────────────"

mkdir -p "$GLOBAL_CLAUDE_DIR/agents"

if [ -d "$SOURCE_AGENTS" ]; then
    echo "Copying agents from brain-dump to ~/.claude/agents/..."
    cp -v "$SOURCE_AGENTS"/*.md "$GLOBAL_CLAUDE_DIR/agents/" 2>/dev/null || true
    echo -e "${GREEN}Agents installed:${NC}"
    ls "$GLOBAL_CLAUDE_DIR/agents"/*.md 2>/dev/null | xargs -I {} basename {} | sed 's/^/  • /'
else
    echo -e "${YELLOW}No agents directory found in brain-dump.${NC}"
fi

echo ""
echo -e "${BLUE}Step 4: Copy Commands to Global Location${NC}"
echo "──────────────────────────────────────────"

mkdir -p "$GLOBAL_CLAUDE_DIR/commands"

if [ -d "$SOURCE_COMMANDS" ]; then
    echo "Copying commands from brain-dump to ~/.claude/commands/..."
    cp -v "$SOURCE_COMMANDS"/*.md "$GLOBAL_CLAUDE_DIR/commands/" 2>/dev/null || true
    echo -e "${GREEN}Commands installed:${NC}"
    ls "$GLOBAL_CLAUDE_DIR/commands"/*.md 2>/dev/null | xargs -I {} basename {} | sed 's/^/  • /'
else
    echo -e "${YELLOW}No commands directory found in brain-dump.${NC}"
fi

echo ""
echo -e "${BLUE}Step 5: Copy Hooks to Global Location${NC}"
echo "───────────────────────────────────────"

mkdir -p "$GLOBAL_CLAUDE_DIR/hooks"

if [ -d "$SOURCE_HOOKS" ]; then
    echo "Copying hook scripts from brain-dump to ~/.claude/hooks/..."
    cp -v "$SOURCE_HOOKS"/*.sh "$GLOBAL_CLAUDE_DIR/hooks/" 2>/dev/null || true
    cp -v "$SOURCE_HOOKS"/*.cjs "$GLOBAL_CLAUDE_DIR/hooks/" 2>/dev/null || true
    cp -v "$SOURCE_HOOKS"/*.md "$GLOBAL_CLAUDE_DIR/hooks/" 2>/dev/null || true
    cp -v "$SOURCE_HOOKS"/*.json "$GLOBAL_CLAUDE_DIR/hooks/" 2>/dev/null || true
    chmod +x "$GLOBAL_CLAUDE_DIR/hooks"/*.sh 2>/dev/null || true
    echo -e "${GREEN}Hook scripts installed:${NC}"
    ls "$GLOBAL_CLAUDE_DIR/hooks"/*.sh 2>/dev/null | xargs -I {} basename {} | sed 's/^/  • /'
else
    echo -e "${YELLOW}No hooks directory found in brain-dump.${NC}"
fi

echo ""
echo -e "${BLUE}Step 6: Copy Skills to Global Location${NC}"
echo "────────────────────────────────────────"

mkdir -p "$GLOBAL_CLAUDE_DIR/skills"

if [ -d "$SOURCE_SKILLS" ]; then
    echo "Copying skills from brain-dump to ~/.claude/skills/..."
    cp -rv "$SOURCE_SKILLS"/* "$GLOBAL_CLAUDE_DIR/skills/" 2>/dev/null || true
    echo -e "${GREEN}Skills installed:${NC}"
    ls -d "$GLOBAL_CLAUDE_DIR/skills"/*/ 2>/dev/null | xargs -I {} basename {} | sed 's/^/  • /'
else
    echo -e "${YELLOW}No skills directory found in brain-dump.${NC}"
fi

echo ""
echo -e "${BLUE}Step 7: Configure Hooks in Settings${NC}"
echo "──────────────────────────────────────"

# Create or update ~/.claude/settings.json with hooks configuration
HOOKS_DIR="$GLOBAL_CLAUDE_DIR/hooks"

if [ -f "$CLAUDE_SETTINGS" ]; then
    echo -e "${YELLOW}Existing ~/.claude/settings.json found.${NC}"

    if grep -q '"hooks"' "$CLAUDE_SETTINGS"; then
        echo -e "${GREEN}Hooks section already exists in settings.json${NC}"

        # Check if hooks use old $CLAUDE_PROJECT_DIR paths and update them
        if grep -q 'CLAUDE_PROJECT_DIR' "$CLAUDE_SETTINGS"; then
            echo -e "${YELLOW}Updating hook paths from \$CLAUDE_PROJECT_DIR to \$HOME/.claude/hooks/...${NC}"
            # Use sed to replace the old paths with new global paths
            sed -i.bak 's|"\$CLAUDE_PROJECT_DIR"/.claude/hooks/|\$HOME/.claude/hooks/|g' "$CLAUDE_SETTINGS"
            sed -i.bak 's|"\\$CLAUDE_PROJECT_DIR"/.claude/hooks/|$HOME/.claude/hooks/|g' "$CLAUDE_SETTINGS"
            rm -f "$CLAUDE_SETTINGS.bak"
            echo -e "${GREEN}Hook paths updated to use global ~/.claude/hooks/${NC}"
        else
            echo -e "${GREEN}Hook paths already use global paths${NC}"
        fi

        # Ensure telemetry hooks are configured (idempotent merge)
        echo ""
        echo -e "${YELLOW}Verifying telemetry hooks are configured...${NC}"
        if [ -f "$SOURCE_HOOKS/merge-telemetry-hooks.sh" ]; then
            bash "$SOURCE_HOOKS/merge-telemetry-hooks.sh"
        else
            echo -e "${YELLOW}Warning: merge-telemetry-hooks.sh not found. Telemetry hooks may not be configured.${NC}"
        fi
    else
        echo -e "${YELLOW}No hooks section found. Please add hooks manually or backup and recreate.${NC}"
    fi
else
    echo "Creating ~/.claude/settings.json with hooks configuration..."
    cat > "$CLAUDE_SETTINGS" << EOF
{
  "\$schema": "https://json.schemastore.org/claude-code-settings.json",
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\$HOME/.claude/hooks/start-telemetry-session.sh"
          },
          {
            "type": "command",
            "command": "\$HOME/.claude/hooks/check-pending-links.sh"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\$HOME/.claude/hooks/log-tool-start.sh"
          }
        ]
      },
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "\$HOME/.claude/hooks/enforce-state-before-write.sh"
          }
        ]
      },
      {
        "matcher": "Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\$HOME/.claude/hooks/enforce-state-before-write.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\$HOME/.claude/hooks/log-tool-end.sh"
          }
        ]
      },
      {
        "matcher": "mcp__brain-dump__start_ticket_work",
        "hooks": [
          {
            "type": "command",
            "command": "\$HOME/.claude/hooks/create-pr-on-ticket-start.sh"
          }
        ]
      },
      {
        "matcher": "Bash(git commit:*)",
        "hooks": [
          {
            "type": "command",
            "command": "\$HOME/.claude/hooks/link-commit-to-ticket.sh"
          }
        ]
      },
      {
        "matcher": "mcp__brain-dump__update_session_state",
        "hooks": [
          {
            "type": "command",
            "command": "\$HOME/.claude/hooks/record-state-change.sh"
          }
        ]
      },
      {
        "matcher": "mcp__brain-dump__create_ralph_session",
        "hooks": [
          {
            "type": "command",
            "command": "\$HOME/.claude/hooks/record-state-change.sh"
          }
        ]
      },
      {
        "matcher": "mcp__brain-dump__complete_ralph_session",
        "hooks": [
          {
            "type": "command",
            "command": "\$HOME/.claude/hooks/record-state-change.sh"
          }
        ]
      },
      {
        "matcher": "mcp__brain-dump__complete_ticket_work",
        "hooks": [
          {
            "type": "command",
            "command": "\$HOME/.claude/hooks/spawn-next-ticket.sh"
          }
        ]
      },
      {
        "matcher": "mcp__brain-dump__sync_ticket_links",
        "hooks": [
          {
            "type": "command",
            "command": "\$HOME/.claude/hooks/clear-pending-links.sh"
          }
        ]
      },
      {
        "matcher": "TodoWrite",
        "hooks": [
          {
            "type": "command",
            "command": "\$HOME/.claude/hooks/capture-claude-tasks.sh"
          }
        ]
      }
    ],
    "PostToolUseFailure": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\$HOME/.claude/hooks/log-tool-failure.sh"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\$HOME/.claude/hooks/log-prompt.sh"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\$HOME/.claude/hooks/end-telemetry-session.sh"
          },
          {
            "type": "command",
            "command": "\$HOME/.claude/hooks/check-for-code-changes.sh"
          }
        ]
      }
    ]
  }
}
EOF
    echo -e "${GREEN}Created $CLAUDE_SETTINGS${NC}"
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
echo "  ${GREEN}Plugins:${NC}"
echo "    • pr-review-toolkit (code review agents)"
echo "    • code-simplifier (code refinement)"
echo "    • context7 (library documentation)"
echo ""
echo "  ${GREEN}Agents (~/.claude/agents/):${NC}"
echo "    • inception - Start new projects"
echo "    • breakdown - Break features into tickets"
echo "    • context7-library-compliance - Verify library usage"
echo "    • react-best-practices - React/Next.js patterns"
echo "    • cruft-detector - Find unnecessary code"
echo "    • senior-engineer - Synthesize review findings"
echo ""
echo "  ${GREEN}Commands (~/.claude/commands/):${NC}"
echo "    • /review - Run initial code review (3 agents)"
echo "    • /extended-review - Run extended review (4 agents)"
echo "    • /inception - Start new project"
echo "    • /breakdown - Break down features"
echo "    • /next-task - Pick up next ticket with precondition checking"
echo "    • /review-ticket - Run AI review on current ticket"
echo "    • /review-epic - Run comprehensive Tracer Review on epic"
echo "    • /demo - Generate demo script for human review"
echo "    • /reconcile-learnings - Extract and apply learnings"
echo ""
echo "  ${GREEN}Hooks (~/.claude/hooks/):${NC}"
echo "    • Auto-review after code changes"
echo "    • State enforcement for Ralph workflow"
echo "    • Commit linking to tickets"
echo "    • Auto-PR creation on ticket start"
echo "    • Claude task capture (auto-sync TodoWrite to Brain Dump)"
echo "    • Telemetry capture (session tracking, tool usage, prompts)"
echo ""
echo "  ${GREEN}Skills (~/.claude/skills/):${NC}"
echo "    • review-aggregation - Combine review findings"
echo "    • tanstack-* - TanStack library patterns"
echo ""
echo -e "${BLUE}Review Pipeline:${NC}"
echo "  /review runs: code-reviewer → silent-failure-hunter → code-simplifier"
echo "  /extended-review runs: context7 → react-best-practices → cruft-detector → senior-engineer"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Restart any running Claude Code sessions"
echo "  2. Open Brain Dump and click 'Start with Claude' or 'Start with Ralph'"
echo "  3. Or use MCP tools directly: claude 'List all my projects'"
echo ""
echo -e "${YELLOW}Note:${NC} Make sure Brain Dump is running at least once to initialize the database."
echo ""
