#!/bin/bash

# Fix MCP Server Path Configuration
# Ensures the MCP server is built and all IDE configs point to dist/index.js
#
# Fixes:
#   1. Builds MCP server if dist/index.js is missing
#   2. Updates ~/.claude.json (Claude Code)
#   3. Updates .vscode/mcp.json (VS Code)
#   4. Updates .cursor/mcp.json (Cursor)
#
# Cross-platform: works on macOS and Linux

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MCP_DIST_PATH="$PROJECT_ROOT/mcp-server/dist/index.js"
CLAUDE_JSON="$HOME/.claude.json"
VSCODE_MCP="$PROJECT_ROOT/.vscode/mcp.json"
CURSOR_MCP="$PROJECT_ROOT/.cursor/mcp.json"

FIXED=0
ERRORS=0

# Cross-platform sed in-place edit
sed_inplace() {
    if [[ "$(uname)" == "Darwin" ]]; then
        sed -i '' "$@"
    else
        sed -i "$@"
    fi
}

echo "Fixing MCP server configuration..."
echo "  Project root: $PROJECT_ROOT"
echo ""

# Step 1: Build MCP server if needed
if [ ! -f "$MCP_DIST_PATH" ]; then
    echo "[1/4] Building MCP server (dist/index.js missing)..."
    if (cd "$PROJECT_ROOT" && pnpm build:mcp 2>&1); then
        echo "  Built successfully"
    else
        echo "  Build completed with warnings (continuing)"
    fi

    if [ ! -f "$MCP_DIST_PATH" ]; then
        echo "  ERROR: Build failed to produce dist/index.js"
        echo "  Try manually: cd $PROJECT_ROOT && pnpm build:mcp"
        exit 1
    fi
else
    echo "[1/4] MCP server already built"
fi

# Step 2: Fix ~/.claude.json
echo "[2/4] Checking ~/.claude.json..."
if [ -f "$CLAUDE_JSON" ]; then
    if node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('$CLAUDE_JSON', 'utf8'));
const current = config.mcpServers?.['brain-dump']?.args?.[0] || '';
if (current === '$MCP_DIST_PATH') {
    console.log('  Already correct');
    process.exit(2);
}
if (!config.mcpServers) config.mcpServers = {};
config.mcpServers['brain-dump'] = { command: 'node', args: ['$MCP_DIST_PATH'] };
fs.writeFileSync('$CLAUDE_JSON', JSON.stringify(config, null, 2) + '\n');
console.log('  Fixed: ' + (current || '(not set)') + ' -> dist/index.js');
" 2>/dev/null; then
        FIXED=$((FIXED + 1))
    elif [ $? -eq 2 ]; then
        true  # Already correct
    else
        echo "  ERROR: Failed to update"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo "  Skipped (file not found - run Claude Code once first)"
fi

# Step 3: Fix .vscode/mcp.json
echo "[3/4] Checking .vscode/mcp.json..."
if [ -f "$VSCODE_MCP" ]; then
    if grep -q 'mcp-server/index\.js' "$VSCODE_MCP" 2>/dev/null; then
        sed_inplace 's|mcp-server/index\.js|mcp-server/dist/index.js|g' "$VSCODE_MCP"
        echo "  Fixed: index.js -> dist/index.js"
        FIXED=$((FIXED + 1))
    elif grep -q 'mcp-server/dist/index\.js' "$VSCODE_MCP" 2>/dev/null; then
        echo "  Already correct"
    else
        echo "  Skipped (no brain-dump MCP config found)"
    fi
else
    echo "  Skipped (file not found)"
fi

# Step 4: Fix .cursor/mcp.json
echo "[4/4] Checking .cursor/mcp.json..."
if [ -f "$CURSOR_MCP" ]; then
    if grep -q 'mcp-server/index\.js' "$CURSOR_MCP" 2>/dev/null; then
        sed_inplace 's|mcp-server/index\.js|mcp-server/dist/index.js|g' "$CURSOR_MCP"
        echo "  Fixed: index.js -> dist/index.js"
        FIXED=$((FIXED + 1))
    elif grep -q 'mcp-server/dist/index\.js' "$CURSOR_MCP" 2>/dev/null; then
        echo "  Already correct"
    else
        echo "  Skipped (no brain-dump MCP config found)"
    fi
else
    echo "  Skipped (file not found)"
fi

# Summary
echo ""
if [ $ERRORS -gt 0 ]; then
    echo "Done with errors ($FIXED fixed, $ERRORS failed)"
    exit 1
elif [ $FIXED -gt 0 ]; then
    echo "Fixed $FIXED config(s). Restart your IDE/Claude Code to pick up changes."
else
    echo "All configs already correct."
fi
