/**
 * Cost analytics TanStack Query hooks.
 * Queries for dashboard cost charts and per-ticket cost breakdown.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCostAnalytics,
  getTicketCost,
  getCostModels,
  updateCostModel,
  deleteCostModel,
  type UpdateCostModelInput,
} from "../../api/cost";
import { queryKeys } from "../query-keys";

/**
 * Hook for fetching dashboard cost analytics.
 * Returns cost-per-ticket, daily cost trend, and cost-by-epic data.
 */
export function useCostAnalytics() {
  return useQuery({
    queryKey: queryKeys.cost.dashboardAnalytics(),
    queryFn: () => getCostAnalytics(),
    staleTime: 300_000, // 5 minutes - cost data doesn't change frequently
    gcTime: 600_000, // 10 minutes - keep cache alive between refetch cycles
    refetchInterval: 600_000, // Refetch every 10 minutes
  });
}

/**
 * Hook for fetching cost breakdown for a specific ticket.
 */
export function useTicketCost(ticketId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.cost.ticketCost(ticketId ?? ""),
    queryFn: () => getTicketCost({ data: ticketId! }),
    enabled: !!ticketId,
    staleTime: 300_000,
  });
}

// =============================================================================
// COST MODEL CRUD HOOKS
// =============================================================================

/**
 * Hook for fetching all configured cost models.
 */
export function useCostModels() {
  return useQuery({
    queryKey: queryKeys.cost.models(),
    queryFn: () => getCostModels(),
    staleTime: 300_000,
  });
}

/**
 * Mutation hook for creating or updating a cost model.
 * Invalidates cost models query on success.
 */
export function useUpdateCostModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateCostModelInput) => updateCostModel({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cost.models() });
      queryClient.invalidateQueries({ queryKey: queryKeys.cost.dashboardAnalytics() });
    },
  });
}

/**
 * Mutation hook for deleting a cost model.
 * Invalidates cost models query on success.
 */
export function useDeleteCostModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCostModel({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cost.models() });
      queryClient.invalidateQueries({ queryKey: queryKeys.cost.dashboardAnalytics() });
    },
  });
}
