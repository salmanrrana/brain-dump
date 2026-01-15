#!/bin/bash
# Brain Dump - Uninstall Script
# Removes all Brain Dump configurations from your system
#
# Usage:
#   ./uninstall.sh              # Interactive uninstall
#   ./uninstall.sh --vscode     # Remove VS Code integration only
#   ./uninstall.sh --claude     # Remove Claude Code integration only
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
    echo "  --vscode    Remove VS Code integration only"
    echo "  --claude    Remove Claude Code integration only"
    echo "  --all       Remove everything (including database and data)"
    echo "  --help      Show this help message"
    echo ""
    echo "Without options, removes IDE integrations but keeps data."
    echo ""
    echo "What gets removed:"
    echo "  VS Code:     MCP config, agents, skills, prompts"
    echo "  Claude Code: MCP config in ~/.claude.json"
    echo "  Data (--all): Database, attachments, backups"
}

# Main
main() {
    REMOVE_VSCODE=false
    REMOVE_CLAUDE=false
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
                --all)
                    REMOVE_VSCODE=true
                    REMOVE_CLAUDE=true
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
    [ "$REMOVE_DATA" = true ] && remove_data

    print_summary
}

main "$@"
