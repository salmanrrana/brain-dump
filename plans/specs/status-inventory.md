# Ticket Status Literal Inventory

Ticket: `348966d6-a8c9-486a-8ed8-9eeb2453720b`.

Phase 0 grep command used before refactor:

```bash
git grep -n -E '"(backlog|ready|in_progress|ai_review|ai_verification|human_review|done)"|'"'"'(backlog|ready|in_progress|ai_review|ai_verification|human_review|done)'"'"'' -- core mcp-server cli src hooks scripts
```

Canonical status module: `core/workflow-steps.ts`.

## Migrated Production Declarations

- [x] `core/types.ts:24` - `TicketStatus` union now imports from `core/workflow-steps.ts`.
- [x] `core/ticket.ts:154` - `VALID_STATUSES` replaced with `TICKET_STATUSES` / `isTicketStatus`.
- [x] `mcp-server/tools/ticket.ts:46` - MCP Zod status enum now uses `TICKET_STATUSES`.
- [x] `cli/commands/ticket.ts:46` - CLI ticket status flags now use `TICKET_STATUSES`.
- [x] `cli/commands/search.ts:15` - CLI search status flag now uses `TICKET_STATUSES`.
- [x] `cli/lib/command-registry.ts:166` - ticket update CLI metadata now derives from `TICKET_STATUSES`.
- [x] `cli/lib/command-registry.ts:195` - ticket update-status CLI metadata now derives from `TICKET_STATUSES`.
- [x] `cli/lib/command-registry.ts:265` - ticket list-by-epic CLI metadata now derives from `TICKET_STATUSES`.
- [x] `cli/lib/command-registry.ts:1420` - top-level search CLI metadata now derives from `TICKET_STATUSES`.
- [x] `src/lib/schema.ts:46` - Drizzle ticket status type now uses canonical `TicketStatus`.
- [x] `src/lib/constants.ts:15` - ticket form status options now derive from canonical metadata.
- [x] `src/lib/constants.ts:28` - Kanban column status order now derives from `KANBAN_STATUSES`.
- [x] `src/lib/constants.ts:46` - status sort order now derives from canonical `STATUS_ORDER`.
- [x] `src/components/navigation/StatusPill.tsx:3` - local status union, labels, and color tokens replaced with canonical exports.
- [x] `src/components/tickets/ticket-form-schema.ts:3` - Zod ticket status schema now uses `TICKET_STATUSES`.
- [x] `src/components/tickets/EditTicketModal.tsx:43` - status dropdown values/labels now derive from canonical statuses/metadata; local hex swatches are display-only.
- [x] `src/components/tickets/LaunchActions.tsx:23` - launchable status list now uses canonical `workable` metadata.
- [x] `src/components/tickets/RelatedTickets.tsx:24` - local valid-status guard replaced with canonical `isTicketStatus`; sorting uses canonical `STATUS_ORDER`.
- [x] `src/components/epics/EpicTicketsList.tsx:24` - local status group list replaced with `KANBAN_STATUSES`.
- [x] `src/api/tickets.ts:222` - server-function status validator now uses canonical `isTicketStatus`.

## Transition Guards Migrated

- [x] `core/workflow.ts:117` - start-work idempotency keeps existing behavior; regression guard now calls `assertTransition`.
- [x] `core/workflow.ts:285` - complete-work status precondition now calls `assertTransition`.
- [x] `core/review.ts:200` - submit-finding precondition now calls `assertTransition`.
- [x] `core/review.ts:394` - generate-demo precondition now calls `assertTransition`.
- [x] `core/review.ts` - retired manual feedback guard now rejects the old approval path.

## Intentionally Retained Literals

- [x] `core/db.ts:309`, `src/lib/db.ts:163`, test schemas - SQLite defaults/migration fixtures intentionally keep raw SQL literals.
- [x] `core/workflow.ts`, `core/review.ts`, `core/learnings.ts`, `src/api/*.ts` SQL queries - status comparisons and update values are behavior sites, not redeclared status inventories.
- [x] `core/__tests__/**`, `mcp-server/**/__tests__/**`, `cli/__tests__/**`, `src/**/*.test.ts`, `src/**/*.test.tsx` - characterization fixtures intentionally spell statuses to verify user-visible behavior.
- [x] `docs/**`, provider skill/prompt files, `.github/**`, `.opencode/**`, `.cursor/**`, `.pi/**` - prose/examples intentionally retain human-readable status names until the prompt-sync generator ticket owns them.
- [x] `core/tasks.ts`, `cli/commands/session.ts`, `src/lib/schema.ts` session/task status declarations - these are not ticket statuses.
- [x] `src/lib/constants.ts:getStatusColor`, `src/routes/board.tsx`, `src/routes/list.tsx`, `TicketCard.tsx`, `TicketModal.tsx`, `ticket.$id.tsx` - status-specific UI branches retained as behavior branches, not source-of-truth arrays.

## Final Audit

- [x] Drift test added: `core/__tests__/workflow-steps.test.ts` fails on new production redeclared ticket status arrays/unions outside `core/workflow-steps.ts`.
- [x] Docs cross-reference executable spec: `docs/claude-flow-ticket-lifecycle.md`, `docs/universal-workflow.md`.
- [x] Final grep after implementation recorded in the ticket test report.
