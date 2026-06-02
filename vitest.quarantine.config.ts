import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    setupFiles: ["./src/mocks/vitest.setup.ts"],
    globals: true,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    testTimeout: 30000,
    hookTimeout: 15000,
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
          name: "quarantine-node",
          environment: "node",
          include: [
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
          ],
          exclude: ["**/node_modules/**", "**/.opencode/**", "**/vendor/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "quarantine-dom",
          environment: "jsdom",
          include: [
            "src/components/TicketModal.telemetry.test.tsx",
            "src/components/tickets/CreateTicketModal.test.tsx",
            "src/components/tickets/LaunchActions.test.tsx",
          ],
          exclude: ["**/node_modules/**", "**/.opencode/**", "**/vendor/**"],
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
