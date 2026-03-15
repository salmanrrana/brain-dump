#!/bin/bash
# Brain Dump Claude Code Setup Script
# Configures Claude Code to use Brain Dump's MCP server, agents, hooks, and commands
#
# This script:
# 1. Configures the Brain Dump MCP server in ~/.claude.json
# 2. Installs required plugins (pr-review-toolkit, code-simplifier, context7)
# 3. Copies commands, hooks, and skills to ~/.claude/
# 4. Configures hooks in ~/.claude/settings.json
# Note: Agent personas are inlined into commands (no separate agent files needed)
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
SOURCE_COMMANDS="$BRAIN_DUMP_DIR/.claude/commands"
SOURCE_HOOKS="$BRAIN_DUMP_DIR/.claude/hooks"
SOURCE_SKILLS="$BRAIN_DUMP_DIR/.claude/skills"

echo ""
echo -e "${BLUE}Step 0: Build MCP Server${NC}"
echo "─────────────────────────"

if [ -f "$BRAIN_DUMP_DIR/mcp-server/build.mjs" ]; then
    echo "Building MCP server from TypeScript source..."
    if (cd "$BRAIN_DUMP_DIR/mcp-server" && pnpm install --frozen-lockfile 2>/dev/null || pnpm install && pnpm build) 2>&1 | tail -3; then
        echo -e "${GREEN}✓ MCP server built successfully${NC}"
    else
        echo -e "${RED}✗ MCP server build failed${NC}"
        exit 1
    fi
else
    echo -e "${RED}✗ build.mjs not found in mcp-server/${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}Step 1: Configure MCP Server${NC}"
echo "─────────────────────────────"

if command -v claude &> /dev/null; then
    # Check if brain-dump MCP is already configured
    if claude mcp get brain-dump &>/dev/null; then
        echo -e "${YELLOW}Existing brain-dump MCP server found. Removing to reconfigure...${NC}"
        claude mcp remove brain-dump 2>/dev/null || true
    fi
    echo "Adding brain-dump MCP server via CLI..."
    claude mcp add --transport stdio brain-dump -- node "$BRAIN_DUMP_DIR/mcp-server/dist/index.js"
    echo -e "${GREEN}✓ Brain Dump MCP server configured${NC}"
else
    echo -e "${YELLOW}Claude CLI not found. Please add MCP server manually:${NC}"
    echo "  claude mcp add --transport stdio brain-dump -- node $BRAIN_DUMP_DIR/mcp-server/dist/index.js"
fi

echo ""
echo -e "${BLUE}Step 2: Install Required Plugins${NC}"
echo "──────────────────────────────────"

# Check if claude CLI is available
if command -v claude &> /dev/null; then
    echo "Installing pr-review-toolkit plugin..."
    claude plugin install pr-review-toolkit 2>/dev/null || echo -e "${YELLOW}pr-review-toolkit already installed or install failed${NC}"

    echo "Installing code-simplifier plugin..."
    claude plugin install code-simplifier 2>/dev/null || echo -e "${YELLOW}code-simplifier already installed or install failed${NC}"

    echo "Installing context7 plugin..."
    claude plugin install context7 2>/dev/null || echo -e "${YELLOW}context7 already installed or install failed${NC}"

    echo -e "${GREEN}Plugins configured.${NC}"
else
    echo -e "${YELLOW}Claude CLI not found. Please install plugins manually:${NC}"
    echo "  claude plugin install pr-review-toolkit"
    echo "  claude plugin install code-simplifier"
    echo "  claude plugin install context7"
fi

echo ""
echo -e "${BLUE}Step 3: Copy Commands to Global Location${NC}"
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
echo -e "${BLUE}Step 4: Copy Hooks to Global Location${NC}"
echo "───────────────────────────────────────"

mkdir -p "$GLOBAL_CLAUDE_DIR/hooks"

if [ -d "$SOURCE_HOOKS" ]; then
    echo "Copying hook scripts from brain-dump to ~/.claude/hooks/..."
    cp -v "$SOURCE_HOOKS"/*.sh "$GLOBAL_CLAUDE_DIR/hooks/" 2>/dev/null || true
    cp -v "$SOURCE_HOOKS"/*.cjs "$GLOBAL_CLAUDE_DIR/hooks/" 2>/dev/null || true
    cp -v "$SOURCE_HOOKS"/*.md "$GLOBAL_CLAUDE_DIR/hooks/" 2>/dev/null || true
    cp -v "$SOURCE_HOOKS"/*.json "$GLOBAL_CLAUDE_DIR/hooks/" 2>/dev/null || true
    chmod +x "$GLOBAL_CLAUDE_DIR/hooks"/*.sh 2>/dev/null || true
    # Copy parser script alongside hooks so capture-token-usage.sh can find it globally
    if [ -f "$BRAIN_DUMP_DIR/scripts/parse-transcript-tokens.ts" ]; then
        cp -v "$BRAIN_DUMP_DIR/scripts/parse-transcript-tokens.ts" "$GLOBAL_CLAUDE_DIR/hooks/" 2>/dev/null || true
        echo -e "  ${GREEN}✓${NC} parse-transcript-tokens.ts (token usage parser)"
    fi
    echo -e "${GREEN}Hook scripts installed:${NC}"
    ls "$GLOBAL_CLAUDE_DIR/hooks"/*.sh 2>/dev/null | xargs -I {} basename {} | sed 's/^/  • /'
else
    echo -e "${YELLOW}No hooks directory found in brain-dump.${NC}"
fi

echo ""
echo -e "${BLUE}Step 5: Copy Global Skills${NC}"
echo "───────────────────────────"

mkdir -p "$GLOBAL_CLAUDE_DIR/skills"

# Only install universally-relevant skills globally.
# Project-specific skills (react-best-practices, tanstack-*, web-design-guidelines)
# live in each project's .claude/skills/ directory instead.
GLOBAL_SKILLS=("brain-dump-workflow" "review" "review-aggregation")

if [ -d "$SOURCE_SKILLS" ]; then
    echo "Installing global skills to ~/.claude/skills/..."
    for skill in "${GLOBAL_SKILLS[@]}"; do
        if [ -d "$SOURCE_SKILLS/$skill" ]; then
            rm -rf "$GLOBAL_CLAUDE_DIR/skills/$skill"
            cp -r "$SOURCE_SKILLS/$skill" "$GLOBAL_CLAUDE_DIR/skills/$skill"
            echo -e "  ${GREEN}✓${NC} $skill"
        else
            echo -e "  ${YELLOW}⚠${NC} $skill not found in source"
        fi
    done

    # Clean up project-specific skills that were previously installed globally
    PROJECT_SPECIFIC_SKILLS=("react-best-practices" "web-design-guidelines" "tanstack-query" "tanstack-mutations" "tanstack-types" "tanstack-errors" "tanstack-forms")
    for skill in "${PROJECT_SPECIFIC_SKILLS[@]}"; do
        if [ -d "$GLOBAL_CLAUDE_DIR/skills/$skill" ]; then
            rm -rf "$GLOBAL_CLAUDE_DIR/skills/$skill"
            echo -e "  ${YELLOW}🧹${NC} Removed $skill from global (now project-local)"
        fi
    done

    echo -e "${GREEN}Global skills installed. Project-specific skills live in each repo's .claude/skills/${NC}"
else
    echo -e "${YELLOW}No skills directory found in brain-dump.${NC}"
fi

echo ""
echo -e "${BLUE}Step 6: Configure Hooks in Settings${NC}"
echo "──────────────────────────────────────"

# Hooks configuration — only 10 remaining hooks after MCP absorption.
# Telemetry, PR creation, state recording, and pending-link hooks are now
# handled by the MCP server itself (self-telemetry, autoPr param, etc.).

if [ -f "$CLAUDE_SETTINGS" ]; then
    echo -e "${YELLOW}Existing ~/.claude/settings.json found.${NC}"

    if grep -q '"hooks"' "$CLAUDE_SETTINGS"; then
        echo -e "${GREEN}Hooks section already exists in settings.json${NC}"

        # Clean up absorbed hooks that are no longer needed
        ABSORBED_HOOKS=(
            "start-telemetry-session.sh"
            "end-telemetry-session.sh"
            "log-tool-start.sh"
            "log-tool-end.sh"
            "log-tool-failure.sh"
            "log-tool-telemetry.sh"
            "log-prompt.sh"
            "log-prompt-telemetry.sh"
            "record-state-change.sh"
            "check-pending-links.sh"
            "clear-pending-links.sh"
            "create-pr-on-ticket-start.sh"
            "enforce-session-before-work.sh"
            "merge-telemetry-hooks.sh"
        )

        NEEDS_CLEANUP=false
        for hook in "${ABSORBED_HOOKS[@]}"; do
            if grep -q "$hook" "$CLAUDE_SETTINGS"; then
                NEEDS_CLEANUP=true
                break
            fi
        done

        if [ "$NEEDS_CLEANUP" = true ]; then
            echo -e "${YELLOW}Removing absorbed hook entries (now handled by MCP server)...${NC}"
            if command -v node &> /dev/null; then
                if CLAUDE_SETTINGS="$CLAUDE_SETTINGS" node << 'CLEANUP_EOF'
const fs = require("fs");

const settingsPath = process.env.CLAUDE_SETTINGS;
const raw = fs.readFileSync(settingsPath, "utf8");
const config = JSON.parse(raw);

const absorbed = new Set([
    "start-telemetry-session.sh",
    "end-telemetry-session.sh",
    "log-tool-start.sh",
    "log-tool-end.sh",
    "log-tool-failure.sh",
    "log-tool-telemetry.sh",
    "log-prompt.sh",
    "log-prompt-telemetry.sh",
    "record-state-change.sh",
    "check-pending-links.sh",
    "clear-pending-links.sh",
    "create-pr-on-ticket-start.sh",
    "enforce-session-before-work.sh",
    "merge-telemetry-hooks.sh",
]);

function isAbsorbed(command) {
    return [...absorbed].some(h => command.includes(h));
}

function cleanHookEntries(entries) {
    if (!Array.isArray(entries)) return entries;
    return entries
        .map(entry => {
            if (!entry.hooks) return entry;
            const kept = entry.hooks.filter(h => !isAbsorbed(h.command || ""));
            if (kept.length === 0) return null;
            return { ...entry, hooks: kept };
        })
        .filter(Boolean);
}

if (config.hooks) {
    for (const event of Object.keys(config.hooks)) {
        config.hooks[event] = cleanHookEntries(config.hooks[event]);
        if (config.hooks[event].length === 0) {
            delete config.hooks[event];
        }
    }
}

fs.writeFileSync(settingsPath, JSON.stringify(config, null, 2) + "\n");
CLEANUP_EOF
                then
                    echo -e "${GREEN}Absorbed hook entries removed from settings.json${NC}"
                else
                    echo -e "${YELLOW}Failed to clean up absorbed hooks. They reference deleted files and will be skipped.${NC}"
                fi
            else
                echo -e "${YELLOW}Node.js not available. Absorbed hooks reference deleted files and will be skipped.${NC}"
            fi
        else
            echo -e "${GREEN}No absorbed hooks found in settings.json${NC}"
        fi

        # Check if hooks use old $CLAUDE_PROJECT_DIR paths and update them
        if grep -q 'CLAUDE_PROJECT_DIR' "$CLAUDE_SETTINGS"; then
            echo -e "${YELLOW}Updating hook paths from \$CLAUDE_PROJECT_DIR to \$HOME/.claude/hooks/...${NC}"
            sed -i.bak 's|"\$CLAUDE_PROJECT_DIR"/.claude/hooks/|\$HOME/.claude/hooks/|g' "$CLAUDE_SETTINGS"
            sed -i.bak 's|"\\$CLAUDE_PROJECT_DIR"/.claude/hooks/|$HOME/.claude/hooks/|g' "$CLAUDE_SETTINGS"
            rm -f "$CLAUDE_SETTINGS.bak"
            echo -e "${GREEN}Hook paths updated to use global ~/.claude/hooks/${NC}"
        fi
    else
        echo -e "${YELLOW}No hooks section found. Adding Brain Dump hooks to existing settings.json...${NC}"

        if command -v node &> /dev/null; then
            if CLAUDE_SETTINGS="$CLAUDE_SETTINGS" node << 'EOF'
const fs = require("fs");

const settingsPath = process.env.CLAUDE_SETTINGS;
const raw = fs.readFileSync(settingsPath, "utf8");
const config = JSON.parse(raw);

config.hooks = {
  PreToolUse: [
    {
      matcher: "Write",
      hooks: [{ type: "command", command: "$HOME/.claude/hooks/enforce-state-before-write.sh" }]
    },
    {
      matcher: "Edit",
      hooks: [{ type: "command", command: "$HOME/.claude/hooks/enforce-state-before-write.sh" }]
    },
    {
      matcher: "Bash(git push:*)",
      hooks: [{ type: "command", command: "$HOME/.claude/hooks/enforce-review-before-push.sh" }]
    },
    {
      matcher: "Bash(gh pr create:*)",
      hooks: [{ type: "command", command: "$HOME/.claude/hooks/enforce-review-before-push.sh" }]
    }
  ],
  PostToolUse: [
    {
      matcher: "Bash(git commit:*)",
      hooks: [{ type: "command", command: "$HOME/.claude/hooks/link-commit-to-ticket.sh" }]
    },
    {
      matcher: "mcp__brain-dump__workflow",
      hooks: [{ type: "command", command: "$HOME/.claude/hooks/spawn-next-ticket.sh" }]
    },
    {
      matcher: "Bash(gh pr create:*)",
      hooks: [{ type: "command", command: "$HOME/.claude/hooks/spawn-after-pr.sh" }]
    },
    {
      matcher: "TodoWrite",
      hooks: [{ type: "command", command: "$HOME/.claude/hooks/capture-claude-tasks.sh" }]
    }
  ],
  SubagentStop: [
    {
      hooks: [{ type: "command", command: "$HOME/.claude/hooks/chain-extended-review.sh" }]
    }
  ],
  Stop: [
    {
      hooks: [{ type: "command", command: "$HOME/.claude/hooks/check-for-code-changes.sh" }]
    },
    {
      hooks: [{ type: "command", command: "$HOME/.claude/hooks/mark-review-completed.sh" }]
    },
    {
      hooks: [{ type: "command", command: "$HOME/.claude/hooks/capture-token-usage.sh" }]
    }
  ]
};

fs.writeFileSync(settingsPath, JSON.stringify(config, null, 2) + "\n");
EOF
            then
                echo -e "${GREEN}Hooks section added to existing settings.json${NC}"
            else
                echo -e "${YELLOW}Failed to merge hooks automatically. Please back up settings.json and re-run setup.${NC}"
            fi
        else
            echo -e "${YELLOW}Node.js not available to merge hooks automatically. Please install Node.js and re-run setup.${NC}"
        fi
    fi
else
    echo "Creating ~/.claude/settings.json with hooks configuration..."
    cat > "$CLAUDE_SETTINGS" << EOF
{
  "\$schema": "https://json.schemastore.org/claude-code-settings.json",
  "hooks": {
    "PreToolUse": [
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
      },
      {
        "matcher": "Bash(git push:*)",
        "hooks": [
          {
            "type": "command",
            "command": "\$HOME/.claude/hooks/enforce-review-before-push.sh"
          }
        ]
      },
      {
        "matcher": "Bash(gh pr create:*)",
        "hooks": [
          {
            "type": "command",
            "command": "\$HOME/.claude/hooks/enforce-review-before-push.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
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
        "matcher": "mcp__brain-dump__workflow",
        "hooks": [
          {
            "type": "command",
            "command": "\$HOME/.claude/hooks/spawn-next-ticket.sh"
          }
        ]
      },
      {
        "matcher": "Bash(gh pr create:*)",
        "hooks": [
          {
            "type": "command",
            "command": "\$HOME/.claude/hooks/spawn-after-pr.sh"
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
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\$HOME/.claude/hooks/chain-extended-review.sh"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\$HOME/.claude/hooks/check-for-code-changes.sh"
          }
        ]
      },
      {
        "hooks": [
          {
            "type": "command",
            "command": "\$HOME/.claude/hooks/mark-review-completed.sh"
          }
        ]
      },
      {
        "hooks": [
          {
            "type": "command",
            "command": "\$HOME/.claude/hooks/capture-token-usage.sh"
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
echo -e "  ${GREEN}MCP Server:${NC}"
echo "    • brain-dump (ticket management tools)"
echo ""
echo -e "  ${GREEN}Plugins:${NC}"
echo "    • pr-review-toolkit (code review agents)"
echo "    • code-simplifier (code refinement)"
echo "    • context7 (library documentation)"
echo ""
echo -e "  ${GREEN}Commands (~/.claude/commands/):${NC}"
echo "    • /review - Run initial code review (3 agents)"
echo "    • /extended-review - Run extended review (4 inlined agent personas)"
echo "    • /inception - Start new project (agent persona inlined)"
echo "    • /breakdown - Break down features (agent persona inlined)"
echo "    • /next-task - Pick up next ticket with precondition checking"
echo "    • /review-ticket - Run AI review on current ticket"
echo "    • /review-epic - Run comprehensive Tracer Review on epic"
echo "    • /demo - Generate demo script for human review"
echo "    • /reconcile-learnings - Extract and apply learnings"
echo ""
echo -e "  ${GREEN}Hooks (~/.claude/hooks/) — 11 hooks:${NC}"
echo "    • State enforcement for Ralph workflow (enforce-state-before-write)"
echo "    • Review gating before push (enforce-review-before-push)"
echo "    • Commit linking to tickets (link-commit-to-ticket)"
echo "    • Auto-review after code changes (check-for-code-changes)"
echo "    • Claude task capture (capture-claude-tasks)"
echo "    • Extended review chaining (chain-extended-review)"
echo "    • Next ticket spawning (spawn-next-ticket, spawn-after-pr)"
echo "    • Review completion marker (mark-review-completed)"
echo "    • Library detection (detect-libraries)"
echo "    • Token usage capture from JSONL transcripts (capture-token-usage)"
echo ""
echo -e "  ${GREEN}MCP Self-Telemetry (no hooks needed):${NC}"
echo "    • Tool call instrumentation handled by MCP server"
echo "    • PR creation via workflow start-work autoPr param"
echo "    • State recording via session update-state"
echo ""
echo -e "  ${GREEN}Global Skills (~/.claude/skills/):${NC}"
echo "    • brain-dump-workflow - Core ticket workflow"
echo "    • review - Code review pipeline"
echo "    • review-aggregation - Combine review findings"
echo ""
echo -e "  ${GREEN}Project-Local Skills (.claude/skills/):${NC}"
echo "    • react-best-practices, tanstack-*, web-design-guidelines"
echo "    • These are only available in projects that include them"
echo ""
echo -e "${BLUE}Review Pipeline:${NC}"
echo "  /review runs: code-reviewer → silent-failure-hunter → code-simplifier"
echo "  /extended-review runs: context7 → react-best-practices → cruft-detector → senior-engineer"
echo "  All agent personas are inlined into their respective commands (no separate agent files)"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Restart any running Claude Code sessions"
echo "  2. Open Brain Dump and click 'Start with Claude' or 'Start with Ralph'"
echo "  3. Or use MCP tools directly: claude 'List all my projects'"
echo ""
echo -e "${YELLOW}Note:${NC} Make sure Brain Dump is running at least once to initialize the database."
echo ""
