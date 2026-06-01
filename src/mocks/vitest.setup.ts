/**
 * Vitest setup shared by node and DOM projects.
 *
 * Node tests only get isolated Brain Dump data directories. DOM tests also get
 * MSW, Testing Library cleanup, jest-dom matchers, and browser API shims.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

const hasDom = typeof window !== "undefined";
const disableDbStartupTasks = process.env.BRAIN_DUMP_DISABLE_DB_STARTUP_TASKS === "1";

if (disableDbStartupTasks && process.env.XDG_DATA_HOME && process.env.XDG_STATE_HOME) {
  const dataDir = join(process.env.XDG_DATA_HOME, "brain-dump");
  const stateDir = join(process.env.XDG_STATE_HOME, "brain-dump");
  const dbPath = join(dataDir, "brain-dump.db");

  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  mkdirSync(join(stateDir, "backups"), { recursive: true, mode: 0o700 });
  mkdirSync(join(stateDir, "logs"), { recursive: true, mode: 0o700 });

  if (!existsSync(dbPath)) {
    writeFileSync(dbPath, "");
  }
}

if (hasDom) {
  const [{ cleanup }, { resetMockDataStore, server }] = await Promise.all([
    import("@testing-library/react"),
    import("./server"),
    import("@testing-library/jest-dom/vitest"),
  ]);

  // Mock window.matchMedia for components that use media queries.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));

  beforeAll(() => {
    server.listen({
      onUnhandledRequest: "warn",
    });
  });

  afterEach(() => {
    server.resetHandlers();
    resetMockDataStore();
    cleanup();
  });

  afterAll(() => {
    server.close();
  });
}
