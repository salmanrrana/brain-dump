#!/usr/bin/env bash
# brain-dump-workflow-pack v1.0.0 | DO NOT EDIT — managed by brain-dump
#
# Claude Code provider adapter
# Installs workflow-pack as a Claude Code plugin via enabledPlugins in ~/.claude/settings.json
#
# Usage:
#   adapter.sh enable   — install plugin + write receipt
#   adapter.sh disable  — remove plugin + delete receipt
#   adapter.sh status   — check if installed
#
# Implemented in ticket 3.2

set -euo pipefail

ACTION="${1:-status}"

case "$ACTION" in
  enable|disable|status)
    echo "Claude Code adapter: $ACTION — not yet implemented (see ticket 3.2)"
    exit 0
    ;;
  *)
    echo "Usage: adapter.sh {enable|disable|status}" >&2
    exit 1
    ;;
esac
