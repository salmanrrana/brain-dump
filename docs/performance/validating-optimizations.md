# How to Validate a Performance Optimization

A **how-to guide** (Diátaxis): the concrete, repeatable steps for proving a
performance change actually helped and did not regress. Follow this loop for
every ticket in the ⚡ Performance North Star initiative (and any future perf
work) so we always ship **before/after numbers**, never a guess.

- **Why we do this:** Brain Dump is local-first — there is essentially no network
  cost, so the app should feel instant. Optimizations only count when measured.
- **What feeds this guide:** the committed [runtime baseline](./runtime-baseline-2026.md)
  (the "before" numbers), the [validation harness](./validation-harness.md) (the
  repeatable gate), and the single source of truth for thresholds,
  [`perf-budgets.json`](./perf-budgets.json).

> This guide is the **operational runbook**. The harness reference lives in
> [`validation-harness.md`](./validation-harness.md); this page tells you the
> order to do things in and what to write down.

## The measure-first loop

Never optimize blind. Every performance change follows the same five steps:

1. **Measure** the hot path you suspect, against the committed baseline. Pick the
   right tool from the table below — one tool answers one question.
2. **Fix** exactly one latency path. Keep the change small and focused so the
   before/after delta is attributable to it.
3. **Re-measure** with the _same_ command, on the _same_ build type, with the
   _same_ data. A delta is only trustworthy when the only thing that changed is
   your code.
4. **Prove** the win: paste the before/after numbers into the ticket completion
   summary using the [template below](#beforeafter-template). If the number did
   not move, the change is not done.
5. **Ratchet** the budget. When a win is real, lower the matching ceiling in
   [`perf-budgets.json`](./perf-budgets.json) (and the baseline doc) in the same
   change so the gain is locked in and can never silently regress.

## Which tool answers which question

Each measurement tool covers one question. Reach for the smallest one that
answers yours.

| Question                                        | Tool / command                                        | Build | Reads                                          |
| ----------------------------------------------- | ----------------------------------------------------- | ----- | ---------------------------------------------- |
| Did the bundle / a chunk get bigger?            | `pnpm build:analyze`                                  | prod  | `.output/public/assets` → `bundle-baseline.md` |
| Is any chunk over budget? (CI gate)             | `pnpm perf:check`                                     | prod  | `perf-budgets.json` (exits non-zero)           |
| How long did a route load / its loader take?    | `window.__navigationReport()` / `__navigationLog()`   | dev   | navigation + loader timings                    |
| Did a warm re-nav refetch data it already had?  | `window.__navigationLog()`                            | dev   | per-nav loader fetch count                     |
| How many times did a component render?          | `window.__profilerReport()` / `__profilerSummaries()` | dev   | React `<Profiler>` render counts               |
| How heavy is asset delivery for a route?        | `window.__assetReport()`                              | dev   | scripts/styles/images/fonts transfer           |
| How long did hydration / the splash take?       | `window.__hydrationReport()` / `__splashReport()`     | dev   | boot + splash timings                          |
| What do real users actually experience? (field) | `window.__perfReport()` (web-vitals)                  | both  | LCP, CLS, INP, TTFB                            |
| Is a SQLite query slow?                         | `npx tsx scripts/measure-sqlite-baseline.ts`          | node  | p50/p95/avg/max over N iterations              |

> **Build caveat:** the `window.__*Report()` / `__*Summaries()` instrumentation in
> `src/lib/navigation-timing.ts` is **DEV-only** — use those numbers for _relative_
> before/after deltas and render-count tracking, not absolute wall-clock. Use the
> **bundle** (prod), **web-vitals** (`window.__perfReport()`, prod + dev), and
> **SQLite** (real DB) numbers when you need absolute figures. `window.__perfReport()`
> is wired in `src/lib/web-vitals.ts` and exists in every build.

## Running the validation harness

The harness is the repeatable gate. It is **build/test-time only** and never runs
in the user-facing hot path. Full reference: [`validation-harness.md`](./validation-harness.md).

```bash
# 1. Bundle budget gate — builds prod, checks .output against perf-budgets.json.
#    Exits non-zero on a regression. Cheap + deterministic → this is the CI gate.
pnpm perf:check

# 2. Production browser-flow assertions — builds + previews prod, drives
#    board → list → dashboard → epic → ticket. Asserts: no devtools loaded,
#    no script over budget, Web Vitals thresholds, no warm-renav refetch storm.
pnpm test:perf

# 3. Render-count assertions — DEV build (Profiler globals are dev-only).
#    Scrolls/drags the board, reads window.__profilerSummaries().
#    Lives in the default e2e config, so `pnpm test:e2e` runs it too.
pnpm test:e2e perf-renders
```

Run `pnpm perf:check` before landing any change that touches a hot path; run the
two Playwright specs (they need a browser) for changes to navigation, rendering,
or the bundle graph.

## Before/after template

Every performance ticket's completion summary **must** fill this in. State the
exact command, the before number (from the baseline or your own pre-change run),
the after number, and the delta. No prose-only "felt faster" claims.

```markdown
### Performance result

**Hot path:** <e.g. board cold load / warm board re-nav / getTicketSummaries>
**Command:** <exact command, e.g. `pnpm build:analyze` or `pnpm test:perf`>
**Build/data:** <prod build / dev build / real local DB (N tickets)>

| Metric            | Before   | After    | Delta            |
| ----------------- | -------- | -------- | ---------------- |
| <e.g. main-\* kB> | 797.5 kB | 612.0 kB | -185.5 kB (-23%) |
| <e.g. LCP ms>     | ...      | ...      | ...              |

**Gate:** `pnpm perf:check` ✅ / `pnpm test:perf` ✅
**Budget ratchet:** <ceiling lowered in perf-budgets.json? which one? or N/A>
```

## The budgets

Thresholds are a **no-regression ratchet** committed in
[`perf-budgets.json`](./perf-budgets.json). Hard ceilings fail the gate;
`aspirational` targets only warn and are the north-star goal. The current
headline budgets:

- **Main chunk < 500 kB** uncompressed (aspirational; ceiling ratchets down as
  ⚡ Instant First Load shrinks it — baseline today ~797 kB).
- **No `devtools` chunk merged into an initial/root asset**, and **no devtools
  chunk loaded for real users** in production (target 0; ratcheted at 1 for the
  one known Vite modulepreload leak).
- **Navigation between already-visited routes triggers no full-page data
  refetch** — warm re-nav loader fetches = 0 (dev); ≤ 2 background data requests
  (prod, target 0).
- **Board render count during a scroll/drag session stays under the ceiling**
  (≤ 14; baseline Board = 7) — no render-count blow-ups from a change.
- **Web Vitals within "good"**: TTFB ≤ 800 ms, LCP ≤ 2500 ms, CLS ≤ 0.1,
  INP ≤ 200 ms.
- **SQLite board summary query stays single-digit ms** for ~800 tickets.

When you intentionally change a budget, edit `perf-budgets.json` **and** the
matching baseline numbers in the same change so committed thresholds and recorded
reality never drift.

## Quick reference

| I want to…                   | Do this                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| Gate a change in CI          | `pnpm perf:check`                                          |
| Validate a full browser flow | `pnpm test:perf`                                           |
| Check render counts          | `pnpm test:e2e perf-renders`                               |
| Refresh the bundle snapshot  | `pnpm build:analyze`                                       |
| Get the "before" numbers     | [`runtime-baseline-2026.md`](./runtime-baseline-2026.md)   |
| Change a threshold           | edit [`perf-budgets.json`](./perf-budgets.json) + baseline |
| Record a result              | the [before/after template](#beforeafter-template)         |
