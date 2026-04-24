# Frontend Performance Validation

Generated on 2026-04-24 after the frontend performance optimization epic.

## Commands Run

```bash
pnpm build:analyze
pnpm type-check && pnpm lint && pnpm test && pnpm build
pnpm test:e2e e2e/app.spec.ts
```

`pnpm build:analyze` completed successfully and refreshed `docs/performance/bundle-baseline.md` from `.output/public/assets`.

`pnpm type-check && pnpm lint && pnpm test && pnpm build` completed successfully for the required ticket gate. The Vitest suite reported 131 passing test files and 1998 passing tests with 15 skipped tests.

`pnpm test:e2e e2e/app.spec.ts` was attempted as an extra browser-flow check. It failed because the spec is stale against the current UI and sample data assumptions: examples include `h3:has-text('Review')` now matching both `AI Review` and `Human Review`, the old `Try drag and drop` sample ticket not existing, and the new ticket control now opening a `New` split-button menu before the `New Ticket` option can be selected.

## Bundle Comparison

| Metric              |                Baseline |                          Final |                                    Change |
| ------------------- | ----------------------: | -----------------------------: | ----------------------------------------: |
| Client scripts      |                      41 |                             86 |                          +45 split chunks |
| Initial/root assets |              1285.91 kB |                      979.52 kB |                      -306.39 kB (-23.83%) |
| Initial/root gzip   |               315.91 kB |                      270.46 kB |                       -45.45 kB (-14.39%) |
| Largest root script |              1153.11 kB |                      784.43 kB |                      -368.68 kB (-31.97%) |
| Chunks over 500 kB  | `main-*`, `dashboard-*` | `main-*`, `CostTreemapChart-*` | dashboard split out; treemap remains lazy |

## Current Chunk Observations

- `main-D8MHsfJk.js` is still the largest root script at 784.43 kB uncompressed and 221.44 kB gzip, so root payload remains the primary remaining parse/compile risk.
- Dashboard charting is no longer represented by a single 1113.03 kB `dashboard-*` client chunk. The dashboard route shell is 30.71 kB, with chart-heavy code split into assets such as `CostTreemapChart-CEp8Dmjt.js` and `generateCategoricalChart-05kbYgPw.js`.
- Route-level chunks are present for `board-*`, `list-*`, `ticket._id-*`, `epic._id-*`, and `projects._projectId-*`, so the build output now exposes route-level regressions instead of one monolithic application chunk.
- Modal and tool surfaces are split into separate assets, including `TicketModal-*`, `SettingsModal-*`, `ProjectModal-*`, `EpicModal-*`, `ImportModal-*`, `InceptionModal-*`, `ContainerLogsModal-*`, and `ShortcutsModal-*`.
- Production client assets include devtools chunks named `FloatingTanStackRouterDevtools-*` and `BaseTanStackRouterDevtoolsPanel-*`; they are no longer part of `main-*`, but they should remain watched because the goal is to keep devtools out of the production initial path.

## Flow Coverage

| Flow                              | Verification                                                                                                                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial project and board load    | Covered by passing component and route tests for board/list primitives, with stale E2E coverage noted below.                                                                                                                      |
| Board navigation and interactions | Covered by passing `src/components/board/KanbanBoard.test.tsx`, `src/components/board/KanbanColumn.test.tsx`, and `src/components/board/TicketCard.test.tsx`; the older Playwright board spec needs selector/sample-data updates. |
| List navigation                   | Covered by passing `src/components/TicketListView.test.tsx` and route-level build output showing a separate `list-*` chunk.                                                                                                       |
| Dashboard tabs                    | Covered by passing `src/routes/-dashboard.test.tsx` for dashboard route rendering and tab data transformation behavior.                                                                                                           |
| Ticket modal open                 | Covered by passing `src/components/TicketModal.test.tsx`, `src/components/TicketModal.telemetry.test.tsx`, and lazy modal chunk output.                                                                                           |
| Ticket detail route               | Covered by `src/routes/-ticket.$id.test.tsx`, `src/routes/-ticket.$id.telemetry.test.tsx`, and layout tests.                                                                                                                      |
| Settings and modal opens          | Covered by lazy modal chunk presence in the production build and modal/component tests for representative form and modal surfaces.                                                                                                |

## Remaining Risks And Follow-Ups

- `main-*` is still above the 500 kB route/application budget. Follow-up work should inspect the root dependency graph for shared utilities, icons, query hooks, and layout code that can move behind route or action boundaries.
- `CostTreemapChart-*` is 565.64 kB uncompressed. It is lazy and no longer part of the dashboard shell, but cost explorer should keep hover/intent loading and avoid mounting the treemap for users who do not open that tab.
- Devtools assets still appear in the production output even though they are split from root. Confirm production runtime gating prevents them from loading for real users, or exclude them from production output if supported by the TanStack Start setup.
- `e2e/app.spec.ts` needs maintenance for the current navigation, sample data, status column labels, and split-button ticket creation UI before it can serve as a reliable browser-flow regression gate.
- The final validation relies on passing unit/component coverage and bundle output. A browser-profiler pass on representative production data would still be useful before setting stricter performance budgets.
