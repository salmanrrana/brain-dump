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

`eslint-plugin-react-hooks@7`'s `recommended` config ships the compiler-derived
rules-of-React checks (`react-hooks/purity`, `react-hooks/immutability`,
`react-hooks/set-state-in-render`, `react-hooks/incompatible-library`,
`react-hooks/preserve-manual-memoization`, …), and they are already active — `pnpm lint`
passes with 0 errors. These catch _rules-of-React violations_, but they are **not** a
complete bailout signal: they do not flag syntactic bailouts (e.g. KanbanBoard's
value-block-inside-`try/catch`), and `react-hooks/incompatible-library` is `warn`
severity, so it never fails `pnpm lint` (the script has no `--max-warnings 0`). The
warnings lint surfaces today are pre-existing `react-refresh` notes plus
`react-hooks/incompatible-library` on TanStack Virtual's `useVirtualizer()` (an
inherently un-memoizable API — see bailouts below).

The reliable bailout signal is the **build-time compiler logger** wired into
`reactCompilerConfig` in `vite.config.ts`: it `console.warn`s on every `CompileError` /
`PipelineError` during `pnpm build`/`pnpm dev`, so a component silently dropping to a
bailout after a refactor is visible instead of hidden.

## Compilation evidence

Compilation is **per-function**, not per-file: the compiler optimizes each component/hook
it can prove safe and bails out of the rest, so a single file can have both compiled and
bailed functions. What matters for this epic is that the **hot board leaf components
compile cleanly** (zero bailouts in `pnpm build`, verified via the build logger):

| Hot component                   | Result      |
| ------------------------------- | ----------- |
| `board/KanbanColumn.tsx`        | ✅ compiled |
| `board/KanbanColumnContent.tsx` | ✅ compiled |
| `board/TicketCard.tsx`          | ✅ compiled |
| `board/SortableTicketCard.tsx`  | ✅ compiled |
| `epics/EpicTicketsList.tsx`     | ✅ compiled |
| `routes/dashboard.tsx`          | ✅ compiled |

Container/route components (`board/KanbanBoard.tsx`, `AppLayout.tsx`, the route entry
files) have _some_ functions that bail (see below) while others compile. The production
client build carries the React 19 memo-cache runtime (`useMemoCache` in the main vendor
chunk), and the hot chunks grow by exactly the injected memoization code (see bundle
impact).

## Documented bailouts

Bailouts are **non-fatal**: the affected function is left exactly as written and keeps its
existing manual memoization. The build-time logger reports **38 bailout events across 26
files** on this branch, broken down by category:

| Category              | Count | Meaning                                                                   |
| --------------------- | ----: | ------------------------------------------------------------------------- |
| `Todo`                |    31 | Known compiler limitations — syntax it doesn't yet model                  |
| `IncompatibleLibrary` |     4 | `useVirtualizer()` (TanStack Virtual returns un-memoizable functions)     |
| `Suppression`         |     2 | Component has React ESLint rules disabled, so the compiler skips it       |
| `Hooks`               |     1 | A conditional/inconsistent-order hook call the compiler flags (see below) |

Notable cases:

- **`Todo` — value blocks inside `try/catch`** (e.g. `board/KanbanBoard.tsx`,
  `epics/EpicDetailHeader.tsx`): optional chaining / conditionals inside a `try/catch`,
  plus related TODOs (`ThrowStatement` / `TryStatement` without a catch, computed
  properties in object patterns). The compiler skips the whole function. KanbanBoard still
  isolates its drag overlay (`BoardDragOverlay`) and delegates card rendering to the
  **compiled** `KanbanColumn`/`SortableTicketCard`, so the hot drag path stays optimized.
  These resolve themselves as the compiler matures — no refactor here per the "don't rip
  out manual memoization" scope.
- **`IncompatibleLibrary` — `useVirtualizer()`** (`TicketListView`, virtualized comment
  lists): TanStack Virtual returns functions that cannot be memoized safely; the compiler
  leaves those components alone.
- **`Hooks` — conditional hook call**: the logger surfaces one latent Rules-of-Hooks
  violation (a hook not called in consistent order). It is pre-existing and out of scope
  for this ticket, but it is a good follow-up candidate now that it is visible.

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
