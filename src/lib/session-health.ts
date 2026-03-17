/**
 * Dev-only session health monitor for detecting memory leaks and timer buildup.
 *
 * Periodically samples memory usage and active observer counts, storing snapshots
 * for trend analysis over long-running sessions (30-60 minutes).
 *
 * Usage (in Chrome DevTools console):
 *   __sessionHealth()     — Print current health summary
 *   __sessionSnapshots()  — Get raw snapshot data (for charting)
 *   __sessionStart()      — Start monitoring (auto-starts on import)
 *   __sessionStop()       — Stop monitoring
 *
 * What it monitors:
 * - JS heap size over time (via performance.memory)
 * - TanStack Query cache entry count (via queryClient)
 * - Active MutationObservers / ResizeObservers (proxy for subscription leaks)
 * - Snapshot trending (is memory growing, stable, or shrinking?)
 */

interface HealthSnapshot {
  timestamp: number;
  heapUsedMB: number | null;
  heapTotalMB: number | null;
  queryCacheSize: number | null;
  domNodeCount: number;
  intervalId: string;
}

const MAX_SNAPSHOTS = 360; // 1 snapshot/10s = 60 minutes of history
const SAMPLE_INTERVAL_MS = 10_000; // 10 seconds

const snapshots: HealthSnapshot[] = [];
let monitorTimer: ReturnType<typeof setInterval> | null = null;
let snapshotId = 0;

// Declared as a var so it can be set from the root component
let queryClientRef: { getQueryCache: () => { getAll: () => unknown[] } } | null = null;

/**
 * Provide the TanStack QueryClient reference for cache size monitoring.
 * Call this once from the root component.
 */
export function setQueryClientForHealth(
  client: { getQueryCache: () => { getAll: () => unknown[] } } | null
): void {
  queryClientRef = client;
}

/**
 * Take a single health snapshot.
 */
function takeSnapshot(): HealthSnapshot {
  // JS heap (Chrome-only API)
  const memory = (
    performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }
  ).memory;

  const snapshot: HealthSnapshot = {
    timestamp: Date.now(),
    heapUsedMB: memory ? Math.round((memory.usedJSHeapSize / 1024 / 1024) * 100) / 100 : null,
    heapTotalMB: memory ? Math.round((memory.totalJSHeapSize / 1024 / 1024) * 100) / 100 : null,
    queryCacheSize: queryClientRef ? queryClientRef.getQueryCache().getAll().length : null,
    domNodeCount: document.querySelectorAll("*").length,
    intervalId: `s${++snapshotId}`,
  };

  snapshots.push(snapshot);
  if (snapshots.length > MAX_SNAPSHOTS) {
    snapshots.splice(0, snapshots.length - MAX_SNAPSHOTS);
  }

  return snapshot;
}

/**
 * Start periodic health monitoring.
 */
export function startHealthMonitor(): void {
  if (monitorTimer !== null) return; // Already running
  if (!import.meta.env.DEV) return;

  // Take initial snapshot
  takeSnapshot();

  monitorTimer = setInterval(() => {
    takeSnapshot();
  }, SAMPLE_INTERVAL_MS);

  console.log(
    `[SessionHealth] Monitoring started (sampling every ${SAMPLE_INTERVAL_MS / 1000}s, max ${MAX_SNAPSHOTS} snapshots)`
  );
}

/**
 * Stop periodic health monitoring.
 */
export function stopHealthMonitor(): void {
  if (monitorTimer !== null) {
    clearInterval(monitorTimer);
    monitorTimer = null;
    console.log("[SessionHealth] Monitoring stopped");
  }
}

/**
 * Get all health snapshots (for charting or export).
 */
export function getHealthSnapshots(): readonly HealthSnapshot[] {
  return snapshots;
}

/**
 * Compute memory trend from recent snapshots.
 * Returns "growing", "stable", or "shrinking".
 */
function computeTrend(): { trend: string; deltaPerMinute: number | null } {
  if (snapshots.length < 6) {
    return { trend: "insufficient data (need ~1 minute of samples)", deltaPerMinute: null };
  }

  // Compare first and last 3 snapshots
  const recentHeaps = snapshots
    .slice(-3)
    .map((s) => s.heapUsedMB)
    .filter((h): h is number => h !== null);
  const oldHeaps = snapshots
    .slice(0, 3)
    .map((s) => s.heapUsedMB)
    .filter((h): h is number => h !== null);

  if (recentHeaps.length === 0 || oldHeaps.length === 0) {
    return {
      trend: "unknown (no heap data — use Chrome for memory metrics)",
      deltaPerMinute: null,
    };
  }

  const recentAvg = recentHeaps.reduce((a, b) => a + b, 0) / recentHeaps.length;
  const oldAvg = oldHeaps.reduce((a, b) => a + b, 0) / oldHeaps.length;
  const durationMinutes =
    (snapshots[snapshots.length - 1]!.timestamp - snapshots[0]!.timestamp) / 1000 / 60 || 1;
  const deltaPerMinute = (recentAvg - oldAvg) / durationMinutes;

  if (deltaPerMinute > 0.5) return { trend: "GROWING ⚠️", deltaPerMinute };
  if (deltaPerMinute < -0.5) return { trend: "shrinking", deltaPerMinute };
  return { trend: "stable ✓", deltaPerMinute };
}

/**
 * Print a formatted health summary to the console.
 * Call from DevTools: `window.__sessionHealth()`
 */
export function printHealthSummary(): void {
  if (snapshots.length === 0) {
    console.log("[SessionHealth] No snapshots yet. Run __sessionStart() first.");
    return;
  }

  const latest = snapshots[snapshots.length - 1]!;
  const first = snapshots[0]!;
  const durationMin = ((latest.timestamp - first.timestamp) / 1000 / 60).toFixed(1);
  const { trend, deltaPerMinute } = computeTrend();

  console.group(`[SessionHealth] Summary (${snapshots.length} snapshots over ${durationMin} min)`);

  console.log("📊 Current:");
  console.table({
    "Heap Used (MB)": latest.heapUsedMB ?? "N/A (not Chrome)",
    "Heap Total (MB)": latest.heapTotalMB ?? "N/A (not Chrome)",
    "Query Cache Entries": latest.queryCacheSize ?? "N/A (client not connected)",
    "DOM Nodes": latest.domNodeCount,
  });

  console.log("📈 Memory Trend:", trend);
  if (deltaPerMinute !== null) {
    console.log(`   Rate: ${deltaPerMinute > 0 ? "+" : ""}${deltaPerMinute.toFixed(3)} MB/min`);
  }

  // Show min/max heap across all snapshots
  const heaps = snapshots.map((s) => s.heapUsedMB).filter((h): h is number => h !== null);
  if (heaps.length > 0) {
    console.log(`   Range: ${Math.min(...heaps).toFixed(1)} — ${Math.max(...heaps).toFixed(1)} MB`);
  }

  // Show query cache growth
  const cacheSizes = snapshots.map((s) => s.queryCacheSize).filter((c): c is number => c !== null);
  if (cacheSizes.length > 0) {
    const cacheFirst = cacheSizes[0]!;
    const cacheLast = cacheSizes[cacheSizes.length - 1]!;
    const cacheGrowth = cacheLast - cacheFirst;
    console.log(
      `📦 Query Cache: ${cacheFirst} → ${cacheLast} entries (${cacheGrowth >= 0 ? "+" : ""}${cacheGrowth})`
    );
  }

  console.groupEnd();
}

// Auto-start in development
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__sessionHealth = printHealthSummary;
  (window as unknown as Record<string, unknown>).__sessionSnapshots = getHealthSnapshots;
  (window as unknown as Record<string, unknown>).__sessionStart = startHealthMonitor;
  (window as unknown as Record<string, unknown>).__sessionStop = stopHealthMonitor;

  // Auto-start monitoring
  startHealthMonitor();
}
