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
 *   queryKey: queryKeys.ticketSummaries({ projectId: "abc" }),
 *   queryFn: () => getTicketSummaries({ data: { projectId: "abc" } }),
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
  // NOTE: there is no bare `["projects"]` query. `projectsWithEpics` is the live project-list
  // query. Do NOT invalidate `["projects"]` as a prefix — it also matches `projectDeletePreview`
  // (`["projects", id, "delete-preview"]`) and would wipe an open delete-preview dry-run.
  projectsWithEpics: ["projects", "with-epics"] as const,
  projectDeletePreview: (projectId: string) => ["projects", projectId, "delete-preview"] as const,

  // Epics
  epics: (projectId: string) => ["epics", projectId] as const,
  epicDetail: (epicId: string) => ["epic", epicId] as const,

  // Tickets
  ticket: (ticketId: string) => ["ticket", ticketId] as const,
  ticketDeletePreview: (ticketId: string) => ["ticket", ticketId, "delete-preview"] as const,
  allTickets: ["tickets"] as const,
  ticketSummaries: (filters: TicketFilters) => ["ticket-summaries", filters] as const,
  allTicketSummaries: ["ticket-summaries"] as const,
  projectTicketCounts: ["ticket-counts", "projects"] as const,
  epicTicketCounts: (projectId: string) => ["ticket-counts", "epics", projectId] as const,

  // Tags
  tags: (filters: TagFilters) => ["tags", filters] as const,
  tagsWithMetadata: (filters: TagFilters) => ["tags", "with-metadata", filters] as const,
  allTags: ["tags"] as const,

  // Search
  search: (query: string, projectId?: string) => ["search", query, projectId] as const,

  // Comments
  comments: (ticketId: string) => ["comments", ticketId] as const,
  paginatedComments: (ticketId: string) => ["comments", ticketId, "paginated"] as const,

  // Settings
  settings: ["settings"] as const,
  availableTerminals: ["available-terminals"] as const,
  dockerStatus: ["docker-status"] as const,

  // Docker runtime detection
  dockerRuntimes: ["dockerRuntimes"] as const,
  activeDockerRuntime: ["activeDockerRuntime"] as const,

  // Active Ralph sessions
  activeRalphSessions: ["activeRalphSessions"] as const,

  // Ralph container monitoring (hierarchical for easy invalidation)
  ralph: {
    all: ["ralph"] as const,
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
    all: ["cost"] as const,
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

  // Code changes
  codeChangeSummary: (scopeType: "ticket" | "epic", scopeId: string) =>
    ["codeChanges", "summary", scopeType, scopeId] as const,
  codeChangePatch: (params: {
    scopeType: "ticket" | "epic";
    scopeId: string;
    ticketId?: string;
    sourceId?: string;
    filePath?: string;
    ignoreWhitespace?: boolean;
  }) => ["codeChanges", "patch", params] as const,
};
