#!/bin/bash
# Brain Dump Migration & Backwards Compatibility Script
#
# This script handles:
# 1. Detection of legacy installations
# 2. Migration from old config locations to new ones
# 3. Cleanup of deprecated files/directories
#
# Can be run standalone or sourced by install.sh/uninstall.sh
#
# Usage:
#   ./scripts/migrate.sh              # Interactive migration
#   ./scripts/migrate.sh --detect     # Just detect legacy installations
#   ./scripts/migrate.sh --clean      # Clean up legacy locations
#   source scripts/migrate.sh         # Source functions for use in other scripts

set -e

# Colors for output (only set if not already defined)
RED="${RED:-\033[0;31m}"
GREEN="${GREEN:-\033[0;32m}"
YELLOW="${YELLOW:-\033[1;33m}"
BLUE="${BLUE:-\033[0;34m}"
CYAN="${CYAN:-\033[0;36m}"
NC="${NC:-\033[0m}"

# ─────────────────────────────────────────────────────────────────────────────
# Legacy Location Definitions
# ─────────────────────────────────────────────────────────────────────────────

# OpenCode: was incorrectly documented as ~/.config/opencode/ but always installed to .opencode/
LEGACY_OPENCODE_GLOBAL="$HOME/.config/opencode"

# Claude Code: MCP config moved from project-local to ~/.claude.json
# (This is actually the correct location now, but older versions may have had different patterns)

# Brain Dump data: migrated from ~/.brain-dump/ to XDG-compliant paths
LEGACY_BRAIN_DUMP_DATA="$HOME/.brain-dump"

# ─────────────────────────────────────────────────────────────────────────────
# Detection Functions
# ─────────────────────────────────────────────────────────────────────────────

# Detect if legacy OpenCode global config exists
detect_legacy_opencode() {
    if [ -d "$LEGACY_OPENCODE_GLOBAL" ]; then
        if [ -f "$LEGACY_OPENCODE_GLOBAL/opencode.json" ] || \
           [ -d "$LEGACY_OPENCODE_GLOBAL/plugins" ] || \
           [ -d "$LEGACY_OPENCODE_GLOBAL/skills" ]; then
            echo "opencode_global"
            return 0
        fi
    fi
    return 1
}

# Detect if legacy Brain Dump data directory exists
detect_legacy_brain_dump_data() {
    if [ -d "$LEGACY_BRAIN_DUMP_DATA" ]; then
        if [ -f "$LEGACY_BRAIN_DUMP_DATA/brain-dump.db" ] || \
           [ -d "$LEGACY_BRAIN_DUMP_DATA/backups" ]; then
            echo "brain_dump_data"
            return 0
        fi
    fi
    return 1
}

# Detect all legacy installations
# Returns a space-separated list of detected legacy types
detect_all_legacy() {
    local found=""
    
    if detect_legacy_opencode >/dev/null 2>&1; then
        found="$found opencode_global"
    fi
    
    if detect_legacy_brain_dump_data >/dev/null 2>&1; then
        found="$found brain_dump_data"
    fi
    
    echo "$found" | xargs  # Trim whitespace
}

# ─────────────────────────────────────────────────────────────────────────────
# Cleanup Functions
# ─────────────────────────────────────────────────────────────────────────────

# Helper to clean brain-dump from an opencode.json file
# Arguments: $1 = path to opencode.json
clean_brain_dump_from_opencode_json() {
    local config_file="$1"
    
    if [ ! -f "$config_file" ]; then
        return 0
    fi
    
    if ! grep -q '"brain-dump"' "$config_file"; then
        return 0
    fi
    
    if command -v node >/dev/null 2>&1; then
        node -e '
const fs = require("fs");
const configFile = process.argv[1];
try {
    const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    let modified = false;
    
    // Remove from mcp servers
    if (config.mcp && config.mcp["brain-dump"]) {
        delete config.mcp["brain-dump"];
        if (Object.keys(config.mcp).length === 0) delete config.mcp;
        modified = true;
    }
    
    // Remove tools permission
    if (config.tools && config.tools["brain-dump_*"]) {
        delete config.tools["brain-dump_*"];
        if (Object.keys(config.tools).length === 0) delete config.tools;
        modified = true;
    }
    
    if (!modified) {
        console.log("not_found");
        process.exit(0);
    }
    
    const remainingKeys = Object.keys(config).filter(k => k !== "$schema");
    if (remainingKeys.length === 0) {
        fs.unlinkSync(configFile);
        console.log("removed");
    } else {
        fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
        console.log("updated");
    }
} catch (err) {
    console.error("error:" + err.message);
    process.exit(1);
}
' "$config_file" 2>&1
    else
        echo "no_node"
    fi
}

# Helper to clean brain-dump from Claude/Cursor MCP config
# Arguments: $1 = path to config file, $2 = servers key name (mcpServers or servers)
clean_brain_dump_from_mcp_json() {
    local config_file="$1"
    local servers_key="${2:-mcpServers}"
    
    if [ ! -f "$config_file" ]; then
        return 0
    fi
    
    if ! grep -q '"brain-dump"' "$config_file"; then
        return 0
    fi
    
    if command -v node >/dev/null 2>&1; then
        node -e '
const fs = require("fs");
const configFile = process.argv[1];
const serversKey = process.argv[2] || "mcpServers";
try {
    const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    
    // Try both possible keys
    const key = config[serversKey] ? serversKey : (config.servers ? "servers" : serversKey);
    
    if (config[key] && config[key]["brain-dump"]) {
        delete config[key]["brain-dump"];
        if (Object.keys(config[key]).length === 0) {
            delete config[key];
        }
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
' "$config_file" "$servers_key" 2>&1
    else
        echo "no_node"
    fi
}

# Clean up legacy OpenCode global config
# This was never supposed to be installed to ~/.config/opencode/ 
# but the old uninstall script looked there
clean_legacy_opencode_global() {
    local cleaned=0
    
    if [ ! -d "$LEGACY_OPENCODE_GLOBAL" ]; then
        return 0
    fi
    
    echo -e "${YELLOW}Cleaning legacy OpenCode global config at $LEGACY_OPENCODE_GLOBAL${NC}"
    
    # Clean opencode.json
    if [ -f "$LEGACY_OPENCODE_GLOBAL/opencode.json" ]; then
        result=$(clean_brain_dump_from_opencode_json "$LEGACY_OPENCODE_GLOBAL/opencode.json")
        case "$result" in
            removed) echo -e "${GREEN}✓ Removed opencode.json${NC}"; cleaned=1 ;;
            updated) echo -e "${GREEN}✓ Removed brain-dump from opencode.json${NC}"; cleaned=1 ;;
            not_found) echo -e "${YELLOW}brain-dump not found in opencode.json${NC}" ;;
            no_node) echo -e "${YELLOW}Note:${NC} Please manually remove brain-dump from opencode.json" ;;
            *) echo -e "${YELLOW}Note:${NC} Check opencode.json manually" ;;
        esac
    fi
    
    # Remove plugin
    if [ -f "$LEGACY_OPENCODE_GLOBAL/plugins/brain-dump-telemetry.ts" ]; then
        rm "$LEGACY_OPENCODE_GLOBAL/plugins/brain-dump-telemetry.ts" 2>/dev/null && \
            echo -e "${GREEN}✓ Removed legacy telemetry plugin${NC}" && cleaned=1
    fi

    # Remove AGENTS.md
    if [ -f "$LEGACY_OPENCODE_GLOBAL/AGENTS.md" ]; then
        rm "$LEGACY_OPENCODE_GLOBAL/AGENTS.md" 2>/dev/null && \
            echo -e "${GREEN}✓ Removed legacy AGENTS.md${NC}" && cleaned=1
    fi

    # Remove skill
    if [ -d "$LEGACY_OPENCODE_GLOBAL/skills/brain-dump-workflow" ]; then
        rm -rf "$LEGACY_OPENCODE_GLOBAL/skills/brain-dump-workflow" 2>/dev/null && \
            echo -e "${GREEN}✓ Removed legacy brain-dump-workflow skill${NC}" && cleaned=1
    fi
    
    return $cleaned
}

# Clean up legacy Brain Dump data directory
# Note: This is handled by the app itself on first run, but we document it here
clean_legacy_brain_dump_data() {
    if [ ! -d "$LEGACY_BRAIN_DUMP_DATA" ]; then
        return 0
    fi
    
    echo -e "${YELLOW}Found legacy Brain Dump data at $LEGACY_BRAIN_DUMP_DATA${NC}"
    echo -e "${BLUE}Note:${NC} Data migration is handled automatically by Brain Dump on first run."
    echo "  The app will migrate your database and backups to XDG-compliant locations:"
    echo "  - Linux: ~/.local/share/brain-dump/ and ~/.local/state/brain-dump/"
    echo "  - macOS: ~/Library/Application Support/brain-dump/"
    echo ""
    echo "  After verifying the migration succeeded, you can safely remove:"
    echo "  rm -rf $LEGACY_BRAIN_DUMP_DATA"
    
    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Main Migration Logic
# ─────────────────────────────────────────────────────────────────────────────

run_migration_detect() {
    echo -e "${BLUE}Detecting legacy Brain Dump installations...${NC}"
    echo ""
    
    local found_any=false
    
    # Check OpenCode global
    if [ -d "$LEGACY_OPENCODE_GLOBAL" ]; then
        if [ -f "$LEGACY_OPENCODE_GLOBAL/opencode.json" ] && grep -q '"brain-dump"' "$LEGACY_OPENCODE_GLOBAL/opencode.json" 2>/dev/null; then
            echo -e "${YELLOW}Found:${NC} Legacy OpenCode config at $LEGACY_OPENCODE_GLOBAL"
            echo "       This location was never officially supported but may have manual config."
            found_any=true
        fi
    fi
    
    # Check Brain Dump data
    if [ -d "$LEGACY_BRAIN_DUMP_DATA" ]; then
        echo -e "${YELLOW}Found:${NC} Legacy Brain Dump data at $LEGACY_BRAIN_DUMP_DATA"
        echo "       Will be migrated automatically on next app start."
        found_any=true
    fi
    
    if [ "$found_any" = false ]; then
        echo -e "${GREEN}✓ No legacy installations detected${NC}"
    fi
    
    echo ""
}

run_migration_clean() {
    echo -e "${BLUE}Cleaning up legacy Brain Dump installations...${NC}"
    echo ""
    
    clean_legacy_opencode_global
    clean_legacy_brain_dump_data
    
    echo ""
    echo -e "${GREEN}✓ Legacy cleanup complete${NC}"
}

run_migration_interactive() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║        Brain Dump - Migration & Compatibility              ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    run_migration_detect
    
    local legacy=$(detect_all_legacy)
    if [ -z "$legacy" ]; then
        echo "No migration needed."
        exit 0
    fi
    
    echo ""
    read -p "Clean up legacy installations? (yes/no): " CONFIRM || {
        echo -e "${RED}✗ Failed to read confirmation${NC}"
        exit 1
    }
    
    if [[ "$CONFIRM" != "yes" ]]; then
        echo "Migration cancelled."
        exit 0
    fi
    
    echo ""
    run_migration_clean
}

# ─────────────────────────────────────────────────────────────────────────────
# Export Functions for Sourcing
# ─────────────────────────────────────────────────────────────────────────────

# These functions are available when this script is sourced:
# - detect_legacy_opencode
# - detect_legacy_brain_dump_data
# - detect_all_legacy
# - clean_brain_dump_from_opencode_json
# - clean_brain_dump_from_mcp_json
# - clean_legacy_opencode_global
# - clean_legacy_brain_dump_data

# ─────────────────────────────────────────────────────────────────────────────
# Main Entry Point (when run directly)
# ─────────────────────────────────────────────────────────────────────────────

# Only run main logic if script is executed directly (not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    case "${1:-}" in
        --detect)
            run_migration_detect
            ;;
        --clean)
            run_migration_clean
            ;;
        --help|-h)
            echo "Brain Dump Migration Script"
            echo ""
            echo "Usage:"
            echo "  ./scripts/migrate.sh              Interactive migration"
            echo "  ./scripts/migrate.sh --detect     Detect legacy installations"
            echo "  ./scripts/migrate.sh --clean      Clean up legacy locations"
            echo ""
            echo "Can also be sourced by other scripts:"
            echo "  source scripts/migrate.sh"
            echo ""
            echo "Available functions when sourced:"
            echo "  detect_legacy_opencode          Check for legacy OpenCode global config"
            echo "  detect_all_legacy               Detect all legacy installations"
            echo "  clean_legacy_opencode_global    Clean up legacy OpenCode config"
            echo "  clean_brain_dump_from_mcp_json  Helper to clean MCP JSON configs"
            ;;
        *)
            run_migration_interactive
            ;;
    esac
fi
