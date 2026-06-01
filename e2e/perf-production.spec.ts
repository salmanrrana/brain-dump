import path from "node:path";
import Database from "better-sqlite3";
import { test, expect, type Page, type Request } from "@playwright/test";
import { loadPerfBudgets, resolveCeilingBytes } from "../scripts/perf-budgets";

/**
 * Production performance gate (browser-flow assertions).
 *
 * Runs against the PRODUCTION build served by `vite preview` (see
 * playwright.perf.config.ts), navigating board → list → dashboard → epic →
 * ticket and asserting the budgets in docs/performance/perf-budgets.json:
 *
 *   (a) No `devtools` chunk is loaded for real users.
 *   (b) No loaded script exceeds its uncompressed budget.
 *   (c) LCP / CLS / INP / TTFB stay within the web-vitals "good" thresholds,
 *       read from the production `window.__perfReport()` signal.
 *   (d) Navigating back to an already-visited route triggers no loader data
 *       refetch and no full-page document reload.
 *
 * Run: pnpm test:perf
 */

const budgets = loadPerfBudgets();
const { runtime } = budgets;

interface LoadedScript {
  url: string;
  /** Uncompressed bytes, from Resource Timing `decodedBodySize`. */
  decodedBodySize: number;
}

/** Read the uncompressed size of every script the browser has loaded so far. */
function collectScriptResources(): { url: string; decodedBodySize: number }[] {
  return (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
    .filter((entry) => entry.initiatorType === "script" || /\.m?js(\?|$)/.test(entry.name))
    .map((entry) => ({ url: entry.name, decodedBodySize: entry.decodedBodySize }));
}

function isDataRequest(request: Request): boolean {
  const type = request.resourceType();
  if (type === "fetch" || type === "xhr") return true;
  // TanStack Start server functions are POSTed to /_serverFn/*.
  return request.url().includes("_serverFn");
}

async function readPerfReport(page: Page) {
  return page.evaluate(() => {
    const report = (window as unknown as Record<string, unknown>).__perfReport;
    return typeof report === "function"
      ? (report as () => Record<string, { value: number; rating: string } | null>)()
      : null;
  });
}

test.describe.configure({ mode: "serial" });

test("production build stays within performance budgets across the hot-path flow", async ({
  page,
}) => {
  test.setTimeout(120_000);

  // Every script the browser requests during the whole flow, by URL.
  const loadedScripts = new Map<string, LoadedScript>();
  const mergeLoadedScripts = async () => {
    const entries = await page.evaluate(collectScriptResources);
    for (const entry of entries) {
      // Cached re-requests report decodedBodySize 0 — keep the largest observation.
      const existing = loadedScripts.get(entry.url);
      if (!existing || entry.decodedBodySize > existing.decodedBodySize) {
        loadedScripts.set(entry.url, entry);
      }
    }
  };

  // ── Cold load: /board ────────────────────────────────────────────────────────
  await page.goto("/board");
  await expect(page.locator("aside")).toBeVisible();
  await expect(page.locator("h3:has-text('Backlog')")).toBeVisible({ timeout: 15_000 });
  await page.waitForLoadState("networkidle");
  await mergeLoadedScripts();

  // A real interaction finalizes the LCP candidate (web-vitals reports LCP on the
  // first user input or when the page is hidden) before we read the report.
  await page.locator("h3:has-text('Backlog')").click();
  await page.waitForTimeout(200);

  // ── SPA navigation: board → list → dashboard → board ─────────────────────────
  await page.locator('a[href="/list"]').first().click();
  await expect(page.locator("th:has-text('Title')")).toBeVisible({ timeout: 15_000 });
  await mergeLoadedScripts();

  await page.locator('a[href="/dashboard"]').first().click();
  await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForLoadState("networkidle");
  await mergeLoadedScripts();

  // ── (d) Warm re-nav: returning to the already-visited /board must not refetch ──
  const warmRequests: string[] = [];
  let warmDocumentReload = false;
  const onWarmRequest = (request: Request) => {
    if (request.resourceType() === "document") warmDocumentReload = true;
    if (isDataRequest(request)) warmRequests.push(request.url());
  };
  page.on("request", onWarmRequest);
  await page.locator('a[href="/board"]').first().click();
  await expect(page.locator("h3:has-text('Backlog')")).toBeVisible({ timeout: 15_000 });
  await page.waitForLoadState("networkidle");
  page.off("request", onWarmRequest);
  await mergeLoadedScripts();

  // The literal "no full-page data refetch": the visited route renders from the
  // SPA cache, never reloading the document.
  expect(
    warmDocumentReload,
    "Returning to /board triggered a full-page document reload — SPA navigation regressed."
  ).toBe(false);
  // Stricter network-level ceiling. A small background revalidation is tolerated
  // (see warmRenavMaxDataRequests in perf-budgets.json); a refetch storm is not.
  expect(
    warmRequests.length,
    `Returning to the already-visited /board triggered ${warmRequests.length} data request(s); budget is ${runtime.warmRenavMaxDataRequests}. URLs: ${warmRequests.join(", ")}`
  ).toBeLessThanOrEqual(runtime.warmRenavMaxDataRequests);

  // ── Detail routes: read sample IDs from the isolated production DB ────────────
  const sampleDbPath = path.join(
    process.cwd(),
    ".playwright-perf-xdg/data/brain-dump/brain-dump.db"
  );
  const sampleDb = new Database(sampleDbPath, { readonly: true, fileMustExist: true });
  const epicId = (sampleDb.prepare("SELECT id FROM epics LIMIT 1").get() as { id: string })?.id;
  const ticketId = (
    sampleDb.prepare("SELECT id FROM tickets ORDER BY position LIMIT 1").get() as { id: string }
  )?.id;
  sampleDb.close();
  expect(epicId, "No epics in the production sample DB — was first-launch seed run?").toBeTruthy();
  expect(ticketId, "No tickets in the production sample DB.").toBeTruthy();

  await page.goto(`/epic/${epicId}`);
  await expect(page.locator("aside")).toBeVisible({ timeout: 15_000 });
  await page.waitForLoadState("networkidle");
  await mergeLoadedScripts();

  await page.goto(`/ticket/${ticketId}`);
  await expect(page.locator("aside")).toBeVisible({ timeout: 15_000 });
  await page.waitForLoadState("networkidle");
  await mergeLoadedScripts();

  // ── (a) No devtools chunk loaded for real users (no-regression ratchet) ───────
  // TARGET is 0. Today exactly 1 loads — Vite preloads __root.tsx's DEV-gated
  // devtools dynamic-import target even in prod (bundle hygiene owned by the
  // Instant First Load epic; see maxForbiddenChunksLoaded in perf-budgets.json).
  // The ratchet still fails on ANY new/additional devtools chunk leaking in.
  const forbidden = runtime.forbiddenRuntimeChunkUrls;
  const devtoolsScripts = [...loadedScripts.keys()].filter((url) =>
    forbidden.some((needle) => url.toLowerCase().includes(needle.toLowerCase()))
  );
  expect(
    devtoolsScripts.length,
    `Production loaded ${devtoolsScripts.length} devtools chunk(s) (ratchet ${runtime.maxForbiddenChunksLoaded}, target 0): ${devtoolsScripts.join(", ")}`
  ).toBeLessThanOrEqual(runtime.maxForbiddenChunksLoaded);

  // ── (b) No loaded script over its uncompressed budget ────────────────────────
  // Scripts that were preloaded but never decoded (or served from cache) report
  // decodedBodySize 0; they cannot be size-checked here. Surface them so a large
  // speculative preload cannot silently slip past the size budget — the bundle
  // gate (pnpm perf:check) checks every emitted chunk on disk regardless.
  const zeroSizeScripts = [...loadedScripts.values()].filter((s) => s.decodedBodySize === 0);
  if (zeroSizeScripts.length > 0) {
    console.warn(
      `[perf] ${zeroSizeScripts.length} loaded script(s) had decodedBodySize=0 (preloaded/cached) and are size-checked only by pnpm perf:check, not here: ${zeroSizeScripts
        .map((s) => s.url.split("/").pop())
        .join(", ")}`
    );
  }
  const overBudget = [...loadedScripts.values()]
    .filter((script) => script.decodedBodySize > 0)
    .map((script) => {
      const name = script.url.split("/").pop() ?? script.url;
      return { name, size: script.decodedBodySize, ceiling: resolveCeilingBytes(name, budgets.bundle) };
    })
    .filter((script) => script.size > script.ceiling);
  expect(
    overBudget,
    `Loaded script(s) over budget: ${overBudget
      .map((s) => `${s.name} ${(s.size / 1024).toFixed(1)}kB > ${(s.ceiling / 1024).toFixed(1)}kB`)
      .join("; ")}`
  ).toHaveLength(0);

  // Sanity: the flow actually loaded the production bundle.
  expect([...loadedScripts.keys()].some((url) => /\/main-/.test(url))).toBe(true);

  // ── (c) Web Vitals within "good" thresholds (production __perfReport) ─────────
  const report = await readPerfReport(page);
  expect(report, "window.__perfReport() is unavailable in the production build").not.toBeNull();
  const vitals = report!;

  // TTFB always fires on navigation, so it is a REQUIRED, non-null assertion —
  // this is what guarantees the web-vitals signal is genuinely wired in prod.
  const ttfb = vitals.TTFB;
  expect(ttfb, "TTFB was never reported by web-vitals (is registerWebVitals wired?)").not.toBeNull();
  expect(ttfb!.value).toBeLessThanOrEqual(runtime.ttfbMs);

  // LCP/CLS/INP only finalize on interaction or page-hide, so they may be null in
  // a short headless run. They are asserted ONLY when reported (advisory gate),
  // against the same documented thresholds; this keeps the gate deterministic.
  if (vitals.LCP) expect(vitals.LCP.value).toBeLessThanOrEqual(runtime.lcpMs);
  if (vitals.CLS) expect(vitals.CLS.value).toBeLessThanOrEqual(runtime.clsScore);
  if (vitals.INP) expect(vitals.INP.value).toBeLessThanOrEqual(runtime.inpMs);
});
