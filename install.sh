#!/bin/bash
# Brain Dump - One Command Install
# Handles prerequisites, dependencies, migrations, and IDE integration
#
# Usage:
#   ./install.sh                  # Install with prompts for IDE choice
#   ./install.sh --claude         # Install with Claude Code integration
#   ./install.sh --vscode         # Install with VS Code integration
#   ./install.sh --claude --vscode # Install with both IDEs
#   ./install.sh --help           # Show help
#
# After cloning, just run:
#   cd brain-dump && ./install.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Track what was installed for summary
INSTALLED=()
SKIPPED=()
FAILED=()

# Helper functions
print_header() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║          Brain Dump - Automated Installer                 ║"
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

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Initialize git submodules (for vendored third-party skills)
init_submodules() {
    print_step "Initializing git submodules"

    if ! command_exists git; then
        print_warning "Git is not installed. Skipping submodule initialization."
        print_info "Install git to enable vendored skills"
        SKIPPED+=("Git submodules (git not installed)")
        return 0
    fi

    if [ -f ".gitmodules" ]; then
        if git submodule update --init --recursive; then
            print_success "Git submodules initialized"
            INSTALLED+=("Git submodules")
        else
            print_warning "Could not initialize submodules"
            SKIPPED+=("Git submodules (init failed)")
        fi
    else
        print_info "No submodules configured"
        SKIPPED+=("Git submodules (none configured)")
    fi
}

# Update vendored skills from upstream
update_vendored_skills() {
    print_step "Updating vendored skills"

    if [ ! -f ".gitmodules" ]; then
        print_error "No submodules configured"
        FAILED+=("Skills update (no submodules)")
        return 1
    fi

    if ! command_exists git; then
        print_error "Git is not installed"
        FAILED+=("Skills update (git not installed)")
        return 1
    fi

    print_info "Pulling latest from upstream..."
    if git submodule update --remote --merge; then
        print_success "Skills updated to latest"

        # Show what changed
        if [ -d "vendor/agent-skills" ]; then
            local latest_commit
            latest_commit=$(cd vendor/agent-skills && git log -1 --format="%h %s" 2>/dev/null)
            if [ -n "$latest_commit" ]; then
                print_info "Latest: $latest_commit"
            fi
        fi

        INSTALLED+=("Skills update")
        return 0
    else
        print_error "Failed to update submodules"
        FAILED+=("Skills update")
        return 1
    fi
}

# Install Node.js via nvm
install_node() {
    print_step "Checking Node.js installation"

    if command_exists node; then
        NODE_VERSION=$(node --version)
        # Extract major version, handling non-standard formats (e.g., v18.0.0-nightly)
        MAJOR_VERSION=$(echo "$NODE_VERSION" | sed 's/^v//' | cut -d. -f1 | grep -oE '^[0-9]+' || echo "0")
        if [ -n "$MAJOR_VERSION" ] && [ "$MAJOR_VERSION" -ge 18 ] 2>/dev/null; then
            print_success "Node.js already installed: $NODE_VERSION"
            SKIPPED+=("Node.js (already installed)")
            return 0
        else
            print_warning "Node.js $NODE_VERSION found, but 18+ required"
        fi
    fi

    print_info "Node.js 18+ not found. Attempting to install via nvm..."

    # Check for nvm
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    if [ -s "$NVM_DIR/nvm.sh" ]; then
        \. "$NVM_DIR/nvm.sh"
    fi

    if ! command_exists nvm; then
        print_info "Installing nvm..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

        # Source nvm
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

        if ! command_exists nvm; then
            print_error "nvm installation failed"
            print_info "Please install Node.js 18+ manually:"
            if [ "$OS" = "macos" ]; then
                print_info "  brew install node@18"
            else
                print_info "  https://nodejs.org/en/download/"
            fi
            FAILED+=("Node.js (manual install required)")
            return 1
        fi
        INSTALLED+=("nvm")
    fi

    # Install Node via nvm
    print_info "Installing Node.js 18 via nvm..."
    nvm install 18
    nvm use 18
    nvm alias default 18

    if command_exists node; then
        print_success "Node.js installed: $(node --version)"
        INSTALLED+=("Node.js 18")
        return 0
    else
        print_error "Node.js installation failed"
        FAILED+=("Node.js")
        return 1
    fi
}

# Install pnpm
install_pnpm() {
    print_step "Checking pnpm installation"

    if command_exists pnpm; then
        PNPM_VERSION=$(pnpm --version)
        print_success "pnpm already installed: $PNPM_VERSION"
        SKIPPED+=("pnpm (already installed)")
        return 0
    fi

    print_info "Installing pnpm..."

    if command_exists npm; then
        npm install -g pnpm
    elif [ "$OS" = "macos" ] && command_exists brew; then
        brew install pnpm
    else
        curl -fsSL https://get.pnpm.io/install.sh | sh -

        # Source pnpm
        export PNPM_HOME="$HOME/.local/share/pnpm"
        export PATH="$PNPM_HOME:$PATH"
    fi

    # Refresh shell to pick up pnpm
    hash -r 2>/dev/null || true

    if command_exists pnpm; then
        print_success "pnpm installed: $(pnpm --version)"
        INSTALLED+=("pnpm")
        return 0
    else
        print_error "pnpm installation failed"
        print_info "Try: npm install -g pnpm"
        FAILED+=("pnpm")
        return 1
    fi
}

# Install project dependencies
install_dependencies() {
    print_step "Installing project dependencies"

    if [ ! -f "package.json" ]; then
        print_error "package.json not found. Are you in the Brain Dump directory?"
        FAILED+=("Project dependencies (wrong directory)")
        return 1
    fi

    # Check if node_modules exists and is not empty
    if [ -d "node_modules" ] && [ "$(ls -A node_modules 2>/dev/null)" ]; then
        print_info "node_modules exists, checking if up to date..."
    fi

    print_info "Running pnpm install..."
    if pnpm install; then
        print_success "Project dependencies installed"
        INSTALLED+=("Project dependencies")
        return 0
    else
        print_error "Dependency installation failed"
        FAILED+=("Project dependencies")
        return 1
    fi
}

# Install MCP server dependencies (separate package.json)
install_mcp_dependencies() {
    print_step "Installing MCP server dependencies"

    MCP_SERVER_DIR="$(pwd)/mcp-server"

    if [ ! -d "$MCP_SERVER_DIR" ]; then
        print_warning "MCP server directory not found at $MCP_SERVER_DIR"
        SKIPPED+=("MCP server dependencies (directory not found)")
        return 0
    fi

    if [ ! -f "$MCP_SERVER_DIR/package.json" ]; then
        print_warning "MCP server package.json not found"
        SKIPPED+=("MCP server dependencies (no package.json)")
        return 0
    fi

    print_info "Installing MCP server dependencies in mcp-server/..."
    if (cd "$MCP_SERVER_DIR" && pnpm install); then
        print_success "MCP server dependencies installed"
        INSTALLED+=("MCP server dependencies")
        return 0
    else
        print_error "MCP server dependency installation failed"
        FAILED+=("MCP server dependencies")
        return 1
    fi
}

# Run database migrations
run_migrations() {
    print_step "Setting up database"

    if [ ! -f "drizzle.config.ts" ]; then
        print_error "drizzle.config.ts not found"
        FAILED+=("Database migrations (config missing)")
        return 1
    fi

    print_info "Running database migrations..."

    # Capture migration output to check for "already exists" errors
    local migration_output
    migration_output=$(pnpm db:migrate 2>&1)
    local migration_status=$?

    if [ $migration_status -eq 0 ]; then
        print_success "Database migrations complete"
        INSTALLED+=("Database")
        return 0
    elif echo "$migration_output" | grep -q "already exists"; then
        # Tables already exist - database is already set up
        print_success "Database already initialized"
        SKIPPED+=("Database (already exists)")
        return 0
    else
        print_error "Database migration failed"
        echo "$migration_output" | tail -5
        FAILED+=("Database migrations")
        return 1
    fi
}

# Configure MCP server in ~/.claude.json
configure_mcp_server() {
    print_step "Configuring Claude Code MCP server"

    CLAUDE_CONFIG="$HOME/.claude.json"
    BRAIN_DUMP_DIR="$(pwd)"
    MCP_SERVER_PATH="$BRAIN_DUMP_DIR/mcp-server/index.js"

    # Check if MCP server file exists
    if [ ! -f "$MCP_SERVER_PATH" ]; then
        print_warning "MCP server file not found at $MCP_SERVER_PATH"
        SKIPPED+=("MCP server (file not found)")
        return 0
    fi

    # Handle ~/.claude.json
    if [ ! -f "$CLAUDE_CONFIG" ]; then
        print_info "Creating ~/.claude.json..."
        cat > "$CLAUDE_CONFIG" << EOF
{
  "mcpServers": {
    "brain-dump": {
      "command": "node",
      "args": ["$MCP_SERVER_PATH"]
    }
  }
}
EOF
        print_success "Created ~/.claude.json with brain-dump server"
        INSTALLED+=("MCP server config")
        return 0
    fi

    # Check if brain-dump already configured
    if grep -q '"brain-dump"' "$CLAUDE_CONFIG"; then
        print_success "brain-dump MCP server already configured"
        SKIPPED+=("MCP server (already configured)")
        return 0
    fi

    # Attempt to add to existing config using a temp file
    print_info "Adding brain-dump to existing ~/.claude.json..."

    if grep -q '"mcpServers"' "$CLAUDE_CONFIG"; then
        # mcpServers exists, need to add to it
        # Create a backup first
        cp "$CLAUDE_CONFIG" "$CLAUDE_CONFIG.backup"

        # Try to use node/jq to merge, or provide manual instructions
        if command_exists node; then
            local node_error
            node_error=$(node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('$CLAUDE_CONFIG', 'utf8'));
config.mcpServers = config.mcpServers || {};
config.mcpServers['brain-dump'] = {
    command: 'node',
    args: ['$MCP_SERVER_PATH']
};
fs.writeFileSync('$CLAUDE_CONFIG', JSON.stringify(config, null, 2));
console.log('Config updated successfully');
" 2>&1) && {
                print_success "Added brain-dump to ~/.claude.json"
                INSTALLED+=("MCP server config")
                return 0
            }
            # Show the actual error if node command failed
            if [ -n "$node_error" ]; then
                print_warning "JSON merge failed: $node_error"
            fi
        fi

        # Fallback to manual instructions
        print_warning "Could not auto-merge. Please add this to your mcpServers in ~/.claude.json:"
        echo ""
        echo "    \"brain-dump\": {"
        echo "      \"command\": \"node\","
        echo "      \"args\": [\"$MCP_SERVER_PATH\"]"
        echo "    }"
        echo ""
        SKIPPED+=("MCP server (manual merge required)")
    else
        # No mcpServers section, wrap existing config
        print_warning "~/.claude.json exists but has no mcpServers section"
        print_info "Please add the mcpServers section manually:"
        echo ""
        cat << EOF
{
  "mcpServers": {
    "brain-dump": {
      "command": "node",
      "args": ["$MCP_SERVER_PATH"]
    }
  }
}
EOF
        echo ""
        SKIPPED+=("MCP server (manual config required)")
    fi
}

# Install Claude CLI plugins
install_claude_plugins() {
    print_step "Installing Claude Code plugins"

    if ! command_exists claude; then
        print_warning "Claude CLI not found. Skipping plugin installation."
        print_info "Install Claude CLI: npm install -g @anthropic-ai/claude-code"
        print_info "Then run: claude plugin install pr-review-toolkit code-simplifier"
        SKIPPED+=("Claude plugins (CLI not installed)")
        return 0
    fi

    local plugins_installed=0

    print_info "Installing pr-review-toolkit..."
    if claude plugin install pr-review-toolkit 2>/dev/null; then
        print_success "pr-review-toolkit installed"
        plugins_installed=$((plugins_installed + 1))
    else
        print_warning "pr-review-toolkit already installed or unavailable"
    fi

    print_info "Installing code-simplifier..."
    if claude plugin install code-simplifier 2>/dev/null; then
        print_success "code-simplifier installed"
        plugins_installed=$((plugins_installed + 1))
    else
        print_warning "code-simplifier already installed or unavailable"
    fi

    if [ $plugins_installed -gt 0 ]; then
        INSTALLED+=("Claude plugins ($plugins_installed)")
    else
        SKIPPED+=("Claude plugins (already installed)")
    fi
}

# Setup Claude Code skills from vendored third-party skills
setup_claude_skills() {
    print_step "Setting up Claude Code skills"

    CLAUDE_SKILLS_DIR="$HOME/.claude/skills"
    VENDORED_SKILLS="$(pwd)/vendor/agent-skills/skills"

    if [ ! -d "$VENDORED_SKILLS" ]; then
        print_warning "Vendored skills not found at $VENDORED_SKILLS"
        print_info "Run: git submodule update --init"
        SKIPPED+=("Claude skills (submodule not initialized)")
        return 0
    fi

    if ! mkdir -p "$CLAUDE_SKILLS_DIR"; then
        print_error "Failed to create Claude skills directory: $CLAUDE_SKILLS_DIR"
        print_info "Check permissions on $HOME/.claude"
        FAILED+=("Claude skills (directory creation failed)")
        return 1
    fi

    local skills_installed=0
    local skills_updated=0
    local skills_failed=0

    # Enable nullglob to handle case when no matching directories exist
    local old_nullglob
    old_nullglob=$(shopt -p nullglob 2>/dev/null || echo "shopt -u nullglob")
    shopt -s nullglob

    for skill_dir in "$VENDORED_SKILLS"/*/; do
        if [ -d "$skill_dir" ] && [ -f "$skill_dir/SKILL.md" ]; then
            local skill_name=$(basename "$skill_dir")
            local target_path="$CLAUDE_SKILLS_DIR/$skill_name"

            if [ -d "$target_path" ]; then
                # Check if content is different
                if ! diff -rq "$skill_dir" "$target_path" >/dev/null 2>&1; then
                    # Backup-then-replace pattern for safe updates
                    local backup_path="${target_path}.backup.$$"
                    mv "$target_path" "$backup_path"
                    if cp -r "$skill_dir" "$target_path"; then
                        rm -rf "$backup_path"
                        print_success "  $skill_name (updated)"
                        skills_updated=$((skills_updated + 1))
                    else
                        # Restore from backup on failure
                        mv "$backup_path" "$target_path"
                        print_error "  $skill_name (update FAILED - restored previous)"
                        skills_failed=$((skills_failed + 1))
                    fi
                else
                    print_info "  $skill_name (exists)"
                fi
            else
                if cp -r "$skill_dir" "$target_path"; then
                    print_success "  $skill_name"
                    skills_installed=$((skills_installed + 1))
                else
                    print_error "  $skill_name (install FAILED)"
                    skills_failed=$((skills_failed + 1))
                fi
            fi
        fi
    done

    # Restore previous nullglob setting
    eval "$old_nullglob"

    local total=$((skills_installed + skills_updated))
    if [ $total -gt 0 ]; then
        INSTALLED+=("Claude skills ($total)")
        print_info "Skills location: $CLAUDE_SKILLS_DIR"
    else
        SKIPPED+=("Claude skills (already installed)")
    fi

    if [ $skills_failed -gt 0 ]; then
        FAILED+=("Claude skills ($skills_failed failed)")
    fi
}

# Setup project-specific Claude config
setup_project_config() {
    print_step "Verifying project configuration"

    PROJECT_CLAUDE_DIR=".claude"

    if [ -d "$PROJECT_CLAUDE_DIR" ]; then
        print_success "Project .claude directory exists"

        # List what's configured
        if [ -d "$PROJECT_CLAUDE_DIR/hooks" ] && [ "$(ls -A "$PROJECT_CLAUDE_DIR/hooks" 2>/dev/null)" ]; then
            print_info "  Hooks: $(ls "$PROJECT_CLAUDE_DIR/hooks" | wc -l | tr -d ' ') configured"
        fi
        if [ -d "$PROJECT_CLAUDE_DIR/agents" ] && [ "$(ls -A "$PROJECT_CLAUDE_DIR/agents" 2>/dev/null)" ]; then
            print_info "  Agents: $(ls "$PROJECT_CLAUDE_DIR/agents" | wc -l | tr -d ' ') configured"
        fi
        if [ -d "$PROJECT_CLAUDE_DIR/commands" ] && [ "$(ls -A "$PROJECT_CLAUDE_DIR/commands" 2>/dev/null)" ]; then
            print_info "  Commands: $(ls "$PROJECT_CLAUDE_DIR/commands" | wc -l | tr -d ' ') configured"
        fi

        SKIPPED+=("Claude project config (already exists)")
    else
        print_warning "No .claude directory found"
        print_info "Project-specific Claude config will be created on first run"
    fi
}

# ============================================================================
# VS Code Integration
# ============================================================================

# Get VS Code paths based on OS
# Per VS Code docs:
#   - Agents: ~/Library/Application Support/Code/User/agents/ (macOS)
#   - Skills: ~/.copilot/skills/ (global) or .github/skills/ (workspace)
#   - MCP: ~/Library/Application Support/Code/User/mcp.json (macOS)
#   - Prompts: ~/Library/Application Support/Code/User/prompts/
get_vscode_paths() {
    case "$OS" in
        macos)
            VSCODE_USER_DIR="$HOME/Library/Application Support/Code/User"
            VSCODE_INSIDERS_USER_DIR="$HOME/Library/Application Support/Code - Insiders/User"
            COPILOT_SKILLS_DIR="$HOME/.copilot/skills"
            ;;
        linux)
            VSCODE_USER_DIR="$HOME/.config/Code/User"
            VSCODE_INSIDERS_USER_DIR="$HOME/.config/Code - Insiders/User"
            COPILOT_SKILLS_DIR="$HOME/.copilot/skills"
            ;;
        windows)
            VSCODE_USER_DIR="$APPDATA/Code/User"
            VSCODE_INSIDERS_USER_DIR="$APPDATA/Code - Insiders/User"
            COPILOT_SKILLS_DIR="$USERPROFILE/.copilot/skills"
            ;;
        *)
            VSCODE_USER_DIR=""
            VSCODE_INSIDERS_USER_DIR=""
            COPILOT_SKILLS_DIR=""
            ;;
    esac

    # Detect which VS Code is installed
    if [ -d "$VSCODE_USER_DIR" ]; then
        VSCODE_TARGET="$VSCODE_USER_DIR"
        VSCODE_TYPE="VS Code"
    elif [ -d "$VSCODE_INSIDERS_USER_DIR" ]; then
        VSCODE_TARGET="$VSCODE_INSIDERS_USER_DIR"
        VSCODE_TYPE="VS Code Insiders"
    else
        VSCODE_TARGET=""
        VSCODE_TYPE=""
    fi
}

# Configure MCP server for VS Code
# MCP config goes in VS Code User profile: ~/Library/Application Support/Code/User/mcp.json
configure_vscode_mcp() {
    print_step "Configuring VS Code MCP server"

    get_vscode_paths

    if [ -z "$VSCODE_TARGET" ]; then
        print_warning "VS Code not found. Skipping MCP configuration."
        print_info "Install VS Code first, then re-run with --vscode"
        SKIPPED+=("VS Code MCP server (VS Code not found)")
        return 0
    fi

    BRAIN_DUMP_DIR="$(pwd)"
    MCP_SERVER_PATH="$BRAIN_DUMP_DIR/mcp-server/index.js"
    MCP_CONFIG_FILE="$VSCODE_TARGET/mcp.json"

    # Helper function to create fresh MCP config
    create_mcp_config() {
        cat > "$MCP_CONFIG_FILE" << EOF
{
  "servers": {
    "brain-dump": {
      "type": "stdio",
      "command": "node",
      "args": ["$MCP_SERVER_PATH"]
    }
  }
}
EOF
    }

    # Check 1: Does the file exist?
    if [ ! -f "$MCP_CONFIG_FILE" ]; then
        print_info "Creating VS Code mcp.json..."
        create_mcp_config
        print_success "Created VS Code mcp.json with brain-dump server"
        INSTALLED+=("VS Code MCP server")
        return 0
    fi

    # Check 2: Does the file have content?
    if [ ! -s "$MCP_CONFIG_FILE" ]; then
        print_info "mcp.json is empty, recreating..."
        create_mcp_config
        print_success "Created VS Code mcp.json with brain-dump server"
        INSTALLED+=("VS Code MCP server")
        return 0
    fi

    # Check 3: Does it have a valid servers section?
    if ! grep -q '"servers"' "$MCP_CONFIG_FILE"; then
        print_info "mcp.json missing servers section, recreating..."
        create_mcp_config
        print_success "Created VS Code mcp.json with brain-dump server"
        INSTALLED+=("VS Code MCP server")
        return 0
    fi

    # Check 4: Is brain-dump already configured?
    if grep -q '"brain-dump"' "$MCP_CONFIG_FILE"; then
        print_success "brain-dump MCP server already configured in VS Code"
        SKIPPED+=("VS Code MCP server (already configured)")
        return 0
    fi

    # File exists with servers section but no brain-dump - try to add it
    print_info "Adding brain-dump to existing mcp.json..."

    if command_exists node; then
        local node_error
        node_error=$(node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('$MCP_CONFIG_FILE', 'utf8'));
config.servers = config.servers || {};
config.servers['brain-dump'] = {
    type: 'stdio',
    command: 'node',
    args: ['$MCP_SERVER_PATH']
};
fs.writeFileSync('$MCP_CONFIG_FILE', JSON.stringify(config, null, 2));
console.log('Config updated successfully');
" 2>&1) && {
            print_success "Added brain-dump to VS Code mcp.json"
            INSTALLED+=("VS Code MCP server")
            return 0
        }
        if [ -n "$node_error" ]; then
            print_warning "JSON merge failed: $node_error"
        fi
    fi

    # Fallback to manual instructions
    print_warning "Could not auto-merge. Please add this to servers in VS Code mcp.json:"
    print_info "Location: $MCP_CONFIG_FILE"
    echo ""
    echo '  "brain-dump": {'
    echo '    "type": "stdio",'
    echo '    "command": "node",'
    echo "    \"args\": [\"$MCP_SERVER_PATH\"]"
    echo '  }'
    echo ""
    SKIPPED+=("VS Code MCP server (manual merge required)")
}

# Helper: link or update a symlink (handles broken symlinks and wrong targets)
link_or_update() {
    local source="${1%/}"  # Normalize: remove trailing slash from glob expansion
    local target="$2"
    local name=$(basename "$source")

    # Check if target is a symlink
    if [ -L "$target" ]; then
        local current_target=$(readlink "$target")
        if [ "$current_target" = "$source" ]; then
            # Symlink already points to correct location
            echo "exists"
            return 0
        else
            # Symlink points to wrong location - update it
            rm "$target"
            if ln -s "$source" "$target" 2>/dev/null; then
                echo "updated"
            else
                cp -r "$source" "$target"
                echo "updated_copy"
            fi
            return 0
        fi
    elif [ -e "$target" ]; then
        # Regular file/dir exists - skip
        echo "exists"
        return 0
    else
        # Doesn't exist - create
        if ln -s "$source" "$target" 2>/dev/null; then
            echo "created"
        else
            cp -r "$source" "$target"
            echo "created_copy"
        fi
        return 0
    fi
}

# Setup VS Code agents from .github/agents
# Per VS Code docs: https://code.visualstudio.com/docs/copilot/customization/custom-agents
# Global agents go to VS Code User prompts folder: ~/Library/Application Support/Code/User/prompts/
# This makes agents available across ALL workspaces, not just this project
setup_vscode_agents() {
    print_step "Setting up VS Code agents (global)"

    get_vscode_paths

    if [ -z "$VSCODE_TARGET" ]; then
        print_warning "VS Code user directory not found"
        print_info "Install VS Code first, then re-run with --vscode"
        SKIPPED+=("VS Code agents (VS Code not found)")
        return 0
    fi

    print_info "Found $VSCODE_TYPE"

    AGENTS_SOURCE="$(pwd)/.github/agents"
    # VS Code stores user-level agents in the prompts folder (same as prompts)
    AGENTS_TARGET="$VSCODE_TARGET/prompts"

    if [ ! -d "$AGENTS_SOURCE" ]; then
        print_warning "No .github/agents directory found in project"
        SKIPPED+=("VS Code agents (no source agents)")
        return 0
    fi

    mkdir -p "$AGENTS_TARGET"
    print_info "Installing agents to: $AGENTS_TARGET"

    local agents_linked=0
    local agents_updated=0

    # Enable nullglob to handle case when no matching files exist
    local old_nullglob
    old_nullglob=$(shopt -p nullglob 2>/dev/null || echo "shopt -u nullglob")
    shopt -s nullglob

    for agent_file in "$AGENTS_SOURCE"/*.agent.md; do
        if [ -f "$agent_file" ]; then
            local agent_name=$(basename "$agent_file")
            local target_path="$AGENTS_TARGET/$agent_name"
            # Copy files directly (VS Code may not follow symlinks)
            if [ -f "$target_path" ]; then
                # Check if content is different
                if ! cmp -s "$agent_file" "$target_path"; then
                    cp "$agent_file" "$target_path"
                    print_success "  $agent_name (updated)"
                    agents_updated=$((agents_updated + 1))
                else
                    print_info "  $agent_name (exists)"
                fi
            else
                cp "$agent_file" "$target_path"
                print_success "  $agent_name"
                agents_linked=$((agents_linked + 1))
            fi
        fi
    done

    # Restore previous nullglob setting
    eval "$old_nullglob"

    local total=$((agents_linked + agents_updated))
    if [ $total -gt 0 ]; then
        INSTALLED+=("VS Code agents ($total)")
    else
        SKIPPED+=("VS Code agents (already linked)")
    fi

    print_info "Agents will be available globally in all VS Code workspaces"
}

# Setup VS Code skills from .github/skills and vendor/agent-skills/skills
# Per VS Code docs, global skills go to ~/.copilot/skills/
setup_vscode_skills() {
    print_step "Setting up VS Code skills"

    get_vscode_paths

    if [ -z "$COPILOT_SKILLS_DIR" ]; then
        print_warning "Could not determine Copilot skills directory"
        SKIPPED+=("VS Code skills (unknown directory)")
        return 0
    fi

    if ! mkdir -p "$COPILOT_SKILLS_DIR"; then
        print_error "Failed to create Copilot skills directory: $COPILOT_SKILLS_DIR"
        print_info "Check permissions on $HOME/.copilot"
        FAILED+=("VS Code skills (directory creation failed)")
        return 1
    fi

    local skills_linked=0
    local skills_updated=0
    local skills_failed=0

    # Enable nullglob to handle case when no matching directories exist
    local old_nullglob
    old_nullglob=$(shopt -p nullglob 2>/dev/null || echo "shopt -u nullglob")
    shopt -s nullglob

    # Install project-specific skills from .github/skills
    SKILLS_SOURCE="$(pwd)/.github/skills"

    if [ -d "$SKILLS_SOURCE" ]; then
        print_info "Installing project skills..."

        for skill_dir in "$SKILLS_SOURCE"/*/; do
            if [ -d "$skill_dir" ]; then
                local skill_name=$(basename "$skill_dir")
                local target_path="$COPILOT_SKILLS_DIR/$skill_name"
                # Copy directories directly (VS Code may not follow symlinks)
                if [ -d "$target_path" ]; then
                    # Check if content is different by comparing file counts and sizes
                    if ! diff -rq "$skill_dir" "$target_path" >/dev/null 2>&1; then
                        # Backup-then-replace pattern for safe updates
                        local backup_path="${target_path}.backup.$$"
                        mv "$target_path" "$backup_path"
                        if cp -r "$skill_dir" "$target_path"; then
                            rm -rf "$backup_path"
                            print_success "  $skill_name (updated)"
                            skills_updated=$((skills_updated + 1))
                        else
                            # Restore from backup on failure
                            mv "$backup_path" "$target_path"
                            print_error "  $skill_name (update FAILED - restored previous)"
                            skills_failed=$((skills_failed + 1))
                        fi
                    else
                        print_info "  $skill_name (exists)"
                    fi
                else
                    # Remove broken symlink if exists
                    [ -L "$target_path" ] && rm "$target_path"
                    if cp -r "$skill_dir" "$target_path"; then
                        print_success "  $skill_name"
                        skills_linked=$((skills_linked + 1))
                    else
                        print_error "  $skill_name (install FAILED)"
                        skills_failed=$((skills_failed + 1))
                    fi
                fi
            fi
        done
    fi

    # Also install vendored third-party skills
    VENDORED_SKILLS="$(pwd)/vendor/agent-skills/skills"

    if [ -d "$VENDORED_SKILLS" ]; then
        print_info "Installing vendored skills..."

        for skill_dir in "$VENDORED_SKILLS"/*/; do
            if [ -d "$skill_dir" ] && [ -f "$skill_dir/SKILL.md" ]; then
                local skill_name=$(basename "$skill_dir")
                local target_path="$COPILOT_SKILLS_DIR/$skill_name"

                if [ -d "$target_path" ]; then
                    if ! diff -rq "$skill_dir" "$target_path" >/dev/null 2>&1; then
                        # Backup-then-replace pattern for safe updates
                        local backup_path="${target_path}.backup.$$"
                        mv "$target_path" "$backup_path"
                        if cp -r "$skill_dir" "$target_path"; then
                            rm -rf "$backup_path"
                            print_success "  $skill_name (updated)"
                            skills_updated=$((skills_updated + 1))
                        else
                            # Restore from backup on failure
                            mv "$backup_path" "$target_path"
                            print_error "  $skill_name (update FAILED - restored previous)"
                            skills_failed=$((skills_failed + 1))
                        fi
                    else
                        print_info "  $skill_name (exists)"
                    fi
                else
                    if cp -r "$skill_dir" "$target_path"; then
                        print_success "  $skill_name"
                        skills_linked=$((skills_linked + 1))
                    else
                        print_error "  $skill_name (install FAILED)"
                        skills_failed=$((skills_failed + 1))
                    fi
                fi
            fi
        done
    fi

    # Restore previous nullglob setting
    eval "$old_nullglob"

    local total=$((skills_linked + skills_updated))
    if [ $total -gt 0 ]; then
        INSTALLED+=("VS Code skills ($total)")
        print_info "Skills location: $COPILOT_SKILLS_DIR"
    else
        SKIPPED+=("VS Code skills (already linked)")
    fi

    if [ $skills_failed -gt 0 ]; then
        FAILED+=("VS Code skills ($skills_failed failed)")
    fi
}

# Setup VS Code prompts from .github/prompts
# Prompts go to VS Code User profile: ~/Library/Application Support/Code/User/prompts/
setup_vscode_prompts() {
    print_step "Setting up VS Code prompts"

    get_vscode_paths

    if [ -z "$VSCODE_TARGET" ]; then
        print_warning "VS Code user directory not found"
        SKIPPED+=("VS Code prompts (VS Code not found)")
        return 0
    fi

    PROMPTS_SOURCE="$(pwd)/.github/prompts"
    PROMPTS_TARGET="$VSCODE_TARGET/prompts"

    if [ ! -d "$PROMPTS_SOURCE" ]; then
        print_warning "No .github/prompts directory found in project"
        SKIPPED+=("VS Code prompts (no source prompts)")
        return 0
    fi

    mkdir -p "$PROMPTS_TARGET"

    local prompts_linked=0
    local prompts_updated=0

    # Enable nullglob to handle case when no matching files exist
    local old_nullglob
    old_nullglob=$(shopt -p nullglob 2>/dev/null || echo "shopt -u nullglob")
    shopt -s nullglob

    for prompt_file in "$PROMPTS_SOURCE"/*.prompt.md; do
        if [ -f "$prompt_file" ]; then
            local prompt_name=$(basename "$prompt_file")
            local target_path="$PROMPTS_TARGET/$prompt_name"
            # Copy files directly (VS Code may not follow symlinks)
            if [ -f "$target_path" ]; then
                # Check if content is different
                if ! cmp -s "$prompt_file" "$target_path"; then
                    cp "$prompt_file" "$target_path"
                    print_success "  $prompt_name (updated)"
                    prompts_updated=$((prompts_updated + 1))
                else
                    print_info "  $prompt_name (exists)"
                fi
            else
                # Remove broken symlink if exists
                [ -L "$target_path" ] && rm "$target_path"
                cp "$prompt_file" "$target_path"
                print_success "  $prompt_name"
                prompts_linked=$((prompts_linked + 1))
            fi
        fi
    done

    # Restore previous nullglob setting
    eval "$old_nullglob"

    local total=$((prompts_linked + prompts_updated))
    if [ $total -gt 0 ]; then
        INSTALLED+=("VS Code prompts ($total)")
    else
        SKIPPED+=("VS Code prompts (already linked)")
    fi
}

# Prompt user to select IDE(s)
prompt_ide_selection() {
    echo ""
    echo -e "${CYAN}Which IDE(s) do you use?${NC}"
    echo ""
    echo "  1) Claude Code (CLI)"
    echo "  2) VS Code"
    echo "  3) Both"
    echo "  4) Skip IDE setup (just install Brain Dump)"
    echo ""
    read -r -p "Enter choice [1-4]: " choice

    case $choice in
        1)
            SETUP_CLAUDE=true
            SETUP_VSCODE=false
            ;;
        2)
            SETUP_CLAUDE=false
            SETUP_VSCODE=true
            ;;
        3)
            SETUP_CLAUDE=true
            SETUP_VSCODE=true
            ;;
        4)
            SETUP_CLAUDE=false
            SETUP_VSCODE=false
            ;;
        *)
            print_warning "Invalid choice, defaulting to Claude Code"
            SETUP_CLAUDE=true
            SETUP_VSCODE=false
            ;;
    esac
}

# Print data locations based on OS
print_data_locations() {
    if [ "$OS" = "macos" ]; then
        echo "  Database:    ~/Library/Application Support/brain-dump/brain-dump.db"
        echo "  Attachments: ~/Library/Application Support/brain-dump/attachments/"
        echo "  Backups:     ~/Library/Application Support/brain-dump/backups/"
    else
        echo "  Database:    ~/.local/share/brain-dump/brain-dump.db"
        echo "  Attachments: ~/.local/share/brain-dump/attachments/"
        echo "  Backups:     ~/.local/state/brain-dump/backups/"
    fi
}

# Print installation summary
print_summary() {
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              Installation Complete!                        ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    if [ ${#INSTALLED[@]} -gt 0 ]; then
        echo -e "${GREEN}Installed:${NC}"
        for item in "${INSTALLED[@]}"; do
            echo "  ✓ ${item}"
        done
        echo ""
    fi

    if [ ${#SKIPPED[@]} -gt 0 ]; then
        echo -e "${YELLOW}Skipped (already configured):${NC}"
        for item in "${SKIPPED[@]}"; do
            echo "  • ${item}"
        done
        echo ""
    fi

    if [ ${#FAILED[@]} -gt 0 ]; then
        echo -e "${RED}Failed (manual action needed):${NC}"
        for item in "${FAILED[@]}"; do
            echo "  ✗ ${item}"
        done
        echo ""
    fi

    echo -e "${BLUE}Next steps:${NC}"
    echo -e "  1. Start Brain Dump:  ${CYAN}pnpm dev${NC}"
    echo -e "  2. Open browser:       ${CYAN}http://localhost:4242${NC}"
    echo -e "  3. Create a project and ticket"

    if [ "$SETUP_CLAUDE" = true ]; then
        echo "  4. Click 'Start with Claude' on a ticket"
        if ! command_exists claude; then
            echo ""
            echo -e "${YELLOW}Note:${NC} Install Claude CLI for full integration"
            echo "  npm install -g @anthropic-ai/claude-code"
        fi
    fi

    if [ "$SETUP_VSCODE" = true ]; then
        echo "  4. Restart VS Code to load MCP server"
        echo "  5. Use @ralph or /start-ticket in Copilot Chat"
    fi

    echo ""

    echo -e "${BLUE}Data locations:${NC}"
    print_data_locations
    echo ""

    # Show how to add other IDE later
    if [ "$SETUP_CLAUDE" = true ] && [ "$SETUP_VSCODE" = false ]; then
        echo -e "${BLUE}Want VS Code too?${NC} Run: ${CYAN}./install.sh --vscode${NC}"
        echo ""
    elif [ "$SETUP_VSCODE" = true ] && [ "$SETUP_CLAUDE" = false ]; then
        echo -e "${BLUE}Want Claude Code too?${NC} Run: ${CYAN}./install.sh --claude${NC}"
        echo ""
    fi
}

# Show help
show_help() {
    echo "Brain Dump Installer"
    echo ""
    echo "Usage: ./install.sh [options]"
    echo ""
    echo "IDE Options (pick one or both):"
    echo "  --claude    Set up Claude Code integration (MCP server + plugins)"
    echo "  --vscode    Set up VS Code integration (MCP server + agents + skills + prompts)"
    echo ""
    echo "  If no IDE flag is provided, you'll be prompted to choose."
    echo ""
    echo "Other Options:"
    echo "  --help          Show this help message"
    echo "  --skip-node     Skip Node.js installation check"
    echo "  --update-skills Update vendored skills from upstream"
    echo ""
    echo "Examples:"
    echo "  ./install.sh --claude                    # Claude Code only"
    echo "  ./install.sh --vscode                    # VS Code only"
    echo "  ./install.sh --claude --vscode           # Both IDEs"
    echo "  ./install.sh --update-skills --claude    # Update and install skills"
    echo "  ./install.sh                             # Interactive prompt"
    echo ""
    echo "This script will:"
    echo "  1. Install Node.js 18+ via nvm (if needed)"
    echo "  2. Install pnpm (if needed)"
    echo "  3. Install project dependencies"
    echo "  4. Run database migrations"
    echo "  5. Configure MCP server for your chosen IDE(s)"
    echo "  6. Install plugins/agents as applicable"
    echo ""
    echo "The script is idempotent - safe to run multiple times."
}

# Main installation flow
main() {
    # Parse arguments
    SKIP_NODE=false
    SETUP_CLAUDE=false
    SETUP_VSCODE=false
    UPDATE_SKILLS=false
    IDE_FLAG_PROVIDED=false

    for arg in "$@"; do
        case $arg in
            --help|-h)
                show_help
                exit 0
                ;;
            --skip-node)
                SKIP_NODE=true
                ;;
            --claude)
                SETUP_CLAUDE=true
                IDE_FLAG_PROVIDED=true
                ;;
            --vscode)
                SETUP_VSCODE=true
                IDE_FLAG_PROVIDED=true
                ;;
            --update-skills)
                UPDATE_SKILLS=true
                ;;
        esac
    done

    print_header

    detect_os
    print_info "Detected OS: $OS"

    # Get the directory where the script is located
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

    # Change to script directory if not already there
    if [ "$(pwd)" != "$SCRIPT_DIR" ]; then
        print_info "Changing to Brain Dump directory: $SCRIPT_DIR"
        cd "$SCRIPT_DIR"
    fi

    # Check if we're in the right directory
    if [ ! -f "package.json" ]; then
        print_error "package.json not found in $SCRIPT_DIR"
        print_info "Please run this script from the brain-dump repository root"
        exit 1
    fi

    if ! grep -q '"name"' package.json || ! grep -q 'brain-dump' package.json; then
        print_warning "This doesn't look like the Brain Dump repository"
        print_info "Continuing anyway..."
    fi

    # If no IDE flag provided, prompt user
    if [ "$IDE_FLAG_PROVIDED" = false ]; then
        prompt_ide_selection
    fi

    echo ""

    # Update vendored skills if requested
    if [ "$UPDATE_SKILLS" = true ]; then
        update_vendored_skills || true
    fi

    # Initialize git submodules first (vendored skills need to be pulled)
    init_submodules || true

    # Run installation steps
    if [ "$SKIP_NODE" = false ]; then
        install_node || true
    else
        print_step "Skipping Node.js check (--skip-node)"
        SKIPPED+=("Node.js (skipped)")
    fi

    install_pnpm || true
    install_dependencies || true
    install_mcp_dependencies || true
    run_migrations || true

    # Claude Code setup
    if [ "$SETUP_CLAUDE" = true ]; then
        configure_mcp_server || true
        install_claude_plugins || true
        setup_claude_skills || true
        setup_project_config || true
    fi

    # VS Code setup
    if [ "$SETUP_VSCODE" = true ]; then
        configure_vscode_mcp || true
        setup_vscode_agents || true
        setup_vscode_skills || true
        setup_vscode_prompts || true
    fi

    # If no IDE selected, just note it
    if [ "$SETUP_CLAUDE" = false ] && [ "$SETUP_VSCODE" = false ]; then
        print_step "Skipping IDE integration"
        print_info "Run again with --claude or --vscode to set up IDE integration"
        SKIPPED+=("IDE integration (not selected)")
    fi

    # Print summary
    print_summary

    # Exit with error if critical components failed
    for item in "${FAILED[@]}"; do
        if [[ "$item" == *"Node.js"* ]] || [[ "$item" == *"pnpm"* ]] || [[ "$item" == *"dependencies"* ]]; then
            print_error "Critical component failed. Please resolve the issues above."
            exit 1
        fi
    done
}

# Run main function
main "$@"
