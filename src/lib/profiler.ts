/**
 * Dev-only React Profiler callback and utilities.
 *
 * Wraps React's <Profiler> onRender callback to collect render timing data
 * for key user flows (board navigation, ticket modal, dashboard).
 *
 * All output is gated behind `import.meta.env.DEV` — zero cost in production.
 *
 * Usage:
 *   import { onRenderCallback, getProfilerSummary, clearProfilerData } from "../lib/profiler";
 *   <Profiler id="Board" onRender={onRenderCallback}>
 *     <Board />
 *   </Profiler>
 */

export interface RenderEntry {
  id: string;
  phase: "mount" | "update" | "nested-update";
  actualDuration: number;
  baseDuration: number;
  startTime: number;
  commitTime: number;
  timestamp: number;
}

export interface ProfilerSummary {
  id: string;
  renderCount: number;
  mountCount: number;
  updateCount: number;
  avgActualMs: number;
  maxActualMs: number;
  p95ActualMs: number;
  avgBaseMs: number;
  totalActualMs: number;
}

const MAX_ENTRIES_PER_ID = 200;

const renderLog = new Map<string, RenderEntry[]>();

/**
 * React Profiler onRender callback. Pass this to <Profiler onRender={onRenderCallback}>.
 * Only logs in development — noop in production.
 */
export function onRenderCallback(
  id: string,
  phase: "mount" | "update" | "nested-update",
  actualDuration: number,
  baseDuration: number,
  startTime: number,
  commitTime: number
): void {
  if (!import.meta.env.DEV) return;

  const entry: RenderEntry = {
    id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
    timestamp: Date.now(),
  };

  const entries = renderLog.get(id) ?? [];
  entries.push(entry);

  // Cap stored entries to avoid memory bloat in long sessions
  if (entries.length > MAX_ENTRIES_PER_ID) {
    entries.splice(0, entries.length - MAX_ENTRIES_PER_ID);
  }

  renderLog.set(id, entries);

  // Log slow renders (>16ms = missed 60fps frame)
  if (actualDuration > 16) {
    console.warn(
      `[Profiler] Slow render: ${id} (${phase}) took ${actualDuration.toFixed(1)}ms (base: ${baseDuration.toFixed(1)}ms)`
    );
  }
}

/**
 * Get a summary of profiler data for a specific component ID.
 */
export function getProfilerSummary(id: string): ProfilerSummary | null {
  const entries = renderLog.get(id);
  if (!entries || entries.length === 0) return null;

  const actuals = entries.map((e) => e.actualDuration).sort((a, b) => a - b);
  const bases = entries.map((e) => e.baseDuration);
  const mountCount = entries.filter((e) => e.phase === "mount").length;

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const p95Index = Math.floor(actuals.length * 0.95);

  return {
    id,
    renderCount: entries.length,
    mountCount,
    updateCount: entries.length - mountCount,
    avgActualMs: sum(actuals) / actuals.length,
    maxActualMs: actuals[actuals.length - 1] ?? 0,
    p95ActualMs: actuals[p95Index] ?? 0,
    avgBaseMs: sum(bases) / bases.length,
    totalActualMs: sum(actuals),
  };
}

/**
 * Get summaries for all tracked components.
 */
export function getAllProfilerSummaries(): ProfilerSummary[] {
  const summaries: ProfilerSummary[] = [];
  for (const id of renderLog.keys()) {
    const summary = getProfilerSummary(id);
    if (summary) summaries.push(summary);
  }
  return summaries.sort((a, b) => b.totalActualMs - a.totalActualMs);
}

/**
 * Print a formatted profiler report to the console.
 * Call from browser DevTools: `window.__profilerReport()`
 */
export function printProfilerReport(): void {
  const summaries = getAllProfilerSummaries();
  if (summaries.length === 0) {
    console.log("[Profiler] No data collected yet. Interact with the app first.");
    return;
  }

  console.group("[Profiler] Render Performance Report");
  console.table(
    summaries.map((s) => ({
      Component: s.id,
      Renders: s.renderCount,
      Mounts: s.mountCount,
      Updates: s.updateCount,
      "Avg (ms)": Number(s.avgActualMs.toFixed(2)),
      "P95 (ms)": Number(s.p95ActualMs.toFixed(2)),
      "Max (ms)": Number(s.maxActualMs.toFixed(2)),
      "Total (ms)": Number(s.totalActualMs.toFixed(2)),
    }))
  );
  console.groupEnd();
}

/**
 * Clear all collected profiler data.
 */
export function clearProfilerData(): void {
  renderLog.clear();
}

/**
 * Get raw render entries for a component (useful for charting).
 */
export function getRenderEntries(id: string): readonly RenderEntry[] {
  return renderLog.get(id) ?? [];
}

// Expose to browser DevTools in development
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__profilerReport = printProfilerReport;
  (window as unknown as Record<string, unknown>).__profilerClear = clearProfilerData;
  (window as unknown as Record<string, unknown>).__profilerSummaries = getAllProfilerSummaries;
}
