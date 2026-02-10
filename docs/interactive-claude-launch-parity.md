# Interactive Claude Launch Parity

This document tracks every interactive Claude launch entry point and verifies they share the same backend launch behavior.

## Entry points

| UI Entry Point | File | Launch call |
| --- | --- | --- |
| Ticket detail page | `src/routes/ticket.$id.tsx` | `launchClaudeInTerminal(...)` |
| Edit Ticket modal (kanban modal variant) | `src/components/TicketModal.tsx` | `launchClaudeInTerminal(...)` |
| Edit Ticket modal (tickets module variant) | `src/components/tickets/EditTicketModal.tsx` | `launchClaudeInTerminal(...)` |
| Project inception modal | `src/components/inception/InceptionModal.tsx` via API | `launchProjectInception(...)` |
| Spec breakdown flow | API only (`src/api/inception.ts`) | `launchSpecBreakdown(...)` |

## Parity requirement

- Interactive scripts must keep the terminal session open after the launch command exits.
- Interactive scripts must not use `set -e` so a non-zero Claude exit does not close the terminal before `exec bash`.
- Ticket launch entry points must route through `launchClaudeInTerminal(...)` to keep behavior consistent.

## Regression tests

- `src/api/interactive-launch-parity.test.ts` validates:
  - shell-open behavior (`exec bash`) and no fail-fast (`set -e`) for interactive scripts
  - parity for Claude, inception, OpenCode, Codex, and Copilot launch script generation
  - shared `launchClaudeInTerminal(...)` usage in all ticket UI entry points
