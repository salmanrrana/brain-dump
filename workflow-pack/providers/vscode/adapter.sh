#!/usr/bin/env bash
# brain-dump-workflow-pack v1.0.0 | DO NOT EDIT — managed by brain-dump
#
# VS Code provider adapter
# Manages folder at ~/.copilot/brain-dump/ (shared with Copilot) — no config file edits
#
# Usage:
#   adapter.sh enable   — place assets in managed folder + write receipt
#   adapter.sh disable  — remove managed folder + delete receipt
#   adapter.sh status   — check if installed
#
# Implemented in ticket 3.3

set -euo pipefail

ACTION="${1:-status}"

case "$ACTION" in
  enable|disable|status)
    echo "VS Code adapter: $ACTION — not yet implemented (see ticket 3.3)"
    exit 0
    ;;
  *)
    echo "Usage: adapter.sh {enable|disable|status}" >&2
    exit 1
    ;;
esac
