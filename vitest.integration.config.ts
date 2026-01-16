/**
 * Vitest Integration Test Configuration
 *
 * This configuration is for running Ralph E2E integration tests SEPARATELY
 * from the regular unit test suite. These tests:
 * - Use real SQLite databases (not mocks)
 * - Create actual git repositories
 * - Test the full Ralph workflow end-to-end
 *
 * Run with: pnpm test:integration
 */
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Only include integration tests
    include: ["integration-tests/**/*.test.ts"],
    // Don't exclude anything in integration-tests
    exclude: ["**/node_modules/**"],
    // No MSW setup - we use real databases
    setupFiles: [],
    // Node environment for file system and git operations
    environment: "node",
    globals: true,
    // Use threads pool for integration tests
    pool: "threads",
    poolOptions: {
      threads: {
        // Run sequentially to avoid conflicts with temp directories
        singleThread: true,
      },
    },
    // Longer timeout for integration tests that do real I/O
    testTimeout: 30000,
    hookTimeout: 15000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
