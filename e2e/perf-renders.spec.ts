import { test, expect, type Page } from "@playwright/test";
import { loadPerfBudgets } from "../scripts/perf-budgets";

/**
 * Render-smoothness gate (DEV build).
 *
 * The React `<Profiler>` and navigation-timing instrumentation
 * (`window.__profilerReport()` / `window.__profilerSummaries()` /
 * `window.__navigationReport()` / `window.__navigationLog()`) is gated behind
 * `import.meta.env.DEV`, so this spec runs under the DEV server (the default
 * playwright.config.ts) rather than the production preview.
 *
 * It scrolls the board and asserts the Board component's render count stays
 * within the budget in docs/performance/perf-budgets.json — catching render
 * storms (e.g. an effect or context change re-rendering the whole board on
 * every scroll/drag tick) that bundle size alone can't see.
 *
 * Run: pnpm test:e2e perf-renders
 */

const { runtime } = loadPerfBudgets();

interface ProfilerSummary {
  id: string;
  renderCount: number;
}

// These run in the browser AFTER assertInstrumentationExposed has confirmed the
// globals exist. They THROW (rather than return []) if a global is missing, so a
// stripped instrumentation build fails loudly instead of letting a downstream
// assertion pass vacuously against an empty collection.
function readProfilerSummaries(): ProfilerSummary[] {
  const w = window as unknown as { __profilerSummaries?: () => ProfilerSummary[] };
  if (typeof w.__profilerSummaries !== "function") {
    throw new Error("window.__profilerSummaries is unavailable — DEV instrumentation not exposed.");
  }
  return w.__profilerSummaries();
}

function readNavigationLog(): { route: string; fetches: unknown[] }[] {
  const w = window as unknown as {
    __navigationLog?: () => { route: string; fetches: unknown[] }[];
  };
  if (typeof w.__navigationLog !== "function") {
    throw new Error("window.__navigationLog is unavailable — DEV instrumentation not exposed.");
  }
  return w.__navigationLog();
}

/** Confirm the DEV-only instrumentation globals are actually present. */
async function assertInstrumentationExposed(page: Page) {
  const exposed = await page.evaluate(() => ({
    profilerReport: typeof (window as unknown as Record<string, unknown>).__profilerReport,
    profilerSummaries: typeof (window as unknown as Record<string, unknown>).__profilerSummaries,
    navigationReport: typeof (window as unknown as Record<string, unknown>).__navigationReport,
    navigationLog: typeof (window as unknown as Record<string, unknown>).__navigationLog,
  }));
  expect(exposed.profilerReport, "window.__profilerReport missing in DEV build").toBe("function");
  expect(exposed.profilerSummaries).toBe("function");
  expect(exposed.navigationReport, "window.__navigationReport missing in DEV build").toBe(
    "function"
  );
  expect(exposed.navigationLog).toBe("function");
}

test.describe.configure({ mode: "serial" });

test("board render count stays within budget during a scroll session", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("/board");
  await expect(page.locator("aside")).toBeVisible();
  await expect(page.locator("h3:has-text('Backlog')")).toBeVisible({ timeout: 15_000 });
  await page.waitForLoadState("networkidle");

  await assertInstrumentationExposed(page);

  // Scroll the board several times to exercise re-renders during interaction.
  const board = page.locator("main").first();
  await board.hover();
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(80);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(200);

  const summaries = await page.evaluate(readProfilerSummaries);
  const board1 = summaries.find((entry) => entry.id === "Board");
  expect(
    board1,
    "No 'Board' profiler summary — is the Board wrapped in <Profiler id=\"Board\">?"
  ).toBeTruthy();
  expect(
    board1!.renderCount,
    `Board rendered ${board1!.renderCount} times during a scroll session; budget is ${runtime.boardRenderCountCeiling}. A render storm regressed interaction smoothness.`
  ).toBeLessThanOrEqual(runtime.boardRenderCountCeiling);

  // Warm re-navigation back to an already-visited route should not refetch data.
  await page.locator('a[href="/list"]').first().click();
  await expect(page.locator("th:has-text('Title')")).toBeVisible({ timeout: 15_000 });
  await page.locator('a[href="/board"]').first().click();
  await expect(page.locator("h3:has-text('Backlog')")).toBeVisible({ timeout: 15_000 });

  const navLog = await page.evaluate(readNavigationLog);
  const warmBoardNav = [...navLog].reverse().find((entry) => entry.route === "board");
  expect(warmBoardNav, "No 'board' navigation entry recorded by the instrumentation").toBeTruthy();
  expect(
    warmBoardNav!.fetches.length,
    "Warm re-navigation to /board issued loader data fetch(es); a visited route should serve from cache."
  ).toBeLessThanOrEqual(runtime.warmRenavMaxLoaderFetches);
});
