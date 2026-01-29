/**
 * Hooks barrel file - re-exports all hooks for backward compatibility.
 *
 * Components can import from either:
 * - `@/lib/hooks` (this file) for all hooks
 * - Individual modules (e.g., `@/lib/hooks/tickets`) for tree-shaking
 *
 * This file maintains the same public API as the original monolithic hooks.ts.
 */

// =============================================================================
// STATE UTILITY HOOKS
// =============================================================================
export { useAutoClearState, useModalKeyboard, useClickOutside } from "./state";

// =============================================================================
// MODAL HOOKS
// =============================================================================
export { useModal, type ModalState, type UseModalReturn } from "./modal";

// =============================================================================
// FILTER HOOKS (Re-exported from filter-hooks module)
// =============================================================================
export {
  useFiltersWithUrl,
  useFiltersWithUrl as useFilters,
  type Filters,
  type UseFiltersWithUrlReturn,
  type UseFiltersReturn,
} from "../filter-hooks";

// =============================================================================
// SAMPLE DATA HOOKS
// =============================================================================
export { useSampleData, type UseSampleDataReturn } from "./sample-data";

// =============================================================================
// TICKET HOOKS
// =============================================================================
export {
  useInvalidateQueries,
  useCreateTicket,
  useUpdateTicket,
  useUpdateTicketStatus,
  useUpdateTicketPosition,
  useDeleteTicket,
  useTicketDeletePreview,
  useTickets,
  useSearch,
  useTags,
  type Ticket,
  type StatusChange,
  type SearchResult,
} from "./tickets";

// =============================================================================
// PROJECT & EPIC HOOKS
// =============================================================================
export {
  useProjects,
  useProjectsWithAIActivity,
  useEpicWorktreeStates,
  useAllEpicWorktreeStates,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useProjectDeletePreview,
  useCreateEpic,
  useUpdateEpic,
  useDeleteEpic,
  type Epic,
  type EpicWorktreeState,
  type Project,
  type ProjectBase,
  type ProjectWithEpics,
  type ProjectWithAIActivity,
} from "./projects";

// =============================================================================
// SETTINGS & DOCKER HOOKS
// =============================================================================
export {
  useSettings,
  useUpdateSettings,
  useAvailableTerminals,
  useDockerStatus,
  useBuildSandboxImage,
  useDockerAvailability,
  useAvailableDockerRuntimes,
  useActiveDockerRuntime,
  type Settings,
  type DockerStatus,
} from "./settings";

// =============================================================================
// RALPH HOOKS
// =============================================================================
export {
  useLaunchRalphForTicket,
  useLaunchRalphForEpic,
  useActiveRalphSessions,
  useLaunchProjectInception,
  useLaunchSpecBreakdown,
  useRalphEvents,
  useDockerAvailable,
  useRalphContainers,
  useRalphContainerLogs,
  useContainerStats,
  type ActiveRalphSession,
  type ParsedRalphEvent,
  type ContainerStats,
  type ContainerStatsResult,
} from "./ralph";

// =============================================================================
// COMMENTS HOOKS
// =============================================================================
export {
  useComments,
  useCreateComment,
  useDeleteComment,
  type Comment,
  type CreateCommentInput,
} from "./comments";

// =============================================================================
// CLAUDE TASKS HOOKS
// =============================================================================
export { useClaudeTasks, type ClaudeTask, type ClaudeTaskStatus } from "./claude-tasks";

// =============================================================================
// SERVICE DISCOVERY HOOKS
// =============================================================================
export {
  useProjectServices,
  useStartService,
  useStopService,
  useStopAllServices,
  type RalphServicesFile,
  type RalphService,
} from "./services";

// =============================================================================
// WORKFLOW & DEMO HOOKS
// =============================================================================
export {
  useDemoScript,
  useUpdateDemoStep,
  useSubmitDemoFeedback,
  useWorkflowState,
  type DemoScript,
  type UpdateDemoStepInput,
  type SubmitDemoFeedbackInput,
  type UseWorkflowStateResult,
  type WorkflowDisplayState,
  type WorkflowDisplayResult,
  type DemoStep,
} from "./workflow";

// =============================================================================
// ANALYTICS HOOKS
// =============================================================================
export { useDashboardAnalytics } from "./analytics";

// =============================================================================
// QUERY KEYS (Re-exported for backward compatibility)
// =============================================================================
export { queryKeys } from "../query-keys";
