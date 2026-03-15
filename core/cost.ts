/**
 * Cost tracking business logic for the core layer.
 *
 * Records token usage, computes costs from pricing models, and provides
 * aggregated cost queries at ticket, epic, and project levels.
 *
 * All functions take a DbHandle and return typed results or throw CoreError subclasses.
 */

import { randomUUID } from "crypto";
import type { DbHandle } from "./types.ts";
import type {
  CostModel,
  TokenUsageRecord,
  TokenCounts,
  TicketCostResult,
  ModelCostBreakdown,
  EpicCostResult,
  ProjectCostResult,
  CostTrendResult,
  CostTrendEntry,
} from "./types.ts";
import { ValidationError } from "./errors.ts";
import type { DbCostModelRow, DbTokenUsageRow } from "./db-rows.ts";

// ============================================
// Types
// ============================================

export interface RecordUsageParams {
  telemetrySessionId?: string;
  ticketId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  source?: string;
  /** Override recorded_at timestamp (ISO string). Defaults to now. Used for backfill. */
  recordedAt?: string;
}

export interface UpsertCostModelParams {
  id?: string;
  provider: string;
  modelName: string;
  inputCostPerMtok: number;
  outputCostPerMtok: number;
  cacheReadCostPerMtok?: number;
  cacheCreateCostPerMtok?: number;
  isDefault?: boolean;
}

export interface CostTrendParams {
  projectId?: string;
  epicId?: string;
  since?: string;
  granularity?: "daily" | "weekly";
}

// ============================================
// Internal Helpers
// ============================================

function parseCostModelRow(row: DbCostModelRow): CostModel {
  return {
    id: row.id,
    provider: row.provider,
    modelName: row.model_name,
    inputCostPerMtok: row.input_cost_per_mtok,
    outputCostPerMtok: row.output_cost_per_mtok,
    cacheReadCostPerMtok: row.cache_read_cost_per_mtok,
    cacheCreateCostPerMtok: row.cache_create_cost_per_mtok,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseTokenUsageRow(row: DbTokenUsageRow): TokenUsageRecord {
  return {
    id: row.id,
    telemetrySessionId: row.telemetry_session_id,
    ticketId: row.ticket_id,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cacheReadTokens: row.cache_read_tokens,
    cacheCreationTokens: row.cache_creation_tokens,
    costUsd: row.cost_usd,
    source: row.source,
    recordedAt: row.recorded_at,
  };
}

/**
 * Normalize model name for fuzzy matching.
 * Strips date suffixes (e.g. "claude-opus-4-6-20250616" → "claude-opus-4-6")
 * and lowercases.
 */
function normalizeModelName(model: string): string {
  return model.toLowerCase().replace(/-\d{8}$/, "");
}

// ============================================
// Cost Computation
// ============================================

/**
 * Compute cost in USD from token counts using stored pricing.
 *
 * Uses fuzzy matching on model_name (normalized, case-insensitive).
 * Returns 0 if no matching model is found (unknown model is not an error).
 */
export function computeCostFromTokens(db: DbHandle, model: string, tokens: TokenCounts): number {
  const normalized = normalizeModelName(model);

  // Try exact normalized match first
  let row = db
    .prepare(
      `SELECT * FROM cost_models
       WHERE LOWER(model_name) = ?
       LIMIT 1`
    )
    .get(normalized) as DbCostModelRow | undefined;

  // Fuzzy match: input is prefix of stored name, or stored name is prefix of input
  if (!row) {
    row = db
      .prepare(
        `SELECT * FROM cost_models
         WHERE ? LIKE LOWER(model_name) || '%'
            OR LOWER(model_name) LIKE ? || '%'
         ORDER BY LENGTH(model_name) DESC
         LIMIT 1`
      )
      .get(normalized, normalized) as DbCostModelRow | undefined;
  }

  if (!row) return 0;

  const inputCost = (tokens.inputTokens / 1_000_000) * row.input_cost_per_mtok;
  const outputCost = (tokens.outputTokens / 1_000_000) * row.output_cost_per_mtok;
  const cacheReadCost =
    tokens.cacheReadTokens && row.cache_read_cost_per_mtok
      ? (tokens.cacheReadTokens / 1_000_000) * row.cache_read_cost_per_mtok
      : 0;
  const cacheCreateCost =
    tokens.cacheCreationTokens && row.cache_create_cost_per_mtok
      ? (tokens.cacheCreationTokens / 1_000_000) * row.cache_create_cost_per_mtok
      : 0;

  return inputCost + outputCost + cacheReadCost + cacheCreateCost;
}

// ============================================
// Recording
// ============================================

/**
 * Record token usage for a session/ticket.
 *
 * Inserts a token_usage row, computes cost from pricing, and updates
 * telemetry_sessions aggregates if a session is linked.
 *
 * @throws ValidationError if model is empty or token counts are negative
 */
export function recordUsage(db: DbHandle, params: RecordUsageParams): TokenUsageRecord {
  const {
    telemetrySessionId,
    ticketId,
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens = 0,
    cacheCreationTokens = 0,
    source = "mcp-manual",
    recordedAt,
  } = params;

  if (!model) {
    throw new ValidationError("model is required for recording token usage.");
  }
  if (inputTokens < 0 || outputTokens < 0 || cacheReadTokens < 0 || cacheCreationTokens < 0) {
    throw new ValidationError("Token counts must be non-negative.");
  }

  // Resolve ticketId from session if not provided
  let resolvedTicketId = ticketId || null;
  if (!resolvedTicketId && telemetrySessionId) {
    const session = db
      .prepare("SELECT ticket_id FROM telemetry_sessions WHERE id = ?")
      .get(telemetrySessionId) as { ticket_id: string | null } | undefined;
    if (session) {
      resolvedTicketId = session.ticket_id;
    }
  }

  const costUsd = computeCostFromTokens(db, model, {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
  });

  const id = randomUUID();
  const now = recordedAt || new Date().toISOString();

  db.prepare(
    `INSERT INTO token_usage
     (id, telemetry_session_id, ticket_id, model, input_tokens, output_tokens,
      cache_read_tokens, cache_creation_tokens, cost_usd, source, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    telemetrySessionId || null,
    resolvedTicketId,
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens ?? null,
    cacheCreationTokens ?? null,
    costUsd,
    source,
    now
  );

  // Update telemetry_sessions aggregates
  if (telemetrySessionId) {
    db.prepare(
      `UPDATE telemetry_sessions
       SET total_input_tokens = COALESCE(total_input_tokens, 0) + ?,
           total_output_tokens = COALESCE(total_output_tokens, 0) + ?,
           total_cost_usd = COALESCE(total_cost_usd, 0) + ?
       WHERE id = ?`
    ).run(inputTokens, outputTokens, costUsd, telemetrySessionId);
  }

  return parseTokenUsageRow(
    db.prepare("SELECT * FROM token_usage WHERE id = ?").get(id) as DbTokenUsageRow
  );
}

// ============================================
// Queries
// ============================================

/**
 * Get aggregated cost for a ticket across all sessions.
 */
export function getTicketCost(db: DbHandle, ticketId: string): TicketCostResult {
  // Aggregate totals
  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(cost_usd), 0) as total_cost_usd,
         COALESCE(SUM(input_tokens), 0) as total_input_tokens,
         COALESCE(SUM(output_tokens), 0) as total_output_tokens,
         COALESCE(SUM(cache_read_tokens), 0) as total_cache_read_tokens,
         COALESCE(SUM(cache_creation_tokens), 0) as total_cache_creation_tokens,
         COUNT(DISTINCT telemetry_session_id) as session_count
       FROM token_usage
       WHERE ticket_id = ?`
    )
    .get(ticketId) as {
    total_cost_usd: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cache_read_tokens: number;
    total_cache_creation_tokens: number;
    session_count: number;
  };

  // Breakdown by model
  const byModel = db
    .prepare(
      `SELECT
         model,
         COALESCE(SUM(input_tokens), 0) as input_tokens,
         COALESCE(SUM(output_tokens), 0) as output_tokens,
         COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
         COALESCE(SUM(cache_creation_tokens), 0) as cache_creation_tokens,
         COALESCE(SUM(cost_usd), 0) as cost_usd
       FROM token_usage
       WHERE ticket_id = ?
       GROUP BY model
       ORDER BY cost_usd DESC`
    )
    .all(ticketId) as Array<{
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    cost_usd: number;
  }>;

  return {
    ticketId,
    totalCostUsd: totals.total_cost_usd,
    totalInputTokens: totals.total_input_tokens,
    totalOutputTokens: totals.total_output_tokens,
    totalCacheReadTokens: totals.total_cache_read_tokens,
    totalCacheCreationTokens: totals.total_cache_creation_tokens,
    byModel: byModel.map(
      (r): ModelCostBreakdown => ({
        model: r.model,
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        cacheReadTokens: r.cache_read_tokens,
        cacheCreationTokens: r.cache_creation_tokens,
        costUsd: r.cost_usd,
      })
    ),
    sessionCount: totals.session_count,
  };
}

/**
 * Get aggregated cost for all tickets in an epic.
 */
export function getEpicCost(db: DbHandle, epicId: string): EpicCostResult {
  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(tu.cost_usd), 0) as total_cost_usd,
         COALESCE(SUM(tu.input_tokens), 0) as total_input_tokens,
         COALESCE(SUM(tu.output_tokens), 0) as total_output_tokens,
         COUNT(DISTINCT tu.ticket_id) as ticket_count
       FROM token_usage tu
       JOIN tickets t ON tu.ticket_id = t.id
       WHERE t.epic_id = ?`
    )
    .get(epicId) as {
    total_cost_usd: number;
    total_input_tokens: number;
    total_output_tokens: number;
    ticket_count: number;
  };

  const byTicket = db
    .prepare(
      `SELECT
         t.id as ticket_id,
         t.title,
         COALESCE(SUM(tu.cost_usd), 0) as cost_usd
       FROM token_usage tu
       JOIN tickets t ON tu.ticket_id = t.id
       WHERE t.epic_id = ?
       GROUP BY t.id, t.title
       ORDER BY cost_usd DESC`
    )
    .all(epicId) as Array<{
    ticket_id: string;
    title: string;
    cost_usd: number;
  }>;

  return {
    epicId,
    totalCostUsd: totals.total_cost_usd,
    totalInputTokens: totals.total_input_tokens,
    totalOutputTokens: totals.total_output_tokens,
    ticketCount: totals.ticket_count,
    byTicket: byTicket.map((r) => ({
      ticketId: r.ticket_id,
      title: r.title,
      costUsd: r.cost_usd,
    })),
  };
}

/**
 * Get aggregated cost for all tickets in a project.
 */
export function getProjectCost(db: DbHandle, projectId: string): ProjectCostResult {
  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(tu.cost_usd), 0) as total_cost_usd,
         COALESCE(SUM(tu.input_tokens), 0) as total_input_tokens,
         COALESCE(SUM(tu.output_tokens), 0) as total_output_tokens,
         COUNT(DISTINCT tu.ticket_id) as ticket_count
       FROM token_usage tu
       JOIN tickets t ON tu.ticket_id = t.id
       WHERE t.project_id = ?`
    )
    .get(projectId) as {
    total_cost_usd: number;
    total_input_tokens: number;
    total_output_tokens: number;
    ticket_count: number;
  };

  return {
    projectId,
    totalCostUsd: totals.total_cost_usd,
    totalInputTokens: totals.total_input_tokens,
    totalOutputTokens: totals.total_output_tokens,
    ticketCount: totals.ticket_count,
  };
}

/**
 * Get cost trend over time (daily or weekly).
 */
export function getCostTrend(db: DbHandle, params: CostTrendParams): CostTrendResult {
  const { projectId, epicId, since, granularity = "daily" } = params;

  const dateFormat = granularity === "weekly" ? "%Y-W%W" : "%Y-%m-%d";

  let query = `
    SELECT
      strftime('${dateFormat}', tu.recorded_at) as period,
      COALESCE(SUM(tu.cost_usd), 0) as total_cost_usd,
      COALESCE(SUM(tu.input_tokens), 0) as total_input_tokens,
      COALESCE(SUM(tu.output_tokens), 0) as total_output_tokens
    FROM token_usage tu
  `;

  const conditions: string[] = [];
  const queryParams: (string | number)[] = [];

  if (projectId || epicId) {
    query += " JOIN tickets t ON tu.ticket_id = t.id";
  }

  if (projectId) {
    conditions.push("t.project_id = ?");
    queryParams.push(projectId);
  }
  if (epicId) {
    conditions.push("t.epic_id = ?");
    queryParams.push(epicId);
  }
  if (since) {
    conditions.push("tu.recorded_at >= ?");
    queryParams.push(since);
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += ` GROUP BY period ORDER BY period ASC`;

  const rows = db.prepare(query).all(...queryParams) as Array<{
    period: string;
    total_cost_usd: number;
    total_input_tokens: number;
    total_output_tokens: number;
  }>;

  return {
    entries: rows.map(
      (r): CostTrendEntry => ({
        period: r.period,
        totalCostUsd: r.total_cost_usd,
        totalInputTokens: r.total_input_tokens,
        totalOutputTokens: r.total_output_tokens,
      })
    ),
    granularity,
  };
}

// ============================================
// Pricing CRUD
// ============================================

/**
 * Insert or update a cost model (pricing for a provider/model).
 */
export function upsertCostModel(db: DbHandle, params: UpsertCostModelParams): CostModel {
  const {
    id: existingId,
    provider,
    modelName,
    inputCostPerMtok,
    outputCostPerMtok,
    cacheReadCostPerMtok,
    cacheCreateCostPerMtok,
    isDefault = false,
  } = params;

  if (!provider || !modelName) {
    throw new ValidationError("provider and modelName are required.");
  }
  if (
    inputCostPerMtok < 0 ||
    outputCostPerMtok < 0 ||
    (cacheReadCostPerMtok != null && cacheReadCostPerMtok < 0) ||
    (cacheCreateCostPerMtok != null && cacheCreateCostPerMtok < 0)
  ) {
    throw new ValidationError("Cost values must be non-negative.");
  }

  const now = new Date().toISOString();

  // Check if model exists for this provider/modelName
  const existing = existingId
    ? (db.prepare("SELECT id FROM cost_models WHERE id = ?").get(existingId) as
        | { id: string }
        | undefined)
    : (db
        .prepare(
          "SELECT id FROM cost_models WHERE LOWER(provider) = LOWER(?) AND LOWER(model_name) = LOWER(?)"
        )
        .get(provider, modelName) as { id: string } | undefined);

  if (existing) {
    db.prepare(
      `UPDATE cost_models
       SET provider = ?, model_name = ?, input_cost_per_mtok = ?, output_cost_per_mtok = ?,
           cache_read_cost_per_mtok = ?, cache_create_cost_per_mtok = ?,
           is_default = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      provider,
      modelName,
      inputCostPerMtok,
      outputCostPerMtok,
      cacheReadCostPerMtok ?? null,
      cacheCreateCostPerMtok ?? null,
      isDefault ? 1 : 0,
      now,
      existing.id
    );

    return parseCostModelRow(
      db.prepare("SELECT * FROM cost_models WHERE id = ?").get(existing.id) as DbCostModelRow
    );
  }

  const id = existingId || randomUUID();
  db.prepare(
    `INSERT INTO cost_models
     (id, provider, model_name, input_cost_per_mtok, output_cost_per_mtok,
      cache_read_cost_per_mtok, cache_create_cost_per_mtok, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    provider,
    modelName,
    inputCostPerMtok,
    outputCostPerMtok,
    cacheReadCostPerMtok ?? null,
    cacheCreateCostPerMtok ?? null,
    isDefault ? 1 : 0,
    now,
    now
  );

  return parseCostModelRow(
    db.prepare("SELECT * FROM cost_models WHERE id = ?").get(id) as DbCostModelRow
  );
}

/**
 * List all configured cost models, sorted by provider then model name.
 */
export function listCostModels(db: DbHandle): CostModel[] {
  const rows = db
    .prepare("SELECT * FROM cost_models ORDER BY provider ASC, model_name ASC")
    .all() as DbCostModelRow[];
  return rows.map(parseCostModelRow);
}

/**
 * Delete a cost model by ID.
 *
 * @throws ValidationError if the model doesn't exist
 */
export function deleteCostModel(db: DbHandle, id: string): void {
  const existing = db.prepare("SELECT id FROM cost_models WHERE id = ?").get(id) as
    | { id: string }
    | undefined;
  if (!existing) {
    throw new ValidationError(`Cost model ${id} not found.`);
  }
  db.prepare("DELETE FROM cost_models WHERE id = ?").run(id);
}

// ============================================
// Seed Data
// ============================================

/**
 * Seed default pricing data for major providers.
 * Only inserts if no cost models exist yet.
 */
export function seedCostModels(db: DbHandle): number {
  const existing = db.prepare("SELECT COUNT(*) as count FROM cost_models").get() as {
    count: number;
  };
  if (existing.count > 0) return 0;

  const models: Array<Omit<UpsertCostModelParams, "id">> = [
    // Anthropic
    {
      provider: "anthropic",
      modelName: "claude-opus-4-6",
      inputCostPerMtok: 15,
      outputCostPerMtok: 75,
      cacheReadCostPerMtok: 1.5,
      cacheCreateCostPerMtok: 18.75,
    },
    {
      provider: "anthropic",
      modelName: "claude-sonnet-4-6",
      inputCostPerMtok: 3,
      outputCostPerMtok: 15,
      cacheReadCostPerMtok: 0.3,
      cacheCreateCostPerMtok: 3.75,
    },
    {
      provider: "anthropic",
      modelName: "claude-haiku-4-5",
      inputCostPerMtok: 1,
      outputCostPerMtok: 5,
      cacheReadCostPerMtok: 0.1,
      cacheCreateCostPerMtok: 1.25,
    },
    // OpenAI
    {
      provider: "openai",
      modelName: "gpt-4o",
      inputCostPerMtok: 2.5,
      outputCostPerMtok: 10,
    },
    {
      provider: "openai",
      modelName: "o3",
      inputCostPerMtok: 10,
      outputCostPerMtok: 40,
    },
    // Google
    {
      provider: "google",
      modelName: "gemini-2.5-pro",
      inputCostPerMtok: 1.25,
      outputCostPerMtok: 10,
    },
  ];

  const insertAll = db.transaction(() => {
    for (const model of models) {
      upsertCostModel(db, model);
    }
  });

  insertAll();
  return models.length;
}
