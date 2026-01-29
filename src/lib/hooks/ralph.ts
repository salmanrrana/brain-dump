/**
 * Ralph autonomous agent hooks.
 * Includes queries and mutations for launching and monitoring Ralph sessions.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  launchRalphForTicket,
  launchRalphForEpic,
  getActiveRalphSessions,
  type ActiveRalphSession,
} from "../../api/ralph";
import { launchProjectInception, launchSpecBreakdown } from "../../api/inception";
import { getRalphEvents } from "../../api/ralph-events";
import {
  checkDockerAvailable,
  listRalphContainers,
  getRalphContainerLogs,
  getRalphContainerStats,
} from "../../api/services";
import type { RalphEventType, RalphEventData } from "../schema";
import type { ContainerStats, ContainerStatsResult } from "../../api/docker-utils";
import { queryKeys } from "../query-keys";

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
      aiBackend?: "claude" | "opencode";
    }) => launchRalphForTicket({ data }),
    onSuccess: () => {
      // Ticket status will be updated by Ralph, invalidate to reflect changes
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
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
      aiBackend?: "claude" | "opencode";
    }) => launchRalphForEpic({ data }),
    onSuccess: () => {
      // Ticket statuses will be updated by Ralph, invalidate to reflect changes
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
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
    queryKey: ["activeRalphSessions"],
    queryFn: async (): Promise<Record<string, ActiveRalphSession>> => {
      return getActiveRalphSessions();
    },
    // Poll frequently to show real-time status
    refetchInterval: pollingInterval > 0 ? pollingInterval : false,
    // Sessions can change at any time via MCP
    staleTime: 0,
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
// PROJECT INCEPTION HOOKS
// =============================================================================

// Hook for launching Project Inception (new project from scratch)
export function useLaunchProjectInception() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { preferredTerminal?: string | null }) => launchProjectInception({ data }),
    onSuccess: () => {
      // A new project may be created, invalidate projects list
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

// Hook for launching Spec Breakdown (generate tickets from spec)
export function useLaunchSpecBreakdown() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      projectPath: string;
      projectName: string;
      preferredTerminal?: string | null;
    }) => launchSpecBreakdown({ data }),
    onSuccess: () => {
      // Tickets will be created, invalidate tickets and projects
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

// =============================================================================
// RALPH EVENT STREAMING
// =============================================================================

/** Parsed Ralph event for UI consumption */
export interface ParsedRalphEvent {
  id: string;
  sessionId: string;
  type: RalphEventType;
  data: RalphEventData;
  createdAt: string;
}

/**
 * Hook for streaming Ralph events from a session.
 * Uses polling to fetch all events and derives state from the full event list.
 *
 * @param sessionId - The Ralph session ID (usually ticket ID)
 * @param options - Configuration options
 */
export function useRalphEvents(
  sessionId: string | null,
  options: {
    /** Whether to enable the stream (default: true when sessionId is provided) */
    enabled?: boolean;
    /** Polling interval in ms (default: 1000ms = 1 second) */
    pollingInterval?: number;
    /** Maximum events to return (default: 100) */
    maxEvents?: number;
  } = {}
) {
  const { enabled = true, pollingInterval = 1000, maxEvents = 100 } = options;
  const queryClient = useQueryClient();

  // Query fetches all events from the server
  const query = useQuery({
    queryKey: queryKeys.ralph.events(sessionId ?? ""),
    queryFn: async () => {
      if (!sessionId) {
        return [] as ParsedRalphEvent[];
      }

      const result = await getRalphEvents({
        data: { sessionId, limit: maxEvents },
      });

      // Throw on failure so TanStack Query shows error state
      if (!result.success) {
        throw new Error(result.message || "Failed to fetch Ralph events");
      }

      // Return empty array if no events (distinct from failure)
      if (!result.events) {
        return [] as ParsedRalphEvent[];
      }

      return result.events as ParsedRalphEvent[];
    },
    enabled: enabled && Boolean(sessionId),
    refetchInterval: pollingInterval,
    // Prevent refetch on window focus since we're polling (TanStack Query best practice)
    staleTime: pollingInterval,
    refetchOnWindowFocus: false,
  });

  // Derive all values from query data using useMemo (no effects needed)
  const events = useMemo(() => query.data ?? [], [query.data]);

  const latestEvent = useMemo(() => {
    if (events.length === 0) return null;
    return events[events.length - 1] ?? null;
  }, [events]);

  // Get the current state from state_change events
  const currentState = useMemo(() => {
    const stateEvents = events.filter((e) => e.type === "state_change");
    const lastStateEvent = stateEvents[stateEvents.length - 1];
    return lastStateEvent?.data?.state ?? null;
  }, [events]);

  // Helper to get events of a specific type
  const getEventsByType = useCallback(
    (type: RalphEventType) => events.filter((e) => e.type === type),
    [events]
  );

  // Clear events by invalidating the query (will refetch empty)
  const clearEvents = useCallback(() => {
    queryClient.setQueryData(["ralphEvents", sessionId], []);
  }, [queryClient, sessionId]);

  return {
    /** All events for this session (up to maxEvents) */
    events,
    /** The most recent event */
    latestEvent,
    /** Current state from state_change events */
    currentState,
    /** Whether we're fetching events */
    loading: query.isLoading,
    /** Any error that occurred */
    error: query.error?.message ?? null,
    /** Get events of a specific type */
    getEventsByType,
    /** Clear all events (useful when session ends) */
    clearEvents,
    /** Force refetch events */
    refetch: query.refetch,
  };
}

// =============================================================================
// DOCKER AVAILABILITY
// =============================================================================

/**
 * Hook for checking Docker daemon availability.
 *
 * Uses a cached check (60 second server-side TTL) to avoid repeatedly hitting Docker.
 * The hook also does client-side polling to detect when Docker starts/stops.
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
    queryKey: queryKeys.ralph.dockerAvailable(),
    queryFn: () => checkDockerAvailable({ data: {} }),
    enabled,
    // Re-check periodically to detect Docker starting/stopping
    refetchInterval: recheckInterval,
    // Don't refetch on window focus - we have periodic checking
    refetchOnWindowFocus: false,
    // Keep stale data while refetching
    staleTime: recheckInterval,
  });

  return {
    /** Whether Docker daemon is available */
    available: query.data?.available ?? false,
    /** Whether the result was from cache */
    cached: query.data?.cached ?? false,
    /** Error message if Docker is not available */
    error: query.data?.error,
    /** Whether the query is loading */
    loading: query.isLoading,
    /** Force a fresh check */
    refetch: () =>
      checkDockerAvailable({ data: { forceRefresh: true } }).then(() => query.refetch()),
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
