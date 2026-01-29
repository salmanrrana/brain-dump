/**
 * Mock utilities for testing
 *
 * Usage:
 * ```typescript
 * import { createMockProject, createMockTicket } from '@/mocks';
 * import { server, resetServer } from '@/mocks';
 * ```
 */

// Factory functions for creating mock data
export {
  createMockProject,
  createMockEpic,
  createMockTicket,
  createMockComment,
  createMockSettings,
  createMockProjectWithData,
  resetMockCounters,
} from "./factories";

// MSW server and utilities
export {
  server,
  resetServer,
  resetMockDataStore,
  getMockDataStore,
  setMockDataStore,
} from "./server";

// Handlers for extending or overriding in tests
export {
  handlers,
  projectHandlers,
  epicHandlers,
  ticketHandlers,
  commentHandlers,
  type MockDataStore,
} from "./handlers";
