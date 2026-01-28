#!/bin/bash

# Fix MCP Server Path Configuration
# This script updates ~/.claude.json to point to the compiled dist/index.js

set -e

CLAUDE_JSON="$HOME/.claude.json"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MCP_DIST_PATH="$PROJECT_ROOT/mcp-server/dist/index.js"

echo "🔧 Fixing MCP server configuration..."
echo "   Claude config: $CLAUDE_JSON"
echo "   MCP dist path: $MCP_DIST_PATH"

if [ ! -f "$CLAUDE_JSON" ]; then
    echo "✗ Claude config not found: $CLAUDE_JSON"
    echo "  Run: claude --dangerously-skip-permissions to initialize"
    exit 1
fi

if [ ! -f "$MCP_DIST_PATH" ]; then
    echo "✗ MCP server not built yet at: $MCP_DIST_PATH"
    echo "  Run: pnpm install && pnpm build:mcp"
    exit 1
fi

# Use Node.js to update the JSON safely
if ! node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('$CLAUDE_JSON', 'utf8'));

if (!config.mcpServers) config.mcpServers = {};
if (!config.mcpServers['brain-dump']) config.mcpServers['brain-dump'] = {};

// Update the entry point to dist/index.js
config.mcpServers['brain-dump'].command = 'node';
config.mcpServers['brain-dump'].args = ['$MCP_DIST_PATH'];

fs.writeFileSync('$CLAUDE_JSON', JSON.stringify(config, null, 2) + '\n');
console.log('✓ Updated MCP server path');
"; then
    echo "✗ Failed to update Claude config"
    exit 1
fi

echo "✓ MCP server configuration fixed"
echo ""
echo "Next steps:"
echo "  1. Run: pnpm dev"
echo "  2. Restart Claude Code (Cmd+Shift+P → 'Reload Window')"
echo "  3. Run Ralph again"
