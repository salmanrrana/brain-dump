#!/bin/bash
# detect-libraries.sh
# Utility script to extract significant libraries from package.json
# Used by context7-library-compliance agent to know which libraries to query
#
# Output: One library name per line
#
# Usage:
#   ./detect-libraries.sh                    # Uses CLAUDE_PROJECT_DIR or current dir
#   ./detect-libraries.sh /path/to/project   # Uses specified directory

set -e

PROJECT_DIR="${1:-${CLAUDE_PROJECT_DIR:-.}}"
PACKAGE_JSON="$PROJECT_DIR/package.json"

# Libraries that are significant enough to verify against Context7 docs
# These are major frameworks/libraries with substantial API surfaces
SIGNIFICANT_PATTERNS=(
  "^react$"
  "^react-dom$"
  "^next$"
  "^@tanstack/"
  "^prisma$"
  "^@prisma/"
  "^drizzle-orm$"
  "^zod$"
  "^axios$"
  "^@trpc/"
  "^express$"
  "^fastify$"
  "^hono$"
  "^@hono/"
  "^vite$"
  "^vitest$"
  "^tailwindcss$"
  "^@radix-ui/"
  "^@shadcn/"
  "^framer-motion$"
  "^zustand$"
  "^jotai$"
  "^recoil$"
  "^@reduxjs/"
  "^swr$"
  "^date-fns$"
  "^dayjs$"
  "^luxon$"
  "^lodash"
  "^ramda$"
  "^fp-ts$"
  "^effect$"
  "^@effect/"
  "^mongoose$"
  "^typeorm$"
  "^kysely$"
  "^better-sqlite3$"
  "^pg$"
  "^mysql2$"
  "^ioredis$"
  "^bullmq$"
  "^@aws-sdk/"
  "^@azure/"
  "^@google-cloud/"
  "^firebase"
  "^supabase$"
  "^@supabase/"
  "^stripe$"
  "^@stripe/"
  "^clerk$"
  "^@clerk/"
  "^next-auth$"
  "^@auth/"
  "^passport$"
  "^jose$"
  "^jsonwebtoken$"
  "^bcrypt$"
  "^argon2$"
  "^playwright$"
  "^@playwright/"
  "^cypress$"
  "^jest$"
  "^@testing-library/"
  "^msw$"
  "^graphql$"
  "^@apollo/"
  "^urql$"
  "^@trpc/"
)

# Check if package.json exists
if [[ ! -f "$PACKAGE_JSON" ]]; then
  echo "# No package.json found at $PACKAGE_JSON" >&2
  exit 0
fi

# Check if jq is available
if ! command -v jq &> /dev/null; then
  echo "# jq not installed, falling back to grep-based parsing" >&2
  # Fallback: basic grep extraction (less reliable)
  grep -oE '"[^"]+"\s*:\s*"[^"]*"' "$PACKAGE_JSON" | \
    grep -oE '^"[^"]+"' | \
    tr -d '"' | \
    sort -u
  exit 0
fi

# Extract all dependencies (deps + devDeps) and filter to significant ones
extract_deps() {
  jq -r '
    ((.dependencies // {}) + (.devDependencies // {})) |
    keys[]
  ' "$PACKAGE_JSON" 2>/dev/null || echo ""
}

# Filter to significant libraries
filter_significant() {
  local deps="$1"
  local pattern

  # Build a combined pattern for grep
  pattern=$(printf "%s\n" "${SIGNIFICANT_PATTERNS[@]}" | paste -sd'|' -)

  echo "$deps" | grep -E "$pattern" 2>/dev/null || true
}

# Main execution
main() {
  local all_deps
  all_deps=$(extract_deps)

  if [[ -z "$all_deps" ]]; then
    echo "# No dependencies found in package.json" >&2
    exit 0
  fi

  # Output significant libraries, one per line
  filter_significant "$all_deps" | sort -u
}

main
