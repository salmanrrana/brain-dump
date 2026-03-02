#!/usr/bin/env bash
# brain-dump-workflow-pack v1.0.0 | DO NOT EDIT — managed by brain-dump
#
# Codex provider adapter
# MCP-only — workflow-pack not supported for Codex
#
# Usage:
#   adapter.sh enable   — refuses with clear message
#   adapter.sh disable  — no-op (nothing installed)
#   adapter.sh status   — reports MCP-only
#
# Implemented in ticket 3.4

set -euo pipefail

ACTION="${1:-status}"

case "$ACTION" in
  enable)
    echo "Codex does not support workflow-pack. Codex uses MCP-only mode." >&2
    echo "Use 'brain-dump setup --provider codex' for MCP registration." >&2
    exit 0
    ;;
  disable)
    echo "Codex adapter: nothing to disable (MCP-only)"
    exit 0
    ;;
  status)
    echo "Codex adapter: MCP-only (no workflow-pack support)"
    exit 0
    ;;
  *)
    echo "Usage: adapter.sh {enable|disable|status}" >&2
    exit 1
    ;;
esac
