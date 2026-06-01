import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

const quarantineTests = [
  "cli/__tests__/cli-integration.test.ts",
  "cli/__tests__/workflow-launch-wiring.test.ts",
  "mcp-server/__tests__/cross-environment.test.ts",
  "mcp-server/tools/__tests__/workflow-e2e.test.ts",
  "mcp-server/tools/__tests__/status-transitions.test.ts",
  "scripts/repair-migrations.test.ts",
  "scripts/setup-vscode.test.ts",
  "src/api/docker-integration.test.ts",
  "src/api/ralph-docker.test.ts",
  "src/api/ralph-e2e.test.ts",
  "src/lib/db-bootstrap.test.ts",
  "src/components/TicketModal.telemetry.test.tsx",
  "src/components/tickets/LaunchActions.test.tsx",
  "src/components/tickets/CreateTicketModal.test.tsx",
];

const browserHarnessTests = [
  "src/lib/keyboard-shortcuts.test.ts",
  "src/lib/modal-hooks.test.ts",
  "src/mocks/msw.test.ts",
];

const defaultExclude = [
  "**/e2e/**",
  "**/node_modules/**",
  "**/integration-tests/**",
  "**/.opencode/**",
  "**/vendor/**",
  ...quarantineTests,
];

export default defineConfig({
  plugins: [react()],
  test: {
    setupFiles: ["./src/mocks/vitest.setup.ts"],
    globals: true,
    pool: "threads",
    poolOptions: {
      threads: {
        maxThreads: 4,
        minThreads: 1,
      },
    },
    teardownTimeout: 5000,
    env: {
      BRAIN_DUMP_DISABLE_DB_STARTUP_TASKS: "1",
      XDG_DATA_HOME: path.resolve(__dirname, ".vitest-xdg/data"),
      XDG_STATE_HOME: path.resolve(__dirname, ".vitest-xdg/state"),
    },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["**/*.test.ts"],
          exclude: [...defaultExclude, ...browserHarnessTests],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.test.tsx", ...browserHarnessTests],
          exclude: defaultExclude,
          testTimeout: 10000,
        },
      },
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
