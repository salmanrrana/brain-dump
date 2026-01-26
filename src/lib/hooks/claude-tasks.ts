/**
 * Claude Tasks TanStack Query hooks.
 * Includes queries for fetching AI-generated task lists.
 */

import { useQuery } from "@tanstack/react-query";
import { getClaudeTasks, type ClaudeTask, type ClaudeTaskStatus } from "../../api/claude-tasks";
import { queryKeys } from "../query-keys";

// Re-export types for components
export type { ClaudeTask, ClaudeTaskStatus };

// =============================================================================
// CLAUDE TASKS HOOKS
// =============================================================================

/**
 * Hook for fetching Claude tasks for a ticket with optional polling.
 * Tasks are displayed in the ticket detail view to show AI work progress.
 *
 * @param ticketId - The ticket ID to fetch tasks for
 * @param options - Optional configuration including polling interval
 */
export function useClaudeTasks(ticketId: string, options: { pollingInterval?: number } = {}) {
  const { pollingInterval = 0 } = options;

  const query = useQuery({
    queryKey: queryKeys.claudeTasks(ticketId),
    queryFn: async () => {
      const tasks = await getClaudeTasks({ data: ticketId });
      return tasks as ClaudeTask[];
    },
    enabled: Boolean(ticketId),
    refetchInterval: pollingInterval > 0 ? pollingInterval : false,
    // Prevent double-fetches from window focus when actively polling
    refetchOnWindowFocus: pollingInterval === 0,
    // Keep data fresh only as long as polling interval
    staleTime: pollingInterval > 0 ? pollingInterval : 0,
  });

  return {
    /** Array of Claude tasks for the ticket */
    tasks: query.data ?? [],
    /** Whether the initial load is in progress */
    loading: query.isLoading,
    /** Error details if the fetch failed */
    error: query.error
      ? {
          message: query.error.message,
          code: (query.error as Error & { code?: string }).code,
        }
      : null,
    /** Force refetch tasks */
    refetch: query.refetch,
  };
}
