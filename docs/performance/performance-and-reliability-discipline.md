# Performance And Reliability Discipline

Brain Dump should copy the useful parts of T3 Code and UploadThing without cargo-culting their exact stack.

The point is not Bun, pnpm, Turbo, Effect, tsdown, or any single starter. The useful pattern is tighter latency paths, explicit package/module roles, measured hot paths, small changes, and typed boundaries that make refactors safe.

## What The Reference Projects Are Doing

- They put performance and reliability in the agent instructions instead of treating them as cleanup. T3 Code's `AGENTS.md` lists performance, reliability, and predictable behavior under load/failure as core priorities.
- They keep scope controlled. T3 Code's contribution guidance favors small bug fixes, reliability fixes, performance improvements, and maintenance over broad feature PRs.
- They measure hot paths. T3 Code writes completed server spans to local NDJSON traces, can export traces/metrics to OTLP, and documents how to query slow spans, failed spans, RPC latency, orchestration latency, provider turns, git commands, and SQLite queries.
- They optimize real bottlenecks. T3 Code PR #2586 sped up VCS diff loading by removing redundant checkpoint checks, resolving the VCS driver once, narrowing SQL lookup paths, reducing process overhead, and publishing before/after latency numbers.
- They separate responsibilities. T3 Code splits server, web, contracts, and shared runtime packages. UploadThing uses a monorepo with package-level builds, export maps, `sideEffects: false`, examples, docs, shared tooling, and Turbo task orchestration.
- They choose fast dev/build tooling, but the tooling is the multiplier, not the strategy. Fast checks matter because they make it cheap to keep changes small.

## Brain Dump Rules

### 1. Protect Hot Paths

Treat these paths as performance-sensitive by default:

- App boot, hydration, and first board/list render
- Board navigation, drag/drop, search, filtering, and ticket modal open
- Dashboard analytics and chart loading
- MCP tool dispatch, especially `workflow`, `ticket`, `session`, `review`, and `telemetry`
- `workflow start-work`, `workflow complete-work`, provider launch, git branch/commit/PR linking
- SQLite queries, FTS search, migrations, backup/restore, import/export
- Hook scripts and setup scripts that run during normal development

Do not add sequential I/O, broad queries, eager chart/modal imports, repeated provider detection, repeated git discovery, or blocking hook work on those paths without a measured reason.

### 2. Measure Before Guessing

Use the cheapest measurement that answers the question:

- Frontend bundle: `pnpm build:analyze`
- Current bundle baseline: `docs/performance/bundle-baseline.md`
- Route/data timing in devtools: `window.__navigationReport()`
- React render timing in devtools: `window.__profilerReport()`
- Asset loading in devtools: `window.__assetReport()`
- MCP tool duration: `telemetry` data from MCP self-instrumentation
- SQLite behavior: focused tests around the query or a one-off measured script when the test fixture is too small

For a performance ticket, the summary must include the command or workflow used and the before/after numbers. If you cannot measure directly, state the proxy you used and why it is acceptable.

### 3. Keep The Core Deep

The core layer is the source of truth for Brain Dump behavior:

- `core/` owns business logic, status transitions, git/linking behavior, sessions, reviews, telemetry, cost, compliance, transfer, and health checks.
- `src/api/`, `cli/`, `mcp-server/tools/`, hooks, plugins, and setup scripts are adapters.
- If two adapters need the same behavior, move that behavior to `core/`.
- If a module only forwards parameters without hiding complexity, it is probably too shallow.

This keeps changes local and tests useful. The interface is the test surface.

### 4. Prefer Narrow Data Paths

- Query only the columns and rows needed for the current view or operation.
- Keep dashboard/chart data behind lazy routes or tabs.
- Avoid loading full ticket/project/epic context when the caller only needs IDs, status, counts, or timestamps.
- Cache or resolve expensive adapters once per operation: database handles, provider launch definitions, git repo state, Docker runtime detection, and project lookup.
- Parallelize independent reads, but keep writes ordered when status transitions or audit trails depend on ordering.

### 5. Make Failures Visible

- Never swallow errors in hooks, MCP tools, provider launch, database writes, or telemetry.
- Do not replace a failed operation with an empty list or default success unless the UI also exposes the degraded state.
- Return typed errors or actionable messages from `core/`, then let adapters format them for humans.
- Keep logs human-readable, but persist important operational data as telemetry/events where possible.

### 6. Keep Work Small

Each ticket should change one behavior or one latency path. Avoid mixing:

- Feature work plus refactors
- UI changes plus data model changes
- Provider parity plus unrelated cleanup
- Performance fixes plus style-only edits

Small changes make it possible to review, benchmark, and revert without guessing.

## Ticket Checklist

Before implementation:

- Name the hot path, if any.
- Identify the core module or adapter boundary being touched.
- Decide the focused test or measurement.

During implementation:

- Keep blocking work out of boot, route loaders, MCP wrappers, hooks, and startup.
- Prefer existing query keys, schemas, typed errors, and core helpers.
- Split lazy UI surfaces when adding charts, modals, editors, devtools, or large dependencies.

Before completion:

- Run the project's own validation commands discovered from docs/config. For Brain Dump itself, run `pnpm check`.
- Run the project-specific build command for routing/build/server-client boundary changes. For Brain Dump itself, run `pnpm build`.
- Run the project-specific bundle analysis command for bundle-sensitive frontend changes. For Brain Dump itself, run `pnpm build:analyze`.
- Include before/after measurements for performance work.
- Record known residual risk when a measurement cannot be run.

## Source References

- T3 Code agent priorities and package roles: https://github.com/pingdotgg/t3code/blob/main/AGENTS.md
- T3 Code contribution scope guidance: https://github.com/pingdotgg/t3code/blob/main/CONTRIBUTING.md
- T3 Code observability guide: https://github.com/pingdotgg/t3code/blob/main/docs/observability.md
- T3 Code VCS diff optimization PR: https://github.com/pingdotgg/t3code/pull/2586
- T3 Code monorepo scripts/tooling: https://github.com/pingdotgg/t3code/blob/main/package.json
- UploadThing monorepo scripts/tooling: https://github.com/pingdotgg/uploadthing/blob/main/package.json
- UploadThing package exports and build setup: https://github.com/pingdotgg/uploadthing/blob/main/packages/uploadthing/package.json
- UploadThing Turbo task graph: https://github.com/pingdotgg/uploadthing/blob/main/turbo.json
