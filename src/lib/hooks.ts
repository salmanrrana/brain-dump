/**
 * Re-exports all hooks from the modular hooks directory.
 *
 * This file is kept for backward compatibility. New code should import from
 * the specific module (e.g., `@/lib/hooks/tickets`) for better tree-shaking.
 *
 * Module structure:
 * - hooks/state.ts      - State utility hooks (useAutoClearState, useModalKeyboard, useClickOutside)
 * - hooks/modal.ts      - Modal state management (useModal, ModalState)
 * - hooks/sample-data.ts - Sample data lifecycle (useSampleData)
 * - hooks/tickets.ts    - Ticket CRUD and queries
 * - hooks/projects.ts   - Project and epic CRUD and queries
 * - hooks/settings.ts   - Settings and Docker hooks
 * - hooks/ralph.ts      - Ralph autonomous agent hooks
 * - hooks/comments.ts   - Comments hooks
 * - hooks/claude-tasks.ts - Claude task tracking hooks
 * - hooks/services.ts   - Service discovery hooks
 * - hooks/workflow.ts   - Workflow and demo hooks
 * - hooks/analytics.ts  - Analytics hooks
 * - hooks/index.ts      - Barrel file (this re-export)
 */

export * from "./hooks/index";
