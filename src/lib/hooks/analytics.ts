/**
 * Analytics TanStack Query hooks.
 * Includes queries for dashboard analytics and metrics.
 */

import { useQuery } from "@tanstack/react-query";
import { getDashboardAnalytics } from "../../api/analytics";
import { queryKeys } from "../query-keys";

// =============================================================================
// ANALYTICS HOOKS
// =============================================================================

/**
 * Hook for fetching dashboard analytics including completion trends,
 * AI usage, velocity metrics, Ralph session stats, PR metrics, cycle time,
 * and top projects.
 */
export function useDashboardAnalytics() {
  return useQuery({
    queryKey: queryKeys.analytics.dashboard(),
    queryFn: async () => {
      return getDashboardAnalytics();
    },
    staleTime: 60_000, // 1 minute - analytics don't need real-time
    refetchInterval: 300_000, // Refetch every 5 minutes
  });
}
