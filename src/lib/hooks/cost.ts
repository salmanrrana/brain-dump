/**
 * Cost analytics TanStack Query hooks.
 * Queries for dashboard cost charts and per-ticket cost breakdown.
 */

import { useQuery } from "@tanstack/react-query";
import { getCostAnalytics, getTicketCost } from "../../api/cost";
import { queryKeys } from "../query-keys";

/**
 * Hook for fetching dashboard cost analytics.
 * Returns cost-per-ticket, daily cost trend, and cost-by-epic data.
 */
export function useCostAnalytics() {
  return useQuery({
    queryKey: queryKeys.cost.dashboardAnalytics(),
    queryFn: async () => {
      return getCostAnalytics();
    },
    staleTime: 300_000, // 5 minutes - cost data doesn't change frequently
    refetchInterval: 600_000, // Refetch every 10 minutes
  });
}

/**
 * Hook for fetching cost breakdown for a specific ticket.
 */
export function useTicketCost(ticketId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.cost.ticketCost(ticketId ?? ""),
    queryFn: async () => {
      return getTicketCost({ data: ticketId! });
    },
    enabled: !!ticketId,
    staleTime: 300_000,
  });
}
