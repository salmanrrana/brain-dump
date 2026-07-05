import { describe, expect, it } from "vitest";
import {
  INTERACTIVE_PROVIDER_DEFINITIONS,
  PROJECT_WORKING_METHOD_PROVIDER_IDS,
  PROVIDER_IDS,
  PROVIDER_REGISTRY,
  RALPH_AUTONOMOUS_PROVIDER_DEFINITIONS,
  getProviderModelChoices,
  resolveProviderModelSelection,
  translateProviderForRalph,
} from "../providers.ts";

const costModels = [
  { provider: "anthropic", modelName: "claude-sonnet-4-6" },
  { provider: "openai", modelName: "gpt-5.5" },
  { provider: "opencode-go", modelName: "deepseek-v4-pro" },
] as const;

describe("provider registry", () => {
  it("keeps every supported provider backed by a registry entry", () => {
    expect(Object.keys(PROVIDER_REGISTRY)).toEqual([...PROVIDER_IDS]);
  });

  it("feeds every UI launch definition from a known provider", () => {
    for (const provider of [
      ...INTERACTIVE_PROVIDER_DEFINITIONS,
      ...RALPH_AUTONOMOUS_PROVIDER_DEFINITIONS,
    ]) {
      expect(PROVIDER_IDS).toContain(provider.providerId);
    }
  });

  it("keeps project working methods exhaustive over provider ids plus auto", () => {
    expect(PROJECT_WORKING_METHOD_PROVIDER_IDS).toEqual(["auto", ...PROVIDER_IDS]);
  });

  it("translates providers to Ralph launch inputs from the registry", () => {
    expect(translateProviderForRalph("copilot-cli")).toEqual({
      aiBackend: "claude",
      workingMethodOverride: "copilot-cli",
    });
    expect(translateProviderForRalph("opencode")).toEqual({ aiBackend: "opencode" });
  });

  it("builds provider-prefixed model choices when the CLI requires them", () => {
    expect(getProviderModelChoices("pi", costModels).map((choice) => choice.cliValue)).toContain(
      "opencode-go/deepseek-v4-pro"
    );
  });

  it("rejects model ids that are outside the selected provider catalog", () => {
    expect(() => resolveProviderModelSelection("claude-code", "gpt-5.5", costModels)).toThrow(
      /Invalid value for --model/
    );
  });
});
