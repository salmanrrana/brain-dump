import { describe, expect, it } from "vitest";
import { ValidationError } from "../../core/index.ts";
import {
  SUPPORTED_PROVIDERS,
  parseProviderFlag,
  translateProvider,
} from "./provider-translation.ts";

describe("translateProvider", () => {
  it("maps CLI-native providers to the matching aiBackend with no workingMethodOverride", () => {
    expect(translateProvider("claude-code")).toEqual({ aiBackend: "claude" });
    expect(translateProvider("opencode")).toEqual({ aiBackend: "opencode" });
    expect(translateProvider("codex")).toEqual({ aiBackend: "codex" });
    expect(translateProvider("pi")).toEqual({ aiBackend: "pi", workingMethodOverride: "pi" });
    expect(translateProvider("cursor-agent")).toEqual({ aiBackend: "cursor-agent" });
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
