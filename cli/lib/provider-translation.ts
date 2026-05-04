/**
 * Translates the CLI `--provider` flag into the `aiBackend` / `workingMethodOverride`
 * pair consumed by `launchRalphForTicketCore` / `launchRalphForEpicCore`.
 *
 * The mapping mirrors the UI's Launch menu so that `brain-dump workflow launch-*`
 * produces the same effect as clicking the matching button in the browser.
 */

import { ValidationError } from "../../core/index.ts";
import type { RalphAiBackend } from "../../src/api/ralph-script.ts";
import type { RalphWorkingMethod } from "../../src/lib/ralph-launch/types.ts";

export const SUPPORTED_PROVIDERS = [
  "claude-code",
  "vscode",
  "cursor",
  "cursor-agent",
  "copilot-cli",
  "codex",
  "pi",
  "opencode",
] as const;

export type LaunchProvider = (typeof SUPPORTED_PROVIDERS)[number];

export interface TranslatedProvider {
  aiBackend: RalphAiBackend;
  workingMethodOverride?: RalphWorkingMethod;
}

export function translateProvider(provider: LaunchProvider): TranslatedProvider {
  switch (provider) {
    case "claude-code":
      return { aiBackend: "claude" };
    case "opencode":
      return { aiBackend: "opencode" };
    case "codex":
      return { aiBackend: "codex" };
    case "pi":
      return { aiBackend: "pi", workingMethodOverride: "pi" };
    case "cursor-agent":
      return { aiBackend: "cursor-agent" };
    case "vscode":
      return { aiBackend: "claude", workingMethodOverride: "vscode" };
    case "cursor":
      return { aiBackend: "claude", workingMethodOverride: "cursor" };
    case "copilot-cli":
      return { aiBackend: "claude", workingMethodOverride: "copilot-cli" };
  }
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
