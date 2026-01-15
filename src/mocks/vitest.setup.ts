/**
 * Vitest Setup File for MSW and React Testing
 *
 * This file is loaded before all tests to set up:
 * - MSW mock server for network requests
 * - React testing environment with jsdom
 * - Jest DOM matchers for Testing Library
 *
 * Note: For TanStack Start server functions, you may also need to mock
 * the actual functions using vi.mock() since they don't always go through HTTP.
 */

import { beforeAll, afterEach, afterAll, vi } from "vitest";
import { server, resetMockDataStore } from "./server";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";

// Mock window.matchMedia for components that use media queries
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

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

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
  cleanup(); // Clean up React components after each test
});

// Clean up after all tests complete
afterAll(() => {
  server.close();
});
