import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { test, expect } from "@playwright/test";

/**
 * Runtime performance baseline capture (one-off "before" snapshot).
 *
 * Drives the dev build (where `window.__navigationReport()` / `__profilerReport()` /
 * `__assetReport()` / `__hydrationReport()` / `__splashReport()` instrumentation lives)
 * through the hot paths and records the underlying data behind those reports.
 *
 * This is a capture, not a budget gate — the gating perf spec lands in the
 * validation-harness ticket. Numbers are transcribed into
 * docs/performance/runtime-baseline-2026.md.
 *
 * Run: pnpm exec playwright test perf-baseline
 * Output: test-results/perf-baseline.json (+ logged to stdout)
 */

interface AssetCategory {
  category: string;
  count: number;
  totalTransferKB: number;
  largestKB: number;
}

interface PageSnapshot {
  route: string;
  navTiming: {
    ttfbMs: number;
    responseEndMs: number;
    domInteractiveMs: number;
    domContentLoadedMs: number;
    loadEventMs: number;
  };
  boot: { bootEndMs: number | null; hydrationEndMs: number | null };
  splash: {
    mountMs: number | null;
    fadeStartMs: number | null;
    completeMs: number | null;
    visibleMs: number | null;
    totalBlockingMs: number | null;
  };
  assets: AssetCategory[];
  resourceCount: number;
}

interface NavLogEntry {
  route: string;
  loaderDurationMs: number | null;
  fetches: { name: string; durationMs: number }[];
}

interface ProfilerSummary {
  id: string;
  renderCount: number;
  mountCount: number;
  updateCount: number;
  avgActualMs: number;
  p95ActualMs: number;
  maxActualMs: number;
  totalActualMs: number;
}

/** Collected entirely inside the browser via the Performance API + exposed dev globals. */
function collectPageSnapshot(route: string): PageSnapshot {
  const nav = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  const markAt = (name: string): number | null =>
    performance.getEntriesByName(name, "mark")[0]?.startTime ?? null;

  const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  const scripts: PerformanceResourceTiming[] = [];
  const styles: PerformanceResourceTiming[] = [];
  const images: PerformanceResourceTiming[] = [];
  const fonts: PerformanceResourceTiming[] = [];
  const other: PerformanceResourceTiming[] = [];
  for (const r of resources) {
    if (r.initiatorType === "script" || /\.m?js(\?|$)/.test(r.name)) scripts.push(r);
    else if (r.initiatorType === "css" || /\.css(\?|$)/.test(r.name)) styles.push(r);
    else if (r.initiatorType === "img" || /\.(png|jpe?g|gif|webp|avif|svg|ico)(\?|$)/.test(r.name))
      images.push(r);
    else if (/\.(woff2?|ttf|otf|eot)(\?|$)/.test(r.name)) fonts.push(r);
    else other.push(r);
  }
  const assets: AssetCategory[] = (
    [
      ["scripts", scripts],
      ["styles", styles],
      ["images", images],
      ["fonts", fonts],
      ["other", other],
    ] as const
  ).map(([category, items]) => ({
    category,
    count: items.length,
    totalTransferKB: Math.round(items.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024),
    largestKB: Math.round(Math.max(0, ...items.map((r) => r.transferSize || 0)) / 1024),
  }));

  const splashMount = markAt("splash:mount");
  const splashFade = markAt("splash:fade-start");
  const splashComplete = markAt("splash:complete");

  return {
    route,
    navTiming: {
      ttfbMs: nav?.responseStart ?? 0,
      responseEndMs: nav?.responseEnd ?? 0,
      domInteractiveMs: nav?.domInteractive ?? 0,
      domContentLoadedMs: nav?.domContentLoadedEventEnd ?? 0,
      loadEventMs: nav?.loadEventEnd ?? 0,
    },
    boot: { bootEndMs: markAt("app:boot:end"), hydrationEndMs: markAt("app:hydration:end") },
    splash: {
      mountMs: splashMount,
      fadeStartMs: splashFade,
      completeMs: splashComplete,
      visibleMs: splashMount !== null && splashFade !== null ? splashFade - splashMount : null,
      totalBlockingMs:
        splashMount !== null && splashComplete !== null ? splashComplete - splashMount : null,
    },
    assets,
    resourceCount: resources.length,
  };
}

function readReports(): { navigationLog: NavLogEntry[]; profiler: ProfilerSummary[] } {
  const w = window as unknown as {
    __navigationLog?: () => NavLogEntry[];
    __profilerSummaries?: () => ProfilerSummary[];
  };
  return {
    navigationLog: typeof w.__navigationLog === "function" ? w.__navigationLog() : [],
    profiler: typeof w.__profilerSummaries === "function" ? w.__profilerSummaries() : [],
  };
}

test.describe.configure({ mode: "serial" });

test("capture runtime performance baseline", async ({ page }) => {
  test.setTimeout(120_000);

  // ── Cold load: /board ────────────────────────────────────────────────────────
  await page.goto("/board");
  await expect(page.locator("aside")).toBeVisible();
  await expect(page.locator("h3:has-text('Backlog')")).toBeVisible({ timeout: 15_000 });
  await page.waitForLoadState("networkidle");
  const boardCold = await page.evaluate(collectPageSnapshot, "/board (cold load)");

  // ── Client-side navigation sequence: board → list → dashboard → board ─────────
  await page.locator('a[href="/list"]').first().click();
  await expect(page.locator("th:has-text('Title')")).toBeVisible({ timeout: 15_000 });

  await page.locator('a[href="/dashboard"]').first().click();
  await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForLoadState("networkidle");

  await page.locator('a[href="/board"]').first().click();
  await expect(page.locator("h3:has-text('Backlog')")).toBeVisible({ timeout: 15_000 });

  const afterSpaSequence = await page.evaluate(readReports);

  // ── Detail routes: read sample IDs from the isolated Playwright DB ─────────────
  const sampleDbPath = path.join(process.cwd(), ".playwright-xdg/data/brain-dump/brain-dump.db");
  const sampleDb = new Database(sampleDbPath, { readonly: true, fileMustExist: true });
  const epicId = (
    sampleDb.prepare("SELECT id FROM epics LIMIT 1").get() as { id: string } | undefined
  )?.id;
  const ticketId = (
    sampleDb.prepare("SELECT id FROM tickets ORDER BY position LIMIT 1").get() as
      | { id: string }
      | undefined
  )?.id;
  sampleDb.close();

  // Fail loudly on a broken precondition rather than emitting a green run with null
  // detail-route data the reader might transcribe or overlook.
  expect(epicId, "No epics in the Playwright DB — was first-launch sample data seeded?").toBeTruthy();
  expect(
    ticketId,
    "No tickets in the Playwright DB — was first-launch sample data seeded?"
  ).toBeTruthy();

  let epicDetail: PageSnapshot | null = null;
  let ticketDetail: PageSnapshot | null = null;

  if (epicId) {
    await page.goto(`/epic/${epicId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: 15_000 });
    await page.waitForLoadState("networkidle");
    epicDetail = await page.evaluate(collectPageSnapshot, "/epic/$id (cold load)");
  }

  if (ticketId) {
    await page.goto(`/ticket/${ticketId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: 15_000 });
    await page.waitForLoadState("networkidle");
    ticketDetail = await page.evaluate(collectPageSnapshot, "/ticket/$id (cold load)");
  }

  const report = {
    capturedAt: new Date().toISOString(),
    dataset: "first-launch sample data (isolated .playwright-xdg)",
    boardCold,
    epicDetail,
    ticketDetail,
    spaNavigationLog: afterSpaSequence.navigationLog,
    profilerSummaries: afterSpaSequence.profiler,
  };

  const outDir = path.join(process.cwd(), "test-results");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "perf-baseline.json"), JSON.stringify(report, null, 2));

  // Logged so the numbers can be transcribed into the committed baseline doc.
  console.log("PERF_BASELINE_JSON_START");
  console.log(JSON.stringify(report, null, 2));
  console.log("PERF_BASELINE_JSON_END");

  // Sanity assertions — capture must have produced real timing data.
  expect(boardCold.navTiming.loadEventMs).toBeGreaterThan(0);
  expect(boardCold.assets.length).toBeGreaterThan(0);
  expect(afterSpaSequence.navigationLog.length).toBeGreaterThan(0);
  expect(
    afterSpaSequence.profiler.length,
    "Profiler summaries are empty — is the dev build running with React Profiler instrumentation?"
  ).toBeGreaterThan(0);
});
