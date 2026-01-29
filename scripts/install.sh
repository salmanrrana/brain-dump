#!/bin/bash
# Brain Dump - One Command Install
# Handles prerequisites, dependencies, migrations, and IDE integration
#
# Usage:
#   ./scripts/install.sh                  # Install with prompts for IDE choice
#   ./scripts/install.sh --claude         # Install with Claude Code integration
#   ./scripts/install.sh --vscode         # Install with VS Code integration
#   ./scripts/install.sh --cursor         # Install with Cursor integration
#   ./scripts/install.sh --claude --sandbox # Install with Claude Code + sandbox
#   ./scripts/install.sh --all            # Install all IDEs + sandbox
#   ./scripts/install.sh --help           # Show help
#
# After cloning, just run:
#   cd brain-dump && ./scripts/install.sh

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

# Run a setup script for IDE integrations
run_setup_script() {
    local name="$1"
    local setup_script="$2"

    print_step "Setting up ${name} integration"

    if [ ! -f "$setup_script" ]; then
        print_warning "${name} setup script not found: $setup_script"
        SKIPPED+=("${name} setup (script not found)")
        return 1
    fi

    if [ ! -x "$setup_script" ]; then
        print_info "Making setup script executable..."
        chmod +x "$setup_script"
    fi

    print_info "Running ${name} setup script..."
    # Capture both exit code and output for better error reporting
    local script_output
    script_output=$(bash "$setup_script" 2>&1)
    local script_exit_code=$?

    if [ $script_exit_code -eq 0 ]; then
        print_success "${name} integration configured"
        INSTALLED+=("${name} integration")
        return 0
    else
        print_error "${name} setup script failed (exit code: $script_exit_code)"
        # Only show output if it's not empty and contains error indicators
        if [ -n "$script_output" ] && echo "$script_output" | grep -qiE "(error|failed|fail|cannot|can't)"; then
            echo "Script output:" >&2
            echo "$script_output" | head -20 >&2
        fi
        FAILED+=("${name} integration")
        return 1
    fi
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
        MAJOR_VERSION=$(echo "$NODE_VERSION" | sed 's/^v//' | cut -d. -f1 | grep -oE '^[0-9]+')
        if [ -z "$MAJOR_VERSION" ]; then
            print_warning "Could not parse Node.js version: $NODE_VERSION"
            print_info "Assuming Node.js installation is needed"
            MAJOR_VERSION=0
        fi
        if [ "$MAJOR_VERSION" -ge 18 ] 2>/dev/null; then
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

# Install CLI globally
install_cli() {
    print_step "Installing brain-dump CLI globally"

    # Check if PNPM_HOME is set up
    if [ -z "$PNPM_HOME" ]; then
        print_info "Setting up pnpm global bin directory..."
        pnpm setup 2>/dev/null || true

        # Source the updated PATH for this session
        if [ -f "$HOME/.zshrc" ]; then
            export PNPM_HOME="$HOME/Library/pnpm"
            export PATH="$PNPM_HOME:$PATH"
        elif [ -f "$HOME/.bashrc" ]; then
            export PNPM_HOME="$HOME/.local/share/pnpm"
            export PATH="$PNPM_HOME:$PATH"
        fi
    fi

    if pnpm link --global 2>/dev/null; then
        print_success "brain-dump CLI installed globally"
        print_info "You can now run: brain-dump help"
        print_info "Note: You may need to restart your terminal or run 'source ~/.zshrc'"
        INSTALLED+=("brain-dump CLI")
        return 0
    else
        print_warning "Could not install CLI globally"
        print_info "Use 'pnpm brain-dump' from the project directory instead"
        print_info "Or run manually: pnpm setup && pnpm link --global"
        SKIPPED+=("brain-dump CLI (manual install needed)")
        return 0
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

        # Build the MCP server from TypeScript
        print_info "Building MCP server from TypeScript..."
        if ! (cd "$MCP_SERVER_DIR" && pnpm run build); then
            print_warning "MCP server build completed with warnings (continuing)"
        fi

        # Validate the compiled MCP server executable exists
        MCP_SERVER_EXECUTABLE="$MCP_SERVER_DIR/dist/index.js"
        if [ ! -f "$MCP_SERVER_EXECUTABLE" ]; then
            print_error "MCP server executable not found at $MCP_SERVER_EXECUTABLE"
            FAILED+=("MCP server dependencies (build failed)")
            return 1
        fi

        # Validate the server can start (quick syntax check)
        if ! node -c "$MCP_SERVER_EXECUTABLE" 2>/dev/null; then
            print_error "MCP server has syntax errors"
            FAILED+=("MCP server dependencies (syntax error)")
            return 1
        fi

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

# Setup Docker sandbox for Ralph (optional)
setup_docker_sandbox() {
    print_step "Setting up Docker sandbox for Ralph"

    # Check if Docker is available
    if ! command_exists docker; then
        print_warning "Docker is not installed"
        print_info "Docker sandbox is optional - Ralph can run without it"
        print_info "To install Docker:"
        if [ "$OS" = "macos" ]; then
            print_info "  brew install --cask docker"
            print_info "  # Or use Lima: brew install lima && limactl start"
        else
            print_info "  https://docs.docker.com/engine/install/"
        fi
        SKIPPED+=("Docker sandbox (Docker not installed)")
        return 0
    fi

    # Detect DOCKER_HOST for Lima/Colima
    local docker_host=""
    if [ -z "${DOCKER_HOST:-}" ]; then
        # Check for Lima socket
        local lima_sock="$HOME/.lima/docker/sock/docker.sock"
        local colima_sock="$HOME/.colima/default/docker.sock"

        if [ -S "$lima_sock" ]; then
            docker_host="unix://$lima_sock"
            print_info "Detected Lima Docker socket"
        elif [ -S "$colima_sock" ]; then
            docker_host="unix://$colima_sock"
            print_info "Detected Colima Docker socket"
        fi
    else
        docker_host="$DOCKER_HOST"
        print_info "Using existing DOCKER_HOST: $docker_host"
    fi

    # Test Docker connectivity
    local docker_cmd="docker"
    if [ -n "$docker_host" ]; then
        export DOCKER_HOST="$docker_host"
    fi

    if ! $docker_cmd info >/dev/null 2>&1; then
        print_warning "Docker is installed but not running"
        print_info "Start Docker and run: ./install.sh --docker"
        SKIPPED+=("Docker sandbox (Docker not running)")
        return 0
    fi

    print_success "Docker is available"

    # Create ralph-net network if it doesn't exist
    local docker_error
    if ! docker_error=$($docker_cmd network inspect ralph-net 2>&1); then
        print_info "Creating ralph-net Docker network..."
        docker_error=$($docker_cmd network create ralph-net 2>&1)
        if [ $? -eq 0 ]; then
            print_success "Created ralph-net network"
            INSTALLED+=("Docker network (ralph-net)")
        else
            print_warning "Could not create ralph-net network: $docker_error"
            SKIPPED+=("Docker network (creation failed)")
        fi
    else
        print_info "ralph-net network already exists"
        SKIPPED+=("Docker network (already exists)")
    fi

    # Build the sandbox image
    local dockerfile_path="$(pwd)/docker/Dockerfile.ralph-sandbox"
    if [ ! -f "$dockerfile_path" ]; then
        print_warning "Dockerfile not found at $dockerfile_path"
        print_info "The image will be built automatically on first Ralph run"
        SKIPPED+=("Docker image (will build on demand)")
        return 0
    fi

    print_info "Building brain-dump-ralph-sandbox image (this may take a minute)..."
    docker_error=$($docker_cmd build -t brain-dump-ralph-sandbox:latest -f "$dockerfile_path" "$(pwd)/docker" 2>&1)
    if [ $? -eq 0 ]; then
        print_success "Built brain-dump-ralph-sandbox:latest image"
        INSTALLED+=("Docker sandbox image")
    else
        print_warning "Could not build Docker image"
        # Show last few lines of error output for debugging
        echo "Build error (last 5 lines):" >&2
        echo "$docker_error" | tail -5 >&2
        print_info "The image will be built automatically on first Ralph run"
        SKIPPED+=("Docker image (build failed, will retry on demand)")
    fi

    # Create scripts directory
    mkdir -p "$HOME/.brain-dump/scripts"
    print_success "Docker sandbox setup complete"
}

# Setup Claude Code integration using the setup script
setup_claude_code() {
    run_setup_script "Claude Code" "scripts/setup-claude-code.sh"
}

# Configure Claude Code's native sandbox
setup_claude_sandbox() {
    print_step "Configuring Claude Code sandbox"

    # Check if Claude CLI is installed
    if ! command_exists claude; then
        print_warning "Claude CLI not found. Skipping sandbox configuration."
        print_info "Install Claude CLI first: npm install -g @anthropic-ai/claude-code"
        print_info "Then run: ./install.sh --sandbox"
        SKIPPED+=("Claude sandbox (CLI not installed)")
        return 0
    fi

    CLAUDE_SETTINGS="$HOME/.claude/settings.json"
    CLAUDE_DIR="$HOME/.claude"

    # Ensure .claude directory exists
    if ! mkdir -p "$CLAUDE_DIR"; then
        print_error "Failed to create $CLAUDE_DIR"
        FAILED+=("Claude sandbox (directory creation failed)")
        return 1
    fi

    # Handle settings.json
    if [ ! -f "$CLAUDE_SETTINGS" ]; then
        print_info "Creating ~/.claude/settings.json with sandbox enabled..."
        cat > "$CLAUDE_SETTINGS" << 'EOF'
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "sandbox": {
    "enabled": true
  }
}
EOF
        print_success "Created ~/.claude/settings.json with sandbox enabled"
        INSTALLED+=("Claude sandbox config")
    else
        # Check if sandbox is already configured
        if grep -q '"sandbox"' "$CLAUDE_SETTINGS"; then
            print_success "Sandbox already configured in settings.json"
            SKIPPED+=("Claude sandbox (already configured)")
        else
            # Add sandbox configuration to existing settings
            print_info "Adding sandbox configuration to existing settings.json..."

            if command_exists node; then
                local node_error
                node_error=$(node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('$CLAUDE_SETTINGS', 'utf8'));
config.sandbox = config.sandbox || {};
config.sandbox.enabled = true;
fs.writeFileSync('$CLAUDE_SETTINGS', JSON.stringify(config, null, 2));
console.log('Sandbox config added successfully');
" 2>&1) && {
                    print_success "Added sandbox configuration to settings.json"
                    INSTALLED+=("Claude sandbox config")
                    return 0
                }
                if [ -n "$node_error" ]; then
                    print_warning "JSON merge failed: $node_error"
                fi
            fi

            # Fallback to manual instructions
            print_warning "Could not auto-merge. Please add this to ~/.claude/settings.json:"
            echo ""
            echo '  "sandbox": {'
            echo '    "enabled": true'
            echo '  }'
            echo ""
            SKIPPED+=("Claude sandbox (manual merge required)")
            return 0
        fi
    fi

    # Print usage instructions
    echo ""
    print_info "Sandbox Usage:"
    echo "  • Run 'claude' normally - sandbox is now enabled by default"
    echo "  • Use '/sandbox' command in Claude Code to toggle sandbox mode"
    echo "  • Sandbox restricts file system and network access for safety"
    echo ""
    print_info "For more info: https://docs.anthropic.com/en/docs/claude-code/sandboxing"
}

# Setup devcontainer environment
setup_devcontainer() {
    print_step "Setting up devcontainer environment"

    local DEVCONTAINER_DIR=".devcontainer"

    # Check if .devcontainer directory exists
    if [ ! -d "$DEVCONTAINER_DIR" ]; then
        print_error ".devcontainer/ directory not found"
        print_info "The devcontainer files should be in the repository."
        print_info "Make sure you have cloned the full repository."
        FAILED+=("Devcontainer (.devcontainer/ missing)")
        return 1
    fi

    # Check if Dockerfile exists
    if [ ! -f "$DEVCONTAINER_DIR/Dockerfile" ]; then
        print_error ".devcontainer/Dockerfile not found"
        FAILED+=("Devcontainer (Dockerfile missing)")
        return 1
    fi

    # Check if devcontainer.json exists
    if [ ! -f "$DEVCONTAINER_DIR/devcontainer.json" ]; then
        print_error ".devcontainer/devcontainer.json not found"
        FAILED+=("Devcontainer (devcontainer.json missing)")
        return 1
    fi

    print_success "Devcontainer files found"

    # Check if Docker is installed
    local docker_cmd=""
    if command_exists docker; then
        docker_cmd="docker"
    elif command_exists podman; then
        docker_cmd="podman"
        print_info "Using Podman as Docker alternative"
    else
        print_error "Docker is not installed"
        print_info "Install Docker Desktop from: https://www.docker.com/products/docker-desktop"
        FAILED+=("Devcontainer (Docker not installed)")
        return 1
    fi

    # Check if Docker is running
    if ! $docker_cmd info >/dev/null 2>&1; then
        print_error "Docker is not running"
        print_info "Please start Docker Desktop and try again"
        FAILED+=("Devcontainer (Docker not running)")
        return 1
    fi

    print_success "Docker is available and running"

    # Check VS Code and Remote-Containers extension
    if command_exists code; then
        print_info "VS Code detected - checking for Remote-Containers extension..."
        if code --list-extensions 2>/dev/null | grep -qi "ms-vscode-remote.remote-containers"; then
            print_success "Remote-Containers extension is installed"
        else
            print_warning "Remote-Containers extension not installed"
            print_info "Install it from: https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers"
            print_info "Or run: code --install-extension ms-vscode-remote.remote-containers"
        fi
    fi

    # Optionally pre-build the container image
    echo ""
    print_info "Would you like to pre-build the devcontainer image now? (y/N)"
    read -r -n 1 prebuild_choice
    echo ""

    if [[ "$prebuild_choice" =~ ^[Yy]$ ]]; then
        print_info "Building devcontainer image..."
        if $docker_cmd build -t brain-dump-devcontainer -f "$DEVCONTAINER_DIR/Dockerfile" "$DEVCONTAINER_DIR" >/dev/null 2>&1; then
            print_success "Built brain-dump-devcontainer image"
            INSTALLED+=("Devcontainer image")
        else
            print_warning "Failed to build image (this is optional - VS Code will build it on first use)"
            SKIPPED+=("Devcontainer image (optional build failed)")
        fi
    else
        print_info "Skipping image pre-build (VS Code will build it on first use)"
        SKIPPED+=("Devcontainer image (not pre-built)")
    fi

    # Print usage instructions
    echo ""
    print_success "Devcontainer setup complete!"
    echo ""
    print_info "How to use the devcontainer:"
    echo ""
    echo "  VS Code:"
    echo "    1. Open this project in VS Code"
    echo "    2. Press Cmd/Ctrl+Shift+P and select 'Dev Containers: Reopen in Container'"
    echo "    3. Wait for the container to build (first time only)"
    echo ""
    echo "  CLI (devcontainer CLI):"
    echo "    devcontainer up --workspace-folder ."
    echo "    devcontainer exec --workspace-folder . bash"
    echo ""
    echo "  Notes:"
    echo "    • The container has network isolation (firewall) enabled"
    echo "    • Your database is bind-mounted from the host"
    echo "    • Port 4242 is forwarded for the dev server"
    echo ""

    INSTALLED+=("Devcontainer setup")
    return 0
}

# Setup OpenCode integration using the setup script
setup_opencode() {
    run_setup_script "OpenCode" "scripts/setup-opencode.sh"
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

# ============================================================================
# IDE Integration (delegates to scripts/)
# ============================================================================

# Setup VS Code integration using the setup script
setup_vscode() {
    run_setup_script "VS Code" "scripts/setup-vscode.sh"
}

# Setup Cursor integration using the setup script
setup_cursor() {
    run_setup_script "Cursor" "scripts/setup-cursor.sh"
}

# Prompt user to select IDE(s)
prompt_ide_selection() {
    echo ""
    echo -e "${CYAN}Which IDE(s) do you use?${NC}"
    echo ""
    echo "  1) Claude Code (CLI)"
    echo "  2) VS Code"
    echo "  3) Cursor"
    echo "  4) OpenCode"
    echo "  5) All IDEs (Claude Code + VS Code + Cursor + OpenCode)"
    echo "  6) Skip IDE setup (just install Brain Dump)"
    echo ""
    read -r -p "Enter choice [1-6]: " choice

    case $choice in
        1)
            SETUP_CLAUDE=true
            SETUP_VSCODE=false
            SETUP_CURSOR=false
            SETUP_OPENCODE=false
            ;;
        2)
            SETUP_CLAUDE=false
            SETUP_VSCODE=true
            SETUP_CURSOR=false
            SETUP_OPENCODE=false
            ;;
        3)
            SETUP_CLAUDE=false
            SETUP_VSCODE=false
            SETUP_CURSOR=true
            SETUP_OPENCODE=false
            ;;
        4)
            SETUP_CLAUDE=false
            SETUP_VSCODE=false
            SETUP_CURSOR=false
            SETUP_OPENCODE=true
            ;;
        5)
            SETUP_CLAUDE=true
            SETUP_VSCODE=true
            SETUP_CURSOR=true
            SETUP_OPENCODE=true
            ;;
        6)
            SETUP_CLAUDE=false
            SETUP_VSCODE=false
            SETUP_CURSOR=false
            SETUP_OPENCODE=false
            ;;
        *)
            print_warning "Invalid choice, defaulting to Claude Code"
            SETUP_CLAUDE=true
            SETUP_VSCODE=false
            SETUP_CURSOR=false
            SETUP_OPENCODE=false
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

    if [ "$SETUP_CURSOR" = true ]; then
        echo "  4. Restart Cursor to load MCP server and configurations"
        echo "  5. Use @ralph, @ticket-worker, or /review in Agent chat"
    fi

    if [ "$SETUP_OPENCODE" = true ]; then
        echo "  4. Start OpenCode in this directory: ${CYAN}opencode${NC}"
        echo "  5. Use Tab to switch between Ralph and Build agents"
        echo "  6. Use @ticket-worker, @planner, @code-reviewer as needed"
        if ! command_exists opencode; then
            echo ""
            echo -e "${YELLOW}Note:${NC} Install OpenCode for full integration"
            echo "  Visit https://opencode.ai for installation instructions"
        fi
    fi

    echo ""

    echo -e "${BLUE}Data locations:${NC}"
    print_data_locations
    echo ""

    # Show how to add other IDE later
    local ide_count=0
    [ "$SETUP_CLAUDE" = true ] && ide_count=$((ide_count + 1))
    [ "$SETUP_VSCODE" = true ] && ide_count=$((ide_count + 1))
    [ "$SETUP_CURSOR" = true ] && ide_count=$((ide_count + 1))
    [ "$SETUP_OPENCODE" = true ] && ide_count=$((ide_count + 1))

    if [ $ide_count -lt 4 ]; then
        echo -e "${BLUE}Want more IDEs?${NC} Run: ${CYAN}./install.sh --all${NC} for all integrations"
        echo ""
    fi
}

# Show help
show_help() {
    echo "Brain Dump Installer"
    echo ""
    echo "Usage: ./scripts/install.sh [options]"
    echo ""
    echo "IDE Options:"
    echo "  --claude    Set up Claude Code integration (MCP server + plugins)"
    echo "  --vscode    Set up VS Code integration (MCP server + agents + skills + prompts)"
    echo "  --cursor    Set up Cursor integration (MCP server + subagents + skills + commands)"
    echo "  --opencode  Set up OpenCode integration (MCP server + agents + skills)"
    echo "  --all       Set up all IDE integrations + sandbox"
    echo ""
    echo "  If no IDE flag is provided, you'll be prompted to choose."
    echo ""
    echo "Security Options:"
    echo "  --sandbox       Enable Claude Code's native sandbox mode"
    echo "  --devcontainer  Set up devcontainer environment (Docker + network isolation)"
    echo "  --docker        Set up Docker sandbox for Ralph (optional)"
    echo ""
    echo "Other Options:"
    echo "  --help          Show this help message"
    echo "  --skip-node     Skip Node.js installation check"
    echo "  --update-skills Update vendored skills from upstream"
    echo ""
    echo "Examples:"
    echo "  ./install.sh --claude            # Claude Code only"
    echo "  ./install.sh --claude --sandbox  # Claude Code with sandbox enabled"
    echo "  ./install.sh --devcontainer      # Set up devcontainer environment"
    echo "  ./install.sh --vscode            # VS Code only"
    echo "  ./install.sh --cursor            # Cursor only"
    echo "  ./install.sh --opencode          # OpenCode only"
    echo "  ./install.sh --all               # All IDEs + sandbox"
    echo "  ./install.sh                     # Interactive prompt"
    echo ""
    echo "This script will:"
    echo "  1. Install Node.js 18+ via nvm (if needed)"
    echo "  2. Install pnpm (if needed)"
    echo "  3. Install project dependencies"
    echo "  4. Run database migrations"
    echo "  5. Configure MCP server for your chosen IDE(s)"
    echo "  6. Install IDE integrations as applicable"
    echo ""
    echo "The script is idempotent - safe to run multiple times."
}

# Main installation flow
main() {
    # Parse arguments
    SKIP_NODE=false
    SETUP_CLAUDE=false
    SETUP_VSCODE=false
    SETUP_CURSOR=false
    SETUP_OPENCODE=false
    SETUP_DOCKER=false
    SETUP_SANDBOX=false
    SETUP_DEVCONTAINER=false
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
            --cursor)
                SETUP_CURSOR=true
                IDE_FLAG_PROVIDED=true
                ;;
            --opencode)
                SETUP_OPENCODE=true
                IDE_FLAG_PROVIDED=true
                ;;
            --all)
                SETUP_CLAUDE=true
                SETUP_VSCODE=true
                SETUP_CURSOR=true
                SETUP_OPENCODE=true
                SETUP_SANDBOX=true
                IDE_FLAG_PROVIDED=true
                ;;
            --docker)
                SETUP_DOCKER=true
                ;;
            --sandbox)
                SETUP_SANDBOX=true
                ;;
            --devcontainer)
                SETUP_DEVCONTAINER=true
                ;;
            --update-skills)
                UPDATE_SKILLS=true
                ;;
        esac
    done

    print_header

    detect_os
    print_info "Detected OS: $OS"

    # Get the project root directory (parent of scripts/)
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

    # Source migration/compatibility functions if available
    if [ -f "$SCRIPT_DIR/migrate.sh" ]; then
        source "$SCRIPT_DIR/migrate.sh"
    fi

    # Change to project directory if not already there
    if [ "$(pwd)" != "$PROJECT_DIR" ]; then
        print_info "Changing to Brain Dump directory: $PROJECT_DIR"
        cd "$PROJECT_DIR"
    fi

    # Check for legacy installations
    if type detect_all_legacy &>/dev/null; then
        LEGACY_FOUND=$(detect_all_legacy)
        if [ -n "$LEGACY_FOUND" ]; then
            print_warning "Legacy Brain Dump installations detected"
            print_info "Run './scripts/migrate.sh' after install to clean up"
        fi
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
    install_cli || true
    run_migrations || true

    # Docker sandbox setup (optional)
    if [ "$SETUP_DOCKER" = true ]; then
        setup_docker_sandbox || true
    fi

    # Claude Code setup
    if [ "$SETUP_CLAUDE" = true ]; then
        setup_claude_code || true
        setup_claude_skills || true  # vendored third-party skills
    fi

    # Claude sandbox setup (can be used with or without --claude)
    if [ "$SETUP_SANDBOX" = true ]; then
        setup_claude_sandbox || true
    fi

    # Devcontainer setup (Docker + network isolation)
    if [ "$SETUP_DEVCONTAINER" = true ]; then
        setup_devcontainer || true
    fi

    # VS Code setup
    if [ "$SETUP_VSCODE" = true ]; then
        setup_vscode || true
    fi

    # Cursor setup
    if [ "$SETUP_CURSOR" = true ]; then
        setup_cursor || true
    fi

    # OpenCode setup
    if [ "$SETUP_OPENCODE" = true ]; then
        setup_opencode || true
    fi

    # If no IDE selected, just note it
    if [ "$SETUP_CLAUDE" = false ] && [ "$SETUP_VSCODE" = false ] && [ "$SETUP_CURSOR" = false ] && [ "$SETUP_OPENCODE" = false ]; then
        print_step "Skipping IDE integration"
        print_info "Run again with --claude, --vscode, --cursor, or --opencode to set up IDE integration"
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
