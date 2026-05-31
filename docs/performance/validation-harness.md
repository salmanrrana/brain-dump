# Performance Validation Harness

A repeatable, automated way to prove a performance change helped and did not
regress. Built for the ⚡ Performance North Star initiative; every execution
track validates against it.

The harness has three parts, all **build/test-time only** — none of it ships in
the user-facing hot path:

| Part                 | Command                      | Build | What it gates                                                                     |
| -------------------- | ---------------------------- | ----- | --------------------------------------------------------------------------------- |
| Bundle budget gate   | `pnpm perf:check`            | prod  | Main/initial chunk size, per-chunk ceilings, devtools out of initial chunks       |
| Production flow spec | `pnpm test:perf`             | prod  | No devtools loaded, no script over budget, Web Vitals thresholds, no warm refetch |
| Render-count spec    | `pnpm test:e2e perf-renders` | dev   | Board render count during scroll/drag, warm re-nav loader fetches                 |

All thresholds live in one committed file: **[`perf-budgets.json`](./perf-budgets.json)**.
The gate, both specs, and this doc read from it, so they never drift apart.

## Thresholds (budgets)

Hard ceilings are a **no-regression ratchet**: they are the committed
[runtime baseline](./runtime-baseline-2026.md) plus a little headroom, so the
gate passes today and fails only when a change makes things meaningfully worse.
The `aspirational` targets are the north-star goals; they only **warn**. When an
epic lands a real win, ratchet the ceiling **down** to lock it in.

### Bundle (uncompressed, from `.output/public/assets`)

| Budget                     | Ceiling (fails)          | Aspirational (warns) | Baseline today |
| -------------------------- | ------------------------ | -------------------- | -------------- |
| `main-*` chunk             | 870 kB                   | 500 kB               | 797.7 kB       |
| Initial/root total         | 1075 kB                  | 300 kB               | 992.5 kB       |
| Any other script           | 600 kB                   | —                    | —              |
| `CostTreemapChart-*`       | 640 kB (lazy, exception) | —                    | 565.6 kB       |
| Devtools in `main`/`index` | not allowed              | —                    | not present    |

### Runtime

| Budget                           | Threshold | Source                               |
| -------------------------------- | --------- | ------------------------------------ |
| TTFB                             | ≤ 800 ms  | web-vitals "good"                    |
| LCP                              | ≤ 2500 ms | web-vitals "good"                    |
| CLS                              | ≤ 0.1     | web-vitals "good"                    |
| INP                              | ≤ 200 ms  | web-vitals "good"                    |
| Board render count (scroll)      | ≤ 14      | baseline Board 7 + headroom          |
| Warm re-nav loader fetches (dev) | 0         | `window.__navigationLog()`           |
| Warm re-nav data requests (prod) | ≤ 2       | network; target 0                    |
| Devtools chunks loaded (prod)    | ≤ 1       | **known leak, target 0** (see below) |

## Running the harness

```bash
# 1. Bundle budget gate — builds, then checks .output against the budgets.
#    Exits non-zero on a regression. This is the cheap, deterministic CI gate.
pnpm perf:check

# 2. Production browser-flow assertions — builds + serves prod via `vite preview`,
#    drives board → list → dashboard → epic → ticket against an isolated DB.
pnpm test:perf

# 3. Render-count assertions — DEV build (the React Profiler / navigation-timing
#    globals are DEV-only), scrolls the board and reads window.__profilerSummaries().
#    Lives in the default e2e config, so it also runs as part of `pnpm test:e2e`.
pnpm test:e2e perf-renders
```

`pnpm perf:check` is the fast gate to wire into CI. The two Playwright specs need
a browser; run them in a perf job or locally before landing a change that touches
a hot path. `perf-renders` runs against the DEV server (where the Profiler globals
exist), so it stays in the default `pnpm test:e2e` config rather than its own
preview config; `perf-production` is isolated in `playwright.perf.config.ts`
because it needs a production build.

## How the gate stays honest

- **`scripts/analyze-client-bundle.ts --check`** reads the built assets and
  compares them to the budgets. In `--check` mode it never rewrites
  `bundle-baseline.md`, so the gate produces no git diff. Without `--check` it
  still regenerates the baseline report (`pnpm analyze:bundle`).
- The production spec asserts on **loaded** resources (Resource Timing /
  network), not files on disk — a chunk that exists but is never fetched does not
  count against the runtime budgets.
- Web Vitals come from the production `window.__perfReport()` signal (the same
  field metric real users emit). TTFB and LCP are asserted directly; CLS/INP only
  finalize on page-hide, so they are asserted **only when reported** to keep the
  gate deterministic.

## Known issues tracked as ratchets (target, not yet met)

These pass today via a documented ceiling but should be driven to target by the
execution-track epics:

- **`main-*` is 797.7 kB, over the 500 kB target** → ⚡ Instant First Load.
- **1 devtools chunk loads in production** (`BaseTanStackRouterDevtoolsPanel-*`).
  Vite preloads the dynamic-import target of `__root.tsx`'s
  `import.meta.env.DEV ? lazy(() => import("@tanstack/react-router-devtools")) : null`
  branch even though the branch is dead in prod. Removing it is bundle hygiene
  owned by ⚡ Instant First Load; ratchet `maxForbiddenChunksLoaded` to 0 once fixed.
- **Warm `/board` re-nav triggers ~1 background query revalidation** → ⚡ Snappy
  Navigation should align component `staleTime`s.

## Updating budgets

When you intentionally change a budget (a win to lock in, or a justified
increase), edit `perf-budgets.json` **and** the relevant baseline numbers in the
same change, so the committed thresholds and the recorded reality stay in sync.
