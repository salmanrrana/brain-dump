import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/** Dedicated port + isolated XDG dirs so E2E always gets first-launch sample tickets. */
const PLAYWRIGHT_PORT = 5174;
const PLAYWRIGHT_BASE_URL = `http://localhost:${PLAYWRIGHT_PORT}`;
const playwrightXdgRoot = path.join(process.cwd(), ".playwright-xdg");

const config: Parameters<typeof defineConfig>[0] = {
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
};

if (process.env.CI) {
  config.workers = 1;
}

export default defineConfig({
  ...config,
  use: {
    baseURL: PLAYWRIGHT_BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm exec vite dev --port ${PLAYWRIGHT_PORT}`,
    url: PLAYWRIGHT_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      PLAYWRIGHT_E2E: "1",
      XDG_DATA_HOME: path.join(playwrightXdgRoot, "data"),
      XDG_STATE_HOME: path.join(playwrightXdgRoot, "state"),
    },
  },
});
