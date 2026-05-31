/**
 * Production-safe Core Web Vitals reporting.
 *
 * Unlike the DEV-only instrumentation in navigation-timing.ts / profiler.ts,
 * this module ships in PRODUCTION builds — it is the only field-metric signal
 * Brain Dump emits for real first-load and interaction latency (LCP, CLS, INP,
 * TTFB). The validation harness and manual sessions read the collected values
 * via `window.__perfReport()`.
 *
 * Zero boot cost: the `web-vitals` package is dynamically imported AFTER
 * hydration (see registerWebVitals usage in routes/__root.tsx), so it lives in
 * its own chunk and never enters the main chunk critical path.
 *
 * Usage:
 *   import { registerWebVitals } from "../lib/web-vitals";
 *   useEffect(() => { registerWebVitals(); }, []);
 *
 * Read in any build from DevTools:
 *   window.__perfReport()
 */

import type { Metric } from "web-vitals";
import { createBrowserLogger } from "./browser-logger";

const logger = createBrowserLogger("web-vitals");

/** Core Web Vitals we subscribe to. */
export type WebVitalName = "LCP" | "CLS" | "INP" | "TTFB";

export interface WebVitalSample {
  name: WebVitalName;
  /** Metric value in the metric's native unit (ms for LCP/INP/TTFB, unitless for CLS). */
  value: number;
  /** web-vitals' threshold-based rating. */
  rating: "good" | "needs-improvement" | "poor";
  /** Change since the last report for this metric id. */
  delta: number;
  /** Stable id for this metric instance within the page lifetime. */
  id: string;
  /** When this sample was recorded (epoch ms). */
  timestamp: number;
}

export type WebVitalsReport = Record<WebVitalName, WebVitalSample | null>;

const METRIC_NAMES: readonly WebVitalName[] = ["LCP", "CLS", "INP", "TTFB"];

/** Latest sample per metric. Metrics can update multiple times (e.g. INP, CLS). */
const samples = new Map<WebVitalName, WebVitalSample>();

let registered = false;

/**
 * Get the latest sample for every tracked Web Vital.
 * Metrics that have not fired yet are reported as `null`.
 */
export function getWebVitalsReport(): WebVitalsReport {
  const report = {} as WebVitalsReport;
  for (const name of METRIC_NAMES) {
    report[name] = samples.get(name) ?? null;
  }
  return report;
}

function record(metric: Metric): void {
  if (!METRIC_NAMES.includes(metric.name as WebVitalName)) return;
  samples.set(metric.name as WebVitalName, {
    name: metric.name as WebVitalName,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    id: metric.id,
    timestamp: Date.now(),
  });
}

/**
 * Print the current Web Vitals to the console and return the structured report.
 * Exposed on `window.__perfReport` in every build (dev + prod).
 */
function printReport(): WebVitalsReport {
  const report = getWebVitalsReport();
  const rows = METRIC_NAMES.map((name) => {
    const sample = report[name];
    return {
      Metric: name,
      Value: sample ? Number(sample.value.toFixed(name === "CLS" ? 3 : 1)) : "—",
      Rating: sample?.rating ?? "(not reported yet)",
    };
  });
  console.group("[web-vitals] Core Web Vitals Report");
  console.table(rows);
  console.groupEnd();
  return report;
}

/**
 * Subscribe to Core Web Vitals and expose them on `window.__perfReport`.
 *
 * Safe to call multiple times — subscription happens once. Must be called after
 * hydration so the dynamic `web-vitals` import stays off the boot critical path.
 */
export function registerWebVitals(): void {
  if (typeof window === "undefined") return;
  if (registered) return;
  registered = true;

  // Expose the reader immediately so `window.__perfReport()` exists even before
  // any metric has fired (it simply reports nulls until values arrive).
  (window as unknown as Record<string, unknown>).__perfReport = printReport;

  // Lazy-load web-vitals so it never enters the main chunk critical path.
  void import("web-vitals")
    .then(({ onLCP, onCLS, onINP, onTTFB }) => {
      onLCP(record);
      onCLS(record);
      onINP(record);
      onTTFB(record);
    })
    .catch((error: unknown) => {
      // Field instrumentation is best-effort and must never break the app or
      // surface UI noise. Log it so it remains visible to developers.
      logger.warn(
        "Failed to load web-vitals; field metrics will be unavailable for this session",
        error instanceof Error ? error : new Error(String(error))
      );
    });
}
