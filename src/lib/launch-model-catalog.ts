import type { CostModel } from "../../core/types";
import type { UiLaunchProviderId } from "./launch-provider-contract";

/**
 * Shared launch model catalog.
 *
 * Maps each launch provider id to the model choices a user can pick when launching
 * the provider for a single ticket or epic. Concrete model rows come from the AI
 * Pricing table (`getCostModels()`); `Default` is always included as the first
 * option and means "do not pass a model override — use whatever the provider's
 * own default is".
 *
 * Design constraints from the Launch Model Picker MVP:
 * - `Default` is a sentinel, not a fake `cost_models` row.
 * - Providers without a reliable pricing-backed mapping stay default-only until
 *   their dedicated provider ticket adds a concrete mapping.
 * - OpenCode addresses models as `provider/model` and can pull from multiple
 *   pricing providers, so its `cliValue` carries the prefixed form and choice
 *   labels disambiguate models that share a name across providers.
 */

/**
 * Selection sentinel that flows from the picker UI through dispatch.
 * `default` means the launcher should NOT pass a model flag.
 */
export type LaunchModelSelection =
  | { kind: "default" }
  | { kind: "concrete"; provider: string; modelName: string };

export const DEFAULT_LAUNCH_MODEL_SELECTION: LaunchModelSelection = { kind: "default" };

export const DEFAULT_LAUNCH_MODEL_LABEL = "Default";

export interface LaunchModelChoice {
  /** Stable id, unique within a single catalog. */
  id: string;
  /** Selection value to thread through dispatch. */
  selection: LaunchModelSelection;
  /** Human label shown in the picker. */
  label: string;
  /** Optional extra context shown beneath the label (e.g. provider name). */
  detail?: string;
  /** Pricing provider this choice was sourced from, when concrete. */
  provider?: string;
  /**
   * Value to pass on the provider CLI when this choice is selected.
   * Concrete choices for OpenCode use `provider/model`; other providers use
   * the bare model name. `Default` choices have no `cliValue`.
   */
  cliValue?: string;
}

export interface LaunchModelCatalog {
  providerId: UiLaunchProviderId;
  /**
   * True when no concrete pricing rows mapped to this provider; the picker
   * only offers `Default` and should explain why no concrete choices exist.
   */
  defaultOnly: boolean;
  choices: LaunchModelChoice[];
}

/**
 * Pricing providers from `core/cost.ts` defaults that Brain Dump knows about.
 * Stored as plain strings because cost models are user-editable, but the MVP
 * mapping uses these canonical ids.
 */
type PricingProviderId = "anthropic" | "openai" | "cursor" | "google" | "opensource";

interface ProviderMapping {
  /** Pricing providers whose rows are eligible model choices for this launcher. */
  pricingProviders: readonly PricingProviderId[];
  /**
   * Whether to format `cliValue` as `provider/model` (true for OpenCode, which
   * routes by provider) or as the bare model name (every other CLI).
   */
  prefixWithProvider: boolean;
}

const DEFAULT_ONLY_MAPPING: ProviderMapping = {
  pricingProviders: [],
  prefixWithProvider: false,
};

/**
 * Single source of truth for "which pricing rows belong to which launch provider".
 * Providers omitted from this map are default-only.
 */
const PROVIDER_MODEL_MAPPINGS: Partial<Record<UiLaunchProviderId, ProviderMapping>> = {
  // Claude family — Anthropic only.
  claude: { pricingProviders: ["anthropic"], prefixWithProvider: false },
  "ralph-native": { pricingProviders: ["anthropic"], prefixWithProvider: false },

  // Codex family — OpenAI only. Codex App is intentionally default-only because
  // launching the desktop app does not accept a one-shot model override; the
  // dedicated Codex ticket will revisit if a launch-time mechanism appears.
  codex: { pricingProviders: ["openai"], prefixWithProvider: false },
  "codex-cli": { pricingProviders: ["openai"], prefixWithProvider: false },
  "ralph-codex": { pricingProviders: ["openai"], prefixWithProvider: false },

  // Cursor Agent CLI — pricing rows under the `cursor` provider.
  "cursor-agent": { pricingProviders: ["cursor"], prefixWithProvider: false },
  "ralph-cursor-agent": { pricingProviders: ["cursor"], prefixWithProvider: false },

  // OpenCode addresses any configured provider as `provider/model`. Include the
  // pricing providers OpenCode is known to route to in practice.
  opencode: {
    pricingProviders: ["anthropic", "openai", "google", "opensource", "cursor"],
    prefixWithProvider: true,
  },
  "ralph-opencode": {
    pricingProviders: ["anthropic", "openai", "google", "opensource", "cursor"],
    prefixWithProvider: true,
  },
};

function defaultChoice(): LaunchModelChoice {
  return {
    id: "default",
    selection: DEFAULT_LAUNCH_MODEL_SELECTION,
    label: DEFAULT_LAUNCH_MODEL_LABEL,
    detail: "Use the provider's built-in default model",
  };
}

function concreteChoice(model: CostModel, prefixWithProvider: boolean): LaunchModelChoice {
  const cliValue = prefixWithProvider ? `${model.provider}/${model.modelName}` : model.modelName;
  return {
    id: `${model.provider}:${model.modelName}`,
    selection: {
      kind: "concrete",
      provider: model.provider,
      modelName: model.modelName,
    },
    label: model.modelName,
    detail: prefixWithProvider ? cliValue : model.provider,
    provider: model.provider,
    cliValue,
  };
}

function compareModels(a: CostModel, b: CostModel): number {
  const providerCompare = a.provider.localeCompare(b.provider);
  if (providerCompare !== 0) return providerCompare;
  return a.modelName.localeCompare(b.modelName);
}

/**
 * Build the model catalog for a single launch provider.
 *
 * Always includes `Default` as the first choice. Concrete choices come from
 * `costModels` rows whose `provider` is in this launch provider's mapping.
 * If the mapping is empty (or no rows match), the catalog is default-only.
 */
export function getLaunchModelCatalog(
  providerId: UiLaunchProviderId,
  costModels: readonly CostModel[]
): LaunchModelCatalog {
  const mapping = PROVIDER_MODEL_MAPPINGS[providerId] ?? DEFAULT_ONLY_MAPPING;
  const defaultEntry = defaultChoice();

  if (mapping.pricingProviders.length === 0) {
    return { providerId, defaultOnly: true, choices: [defaultEntry] };
  }

  const allowedProviders = new Set<string>(mapping.pricingProviders);
  const concreteChoices = costModels
    .filter((model) => allowedProviders.has(model.provider))
    .slice()
    .sort(compareModels)
    .map((model) => concreteChoice(model, mapping.prefixWithProvider));

  if (concreteChoices.length === 0) {
    // Pricing table is empty or holds nothing for this provider's mapping.
    return { providerId, defaultOnly: true, choices: [defaultEntry] };
  }

  return {
    providerId,
    defaultOnly: false,
    choices: [defaultEntry, ...concreteChoices],
  };
}

/**
 * True if this launch provider has no concrete catalog mapping at all,
 * regardless of the current pricing table contents. Useful for the picker
 * to show a "no models available for this provider" hint up front.
 */
export function isDefaultOnlyLaunchProvider(providerId: UiLaunchProviderId): boolean {
  const mapping = PROVIDER_MODEL_MAPPINGS[providerId];
  return !mapping || mapping.pricingProviders.length === 0;
}

/**
 * Resolve a `LaunchModelChoice` from a stored `LaunchModelSelection` against a
 * fresh catalog. Returns `undefined` if the selection no longer exists in the
 * catalog (e.g. the cost model row was deleted between picker open and submit).
 */
export function findLaunchModelChoice(
  catalog: LaunchModelCatalog,
  selection: LaunchModelSelection
): LaunchModelChoice | undefined {
  if (selection.kind === "default") {
    return catalog.choices.find((choice) => choice.selection.kind === "default");
  }
  return catalog.choices.find(
    (choice) =>
      choice.selection.kind === "concrete" &&
      choice.selection.provider === selection.provider &&
      choice.selection.modelName === selection.modelName
  );
}
