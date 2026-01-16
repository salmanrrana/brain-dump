#!/usr/bin/env bash
# get-ticket-context.sh - Extracts ticket context from branch name and Brain Dump database
#
# Usage: ./scripts/get-ticket-context.sh [format]
#   format: "short" (default) - ticket ID and title
#           "full" - includes description and acceptance criteria
#           "id" - just the ticket ID

set -euo pipefail

FORMAT="${1:-short}"

# Get current branch name
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

if [[ -z "$BRANCH" ]]; then
  exit 0
fi

# Extract ticket number from branch name
# Matches patterns like: feature/7-1-add-description, bugfix/3-2-fix-bug
# The ticket number (e.g., 7-1) maps to ticket titles like "7.1 Add Pre-commit Hooks"
TICKET_NUM=$(echo "$BRANCH" | sed -E 's#^[^/]+/##' | grep -oE '^[0-9]+[-\.][0-9]+' | head -1 || echo "")

# Fallback: check for UUID in branch name (legacy support)
TICKET_ID=""
if [[ -z "$TICKET_NUM" ]]; then
  TICKET_ID=$(echo "$BRANCH" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || echo "")
fi

# Exit if neither UUID nor ticket number found
if [[ -z "$TICKET_ID" ]] && [[ -z "$TICKET_NUM" ]]; then
  exit 0
fi

# Determine database path based on OS
if [[ "$OSTYPE" == "darwin"* ]]; then
  DB_PATH="$HOME/Library/Application Support/brain-dump/brain-dump.db"
elif [[ "$OSTYPE" == "linux"* ]]; then
  DB_PATH="${XDG_DATA_HOME:-$HOME/.local/share}/brain-dump/brain-dump.db"
else
  DB_PATH="$HOME/.brain-dump/brain-dump.db"
fi

if [[ ! -f "$DB_PATH" ]]; then
  # Fallback: just output the ticket ID or number
  if [[ "$FORMAT" == "id" ]]; then
    echo "${TICKET_ID:-$TICKET_NUM}"
  else
    echo "Ticket: ${TICKET_ID:-$TICKET_NUM}"
  fi
  exit 0
fi

# If we have a ticket number but not a UUID, look up the ticket by title pattern
if [[ -z "$TICKET_ID" ]] && [[ -n "$TICKET_NUM" ]]; then
  # Convert 7-1 to pattern that matches "7.1" in title
  SEARCH_PATTERN=$(echo "$TICKET_NUM" | sed 's/-/./')
  TICKET_ID=$(sqlite3 "$DB_PATH" "SELECT id FROM tickets WHERE title LIKE '$SEARCH_PATTERN %' LIMIT 1;" 2>/dev/null || echo "")

  if [[ -z "$TICKET_ID" ]]; then
    # Fallback: output the ticket number
    if [[ "$FORMAT" == "id" ]]; then
      echo "$TICKET_NUM"
    else
      echo "Ticket: $TICKET_NUM"
    fi
    exit 0
  fi
fi

# Query the database for ticket info
case "$FORMAT" in
  id)
    echo "$TICKET_ID"
    ;;
  short)
    RESULT=$(sqlite3 "$DB_PATH" "SELECT title FROM tickets WHERE id = '$TICKET_ID' LIMIT 1;" 2>/dev/null || echo "")
    if [[ -n "$RESULT" ]]; then
      echo "Ticket: $TICKET_ID"
      echo "Title: $RESULT"
    else
      echo "Ticket: $TICKET_ID"
    fi
    ;;
  full)
    # Get title and description
    TITLE=$(sqlite3 "$DB_PATH" "SELECT title FROM tickets WHERE id = '$TICKET_ID' LIMIT 1;" 2>/dev/null || echo "")
    DESC=$(sqlite3 "$DB_PATH" "SELECT description FROM tickets WHERE id = '$TICKET_ID' LIMIT 1;" 2>/dev/null || echo "")

    if [[ -n "$TITLE" ]]; then
      echo "Ticket: $TICKET_ID"
      echo "Title: $TITLE"
      echo ""
      if [[ -n "$DESC" ]]; then
        echo "## Ticket Description"
        echo "$DESC"
      fi
    else
      echo "Ticket: $TICKET_ID"
    fi
    ;;
esac
