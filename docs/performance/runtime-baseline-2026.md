# Runtime Performance Baseline (2026)

The committed **"before" snapshot** for the ⚡ Performance North Star initiative. Every
optimization in the execution-track epics must publish before/after numbers measured
against this baseline. See `performance-and-reliability-discipline.md` for the why.

- **Captured:** 2026-05-31, on branch `feature/epic-2e304327-performance-north-star-make-brain-dump-feel-instan`.
- **Machine:** Linux 6.17, local dev (single run; treat as order-of-magnitude, not lab-grade).
- **Scope:** app boot, hydration, splash, board/list/dashboard/epic/ticket navigation, static assets, SQLite queries.

> ⚠️ **Read the environment caveats below before comparing numbers.** Runtime numbers
> come from a **dev build** (where the `window.__*Report()` instrumentation lives). Dev
> boot/asset numbers are dominated by Vite's on-demand module compilation and are **not**
> representative of production wall-clock — use them for _relative_ before/after deltas and
> render-count tracking, and use the **bundle** + **SQLite** sections for absolute numbers.

## How to reproduce

```bash
# 1. Bundle (production) — refreshes docs/performance/bundle-baseline.md
pnpm build:analyze

# 2. Runtime hot paths (dev build) — drives board→list→dashboard→epic→ticket,
#    reads window.__navigationReport / __profilerReport / __assetReport /
#    __hydrationReport / __splashReport via the Performance API.
#    Writes test-results/perf-baseline.json and logs the JSON to stdout.
pnpm exec playwright test perf-baseline

# 3. SQLite query timings (real local DB, read-only — safe while `pnpm dev` runs)
npx tsx scripts/measure-sqlite-baseline.ts            # 200 iterations (default)
npx tsx scripts/measure-sqlite-baseline.ts --iterations 500
```

The capture spec is `e2e/perf-baseline.spec.ts`; the SQLite harness is
`scripts/measure-sqlite-baseline.ts`. Both are one-off measurement helpers — the
repeatable budget gate / Web-Vitals harness lands in the validation-harness ticket.

## 1. Bundle baseline (production)

From `pnpm build:analyze` → `docs/performance/bundle-baseline.md` (full tables there).

| Metric                           | Value                                      |
| -------------------------------- | ------------------------------------------ |
| Client scripts                   | 88                                         |
| Client stylesheets               | 1                                          |
| Initial/root candidate assets    | **992.50 kB** uncompressed, 274.20 kB gzip |
| Largest chunk (`main-*.js`)      | **797.46 kB** uncompressed, 225.13 kB gzip |
| Chunks over the 500 kB budget    | `main-*.js`, `CostTreemapChart-*.js`       |
| Root stylesheet (`styles-*.css`) | 101.53 kB uncompressed, 17.42 kB gzip      |

**Budget:** route/application chunks < 500 kB uncompressed; initial/root assets > 300 kB
are a regression risk. The `main-*` chunk (797 kB) is the headline initial-load target and
is **over budget today**.

## 2. Runtime hot paths (dev build, first-launch sample data)

Captured via `e2e/perf-baseline.spec.ts`. All times are milliseconds from navigation start.

### Cold load — `/board` (first cold boot of the dev server)

| Phase                           | ms    | Note                                             |
| ------------------------------- | ----- | ------------------------------------------------ |
| TTFB (`responseStart`)          | 3555  | dev SSR + on-demand transform                    |
| Response end                    | 3594  |                                                  |
| DOM interactive                 | 4373  |                                                  |
| DOMContentLoaded                | 4373  |                                                  |
| Load event                      | 4603  |                                                  |
| React boot end (`app:boot:end`) | 16730 | **dev-only**: ~248 modules transformed on demand |
| Hydration complete              | 16730 | **dev-only** — not representative of prod        |

### Splash screen — `/board` cold

| Metric                          | ms    |
| ------------------------------- | ----- |
| Splash mount                    | 16720 |
| Visible duration                | 894   |
| Total blocking (mount→complete) | 1758  |

`MIN_DISPLAY = 800 ms`, `FADE_DURATION = 800 ms` (see `SplashScreen.tsx`). Splash visible
duration (~894 ms) tracks the configured minimum — a candidate for the "Instant First Load" epic.

### Detail routes (cold load within an already-warm dev server)

These were hard-loaded after the board session, so most modules were already transformed —
they are **faster than the first board boot for that reason**, not because they are lighter.

| Route         | TTFB | Load event | React boot end | Splash visible | Dev scripts / transfer |
| ------------- | ---- | ---------- | -------------- | -------------- | ---------------------- |
| `/epic/$id`   | 849  | 1128       | 5101           | 1110           | 243 scripts / 678 kB   |
| `/ticket/$id` | 1125 | 1317       | 3164           | 913            | 242 scripts / 514 kB   |

> 🐞 **Surfaced during capture:** `/epic/$id` logged `SqliteError: no such table:
epic_workflow_state` (`src/api/epics.ts:547`) against the freshly-seeded sample DB. The
> seed/bootstrap path is missing the `epic_workflow_state` table. Out of scope for this
> baseline ticket — filed here as an observation for the team.

### Dev asset delivery — `/board` cold

| Category | Count | Total transfer        | Largest |
| -------- | ----- | --------------------- | ------- |
| scripts  | 248   | 8188 kB               | 1022 kB |
| styles   | 1     | 131 kB                | 131 kB  |
| images   | 0     | 0                     | 0       |
| fonts    | 0     | 0 (system font stack) | 0       |

Dev serves **unbundled** ES modules (248 separate script requests). The production picture
is in §1 — compare prod asset counts there, not these dev numbers.

## 3. Client-side navigation (loader timings)

From `window.__navigationLog()` after a client-side `board → list → dashboard → board`
sequence (dev build):

| Navigation                  | Loader duration |
| --------------------------- | --------------- |
| `list` (client nav)         | 22.8 ms         |
| `board` (client nav, mount) | 44.6 ms         |
| `board` (warm re-nav)       | 0.2 ms          |

Representative loader fetch timings observed in the same run: `dashboard:tickets` 17 ms,
`board:tickets` 33 ms, `board:projects` 33 ms.

> **Instrumentation quirk:** `timedFetch` attaches each fetch to the _most recent_
> navigation entry, so fetch→route attribution can be off by one during rapid SPA
> navigation. Loader durations are reliable; fetch attribution is indicative.

## 4. Render profile — board session (dev)

From `window.__profilerSummaries()` (React `<Profiler>`). Dev render times run hotter than
production; the **render counts** are the durable signal for the render-smoothness epic.

| Component    | Renders | Mounts | Updates | Avg (ms) | p95 (ms) | Max (ms) | Total (ms) |
| ------------ | ------- | ------ | ------- | -------- | -------- | -------- | ---------- |
| Board        | 7       | 2      | 5       | 22.7     | 53.4     | 53.4     | 158.7      |
| Board.Kanban | 6       | 2      | 4       | 20.2     | 44.4     | 44.4     | 121.4      |
| Board.Header | 7       | 2      | 5       | 5.3      | 10.2     | 10.2     | 37.1       |

The board mounts twice and re-renders 5× in a short session — a target for the React 19
render-smoothness work.

## 5. SQLite query timings (real local DB)

From `scripts/measure-sqlite-baseline.ts` against the **real** local database
(`~/.local/share/brain-dump/brain-dump.db`, **803 tickets**), read-only, 200 iterations
after 20 warmup. Query shapes mirror production (`getTicketSummaries`
`src/api/tickets.ts:427`, `getEpicDetail` `src/api/epics.ts:320`, `getDashboardAnalytics`
`src/api/analytics.ts:428`).

| Query                                         | Rows | p50 (ms) | p95 (ms) | avg (ms) | max (ms) |
| --------------------------------------------- | ---: | -------: | -------: | -------: | -------: |
| `getTicketSummaries` (board, one project)     |  455 |    4.351 |    5.441 |    4.623 |   10.702 |
| `getTicketSummaries` (dashboard, all tickets) |  803 |    7.278 |    8.690 |    7.541 |   16.204 |
| dashboard status aggregate (group by status)  |    6 |    0.193 |    0.256 |    0.301 |    5.456 |
| `getEpicDetail` (composite, one epic)         |   45 |    1.007 |    2.605 |    1.162 |    4.844 |

**Observation:** selecting 455–803 ticket-summary rows costs **4–8 ms** even though the pure
aggregate (group-by) is sub-millisecond. The cost scales with row count / marshaling, not
query complexity — a target for the SQLite data-layer epic (column narrowing, prepared
statements, pagination already exists via `getPaginatedTicketSummaries`).

## Budgets (for the validation harness)

These thresholds derive from the numbers above and feed the validation-harness ticket:

- **Main chunk** < 500 kB uncompressed (currently **797 kB — over**).
- **No `devtools` chunks** in production output.
- **Navigation between already-visited routes** triggers no full-page data refetch
  (warm `board` re-nav = 0.2 ms loader, 0 fetches — good).
- **Board render count** during a static board session should not grow beyond the current
  baseline (Board 7 / Kanban 6) without justification.
- SQLite board summary query stays in the **single-digit ms** range for ~800 tickets.
