#!/bin/bash
# Brain Dump - Uninstall Script
# Removes all Brain Dump configurations from your system
#
# Usage:
#   ./uninstall.sh              # Interactive uninstall
#   ./uninstall.sh --vscode     # Remove VS Code integration only
#   ./uninstall.sh --claude     # Remove Claude Code integration only
#   ./uninstall.sh --sandbox    # Remove Claude Code sandbox configuration
#   ./uninstall.sh --devcontainer # Remove devcontainer Docker volumes
#   ./uninstall.sh --all        # Remove everything (including data)
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

# Remove data (database, attachments, backups)
remove_data() {
    print_step "Removing Brain Dump data"

    get_data_paths

    if [ -d "$DATA_DIR" ]; then
        print_warning "This will delete your database, attachments, and backups!"
        echo -e "  Location: ${YELLOW}$DATA_DIR${NC}"
        echo ""
        read -r -p "Are you sure? (y/N): " confirm
        if [[ "$confirm" =~ ^[Yy]$ ]]; then
            rm -rf "$DATA_DIR"
            print_success "Removed data directory"
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
        rm -rf "$STATE_DIR"
        print_success "Removed state directory"
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
    echo "  --sandbox      Remove Claude Code sandbox configuration"
    echo "  --devcontainer Remove devcontainer Docker volumes (not user data)"
    echo "  --docker       Remove Docker sandbox artifacts only"
    echo "  --all          Remove everything (including database, data, and Docker)"
    echo "  --help         Show this help message"
    echo ""
    echo "Without options, removes IDE integrations but keeps data and Docker."
    echo ""
    echo "What gets removed:"
    echo "  VS Code:       MCP config, agents, skills, prompts"
    echo "  Claude Code:   MCP config in ~/.claude.json"
    echo "  Sandbox:       Sandbox config in ~/.claude/settings.json"
    echo "  Devcontainer:  Docker volumes (pnpm store, bash history, claude config)"
    echo "                 Does NOT remove your Brain Dump data (bind-mounted)"
    echo "  Docker:        ralph-net network, sandbox image, running containers"
    echo "  Data (--all):  Database, attachments, backups, ~/.brain-dump/scripts"
}

# Main
main() {
    REMOVE_VSCODE=false
    REMOVE_CLAUDE=false
    REMOVE_SANDBOX=false
    REMOVE_DEVCONTAINER=false
    REMOVE_DOCKER=false
    REMOVE_DATA=false

    # Parse arguments
    if [ $# -eq 0 ]; then
        # Default: remove both IDE integrations
        REMOVE_VSCODE=true
        REMOVE_CLAUDE=true
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
                --sandbox)
                    REMOVE_SANDBOX=true
                    ;;
                --devcontainer)
                    REMOVE_DEVCONTAINER=true
                    ;;
                --docker)
                    REMOVE_DOCKER=true
                    ;;
                --all)
                    REMOVE_VSCODE=true
                    REMOVE_CLAUDE=true
                    REMOVE_SANDBOX=true
                    REMOVE_DEVCONTAINER=true
                    REMOVE_DOCKER=true
                    REMOVE_DATA=true
                    ;;
            esac
        done
    fi

    print_header

    detect_os
    print_info "Detected OS: $OS"

    [ "$REMOVE_VSCODE" = true ] && remove_vscode
    [ "$REMOVE_CLAUDE" = true ] && remove_claude
    [ "$REMOVE_SANDBOX" = true ] && remove_sandbox
    [ "$REMOVE_DEVCONTAINER" = true ] && remove_devcontainer
    [ "$REMOVE_DOCKER" = true ] && remove_docker
    [ "$REMOVE_DATA" = true ] && remove_data

    print_summary
}

main "$@"
