# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Brain Dumpy is a local-first kanban task manager designed for AI-assisted development workflows. It integrates with Claude Code to provide ticket context when starting work, and includes "Ralph" - an autonomous agent mode that iterates through backlogs.

## Commands

```bash
# Development
pnpm dev                    # Start dev server on port 4242
pnpm build                  # Build for production
pnpm start                  # Start production server

# Quality checks
pnpm check                  # Run all checks (type-check, lint, test)
pnpm type-check             # TypeScript type checking
pnpm lint                   # ESLint
pnpm test                   # Run unit tests with Vitest
pnpm test:watch             # Watch mode for tests
pnpm test:e2e               # Playwright E2E tests

# Database
pnpm db:migrate             # Run Drizzle migrations
pnpm db:generate            # Generate migration files from schema changes
pnpm db:studio              # Open Drizzle Studio for database inspection

# CLI tool
pnpm brain-dump current     # Show current ticket
pnpm brain-dump done        # Move current ticket to review
pnpm brain-dump backup      # Create database backup
pnpm brain-dump check       # Quick integrity check
pnpm brain-dump check --full  # Full health check
```

## Architecture

### Tech Stack
- **Framework**: TanStack Start (React 19 + Vite + Nitro)
- **Database**: SQLite with better-sqlite3, Drizzle ORM
- **Styling**: Tailwind CSS v4
- **State**: TanStack Query for server state
- **Drag & Drop**: @dnd-kit

### Key Directories
- `src/api/` - Server functions (CRUD operations, terminal launching, Ralph agent)
- `src/components/` - React components (modals, kanban board, sidebar)
- `src/lib/` - Core utilities: database, schema, XDG paths, backup, logging
- `src/routes/` - TanStack Router pages
- `mcp-server/` - MCP server for Claude Code integration (standalone Node.js)
- `cli/` - CLI tool for ticket status updates from terminal

### Database Schema
Defined in `src/lib/schema.ts` with Drizzle ORM:
- `projects` - Links to filesystem paths
- `epics` - Groups related tickets within a project
- `tickets` - Main work items with status, priority, tags, subtasks
- `ticket_comments` - Activity log for AI work summaries
- `settings` - App configuration (terminal emulator, Ralph options)

Full-text search via SQLite FTS5 on tickets (title, description, tags).

### Data Storage (XDG Compliance)
Cross-platform paths defined in `src/lib/xdg.ts`:
- **Linux**: `~/.local/share/brain-dumpy/` (data), `~/.local/state/brain-dumpy/` (logs, backups)
- **macOS**: `~/Library/Application Support/brain-dumpy/`
- **Windows**: `%APPDATA%\brain-dumpy\`

Legacy migration from `~/.brain-dump/` is automatic on first run.

### MCP Server
The `mcp-server/index.js` is a standalone Node.js MCP server that provides tools for Claude to manage tickets from any project. It connects to the same SQLite database and includes:
- Project/ticket/epic CRUD operations
- Git integration (branch creation, commit linking)
- Database health monitoring

### Ralph Workflow
Ralph is an autonomous agent mode that:
1. Generates a `plans/prd.json` from tickets
2. Runs Claude in a loop, picking tasks where `passes: false`
3. Implements features, runs tests, updates status via MCP
4. Continues until all tasks pass or max iterations reached

## Server Functions Pattern

API functions in `src/api/` use TanStack Start's `createServerFn`:
```typescript
import { createServerFn } from "@tanstack/react-start/server";

export const getTickets = createServerFn().handler(async () => {
  return db.select().from(tickets).all();
});
```

These are called from React components via TanStack Query.

## Testing

- Unit tests live alongside source files: `*.test.ts`
- E2E tests in `e2e/` directory
- Run specific test file: `pnpm test src/lib/backup.test.ts`
- Run single test: `pnpm test -t "test name pattern"`
