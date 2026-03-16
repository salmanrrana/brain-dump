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

// =============================================================================
// SSR / HYDRATION TIMING
// =============================================================================

/**
 * Mark when React hydration completes (call from root component useEffect).
 * Creates a measure from navigationStart → hydration for SSR-to-interactive gap.
 */
export function markHydrationComplete(): void {
  if (!import.meta.env.DEV) return;

  performance.mark("app:hydration:end");

  // Measure from navigation start to hydration complete
  try {
    const navEntry = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (navEntry) {
      // Use navigation start as the baseline
      performance.measure("SSR → Hydration", {
        start: navEntry.startTime,
        end: performance.now(),
      });
    }
  } catch {
    // Fallback: measure from boot start
    try {
      performance.measure("Boot → Hydration", "app:boot:start", "app:hydration:end");
    } catch {
      // boot:start may not exist on HMR
    }
  }
}

/**
 * Print SSR/hydration timing report to the console.
 * Call from DevTools: `window.__hydrationReport()`
 */
export function printHydrationReport(): void {
  const navEntries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  const navEntry = navEntries[0];

  if (!navEntry) {
    console.log("[Hydration] No navigation timing data available.");
    return;
  }

  const hydrationMark = performance.getEntriesByName("app:hydration:end", "mark")[0];
  const bootEndMark = performance.getEntriesByName("app:boot:end", "mark")[0];

  console.group("[Hydration] SSR-to-Hydration Timing");

  console.table({
    "DNS Lookup": `${(navEntry.domainLookupEnd - navEntry.domainLookupStart).toFixed(1)}ms`,
    "TCP Connect": `${(navEntry.connectEnd - navEntry.connectStart).toFixed(1)}ms`,
    "Server Response (TTFB)": `${navEntry.responseStart.toFixed(1)}ms`,
    "Response Download": `${(navEntry.responseEnd - navEntry.responseStart).toFixed(1)}ms`,
    "DOM Interactive": `${navEntry.domInteractive.toFixed(1)}ms`,
    "DOM Content Loaded": `${navEntry.domContentLoadedEventEnd.toFixed(1)}ms`,
    "Load Event": `${navEntry.loadEventEnd.toFixed(1)}ms`,
    ...(bootEndMark ? { "React Boot (useEffect)": `${bootEndMark.startTime.toFixed(1)}ms` } : {}),
    ...(hydrationMark ? { "Hydration Complete": `${hydrationMark.startTime.toFixed(1)}ms` } : {}),
  });

  // Compute SSR contribution
  if (hydrationMark) {
    const ssrToHydration = hydrationMark.startTime - navEntry.responseEnd;
    const totalLoadTime = hydrationMark.startTime;
    const ssrContribution = navEntry.responseEnd / totalLoadTime;

    console.log(`\n📊 SSR Analysis:`);
    console.log(`   Server rendered HTML arrived at: ${navEntry.responseEnd.toFixed(1)}ms`);
    console.log(`   Hydration completed at: ${hydrationMark.startTime.toFixed(1)}ms`);
    console.log(`   Hydration gap: ${ssrToHydration.toFixed(1)}ms (JS parse + hydrate)`);
    console.log(`   SSR contribution: ${(ssrContribution * 100).toFixed(0)}% of total load`);

    if (ssrToHydration > 1000) {
      console.warn(`   ⚠️ Hydration gap >1s — consider reducing JS payload or lazy hydration`);
    }
  }

  // Check for hydration mismatch warnings
  console.log(`\n🔍 Hydration Mismatch Check:`);
  console.log(`   suppressHydrationWarning used: yes (on <html> element for theme)`);
  console.log(`   To check for mismatches, watch console during page load for React warnings.`);
  console.log(`   React 19 logs: "Warning: Text content did not match" or "Hydration failed"`);

  console.groupEnd();
}

// =============================================================================
// SPLASH SCREEN TIMING
// =============================================================================

/**
 * Print splash screen timing analysis to the console.
 * Call from DevTools: `window.__splashReport()`
 */
export function printSplashReport(): void {
  const mountMark = performance.getEntriesByName("splash:mount", "mark")[0];
  const fadeStartMark = performance.getEntriesByName("splash:fade-start", "mark")[0];
  const completeMark = performance.getEntriesByName("splash:complete", "mark")[0];
  const hydrationMark = performance.getEntriesByName("app:hydration:end", "mark")[0];

  if (!mountMark) {
    console.log("[Splash] No splash timing data. Run after a cold page load.");
    return;
  }

  console.group("[Splash] Splash Screen Timing Analysis");

  console.table({
    "Splash Mount": `${mountMark.startTime.toFixed(1)}ms`,
    ...(fadeStartMark ? { "Fade Start": `${fadeStartMark.startTime.toFixed(1)}ms` } : {}),
    ...(completeMark ? { "Splash Complete": `${completeMark.startTime.toFixed(1)}ms` } : {}),
    ...(fadeStartMark
      ? { "Visible Duration": `${(fadeStartMark.startTime - mountMark.startTime).toFixed(1)}ms` }
      : {}),
    ...(completeMark && fadeStartMark
      ? { "Fade Duration": `${(completeMark.startTime - fadeStartMark.startTime).toFixed(1)}ms` }
      : {}),
    ...(completeMark
      ? { "Total Blocking Time": `${(completeMark.startTime - mountMark.startTime).toFixed(1)}ms` }
      : {}),
  });

  // Compare splash time to hydration time
  if (completeMark && hydrationMark) {
    const hydrationTime = hydrationMark.startTime;
    const splashAfterHydration = completeMark.startTime - hydrationMark.startTime;

    console.log(`\n📊 Impact Analysis:`);
    console.log(`   App was interactive at: ${hydrationTime.toFixed(1)}ms (hydration complete)`);
    console.log(`   Splash blocked until: ${completeMark.startTime.toFixed(1)}ms`);
    console.log(`   Unnecessary blocking: ${Math.max(0, splashAfterHydration).toFixed(1)}ms`);
    console.log(`   Role: branding animation (LetterGlitch effect)`);
    console.log(`   Config: MIN_DISPLAY=${800}ms, FADE_DURATION=${800}ms`);

    if (splashAfterHydration > 500) {
      console.warn(
        `   ⚠️ Splash blocks ${splashAfterHydration.toFixed(0)}ms AFTER hydration completes.`
      );
      console.warn(`   Consider reducing MIN_DISPLAY_MS or showing splash only on cold boot.`);
    }
  }

  console.groupEnd();
}

// Mark app boot time
if (import.meta.env.DEV && typeof window !== "undefined") {
  performance.mark("app:boot:start");

  // Expose to DevTools
  (window as unknown as Record<string, unknown>).__navigationReport = printNavigationReport;
  (window as unknown as Record<string, unknown>).__navigationClear = clearNavigationData;
  (window as unknown as Record<string, unknown>).__navigationLog = getNavigationLog;
  (window as unknown as Record<string, unknown>).__hydrationReport = printHydrationReport;
  (window as unknown as Record<string, unknown>).__splashReport = printSplashReport;
}
