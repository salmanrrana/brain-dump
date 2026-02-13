#!/bin/bash
# Brain Dump - Uninstall Script
# Removes all Brain Dump configurations from your system
#
# Usage:
#   ./uninstall.sh              # Interactive uninstall
#   ./uninstall.sh --vscode     # Remove VS Code integration only
#   ./uninstall.sh --claude     # Remove Claude Code integration only
#   ./uninstall.sh --cursor     # Remove Cursor integration only
#   ./uninstall.sh --copilot    # Remove Copilot CLI integration only
#   ./uninstall.sh --codex      # Remove Codex integration only
#   ./uninstall.sh --sandbox    # Remove Claude Code sandbox configuration
#   ./uninstall.sh --devcontainer # Remove devcontainer Docker volumes
#   ./uninstall.sh --all        # Remove everything (including data)
#   ./uninstall.sh --keep-backup # Remove everything but keep backups
#   ./uninstall.sh --help       # Show help

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Track what was removed
REMOVED=()
SKIPPED=()

print_header() {
    echo -e "${RED}"
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║          Brain Dump - Uninstaller                         ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_step() {
    echo -e "\n${CYAN}▸ $1${NC}"
    echo "─────────────────────────────────────────────────────────────"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Darwin*)    OS="macos" ;;
        Linux*)     OS="linux" ;;
        MINGW*|MSYS*|CYGWIN*) OS="windows" ;;
        *)          OS="unknown" ;;
    esac
}

# Get VS Code paths based on OS
get_vscode_paths() {
    case "$OS" in
        macos)
            VSCODE_USER_DIR="$HOME/Library/Application Support/Code/User"
            COPILOT_SKILLS_DIR="$HOME/.copilot/skills"
            ;;
        linux)
            VSCODE_USER_DIR="$HOME/.config/Code/User"
            COPILOT_SKILLS_DIR="$HOME/.copilot/skills"
            ;;
        windows)
            VSCODE_USER_DIR="$APPDATA/Code/User"
            COPILOT_SKILLS_DIR="$USERPROFILE/.copilot/skills"
            ;;
    esac
}

# Get data paths based on OS
get_data_paths() {
    case "$OS" in
        macos)
            DATA_DIR="$HOME/Library/Application Support/brain-dump"
            ;;
        linux)
            DATA_DIR="$HOME/.local/share/brain-dump"
            STATE_DIR="$HOME/.local/state/brain-dump"
            ;;
        windows)
            DATA_DIR="$APPDATA/brain-dump"
            ;;
    esac
}

# Remove VS Code integration
remove_vscode() {
    print_step "Removing VS Code integration"

    get_vscode_paths

    if [ -z "$VSCODE_USER_DIR" ] || [ ! -d "$VSCODE_USER_DIR" ]; then
        print_warning "VS Code user directory not found"
        SKIPPED+=("VS Code (not installed)")
        return 0
    fi

    # Remove agents
    local agents_removed=0
    for agent in code-reviewer code-simplifier inception planner ralph silent-failure-hunter ticket-worker; do
        if [ -f "$VSCODE_USER_DIR/prompts/${agent}.agent.md" ]; then
            rm -f "$VSCODE_USER_DIR/prompts/${agent}.agent.md"
            agents_removed=$((agents_removed + 1))
        fi
    done
    if [ $agents_removed -gt 0 ]; then
        print_success "Removed $agents_removed agents"
        REMOVED+=("VS Code agents ($agents_removed)")
    else
        print_info "No agents to remove"
    fi

    # Remove prompts
    local prompts_removed=0
    for prompt in start-ticket complete-ticket create-tickets auto-review; do
        if [ -f "$VSCODE_USER_DIR/prompts/${prompt}.prompt.md" ]; then
            rm -f "$VSCODE_USER_DIR/prompts/${prompt}.prompt.md"
            prompts_removed=$((prompts_removed + 1))
        fi
    done
    if [ $prompts_removed -gt 0 ]; then
        print_success "Removed $prompts_removed prompts"
        REMOVED+=("VS Code prompts ($prompts_removed)")
    else
        print_info "No prompts to remove"
    fi

    # Remove skills
    local skills_removed=0
    for skill in brain-dump-tickets ralph-workflow auto-review; do
        if [ -d "$COPILOT_SKILLS_DIR/$skill" ]; then
            rm -rf "$COPILOT_SKILLS_DIR/$skill"
            skills_removed=$((skills_removed + 1))
        fi
    done
    if [ $skills_removed -gt 0 ]; then
        print_success "Removed $skills_removed skills"
        REMOVED+=("VS Code skills ($skills_removed)")
    else
        print_info "No skills to remove"
    fi

    # Remove brain-dump from MCP config
    MCP_CONFIG="$VSCODE_USER_DIR/mcp.json"
    if [ -f "$MCP_CONFIG" ] && grep -q '"brain-dump"' "$MCP_CONFIG"; then
        if command -v node >/dev/null 2>&1; then
            node -e "
const fs = require('fs');
try {
    const config = JSON.parse(fs.readFileSync('$MCP_CONFIG', 'utf8'));
    if (config.servers && config.servers['brain-dump']) {
        delete config.servers['brain-dump'];
        fs.writeFileSync('$MCP_CONFIG', JSON.stringify(config, null, 2));
        console.log('removed');
    }
} catch (e) {
    console.error(e.message);
}
" 2>/dev/null && print_success "Removed brain-dump from MCP config" && REMOVED+=("VS Code MCP server")
        else
            print_warning "Could not remove brain-dump from mcp.json (node not found)"
            print_info "Manually edit: $MCP_CONFIG"
            SKIPPED+=("VS Code MCP config (manual removal needed)")
        fi
    else
        print_info "brain-dump not in MCP config"
    fi
}

# Remove CLI global link
remove_cli() {
    print_step "Removing brain-dump CLI"

    # Check if pnpm is available
    if ! command -v pnpm >/dev/null 2>&1; then
        print_warning "pnpm not found, skipping CLI removal"
        SKIPPED+=("CLI (pnpm not installed)")
        return 0
    fi

    # Try to unlink the CLI
    if pnpm unlink --global brain-dump 2>/dev/null; then
        print_success "Removed brain-dump CLI from global path"
        REMOVED+=("brain-dump CLI")
    else
        # Check if it was even installed
        if command -v brain-dump >/dev/null 2>&1; then
            print_warning "Could not remove brain-dump CLI"
            print_info "Try manually: pnpm unlink --global brain-dump"
            SKIPPED+=("CLI (manual removal needed)")
        else
            print_info "brain-dump CLI was not globally installed"
        fi
    fi
}

# Remove Claude Code integration
remove_claude() {
    print_step "Removing Claude Code integration"

    CLAUDE_CONFIG="$HOME/.claude.json"

    # Remove brain-dump from Claude MCP config
    if [ -f "$CLAUDE_CONFIG" ] && grep -q '"brain-dump"' "$CLAUDE_CONFIG"; then
        if command -v node >/dev/null 2>&1; then
            node -e "
const fs = require('fs');
try {
    const config = JSON.parse(fs.readFileSync('$CLAUDE_CONFIG', 'utf8'));
    if (config.mcpServers && config.mcpServers['brain-dump']) {
        delete config.mcpServers['brain-dump'];
        fs.writeFileSync('$CLAUDE_CONFIG', JSON.stringify(config, null, 2));
        console.log('removed');
    }
} catch (e) {
    console.error(e.message);
}
" 2>/dev/null && print_success "Removed brain-dump from ~/.claude.json" && REMOVED+=("Claude Code MCP server")
        else
            print_warning "Could not remove brain-dump from ~/.claude.json (node not found)"
            SKIPPED+=("Claude Code MCP config (manual removal needed)")
        fi
    else
        print_info "brain-dump not in Claude config"
    fi
}

# Remove Cursor integration
remove_cursor() {
    print_step "Removing Cursor integration"

    CURSOR_CONFIG_DIR="$HOME/.cursor"
    MCP_CONFIG="$CURSOR_CONFIG_DIR/mcp.json"
    AGENTS_DIR="$CURSOR_CONFIG_DIR/agents"
    SKILLS_DIR="$CURSOR_CONFIG_DIR/skills"
    COMMANDS_DIR="$CURSOR_CONFIG_DIR/commands"

    # Remove brain-dump from Cursor MCP config
    if [ -f "$MCP_CONFIG" ] && grep -q '"brain-dump"' "$MCP_CONFIG"; then
        if command -v node >/dev/null 2>&1; then
            node -e "
const fs = require('fs');
try {
    const config = JSON.parse(fs.readFileSync('$MCP_CONFIG', 'utf8'));
    if (config.mcpServers && config.mcpServers['brain-dump']) {
        delete config.mcpServers['brain-dump'];
        fs.writeFileSync('$MCP_CONFIG', JSON.stringify(config, null, 2));
        console.log('removed');
    }
} catch (e) {
    console.error(e.message);
}
" 2>/dev/null && print_success "Removed brain-dump from MCP config" && REMOVED+=("Cursor MCP server")
        else
            print_warning "Could not remove brain-dump from mcp.json (node not found)"
            print_info "Manually edit: $MCP_CONFIG"
            SKIPPED+=("Cursor MCP config (manual removal needed)")
        fi
    else
        print_info "brain-dump not in Cursor MCP config"
    fi

    # Remove subagents
    local agents_removed=0
    if [ -d "$AGENTS_DIR" ]; then
        for agent in ralph ticket-worker planner code-reviewer silent-failure-hunter code-simplifier inception context7-library-compliance react-best-practices cruft-detector senior-engineer; do
            if [ -f "$AGENTS_DIR/${agent}.md" ]; then
                rm -f "$AGENTS_DIR/${agent}.md"
                agents_removed=$((agents_removed + 1))
            fi
        done
        if [ $agents_removed -gt 0 ]; then
            print_success "Removed $agents_removed subagents"
            REMOVED+=("Cursor subagents ($agents_removed)")
        else
            print_info "No subagents to remove"
        fi
    else
        print_info "Cursor agents directory not found"
    fi

    # Remove skills
    local skills_removed=0
    if [ -d "$SKILLS_DIR" ]; then
        for skill in brain-dump-tickets ralph-workflow review review-aggregation tanstack-errors tanstack-forms tanstack-mutations tanstack-query tanstack-types; do
            if [ -d "$SKILLS_DIR/$skill" ]; then
                rm -rf "$SKILLS_DIR/$skill"
                skills_removed=$((skills_removed + 1))
            fi
        done
        if [ $skills_removed -gt 0 ]; then
            print_success "Removed $skills_removed skills"
            REMOVED+=("Cursor skills ($skills_removed)")
        else                                                                                                                   
            print_info "No skills to remove"
        fi
    else
        print_info "Cursor skills directory not found"
    fi

    # Remove commands
    local commands_removed=0
    if [ -d "$COMMANDS_DIR" ]; then
        for command in review extended-review inception breakdown; do
            if [ -f "$COMMANDS_DIR/${command}.md" ]; then
                rm -f "$COMMANDS_DIR/${command}.md"
                commands_removed=$((commands_removed + 1))
            fi
        done
        if [ $commands_removed -gt 0 ]; then
            print_success "Removed $commands_removed commands"
            REMOVED+=("Cursor commands ($commands_removed)")
        else
            print_info "No commands to remove"
        fi
    else
        print_info "Cursor commands directory not found"
    fi

    # Clean up empty .cursor directory if it exists
    if [ -d "$CURSOR_CONFIG_DIR" ] && [ -z "$(ls -A "$CURSOR_CONFIG_DIR" 2>/dev/null)" ]; then
        rmdir "$CURSOR_CONFIG_DIR"
        print_success "Removed empty ~/.cursor directory"
    fi
}

# Remove OpenCode integration
remove_opencode() {
    print_step "Removing OpenCode integration"

    OPENCODE_GLOBAL="$HOME/.config/opencode"
    OPENCODE_JSON="$OPENCODE_GLOBAL/opencode.json"
    OPENCODE_AGENTS="$OPENCODE_GLOBAL/agents"

    # Remove brain-dump from OpenCode MCP config
    if [ -f "$OPENCODE_JSON" ] && grep -q '"brain-dump"' "$OPENCODE_JSON"; then
        if command -v node >/dev/null 2>&1; then
            node -e "
const fs = require('fs');
try {
    const config = JSON.parse(fs.readFileSync('$OPENCODE_JSON', 'utf8'));
    if (config.mcp && config.mcp['brain-dump']) {
        delete config.mcp['brain-dump'];
        if (Object.keys(config.mcp).length === 0) delete config.mcp;
        const remaining = Object.keys(config).filter(k => k !== '\$schema');
        if (remaining.length === 0) {
            fs.unlinkSync('$OPENCODE_JSON');
        } else {
            fs.writeFileSync('$OPENCODE_JSON', JSON.stringify(config, null, 2));
        }
        console.log('removed');
    }
} catch (e) {
    console.error(e.message);
}
" 2>/dev/null && print_success "Removed brain-dump from OpenCode MCP config" && REMOVED+=("OpenCode MCP server")
        else
            print_warning "Could not remove brain-dump from opencode.json (node not found)"
            SKIPPED+=("OpenCode MCP config (manual removal needed)")
        fi
    else
        print_info "brain-dump not in OpenCode MCP config"
    fi

    # Remove Brain Dump agents
    local agents_removed=0
    if [ -d "$OPENCODE_AGENTS" ]; then
        for agent in code-reviewer-fallback code-simplifier-fallback; do
            if [ -f "$OPENCODE_AGENTS/${agent}.md" ]; then
                rm -f "$OPENCODE_AGENTS/${agent}.md"
                agents_removed=$((agents_removed + 1))
            fi
        done
        if [ $agents_removed -gt 0 ]; then
            print_success "Removed $agents_removed OpenCode agents"
            REMOVED+=("OpenCode agents ($agents_removed)")
        fi
    fi

    # Remove AGENTS.md
    if [ -f "$OPENCODE_GLOBAL/AGENTS.md" ]; then
        rm -f "$OPENCODE_GLOBAL/AGENTS.md"
        print_success "Removed OpenCode AGENTS.md"
        REMOVED+=("OpenCode documentation")
    fi

    # Remove local .opencode config
    if [ -f ".opencode/opencode.json" ] && grep -q '"brain-dump"' ".opencode/opencode.json"; then
        print_info "Local .opencode/opencode.json has brain-dump config (project-level, not removing)"
        SKIPPED+=("OpenCode local config (project-level)")
    fi
}

# Remove Copilot CLI integration
remove_copilot_cli() {
    print_step "Removing Copilot CLI integration"

    COPILOT_DIR="$HOME/.copilot"
    HOOKS_DIR="$COPILOT_DIR/hooks"
    AGENTS_DIR="$COPILOT_DIR/agents"
    SKILLS_DIR="$COPILOT_DIR/skills"
    MCP_CONFIG="$COPILOT_DIR/mcp-config.json"
    HOOKS_CONFIG="$COPILOT_DIR/hooks.json"

    # Remove brain-dump from MCP config
    if [ -f "$MCP_CONFIG" ] && grep -q '"brain-dump"' "$MCP_CONFIG"; then
        if command -v node >/dev/null 2>&1; then
            node -e "
const fs = require('fs');
try {
    const config = JSON.parse(fs.readFileSync('$MCP_CONFIG', 'utf8'));
    if (config.mcpServers && config.mcpServers['brain-dump']) {
        delete config.mcpServers['brain-dump'];
        if (Object.keys(config.mcpServers).length === 0) {
            fs.unlinkSync('$MCP_CONFIG');
        } else {
            fs.writeFileSync('$MCP_CONFIG', JSON.stringify(config, null, 2));
        }
        console.log('removed');
    }
} catch (e) {
    console.error(e.message);
}
" 2>/dev/null && print_success "Removed brain-dump from Copilot CLI MCP config" && REMOVED+=("Copilot CLI MCP server")
        else
            print_warning "Could not remove brain-dump from mcp-config.json (node not found)"
            print_info "Manually edit: $MCP_CONFIG"
            SKIPPED+=("Copilot CLI MCP config (manual removal needed)")
        fi
    else
        print_info "brain-dump not in Copilot CLI MCP config"
    fi

    # Remove Brain Dump agents
    local agents_removed=0
    if [ -d "$AGENTS_DIR" ]; then
        for agent in ralph ticket-worker planner inception code-reviewer silent-failure-hunter code-simplifier context7-library-compliance react-best-practices cruft-detector senior-engineer; do
            if [ -f "$AGENTS_DIR/${agent}.agent.md" ]; then
                rm -f "$AGENTS_DIR/${agent}.agent.md"
                agents_removed=$((agents_removed + 1))
            fi
        done
        if [ $agents_removed -gt 0 ]; then
            print_success "Removed $agents_removed agents"
            REMOVED+=("Copilot CLI agents ($agents_removed)")
        else
            print_info "No agents to remove"
        fi
    fi

    # Remove hook scripts
    local hooks_removed=0
    if [ -d "$HOOKS_DIR" ]; then
        for hook in start-telemetry.sh end-telemetry.sh log-prompt.sh log-tool-start.sh log-tool-end.sh log-tool-failure.sh enforce-state-before-write.sh; do
            if [ -f "$HOOKS_DIR/$hook" ]; then
                rm -f "$HOOKS_DIR/$hook"
                hooks_removed=$((hooks_removed + 1))
            fi
        done
        if [ $hooks_removed -gt 0 ]; then
            print_success "Removed $hooks_removed hook scripts"
            REMOVED+=("Copilot CLI hooks ($hooks_removed)")
        fi
    fi

    # Clean up hooks.json
    if [ -f "$HOOKS_CONFIG" ] && grep -q "start-telemetry" "$HOOKS_CONFIG"; then
        rm -f "$HOOKS_CONFIG"
        print_success "Removed hooks.json"
        REMOVED+=("Copilot CLI hooks config")
    fi

    # Remove telemetry temp files
    for temp_file in telemetry-session.json telemetry-queue.jsonl telemetry.log; do
        [ -f "$COPILOT_DIR/$temp_file" ] && rm -f "$COPILOT_DIR/$temp_file"
    done

    # Remove correlation files
    rm -f "$COPILOT_DIR"/tool-correlation-*.queue "$COPILOT_DIR"/tool-correlation-*.lock "$COPILOT_DIR"/tool-correlation-*.data 2>/dev/null || true

    # Remove skills only if VS Code is NOT also installed (shared directory)
    if [ -d "$SKILLS_DIR" ]; then
        if command -v code >/dev/null 2>&1; then
            print_info "Preserving ~/.copilot/skills/ (shared with VS Code)"
            SKIPPED+=("Copilot CLI skills (shared with VS Code)")
        else
            local skills_removed=0
            for skill in brain-dump-tickets ralph-workflow brain-dump-workflow review review-aggregation tanstack-errors tanstack-forms tanstack-mutations tanstack-query tanstack-types; do
                if [ -d "$SKILLS_DIR/$skill" ]; then
                    rm -rf "$SKILLS_DIR/$skill"
                    skills_removed=$((skills_removed + 1))
                fi
            done
            if [ $skills_removed -gt 0 ]; then
                print_success "Removed $skills_removed skills"
                REMOVED+=("Copilot CLI skills ($skills_removed)")
            fi
        fi
    fi
}

# Remove Codex integration
remove_codex() {
    print_step "Removing Codex integration"

    CODEX_DIR="$HOME/.codex"
    CODEX_CONFIG="$CODEX_DIR/config.toml"

    if [ -f "$CODEX_CONFIG" ] && grep -q '\[mcp_servers\.brain-dump\]' "$CODEX_CONFIG"; then
        if command -v perl >/dev/null 2>&1; then
            # Remove the brain-dump MCP table block only, keep the rest of config intact.
            perl -0777 -i.bak -pe 's/\n?#\s*Brain Dump MCP server\s*\n\[mcp_servers\.brain-dump\]\n(?:[^\[]*\n)*//g; s/\n?\[mcp_servers\.brain-dump\]\n(?:[^\[]*\n)*//g' "$CODEX_CONFIG" || true
            rm -f "$CODEX_CONFIG.bak"
            print_success "Removed brain-dump MCP server from ~/.codex/config.toml"
            REMOVED+=("Codex MCP server")
        else
            print_warning "Could not edit ~/.codex/config.toml automatically (perl not found)"
            print_info "Manually remove the [mcp_servers.brain-dump] block from: $CODEX_CONFIG"
            SKIPPED+=("Codex MCP config (manual removal needed)")
        fi
    else
        print_info "brain-dump not found in ~/.codex/config.toml"
    fi
}

# Remove Claude Code sandbox configuration
remove_sandbox() {
    print_step "Removing Claude Code sandbox configuration"

    CLAUDE_SETTINGS="$HOME/.claude/settings.json"

    # Check if settings.json exists
    if [ ! -f "$CLAUDE_SETTINGS" ]; then
        print_info "Claude settings.json not found"
        SKIPPED+=("Claude sandbox (no settings.json)")
        return 0
    fi

    # Check if sandbox is configured
    if ! grep -q '"sandbox"' "$CLAUDE_SETTINGS"; then
        print_info "No sandbox configuration found in settings.json"
        SKIPPED+=("Claude sandbox (not configured)")
        return 0
    fi

    # Remove sandbox configuration
    if command -v node >/dev/null 2>&1; then
        node -e "
const fs = require('fs');
try {
    const config = JSON.parse(fs.readFileSync('$CLAUDE_SETTINGS', 'utf8'));
    if (config.sandbox) {
        delete config.sandbox;
        fs.writeFileSync('$CLAUDE_SETTINGS', JSON.stringify(config, null, 2));
        console.log('removed');
    }
} catch (e) {
    console.error(e.message);
}
" 2>/dev/null && print_success "Removed sandbox configuration from ~/.claude/settings.json" && REMOVED+=("Claude sandbox config")
    else
        print_warning "Could not remove sandbox config from settings.json (node not found)"
        print_info "Manually edit: $CLAUDE_SETTINGS"
        print_info "Remove the \"sandbox\" section"
        SKIPPED+=("Claude sandbox (manual removal needed)")
    fi
}

# Get the backup directory path for the current OS
get_backup_dir() {
    case "$OS" in
        linux)
            echo "$STATE_DIR/backups"
            ;;
        macos|windows)
            echo "$DATA_DIR/backups"
            ;;
    esac
}

# Remove data (database, attachments, backups)
remove_data() {
    print_step "Removing Brain Dump data"

    get_data_paths
    local backup_dir
    backup_dir="$(get_backup_dir)"

    if [ "$KEEP_BACKUP" = true ]; then
        print_info "Keep-backup mode: preserving backups directory"
    fi

    if [ -d "$DATA_DIR" ]; then
        if [ "$KEEP_BACKUP" = true ]; then
            print_warning "This will delete your database and attachments (backups will be preserved)."
        else
            print_warning "This will delete your database, attachments, and backups!"
        fi
        echo -e "  Location: ${YELLOW}$DATA_DIR${NC}"
        echo ""
        read -r -p "Are you sure? (y/N): " confirm
        if [[ "$confirm" =~ ^[Yy]$ ]]; then
            if [ "$KEEP_BACKUP" = true ] && [ "$OS" != "linux" ] && [ -d "$backup_dir" ]; then
                # macOS/Windows: backups are inside DATA_DIR, so move them out first
                local tmp_backup
                tmp_backup="$(mktemp -d)"
                cp -a "$backup_dir" "$tmp_backup/backups"
                rm -rf "$DATA_DIR"
                mkdir -p "$DATA_DIR"
                mv "$tmp_backup/backups" "$backup_dir"
                rmdir "$tmp_backup"
                print_success "Removed data directory (backups preserved)"
                PRESERVED_BACKUP_DIR="$backup_dir"
            else
                rm -rf "$DATA_DIR"
                print_success "Removed data directory"
            fi
            REMOVED+=("Brain Dump data")
        else
            print_info "Keeping data directory"
            SKIPPED+=("Brain Dump data (user chose to keep)")
        fi
    else
        print_info "No data directory found"
    fi

    # Linux also has state directory
    if [ "$OS" = "linux" ] && [ -d "$STATE_DIR" ]; then
        if [ "$KEEP_BACKUP" = true ] && [ -d "$backup_dir" ]; then
            # Selectively remove everything in STATE_DIR except backups/
            for item in "$STATE_DIR"/*; do
                [ -e "$item" ] || continue
                if [ "$(basename "$item")" = "backups" ]; then
                    continue
                fi
                rm -rf "$item"
            done
            print_success "Removed state directory contents (backups preserved)"
            PRESERVED_BACKUP_DIR="$backup_dir"
        else
            rm -rf "$STATE_DIR"
            print_success "Removed state directory"
        fi
    fi
}

# Remove Docker sandbox artifacts
remove_docker() {
    print_step "Removing Docker sandbox artifacts"

    # Check if Docker is available
    if ! command -v docker >/dev/null 2>&1; then
        print_info "Docker not installed, skipping Docker cleanup"
        SKIPPED+=("Docker cleanup (Docker not installed)")
        return 0
    fi

    # Detect DOCKER_HOST for Lima/Colima
    if [ -z "${DOCKER_HOST:-}" ]; then
        local lima_sock="$HOME/.lima/docker/sock/docker.sock"
        local colima_sock="$HOME/.colima/default/docker.sock"

        if [ -S "$lima_sock" ]; then
            export DOCKER_HOST="unix://$lima_sock"
        elif [ -S "$colima_sock" ]; then
            export DOCKER_HOST="unix://$colima_sock"
        fi
    fi

    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        print_warning "Docker is not running"
        print_info "Start Docker to clean up containers, network, and image"
        SKIPPED+=("Docker cleanup (Docker not running)")
        # Still clean up scripts directory
        if [ -d "$HOME/.brain-dump/scripts" ]; then
            rm -rf "$HOME/.brain-dump/scripts"
            print_success "Removed Ralph scripts directory"
            REMOVED+=("Ralph scripts (~/.brain-dump/scripts)")
        fi
        return 0
    fi

    # Stop and remove any running ralph containers
    local ralph_containers
    ralph_containers=$(docker ps -a --filter "name=ralph-" --format "{{.Names}}" 2>/dev/null || true)
    if [ -n "$ralph_containers" ]; then
        print_info "Stopping Ralph containers..."
        echo "$ralph_containers" | while read -r container; do
            docker stop "$container" >/dev/null 2>&1 || true
            docker rm "$container" >/dev/null 2>&1 || true
        done
        print_success "Removed Ralph containers"
        REMOVED+=("Ralph containers")
    else
        print_info "No Ralph containers found"
    fi

    # Remove ralph-net network
    if docker network inspect ralph-net >/dev/null 2>&1; then
        print_info "Removing ralph-net network..."
        if docker network rm ralph-net >/dev/null 2>&1; then
            print_success "Removed ralph-net network"
            REMOVED+=("Docker network (ralph-net)")
        else
            print_warning "Could not remove ralph-net network (may be in use)"
            SKIPPED+=("Docker network (in use)")
        fi
    else
        print_info "ralph-net network not found"
    fi

    # Remove brain-dump-ralph-sandbox image
    if docker image inspect brain-dump-ralph-sandbox:latest >/dev/null 2>&1; then
        print_info "Removing brain-dump-ralph-sandbox image..."
        if docker rmi brain-dump-ralph-sandbox:latest >/dev/null 2>&1; then
            print_success "Removed brain-dump-ralph-sandbox image"
            REMOVED+=("Docker image (brain-dump-ralph-sandbox)")
        else
            print_warning "Could not remove image (may be in use)"
            SKIPPED+=("Docker image (in use)")
        fi
    else
        print_info "brain-dump-ralph-sandbox image not found"
    fi

    # Remove Ralph scripts directory
    if [ -d "$HOME/.brain-dump/scripts" ]; then
        rm -rf "$HOME/.brain-dump/scripts"
        print_success "Removed Ralph scripts directory"
        REMOVED+=("Ralph scripts (~/.brain-dump/scripts)")
    fi

    # Clean up empty .brain-dump directory if it exists
    if [ -d "$HOME/.brain-dump" ] && [ -z "$(ls -A "$HOME/.brain-dump" 2>/dev/null)" ]; then
        rmdir "$HOME/.brain-dump"
        print_success "Removed empty ~/.brain-dump directory"
    fi
}

# Remove devcontainer Docker volumes (NOT user data)
remove_devcontainer() {
    print_step "Removing devcontainer Docker volumes"

    # Check if Docker is available
    if ! command -v docker >/dev/null 2>&1; then
        print_info "Docker not installed, skipping devcontainer cleanup"
        SKIPPED+=("Devcontainer cleanup (Docker not installed)")
        return 0
    fi

    # Detect DOCKER_HOST for Lima/Colima
    if [ -z "${DOCKER_HOST:-}" ]; then
        local lima_sock="$HOME/.lima/docker/sock/docker.sock"
        local colima_sock="$HOME/.colima/default/docker.sock"

        if [ -S "$lima_sock" ]; then
            export DOCKER_HOST="unix://$lima_sock"
        elif [ -S "$colima_sock" ]; then
            export DOCKER_HOST="unix://$colima_sock"
        fi
    fi

    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        print_warning "Docker is not running"
        print_info "Start Docker to clean up devcontainer volumes"
        SKIPPED+=("Devcontainer cleanup (Docker not running)")
        return 0
    fi

    # Named volumes to remove (these are NOT user data - just caches)
    local volumes_to_remove=(
        "brain-dump-pnpm-store"
        "brain-dump-bashhistory"
        "brain-dump-claude-config"
    )

    local volumes_removed=0
    for volume in "${volumes_to_remove[@]}"; do
        if docker volume inspect "$volume" >/dev/null 2>&1; then
            print_info "Removing volume: $volume..."
            if docker volume rm "$volume" >/dev/null 2>&1; then
                print_success "Removed $volume"
                volumes_removed=$((volumes_removed + 1))
            else
                print_warning "Could not remove $volume (may be in use)"
                SKIPPED+=("Docker volume ($volume)")
            fi
        else
            print_info "$volume not found"
        fi
    done

    if [ $volumes_removed -gt 0 ]; then
        REMOVED+=("Devcontainer volumes ($volumes_removed)")
    fi

    # Optionally remove the devcontainer image
    if docker image inspect brain-dump-devcontainer:latest >/dev/null 2>&1; then
        echo ""
        print_info "Found brain-dump-devcontainer image."
        read -r -p "Remove devcontainer image? (y/N): " confirm
        if [[ "$confirm" =~ ^[Yy]$ ]]; then
            if docker rmi brain-dump-devcontainer:latest >/dev/null 2>&1; then
                print_success "Removed brain-dump-devcontainer image"
                REMOVED+=("Devcontainer image")
            else
                print_warning "Could not remove image (may be in use)"
                SKIPPED+=("Devcontainer image (in use)")
            fi
        else
            print_info "Keeping devcontainer image"
            SKIPPED+=("Devcontainer image (user chose to keep)")
        fi
    fi

    # Note: We do NOT remove the bind-mounted data directory
    # That's the user's Brain Dump database, not a devcontainer artifact
    print_info "Note: Your Brain Dump data (database) is NOT removed."
    print_info "Use --all to remove data, or manually delete your data directory."
}

# Print summary
print_summary() {
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              Uninstall Complete!                           ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    if [ ${#REMOVED[@]} -gt 0 ]; then
        echo -e "${GREEN}Removed:${NC}"
        for item in "${REMOVED[@]}"; do
            echo "  ✓ ${item}"
        done
        echo ""
    fi

    if [ ${#SKIPPED[@]} -gt 0 ]; then
        echo -e "${YELLOW}Skipped:${NC}"
        for item in "${SKIPPED[@]}"; do
            echo "  • ${item}"
        done
        echo ""
    fi

    if [ -n "$PRESERVED_BACKUP_DIR" ]; then
        echo -e "${GREEN}Preserved:${NC}"
        echo "  ✓ Backups directory: ${CYAN}$PRESERVED_BACKUP_DIR${NC}"
        echo ""
    fi

    echo -e "${BLUE}Note:${NC} The brain-dump source code remains in this directory."
    echo "  To reinstall: ${CYAN}./install.sh${NC}"
}

# Show help
show_help() {
    echo "Brain Dump Uninstaller"
    echo ""
    echo "Usage: ./uninstall.sh [options]"
    echo ""
    echo "Options:"
    echo "  --vscode       Remove VS Code integration only"
    echo "  --claude       Remove Claude Code integration only"
    echo "  --cursor       Remove Cursor integration only"
    echo "  --opencode     Remove OpenCode integration only"
    echo "  --copilot      Remove Copilot CLI integration only"
    echo "  --codex        Remove Codex integration only"
    echo "  --sandbox      Remove Claude Code sandbox configuration"
    echo "  --devcontainer Remove devcontainer Docker volumes (not user data)"
    echo "  --docker       Remove Docker sandbox artifacts only"
    echo "  --cli          Remove brain-dump CLI from global path"
    echo "  --all          Remove everything (including database, backups, and all data)"
    echo "  --keep-backup  Remove everything but preserve database backups"
    echo "  --help         Show this help message"
    echo ""
    echo "Without options, removes IDE integrations and CLI but keeps data and Docker."
    echo ""
    echo "What gets removed:"
    echo "  VS Code:       MCP config, agents, skills, prompts"
    echo "  Claude Code:   MCP config in ~/.claude.json"
    echo "  Cursor:        MCP config, subagents, skills, commands in ~/.cursor/"
    echo "  OpenCode:      MCP config, agents in ~/.config/opencode/"
    echo "  Copilot CLI:   MCP config, agents, skills, hooks in ~/.copilot/"
    echo "  Codex:         MCP config in ~/.codex/config.toml"
    echo "  Sandbox:       Sandbox config in ~/.claude/settings.json"
    echo "  Devcontainer:  Docker volumes (pnpm store, bash history, claude config)"
    echo "                 Does NOT remove your Brain Dump data (bind-mounted)"
    echo "  Docker:        ralph-net network, sandbox image, running containers"
    echo "  CLI:           Global 'brain-dump' command (pnpm unlink)"
    echo "  Data (--all):  Database, attachments, backups, ~/.brain-dump/scripts"
}

# Main
main() {
    REMOVE_VSCODE=false
    REMOVE_CLAUDE=false
    REMOVE_CURSOR=false
    REMOVE_OPENCODE=false
    REMOVE_COPILOT=false
    REMOVE_CODEX=false
    REMOVE_SANDBOX=false
    REMOVE_DEVCONTAINER=false
    REMOVE_DOCKER=false
    REMOVE_CLI=false
    REMOVE_DATA=false
    KEEP_BACKUP=false
    PRESERVED_BACKUP_DIR=""

    # Parse arguments
    if [ $# -eq 0 ]; then
        # Default: remove all IDE integrations and CLI
        REMOVE_VSCODE=true
        REMOVE_CLAUDE=true
        REMOVE_CURSOR=true
        REMOVE_OPENCODE=true
        REMOVE_COPILOT=true
        REMOVE_CODEX=true
        REMOVE_CLI=true
    else
        for arg in "$@"; do
            case $arg in
                --help|-h)
                    show_help
                    exit 0
                    ;;
                --vscode)
                    REMOVE_VSCODE=true
                    ;;
                --claude)
                    REMOVE_CLAUDE=true
                    ;;
                --cursor)
                    REMOVE_CURSOR=true
                    ;;
                --opencode)
                    REMOVE_OPENCODE=true
                    ;;
                --copilot)
                    REMOVE_COPILOT=true
                    ;;
                --codex)
                    REMOVE_CODEX=true
                    ;;
                --sandbox)
                    REMOVE_SANDBOX=true
                    ;;
                --devcontainer)
                    REMOVE_DEVCONTAINER=true
                    ;;
                --docker)
                    REMOVE_DOCKER=true
                    ;;
                --cli)
                    REMOVE_CLI=true
                    ;;
                --all)
                    REMOVE_VSCODE=true
                    REMOVE_CLAUDE=true
                    REMOVE_CURSOR=true
                    REMOVE_OPENCODE=true
                    REMOVE_COPILOT=true
                    REMOVE_CODEX=true
                    REMOVE_SANDBOX=true
                    REMOVE_DEVCONTAINER=true
                    REMOVE_DOCKER=true
                    REMOVE_CLI=true
                    REMOVE_DATA=true
                    ;;
                --keep-backup)
                    REMOVE_VSCODE=true
                    REMOVE_CLAUDE=true
                    REMOVE_CURSOR=true
                    REMOVE_OPENCODE=true
                    REMOVE_COPILOT=true
                    REMOVE_CODEX=true
                    REMOVE_SANDBOX=true
                    REMOVE_DEVCONTAINER=true
                    REMOVE_DOCKER=true
                    REMOVE_CLI=true
                    REMOVE_DATA=true
                    KEEP_BACKUP=true
                    ;;
            esac
        done
    fi

    print_header

    detect_os
    print_info "Detected OS: $OS"

    # Show prominent backup warning when --all is used (and backups exist)
    if [ "$REMOVE_DATA" = true ] && [ "$KEEP_BACKUP" = false ]; then
        get_data_paths
        local backup_dir
        backup_dir="$(get_backup_dir)"

        if [ -d "$backup_dir" ]; then
            local backup_count
            local backup_size
            backup_count=$(find "$backup_dir" -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' ')
            backup_size=$(du -sh "$backup_dir" 2>/dev/null | cut -f1)

            echo ""
            echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
            echo -e "${RED}║${NC}  ${YELLOW}WARNING: --all will permanently delete your backups!${NC}    ${RED}║${NC}"
            echo -e "${RED}║${NC}                                                            ${RED}║${NC}"
            echo -e "${RED}║${NC}  This includes ALL database backups in:                    ${RED}║${NC}"
            echo -e "${RED}║${NC}    ${CYAN}$backup_dir${NC}"
            echo -e "${RED}║${NC}                                                            ${RED}║${NC}"
            echo -e "${RED}║${NC}  To keep backups, use: ${GREEN}./uninstall.sh --keep-backup${NC}        ${RED}║${NC}"
            echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"

            if [ "$backup_count" -gt 0 ] 2>/dev/null; then
                echo ""
                echo -e "  Found ${YELLOW}${backup_count} backup(s)${NC} (${backup_size} total)"
            fi

            echo ""
            echo -e "Type ${RED}DELETE${NC} to confirm backup removal, or press Enter to switch to --keep-backup mode:"
            read -r confirm_delete
            if [ "$confirm_delete" != "DELETE" ]; then
                print_info "Switching to --keep-backup mode (backups will be preserved)"
                KEEP_BACKUP=true
            fi
        fi
    fi

    [ "$REMOVE_VSCODE" = true ] && remove_vscode
    [ "$REMOVE_CLAUDE" = true ] && remove_claude
    [ "$REMOVE_CURSOR" = true ] && remove_cursor
    [ "$REMOVE_OPENCODE" = true ] && remove_opencode
    [ "$REMOVE_COPILOT" = true ] && remove_copilot_cli
    [ "$REMOVE_CODEX" = true ] && remove_codex
    [ "$REMOVE_SANDBOX" = true ] && remove_sandbox
    [ "$REMOVE_DEVCONTAINER" = true ] && remove_devcontainer
    [ "$REMOVE_DOCKER" = true ] && remove_docker
    [ "$REMOVE_CLI" = true ] && remove_cli
    [ "$REMOVE_DATA" = true ] && remove_data

    print_summary
}

main "$@"
