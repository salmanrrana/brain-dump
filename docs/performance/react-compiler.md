# React Compiler Adoption

The app enables the **React Compiler** (`babel-plugin-react-compiler@1.0.0`) so React 19
auto-memoizes components it can prove safe. This systematically prevents the kind of
re-render bugs the "⚡ Buttery Render & Interaction Smoothness" epic chases (board drag,
keyboard nav, dashboard polls) without hand-placing `memo`/`useMemo`/`useCallback`.

## How it's wired

`vite.config.ts` passes the compiler into the `@vitejs/plugin-react` Babel pipeline:

```ts
const reactCompilerConfig = { target: "19" } as const;

viteReact({
  babel: {
    plugins: [["babel-plugin-react-compiler", reactCompilerConfig]],
  },
});
```

- `target: "19"` matches `react@19.2`, so compiled components import the memo cache from
  React's built-in `react/compiler-runtime` (`_c(n)` slots) — no extra runtime shim ships.
- The compiler is **incremental**: any function it cannot prove safe is silently skipped
  (a "bailout") and left exactly as written, so existing manual memoization keeps working.

## ESLint health check

The compiler's static-analysis rules are already active through
`eslint-plugin-react-hooks@7` (`recommended`): `react-hooks/purity`,
`preserve-manual-memoization`, `immutability`, `set-state-in-render`,
`incompatible-library`, etc. `pnpm lint` is therefore the compiler health check — it
passes with 0 errors. The warnings it surfaces are pre-existing `react-refresh` notes
plus `react-hooks/incompatible-library` on TanStack Virtual's `useVirtualizer()` (an
inherently un-memoizable API — see bailouts below).

## Compilation evidence

Running the compiler directly over hot components (target `19`, counting injected
`_c(n)` memo-cache slots):

| Component                      | Result                 |
| ------------------------------ | ---------------------- |
| `board/KanbanColumn.tsx`       | ✅ compiled            |
| `board/TicketCard.tsx`         | ✅ compiled            |
| `board/SortableTicketCard.tsx` | ✅ compiled            |
| `routes/dashboard.tsx`         | ✅ compiled (3 slots)  |
| `epics/EpicTicketsList.tsx`    | ✅ compiled            |
| `AppLayout.tsx`                | ✅ compiled (2 slots)  |
| `board/KanbanBoard.tsx`        | ⚠️ bailout (see below) |

The production client build also carries the React 19 memo-cache runtime
(`useMemoCache` appears in the main vendor chunk), and the hot route chunks grow by
exactly the injected memoization code (see bundle impact).

## Documented bailouts

The compiler skips these; they fall back to their existing manual memoization and behave
identically. None are errors — each is a known compiler limitation.

- **`board/KanbanBoard.tsx`** — `CompileError: Support value blocks (conditional,
logical, optional chaining, etc) within a try/catch statement`. The component body
  uses optional chaining / conditional expressions inside a `try/catch`, which the
  current compiler does not yet model, so it skips the whole `KanbanBoard` function.
  KanbanBoard already isolates its drag overlay (`BoardDragOverlay`) and delegates card
  rendering to the **compiled** `KanbanColumn`/`SortableTicketCard`, so the hot drag path
  is still optimized. Revisit if a future compiler release lifts the try/catch
  restriction — no refactor is done here per the "don't rip out manual memoization" scope.
- **`useVirtualizer()` call sites** (`TicketListView`, virtualized comment lists) —
  flagged `react-hooks/incompatible-library`: TanStack Virtual returns functions that
  cannot be memoized safely, so the compiler leaves those components alone.

## Build & bundle impact

Auto-memoization adds codegen, so the bundle grows modestly. Measured on this branch
(`pnpm build`):

| Metric           |      Before |       After |    Delta |
| ---------------- | ----------: | ----------: | -------: |
| `main-*.js`      |   816,890 B |   873,719 B |    +6.9% |
| `board-*.js`     |    91,130 B |   102,421 B |   +12.4% |
| Total client JS  | 3,328,417 B | 3,558,105 B |    +6.9% |
| Build wall-clock |     ~41.5 s |     ~54.1 s | +~12.5 s |

The size/build-time increase is the expected trade for eliminating wasted re-renders at
runtime. Existing manual memoization is intentionally left in place; a follow-up cleanup
ticket can remove now-redundant `memo`/`useMemo` where proven safe.

## Verifying in the browser

Open the board in dev, then React DevTools → Components: compiled components show the
**"Memo ✨"** badge. With highlight-updates on, dragging a card or moving keyboard focus
should re-render only the affected cards, not the whole board. `window.__profilerReport()`
gives render counts for before/after comparison.
