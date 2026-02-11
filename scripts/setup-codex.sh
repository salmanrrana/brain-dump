#!/bin/bash
# Brain Dump Codex Setup Script
# Configures Codex to use Brain Dump's MCP server globally via ~/.codex/config.toml

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║          Brain Dump - Codex Setup                         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAIN_DUMP_DIR="$(dirname "$SCRIPT_DIR")"
MCP_SERVER_PATH="$BRAIN_DUMP_DIR/mcp-server/dist/index.js"

# If run via sudo, prefer configuring the invoking user's Codex home.
TARGET_USER="${USER:-}"
TARGET_HOME="$HOME"
RUNNING_WITH_SUDO=0
if [ "${EUID:-$(id -u)}" -eq 0 ] && [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
  TARGET_USER="$SUDO_USER"
  RUNNING_WITH_SUDO=1
  if command -v getent >/dev/null 2>&1; then
    SUDO_HOME="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
    if [ -n "$SUDO_HOME" ]; then
      TARGET_HOME="$SUDO_HOME"
    fi
  fi
fi

CODEX_DIR="$TARGET_HOME/.codex"
CODEX_CONFIG="$CODEX_DIR/config.toml"

echo -e "${YELLOW}Brain Dump location:${NC} $BRAIN_DUMP_DIR"
echo -e "${YELLOW}Codex config:${NC} $CODEX_CONFIG"
if [ "$RUNNING_WITH_SUDO" -eq 1 ]; then
  echo -e "${YELLOW}Note:${NC} Running with sudo; targeting user '$TARGET_USER' at $TARGET_HOME"
fi
echo ""

mkdir -p "$CODEX_DIR"
if [ "$RUNNING_WITH_SUDO" -eq 1 ]; then
  chown "$TARGET_USER":"$TARGET_USER" "$CODEX_DIR" 2>/dev/null || true
fi

if [ ! -f "$MCP_SERVER_PATH" ]; then
  echo -e "${YELLOW}MCP server build output not found. Building mcp-server...${NC}"
  if [ -f "$BRAIN_DUMP_DIR/mcp-server/package.json" ]; then
    (cd "$BRAIN_DUMP_DIR/mcp-server" && pnpm build >/dev/null 2>&1) || true
  fi
fi

if [ ! -f "$MCP_SERVER_PATH" ]; then
  echo -e "${RED}✗ MCP server dist file not found:${NC} $MCP_SERVER_PATH"
  echo "Run: cd \"$BRAIN_DUMP_DIR/mcp-server\" && pnpm build"
  exit 1
fi

if [ ! -f "$CODEX_CONFIG" ]; then
  cat > "$CODEX_CONFIG" << EOF
[mcp_servers.brain-dump]
command = "node"
args = ["$MCP_SERVER_PATH"]
env = { BRAIN_DUMP_PATH = "$BRAIN_DUMP_DIR", CODEX = "1" }
EOF
  if [ "$RUNNING_WITH_SUDO" -eq 1 ]; then
    chown "$TARGET_USER":"$TARGET_USER" "$CODEX_CONFIG" 2>/dev/null || true
  fi
  echo -e "${GREEN}✓ Created ~/.codex/config.toml with Brain Dump MCP server${NC}"
else
  if grep -q '^\[mcp_servers\.brain-dump\]' "$CODEX_CONFIG"; then
    echo -e "${YELLOW}✓ Brain Dump MCP server already configured in ~/.codex/config.toml${NC}"
  else
    cat >> "$CODEX_CONFIG" << EOF

# Brain Dump MCP server
[mcp_servers.brain-dump]
command = "node"
args = ["$MCP_SERVER_PATH"]
env = { BRAIN_DUMP_PATH = "$BRAIN_DUMP_DIR", CODEX = "1" }
EOF
    if [ "$RUNNING_WITH_SUDO" -eq 1 ]; then
      chown "$TARGET_USER":"$TARGET_USER" "$CODEX_CONFIG" 2>/dev/null || true
    fi
    echo -e "${GREEN}✓ Added Brain Dump MCP server to ~/.codex/config.toml${NC}"
  fi
fi

echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Restart Codex"
echo "  2. Run: brain-dump doctor"
echo "  3. Start a ticket and launch with Codex"
