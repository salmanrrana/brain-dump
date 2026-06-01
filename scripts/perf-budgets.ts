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

  let parsed: Partial<PerfBudgets>;
  try {
    parsed = JSON.parse(raw) as Partial<PerfBudgets>;
  } catch (cause) {
    throw new Error(
      `perf-budgets.json at ${BUDGETS_PATH} is not valid JSON (check for trailing commas or comments).`,
      { cause }
    );
  }

  const bundle = parsed.bundle;
  const runtime = parsed.runtime;

  // Validate every field the gate and specs read, so a partially-stripped file
  // fails loudly here instead of producing `undefined` thresholds that make
  // assertions pass vacuously (e.g. `value <= undefined` → NaN compare).
  const fail = (detail: string): never => {
    throw new Error(`Malformed perf-budgets.json: ${detail}. Check ${BUDGETS_PATH}.`);
  };

  if (!bundle) fail('missing the "bundle" section');
  if (!bundle!.mainChunk || typeof bundle!.mainChunk.ceilingBytes !== "number") {
    fail("bundle.mainChunk.ceilingBytes must be a number");
  }
  if (typeof bundle!.perScriptCeilingBytes !== "number") {
    fail("bundle.perScriptCeilingBytes must be a number");
  }
  if (typeof bundle!.initialRootTotal?.ceilingBytes !== "number") {
    fail("bundle.initialRootTotal.ceilingBytes must be a number");
  }
  if (!Array.isArray(bundle!.knownLargeChunkExceptions)) {
    fail("bundle.knownLargeChunkExceptions must be an array");
  }
  if (!Array.isArray(bundle!.forbiddenInInitialChunks)) {
    fail("bundle.forbiddenInInitialChunks must be an array");
  }

  if (!runtime) fail('missing the "runtime" section');
  const requiredRuntimeNumbers: (keyof RuntimeBudgets)[] = [
    "ttfbMs",
    "lcpMs",
    "clsScore",
    "inpMs",
    "boardRenderCountCeiling",
    "warmRenavMaxLoaderFetches",
    "warmRenavMaxDataRequests",
    "maxForbiddenChunksLoaded",
  ];
  for (const field of requiredRuntimeNumbers) {
    if (typeof runtime![field] !== "number") {
      fail(`runtime.${field} must be a number`);
    }
  }
  if (!Array.isArray(runtime!.forbiddenRuntimeChunkUrls)) {
    fail("runtime.forbiddenRuntimeChunkUrls must be an array");
  }

  return { bundle: bundle!, runtime: runtime! };
}

export function formatBytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(2)} kB`;
}

/**
 * Resolve the uncompressed ceiling for a single script by basename, applying
 * the same rules as the bundle gate: the main-chunk ceiling, then any
 * known-large-chunk exception, then the generic per-script ceiling. Shared by
 * the gate (scripts/analyze-client-bundle.ts) and e2e/perf-production.spec.ts
 * so the matching logic can never drift between them.
 */
export function resolveCeilingBytes(name: string, bundle: BundleBudgets): number {
  if (new RegExp(bundle.mainChunk.pattern).test(name)) return bundle.mainChunk.ceilingBytes;
  const exception = bundle.knownLargeChunkExceptions.find((candidate) =>
    name.toLowerCase().includes(candidate.pattern.toLowerCase())
  );
  return exception ? exception.ceilingBytes : bundle.perScriptCeilingBytes;
}
