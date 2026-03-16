/**
 * Cost analytics TanStack Query hooks.
 * Queries for dashboard cost charts and per-ticket cost breakdown.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createBrowserLogger } from "../browser-logger";

const logger = createBrowserLogger("hooks:cost");
import {
  getCostAnalytics,
  getTicketCost,
  getEpicCost,
  getCostModels,
  updateCostModel,
  deleteCostModel,
  recalculateCosts,
  getCostExplorerData,
  getTicketCostDetail,
  type UpdateCostModelInput,
  type CostExplorerParams,
  type CostExplorerNode,
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
 * Hook for fetching cost breakdown for a specific epic.
 */
export function useEpicCost(epicId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.cost.epicCost(epicId ?? ""),
    queryFn: () => getEpicCost({ data: epicId! }),
    enabled: !!epicId,
    staleTime: 300_000,
    gcTime: 600_000,
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
    gcTime: 600_000,
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
    gcTime: 600_000,
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
    onError: (err, variables) => {
      logger.error(
        `Failed to save cost model: provider="${variables.provider}", model="${variables.modelName}"`,
        err instanceof Error ? err : new Error(String(err))
      );
    },
  });
}

/**
 * Mutation hook for recalculating all costs using current pricing models.
 * Invalidates all cost-related queries on success.
 */
export function useRecalculateCosts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => recalculateCosts(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cost"] });
    },
    onError: (err) => {
      logger.error(
        "Failed to recalculate costs",
        err instanceof Error ? err : new Error(String(err))
      );
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
    onError: (err, id) => {
      logger.error(
        `Failed to delete cost model: id="${id}"`,
        err instanceof Error ? err : new Error(String(err))
      );
    },
  });
}

// =============================================================================
// COST EXPLORER HOOKS
// =============================================================================

/**
 * Find the most expensive child node in a tree.
 */
function findMostExpensiveNode(
  tree: CostExplorerNode
): { name: string; costUsd: number; type: string } | null {
  if (!tree.children || tree.children.length === 0) return null;

  // Find most expensive across all epics' tickets
  let best: { name: string; costUsd: number; type: string } | null = null;
  for (const child of tree.children) {
    if (!best || child.costUsd > best.costUsd) {
      best = { name: child.name, costUsd: child.costUsd, type: child.type };
    }
    if (child.children) {
      for (const grandchild of child.children) {
        if (!best || grandchild.costUsd > best.costUsd) {
          best = {
            name: grandchild.name,
            costUsd: grandchild.costUsd,
            type: grandchild.type,
          };
        }
      }
    }
  }
  return best;
}

/**
 * Compute total cache savings from the tree.
 * Savings = (cacheReadTokens * inputRate - cacheReadTokens * cacheReadRate) across all nodes.
 * We estimate using a typical Sonnet-class cache discount (~90% savings).
 */
function computeTotalCacheSavings(tree: CostExplorerNode): number {
  // Approximate: cache read tokens at full input price would cost ~10x more than at cache price
  // So savings ≈ cacheReadTokens * (inputCostPerMtok - cacheReadCostPerMtok) / 1M
  // Using average ratios: input=$3/Mtok, cacheRead=$0.30/Mtok → savings = $2.70/Mtok
  const SAVINGS_PER_MTOK = 2.7;
  return (tree.cacheReadTokens / 1_000_000) * SAVINGS_PER_MTOK;
}

/**
 * Build a shallow tree from existing dashboard analytics cache.
 * Used as placeholderData while the full explorer tree loads.
 */
function buildShallowTreeFromAnalytics(cached: {
  costByEpic?: Array<{ epicId: string; title: string; costUsd: number }>;
}): CostExplorerNode | undefined {
  if (!cached.costByEpic || cached.costByEpic.length === 0) return undefined;

  const children: CostExplorerNode[] = cached.costByEpic.map((epic) => ({
    id: epic.epicId,
    name: epic.title,
    type: "epic" as const,
    value: epic.costUsd,
    costUsd: epic.costUsd,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    sessionCount: 0,
  }));

  const totalCost = children.reduce((sum, c) => sum + c.costUsd, 0);

  return {
    id: "root",
    name: "All Projects",
    type: "project",
    value: totalCost,
    costUsd: totalCost,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    sessionCount: 0,
    children,
  };
}

/**
 * Hook for fetching the full cost explorer tree.
 * All drill-down levels are client-side — zero additional network requests after initial load.
 * Seeds from existing dashboardAnalytics cache as placeholderData for instant display.
 */
export function useCostExplorer(params?: CostExplorerParams) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.cost.explorer(params),
    queryFn: async () => {
      const result = await getCostExplorerData({ data: params ?? {} });
      return result as CostExplorerNode;
    },
    staleTime: 300_000,
    gcTime: 300_000,
    placeholderData: () => {
      const cached = queryClient.getQueryData(queryKeys.cost.dashboardAnalytics()) as
        | { costByEpic?: Array<{ epicId: string; title: string; costUsd: number }> }
        | undefined;
      if (!cached) return undefined;
      return buildShallowTreeFromAnalytics(cached);
    },
  });
}

/**
 * Derived view of the explorer data — same cache, no extra fetch.
 * Computes summary stats from the explorer tree.
 */
export function useCostExplorerSummary(params?: CostExplorerParams) {
  return useQuery({
    queryKey: queryKeys.cost.explorer(params),
    queryFn: async () => {
      const result = await getCostExplorerData({ data: params ?? {} });
      return result as CostExplorerNode;
    },
    staleTime: 300_000,
    gcTime: 300_000,
    select: (tree: CostExplorerNode) => {
      const allTickets = tree.children?.flatMap((e) => e.children ?? []) ?? [];
      return {
        totalSpend: tree.costUsd,
        avgPerTicket: allTickets.length > 0 ? tree.costUsd / allTickets.length : 0,
        mostExpensive: findMostExpensiveNode(tree),
        cacheSavings: computeTotalCacheSavings(tree),
        totalSessions: tree.sessionCount,
      };
    },
  });
}

/**
 * Hook for fetching detailed cost breakdown for a specific ticket.
 */
export function useTicketCostDetail(ticketId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.cost.ticketDetail(ticketId!),
    queryFn: () => getTicketCostDetail({ data: ticketId! }),
    enabled: !!ticketId,
    staleTime: 300_000,
    gcTime: 300_000,
  });
}
