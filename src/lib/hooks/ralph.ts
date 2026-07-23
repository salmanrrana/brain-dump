/**
 * Ralph autonomous agent hooks.
 * Includes queries and mutations for launching and monitoring Ralph sessions.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  launchRalphForTicket,
  launchRalphForEpic,
  getActiveRalphSessions,
  clearActiveSessionsForProject,
  type ActiveRalphSession,
  type RalphEpicLaunchProfile,
} from "../../api/ralph";
import {
  listRalphContainers,
  getRalphContainerLogs,
  getRalphContainerStats,
} from "../../api/services";
import { getDockerStatus } from "../../api/settings";
import type { ContainerStats, ContainerStatsResult } from "../../api/docker-utils";
import { queryKeys } from "../query-keys";
import type { ConcreteLaunchModelSelection } from "../launch-model-catalog";

// Re-export types for components
export type { ActiveRalphSession, ContainerStats, ContainerStatsResult };

// =============================================================================
// RALPH LAUNCH HOOKS
// =============================================================================

// Hook for launching Ralph on a single ticket
export function useLaunchRalphForTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      ticketId: string;
      maxIterations?: number;
      preferredTerminal?: string | null;
      useSandbox?: boolean;
      aiBackend?: "claude" | "opencode" | "codex" | "cursor-agent" | "pi";
      modelSelection?: ConcreteLaunchModelSelection;
      reviewerAiBackend?: "claude" | "opencode" | "codex" | "cursor-agent" | "pi";
      reviewerModelSelection?: ConcreteLaunchModelSelection;
      workingMethodOverride?:
        | "auto"
        | "claude-code"
        | "vscode"
        | "opencode"
        | "cursor"
        | "cursor-agent"
        | "copilot-cli"
        | "codex"
        | "pi";
    }) => launchRalphForTicket({ data }),
    onSuccess: () => {
      // Ticket status will be updated by Ralph, invalidate to reflect changes
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTicketSummaries });
    },
  });
}

// Hook for launching Ralph on an entire epic
export function useLaunchRalphForEpic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      epicId: string;
      maxIterations?: number;
      preferredTerminal?: string | null;
      useSandbox?: boolean;
      aiBackend?: "claude" | "opencode" | "codex" | "cursor-agent" | "pi";
      modelSelection?: ConcreteLaunchModelSelection;
      reviewerAiBackend?: "claude" | "opencode" | "codex" | "cursor-agent" | "pi";
      reviewerModelSelection?: ConcreteLaunchModelSelection;
      workingMethodOverride?:
        | "auto"
        | "claude-code"
        | "vscode"
        | "opencode"
        | "cursor"
        | "cursor-agent"
        | "copilot-cli"
        | "codex"
        | "pi";
      launchProfile?: RalphEpicLaunchProfile;
    }) => launchRalphForEpic({ data }),
    onSuccess: () => {
      // Ticket statuses will be updated by Ralph, invalidate to reflect changes
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTicketSummaries });
    },
  });
}

// =============================================================================
// ACTIVE RALPH SESSIONS HOOK
// =============================================================================

/**
 * Hook for fetching all active Ralph sessions.
 * Returns a map of ticketId -> session for efficient lookup in kanban board.
 *
 * Uses polling to keep the status updated in real-time.
 */
export function useActiveRalphSessions(options: { pollingInterval?: number } = {}) {
  const { pollingInterval = 5000 } = options; // Default: poll every 5 seconds

  const query = useQuery({
    queryKey: queryKeys.activeRalphSessions,
    queryFn: async (): Promise<Record<string, ActiveRalphSession>> => {
      return getActiveRalphSessions();
    },
    // Poll frequently to show real-time status
    refetchInterval: pollingInterval > 0 ? pollingInterval : false,
    staleTime: pollingInterval, // Match polling interval — data refreshes via polling
    refetchOnWindowFocus: false, // Polling handles freshness
  });

  return {
    /** Map of ticketId -> active session (for O(1) lookup) */
    sessions: query.data ?? {},
    /** Check if a ticket has an active Ralph session */
    hasActiveSession: (ticketId: string) => Boolean(query.data?.[ticketId]),
    /** Get the active session for a ticket (if any) */
    getSession: (ticketId: string) => query.data?.[ticketId] ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

// =============================================================================
// CLEAR ACTIVE SESSIONS HOOK
// =============================================================================

/**
 * Hook for clearing all active (stale) Ralph sessions for a project.
 * Marks orphaned sessions as cancelled so the "AI active" badge disappears.
 */
export function useClearActiveSessions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: string) => clearActiveSessionsForProject({ data: projectId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.activeRalphSessions });
    },
  });
}

// =============================================================================
// DOCKER AVAILABILITY
// =============================================================================

/**
 * Hook for checking Docker daemon availability.
 *
 * Reads from the single app-wide `dockerStatus` query (backed by
 * `getDockerStatus`) so the layout, settings, and any other consumer share one
 * cached query and a single poll instead of maintaining a separate
 * Docker-availability query key. The hook polls periodically to detect when
 * Docker starts/stops while the app is open.
 *
 * @param options - Configuration options
 * @returns Docker availability status and query state
 */
export function useDockerAvailable(
  options: {
    /** Whether to enable the query (default: true) */
    enabled?: boolean;
    /** How often to re-check availability in ms (default: 60000ms = 60s) */
    recheckInterval?: number;
  } = {}
) {
  const { enabled = true, recheckInterval = 60000 } = options;

  const query = useQuery({
    queryKey: queryKeys.dockerStatus,
    queryFn: () => getDockerStatus(),
    enabled,
    // Re-check periodically to detect Docker starting/stopping
    refetchInterval: recheckInterval,
    // Don't refetch on window focus - we have periodic checking
    refetchOnWindowFocus: false,
    // Keep stale data while refetching
    staleTime: recheckInterval,
  });

  return {
    /** Whether Docker is installed and the daemon is running */
    available: query.data ? query.data.dockerAvailable && query.data.dockerRunning : false,
    /** Whether the query is loading */
    loading: query.isLoading,
    /** Force a fresh check */
    refetch: query.refetch,
  };
}

// =============================================================================
// RALPH CONTAINER LOGS
// =============================================================================

// Hoisted regex for parsing Ralph iteration info (js-hoist-regexp)
const RALPH_ITERATION_REGEX = /Ralph Iteration (\d+) of (\d+)/g;
const ITERATION_NUMBERS_REGEX = /(\d+) of (\d+)/;

/**
 * Hook for listing running Ralph containers.
 * Polls at configurable intervals to detect when Ralph starts/stops.
 *
 * NOTE: This hook should only be enabled when Docker is available.
 * Use `useDockerAvailable()` to check first, then pass `enabled: dockerAvailable`.
 *
 * @param options - Configuration options
 * @returns List of Ralph containers and query state
 */
export function useRalphContainers(
  options: {
    /** Whether to enable the query (default: true) */
    enabled?: boolean;
    /** Polling interval in ms (default: 3000ms) */
    pollingInterval?: number;
  } = {}
) {
  const { enabled = true, pollingInterval = 3000 } = options;

  const query = useQuery({
    queryKey: queryKeys.ralph.containers(),
    queryFn: listRalphContainers, // Let type be inferred from API function
    enabled,
    refetchInterval: enabled ? pollingInterval : false,
    // Prevent refetch on window focus since we're polling (TanStack Query best practice)
    staleTime: pollingInterval,
    refetchOnWindowFocus: false,
  });

  // Find the most recent running Ralph container
  const runningContainer = useMemo(() => {
    const containers = query.data ?? [];
    return containers.find((c) => c.isRunning) ?? null;
  }, [query.data]);

  return {
    containers: query.data ?? [],
    runningContainer,
    hasRunningContainer: Boolean(runningContainer),
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

/**
 * Hook for fetching logs from a Ralph container.
 * Uses polling to stream logs in near real-time.
 *
 * @param containerName - Name of the container to fetch logs from
 * @param options - Configuration options
 * @returns Log content and container status
 */
export function useRalphContainerLogs(
  containerName: string | null,
  options: {
    /** Whether to enable the query (default: true when containerName is provided) */
    enabled?: boolean;
    /** Polling interval in ms (default: 1000ms) */
    pollingInterval?: number;
    /** Number of lines to fetch (default: 500) */
    tail?: number;
  } = {}
) {
  const { enabled = true, pollingInterval = 1000, tail = 500 } = options;

  // Track the previous log length for detecting new content
  // Using useState because hasNewLogs is used for rendering (auto-scroll behavior)
  const [prevLogLength, setPrevLogLength] = useState(0);

  const query = useQuery({
    queryKey: queryKeys.ralph.containerLogs(containerName ?? "", tail),
    queryFn: async () => {
      if (!containerName) {
        return { logs: "", containerRunning: false };
      }
      return getRalphContainerLogs({ data: { containerName, tail } });
    },
    enabled: enabled && Boolean(containerName),
    refetchInterval: pollingInterval,
    // Prevent refetch on window focus since we're polling (TanStack Query best practice)
    staleTime: pollingInterval,
    refetchOnWindowFocus: false,
  });

  // Parse iteration info from logs using hoisted regex (js-hoist-regexp)
  // Note: String.match() with global regex returns all matches without using lastIndex
  const iterationInfo = useMemo(() => {
    const logs = query.data?.logs ?? "";
    const match = logs.match(RALPH_ITERATION_REGEX);
    if (!match || match.length === 0) {
      return null;
    }
    // Get the last match (most recent iteration)
    const lastMatch = match[match.length - 1];
    const numbers = lastMatch?.match(ITERATION_NUMBERS_REGEX);
    if (!numbers) return null;
    return {
      current: parseInt(numbers[1] ?? "0", 10),
      total: parseInt(numbers[2] ?? "0", 10),
    };
  }, [query.data?.logs]);

  // Detect if new logs have arrived
  const currentLogLength = query.data?.logs?.length ?? 0;
  const hasNewLogs = currentLogLength > prevLogLength;

  // Update previous length after render
  useEffect(() => {
    setPrevLogLength(currentLogLength);
  }, [currentLogLength]);

  return {
    logs: query.data?.logs ?? "",
    containerRunning: query.data?.containerRunning ?? false,
    iterationInfo,
    hasNewLogs,
    loading: query.isLoading,
    error: query.data?.error ?? query.error?.message ?? null,
    refetch: query.refetch,
  };
}

// =============================================================================
// RALPH CONTAINER STATS
// =============================================================================

/**
 * Hook for fetching resource usage stats for Ralph containers.
 *
 * Uses `docker stats --no-stream` which is heavier than `docker ps`,
 * so polls less frequently (default: 10 seconds).
 *
 * @param containerNames - Optional list of container names to filter
 * @param options - Configuration options
 * @returns Container stats and query state
 */
export function useContainerStats(
  containerNames?: string[],
  options: {
    /** Whether to enable the query (default: true) */
    enabled?: boolean;
    /** Polling interval in ms (default: 10000ms = 10 seconds) */
    pollingInterval?: number;
  } = {}
) {
  const { enabled = true, pollingInterval = 10_000 } = options;

  const query = useQuery({
    queryKey: queryKeys.ralph.containerStats(containerNames),
    queryFn: async (): Promise<ContainerStatsResult> => {
      // Only include containerNames in data if provided (exactOptionalPropertyTypes)
      return getRalphContainerStats({
        data: containerNames ? { containerNames } : {},
      });
    },
    enabled,
    refetchInterval: pollingInterval,
    // Prevent refetch on window focus since we're polling (TanStack Query best practice)
    staleTime: pollingInterval,
    refetchOnWindowFocus: false,
  });

  // Create a map for efficient lookup by container name
  const statsMap = useMemo(() => {
    const map = new Map<string, ContainerStats>();
    const stats = query.data?.stats;
    if (stats) {
      for (const stat of stats) {
        map.set(stat.name, stat);
      }
    }
    return map;
  }, [query.data]);

  return {
    /** Array of container stats */
    stats: query.data?.stats ?? [],
    /** Map of containerName -> stats for O(1) lookup */
    statsMap,
    /** Get stats for a specific container by name */
    getStats: (name: string) => statsMap.get(name) ?? null,
    /** Any error that occurred (from Docker or query) */
    error: query.data?.error ?? query.error?.message ?? null,
    /** Whether we're fetching stats */
    loading: query.isLoading,
    /** Force refetch stats */
    refetch: query.refetch,
  };
}
