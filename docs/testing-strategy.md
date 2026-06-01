# Testing Strategy

Brain Dump uses Vitest already. The slow feedback loop was not caused by missing Vite coverage; it was caused by running every test in a global jsdom/MSW/React harness and mixing fast contracts with browser-heavy, host-dependent, and stale-flow tests.

## Default Feature Loop

Run this while building ordinary features:

```bash
pnpm check
```

`pnpm check` runs type-checking, linting, and the fast node Vitest project. The default test command is intentionally narrow:

```bash
pnpm test
```

Use the node lane for core contracts, API behavior, database logic, provider registries, workflow rules, and pure helper logic. These tests should stay cheap enough to run repeatedly during feature work.

Measured on May 30, 2026:

| Command                                        |                                      Before |                                                                    After |
| ---------------------------------------------- | ------------------------------------------: | -----------------------------------------------------------------------: |
| `pnpm exec vitest run core/__tests__ --silent` |                                      40.29s |                                                                   18.62s |
| `pnpm test`                                    |                   mixed full-suite behavior | 69.13s standalone silent run; 88.41s in `pnpm check` normal reporter run |
| `pnpm test:ui`                                 |                    mixed into default suite |                                                  176.24s Vitest duration |
| `pnpm test:all`                                | failed before quarantine due stale UI tests |                                                  316.51s Vitest duration |

The core speedup came from splitting node and DOM projects, avoiding jsdom for node tests, avoiding React/MSW setup for node tests, using threaded workers, isolating test database paths under `.vitest-xdg/`, and disabling database startup side effects during Vitest runs.

## Active UI Lane

Run this when touching React components, modal workflows, routing, keyboard behavior, or browser-only hooks:

```bash
pnpm test:ui
```

This is the active jsdom lane. It should keep Kent C. Dodds-style user-observable behavior coverage: render the real component path, interact through accessible UI where practical, and assert outcomes that users or adapter contracts actually depend on.

Slowest active UI files from the May 30, 2026 run:

| Test                                               | Duration | Follow-up                                                                                                                        |
| -------------------------------------------------- | -------: | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/-epic.$id.test.tsx`                    |   19.13s | Keep active, but split provider-launch fixtures from route rendering where possible.                                             |
| `src/components/tickets/ShipChangesModal.test.tsx` |   13.87s | Keep active; this is important user-flow coverage for shipping changes.                                                          |
| `src/components/navigation/IconSidebar.test.tsx`   |   13.41s | Keep active, but remove repeated router fallback warnings by rendering with an explicit router harness or testing fallback once. |
| `src/components/LaunchProviderMenu.test.tsx`       |   12.84s | Keep active; it protects provider registry visibility. Prefer text/role queries that do not scan every button repeatedly.        |
| `src/components/navigation/ProjectsPanel.test.tsx` |    9.88s | Keep active, but consider extracting pure project filtering and epic launch mapping tests.                                       |

## Full Active Vitest Lane

Run this before changes that cross core/UI boundaries:

```bash
pnpm test:all
```

This runs the active node and DOM Vitest projects, excluding quarantined tests.

## Quarantine Lane

Run this only when specifically auditing old coverage, repairing slow integration checks, or proving that a quarantined flow is active again:

```bash
pnpm test:quarantine
```

Quarantined tests are excluded from `pnpm test`, `pnpm test:ui`, `pnpm test:all`, and `pnpm check`. They are not all bad tests. They are tests that should not block the normal feature loop because they are stale, duplicative, host-dependent, or closer to a release/integration gate.

### Stale Or Broken Flow Candidates

| Test                                                | Why it is quarantined                                                                                                                                                                         |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/tickets/CreateTicketModal.test.tsx` | The active app new-ticket path uses `src/components/NewTicketModal.tsx` through `AppLayout`; `CreateTicketModal` is only exported from the old tickets barrel.                                |
| `src/components/TicketModal.telemetry.test.tsx`     | The test expects an `AI Telemetry` button that no longer exists in `TicketModal`; the modal now lazy-renders `TelemetryPanel` directly.                                                       |
| `src/components/tickets/LaunchActions.test.tsx`     | This wrapper is still used, but the test duplicates launch-provider behavior already covered by active `LaunchProviderMenu` and ticket-detail tests, and it timed out in the full jsdom lane. |

### Active But Not Default

| Test                                                    | Why it is outside the default lane                                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/api/docker-integration.test.ts`                    | Depends on Docker daemon behavior and host setup.                                                              |
| `src/api/ralph-docker.test.ts`                          | Depends on Docker/Ralph sandbox behavior and host setup.                                                       |
| `src/api/ralph-e2e.test.ts`                             | Broad Ralph flow with real git-style behavior; useful as an integration/release check, not every feature loop. |
| `cli/__tests__/cli-integration.test.ts`                 | Subprocess CLI coverage; active but slow compared with core command contracts.                                 |
| `scripts/setup-vscode.test.ts`                          | Depends on user install state and filesystem layout expectations.                                              |
| `scripts/repair-migrations.test.ts`                     | Subprocess migration repair coverage; better as an explicit migration gate.                                    |
| `mcp-server/__tests__/cross-environment.test.ts`        | Broad environment/provider coverage with high setup cost.                                                      |
| `mcp-server/tools/__tests__/workflow-e2e.test.ts`       | End-to-end workflow coverage, not a default unit lane.                                                         |
| `mcp-server/tools/__tests__/status-transitions.test.ts` | Broad workflow transition coverage with heavier setup than focused core status tests.                          |
| `cli/__tests__/workflow-launch-wiring.test.ts`          | Slow provider wiring coverage; keep for targeted provider work.                                                |
| `src/lib/db-bootstrap.test.ts`                          | Near-timeout database bootstrap behavior; keep targeted until refactored into faster units.                    |

## External Gates

Run these for their specific domains:

```bash
pnpm test:integration
pnpm test:e2e
pnpm test:full
```

`pnpm test:full` runs the active Vitest projects plus integration and Playwright tests. It intentionally does not run quarantine tests.
