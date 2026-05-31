# Library Best-Practices Audit

A **reference** doc (Diátaxis): for each library Brain Dump ships, the official
best practice for the **exact version in use**, where our code already complies,
and where it diverges (with `file:line`). Every divergence is cross-referenced to
the execution-track epic that should own the fix.

- **Why this exists:** the ⚡ Performance North Star initiative wants to confirm
  we are following the patterns the React team, TanStack, Drizzle, and dnd-kit
  authors recommend for our versions — not fighting the framework. This doc is
  the checklist that feeds and validates the four execution-track epics.
- **No code changes here.** This is a research/doc ticket. Each row points at the
  epic that should carry the change.
- **Companion docs:** [`runtime-baseline-2026.md`](./runtime-baseline-2026.md)
  (the "before" numbers), [`validating-optimizations.md`](./validating-optimizations.md)
  (the measure → fix → prove loop), [`perf-budgets.json`](./perf-budgets.json)
  (the thresholds).

## Versions audited (from `package.json`)

| Library                          | Version | Notes                    |
| -------------------------------- | ------- | ------------------------ |
| react / react-dom                | 19.2    | React Compiler available |
| @tanstack/react-router           | 1.132   |                          |
| @tanstack/react-start            | 1.132   |                          |
| @tanstack/react-router-ssr-query | 1.131   | installed, **not wired** |
| @tanstack/react-query            | 5.90    |                          |
| @tanstack/react-virtual          | 3.13    |                          |
| @tanstack/react-form-start       | 1.27    |                          |
| drizzle-orm                      | 0.45    |                          |
| better-sqlite3                   | 12.5    |                          |
| @dnd-kit/core                    | 6.3     |                          |
| @dnd-kit/sortable                | 10      |                          |
| tailwindcss                      | 4       |                          |
| vite                             | 7       |                          |

## Execution-track epics referenced

Findings are routed to one of the four execution-track epics:

- **⚡ Snappy Navigation & Data Freshness** — TanStack Query/Router caching, hydration, refetch.
- **⚡ Buttery Render & Interaction Smoothness** — React 19 render/interaction, dnd-kit, virtualization.
- **⚡ Instant First Load** — bundle, charts, fonts, splash, devtools, SSR hydration.
- **⚡ SQLite Data Layer Speed** — Drizzle / better-sqlite3.

## How to read the severity column

Severity is scored by impact on the local-first **"feel instant"** goal, not by
correctness: **high** = a user-perceptible latency/jank source or a correctness
bug that wastes a round-trip; **medium** = measurable but bounded; **low** =
hygiene / future-proofing.

---

## 1. TanStack Query v5 (`@tanstack/react-query` 5.90)

> **Health:** Generally healthy. Query keys are centralized with `as const`, the
> core ticket mutations implement the full optimistic-update pattern correctly,
> and per-query `staleTime` is mostly thoughtful. The architectural gaps are the
> missing `queryOptions()` factory pattern and the total absence of
> `useSuspenseQuery`, which leaves loader pre-warming disconnected from Suspense.

| Recommendation                                                                                                                           | Current state (`file:line`)                                                                                                                                                                                                                                                                    | Severity | Owning epic                             | Quick win |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------- | --------- |
| Adopt the v5 `queryOptions()` factory so the same object feeds `useQuery`, `prefetchQuery`, and `ensureQueryData` (type-safe, no drift). | All queries are ad-hoc inline objects; loaders re-declare the same `queryKey`+`queryFn` (`src/lib/hooks/tickets.ts:479-487`, `src/routes/ticket.$id.tsx:44-48`, `src/routes/board.tsx:38-53`, `src/routes/list.tsx:41-56`, `src/routes/epic.$id.tsx:25-37`, `src/routes/dashboard.tsx:34-48`). | medium   | Snappy Navigation & Data Freshness      | —         |
| Connect loader pre-warming to Suspense with `useSuspenseQuery` (data guaranteed non-undefined; no manual loading branch).                | Zero usages in `src/`. Routes guard with `if (loading) return <div/>` even though the loader already warmed the cache (`src/routes/board.tsx:180-186`, `src/routes/dashboard.tsx:193-203`, `src/routes/list.tsx:224-233`).                                                                     | high     | Snappy Navigation & Data Freshness      | —         |
| Global `staleTime` should be a sane floor (≥ 60s) for a local-first app.                                                                 | `src/router.tsx:17` sets `staleTime: 1000 * 5` (5s); any query without an explicit override (e.g. `useProjectDeletePreview` `src/lib/hooks/projects.ts:241-244`) inherits it.                                                                                                                  | medium   | Snappy Navigation & Data Freshness      | ✅        |
| Set a global `gcTime` floor so expensive results survive navigation.                                                                     | Only per-hook `gcTime` exists (`src/lib/hooks/cost.ts:36,50,63,79`; `src/lib/hooks/projects.ts:437`); no global default in `src/router.tsx:13-22`.                                                                                                                                             | low      | Snappy Navigation & Data Freshness      | ✅        |
| Avoid `staleTime: 0`; use a short non-zero value alongside polling.                                                                      | `staleTime: 0` on `useWorkflowState` (`src/lib/hooks/workflow.ts:245`), `useDemoScript` (`src/lib/hooks/workflow.ts:95`), `useEpicDetail` (`src/lib/hooks/projects.ts:533`) — all also poll, so the `0` adds a redundant mount refetch.                                                        | medium   | Buttery Render & Interaction Smoothness | ✅        |
| Use `select` to narrow subscriptions for high-frequency data.                                                                            | Only `useCostExplorerSummary` uses it (`src/lib/hooks/cost.ts:299`). Board/dashboard subscribe to full arrays; `StatsGrid` derives counts in the component body (`src/routes/dashboard.tsx:205-208`).                                                                                          | low      | Buttery Render & Interaction Smoothness | —         |
| Return the `invalidateQueries` promise from `onSuccess`/`onSettled` so `isPending` stays true until the cache refreshes.                 | Done correctly only in `src/lib/hooks/services.ts:91-93,121-123,146-148`. Missing in `tickets.ts:178-182,279-289`, `workflow.ts:183-192`, `projects.ts:195-197`, `comments.ts:106-112`, `cost.ts:91-93,113-116`.                                                                               | medium   | Buttery Render & Interaction Smoothness | ✅        |
| Don't pass manual `useQuery<TData, TError>()` generics (assertion, not inference).                                                       | `src/components/TelemetryPanel.tsx:310,320`, `src/components/tickets/TicketCostPanel.tsx:57`, `src/lib/hooks/projects.ts:494`.                                                                                                                                                                 | low      | Snappy Navigation & Data Freshness      | ✅        |
| `setQueryData` must use the same key reference as the query.                                                                             | **Bug:** `clearEvents` writes to `["ralphEvents", sessionId]` (`src/lib/hooks/ralph.ts:280`) but the query reads `queryKeys.ralph.events(...)` → `["ralph","events",sessionId]` (`src/lib/hooks/ralph.ts:228`). The clear writes to an orphaned entry nothing reads.                           | high     | Snappy Navigation & Data Freshness      | ✅        |
| ✅ Three-phase optimistic update (cancel → snapshot/write → rollback → invalidate).                                                      | Implemented correctly across all ticket/epic/demo/settings mutations (`src/lib/hooks/tickets.ts:74-427`, `projects.ts:251-420`, `workflow.ts:115-171`, `settings.ts:65-107`).                                                                                                                  | —        | none                                    | —         |
| ✅ Centralized query-key registry with `as const`.                                                                                       | `src/lib/query-keys.ts` covers all domains with hierarchical keys for fuzzy invalidation.                                                                                                                                                                                                      | —        | none                                    | —         |
| ✅ `refetchOnWindowFocus: false` globally with per-query opt-in.                                                                         | `src/router.tsx:18`; opt-in at `comments.ts:37`, `workflow.ts:94`. Defensible for a polling-heavy local-first app.                                                                                                                                                                             | —        | none                                    | —         |

---

## 2. TanStack Router / Start (`@tanstack/react-router` 1.132, `react-start` 1.132, `react-router-ssr-query` 1.131)

> **Health:** Route loaders are correct and parallelized; every primary route
> awaits data before render with a `pendingComponent` fallback. The critical gap
> is that **SSR-query hydration is never wired**, so every cold load re-fetches
> client-side. Two "0-refetch-on-revisit" budget violations also exist.

| Recommendation                                                                                                                                                 | Current state (`file:line`)                                                                                                                                                                              | Severity | Owning epic                        | Quick win |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------- | --------- |
| Call `setupRouterSsrQueryIntegration({ router, queryClient })` once (server + client) so loader data hydrates the QueryClient and skips the cold-load refetch. | Installed (`@tanstack/react-router-ssr-query@1.131.7`) but **never imported/called** anywhere; `src/router.tsx:1-37` wires no dehydrate/hydrate.                                                         | high     | Instant First Load                 | ✅        |
| For 0-refetch-on-revisit, component `staleTime` ≥ loader `staleTime`, and don't force `refetchOnMount`.                                                        | `useProjects` sets `refetchOnMount: "always"` (`src/lib/hooks/projects.ts:79`), re-fetching on every mount of AppLayout/board/list/projects despite the loader warming the cache at `staleTime: 30_000`. | high     | Snappy Navigation & Data Freshness | ✅        |
| Same rule: component `staleTime` must not be below loader `staleTime`.                                                                                         | `useEpicDetail` `staleTime: 0` (`src/lib/hooks/projects.ts:533`) vs loader `staleTime: 30_000` (`src/routes/epic.$id.tsx:27-30`) → guaranteed refetch on every `/epic/$id` revisit.                      | medium   | Snappy Navigation & Data Freshness | ✅        |
| Put data fetching in route loaders so it pre-warms before render.                                                                                              | Index route `/` has **no loader** (`src/routes/index.tsx:8-10`); data fetches after mount, showing a loading state on every cold visit (`src/routes/index.tsx:37`).                                      | medium   | Snappy Navigation & Data Freshness | ✅        |
| Set `defaultPreload: "intent"` on the router so all `Link`s inherit hover-intent preloading.                                                                   | `src/router.tsx:28-36` sets `defaultPreloadStaleTime` but no `defaultPreload`; all 7 `Link`s carry `preload="intent"` individually — equivalent but fragile.                                             | low      | Snappy Navigation & Data Freshness | ✅        |
| Global default `staleTime` should match the intended freshness budget (30s here).                                                                              | `src/router.tsx:17` global is 5s while every explicit query uses 30s+; new queries omitting `staleTime` will refetch sooner than intended.                                                               | low      | Snappy Navigation & Data Freshness | ✅        |
| ✅ Fire loader fetches in parallel and await the batch.                                                                                                        | `await Promise.all([...])` in `board.tsx:37-53`, `list.tsx:40-56`, `dashboard.tsx:33-49`, `epic.$id.tsx:25-37`, `projects.$projectId.tsx:20-32`.                                                         | —        | none                               | —         |
| ✅ Provide a `pendingComponent` per data-loading route.                                                                                                        | `board.tsx:33`, `dashboard.tsx:29`, `list.tsx:36`, `ticket.$id.tsx:42`, `projects.$projectId.tsx:17` (epic detail handles its skeleton in-component).                                                    | —        | none                               | —         |
| ✅ `defaultPreloadStaleTime` aligned with loader `staleTime`.                                                                                                  | `src/router.tsx:33` = `30_000`, exactly matching loaders.                                                                                                                                                | —        | none                               | —         |

---

## 3. React 19.2 (+ React Compiler)

> **Health:** Competent React 19 usage — careful `memo`/`useMemo`/`useCallback`
> in hot paths, `Profiler` on board/dashboard in dev, correct Suspense around
> lazy modals. The two highest-impact gaps: the **React Compiler is off** (569
> manual memo call-sites remain) and there is **no `useTransition`/
> `useDeferredValue`** on the drag and sort/filter paths those hooks exist for.

| Recommendation                                                                                                                       | Current state (`file:line`)                                                                                                                                       | Severity | Owning epic                             | Quick win |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------- | --------- |
| Enable the React Compiler (babel-plugin-react-compiler via `@vitejs/plugin-react` ≥5) to auto-memoize and retire manual memoization. | `viteReact()` at `vite.config.ts:401` has no `babel.plugins` config; no babel config file exists; 569 manual memo call-sites across 97 files remain.              | high     | Buttery Render & Interaction Smoothness | —         |
| Wrap non-urgent updates (drag re-derivation, sort/filter) in `startTransition` / `useDeferredValue` to keep gestures at 60fps.       | Zero usages in `src/`. Drag state set via plain `useState` (`KanbanBoard.tsx:188,202`); list sort re-runs synchronously (`src/components/TicketListView.tsx:96`). | high     | Buttery Render & Interaction Smoothness | ✅        |
| Provide `errorComponent` on every route for scoped error boundaries.                                                                 | Missing on `src/routes/board.tsx` and `src/routes/list.tsx` (both define `pendingComponent` only); present on `ticket.$id.tsx:51`, `dashboard.tsx:52`.            | medium   | Snappy Navigation & Data Freshness      | ✅        |
| Avoid inline arrow handlers inside memoized components.                                                                              | `TicketCard.tsx:67` renders `onClick={() => onClick?.(ticket)}` inside the `memo()`d component (`TicketCard.tsx:46`), defeating the memo for that prop.           | medium   | Buttery Render & Interaction Smoothness | ✅        |
| Stable ref-callback identity to avoid extra detach/reattach in commit.                                                               | `KanbanColumn.tsx:78-84` `setContentRef` depends on `[innerRef, setNodeRef]`; `innerRef` has no stability guarantee from callers.                                 | low      | Buttery Render & Interaction Smoothness | —         |
| Use `<Profiler>` on key views before optimizing.                                                                                     | Board (`board.tsx:193`) and dashboard (`dashboard.tsx:211`) are wrapped; `/list` and `TicketListView` are not, despite `src/lib/profiler.ts` being ready.         | low      | Buttery Render & Interaction Smoothness | ✅        |
| `use()` + `useSuspenseQuery` for lazy data instead of manual loading/error branches.                                                 | Neither board nor list use `use()`/`useSuspenseQuery`; both check flags manually (`board.tsx:180-189`, `list.tsx:224-233`).                                       | low      | Snappy Navigation & Data Freshness      | —         |
| ✅ Suspense boundaries around lazy components with meaningful fallback.                                                              | 10 lazy modals in `src/components/AppLayout.tsx:64-75`, each `<Suspense fallback={<ModalFallback/>}>` with an `sr-only` status element.                           | —        | none                                    | —         |
| ✅ `memo()` on board hot-path components.                                                                                            | `KanbanColumn.tsx:62`, `SortableTicketCard.tsx:23`, `TicketCard.tsx:46`.                                                                                          | —        | none                                    | —         |

---

## 4. Drizzle ORM 0.45 + better-sqlite3 12.5

> **Health:** Well-structured data layer — a single shared synchronous
> connection, WAL enabled, composite indexes for the common board/epic filters,
> and SQL-side aggregation (no N+1). Gaps: four recommended PRAGMAs are missing,
> no hot query reuses a prepared statement, `tickets.completed_at` (the analytics
> filter) is unindexed, and `initTables()` raw SQL has drifted from `schema.ts`.

| Recommendation                                                                                                                       | Current state (`file:line`)                                                                                                                                                                                                          | Severity | Owning epic             | Quick win |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------- | --------- |
| Set local-first PRAGMAs: `synchronous=NORMAL`, `busy_timeout=5000`, `cache_size=-64000`, `temp_store=MEMORY`, `mmap_size=268435456`. | `src/lib/db.ts:38-39` sets only `journal_mode=WAL` and `foreign_keys=ON`.                                                                                                                                                            | high     | SQLite Data Layer Speed | ✅        |
| Fix `initTables()` index drift — fresh installs miss the composite indexes.                                                          | `src/lib/db.ts:84-143` raw `CREATE TABLE`/`CREATE INDEX` lacks `idx_tickets_project_status`/`idx_tickets_epic_status`/`idx_tickets_project_priority` that `schema.ts:75-77` defines.                                                 | high     | SQLite Data Layer Speed | —         |
| Index `tickets.completed_at` — every analytics query range-filters on it.                                                            | `src/lib/schema.ts:70-78` indexes projectId/epicId/status/composites but **not** `completed_at`; analytics scan on it (`src/api/analytics.ts:88-97,123-130,241-253`).                                                                | medium   | SQLite Data Layer Speed | ✅        |
| Reuse prepared statements on hot paths (Drizzle `.prepare()`/`sql.placeholder()` or module-level cached `sqlite.prepare()`).         | Re-prepared every call: `getTicketSummaries` (`src/api/tickets.ts:439-444`), `searchTickets` (`src/api/search.ts:75,113`), tags (`src/api/tags.ts:48,101`), telemetry analytics 6× (`src/api/telemetry.ts:357,375,400,415,439,468`). | medium   | SQLite Data Layer Speed | —         |
| ✅ Single shared synchronous connection.                                                                                             | One `new Database(dbPath)` at `src/lib/db.ts:37`; `sqlite`/`db` exported as singletons (`src/lib/db.ts:785-787`).                                                                                                                    | —        | none                    | —         |
| ✅ WAL + `foreign_keys` enabled.                                                                                                     | `src/lib/db.ts:38-39`.                                                                                                                                                                                                               | —        | none                    | —         |
| ✅ Composite indexes match hot WHERE clauses.                                                                                        | `idx_tickets_project_status`/`idx_tickets_epic_status` (`src/lib/schema.ts:75-76`) cover `getTicketSummaries`/`getEpicDetail`.                                                                                                       | —        | none                    | —         |
| ✅ SQL-side aggregation (no N+1).                                                                                                    | `getDashboardAnalytics` uses GROUP BY/CASE/AVG throughout (`src/api/analytics.ts:77-421`); `getProjectsWithEpics` single LEFT JOIN (`src/api/projects.ts:52-69`).                                                                    | —        | none                    | —         |
| ✅ TRUNCATE checkpoint on clean shutdown.                                                                                            | `src/lib/db.ts:43-51`.                                                                                                                                                                                                               | —        | none                    | —         |

---

## 5. @dnd-kit/core 6.3 + @dnd-kit/sortable 10

> **Health:** Good structure — `DragOverlay` isolates the dragged card, all card
> components are `memo()`d, and a custom `pointerWithin`+`closestCenter` collision
> strategy handles empty-column drops. Gaps: no `touch-action: none` on the
> draggable wrapper (scroll-vs-drag conflicts on touch), no `onDragOver` (cards
> don't reorder visually until drop), and default `WhileDragging` measuring.

| Recommendation                                                                                            | Current state (`file:line`)                                                                                                                   | Severity | Owning epic                             | Quick win |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------- | --------- |
| Set `touch-action: none` on the draggable element so the browser doesn't steal pointer events for scroll. | `SortableTicketCard.tsx:62` spreads listeners but the inline style (`lines 36-43`) omits `touch-action: none`.                                | high     | Buttery Render & Interaction Smoothness | ✅        |
| Add an `onDragOver` handler so items reorder visually during drag (not only on drop).                     | `KanbanBoard.tsx:391-397` has only `onDragStart`/`onDragEnd`; `ticketsByStatus` (`KanbanBoard.tsx:202-228`) is derived only from server data. | high     | Buttery Render & Interaction Smoothness | —         |
| Combine distance with delay/tolerance (or a TouchSensor) to avoid accidental drags.                       | `KanbanBoard.tsx:191-195` uses only `{ distance: 8 }`; no delay/tolerance or TouchSensor.                                                     | medium   | Buttery Render & Interaction Smoothness | ✅        |
| Set `measuring={{ droppable: { strategy: BeforeDragging } }}` for fixed-layout columns.                   | `KanbanBoard.tsx:391-397` has no `measuring` prop → default `WhileDragging` re-measures every frame even though columns don't resize.         | medium   | Buttery Render & Interaction Smoothness | ✅        |
| Pass `data` to `useSortable` for richer collision metadata.                                               | `SortableTicketCard.tsx:32-34` calls `useSortable({ id })` with no `data`.                                                                    | low      | Buttery Render & Interaction Smoothness | ✅        |
| Use `CSS.Translate.toString` for non-scaled in-list items.                                                | `SortableTicketCard.tsx:38` uses `CSS.Transform.toString` (emits `scaleX/scaleY`) for an opacity-only ghost.                                  | low      | Buttery Render & Interaction Smoothness | ✅        |
| ✅ `DragOverlay` with a portaled clone.                                                                   | `KanbanBoard.tsx:440-448` renders `<TicketCard isOverlay/>`.                                                                                  | —        | none                                    | —         |
| ✅ `memo()` on every board component.                                                                     | `SortableTicketCard.tsx:23`, `TicketCard.tsx:46`, `KanbanColumn.tsx:62`, and tag/git sub-components.                                          | —        | none                                    | —         |
| ✅ Hybrid collision detection for multi-column boards.                                                    | `kanbanCollisionDetection` (`KanbanBoard.tsx:95-116`) = `pointerWithin` + `closestCenter` fallback.                                           | —        | none                                    | —         |

---

## 6. @tanstack/react-virtual 3.13

> **Health:** Used correctly in `TicketListView`, `TagListView`,
> `GitHistoryCard`, and `ModalCommentsSection` (correct `enabled`,
> `getScrollElement`, `overscan`). The critical gap: **the Kanban board columns
> are not virtualized** — every card mounts as a real DOM node. Two table
> virtualizers also miss `measureElement` for dynamic-height rows.

| Recommendation                                                                                    | Current state (`file:line`)                                                                                                                                                                      | Severity | Owning epic                             | Quick win |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------- | --------- |
| Virtualize the board columns (`KanbanColumn` content div already has `overflowY: auto`).          | `KanbanBoard.tsx:423` maps all `columnTickets` directly; `KanbanColumn.tsx` imports no `useVirtualizer`; every card mounts regardless of count.                                                  | high     | Buttery Render & Interaction Smoothness | —         |
| Attach `measureElement` + `data-index` for dynamic-height table rows.                             | `TicketListView.tsx:137-143` and `TagListView.tsx:86-92` use fixed `estimateSize` with no `measureElement`; `GitHistoryCard.tsx:375-376` and `ModalCommentsSection.tsx:266-267` do it correctly. | medium   | Buttery Render & Interaction Smoothness | ✅        |
| Prefer absolute-position + `translateY` over spacer `<tr>` rows (avoids per-scroll table reflow). | `TicketListView.tsx:220-244` uses spacer rows (correctly with `colSpan`+`aria-hidden`); `TagListView.tsx:213-233` spacers lack `colSpan`.                                                        | low      | Buttery Render & Interaction Smoothness | ✅        |
| Spacer rows must carry `aria-hidden="true"`.                                                      | `TagListView.tsx:214,224` plain `<tr>` with no `aria-hidden`; `TicketListView.tsx:221,233` do it correctly.                                                                                      | low      | Buttery Render & Interaction Smoothness | ✅        |
| ✅ Unconditional hook call with `enabled` flag for conditional virtualization.                    | `TicketListView.tsx:137-143`, `TagListView.tsx:86-92`, `GitHistoryCard.tsx:336-342`, `ModalCommentsSection.tsx:167-173`.                                                                         | —        | none                                    | —         |
| ✅ Absolute-position + `measureElement` pattern for variable-height items.                        | `GitHistoryCard.tsx:368-397`, `ModalCommentsSection.tsx:259-284`.                                                                                                                                | —        | none                                    | —         |

---

## Quick-win backlog (file against the owning epic)

Small, low-risk changes worth filing immediately. None require a code change in
_this_ (research) ticket — they are routed to the execution-track epic that owns
the surface area.

### ⚡ Snappy Navigation & Data Freshness

- Fix `clearEvents` query-key mismatch — **bug**, writes to an orphaned cache entry (`src/lib/hooks/ralph.ts:280`).
- Wire `setupRouterSsrQueryIntegration` (also tagged _Instant First Load_) (`src/router.tsx`).
- Drop `refetchOnMount: "always"` on `useProjects` (`src/lib/hooks/projects.ts:79`).
- Align `useEpicDetail` `staleTime` with its loader (`src/lib/hooks/projects.ts:533`).
- Add a loader to the index route `/` (`src/routes/index.tsx`).
- Set `defaultPreload: "intent"` + raise global `staleTime`/add `gcTime` (`src/router.tsx`).
- Add `errorComponent` to `/board` and `/list`.
- Drop redundant `useQuery<…>` generics (4 call-sites).

### ⚡ Buttery Render & Interaction Smoothness

- Replace `staleTime: 0` + polling with a short non-zero `staleTime` (`workflow.ts`, `projects.ts`).
- Return the `invalidateQueries` promise in mutation callbacks (6 hooks).
- Add `touch-action: none` to `SortableTicketCard` (`SortableTicketCard.tsx`).
- Add `measuring: { droppable: BeforeDragging }` to the board `DndContext`.
- Add `useDeferredValue`/`startTransition` to drag + list sort/filter.
- Lift the inline `onClick` in `TicketCard` to a stable handler.
- Add `measureElement`/`aria-hidden`/`colSpan` fixes to the table virtualizers.

### ⚡ SQLite Data Layer Speed

- Add the four missing PRAGMAs (`src/lib/db.ts:38-39`).
- Add an index on `tickets.completed_at` (`src/lib/schema.ts`).

### ⚡ Instant First Load

- Wire SSR-query hydration (shared with Snappy Navigation).

## Larger initiatives (not quick wins)

These need a dedicated ticket and before/after measurement per
[`validating-optimizations.md`](./validating-optimizations.md):

- Enable the **React Compiler** and remove now-redundant manual memoization (⚡ Buttery Render).
- Adopt the **`queryOptions()` factory** and `useSuspenseQuery` across routes/hooks (⚡ Snappy Navigation).
- **Virtualize the Kanban board columns** (⚡ Buttery Render).
- Reconcile **`initTables()` raw SQL** with `schema.ts` so fresh installs get all indexes (⚡ SQLite Data Layer Speed).
- Introduce **prepared-statement reuse** on hot query paths (⚡ SQLite Data Layer Speed).

---

_Method: each library area was audited against the official docs for its shipped
version and the project's own `react-best-practices` / `tanstack-_`skills, with
every divergence verified against the source at the cited`file:line`. See the
ticket completion summary for the audit command used.\*
