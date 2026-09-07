import {
  getProviderIdForUiLaunchProviderId,
  getProviderModelCatalogDefinition,
  getProviderModelChoices,
} from "../../core/providers.ts";
import type { ProviderModelCatalogDefinition } from "../../core/providers.ts";
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
type PricingProviderId = import("../../core/providers.ts").PricingProviderId;

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

const DEFAULT_ONLY_UI_PROVIDER_IDS = new Set<UiLaunchProviderId>(["codex-app"]);

const DEFAULT_ONLY_CATALOG: ProviderModelCatalogDefinition = {
  pricingProviders: [],
};

function getCatalogDefinitionForLaunchProvider(
  providerId: UiLaunchProviderId
): ProviderModelCatalogDefinition {
  if (DEFAULT_ONLY_UI_PROVIDER_IDS.has(providerId)) {
    return DEFAULT_ONLY_CATALOG;
  }

  const coreProviderId = getProviderIdForUiLaunchProviderId(providerId);
  return getProviderModelCatalogDefinition(coreProviderId);
}

function defaultChoice(): LaunchModelChoice {
  return {
    id: "default",
    selection: DEFAULT_LAUNCH_MODEL_SELECTION,
    label: DEFAULT_LAUNCH_MODEL_LABEL,
    detail: "Use the provider's built-in default model",
  };
}

function concreteChoice(choice: {
  provider: string;
  modelName: string;
  cliValue: string;
}): LaunchModelChoice {
  const displayProvider =
    PROVIDER_DISPLAY_BRAND[choice.provider as PricingProviderId] ?? choice.provider;
  const displayDetail = choice.cliValue.includes("/")
    ? `${displayProvider}/${choice.modelName}`
    : displayProvider;
  return {
    id: `${choice.provider}:${choice.modelName}`,
    selection: {
      kind: "concrete",
      provider: choice.provider,
      modelName: choice.modelName,
    },
    label: choice.modelName,
    detail: displayDetail,
    provider: choice.provider,
    cliValue: choice.cliValue,
  };
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
  const coreProviderId = getProviderIdForUiLaunchProviderId(providerId);
  const mapping = getCatalogDefinitionForLaunchProvider(providerId);
  const defaultEntry = defaultChoice();

  if (mapping.pricingProviders.length === 0) {
    return {
      providerId,
      defaultOnly: true,
      defaultOnlyReason: "no-mapping",
      choices: [defaultEntry],
    };
  }

  const concreteChoices = getProviderModelChoices(coreProviderId, costModels).map(concreteChoice);

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
  return getCatalogDefinitionForLaunchProvider(providerId).pricingProviders.length === 0;
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
