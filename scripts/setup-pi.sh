#!/bin/bash
# Brain Dump Pi Setup Script
# Copies Brain Dump-managed Pi prompts and skills. Pi is CLI-only: no MCP config.

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAIN_DUMP_DIR="$(dirname "$SCRIPT_DIR")"
PI_DIR="$HOME/.pi"
PI_PROMPTS_DIR="$PI_DIR/prompts"
PI_SKILLS_DIR="$PI_DIR/skills"

echo -e "${BLUE}Setting up Brain Dump for Pi...${NC}"

if ! command -v pi >/dev/null 2>&1; then
  echo -e "${YELLOW}⚠ Pi CLI not found on PATH${NC}"
  echo "Install Pi CLI first, then rerun ./install.sh --pi."
fi

if [ ! -d "$BRAIN_DUMP_DIR/.pi" ]; then
  echo -e "${RED}✗ Brain Dump .pi source directory not found${NC}"
  exit 1
fi

mkdir -p "$PI_PROMPTS_DIR" "$PI_SKILLS_DIR"

if [ -d "$BRAIN_DUMP_DIR/.pi/prompts" ]; then
  cp -R "$BRAIN_DUMP_DIR/.pi/prompts/." "$PI_PROMPTS_DIR/"
  echo -e "${GREEN}✓ Installed Pi prompts${NC}"
fi

if [ -d "$BRAIN_DUMP_DIR/.pi/skills" ]; then
  cp -R "$BRAIN_DUMP_DIR/.pi/skills/." "$PI_SKILLS_DIR/"
  echo -e "${GREEN}✓ Installed Pi skills${NC}"
fi

echo -e "${GREEN}✓ Pi CLI-only setup complete${NC}"
echo "No MCP server was configured for Pi. Launches use the Pi CLI with local prompts and skills."
