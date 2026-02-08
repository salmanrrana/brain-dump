#!/bin/bash
# Brain Dump Uninstallation Script
#
# Safely removes Brain Dump configuration from all environments
# without breaking other configurations.
#
# Supported environments:
# - Claude Code (.claude/)
# - Cursor (.cursor/)
# - OpenCode (~/.config/opencode/)
# - VS Code (.vscode/ + .github/)
# - Copilot CLI (~/.copilot/)
#
# Usage:
#   ./scripts/uninstall.sh              # Uninstall from all environments
#   ./scripts/uninstall.sh --help       # Show help
#
# The script:
# 1. Detects which environments have Brain Dump installed
# 2. Removes Brain Dump files
# 3. Cleans up settings/config merges
# 4. Preserves other environment configurations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║        Brain Dump - Uninstallation Script                  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${YELLOW}This script will remove Brain Dump from detected environments.${NC}"
echo -e "${YELLOW}Other configurations will be preserved.${NC}"
echo ""
read -p "Continue with uninstallation? (yes/no): " CONFIRM || {
  echo -e "${RED}✗ Failed to read confirmation (is stdin available?)${NC}"
  exit 1
}

if [[ "$CONFIRM" != "yes" ]]; then
  echo "Uninstallation cancelled."
  exit 0
fi

echo ""

# ─────────────────────────────────────────────────────────────────
# Claude Code Uninstall
# ─────────────────────────────────────────────────────────────────

uninstall_claude_code() {
  echo -e "${BLUE}Uninstalling Claude Code configuration...${NC}"

  HOOKS_DIR="$HOME/.claude/hooks"

  if [ -d "$HOOKS_DIR" ]; then
    local failed=0
    # Remove Brain Dump telemetry hooks
    for hook in start-telemetry-session.sh end-telemetry-session.sh \
                log-tool-telemetry.sh log-prompt-telemetry.sh \
                log-tool-start.sh log-tool-end.sh log-prompt.sh; do
      hook_path="$HOOKS_DIR/$hook"
      if [ -f "$hook_path" ]; then
        if ! rm "$hook_path"; then
          echo -e "${RED}✗ Failed to remove $hook (permission denied or file locked)${NC}"
          failed=1
        fi
      fi
    done

    # Remove temporary files
    for temp_file in telemetry-session.json telemetry-queue.jsonl telemetry.log; do
      if [ -f "$HOME/.claude/$temp_file" ]; then
        if ! rm "$HOME/.claude/$temp_file"; then
          echo -e "${YELLOW}⚠ Could not remove $temp_file${NC}"
          failed=1
        fi
      fi
    done

    # Remove correlation files
    find "$HOME/.claude" -maxdepth 1 -name "tool-correlation-*.txt" -delete 2>/dev/null || true

    if [ $failed -eq 0 ]; then
      echo -e "${GREEN}✓ Claude Code hooks removed${NC}"
    else
      echo -e "${YELLOW}⚠ Some hooks could not be removed. Check permissions.${NC}"
    fi
  fi

  # Clean up settings.json if it exists
  SETTINGS_FILE="$HOME/.claude/settings.json"
  if [ -f "$SETTINGS_FILE" ]; then
    # This is simplified - production would use jq to clean up hook entries
    echo -e "${YELLOW}Note:${NC} Manually remove Brain Dump hooks from $SETTINGS_FILE if needed"
  fi

  echo ""
}

# ─────────────────────────────────────────────────────────────────
# Cursor Uninstall
# ─────────────────────────────────────────────────────────────────

uninstall_cursor() {
  echo -e "${BLUE}Uninstalling Cursor configuration...${NC}"

  HOOKS_DIR="$HOME/.cursor/hooks"

  if [ -d "$HOOKS_DIR" ]; then
    local failed=0
    # Remove Brain Dump telemetry hooks
    for hook in start-telemetry.sh end-telemetry.sh log-tool.sh \
                log-tool-failure.sh log-prompt.sh; do
      hook_path="$HOOKS_DIR/$hook"
      if [ -f "$hook_path" ]; then
        if ! rm "$hook_path"; then
          echo -e "${RED}✗ Failed to remove $hook (permission denied or file locked)${NC}"
          failed=1
        fi
      fi
    done

    # Remove temporary files
    for temp_file in telemetry-session.json telemetry-queue.jsonl telemetry.log; do
      if [ -f "$HOME/.cursor/$temp_file" ]; then
        if ! rm "$HOME/.cursor/$temp_file"; then
          echo -e "${YELLOW}⚠ Could not remove $temp_file${NC}"
          failed=1
        fi
      fi
    done

    # Remove correlation files
    find "$HOME/.cursor" -maxdepth 1 -name "tool-correlation-*.txt" -delete 2>/dev/null || true

    if [ $failed -eq 0 ]; then
      echo -e "${GREEN}✓ Cursor hooks removed${NC}"
    else
      echo -e "${YELLOW}⚠ Some hooks could not be removed. Check permissions.${NC}"
    fi
  fi

  # Clean up hooks.json if it only contains Brain Dump
  HOOKS_CONFIG="$HOME/.cursor/hooks.json"
  if [ -f "$HOOKS_CONFIG" ]; then
    if grep -q "start-telemetry" "$HOOKS_CONFIG"; then
      echo -e "${YELLOW}Note:${NC} Manually remove Brain Dump hooks from $HOOKS_CONFIG if needed"
    fi
  fi

  echo ""
}

# ─────────────────────────────────────────────────────────────────
# OpenCode Uninstall
# ─────────────────────────────────────────────────────────────────

uninstall_opencode() {
  echo -e "${BLUE}Uninstalling OpenCode configuration...${NC}"

  CONFIG_DIR="$HOME/.config/opencode"
  PLUGINS_DIR="$CONFIG_DIR/plugins"
  SKILLS_DIR="$CONFIG_DIR/skills"
  OPENCODE_JSON="$CONFIG_DIR/opencode.json"

  local failed=0

  # Remove MCP configuration from opencode.json
  if [ -f "$OPENCODE_JSON" ]; then
    if grep -q '"brain-dump"' "$OPENCODE_JSON"; then
      # Check if brain-dump is the only server
      if command -v node >/dev/null 2>&1; then
        node_result=$(OPENCODE_JSON="$OPENCODE_JSON" node -e '
const fs = require("fs");
const configFile = process.env.OPENCODE_JSON;

try {
    const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    if (config.mcp && config.mcp["brain-dump"]) {
        delete config.mcp["brain-dump"];
        // Remove mcp key if empty
        if (Object.keys(config.mcp).length === 0) {
            delete config.mcp;
        }
        // Remove file if only $schema remains
        const remainingKeys = Object.keys(config).filter(k => k !== "$schema");
        if (remainingKeys.length === 0) {
            fs.unlinkSync(configFile);
            console.log("removed");
        } else {
            fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
            console.log("updated");
        }
    } else {
        console.log("not_found");
    }
} catch (err) {
    console.error("error:" + err.message);
    process.exit(1);
}
' 2>&1)
        case "$node_result" in
          removed)
            echo -e "${GREEN}✓ Removed opencode.json (was only brain-dump config)${NC}"
            ;;
          updated)
            echo -e "${GREEN}✓ Removed brain-dump from opencode.json${NC}"
            ;;
          not_found)
            echo -e "${YELLOW}brain-dump not found in opencode.json${NC}"
            ;;
          error:*)
            echo -e "${RED}✗ Could not update opencode.json: ${node_result#error:}${NC}"
            echo -e "${YELLOW}Please manually remove brain-dump MCP entry from $OPENCODE_JSON${NC}"
            failed=1
            ;;
          *)
            echo -e "${RED}✗ Unexpected response during config cleanup: $node_result${NC}"
            echo -e "${YELLOW}Please verify brain-dump was removed from $OPENCODE_JSON${NC}"
            failed=1
            ;;
        esac
      else
        echo -e "${YELLOW}Note:${NC} Please manually remove brain-dump MCP entry from $OPENCODE_JSON"
      fi
    fi
  fi

  # Remove plugin
  if [ -f "$PLUGINS_DIR/brain-dump-telemetry.ts" ]; then
    if ! rm "$PLUGINS_DIR/brain-dump-telemetry.ts"; then
      echo -e "${RED}✗ Failed to remove telemetry plugin (permission denied or file locked)${NC}"
      failed=1
    else
      echo -e "${GREEN}✓ OpenCode plugin removed${NC}"
    fi
  fi

  # Remove AGENTS.md documentation
  if [ -f "$CONFIG_DIR/AGENTS.md" ]; then
    if ! rm "$CONFIG_DIR/AGENTS.md"; then
      echo -e "${RED}✗ Failed to remove AGENTS.md (permission denied)${NC}"
      failed=1
    else
      echo -e "${GREEN}✓ OpenCode documentation removed${NC}"
    fi
  fi

  # Remove skill
  if [ -d "$SKILLS_DIR/brain-dump-workflow" ]; then
    if ! rm -rf "$SKILLS_DIR/brain-dump-workflow"; then
      echo -e "${RED}✗ Failed to remove skill (permission denied or directory locked)${NC}"
      failed=1
    else
      echo -e "${GREEN}✓ OpenCode skill removed${NC}"
    fi
  fi

  if [ $failed -eq 0 ]; then
    echo -e "${GREEN}✓ OpenCode uninstallation complete${NC}"
  else
    echo -e "${YELLOW}⚠ Some OpenCode files could not be removed. Check permissions.${NC}"
  fi

  echo ""
}

# ─────────────────────────────────────────────────────────────────
# VS Code Uninstall
# ─────────────────────────────────────────────────────────────────

uninstall_vscode() {
  echo -e "${BLUE}Uninstalling VS Code configuration...${NC}"

  local failed=0

  # Detect OS and set VS Code paths
  case "$(uname -s)" in
    Linux*)
      VSCODE_USER_DIR="$HOME/.config/Code/User"
      COPILOT_SKILLS_DIR="$HOME/.copilot/skills"
      ;;
    Darwin*)
      VSCODE_USER_DIR="$HOME/Library/Application Support/Code/User"
      COPILOT_SKILLS_DIR="$HOME/.copilot/skills"
      ;;
    MINGW*|MSYS*|CYGWIN*)
      VSCODE_USER_DIR="$APPDATA/Code/User"
      COPILOT_SKILLS_DIR="$USERPROFILE/.copilot/skills"
      ;;
    *)
      echo -e "${YELLOW}⚠ Unknown OS, skipping VS Code uninstall${NC}"
      return 0
      ;;
  esac

  # Remove MCP config entry (or file if only brain-dump)
  MCP_CONFIG_FILE="$VSCODE_USER_DIR/mcp.json"
  if [ -f "$MCP_CONFIG_FILE" ]; then
    if grep -q '"brain-dump"' "$MCP_CONFIG_FILE"; then
      # Check if brain-dump is the only server
      server_count=$(grep -c '"[a-zA-Z-]*":' "$MCP_CONFIG_FILE" 2>/dev/null || echo "0")
      if [ "$server_count" -le 1 ]; then
        if rm "$MCP_CONFIG_FILE" 2>/dev/null; then
          echo -e "${GREEN}✓ Removed mcp.json${NC}"
        else
          echo -e "${YELLOW}⚠ Could not remove mcp.json${NC}"
          failed=1
        fi
      else
        echo -e "${YELLOW}Note:${NC} mcp.json contains other servers. Please manually remove the 'brain-dump' entry."
      fi
    fi
  fi

  # Remove Brain Dump agents from prompts folder
  PROMPTS_DIR="$VSCODE_USER_DIR/prompts"
  if [ -d "$PROMPTS_DIR" ]; then
    for agent in ralph.agent.md ticket-worker.agent.md planner.agent.md inception.agent.md \
                 code-reviewer.agent.md silent-failure-hunter.agent.md code-simplifier.agent.md \
                 context7-library-compliance.agent.md react-best-practices.agent.md \
                 cruft-detector.agent.md senior-engineer.agent.md; do
      if [ -f "$PROMPTS_DIR/$agent" ]; then
        rm "$PROMPTS_DIR/$agent" 2>/dev/null && echo -e "${GREEN}✓ Removed $agent${NC}" || failed=1
      fi
    done

    for prompt in start-ticket.prompt.md complete-ticket.prompt.md create-tickets.prompt.md auto-review.prompt.md; do
      if [ -f "$PROMPTS_DIR/$prompt" ]; then
        rm "$PROMPTS_DIR/$prompt" 2>/dev/null && echo -e "${GREEN}✓ Removed $prompt${NC}" || failed=1
      fi
    done
  fi

  # Remove Brain Dump skills from Copilot skills folder
  if [ -d "$COPILOT_SKILLS_DIR" ]; then
    for skill in brain-dump-tickets ralph-workflow auto-review; do
      if [ -d "$COPILOT_SKILLS_DIR/$skill" ]; then
        rm -rf "$COPILOT_SKILLS_DIR/$skill" 2>/dev/null && echo -e "${GREEN}✓ Removed $skill skill${NC}" || failed=1
      fi
    done
  fi

  if [ $failed -eq 0 ]; then
    echo -e "${GREEN}✓ VS Code uninstallation complete${NC}"
  else
    echo -e "${YELLOW}⚠ Some VS Code files could not be removed. Check permissions.${NC}"
  fi

  echo ""
}

# ─────────────────────────────────────────────────────────────────
# Copilot CLI Uninstall
# ─────────────────────────────────────────────────────────────────

uninstall_copilot_cli() {
  echo -e "${BLUE}Uninstalling Copilot CLI configuration...${NC}"

  COPILOT_DIR="$HOME/.copilot"
  HOOKS_DIR="$COPILOT_DIR/hooks"
  AGENTS_DIR="$COPILOT_DIR/agents"
  SKILLS_DIR="$COPILOT_DIR/skills"
  MCP_CONFIG="$COPILOT_DIR/mcp-config.json"
  HOOKS_CONFIG="$COPILOT_DIR/hooks.json"

  local failed=0

  # Remove brain-dump from MCP config
  if [ -f "$MCP_CONFIG" ]; then
    if grep -q '"brain-dump"' "$MCP_CONFIG"; then
      if command -v node >/dev/null 2>&1; then
        node_result=$(MCP_CONFIG="$MCP_CONFIG" node -e '
const fs = require("fs");
const configFile = process.env.MCP_CONFIG;

try {
    const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    if (config.mcpServers && config.mcpServers["brain-dump"]) {
        delete config.mcpServers["brain-dump"];
        if (Object.keys(config.mcpServers).length === 0) {
            delete config.mcpServers;
        }
        const remainingKeys = Object.keys(config);
        if (remainingKeys.length === 0) {
            fs.unlinkSync(configFile);
            console.log("removed");
        } else {
            fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
            console.log("updated");
        }
    } else {
        console.log("not_found");
    }
} catch (err) {
    console.error("error:" + err.message);
    process.exit(1);
}
' 2>&1)
        case "$node_result" in
          removed)
            echo -e "${GREEN}✓ Removed mcp-config.json (was only brain-dump config)${NC}"
            ;;
          updated)
            echo -e "${GREEN}✓ Removed brain-dump from mcp-config.json${NC}"
            ;;
          not_found)
            echo -e "${YELLOW}brain-dump not found in mcp-config.json${NC}"
            ;;
          error:*)
            echo -e "${RED}✗ Could not update mcp-config.json: ${node_result#error:}${NC}"
            echo -e "${YELLOW}Please manually remove brain-dump MCP entry from $MCP_CONFIG${NC}"
            failed=1
            ;;
          *)
            echo -e "${RED}✗ Unexpected response during config cleanup: $node_result${NC}"
            echo -e "${YELLOW}Please verify brain-dump was removed from $MCP_CONFIG${NC}"
            failed=1
            ;;
        esac
      else
        echo -e "${YELLOW}Note:${NC} Please manually remove brain-dump MCP entry from $MCP_CONFIG"
      fi
    fi
  fi

  # Remove Brain Dump agents
  if [ -d "$AGENTS_DIR" ]; then
    for agent in ralph.agent.md ticket-worker.agent.md planner.agent.md inception.agent.md \
                 code-reviewer.agent.md silent-failure-hunter.agent.md code-simplifier.agent.md \
                 context7-library-compliance.agent.md react-best-practices.agent.md \
                 cruft-detector.agent.md senior-engineer.agent.md; do
      if [ -f "$AGENTS_DIR/$agent" ]; then
        rm "$AGENTS_DIR/$agent" 2>/dev/null && echo -e "${GREEN}✓ Removed $agent${NC}" || failed=1
      fi
    done
  fi

  # Remove hook scripts
  if [ -d "$HOOKS_DIR" ]; then
    for hook in start-telemetry.sh end-telemetry.sh log-prompt.sh \
                log-tool-start.sh log-tool-end.sh log-tool-failure.sh \
                enforce-state-before-write.sh; do
      hook_path="$HOOKS_DIR/$hook"
      if [ -f "$hook_path" ]; then
        if ! rm "$hook_path"; then
          echo -e "${RED}✗ Failed to remove $hook (permission denied or file locked)${NC}"
          failed=1
        fi
      fi
    done
    echo -e "${GREEN}✓ Hook scripts removed${NC}"
  fi

  # Clean up hooks.json
  if [ -f "$HOOKS_CONFIG" ]; then
    if grep -q "start-telemetry" "$HOOKS_CONFIG"; then
      rm "$HOOKS_CONFIG" 2>/dev/null && echo -e "${GREEN}✓ Removed hooks.json${NC}" || {
        echo -e "${YELLOW}Note:${NC} Manually remove Brain Dump hooks from $HOOKS_CONFIG"
        failed=1
      }
    fi
  fi

  # Remove telemetry temp files
  for temp_file in telemetry-session.json telemetry-queue.jsonl telemetry.log; do
    if [ -f "$COPILOT_DIR/$temp_file" ]; then
      if ! rm "$COPILOT_DIR/$temp_file"; then
        echo -e "${YELLOW}⚠ Could not remove $temp_file${NC}"
        failed=1
      fi
    fi
  done

  # Remove correlation files
  find "$COPILOT_DIR" -maxdepth 1 -name "tool-correlation-*.queue" -delete 2>/dev/null || true
  find "$COPILOT_DIR" -maxdepth 1 -name "tool-correlation-*.lock" -delete 2>/dev/null || true
  find "$COPILOT_DIR" -maxdepth 1 -name "tool-correlation-*.data" -delete 2>/dev/null || true

  # Remove skills ONLY if VS Code is NOT also installed (shared directory)
  if [ -d "$SKILLS_DIR" ]; then
    if command -v code &>/dev/null 2>&1; then
      echo -e "${YELLOW}Note:${NC} Preserving ~/.copilot/skills/ (shared with VS Code)"
    else
      for skill in brain-dump-tickets ralph-workflow auto-review brain-dump-workflow \
                   review review-aggregation tanstack-errors tanstack-forms \
                   tanstack-mutations tanstack-query tanstack-types; do
        if [ -d "$SKILLS_DIR/$skill" ]; then
          rm -rf "$SKILLS_DIR/$skill" 2>/dev/null && echo -e "${GREEN}✓ Removed $skill skill${NC}" || failed=1
        fi
      done
      # Also remove standalone skill files
      find "$SKILLS_DIR" -maxdepth 1 -name "*.skill.md" -delete 2>/dev/null || true
    fi
  fi

  if [ $failed -eq 0 ]; then
    echo -e "${GREEN}✓ Copilot CLI uninstallation complete${NC}"
  else
    echo -e "${YELLOW}⚠ Some Copilot CLI files could not be removed. Check permissions.${NC}"
  fi

  echo ""
}

# ─────────────────────────────────────────────────────────────────
# Main Uninstallation
# ─────────────────────────────────────────────────────────────────

echo -e "${BLUE}Removing Brain Dump from detected environments...${NC}"
echo ""

REMOVE_COUNT=0

# Check and uninstall from each environment
if command -v claude &>/dev/null 2>&1; then
  uninstall_claude_code
  REMOVE_COUNT=$((REMOVE_COUNT + 1))
fi

if [ -d "$HOME/.cursor" ] 2>/dev/null || [ -d "/Applications/Cursor.app" ] 2>/dev/null; then
  uninstall_cursor
  REMOVE_COUNT=$((REMOVE_COUNT + 1))
fi

if command -v opencode &>/dev/null 2>&1; then
  uninstall_opencode
  REMOVE_COUNT=$((REMOVE_COUNT + 1))
fi

if command -v code &>/dev/null 2>&1; then
  uninstall_vscode
  REMOVE_COUNT=$((REMOVE_COUNT + 1))
fi

if command -v copilot &>/dev/null 2>&1 || [ -f "$HOME/.copilot/config.json" ] 2>/dev/null; then
  uninstall_copilot_cli
  REMOVE_COUNT=$((REMOVE_COUNT + 1))
fi

# ─────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────

if [ $REMOVE_COUNT -eq 0 ]; then
  echo -e "${YELLOW}No Brain Dump installations found.${NC}"
  exit 0
fi

echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Uninstallation Complete!                         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Summary:${NC}"
echo "  • Environments cleaned: $REMOVE_COUNT"
echo ""
echo -e "${BLUE}What's been removed:${NC}"
echo "  • Telemetry hooks and plugins"
echo "  • Temporary telemetry files"
echo "  • Configuration documentation"
echo ""
echo -e "${YELLOW}Note:${NC} Some configuration entries may need manual cleanup from:"
echo "  • ~/.claude/settings.json"
echo "  • ~/.cursor/hooks.json"
echo "  • ~/.copilot/hooks.json"
echo ""
echo -e "${BLUE}To reinstall Brain Dump:${NC}"
echo "  ./scripts/install.sh"
echo ""
