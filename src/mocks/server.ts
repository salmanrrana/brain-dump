/**
 * MSW Node Server for Testing
 *
 * This sets up the MSW server for Node.js test environment (Vitest).
 * Import this in your test setup file.
 *
 * Usage in vitest.setup.ts:
 * ```
 * import { server } from './src/mocks/server';
 *
 * beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
 * afterEach(() => server.resetHandlers());
 * afterAll(() => server.close());
 * ```
 */

import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/**
 * MSW server instance for tests
 * Intercepts network requests matching the handlers
 */
export const server = setupServer(...handlers);

// Re-export utilities from handlers for convenience
export { resetMockDataStore, getMockDataStore, setMockDataStore } from "./handlers";
