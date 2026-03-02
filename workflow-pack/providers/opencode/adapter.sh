#!/usr/bin/env bash
# brain-dump-workflow-pack v1.0.0 | DO NOT EDIT — managed by brain-dump
#
# OpenCode provider adapter
# Installs to .opencode/brain-dump/ (project-level, NOT user-global)
#
# Usage:
#   adapter.sh enable   — install assets + write receipt
#   adapter.sh disable  — remove assets + delete receipt
#   adapter.sh status   — check if installed
#
# Implemented in ticket 3.4

set -euo pipefail

ACTION="${1:-status}"

case "$ACTION" in
  enable|disable|status)
    echo "OpenCode adapter: $ACTION — not yet implemented (see ticket 3.4)"
    exit 0
    ;;
  *)
    echo "Usage: adapter.sh {enable|disable|status}" >&2
    exit 1
    ;;
esac
