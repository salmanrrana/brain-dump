import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Dedicated Playwright config for the PRODUCTION performance gate.
 *
 * Unlike playwright.config.ts (which runs the DEV server), this builds the app
 * and serves it through `vite preview` — the real Nitro production server — so
 * the perf assertions see production chunking, no DEV-only instrumentation, and
 * the same `window.__perfReport()` web-vitals signal real users get.
 *
 * Runs only e2e/perf-production.spec.ts. The dev-only render-count spec
 * (e2e/perf-renders.spec.ts) and the rest of the suite run under the default
 * config. A fresh isolated XDG root gives the production server first-launch
 * sample data and keeps it away from the developer's real database.
 *
 * Run: pnpm test:perf
 */
const PERF_PORT = 5175;
const PERF_BASE_URL = `http://localhost:${PERF_PORT}`;
const perfXdgRoot = path.join(process.cwd(), ".playwright-perf-xdg");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /perf-production\.spec\.ts$/,
  // The production server is shared across the spec's flows; run serially.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: PERF_BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Build, then serve the production output through Nitro's preview server.
    command: `pnpm build && pnpm exec vite preview --port ${PERF_PORT} --strictPort`,
    url: PERF_BASE_URL,
    reuseExistingServer: !process.env.CI,
    // Allow time for a cold production build before the preview server answers.
    timeout: 240 * 1000,
    env: {
      PLAYWRIGHT_E2E: "1",
      XDG_DATA_HOME: path.join(perfXdgRoot, "data"),
      XDG_STATE_HOME: path.join(perfXdgRoot, "state"),
    },
  },
});
