/**
 * Dev-only navigation and data-fetching timing instrumentation.
 *
 * Uses the Performance API (performance.mark / performance.measure) to create
 * labeled entries visible in Chrome DevTools Performance tab.
 *
 * Captures:
 * - Route loader execution (start → end per route)
 * - Individual data fetches within loaders
 * - App boot timing (cold start to first render)
 *
 * All instrumentation is gated behind `import.meta.env.DEV`.
 *
 * Usage in a route loader:
 *   import { markLoaderStart, markLoaderEnd, timedFetch } from "../lib/navigation-timing";
 *
 *   loader: ({ context }) => {
 *     markLoaderStart("board");
 *     void timedFetch("board:tickets", () =>
 *       context.queryClient.ensureQueryData({ ... })
 *     );
 *     void timedFetch("board:projects", () =>
 *       context.queryClient.ensureQueryData({ ... })
 *     );
 *     markLoaderEnd("board");
 *   },
 *
 * View in DevTools:
 *   - Performance tab → Timings track shows loader and fetch measures
 *   - Console: window.__navigationReport()
 */

interface NavigationEntry {
  route: string;
  loaderDurationMs: number | null;
  fetches: { name: string; durationMs: number }[];
  timestamp: number;
}

const MAX_ENTRIES = 100;
const navigationLog: NavigationEntry[] = [];
const pendingLoaders = new Map<string, number>();
const pendingFetches = new Map<string, number>();

/**
 * Mark the start of a route loader. Call at the beginning of the loader function.
 */
export function markLoaderStart(route: string): void {
  if (!import.meta.env.DEV) return;
  const markName = `loader:${route}:start`;
  performance.mark(markName);
  pendingLoaders.set(route, performance.now());
}

/**
 * Mark the end of a route loader. Call after all ensureQueryData calls are fired.
 * Note: this marks when the loader function returns, not when all data has loaded
 * (ensureQueryData returns promises that resolve later).
 */
export function markLoaderEnd(route: string): void {
  if (!import.meta.env.DEV) return;
  const startMark = `loader:${route}:start`;
  const endMark = `loader:${route}:end`;
  performance.mark(endMark);

  try {
    performance.measure(`Loader: ${route}`, startMark, endMark);
  } catch {
    // Start mark may not exist if navigating without a loader
  }

  const startTime = pendingLoaders.get(route);
  if (startTime !== undefined) {
    const entry: NavigationEntry = {
      route,
      loaderDurationMs: performance.now() - startTime,
      fetches: [],
      timestamp: Date.now(),
    };
    navigationLog.push(entry);
    if (navigationLog.length > MAX_ENTRIES) {
      navigationLog.splice(0, navigationLog.length - MAX_ENTRIES);
    }
    pendingLoaders.delete(route);
  }
}

/**
 * Wrap a data fetch (ensureQueryData, server function call, etc.) with timing marks.
 * The returned promise resolves when the fetch completes.
 *
 * @param name - Label for this fetch (e.g., "board:tickets", "dashboard:analytics")
 * @param fn - The fetch function to time
 * @returns The result of the fetch function
 */
export async function timedFetch<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
  if (!import.meta.env.DEV) return fn();

  const startMark = `fetch:${name}:start`;
  const endMark = `fetch:${name}:end`;

  performance.mark(startMark);
  pendingFetches.set(name, performance.now());

  try {
    const result = await fn();

    performance.mark(endMark);
    try {
      performance.measure(`Fetch: ${name}`, startMark, endMark);
    } catch {
      // Marks may have been cleared
    }

    const startTime = pendingFetches.get(name);
    if (startTime !== undefined) {
      const durationMs = performance.now() - startTime;
      // Attach to the most recent navigation entry
      const lastEntry = navigationLog[navigationLog.length - 1];
      if (lastEntry) {
        lastEntry.fetches.push({ name, durationMs });
      }
      pendingFetches.delete(name);
    }

    return result;
  } catch (err) {
    performance.mark(endMark);
    try {
      performance.measure(`Fetch: ${name} (FAILED)`, startMark, endMark);
    } catch {
      // Marks may have been cleared
    }
    pendingFetches.delete(name);
    throw err;
  }
}

/**
 * Get the navigation log.
 */
export function getNavigationLog(): readonly NavigationEntry[] {
  return navigationLog;
}

/**
 * Print a formatted navigation timing report to the console.
 * Call from browser DevTools: `window.__navigationReport()`
 */
export function printNavigationReport(): void {
  if (navigationLog.length === 0) {
    console.log("[Navigation] No data collected yet. Navigate between routes first.");
    return;
  }

  console.group("[Navigation] Route Timing Report");

  for (const entry of navigationLog) {
    const loaderMs = entry.loaderDurationMs?.toFixed(2) ?? "N/A";
    console.groupCollapsed(
      `${entry.route} — loader: ${loaderMs}ms, ${entry.fetches.length} fetch(es)`
    );

    if (entry.fetches.length > 0) {
      console.table(
        entry.fetches.map((f) => ({
          Fetch: f.name,
          "Duration (ms)": Number(f.durationMs.toFixed(2)),
        }))
      );

      // Identify sequential vs parallel patterns
      const maxFetch = Math.max(...entry.fetches.map((f) => f.durationMs));
      const totalFetch = entry.fetches.reduce((sum, f) => sum + f.durationMs, 0);
      const parallelRatio = totalFetch > 0 ? maxFetch / totalFetch : 1;

      if (parallelRatio < 0.6) {
        console.warn(
          `⚠️ Sequential pattern detected: max fetch (${maxFetch.toFixed(1)}ms) is only ${(parallelRatio * 100).toFixed(0)}% of total (${totalFetch.toFixed(1)}ms). Consider parallelizing.`
        );
      } else {
        console.log(
          `✓ Fetches appear parallel (max: ${maxFetch.toFixed(1)}ms, total: ${totalFetch.toFixed(1)}ms)`
        );
      }
    }
    console.groupEnd();
  }

  console.groupEnd();
}

/**
 * Clear all navigation timing data.
 */
export function clearNavigationData(): void {
  navigationLog.length = 0;
  pendingLoaders.clear();
  pendingFetches.clear();
}

// Mark app boot time
if (import.meta.env.DEV && typeof window !== "undefined") {
  performance.mark("app:boot:start");

  // Expose to DevTools
  (window as unknown as Record<string, unknown>).__navigationReport = printNavigationReport;
  (window as unknown as Record<string, unknown>).__navigationClear = clearNavigationData;
  (window as unknown as Record<string, unknown>).__navigationLog = getNavigationLog;
}
