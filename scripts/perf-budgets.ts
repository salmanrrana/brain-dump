/**
 * Typed loader for docs/performance/perf-budgets.json — the single source of
 * truth for the performance validation harness.
 *
 * Consumed by:
 * - scripts/analyze-client-bundle.ts (`--check` mode → `pnpm perf:check`)
 * - e2e/perf-production.spec.ts (production browser-flow assertions)
 * - e2e/perf-renders.spec.ts (dev render-count assertions)
 *
 * Reading the budgets from one committed JSON file keeps the gate, the specs,
 * and the documented thresholds from drifting apart.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface ChunkBudget {
  /** Anchored regex (string form) identifying the asset by basename. */
  pattern: string;
  /** Hard ceiling — exceeding this fails the gate (non-zero exit). */
  ceilingBytes: number;
  /** North-star target. Exceeding it only warns. */
  aspirationalBytes?: number;
  note?: string;
}

export interface ChunkException {
  /** Substring (case-insensitive) matched against the asset basename. */
  pattern: string;
  ceilingBytes: number;
  note?: string;
}

export interface BundleBudgets {
  mainChunk: ChunkBudget;
  initialRootTotal: {
    ceilingBytes: number;
    aspirationalBytes?: number;
    note?: string;
  };
  perScriptCeilingBytes: number;
  knownLargeChunkExceptions: ChunkException[];
  forbiddenInInitialChunks: string[];
}

export interface RuntimeBudgets {
  ttfbMs: number;
  lcpMs: number;
  clsScore: number;
  inpMs: number;
  boardRenderCountCeiling: number;
  warmRenavMaxLoaderFetches: number;
  warmRenavMaxDataRequests: number;
  forbiddenRuntimeChunkUrls: string[];
  maxForbiddenChunksLoaded: number;
}

export interface PerfBudgets {
  bundle: BundleBudgets;
  runtime: RuntimeBudgets;
}

const BUDGETS_PATH = resolve(import.meta.dirname, "..", "docs/performance/perf-budgets.json");

/**
 * Load and validate the committed performance budgets.
 * Throws a descriptive error if the file is missing or structurally invalid,
 * so a malformed budgets file fails loudly instead of silently disabling the gate.
 */
export function loadPerfBudgets(): PerfBudgets {
  let raw: string;
  try {
    raw = readFileSync(BUDGETS_PATH, "utf8");
  } catch (cause) {
    throw new Error(
      `Could not read performance budgets at ${BUDGETS_PATH}. The perf harness cannot run without it.`,
      { cause }
    );
  }

  const parsed = JSON.parse(raw) as Partial<PerfBudgets>;
  const bundle = parsed.bundle;
  const runtime = parsed.runtime;

  if (!bundle?.mainChunk || typeof bundle.perScriptCeilingBytes !== "number") {
    throw new Error(
      `Malformed perf-budgets.json: missing a complete "bundle" section. Check ${BUDGETS_PATH}.`
    );
  }
  if (!runtime || typeof runtime.boardRenderCountCeiling !== "number") {
    throw new Error(
      `Malformed perf-budgets.json: missing a complete "runtime" section. Check ${BUDGETS_PATH}.`
    );
  }

  return { bundle, runtime };
}

export function formatBytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(2)} kB`;
}
