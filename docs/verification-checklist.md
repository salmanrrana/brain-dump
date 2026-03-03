# Verification Checklist

After implementing ANY feature, complete these steps:

## Code Quality (Always Required)

- [ ] Run `pnpm type-check` - must pass with no errors
- [ ] Run `pnpm lint` - must pass with no errors
- [ ] Run `pnpm test` - all tests must pass

## If You Added New Code

- [ ] Added tests for new functionality (ONLY tests that verify real user behavior - see Testing Philosophy in CLAUDE.md)
- [ ] Used typed error classes (not generic `Error`)
- [ ] Used Drizzle ORM (not raw SQL) - see DO/DON'T table in CLAUDE.md
- [ ] Followed existing patterns from DO/DON'T tables
- [ ] No hardcoded values that should be configurable

## If You Modified Existing Code

- [ ] Existing tests still pass
- [ ] No regressions in related functionality
- [ ] Updated tests if behavior changed
- [ ] Did not break backward compatibility (unless explicitly requested)

## If UI Changes

- [ ] Manually verified in browser at `localhost:4242`
- [ ] Checked responsive layout
- [ ] Verified TanStack Query invalidates and updates correctly
- [ ] Accessibility: keyboard navigation works, proper ARIA labels

## If Database Changes

- [ ] Migration file created via `pnpm db:generate`
- [ ] Migration tested with `pnpm db:migrate`
- [ ] Backup tested if schema changed
- [ ] Updated `src/lib/schema.ts` with proper types and constraints

## If MCP Server Changes

- [ ] Tested tool via Claude Code integration
- [ ] Verified error responses are informative
- [ ] Updated tool documentation if interface changed
- [ ] Added Zod schema for input validation

## Before Marking Complete

- [ ] All acceptance criteria from ticket met
- [ ] Work summary added via `comment` tool, `action: "add"` (for Ralph sessions)
- [ ] Session completed with appropriate outcome (for Ralph sessions)
- [ ] Committed with proper message format: `feat(<ticket-id>): <description>`
