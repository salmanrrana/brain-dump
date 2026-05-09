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

export type ConcreteLaunchModelSelection = Extract<LaunchModelSelection, { kind: "concrete" }>;

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

/**
 * Why a catalog ended up offering only `Default`. Lets the picker show different
 * copy for "this provider doesn't support model picking yet" vs. "your pricing
 * table doesn't have rows for this provider".
 */
export type LaunchModelDefaultOnlyReason = "no-mapping" | "no-rows";

export interface LaunchModelCatalog {
  providerId: UiLaunchProviderId;
  /**
   * True when the catalog only offers `Default`. Pair with `defaultOnlyReason`
   * to explain to the user why no concrete choices exist.
   */
  defaultOnly: boolean;
  /**
   * Set when `defaultOnly` is true. `"no-mapping"` means the launch provider
   * has no pricing-backed catalog entry at all (e.g. vscode, copilot). `"no-rows"`
   * means the provider does map to pricing rows, but none are currently in the
   * pricing table — typically a misconfiguration the user can fix.
   */
  defaultOnlyReason?: LaunchModelDefaultOnlyReason;
  choices: LaunchModelChoice[];
}

/**
 * Pricing providers from `core/cost.ts` defaults that Brain Dump knows about.
 * Stored as plain strings because cost models are user-editable, but the MVP
 * mapping uses these canonical ids.
 */
type PricingProviderId =
  | "anthropic"
  | "openai"
  | "openai-codex"
  | "cursor"
  | "google"
  | "opensource"
  | "opencode-go";

/**
 * User-facing brand override for pricing providers whose internal id leaks
 * implementation detail. `opencode-go` is OpenCode's "Go" routing endpoint
 * (`https://opencode.ai/zen/go/v1`); the CLI accepts `opencode-go/<model>`
 * verbatim, but in the picker we present these rows under the plain "opencode"
 * brand so users do not have to think about the routing variant.
 */
const PROVIDER_DISPLAY_BRAND: Partial<Record<PricingProviderId, string>> = {
  "opencode-go": "opencode",
};

interface ProviderMapping {
  /** Pricing providers whose rows are eligible model choices for this launcher. */
  pricingProviders: readonly PricingProviderId[];
  /**
   * Optional per-provider allowlist for providers whose full pricing catalog is
   * broader than the launcher's live model surface.
   */
  modelNamesByProvider?: Partial<Record<PricingProviderId, readonly string[]>>;
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
 *
 * Typed as a full `Record` so adding a new id to `UiLaunchProviderId` becomes a
 * compile error here until an entry is added — preventing a new provider from
 * silently rendering an empty model picker. Default-only providers (vscode,
 * cursor editor, copilot, codex-app, pi, ralph variants of those) get an
 * explicit `DEFAULT_ONLY_MAPPING` entry rather than being omitted.
 */
const OPENCODE_PRICING_PROVIDERS = [
  "anthropic",
  "openai",
  "google",
  "opensource",
  "cursor",
  "opencode-go",
] as const satisfies readonly PricingProviderId[];

const PI_PRICING_PROVIDERS = [
  "openai-codex",
  "opencode-go",
] as const satisfies readonly PricingProviderId[];

const PI_MODEL_NAMES_BY_PROVIDER = {
  "openai-codex": [
    "gpt-5.1",
    "gpt-5.1-codex-max",
    "gpt-5.1-codex-mini",
    "gpt-5.2",
    "gpt-5.2-codex",
    "gpt-5.3-codex",
    "gpt-5.3-codex-spark",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.5",
  ],
  "opencode-go": [
    "deepseek-v4-flash",
    "deepseek-v4-pro",
    "glm-5",
    "glm-5.1",
    "kimi-k2.5",
    "kimi-k2.6",
    "mimo-v2.5",
    "mimo-v2.5-pro",
    "minimax-m2.5",
    "minimax-m2.7",
    "qwen3.5-plus",
    "qwen3.6-plus",
  ],
} as const satisfies Partial<Record<PricingProviderId, readonly string[]>>;

const PROVIDER_MODEL_MAPPINGS: Record<UiLaunchProviderId, ProviderMapping> = {
  // Claude family — Anthropic only.
  claude: { pricingProviders: ["anthropic"], prefixWithProvider: false },
  "ralph-native": { pricingProviders: ["anthropic"], prefixWithProvider: false },

  // Codex family — OpenAI only. Codex App is intentionally default-only because
  // launching the desktop app does not accept a one-shot model override; the
  // dedicated Codex ticket will revisit if a launch-time mechanism appears.
  codex: { pricingProviders: ["openai"], prefixWithProvider: false },
  "codex-cli": { pricingProviders: ["openai"], prefixWithProvider: false },
  "codex-app": DEFAULT_ONLY_MAPPING,
  "ralph-codex": { pricingProviders: ["openai"], prefixWithProvider: false },

  // Cursor Agent CLI — pricing rows under the `cursor` provider.
  "cursor-agent": { pricingProviders: ["cursor"], prefixWithProvider: false },
  "ralph-cursor-agent": { pricingProviders: ["cursor"], prefixWithProvider: false },

  // OpenCode addresses any configured provider as `provider/model`.
  opencode: { pricingProviders: OPENCODE_PRICING_PROVIDERS, prefixWithProvider: true },
  "ralph-opencode": { pricingProviders: OPENCODE_PRICING_PROVIDERS, prefixWithProvider: true },

  // Pi exposes subscription-backed providers and accepts provider-prefixed
  // model ids through `--model provider/model`.
  pi: {
    pricingProviders: PI_PRICING_PROVIDERS,
    modelNamesByProvider: PI_MODEL_NAMES_BY_PROVIDER,
    prefixWithProvider: true,
  },
  "ralph-pi": {
    pricingProviders: PI_PRICING_PROVIDERS,
    modelNamesByProvider: PI_MODEL_NAMES_BY_PROVIDER,
    prefixWithProvider: true,
  },

  // Default-only: providers with no reliable pricing-backed mapping yet.
  // Their dedicated tickets in this epic will revisit if a CLI mechanism exists.
  vscode: DEFAULT_ONLY_MAPPING,
  cursor: DEFAULT_ONLY_MAPPING,
  copilot: DEFAULT_ONLY_MAPPING,
  "ralph-copilot": DEFAULT_ONLY_MAPPING,
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
  const displayProvider =
    PROVIDER_DISPLAY_BRAND[model.provider as PricingProviderId] ?? model.provider;
  const displayDetail = prefixWithProvider
    ? `${displayProvider}/${model.modelName}`
    : displayProvider;
  return {
    id: `${model.provider}:${model.modelName}`,
    selection: {
      kind: "concrete",
      provider: model.provider,
      modelName: model.modelName,
    },
    label: model.modelName,
    detail: displayDetail,
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
  const mapping = PROVIDER_MODEL_MAPPINGS[providerId];
  const defaultEntry = defaultChoice();

  if (mapping.pricingProviders.length === 0) {
    return {
      providerId,
      defaultOnly: true,
      defaultOnlyReason: "no-mapping",
      choices: [defaultEntry],
    };
  }

  const allowedProviders = new Set<string>(mapping.pricingProviders);
  const concreteChoices = costModels
    .filter((model) => {
      if (!allowedProviders.has(model.provider)) {
        return false;
      }
      const allowedModelNames = mapping.modelNamesByProvider?.[model.provider as PricingProviderId];
      return !allowedModelNames || allowedModelNames.includes(model.modelName);
    })
    .slice()
    .sort(compareModels)
    .map((model) => concreteChoice(model, mapping.prefixWithProvider));

  if (concreteChoices.length === 0) {
    // Mapping exists but no rows currently match — typically a pricing-table gap
    // the user can fix by adding a model row.
    return {
      providerId,
      defaultOnly: true,
      defaultOnlyReason: "no-rows",
      choices: [defaultEntry],
    };
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
 * to short-circuit "no models available for this provider" hints up front.
 */
export function isDefaultOnlyLaunchProvider(providerId: UiLaunchProviderId): boolean {
  return PROVIDER_MODEL_MAPPINGS[providerId].pricingProviders.length === 0;
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
