import { createServerFn } from "@tanstack/react-start";
import { sqlite } from "../lib/db";
import {
  getTicketCost as coreGetTicketCost,
  getCostTrend,
  listCostModels as coreListCostModels,
  upsertCostModel as coreUpsertCostModel,
  deleteCostModel as coreDeleteCostModel,
} from "../../core/cost.ts";
import type { CostModel } from "../../core/types.ts";

// =============================================================================
// Types
// =============================================================================

export interface DashboardCostAnalytics {
  costPerTicket: Array<{
    ticketId: string;
    title: string;
    costUsd: number;
    completedAt: string | null;
  }>;
  costTrend: Array<{ date: string; costUsd: number }>;
  costByEpic: Array<{ epicId: string; title: string; costUsd: number }>;
}

// =============================================================================
// Server Functions
// =============================================================================

/**
 * Get cost analytics for the dashboard.
 * Returns cost-per-ticket, daily cost trend, and cost-by-epic.
 */
const EMPTY_COST_ANALYTICS: DashboardCostAnalytics = {
  costPerTicket: [],
  costTrend: [],
  costByEpic: [],
};

function isMissingCostSchemaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("no such table: token_usage") || message.includes("no such table: cost_");
}

export const getCostAnalytics = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardCostAnalytics> => {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sinceDate = thirtyDaysAgo.toISOString();
      const formatDate = (date: Date): string => {
        const isoString = date.toISOString();
        return isoString.split("T")[0] ?? isoString.substring(0, 10);
      };

      // 1. Cost per completed ticket (last 30 days)
      const costPerTicketRows = sqlite
        .prepare(
          `SELECT
           t.id as ticket_id,
           t.title,
           COALESCE(SUM(tu.cost_usd), 0) as cost_usd,
           t.completed_at
         FROM tickets t
         LEFT JOIN token_usage tu ON tu.ticket_id = t.id
         WHERE t.status = 'done'
           AND t.completed_at >= ?
         GROUP BY t.id, t.title, t.completed_at
         HAVING cost_usd > 0
         ORDER BY t.completed_at DESC`
        )
        .all(sinceDate) as Array<{
        ticket_id: string;
        title: string;
        cost_usd: number;
        completed_at: string | null;
      }>;

      const costPerTicket = costPerTicketRows.map((r) => ({
        ticketId: r.ticket_id,
        title: r.title,
        costUsd: r.cost_usd,
        completedAt: r.completed_at,
      }));

      // 2. Daily cost trend (last 30 days) - fill missing dates with 0
      const trendResult = getCostTrend(sqlite, {
        since: sinceDate,
        granularity: "daily",
      });

      const trendMap = new Map<string, number>();
      for (let i = 0; i < 30; i++) {
        const date = new Date(now.getTime() - (29 - i) * 24 * 60 * 60 * 1000);
        const dateStr = formatDate(date);
        trendMap.set(dateStr, 0);
      }
      for (const entry of trendResult.entries) {
        trendMap.set(entry.period, entry.totalCostUsd);
      }
      const costTrend = Array.from(trendMap.entries())
        .map(([date, costUsd]) => ({ date, costUsd }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // 3. Cost by epic
      const epicRows = sqlite
        .prepare(
          `SELECT
           e.id as epic_id,
           e.title,
           COALESCE(SUM(tu.cost_usd), 0) as cost_usd
         FROM epics e
         JOIN tickets t ON t.epic_id = e.id
         JOIN token_usage tu ON tu.ticket_id = t.id
         GROUP BY e.id, e.title
         HAVING cost_usd > 0
         ORDER BY cost_usd DESC
         LIMIT 10`
        )
        .all() as Array<{
        epic_id: string;
        title: string;
        cost_usd: number;
      }>;

      const costByEpic = epicRows.map((r) => ({
        epicId: r.epic_id,
        title: r.title,
        costUsd: r.cost_usd,
      }));

      return { costPerTicket, costTrend, costByEpic };
    } catch (error) {
      // Gracefully handle missing cost tables (migration not yet run)
      if (isMissingCostSchemaError(error)) {
        return EMPTY_COST_ANALYTICS;
      }
      throw error;
    }
  }
);

/**
 * Get cost breakdown for a specific ticket.
 */
export const getTicketCost = createServerFn({ method: "GET" })
  .inputValidator((data: string) => {
    if (!data || typeof data !== "string") {
      throw new Error("Ticket ID is required");
    }
    return data;
  })
  .handler(async ({ data: ticketId }) => {
    return coreGetTicketCost(sqlite, ticketId);
  });

// =============================================================================
// Cost Model CRUD
// =============================================================================

export interface UpdateCostModelInput {
  id?: string | undefined;
  provider: string;
  modelName: string;
  inputCostPerMtok: number;
  outputCostPerMtok: number;
  cacheReadCostPerMtok?: number | undefined;
  cacheCreateCostPerMtok?: number | undefined;
}

/**
 * List all configured cost models.
 */
export const getCostModels = createServerFn({ method: "GET" }).handler(
  async (): Promise<CostModel[]> => {
    try {
      return coreListCostModels(sqlite);
    } catch (error) {
      if (isMissingCostSchemaError(error)) {
        return [];
      }
      throw error;
    }
  }
);

/**
 * Create or update a cost model.
 */
export const updateCostModel = createServerFn({ method: "POST" })
  .inputValidator((data: UpdateCostModelInput) => {
    if (!data.provider || !data.modelName) {
      throw new Error("Provider and model name are required");
    }
    if (data.inputCostPerMtok < 0 || data.outputCostPerMtok < 0) {
      throw new Error("Cost values must be non-negative");
    }
    return data;
  })
  .handler(async ({ data }): Promise<CostModel> => {
    const params: Parameters<typeof coreUpsertCostModel>[1] = {
      provider: data.provider,
      modelName: data.modelName,
      inputCostPerMtok: data.inputCostPerMtok,
      outputCostPerMtok: data.outputCostPerMtok,
    };
    if (data.id) params.id = data.id;
    if (data.cacheReadCostPerMtok != null) params.cacheReadCostPerMtok = data.cacheReadCostPerMtok;
    if (data.cacheCreateCostPerMtok != null)
      params.cacheCreateCostPerMtok = data.cacheCreateCostPerMtok;
    return coreUpsertCostModel(sqlite, params);
  });

/**
 * Delete a cost model by ID.
 */
export const deleteCostModel = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (!data.id) {
      throw new Error("Cost model ID is required");
    }
    return data;
  })
  .handler(async ({ data }) => {
    coreDeleteCostModel(sqlite, data.id);
  });

// Re-export types from core for convenience
export type { CostModel, TicketCostResult, EpicCostResult } from "../../core/types.ts";
