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
  RalphSessionState,
  StateHistoryEntry,
  StageCostEntry,
  TicketCostDetail,
  CostExplorerNode,
  CostExplorerParams,
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
  /** Stable provider source identity, e.g. transcript path or provider event id. */
  sourceRef?: string;
  /** Provider transcript/event window start (ISO string). */
  providerEventStart?: string;
  /** Provider transcript/event window end (ISO string). */
  providerEventEnd?: string;
  /** Override recorded_at timestamp (ISO string). Defaults to now. Used for backfill. */
  recordedAt?: string;
}

export interface ResolveTokenUsageAttributionParams {
  telemetrySessionId?: string;
  ticketId?: string;
  projectPath?: string;
  transcriptPath?: string;
  eventTime?: string;
  eventStart?: string;
  eventEnd?: string;
}

export interface TokenUsageAttributionResult {
  telemetrySessionId?: string;
  ticketId?: string;
  source: "explicit" | "project-event-window" | "project-active-session" | "skipped";
  skipped: boolean;
  warning?: string;
}

interface TokenUsageAttributionCandidate {
  telemetrySessionId: string;
  ticketId: string | null;
  startedAt: string;
  endedAt: string | null;
  firstEventAt: string | null;
  lastEventAt: string | null;
}

interface AttributionWindow {
  startMs: number;
  endMs: number;
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

interface DefaultCostModelDefinition extends Omit<UpsertCostModelParams, "id"> {
  legacyRowsToReplace?: Array<{
    inputCostPerMtok: number;
    outputCostPerMtok: number;
    cacheReadCostPerMtok?: number;
    cacheCreateCostPerMtok?: number;
  }>;
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
    sourceRef: row.source_ref,
    providerEventStart: row.provider_event_start,
    providerEventEnd: row.provider_event_end,
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

const DEFAULT_COST_MODELS: DefaultCostModelDefinition[] = [
  // Anthropic
  {
    provider: "anthropic",
    modelName: "claude-opus-4-6",
    inputCostPerMtok: 5,
    outputCostPerMtok: 25,
    cacheReadCostPerMtok: 0.5,
    cacheCreateCostPerMtok: 6.25,
    isDefault: true,
  },
  {
    provider: "anthropic",
    modelName: "claude-opus-4-8",
    inputCostPerMtok: 5,
    outputCostPerMtok: 25,
    cacheReadCostPerMtok: 0.5,
    cacheCreateCostPerMtok: 6.25,
    isDefault: true,
  },
  {
    provider: "anthropic",
    modelName: "claude-opus-4-7",
    inputCostPerMtok: 5,
    outputCostPerMtok: 25,
    cacheReadCostPerMtok: 0.5,
    cacheCreateCostPerMtok: 6.25,
    isDefault: true,
  },
  {
    provider: "anthropic",
    modelName: "claude-opus-4-5",
    inputCostPerMtok: 5,
    outputCostPerMtok: 25,
    cacheReadCostPerMtok: 0.5,
    cacheCreateCostPerMtok: 6.25,
    isDefault: true,
  },
  {
    provider: "anthropic",
    modelName: "claude-opus-4-1",
    inputCostPerMtok: 15,
    outputCostPerMtok: 75,
    cacheReadCostPerMtok: 1.5,
    cacheCreateCostPerMtok: 18.75,
    isDefault: true,
  },
  {
    provider: "anthropic",
    modelName: "claude-opus-4",
    inputCostPerMtok: 15,
    outputCostPerMtok: 75,
    cacheReadCostPerMtok: 1.5,
    cacheCreateCostPerMtok: 18.75,
    isDefault: true,
  },
  {
    provider: "anthropic",
    modelName: "claude-opus-3",
    inputCostPerMtok: 15,
    outputCostPerMtok: 75,
    cacheReadCostPerMtok: 1.5,
    cacheCreateCostPerMtok: 18.75,
    isDefault: true,
  },
  {
    provider: "anthropic",
    modelName: "claude-sonnet-4-6",
    inputCostPerMtok: 3,
    outputCostPerMtok: 15,
    cacheReadCostPerMtok: 0.3,
    cacheCreateCostPerMtok: 3.75,
    isDefault: true,
  },
  {
    provider: "anthropic",
    modelName: "claude-sonnet-4-5",
    inputCostPerMtok: 3,
    outputCostPerMtok: 15,
    cacheReadCostPerMtok: 0.3,
    cacheCreateCostPerMtok: 3.75,
    isDefault: true,
  },
  {
    provider: "anthropic",
    modelName: "claude-sonnet-4",
    inputCostPerMtok: 3,
    outputCostPerMtok: 15,
    cacheReadCostPerMtok: 0.3,
    cacheCreateCostPerMtok: 3.75,
    isDefault: true,
  },
  {
    provider: "anthropic",
    modelName: "claude-sonnet-3-7",
    inputCostPerMtok: 3,
    outputCostPerMtok: 15,
    cacheReadCostPerMtok: 0.3,
    cacheCreateCostPerMtok: 3.75,
    isDefault: true,
  },
  {
    provider: "anthropic",
    modelName: "claude-haiku-4-5",
    inputCostPerMtok: 1,
    outputCostPerMtok: 5,
    cacheReadCostPerMtok: 0.1,
    cacheCreateCostPerMtok: 1.25,
    isDefault: true,
  },
  {
    provider: "anthropic",
    modelName: "claude-haiku-3-5",
    inputCostPerMtok: 0.8,
    outputCostPerMtok: 4,
    cacheReadCostPerMtok: 0.08,
    cacheCreateCostPerMtok: 1,
    isDefault: true,
  },
  {
    provider: "anthropic",
    modelName: "claude-haiku-3",
    inputCostPerMtok: 0.25,
    outputCostPerMtok: 1.25,
    cacheReadCostPerMtok: 0.03,
    cacheCreateCostPerMtok: 0.3,
    isDefault: true,
  },
  // OpenAI
  {
    provider: "openai",
    modelName: "gpt-5.3-codex",
    inputCostPerMtok: 1.75,
    outputCostPerMtok: 14,
    cacheReadCostPerMtok: 0.18,
    isDefault: true,
  },
  {
    provider: "openai",
    modelName: "gpt-5.4",
    inputCostPerMtok: 2.5,
    outputCostPerMtok: 15,
    cacheReadCostPerMtok: 0.25,
    isDefault: true,
  },
  {
    provider: "openai",
    modelName: "gpt-5.4-mini",
    inputCostPerMtok: 0.75,
    outputCostPerMtok: 4.5,
    cacheReadCostPerMtok: 0.08,
    isDefault: true,
  },
  {
    provider: "openai",
    modelName: "gpt-5.4-nano",
    inputCostPerMtok: 0.2,
    outputCostPerMtok: 1.25,
    cacheReadCostPerMtok: 0.02,
    isDefault: true,
  },
  {
    provider: "openai",
    modelName: "gpt-5.4-pro",
    inputCostPerMtok: 30,
    outputCostPerMtok: 180,
    isDefault: true,
  },
  {
    provider: "openai",
    modelName: "gpt-5.5",
    inputCostPerMtok: 5,
    outputCostPerMtok: 30,
    cacheReadCostPerMtok: 0.5,
    isDefault: true,
  },
  // Pi exposes Codex subscription-routed models under openai-codex. These are
  // included so the launch model picker can offer the same ids reported by
  // `pi --list-models`; subscription usage has no marginal API price here.
  {
    provider: "openai-codex",
    modelName: "gpt-5.1",
    inputCostPerMtok: 0,
    outputCostPerMtok: 0,
    cacheReadCostPerMtok: 0,
    isDefault: true,
  },
  {
    provider: "openai-codex",
    modelName: "gpt-5.1-codex-max",
    inputCostPerMtok: 0,
    outputCostPerMtok: 0,
    cacheReadCostPerMtok: 0,
    isDefault: true,
  },
  {
    provider: "openai-codex",
    modelName: "gpt-5.1-codex-mini",
    inputCostPerMtok: 0,
    outputCostPerMtok: 0,
    cacheReadCostPerMtok: 0,
    isDefault: true,
  },
  {
    provider: "openai-codex",
    modelName: "gpt-5.2",
    inputCostPerMtok: 0,
    outputCostPerMtok: 0,
    cacheReadCostPerMtok: 0,
    isDefault: true,
  },
  {
    provider: "openai-codex",
    modelName: "gpt-5.2-codex",
    inputCostPerMtok: 0,
    outputCostPerMtok: 0,
    cacheReadCostPerMtok: 0,
    isDefault: true,
  },
  {
    provider: "openai-codex",
    modelName: "gpt-5.3-codex",
    inputCostPerMtok: 0,
    outputCostPerMtok: 0,
    cacheReadCostPerMtok: 0,
    isDefault: true,
  },
  {
    provider: "openai-codex",
    modelName: "gpt-5.3-codex-spark",
    inputCostPerMtok: 0,
    outputCostPerMtok: 0,
    cacheReadCostPerMtok: 0,
    isDefault: true,
  },
  {
    provider: "openai-codex",
    modelName: "gpt-5.4",
    inputCostPerMtok: 0,
    outputCostPerMtok: 0,
    cacheReadCostPerMtok: 0,
    isDefault: true,
  },
  {
    provider: "openai-codex",
    modelName: "gpt-5.4-mini",
    inputCostPerMtok: 0,
    outputCostPerMtok: 0,
    cacheReadCostPerMtok: 0,
    isDefault: true,
  },
  {
    provider: "openai-codex",
    modelName: "gpt-5.5",
    inputCostPerMtok: 0,
    outputCostPerMtok: 0,
    cacheReadCostPerMtok: 0,
    isDefault: true,
  },
  // Google
  {
    provider: "google",
    modelName: "gemini-2.5-pro",
    inputCostPerMtok: 1.25,
    outputCostPerMtok: 10,
    isDefault: true,
  },
  // Open Source
  {
    provider: "opensource",
    modelName: "Big Pickle",
    inputCostPerMtok: 0,
    outputCostPerMtok: 0,
    cacheReadCostPerMtok: 0,
    isDefault: true,
  },
  {
    provider: "opensource",
    modelName: "Qwen3.6 Plus Free",
    inputCostPerMtok: 0,
    outputCostPerMtok: 0,
    cacheReadCostPerMtok: 0,
    isDefault: true,
  },
  {
    provider: "opensource",
    modelName: "Nemotron 3 Super Free",
    inputCostPerMtok: 0,
    outputCostPerMtok: 0,
    cacheReadCostPerMtok: 0,
    isDefault: true,
  },
  {
    provider: "opensource",
    modelName: "MiniMax M2.5 Free",
    inputCostPerMtok: 0,
    outputCostPerMtok: 0,
    cacheReadCostPerMtok: 0,
    isDefault: true,
  },
  {
    provider: "opensource",
    modelName: "MiniMax M2.5",
    inputCostPerMtok: 0.3,
    outputCostPerMtok: 1.2,
    cacheReadCostPerMtok: 0.06,
    cacheCreateCostPerMtok: 0.375,
    isDefault: true,
  },
  {
    provider: "opensource",
    modelName: "MiniMax M2.7",
    inputCostPerMtok: 0.3,
    outputCostPerMtok: 1.2,
    isDefault: true,
  },
  {
    provider: "opensource",
    modelName: "GLM 5.1",
    inputCostPerMtok: 1.4,
    outputCostPerMtok: 4.4,
    cacheReadCostPerMtok: 0.26,
    isDefault: true,
  },
  {
    provider: "opensource",
    modelName: "GLM 5",
    inputCostPerMtok: 1,
    outputCostPerMtok: 3.2,
    cacheReadCostPerMtok: 0.2,
    isDefault: true,
  },
  {
    provider: "opensource",
    modelName: "Kimi K2.5",
    inputCostPerMtok: 0.6,
    outputCostPerMtok: 3,
    cacheReadCostPerMtok: 0.1,
    isDefault: true,
  },
  {
    provider: "opensource",
    modelName: "Qwen3 Coder 480B",
    inputCostPerMtok: 0.45,
    outputCostPerMtok: 1.5,
    isDefault: true,
  },
  // Cursor
  {
    provider: "cursor",
    modelName: "Composer 2",
    inputCostPerMtok: 0.5,
    outputCostPerMtok: 2.5,
    cacheReadCostPerMtok: 0.2,
    isDefault: true,
  },
  {
    provider: "cursor",
    modelName: "Composer 2 (Fast)",
    inputCostPerMtok: 1.5,
    outputCostPerMtok: 7.5,
    cacheReadCostPerMtok: 0.35,
    isDefault: true,
  },
  // OpenCode Go (https://opencode.ai/zen/go/v1) — surfaced under the "opencode"
  // brand in the launch model picker. Pricing per models.dev. Tiered
  // context-over-200k pricing on MiMo rows is not modeled; we use the base tier.
  {
    provider: "opencode-go",
    modelName: "deepseek-v4-flash",
    inputCostPerMtok: 0.14,
    outputCostPerMtok: 0.28,
    cacheReadCostPerMtok: 0.0028,
    isDefault: true,
  },
  {
    provider: "opencode-go",
    modelName: "deepseek-v4-pro",
    inputCostPerMtok: 1.74,
    outputCostPerMtok: 3.48,
    cacheReadCostPerMtok: 0.0145,
    isDefault: true,
  },
  {
    provider: "opencode-go",
    modelName: "glm-5",
    inputCostPerMtok: 1,
    outputCostPerMtok: 3.2,
    cacheReadCostPerMtok: 0.2,
    isDefault: true,
  },
  {
    provider: "opencode-go",
    modelName: "glm-5.1",
    inputCostPerMtok: 1.4,
    outputCostPerMtok: 4.4,
    cacheReadCostPerMtok: 0.26,
    isDefault: true,
  },
  {
    provider: "opencode-go",
    modelName: "kimi-k2.5",
    inputCostPerMtok: 0.6,
    outputCostPerMtok: 3,
    cacheReadCostPerMtok: 0.1,
    isDefault: true,
  },
  {
    provider: "opencode-go",
    modelName: "kimi-k2.6",
    inputCostPerMtok: 0.32,
    outputCostPerMtok: 1.34,
    cacheReadCostPerMtok: 0.054,
    isDefault: true,
  },
  {
    provider: "opencode-go",
    modelName: "mimo-v2-omni",
    inputCostPerMtok: 0.4,
    outputCostPerMtok: 2,
    cacheReadCostPerMtok: 0.08,
    isDefault: true,
  },
  {
    provider: "opencode-go",
    modelName: "mimo-v2-pro",
    inputCostPerMtok: 1,
    outputCostPerMtok: 3,
    cacheReadCostPerMtok: 0.2,
    isDefault: true,
  },
  {
    provider: "opencode-go",
    modelName: "mimo-v2.5",
    inputCostPerMtok: 0.4,
    outputCostPerMtok: 2,
    cacheReadCostPerMtok: 0.08,
    isDefault: true,
  },
  {
    provider: "opencode-go",
    modelName: "mimo-v2.5-pro",
    inputCostPerMtok: 1,
    outputCostPerMtok: 3,
    cacheReadCostPerMtok: 0.2,
    isDefault: true,
  },
  {
    provider: "opencode-go",
    modelName: "minimax-m2.5",
    inputCostPerMtok: 0.3,
    outputCostPerMtok: 1.2,
    cacheReadCostPerMtok: 0.03,
    isDefault: true,
  },
  {
    provider: "opencode-go",
    modelName: "minimax-m2.7",
    inputCostPerMtok: 0.3,
    outputCostPerMtok: 1.2,
    cacheReadCostPerMtok: 0.06,
    isDefault: true,
  },
  {
    provider: "opencode-go",
    modelName: "qwen3.5-plus",
    inputCostPerMtok: 0.2,
    outputCostPerMtok: 1.2,
    cacheReadCostPerMtok: 0.02,
    cacheCreateCostPerMtok: 0.25,
    isDefault: true,
  },
  {
    provider: "opencode-go",
    modelName: "qwen3.6-plus",
    inputCostPerMtok: 0.5,
    outputCostPerMtok: 3,
    cacheReadCostPerMtok: 0.05,
    cacheCreateCostPerMtok: 0.625,
    isDefault: true,
  },
];

const LEGACY_OPENAI_MODELS_TO_REMOVE: DefaultCostModelDefinition[] = [
  {
    provider: "openai",
    modelName: "gpt-4o",
    inputCostPerMtok: 2.5,
    outputCostPerMtok: 10,
    isDefault: true,
  },
  {
    provider: "openai",
    modelName: "o3",
    inputCostPerMtok: 10,
    outputCostPerMtok: 40,
    isDefault: true,
  },
];

function costFieldsMatch(
  row: Pick<
    DbCostModelRow,
    | "input_cost_per_mtok"
    | "output_cost_per_mtok"
    | "cache_read_cost_per_mtok"
    | "cache_create_cost_per_mtok"
  >,
  model: Pick<
    UpsertCostModelParams,
    "inputCostPerMtok" | "outputCostPerMtok" | "cacheReadCostPerMtok" | "cacheCreateCostPerMtok"
  >
): boolean {
  return (
    row.input_cost_per_mtok === model.inputCostPerMtok &&
    row.output_cost_per_mtok === model.outputCostPerMtok &&
    (row.cache_read_cost_per_mtok ?? null) === (model.cacheReadCostPerMtok ?? null) &&
    (row.cache_create_cost_per_mtok ?? null) === (model.cacheCreateCostPerMtok ?? null)
  );
}

function findCostModelRow(
  db: DbHandle,
  provider: string,
  modelName: string
): DbCostModelRow | undefined {
  return db
    .prepare(
      `SELECT * FROM cost_models
       WHERE LOWER(provider) = LOWER(?) AND LOWER(model_name) = LOWER(?)
       LIMIT 1`
    )
    .get(provider, modelName) as DbCostModelRow | undefined;
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
  return costFromCostModelRow(row, tokens);
}

/**
 * Pure cost math from a resolved cost_models row and token counts.
 * Shared by computeCostFromTokens (single DB lookup) and the in-memory
 * recalculate path (one cost_models load, then resolve per row in memory).
 */
function costFromCostModelRow(row: DbCostModelRow, tokens: TokenCounts): number {
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

/**
 * Resolve the best-matching cost_models row for a model name from an
 * in-memory list, mirroring computeCostFromTokens's SQL matching:
 * exact normalized match first, then longest-prefix fuzzy match. Lets
 * callers price many token_usage rows without a DB query per row.
 */
function resolveCostModelRow(models: DbCostModelRow[], model: string): DbCostModelRow | undefined {
  const normalized = normalizeModelName(model);

  const exact = models.find((m) => m.model_name.toLowerCase() === normalized);
  if (exact) return exact;

  // Fuzzy: stored name is a prefix of input, or input is a prefix of stored
  // name. Prefer the longest model_name (mirrors ORDER BY LENGTH DESC).
  let best: DbCostModelRow | undefined;
  for (const m of models) {
    const name = m.model_name.toLowerCase();
    if (
      (normalized.startsWith(name) || name.startsWith(normalized)) &&
      (!best || m.model_name.length > best.model_name.length)
    ) {
      best = m;
    }
  }
  return best;
}

function parseAttributionTime(value: string | undefined | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function getAttributionWindow(
  params: ResolveTokenUsageAttributionParams
): AttributionWindow | null {
  const pointMs = parseAttributionTime(params.eventTime);
  const startMs = parseAttributionTime(params.eventStart) ?? pointMs;
  const endMs = parseAttributionTime(params.eventEnd) ?? pointMs ?? startMs;

  if (startMs === null || endMs === null) return null;
  return {
    startMs: Math.min(startMs, endMs),
    endMs: Math.max(startMs, endMs),
  };
}

function getSessionEventWindow(
  candidate: TokenUsageAttributionCandidate
): AttributionWindow | null {
  const startedMs = parseAttributionTime(candidate.startedAt);
  if (startedMs === null) return null;

  const firstEventMs = parseAttributionTime(candidate.firstEventAt);
  const endedMs = parseAttributionTime(candidate.endedAt);
  const lastEventMs = parseAttributionTime(candidate.lastEventAt);
  const startMs = firstEventMs === null ? startedMs : Math.min(startedMs, firstEventMs);
  const endCandidates = [endedMs, lastEventMs, startedMs].filter((ms): ms is number => ms !== null);
  const endMs = Math.max(...endCandidates);

  return { startMs, endMs: Math.max(startMs, endMs) };
}

function overlapMs(left: AttributionWindow, right: AttributionWindow): number {
  return Math.max(0, Math.min(left.endMs, right.endMs) - Math.max(left.startMs, right.startMs));
}

function pointInWindow(pointMs: number, window: AttributionWindow): boolean {
  return pointMs >= window.startMs && pointMs <= window.endMs;
}

function windowsMatch(left: AttributionWindow, right: AttributionWindow): boolean {
  if (left.startMs === left.endMs) return pointInWindow(left.startMs, right);
  if (right.startMs === right.endMs) return pointInWindow(right.startMs, left);
  return overlapMs(left, right) > 0;
}

function loadProjectAttributionCandidates(
  db: DbHandle,
  projectPath: string
): TokenUsageAttributionCandidate[] {
  return db
    .prepare(
      `SELECT
         ts.id as telemetrySessionId,
         ts.ticket_id as ticketId,
         ts.started_at as startedAt,
         ts.ended_at as endedAt,
         MIN(te.created_at) as firstEventAt,
         MAX(te.created_at) as lastEventAt
       FROM telemetry_sessions ts
       LEFT JOIN telemetry_events te ON te.session_id = ts.id
       LEFT JOIN tickets t ON t.id = ts.ticket_id
       LEFT JOIN projects p ON p.id = COALESCE(ts.project_id, t.project_id)
       WHERE p.path = ?
       GROUP BY ts.id
       ORDER BY ts.started_at`
    )
    .all(projectPath) as TokenUsageAttributionCandidate[];
}

function findBestWindowCandidate(
  candidates: TokenUsageAttributionCandidate[],
  transcriptWindow: AttributionWindow
): TokenUsageAttributionCandidate | "ambiguous" | null {
  const matches = candidates
    .map((candidate) => {
      const sessionWindow = getSessionEventWindow(candidate);
      if (!sessionWindow || !windowsMatch(transcriptWindow, sessionWindow)) return null;
      return {
        candidate,
        overlap: overlapMs(transcriptWindow, sessionWindow),
      };
    })
    .filter((match): match is { candidate: TokenUsageAttributionCandidate; overlap: number } =>
      Boolean(match)
    )
    .sort((left, right) => right.overlap - left.overlap);

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!.candidate;

  const [best, second] = matches;
  if (best && second && best.overlap > second.overlap) return best.candidate;
  return "ambiguous";
}

function activeCandidatesForWindow(
  candidates: TokenUsageAttributionCandidate[],
  transcriptWindow: AttributionWindow | null
): TokenUsageAttributionCandidate[] {
  return candidates.filter((candidate) => {
    const startedMs = parseAttributionTime(candidate.startedAt);
    const endedMs = parseAttributionTime(candidate.endedAt);
    if (startedMs === null) return false;
    if (!transcriptWindow) return endedMs === null;
    return (
      startedMs <= transcriptWindow.endMs &&
      (endedMs === null || endedMs >= transcriptWindow.startMs)
    );
  });
}

function attributionResult(
  candidate: TokenUsageAttributionCandidate,
  source: TokenUsageAttributionResult["source"]
): TokenUsageAttributionResult {
  return {
    telemetrySessionId: candidate.telemetrySessionId,
    ...(candidate.ticketId ? { ticketId: candidate.ticketId } : {}),
    source,
    skipped: false,
  };
}

function skippedAttribution(warning: string): TokenUsageAttributionResult {
  return {
    source: "skipped",
    skipped: true,
    warning,
  };
}

/**
 * Resolve token usage attribution without falling back to an arbitrary global
 * active session. Explicit session/ticket flags always win; otherwise callers
 * must provide project context plus transcript/event timing. Ambiguous matches
 * return a skipped result so hooks can log and avoid charging the wrong ticket.
 */
export function resolveTokenUsageAttribution(
  db: DbHandle,
  params: ResolveTokenUsageAttributionParams
): TokenUsageAttributionResult {
  if (params.telemetrySessionId) {
    return {
      telemetrySessionId: params.telemetrySessionId,
      ...(params.ticketId ? { ticketId: params.ticketId } : {}),
      source: "explicit",
      skipped: false,
    };
  }

  if (!params.projectPath) {
    if (params.ticketId) {
      return {
        ticketId: params.ticketId,
        source: "explicit",
        skipped: false,
      };
    }
    return skippedAttribution(
      "Token usage attribution skipped: provide --session/--ticket or --project-path with transcript/event timing."
    );
  }

  let candidates = loadProjectAttributionCandidates(db, params.projectPath);
  if (params.ticketId) {
    candidates = candidates.filter((candidate) => candidate.ticketId === params.ticketId);
  }
  if (candidates.length === 0) {
    if (params.ticketId) {
      return {
        ticketId: params.ticketId,
        source: "explicit",
        skipped: false,
      };
    }
    return skippedAttribution(
      `Token usage attribution skipped: no telemetry sessions found for project ${params.projectPath}.`
    );
  }

  const transcriptWindow = getAttributionWindow(params);
  if (transcriptWindow) {
    const eventWindowMatch = findBestWindowCandidate(candidates, transcriptWindow);
    if (eventWindowMatch === "ambiguous") {
      return skippedAttribution(
        `Token usage attribution skipped: transcript ${params.transcriptPath ?? "<unknown>"} overlaps multiple telemetry sessions for project ${params.projectPath}.`
      );
    }
    if (eventWindowMatch) return attributionResult(eventWindowMatch, "project-event-window");
  }

  const activeMatches = activeCandidatesForWindow(candidates, transcriptWindow);
  if (activeMatches.length === 1)
    return attributionResult(activeMatches[0]!, "project-active-session");

  if (activeMatches.length > 1) {
    return skippedAttribution(
      `Token usage attribution skipped: ${activeMatches.length} active telemetry sessions match project ${params.projectPath}; pass --session or --ticket explicitly.`
    );
  }

  if (params.ticketId) {
    return {
      ticketId: params.ticketId,
      source: "explicit",
      skipped: false,
    };
  }

  return skippedAttribution(
    `Token usage attribution skipped: no telemetry session window matched transcript ${params.transcriptPath ?? "<unknown>"} for project ${params.projectPath}.`
  );
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
    sourceRef,
    providerEventStart,
    providerEventEnd,
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

  if (sourceRef && telemetrySessionId) {
    const existing = db
      .prepare(
        `SELECT * FROM token_usage
         WHERE telemetry_session_id = ? AND source_ref = ? AND model = ?
         LIMIT 1`
      )
      .get(telemetrySessionId, sourceRef, model) as DbTokenUsageRow | undefined;
    if (existing) return parseTokenUsageRow(existing);
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
      cache_read_tokens, cache_creation_tokens, cost_usd, source, source_ref,
      provider_event_start, provider_event_end, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    sourceRef ?? null,
    providerEventStart ?? null,
    providerEventEnd ?? null,
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
// Recalculate
// ============================================

export interface RecalculateResult {
  totalRows: number;
  updatedRows: number;
  sessionsUpdated: number;
  oldTotalCost: number;
  newTotalCost: number;
}

/**
 * Recalculate cost_usd for all token_usage rows using current cost_models pricing.
 * Also rebuilds telemetry_sessions aggregate totals.
 */
export function recalculateCosts(db: DbHandle): RecalculateResult {
  syncDefaultCostModels(db);

  const rows = db
    .prepare(
      `SELECT id, model, input_tokens, output_tokens,
              cache_read_tokens, cache_creation_tokens, cost_usd,
              telemetry_session_id
       FROM token_usage`
    )
    .all() as Array<{
    id: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number | null;
    cache_creation_tokens: number | null;
    cost_usd: number | null;
    telemetry_session_id: string | null;
  }>;

  // Load pricing once (after syncDefaultCostModels above) and resolve each
  // row's model in memory — avoids ~2 cost_models lookups per token_usage row.
  const costModels = db.prepare("SELECT * FROM cost_models").all() as DbCostModelRow[];

  let updatedRows = 0;
  let oldTotalCost = 0;
  let newTotalCost = 0;

  const updateStmt = db.prepare("UPDATE token_usage SET cost_usd = ? WHERE id = ?");

  const run = db.transaction(() => {
    for (const row of rows) {
      const oldCost = row.cost_usd ?? 0;
      oldTotalCost += oldCost;

      const matched = resolveCostModelRow(costModels, row.model);
      const newCost = matched
        ? costFromCostModelRow(matched, {
            inputTokens: row.input_tokens,
            outputTokens: row.output_tokens,
            cacheReadTokens: row.cache_read_tokens ?? 0,
            cacheCreationTokens: row.cache_creation_tokens ?? 0,
          })
        : 0;
      newTotalCost += newCost;

      if (Math.abs(newCost - oldCost) > 0.000001) {
        updateStmt.run(newCost, row.id);
        updatedRows++;
      }
    }

    // Rebuild telemetry_sessions aggregates from scratch
    const sessions = db
      .prepare(
        `SELECT DISTINCT telemetry_session_id
         FROM token_usage
         WHERE telemetry_session_id IS NOT NULL`
      )
      .all() as Array<{ telemetry_session_id: string }>;

    const rebuildStmt = db.prepare(
      `UPDATE telemetry_sessions
       SET total_input_tokens = (
             SELECT COALESCE(SUM(input_tokens), 0) FROM token_usage WHERE telemetry_session_id = ?
           ),
           total_output_tokens = (
             SELECT COALESCE(SUM(output_tokens), 0) FROM token_usage WHERE telemetry_session_id = ?
           ),
           total_cost_usd = (
             SELECT COALESCE(SUM(cost_usd), 0) FROM token_usage WHERE telemetry_session_id = ?
           )
       WHERE id = ?`
    );

    for (const s of sessions) {
      rebuildStmt.run(
        s.telemetry_session_id,
        s.telemetry_session_id,
        s.telemetry_session_id,
        s.telemetry_session_id
      );
    }

    return sessions.length;
  });

  const sessionsUpdated = run();

  return {
    totalRows: rows.length,
    updatedRows,
    sessionsUpdated,
    oldTotalCost,
    newTotalCost,
  };
}

// ============================================
// Cost Explorer
// ============================================

/**
 * Parse state history JSON safely, returning empty array on failure.
 */
function safeParseStateHistory(json: string | null | undefined): StateHistoryEntry[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as StateHistoryEntry[];
  } catch {
    return [];
  }
}

/**
 * Compute time-proportional cost attribution per workflow state.
 *
 * Takes ralph sessions with their state histories and total cost,
 * computes time spent in each state from consecutive timestamps,
 * and attributes the session cost proportionally.
 *
 * Falls back to equal attribution if state history is incomplete.
 */
export function computeStageCosts(
  sessions: Array<{
    stateHistory: StateHistoryEntry[];
    totalCostUsd: number;
    completedAt: string | null;
  }>
): Map<RalphSessionState, { costUsd: number; durationMs: number }> {
  const result = new Map<RalphSessionState, { costUsd: number; durationMs: number }>();

  for (const session of sessions) {
    const { stateHistory, totalCostUsd } = session;
    if (totalCostUsd <= 0) continue;

    if (stateHistory.length < 2) {
      // Single-state or empty: attribute all cost to the one state
      const state = stateHistory[0]?.state ?? "idle";
      const existing = result.get(state) ?? { costUsd: 0, durationMs: 0 };
      existing.costUsd += totalCostUsd;
      result.set(state, existing);
      continue;
    }

    // Compute duration per state from consecutive timestamps
    const segments: Array<{ state: RalphSessionState; durationMs: number }> = [];
    let totalDurationMs = 0;

    for (let i = 0; i < stateHistory.length - 1; i++) {
      const current = stateHistory[i]!;
      const next = stateHistory[i + 1]!;
      const start = new Date(current.timestamp).getTime();
      const end = new Date(next.timestamp).getTime();
      const durationMs = Math.max(0, end - start);
      segments.push({ state: current.state, durationMs });
      totalDurationMs += durationMs;
    }

    // Handle the last state: use completedAt or give it 0 duration
    const lastEntry = stateHistory[stateHistory.length - 1]!;
    if (session.completedAt && lastEntry.state !== "done") {
      const lastDuration = Math.max(
        0,
        new Date(session.completedAt).getTime() - new Date(lastEntry.timestamp).getTime()
      );
      segments.push({ state: lastEntry.state, durationMs: lastDuration });
      totalDurationMs += lastDuration;
    }

    // Attribute cost proportionally
    if (totalDurationMs <= 0) {
      // Equal attribution fallback
      const perState = totalCostUsd / segments.length;
      for (const seg of segments) {
        const existing = result.get(seg.state) ?? { costUsd: 0, durationMs: 0 };
        existing.costUsd += perState;
        existing.durationMs += seg.durationMs;
        result.set(seg.state, existing);
      }
    } else {
      for (const seg of segments) {
        const fraction = seg.durationMs / totalDurationMs;
        const existing = result.get(seg.state) ?? { costUsd: 0, durationMs: 0 };
        existing.costUsd += totalCostUsd * fraction;
        existing.durationMs += seg.durationMs;
        result.set(seg.state, existing);
      }
    }
  }

  return result;
}

/**
 * Get detailed cost breakdown for a ticket including stage and session-level data.
 */
/** A ralph_session joined to its matched telemetry cost over the session window. */
interface RalphSessionCostRow {
  id: string;
  state_history: string | null;
  started_at: string;
  completed_at: string | null;
  outcome: string | null;
  total_cost_usd: number;
}

/** A per-session token_usage rollup joined to its telemetry_session metadata. */
interface SessionBreakdownRow {
  session_id: string;
  model: string;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  started_at: string | null;
  completed_at: string | null;
  outcome: string | null;
}

/**
 * Derive per-stage cost entries from a ticket's ralph sessions, attributing
 * each session's cost across its workflow states and expressing each stage as
 * a percentage of the ticket's all-time total cost.
 */
function buildStageEntries(
  ralphRows: RalphSessionCostRow[],
  baseTotalCostUsd: number
): StageCostEntry[] {
  const sessionsForStages = ralphRows.map((r) => ({
    stateHistory: safeParseStateHistory(r.state_history),
    totalCostUsd: r.total_cost_usd,
    completedAt: r.completed_at,
  }));

  const stageCostMap = computeStageCosts(sessionsForStages);

  const stages: StageCostEntry[] = [];
  for (const [stage, data] of stageCostMap) {
    if (stage === "done" || stage === "idle") continue;
    stages.push({
      stage,
      costUsd: data.costUsd,
      durationMs: data.durationMs,
      percentage: baseTotalCostUsd > 0 ? (data.costUsd / baseTotalCostUsd) * 100 : 0,
    });
  }
  stages.sort((a, b) => b.costUsd - a.costUsd);
  return stages;
}

/** Map raw per-session rollup rows into the TicketCostDetail session shape. */
function mapSessionBreakdown(rows: SessionBreakdownRow[]): TicketCostDetail["sessions"] {
  return rows.map((r) => ({
    sessionId: r.session_id,
    costUsd: r.cost_usd ?? 0,
    inputTokens: r.input_tokens ?? 0,
    outputTokens: r.output_tokens ?? 0,
    model: r.model,
    startedAt: r.started_at ?? "",
    completedAt: r.completed_at,
    outcome: r.outcome,
  }));
}

export function getTicketCostDetail(db: DbHandle, ticketId: string): TicketCostDetail {
  const base = getTicketCost(db, ticketId);

  // Get ralph sessions for this ticket with matched telemetry cost
  const ralphRows = db
    .prepare(
      `SELECT
         rs.id, rs.state_history, rs.started_at, rs.completed_at, rs.outcome,
         COALESCE(SUM(tu.cost_usd), 0) as total_cost_usd
       FROM ralph_sessions rs
       LEFT JOIN token_usage tu ON tu.ticket_id = rs.ticket_id
         AND tu.recorded_at >= rs.started_at
         AND (tu.recorded_at <= rs.completed_at OR rs.completed_at IS NULL)
       WHERE rs.ticket_id = ?
       GROUP BY rs.id`
    )
    .all(ticketId) as RalphSessionCostRow[];

  const stages = buildStageEntries(ralphRows, base.totalCostUsd);

  // Get per-session breakdown
  const sessionRows = db
    .prepare(
      `SELECT
         tu.telemetry_session_id as session_id,
         COALESCE(tu.model, 'unknown') as model,
         SUM(tu.cost_usd) as cost_usd,
         SUM(tu.input_tokens) as input_tokens,
         SUM(tu.output_tokens) as output_tokens,
         ts.started_at,
         ts.ended_at as completed_at,
         ts.outcome
       FROM token_usage tu
       LEFT JOIN telemetry_sessions ts ON tu.telemetry_session_id = ts.id
       WHERE tu.ticket_id = ?
         AND tu.telemetry_session_id IS NOT NULL
       GROUP BY tu.telemetry_session_id
       ORDER BY ts.started_at DESC`
    )
    .all(ticketId) as SessionBreakdownRow[];

  const sessions = mapSessionBreakdown(sessionRows);

  return { ...base, stages, sessions };
}

/**
 * SQLite caps bound parameters per statement; chunk IN-lists so large id sets
 * stay well under the limit across SQLite versions.
 */
const ID_CHUNK_SIZE = 500;

export function chunkIds(ids: string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + ID_CHUNK_SIZE));
  }
  return chunks;
}

/** Append a value to the array bucketed under key, creating the bucket if absent. */
function pushToMapList<V>(map: Map<string, V[]>, key: string, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * All-time total cost per ticket (no date filter), matching the denominator
 * getTicketCost uses for stage percentages. Pre-fetched in one query per chunk
 * instead of one per ticket.
 */
function loadTicketBaseCostTotals(db: DbHandle, ticketIds: string[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const ids of chunkIds(ticketIds)) {
    const placeholders = ids.map(() => "?").join(", ");
    const rows = db
      .prepare(
        `SELECT ticket_id, COALESCE(SUM(cost_usd), 0) as total_cost_usd
         FROM token_usage
         WHERE ticket_id IN (${placeholders})
         GROUP BY ticket_id`
      )
      .all(...ids) as Array<{ ticket_id: string; total_cost_usd: number }>;
    for (const row of rows) totals.set(row.ticket_id, row.total_cost_usd);
  }
  return totals;
}

/** Ralph sessions with matched telemetry cost, bucketed by ticket id. */
function loadRalphSessionCostsByTicket(
  db: DbHandle,
  ticketIds: string[]
): Map<string, RalphSessionCostRow[]> {
  const byTicket = new Map<string, RalphSessionCostRow[]>();
  for (const ids of chunkIds(ticketIds)) {
    const placeholders = ids.map(() => "?").join(", ");
    const rows = db
      .prepare(
        `SELECT
           rs.ticket_id as ticket_id,
           rs.id, rs.state_history, rs.started_at, rs.completed_at, rs.outcome,
           COALESCE(SUM(tu.cost_usd), 0) as total_cost_usd
         FROM ralph_sessions rs
         LEFT JOIN token_usage tu ON tu.ticket_id = rs.ticket_id
           AND tu.recorded_at >= rs.started_at
           AND (tu.recorded_at <= rs.completed_at OR rs.completed_at IS NULL)
         WHERE rs.ticket_id IN (${placeholders})
         GROUP BY rs.id`
      )
      .all(...ids) as Array<RalphSessionCostRow & { ticket_id: string }>;
    for (const row of rows) pushToMapList(byTicket, row.ticket_id, row);
  }
  return byTicket;
}

/** Per-session token_usage rollups joined to telemetry metadata, bucketed by ticket id. */
function loadSessionBreakdownByTicket(
  db: DbHandle,
  ticketIds: string[]
): Map<string, SessionBreakdownRow[]> {
  const byTicket = new Map<string, SessionBreakdownRow[]>();
  for (const ids of chunkIds(ticketIds)) {
    const placeholders = ids.map(() => "?").join(", ");
    const rows = db
      .prepare(
        `SELECT
           tu.ticket_id as ticket_id,
           tu.telemetry_session_id as session_id,
           COALESCE(tu.model, 'unknown') as model,
           SUM(tu.cost_usd) as cost_usd,
           SUM(tu.input_tokens) as input_tokens,
           SUM(tu.output_tokens) as output_tokens,
           ts.started_at,
           ts.ended_at as completed_at,
           ts.outcome
         FROM token_usage tu
         LEFT JOIN telemetry_sessions ts ON tu.telemetry_session_id = ts.id
         WHERE tu.ticket_id IN (${placeholders})
           AND tu.telemetry_session_id IS NOT NULL
         GROUP BY tu.ticket_id, tu.telemetry_session_id
         ORDER BY ts.started_at DESC`
      )
      .all(...ids) as Array<SessionBreakdownRow & { ticket_id: string }>;
    for (const row of rows) pushToMapList(byTicket, row.ticket_id, row);
  }
  return byTicket;
}

/**
 * Build the full hierarchical cost explorer tree.
 *
 * Returns a CostExplorerNode tree: Project → Epics → Tickets → Stages → Sessions.
 * Tickets without an epic are grouped under "[Unassigned]".
 */
export function getCostExplorerData(db: DbHandle, params: CostExplorerParams): CostExplorerNode {
  const since = params.since ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Build conditions
  const conditions: string[] = ["(tu.recorded_at >= ? OR tu.recorded_at IS NULL)"];
  const queryParams: (string | number)[] = [since];

  if (params.projectId) {
    conditions.push("t.project_id = ?");
    queryParams.push(params.projectId);
  }

  const whereClause = conditions.join(" AND ");

  // Ticket-level cost with epic grouping
  const ticketRows = db
    .prepare(
      `SELECT
         t.id as ticket_id, t.title, t.status, t.epic_id,
         e.title as epic_title, e.color as epic_color,
         COALESCE(SUM(tu.cost_usd), 0) as cost_usd,
         COALESCE(SUM(tu.input_tokens), 0) as input_tokens,
         COALESCE(SUM(tu.output_tokens), 0) as output_tokens,
         COALESCE(SUM(tu.cache_read_tokens), 0) as cache_read_tokens,
         COALESCE(SUM(tu.cache_creation_tokens), 0) as cache_creation_tokens,
         COUNT(DISTINCT tu.telemetry_session_id) as session_count
       FROM tickets t
       LEFT JOIN epics e ON t.epic_id = e.id
       LEFT JOIN token_usage tu ON tu.ticket_id = t.id
       WHERE ${whereClause}
       GROUP BY t.id
       HAVING cost_usd > 0
       ORDER BY cost_usd DESC`
    )
    .all(...queryParams) as Array<{
    ticket_id: string;
    title: string;
    status: string;
    epic_id: string | null;
    epic_title: string | null;
    epic_color: string | null;
    cost_usd: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    session_count: number;
  }>;

  // Group by epic
  const epicMap = new Map<
    string,
    { title: string; color: string | null; tickets: typeof ticketRows }
  >();
  const unassigned: typeof ticketRows = [];

  for (const row of ticketRows) {
    if (row.epic_id) {
      const existing = epicMap.get(row.epic_id);
      if (existing) {
        existing.tickets.push(row);
      } else {
        epicMap.set(row.epic_id, {
          title: row.epic_title ?? "Unknown Epic",
          color: row.epic_color,
          tickets: [row],
        });
      }
    } else {
      unassigned.push(row);
    }
  }

  // Pre-fetch stage + session inputs for ALL tickets in a fixed number of
  // queries (was ~4 queries per ticket via getTicketCostDetail).
  const ticketIds = ticketRows.map((r) => r.ticket_id);
  const baseTotalsByTicket = loadTicketBaseCostTotals(db, ticketIds);
  const ralphByTicket = loadRalphSessionCostsByTicket(db, ticketIds);
  const sessionsByTicket = loadSessionBreakdownByTicket(db, ticketIds);

  // Build ticket detail — get stage breakdowns for each ticket
  function buildTicketNode(row: (typeof ticketRows)[0]): CostExplorerNode {
    // baseTotalCost is the ticket's all-time cost (no date filter), matching
    // getTicketCost's denominator so stage percentages stay consistent with the
    // per-ticket detail view — even though the node's own value uses the
    // date-filtered row.cost_usd.
    const baseTotalCost = baseTotalsByTicket.get(row.ticket_id) ?? 0;
    const stages = buildStageEntries(ralphByTicket.get(row.ticket_id) ?? [], baseTotalCost);
    const sessions = mapSessionBreakdown(sessionsByTicket.get(row.ticket_id) ?? []);

    // Build stage children
    const stageChildren: CostExplorerNode[] = stages.map(
      (stage) =>
        ({
          id: `${row.ticket_id}-${stage.stage}`,
          name: stage.stage,
          type: "stage" as const,
          value: stage.costUsd,
          costUsd: stage.costUsd,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          sessionCount: 0,
          metadata: {
            durationMs: stage.durationMs,
            percentage: Math.round(stage.percentage * 10) / 10,
          },
        }) satisfies CostExplorerNode
    );

    // If no stages, add session-level children directly
    if (stageChildren.length === 0 && sessions.length > 0) {
      const sessionChildren: CostExplorerNode[] = sessions.map(
        (s) =>
          ({
            id: s.sessionId,
            name: `Session ${s.sessionId.substring(0, 8)}`,
            type: "session" as const,
            value: s.costUsd,
            costUsd: s.costUsd,
            inputTokens: s.inputTokens,
            outputTokens: s.outputTokens,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            sessionCount: 1,
            metadata: {
              model: s.model ?? null,
              startedAt: s.startedAt,
              completedAt: s.completedAt ?? null,
              outcome: s.outcome ?? null,
            },
          }) satisfies CostExplorerNode
      );

      return {
        id: row.ticket_id,
        name: row.title,
        type: "ticket",
        value: row.cost_usd,
        costUsd: row.cost_usd,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        cacheReadTokens: row.cache_read_tokens,
        cacheCreationTokens: row.cache_creation_tokens,
        sessionCount: row.session_count,
        children: sessionChildren,
        metadata: { status: row.status },
      };
    }

    return {
      id: row.ticket_id,
      name: row.title,
      type: "ticket",
      value: row.cost_usd,
      costUsd: row.cost_usd,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      cacheReadTokens: row.cache_read_tokens,
      cacheCreationTokens: row.cache_creation_tokens,
      sessionCount: row.session_count,
      children: stageChildren.length > 0 ? stageChildren : undefined,
      metadata: { status: row.status },
    };
  }

  // Build epic nodes
  const epicNodes: CostExplorerNode[] = [];
  for (const [epicId, epic] of epicMap) {
    const ticketNodes = epic.tickets.map(buildTicketNode);
    const epicCost = ticketNodes.reduce((sum, t) => sum + t.costUsd, 0);
    const epicInput = ticketNodes.reduce((sum, t) => sum + t.inputTokens, 0);
    const epicOutput = ticketNodes.reduce((sum, t) => sum + t.outputTokens, 0);
    const epicCacheRead = ticketNodes.reduce((sum, t) => sum + t.cacheReadTokens, 0);
    const epicCacheCreate = ticketNodes.reduce((sum, t) => sum + t.cacheCreationTokens, 0);
    const epicSessions = ticketNodes.reduce((sum, t) => sum + t.sessionCount, 0);

    epicNodes.push({
      id: epicId,
      name: epic.title,
      type: "epic",
      value: epicCost,
      costUsd: epicCost,
      inputTokens: epicInput,
      outputTokens: epicOutput,
      cacheReadTokens: epicCacheRead,
      cacheCreationTokens: epicCacheCreate,
      sessionCount: epicSessions,
      children: ticketNodes,
      metadata: { color: epic.color },
    });
  }

  // Build unassigned node if needed
  if (unassigned.length > 0) {
    const ticketNodes = unassigned.map(buildTicketNode);
    const uCost = ticketNodes.reduce((sum, t) => sum + t.costUsd, 0);
    const uInput = ticketNodes.reduce((sum, t) => sum + t.inputTokens, 0);
    const uOutput = ticketNodes.reduce((sum, t) => sum + t.outputTokens, 0);
    const uCacheRead = ticketNodes.reduce((sum, t) => sum + t.cacheReadTokens, 0);
    const uCacheCreate = ticketNodes.reduce((sum, t) => sum + t.cacheCreationTokens, 0);
    const uSessions = ticketNodes.reduce((sum, t) => sum + t.sessionCount, 0);

    epicNodes.push({
      id: "unassigned",
      name: "[Unassigned]",
      type: "unassigned",
      value: uCost,
      costUsd: uCost,
      inputTokens: uInput,
      outputTokens: uOutput,
      cacheReadTokens: uCacheRead,
      cacheCreationTokens: uCacheCreate,
      sessionCount: uSessions,
      children: ticketNodes,
    });
  }

  // Sort epics by cost descending
  epicNodes.sort((a, b) => b.costUsd - a.costUsd);

  // Root node
  const totalCost = epicNodes.reduce((sum, e) => sum + e.costUsd, 0);
  const totalInput = epicNodes.reduce((sum, e) => sum + e.inputTokens, 0);
  const totalOutput = epicNodes.reduce((sum, e) => sum + e.outputTokens, 0);
  const totalCacheRead = epicNodes.reduce((sum, e) => sum + e.cacheReadTokens, 0);
  const totalCacheCreate = epicNodes.reduce((sum, e) => sum + e.cacheCreationTokens, 0);
  const totalSessions = epicNodes.reduce((sum, e) => sum + e.sessionCount, 0);

  return {
    id: "root",
    name: "All Projects",
    type: "project",
    value: totalCost,
    costUsd: totalCost,
    inputTokens: totalInput,
    outputTokens: totalOutput,
    cacheReadTokens: totalCacheRead,
    cacheCreationTokens: totalCacheCreate,
    sessionCount: totalSessions,
    children: epicNodes,
  };
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

  const insertAll = db.transaction(() => {
    for (const model of DEFAULT_COST_MODELS) {
      upsertCostModel(db, model);
    }
  });

  insertAll();
  return DEFAULT_COST_MODELS.length;
}

/**
 * Update built-in pricing rows in existing databases without clobbering
 * arbitrary custom models. This only replaces known legacy defaults,
 * refreshes rows already marked as defaults, and inserts missing defaults.
 */
export function syncDefaultCostModels(db: DbHandle): {
  inserted: number;
  updated: number;
  removed: number;
} {
  let inserted = 0;
  let updated = 0;
  let removed = 0;

  const sync = db.transaction(() => {
    for (const legacyModel of LEGACY_OPENAI_MODELS_TO_REMOVE) {
      const existing = findCostModelRow(db, legacyModel.provider, legacyModel.modelName);
      if (existing && costFieldsMatch(existing, legacyModel)) {
        db.prepare("DELETE FROM cost_models WHERE id = ?").run(existing.id);
        removed += 1;
      }
    }

    for (const model of DEFAULT_COST_MODELS) {
      const existing = findCostModelRow(db, model.provider, model.modelName);
      if (!existing) {
        upsertCostModel(db, model);
        inserted += 1;
        continue;
      }

      const matchesLegacyRow =
        model.legacyRowsToReplace?.some((legacyRow) => costFieldsMatch(existing, legacyRow)) ??
        false;
      const shouldUpdate =
        (existing.is_default === 1 && !costFieldsMatch(existing, model)) || matchesLegacyRow;
      if (!shouldUpdate) continue;

      const updateParams: UpsertCostModelParams = {
        id: existing.id,
        provider: model.provider,
        modelName: model.modelName,
        inputCostPerMtok: model.inputCostPerMtok,
        outputCostPerMtok: model.outputCostPerMtok,
        isDefault: true,
      };
      if (model.cacheReadCostPerMtok != null) {
        updateParams.cacheReadCostPerMtok = model.cacheReadCostPerMtok;
      }
      if (model.cacheCreateCostPerMtok != null) {
        updateParams.cacheCreateCostPerMtok = model.cacheCreateCostPerMtok;
      }

      upsertCostModel(db, updateParams);
      updated += 1;
    }
  });

  sync();
  return { inserted, updated, removed };
}
