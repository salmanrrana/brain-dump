#!/bin/bash
# Update MCP server configs to include environment flags for proper author attribution
# This ensures OpenCode and Cursor get proper credit in ticket comments
#
# Detection relies on explicit environment flags set in MCP configs:
# - OPENCODE=1 for OpenCode
# - CURSOR=1 for Cursor
# These flags are the primary and most reliable method for environment detection.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAIN_DUMP_DIR="$(dirname "$SCRIPT_DIR")"

echo "🔧 Updating MCP server environment flags for author attribution..."

# Update OpenCode config
OPENCODE_CONFIG="$BRAIN_DUMP_DIR/.opencode/opencode.json"
if [ -f "$OPENCODE_CONFIG" ]; then
  if command -v node >/dev/null 2>&1; then
    node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('$OPENCODE_CONFIG', 'utf8'));
if (config.mcp && config.mcp['brain-dump'] && config.mcp['brain-dump'].environment) {
  config.mcp['brain-dump'].environment.OPENCODE = '1';
  fs.writeFileSync('$OPENCODE_CONFIG', JSON.stringify(config, null, 2));
  console.log('✓ Updated OpenCode config');
} else {
  console.log('⚠ OpenCode config missing brain-dump MCP server');
}
" 2>/dev/null || echo "⚠ Failed to update OpenCode config"
  else
    echo "⚠ Node.js not found, skipping OpenCode config update"
  fi
else
  echo "⚠ OpenCode config not found at $OPENCODE_CONFIG"
fi

# Update Cursor config (project-level)
CURSOR_CONFIG="$BRAIN_DUMP_DIR/.cursor/mcp.json"
if [ -f "$CURSOR_CONFIG" ]; then
  if command -v node >/dev/null 2>&1; then
    node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('$CURSOR_CONFIG', 'utf8'));
if (config['brain-dump']) {
  config['brain-dump'].env = config['brain-dump'].env || {};
  config['brain-dump'].env.CURSOR = '1';
  fs.writeFileSync('$CURSOR_CONFIG', JSON.stringify(config, null, 2));
  console.log('✓ Updated Cursor project config');
} else {
  console.log('⚠ Cursor config missing brain-dump server');
}
" 2>/dev/null || echo "⚠ Failed to update Cursor project config"
  else
    echo "⚠ Node.js not found, skipping Cursor config update"
  fi
else
  echo "⚠ Cursor project config not found at $CURSOR_CONFIG"
fi

# Update global Cursor config
GLOBAL_CURSOR_CONFIG="$HOME/.cursor/mcp.json"
if [ -f "$GLOBAL_CURSOR_CONFIG" ]; then
  if command -v node >/dev/null 2>&1; then
    node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('$GLOBAL_CURSOR_CONFIG', 'utf8'));
let updated = false;
if (config['brain-dump']) {
  config['brain-dump'].env = config['brain-dump'].env || {};
  config['brain-dump'].env.CURSOR = '1';
  updated = true;
} else if (config.mcpServers && config.mcpServers['brain-dump']) {
  config.mcpServers['brain-dump'].env = config.mcpServers['brain-dump'].env || {};
  config.mcpServers['brain-dump'].env.CURSOR = '1';
  updated = true;
}
if (updated) {
  fs.writeFileSync('$GLOBAL_CURSOR_CONFIG', JSON.stringify(config, null, 2));
  console.log('✓ Updated global Cursor config');
} else {
  console.log('⚠ Global Cursor config missing brain-dump server');
}
" 2>/dev/null || echo "⚠ Failed to update global Cursor config"
  else
    echo "⚠ Node.js not found, skipping global Cursor config update"
  fi
else
  echo "ℹ Global Cursor config not found at $GLOBAL_CURSOR_CONFIG (will be created on next setup)"
fi

echo ""
echo "✅ Environment flag update complete!"
echo ""
echo "Note: Restart OpenCode/Cursor for changes to take effect."
