/**
 * Centralized query key factories for TanStack Query.
 *
 * This module contains all query keys used throughout the application.
 * Using centralized query keys ensures:
 * - Consistent cache invalidation patterns
 * - Type-safe query key generation
 * - Easy discovery of all cached data types
 *
 * @example
 * // In a component
 * import { queryKeys } from "../lib/query-keys";
 *
 * const { data } = useQuery({
 *   queryKey: queryKeys.tickets({ projectId: "abc" }),
 *   queryFn: () => fetchTickets({ projectId: "abc" }),
 * });
 *
 * // Invalidate all tickets
 * queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
 */

import type { TicketFilters } from "../api/tickets";
import type { TagFilters } from "../api/tags";
import type { CostExplorerParams } from "../api/cost";

export const queryKeys = {
  // Projects
  projects: ["projects"] as const,
  projectsWithEpics: ["projects", "with-epics"] as const,
  projectDeletePreview: (projectId: string) => ["projects", projectId, "delete-preview"] as const,

  // Epics
  epics: (projectId: string) => ["epics", projectId] as const,
  epicDetail: (epicId: string) => ["epic", epicId] as const,

  // Tickets
  tickets: (filters: TicketFilters) => ["tickets", filters] as const,
  allTickets: ["tickets"] as const,

  // Tags
  tags: (filters: TagFilters) => ["tags", filters] as const,
  tagsWithMetadata: (filters: TagFilters) => ["tags", "with-metadata", filters] as const,
  allTags: ["tags"] as const,

  // Search
  search: (query: string, projectId?: string) => ["search", query, projectId] as const,

  // Settings
  settings: ["settings"] as const,
  availableTerminals: ["available-terminals"] as const,

  // Docker runtime detection
  dockerRuntimes: ["dockerRuntimes"] as const,
  activeDockerRuntime: ["activeDockerRuntime"] as const,

  // Docker availability (for UI buttons)
  dockerAvailability: ["docker-availability"] as const,

  // Ralph container monitoring (hierarchical for easy invalidation)
  ralph: {
    all: ["ralph"] as const,
    dockerAvailable: () => ["ralph", "dockerAvailable"] as const,
    containers: () => ["ralph", "containers"] as const,
    containerLogs: (containerName: string, tail: number) =>
      ["ralph", "containerLogs", containerName, tail] as const,
    containerStats: (containerNames?: string[]) =>
      ["ralph", "containerStats", containerNames ?? "all"] as const,
    events: (sessionId: string) => ["ralph", "events", sessionId] as const,
  },

  // Project services
  projectServices: (projectPath: string) => ["projectServices", projectPath] as const,

  // Analytics
  analytics: {
    dashboard: () => ["analytics", "dashboard"] as const,
  },

  // Cost
  cost: {
    dashboardAnalytics: () => ["cost", "dashboardAnalytics"] as const,
    ticketCost: (ticketId: string) => ["cost", "ticket", ticketId] as const,
    epicCost: (epicId: string) => ["cost", "epic", epicId] as const,
    models: () => ["cost", "models"] as const,
    explorer: (params?: CostExplorerParams) => ["cost", "explorer", params ?? {}] as const,
    ticketDetail: (ticketId: string) => ["cost", "ticket-detail", ticketId] as const,
  },

  // Telemetry
  telemetry: {
    stats: (ticketId: string) => ["telemetry", "stats", ticketId] as const,
    latestSession: (ticketId: string) => ["telemetry", "latestSession", ticketId] as const,
    sessions: (ticketId: string) => ["telemetry", "sessions", ticketId] as const,
    dashboardAnalytics: () => ["telemetry", "dashboardAnalytics"] as const,
  },

  // Claude Tasks
  claudeTasks: (ticketId: string) => ["claudeTasks", ticketId] as const,

  // Demo Scripts
  demoScript: (ticketId: string) => ["demoScript", ticketId] as const,

  // Workflow State
  workflowState: (ticketId: string) => ["workflowState", ticketId] as const,

  // Development Hub
  editors: ["editors"] as const,
  devCommands: (projectPath: string) => ["devCommands", projectPath] as const,
  gitInfo: (projectPath: string) => ["gitInfo", projectPath] as const,
  gitCommits: (projectPath: string) => ["gitCommits", projectPath] as const,
  gitCommitFileStats: (projectPath: string, hash: string) =>
    ["gitCommitFileStats", projectPath, hash] as const,
};
