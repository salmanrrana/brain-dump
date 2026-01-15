/**
 * Vitest Setup File for MSW
 *
 * This file is loaded before all tests to set up the MSW mock server.
 * It ensures network requests are intercepted consistently across all tests.
 *
 * Note: For TanStack Start server functions, you may also need to mock
 * the actual functions using vi.mock() since they don't always go through HTTP.
 */

import { beforeAll, afterEach, afterAll } from "vitest";
import { server, resetMockDataStore } from "./server";

// Start MSW server before all tests
// 'error' mode throws if any request isn't handled - helps catch missing handlers
beforeAll(() => {
  server.listen({
    onUnhandledRequest: "warn", // Use 'warn' instead of 'error' to avoid breaking existing tests
  });
});

// Reset handlers and data store after each test for isolation
afterEach(() => {
  server.resetHandlers();
  resetMockDataStore();
});

// Clean up after all tests complete
afterAll(() => {
  server.close();
});
