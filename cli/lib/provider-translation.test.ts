import { describe, expect, it } from "vitest";
import { ValidationError } from "../../core/index.ts";
import {
  SUPPORTED_PROVIDERS,
  parseModelFlag,
  parseProviderFlag,
  translateProvider,
} from "./provider-translation.ts";

const costModels = [
  {
    id: "anthropic-sonnet",
    provider: "anthropic",
    modelName: "claude-sonnet-4-6",
    inputCostPerMtok: 3,
    outputCostPerMtok: 15,
    cacheReadCostPerMtok: null,
    cacheCreateCostPerMtok: null,
    isDefault: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "openai-gpt",
    provider: "openai",
    modelName: "gpt-5.5",
    inputCostPerMtok: 1,
    outputCostPerMtok: 5,
    cacheReadCostPerMtok: null,
    cacheCreateCostPerMtok: null,
    isDefault: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
] as const;

describe("translateProvider", () => {
  it("maps CLI-native providers to the matching aiBackend and working method", () => {
    expect(translateProvider("claude-code")).toEqual({
      aiBackend: "claude",
      workingMethodOverride: "claude-code",
    });
    expect(translateProvider("opencode")).toEqual({
      aiBackend: "opencode",
      workingMethodOverride: "opencode",
    });
    expect(translateProvider("codex")).toEqual({
      aiBackend: "codex",
      workingMethodOverride: "codex",
    });
    expect(translateProvider("pi")).toEqual({ aiBackend: "pi", workingMethodOverride: "pi" });
    expect(translateProvider("cursor-agent")).toEqual({
      aiBackend: "cursor-agent",
      workingMethodOverride: "cursor-agent",
    });
  });

  it("maps editor/Copilot providers onto workingMethodOverride with claude backend", () => {
    expect(translateProvider("vscode")).toEqual({
      aiBackend: "claude",
      workingMethodOverride: "vscode",
    });
    expect(translateProvider("cursor")).toEqual({
      aiBackend: "claude",
      workingMethodOverride: "cursor",
    });
    expect(translateProvider("copilot-cli")).toEqual({
      aiBackend: "claude",
      workingMethodOverride: "copilot-cli",
    });
  });

  it("covers every supported provider in SUPPORTED_PROVIDERS", () => {
    for (const provider of SUPPORTED_PROVIDERS) {
      expect(() => translateProvider(provider)).not.toThrow();
    }
  });
});

describe("parseProviderFlag", () => {
  it("returns undefined when no provider was passed", () => {
    expect(parseProviderFlag(undefined)).toBeUndefined();
  });

  it("returns the provider when it is in the allowed set", () => {
    expect(parseProviderFlag("claude-code")).toBe("claude-code");
    expect(parseProviderFlag("pi")).toBe("pi");
    expect(parseProviderFlag("copilot-cli")).toBe("copilot-cli");
  });

  it("throws a ValidationError listing allowed values when the provider is invalid", () => {
    expect(() => parseProviderFlag("bogus")).toThrowError(ValidationError);
    try {
      parseProviderFlag("bogus");
    } catch (error) {
      expect(String(error)).toContain("claude-code");
      expect(String(error)).toContain("opencode");
    }
  });
});

describe("parseModelFlag", () => {
  it("returns undefined when no model was passed", () => {
    expect(parseModelFlag("claude-code", undefined, costModels)).toBeUndefined();
  });

  it("requires a provider before accepting a model", () => {
    expect(() => parseModelFlag(undefined, "claude-sonnet-4-6", costModels)).toThrowError(
      ValidationError
    );
  });

  it("resolves a provider-valid model into a concrete launch selection", () => {
    expect(parseModelFlag("claude-code", "claude-sonnet-4-6", costModels)).toEqual({
      kind: "concrete",
      provider: "anthropic",
      modelName: "claude-sonnet-4-6",
    });
  });

  it("rejects models outside the selected provider catalog", () => {
    expect(() => parseModelFlag("claude-code", "gpt-5.5", costModels)).toThrowError(
      /Invalid value for --model/
    );
  });
});
