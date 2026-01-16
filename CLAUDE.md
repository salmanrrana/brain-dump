# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Brain Dump is a local-first kanban task manager designed for AI-assisted development workflows. It integrates with Claude Code to provide ticket context when starting work, and includes "Ralph" - an autonomous agent mode that iterates through backlogs.

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
- **Linux**: `~/.local/share/brain-dump/` (data), `~/.local/state/brain-dump/` (logs, backups)
- **macOS**: `~/Library/Application Support/brain-dump/`
- **Windows**: `%APPDATA%\brain-dump\`

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

## Specifications

### Spec Template
For complex features, create detailed specs following the 6-layer pattern in `plans/spec-template.md`:

1. **Overview** - WHY the feature exists (not just WHAT it does)
2. **Reference Tables** - Configuration options, states, error codes
3. **Type Definitions** - Complete TypeScript interfaces with JSDoc
4. **State Machine** - Mermaid diagrams for stateful features
5. **Design Decisions** - "Why X vs Y" with numbered rationale
6. **Implementation Guide** - Step-by-step with copy-paste code

### When to Write a Spec
Create a detailed spec (using `plans/spec-template.md`) for:
- Features with state machines or complex workflows
- New MCP tools
- Database schema changes
- Features touching multiple components

### Spec Location
- Template: `plans/spec-template.md`
- Specs: `plans/specs/{ticket-id}-{feature-name}.md`
- Example: `plans/specs/7.11-state-machine-observability.md`

### Key Principle
> **"Explicit over Implicit"**: Every decision that could be made is made upfront, documented, and explained. Claude becomes an executor of a well-defined plan rather than an improviser working from vague requirements.

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

### Testing Philosophy (Kent C. Dodds)

**"The more your tests resemble the way your software is used, the more confidence they can give you."**

Follow these principles when writing or reviewing tests:

1. **Test user behavior, not implementation details**
   - Bad: Testing internal state, private methods, component internals
   - Good: Testing what users see, click, and experience

2. **Coverage metrics are meaningless - user flow coverage is everything**
   - Don't chase 100% code coverage
   - Ask: "Does this test catch bugs users would actually encounter?"

3. **Integration tests > unit tests for most cases**
   - Test components together as users experience them
   - Only unit test pure utility functions and complex algorithms

4. **Don't mock too much**
   - Excessive mocking means you're testing mocks, not real behavior
   - Mock network boundaries, not internal modules

5. **Write tests that fail for the right reasons**
   - Tests should break when user-facing behavior breaks
   - Tests should NOT break when refactoring internals

**When reviewing tests, reject:**
- Tests that verify implementation details
- Tests with excessive mocking
- Tests that don't reflect real user workflows
- Tests written just to increase coverage numbers

## Automatic Code Review

**IMPORTANT: After completing any code changes (using Write, Edit, or NotebookEdit tools), you MUST run the code review pipeline before responding to the user.**

The review pipeline consists of three agents that should be run in parallel:
1. `pr-review-toolkit:code-reviewer` - Reviews code against project guidelines
2. `pr-review-toolkit:silent-failure-hunter` - Identifies silent failures and error handling issues
3. `pr-review-toolkit:code-simplifier` - Simplifies and refines code for clarity

You can run all three at once using: `/review`

**When to skip review:**
- Documentation-only changes (.md files)
- Configuration file changes (package.json, tsconfig.json, etc.)
- Git operations (commits, merges)
- Read-only operations (searching, exploring)

**This is mandatory** - the Stop hook will remind you if you forget, but you should proactively run reviews after completing code work.
