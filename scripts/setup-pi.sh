#!/bin/bash
# Brain Dump Pi Setup Script
#
# Copies Brain Dump-managed prompts and skills into Pi's GLOBAL agent directory so
# they load in every workspace (matching Pi conventions: ~/.pi/agent; override with
# PI_CODING_AGENT_DIR per upstream Pi docs / ENVIRONMENT VARIABLES).
#
# Optional: install or upgrade Pi CLI globally via npm:
#   ./scripts/setup-pi.sh --install-cli
# or: BRAIN_DUMP_INSTALL_PI_CLI=1 ./scripts/setup-pi.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

PI_NPM_PACKAGE="@mariozechner/pi-coding-agent"

INSTALL_PI_CLI="${BRAIN_DUMP_INSTALL_PI_CLI:-0}"
case "$INSTALL_PI_CLI" in 1 | true | yes) INSTALL_PI_CLI=1 ;; *) INSTALL_PI_CLI=0 ;; esac

for arg in "$@"; do
  case "$arg" in
    --install-cli | --bootstrap-pi-cli) INSTALL_PI_CLI=1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAIN_DUMP_DIR="$(dirname "$SCRIPT_DIR")"

# Pi global runtime root — same default as upstream `PI_CODING_AGENT_DIR`
PI_AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
PI_PROMPTS_DIR="$PI_AGENT_DIR/prompts"
PI_SKILLS_DIR="$PI_AGENT_DIR/skills"

# Locations used by earlier Brain Dump Pi setup (incorrect for Pi discovery)
LEGACY_PROMPTS_DIR="$HOME/.pi/prompts"
LEGACY_SKILLS_DIR="$HOME/.pi/skills"

KNOWN_PROMPTS=(
  start-ticket.md complete-ticket.md next-ticket.md review-ticket.md demo-ticket.md
)

KNOWN_SKILLS=(brain-dump-workflow brain-dump-ticket-selection brain-dump-review)

echo -e "${BLUE}Setting up Brain Dump for Pi (global: $PI_AGENT_DIR)...${NC}"

cleanup_legacy_known_files() {
  local removed=0
  for f in "${KNOWN_PROMPTS[@]}"; do
    if [ -f "$LEGACY_PROMPTS_DIR/$f" ]; then
      rm -f "$LEGACY_PROMPTS_DIR/$f" && removed=$((removed + 1))
    fi
  done
  for d in "${KNOWN_SKILLS[@]}"; do
    if [ -d "$LEGACY_SKILLS_DIR/$d" ]; then
      rm -rf "$LEGACY_SKILLS_DIR/$d" && removed=$((removed + 1))
    fi
  done
  if [ "$removed" -gt 0 ]; then
    echo -e "${GREEN}✓ Removed legacy ~/.pi prompts/skills from an older Brain Dump layout${NC}"
  fi
}

if [ "$INSTALL_PI_CLI" -eq 1 ]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo -e "${RED}✗ npm not found — cannot install ${PI_NPM_PACKAGE} globally${NC}"
    exit 1
  fi
  echo -e "${BLUE}Installing Pi CLI globally via npm (${PI_NPM_PACKAGE})...${NC}"
  if npm install -g "$PI_NPM_PACKAGE"; then
    echo -e "${GREEN}✓ Pi CLI npm global install finished${NC}"
  else
    echo -e "${RED}✗ npm global install failed (check npm permissions / prefix)${NC}"
    exit 1
  fi
fi

if ! command -v pi >/dev/null 2>&1; then
  echo -e "${YELLOW}⚠ Pi CLI not found on PATH${NC}"
  echo "Install globally: npm install -g ${PI_NPM_PACKAGE}"
  echo "(Or rerun with --install-cli to run that install automatically.)"
fi

if [ ! -d "$BRAIN_DUMP_DIR/.pi" ]; then
  echo -e "${RED}✗ Brain Dump .pi source directory not found${NC}"
  exit 1
fi

mkdir -p "$PI_PROMPTS_DIR" "$PI_SKILLS_DIR"

if [ -d "$BRAIN_DUMP_DIR/.pi/prompts" ]; then
  cp -R "$BRAIN_DUMP_DIR/.pi/prompts/." "$PI_PROMPTS_DIR/"
  echo -e "${GREEN}✓ Installed Pi prompts into $PI_PROMPTS_DIR${NC}"
fi

if [ -d "$BRAIN_DUMP_DIR/.pi/skills" ]; then
  cp -R "$BRAIN_DUMP_DIR/.pi/skills/." "$PI_SKILLS_DIR/"
  echo -e "${GREEN}✓ Installed Pi skills into $PI_SKILLS_DIR${NC}"
fi

cleanup_legacy_known_files

echo -e "${GREEN}✓ Pi CLI-only setup complete${NC}"
echo "No MCP server was configured for Pi. Launches use the Pi CLI with global prompts and skills under ${PI_AGENT_DIR}."
