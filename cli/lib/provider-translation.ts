/**
 * Translates the CLI `--provider` flag into the `aiBackend` / `workingMethodOverride`
 * pair consumed by `launchRalphForTicketCore` / `launchRalphForEpicCore`.
 *
 * The mapping mirrors the UI's Launch menu so that `brain-dump workflow launch-*`
 * produces the same effect as clicking the matching button in the browser.
 */

import { ValidationError } from "../../core/index.ts";
import {
  PROVIDER_IDS,
  resolveProviderModelSelection,
  translateProviderForRalph,
} from "../../core/providers.ts";
import type { CostModel, ProviderId, RalphAiBackend } from "../../core/index.ts";
import type { ConcreteLaunchModelSelection } from "../../src/lib/launch-model-catalog.ts";
import type { RalphWorkingMethod } from "../../src/lib/ralph-launch/types.ts";

export const SUPPORTED_PROVIDERS = PROVIDER_IDS;

export type LaunchProvider = ProviderId;

export interface TranslatedProvider {
  aiBackend: RalphAiBackend;
  workingMethodOverride?: RalphWorkingMethod;
}

export function translateProvider(provider: LaunchProvider): TranslatedProvider {
  return translateProviderForRalph(provider);
}

export function parseProviderFlag(value: string | undefined): LaunchProvider | undefined {
  if (value === undefined) return undefined;
  if (!(SUPPORTED_PROVIDERS as readonly string[]).includes(value)) {
    throw new ValidationError(
      `Invalid value for --provider: "${value}". Allowed: ${SUPPORTED_PROVIDERS.join(", ")}`
    );
  }
  return value as LaunchProvider;
}

export function parseModelFlag(
  provider: LaunchProvider | undefined,
  value: string | undefined,
  costModels: readonly CostModel[]
): ConcreteLaunchModelSelection | undefined {
  if (value === undefined) return undefined;
  if (provider === undefined) {
    throw new ValidationError(
      "--model requires --provider so Brain Dump can validate provider-specific model ids."
    );
  }

  const selection = resolveProviderModelSelection(provider, value, costModels);
  return { kind: "concrete", ...selection };
}
