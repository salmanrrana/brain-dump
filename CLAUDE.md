# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

Brain Dump is a local-first kanban task manager for AI-assisted development workflows. It integrates with Claude Code via MCP tools, and includes "Ralph" — an autonomous agent mode that iterates through backlogs.

## Commands

```bash
pnpm dev                    # Start dev server on port 4242
pnpm build                  # Build for production
pnpm check                  # Run all checks (type-check, lint, test)
pnpm type-check             # TypeScript type checking
pnpm lint                   # ESLint
pnpm test                   # Run unit tests with Vitest
pnpm db:migrate             # Run Drizzle migrations
pnpm db:generate            # Generate migration files from schema changes
```

Full CLI reference: [docs/cli.md](docs/cli.md)

## Architecture

**Tech Stack:** TanStack Start (React 19 + Vite + Nitro), SQLite + Drizzle ORM, Tailwind CSS v4, TanStack Query, @dnd-kit

**Key Directories:**
- `src/api/` — Server functions (TanStack Start `createServerFn`)
- `src/components/` — React components (modals, kanban board, sidebar)
- `src/lib/` — Core utilities: database, schema, XDG paths, hooks
- `src/routes/` — TanStack Router pages
- `core/` — Pure business logic (24 modules, shared by web + MCP)
- `mcp-server/` — Standalone MCP server (9 tools, 65 actions)
- `cli/` — CLI tool for terminal access

Full architecture, schema, data paths: [docs/architecture.md](docs/architecture.md)

## Quality Workflow

Status flow: `backlog → ready → in_progress → ai_review → human_review → done`

Quick reference:
1. `workflow` tool, `action: "start-work"`, `ticketId` → before writing code
2. Implement + `pnpm check`
3. `workflow` tool, `action: "complete-work"`, `ticketId`, `summary` → after committing
4. Self-review + `review` tool, `action: "submit-finding"` → for each issue
5. `review` tool, `action: "generate-demo"`, `ticketId`, `steps` → then STOP

Load the `brain-dump-workflow` skill for the complete tool call sequence.

Skills: `/next-task`, `/review-ticket`, `/review-epic`, `/demo`, `/reconcile-learnings`

Hooks, state enforcement, auto-PR workflow: [docs/hooks-and-state.md](docs/hooks-and-state.md)

## DO/DON'T Guidelines

### Database Queries

| ✅ DO                                                                      | ❌ DON'T                                              |
| -------------------------------------------------------------------------- | ----------------------------------------------------- |
| Use Drizzle ORM: `db.select().from(tickets)`                               | Raw SQL strings: `db.run("SELECT * FROM tickets")`    |
| Use typed schema imports: `import { tickets } from "../lib/schema"`        | String-based table names                              |
| Use `eq()`, `and()`, `sql` from drizzle-orm for conditions                 | String concatenation for WHERE clauses                |
| Use transactions for multi-table operations: `db.transaction(() => {...})` | Multiple independent queries that should be atomic    |
| Use `.get()` for single row, `.all()` for multiple                         | Assume query returns what you expect without checking |

### React & TanStack Query

| ✅ DO                                                                                                | ❌ DON'T                                                |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Use `useQuery` with `queryKeys` for data fetching                                                    | `useState` + `useEffect` for fetched data               |
| Use `useMutation` with `onSuccess` for state changes                                                 | Direct API calls without proper cache invalidation      |
| Invalidate queries after mutations: `queryClient.invalidateQueries({ queryKey: queryKeys.tickets })` | Manual cache manipulation or refetch after every change |
| Use centralized `queryKeys` object from `src/lib/hooks.ts`                                           | Hardcoded query key strings throughout components       |
| Create custom hooks in `src/lib/hooks.ts` for reusable query logic                                   | Duplicate query setup in multiple components            |

### Styling Patterns

| ✅ DO                                                                                 | ❌ DON'T                                             |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Use Tailwind classes for static styles: `className="p-4 bg-slate-800"`                | Inline style objects for single-use styles           |
| Use CSS variables for theming: `var(--bg-primary)`, `var(--shadow-modal)`             | Hardcoded colors that don't adapt to themes          |
| Reserve inline styles for dynamic/computed values: `style={{ width: `${percent}%` }}` | Mix Tailwind and inline styles inconsistently        |
| Define shared style constants at module level for referential stability               | Create new objects inside components that are reused |
| Use `React.CSSProperties` type for inline style objects when needed                   | Untyped style objects that miss IDE autocomplete     |

### Server Functions

| ✅ DO                                                                         | ❌ DON'T                                       |
| ----------------------------------------------------------------------------- | ---------------------------------------------- |
| Use `createServerFn({ method: "GET" })` for reads, `"POST"` for writes        | Mix GET/POST inconsistently                    |
| Use `.inputValidator()` for type-safe input handling                          | Access raw input without validation            |
| Return typed data directly: `return db.select().from(tickets).all()`          | Wrap in unnecessary response objects           |
| Use `ensureExists()` for required lookups: `ensureExists(project, "Project")` | Return null and let caller handle missing data |
| Import from `@tanstack/react-start` (not `@tanstack/react-start/server`)      | Wrong import path                              |

### MCP Tool Implementation

| ✅ DO                                                                                      | ❌ DON'T                                 |
| ------------------------------------------------------------------------------------------ | ---------------------------------------- |
| Use Zod schemas for input validation: `{ ticketId: z.string() }`                           | Trust input without validation           |
| Return structured `{ content: [{ type: "text", text: ... }] }` format                      | Return plain strings                     |
| Set `isError: true` for error responses                                                    | Return error text without the error flag |
| Use `log.info()` / `log.error()` from `../lib/logging.js`                                  | `console.log` in MCP server code         |
| Include helpful error messages: `"Project not found. Use list_projects to see available."` | Generic "Not found" errors               |

### Testing Patterns (Kent C. Dodds)

| ✅ DO                                                     | ❌ DON'T                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------- |
| Test user behavior: what users see, click, and experience | Test implementation details, internal state, or private methods |
| Integration tests for workflows: test components together | Unit tests for every function                                   |
| Real database fixtures with actual schema                 | Excessive mocking of internals                                  |
| Tests that fail when user-facing behavior breaks          | Tests that break on refactoring internals                       |
| Ask: "Does this test catch bugs users would encounter?"   | Chase 100% code coverage as a goal                              |

## Testing

- Unit tests live alongside source files: `*.test.ts`
- E2E tests in `e2e/` directory
- Run specific test: `pnpm test src/lib/backup.test.ts` or `pnpm test -t "pattern"`

**The single most important question: "What real user behavior does this test verify?"**

If you cannot answer with a concrete user action and expected outcome, DO NOT write the test.

Before writing ANY test: (1) Can a user trigger this? (2) Can a user see the result? (3) Would a user report a bug if this broke? All three must be YES.

Rules:
1. Test user flows, not functions
2. Test visible outcomes, not internal state
3. Test error messages, not error handling
4. Mock boundaries, not internals
5. Fewer, meaningful tests > many trivial tests

## Verification

After implementing ANY feature: `pnpm type-check && pnpm lint && pnpm test` must pass.

Full checklist (UI changes, DB changes, MCP changes): [docs/verification-checklist.md](docs/verification-checklist.md)

## Code Review

After completing code changes, run `/review` to launch the 3-agent review pipeline (code-reviewer, silent-failure-hunter, code-simplifier). The Stop hook will remind you if you forget.

## Development Learnings

Always verify the complete chain end-to-end:
- Frontend trigger → API/server function → Backend logic → Observable output
- Never build backend without connecting frontend, or vice versa
- Test the FULL flow, not just individual pieces

## Specifications

For complex features, create specs using the 6-layer template: `plans/spec-template.md`
Location: `plans/specs/{ticket-id}-{feature-name}.md`

## Reference Docs

| Topic | Location |
|-------|----------|
| Full architecture, schema, data paths | [docs/architecture.md](docs/architecture.md) |
| CLI reference | [docs/cli.md](docs/cli.md) |
| MCP tools reference | [docs/mcp-tools.md](docs/mcp-tools.md) |
| Hooks, state enforcement, auto-PR | [docs/hooks-and-state.md](docs/hooks-and-state.md) |
| Verification checklist | [docs/verification-checklist.md](docs/verification-checklist.md) |
| Universal workflow details | [docs/universal-workflow.md](docs/universal-workflow.md) |
| Enterprise conversation logging | [docs/enterprise-logging.md](docs/enterprise-logging.md) |
| Spec template | [plans/spec-template.md](plans/spec-template.md) |
