import { describe, expect, it } from "vitest";
import type { CostModel } from "../../core/types";
import type { UiLaunchProviderId } from "./launch-provider-contract";
import {
  DEFAULT_LAUNCH_MODEL_LABEL,
  DEFAULT_LAUNCH_MODEL_SELECTION,
  findLaunchModelChoice,
  getLaunchModelCatalog,
  isDefaultOnlyLaunchProvider,
} from "./launch-model-catalog";

function makeCostModel(
  provider: string,
  modelName: string,
  overrides: Partial<CostModel> = {}
): CostModel {
  return {
    id: `${provider}-${modelName}`,
    provider,
    modelName,
    inputCostPerMtok: 1,
    outputCostPerMtok: 5,
    cacheReadCostPerMtok: null,
    cacheCreateCostPerMtok: null,
    isDefault: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const CATALOG_FIXTURE: CostModel[] = [
  makeCostModel("anthropic", "claude-opus-4-7"),
  makeCostModel("anthropic", "claude-sonnet-4-6"),
  makeCostModel("openai", "gpt-5.4"),
  makeCostModel("openai", "gpt-5.4-mini"),
  makeCostModel("cursor", "Composer 2"),
  makeCostModel("google", "gemini-2.5-pro"),
  makeCostModel("opensource", "Qwen3 Coder 480B"),
];

describe("getLaunchModelCatalog", () => {
  it("always returns Default as the first choice", () => {
    const catalog = getLaunchModelCatalog("claude", CATALOG_FIXTURE);
    expect(catalog.choices[0]).toMatchObject({
      label: DEFAULT_LAUNCH_MODEL_LABEL,
      selection: { kind: "default" },
    });
  });

  it("filters Claude launches to anthropic pricing rows", () => {
    const catalog = getLaunchModelCatalog("claude", CATALOG_FIXTURE);
    const concrete = catalog.choices.filter((choice) => choice.selection.kind === "concrete");
    expect(concrete.map((c) => c.label)).toEqual(["claude-opus-4-7", "claude-sonnet-4-6"]);
    expect(concrete.every((c) => c.provider === "anthropic")).toBe(true);
    expect(concrete.every((c) => c.cliValue && !c.cliValue.includes("/"))).toBe(true);
  });

  it("filters Codex launches to openai pricing rows", () => {
    const catalog = getLaunchModelCatalog("codex", CATALOG_FIXTURE);
    const concrete = catalog.choices.filter((choice) => choice.selection.kind === "concrete");
    expect(concrete.map((c) => c.label)).toEqual(["gpt-5.4", "gpt-5.4-mini"]);
    expect(concrete.every((c) => c.provider === "openai")).toBe(true);
  });

  it("filters Cursor Agent launches to cursor pricing rows", () => {
    const catalog = getLaunchModelCatalog("cursor-agent", CATALOG_FIXTURE);
    const concrete = catalog.choices.filter((choice) => choice.selection.kind === "concrete");
    expect(concrete.map((c) => c.label)).toEqual(["Composer 2"]);
  });

  it("filters Ralph Cursor Agent launches to cursor pricing rows", () => {
    const catalog = getLaunchModelCatalog("ralph-cursor-agent", CATALOG_FIXTURE);
    const concrete = catalog.choices.filter((choice) => choice.selection.kind === "concrete");
    expect(concrete.map((c) => c.label)).toEqual(["Composer 2"]);
    expect(concrete.every((c) => c.provider === "cursor")).toBe(true);
  });

  it("formats OpenCode choices as provider/model so the launcher can pass --model provider/model", () => {
    const catalog = getLaunchModelCatalog("opencode", CATALOG_FIXTURE);
    const concrete = catalog.choices.filter((choice) => choice.selection.kind === "concrete");

    expect(concrete.length).toBeGreaterThan(0);
    expect(concrete.every((c) => c.cliValue?.includes("/"))).toBe(true);
    expect(concrete.map((c) => c.cliValue)).toContain("anthropic/claude-opus-4-7");
    expect(concrete.map((c) => c.cliValue)).toContain("openai/gpt-5.4");
    expect(concrete.map((c) => c.cliValue)).toContain("google/gemini-2.5-pro");
    expect(concrete.map((c) => c.cliValue)).toContain("opensource/Qwen3 Coder 480B");
  });

  it("OpenCode catalog spans multiple pricing providers grouped together", () => {
    const catalog = getLaunchModelCatalog("opencode", CATALOG_FIXTURE);
    const providers = new Set(
      catalog.choices.flatMap((choice) =>
        choice.selection.kind === "concrete" ? [choice.provider] : []
      )
    );
    expect(providers.size).toBeGreaterThan(1);
    expect(providers).toContain("anthropic");
    expect(providers).toContain("openai");
  });

  it("OpenCode disambiguates duplicate model names across providers via the detail line", () => {
    const fixture: CostModel[] = [
      makeCostModel("anthropic", "shared-name"),
      makeCostModel("openai", "shared-name"),
    ];
    const catalog = getLaunchModelCatalog("opencode", fixture);
    const concrete = catalog.choices.filter((choice) => choice.selection.kind === "concrete");
    expect(concrete.map((c) => c.detail)).toEqual(["anthropic/shared-name", "openai/shared-name"]);
  });

  it("returns a default-only catalog for providers with no pricing-backed mapping", () => {
    const defaultOnlyProviders: UiLaunchProviderId[] = [
      "vscode",
      "cursor",
      "copilot",
      "pi",
      "codex-app",
      "ralph-copilot",
      "ralph-pi",
    ];
    for (const providerId of defaultOnlyProviders) {
      const catalog = getLaunchModelCatalog(providerId, CATALOG_FIXTURE);
      expect(catalog.defaultOnly).toBe(true);
      expect(catalog.defaultOnlyReason).toBe("no-mapping");
      expect(catalog.choices).toHaveLength(1);
      expect(catalog.choices[0]?.selection).toEqual(DEFAULT_LAUNCH_MODEL_SELECTION);
    }
  });

  it("falls back to Default-only with reason 'no-rows' when the pricing table is empty", () => {
    const catalog = getLaunchModelCatalog("claude", []);
    expect(catalog.defaultOnly).toBe(true);
    expect(catalog.defaultOnlyReason).toBe("no-rows");
    expect(catalog.choices).toEqual([
      expect.objectContaining({ selection: DEFAULT_LAUNCH_MODEL_SELECTION }),
    ]);
  });

  it("falls back to Default-only with reason 'no-rows' when the mapped provider has no rows", () => {
    const fixture: CostModel[] = [makeCostModel("google", "gemini-2.5-pro")];
    const catalog = getLaunchModelCatalog("claude", fixture);
    expect(catalog.defaultOnly).toBe(true);
    expect(catalog.defaultOnlyReason).toBe("no-rows");
    expect(catalog.choices).toHaveLength(1);
  });

  it("does not set defaultOnlyReason when the catalog has concrete choices", () => {
    const catalog = getLaunchModelCatalog("claude", CATALOG_FIXTURE);
    expect(catalog.defaultOnly).toBe(false);
    expect(catalog.defaultOnlyReason).toBeUndefined();
  });

  it("does not leak unrelated pricing providers into single-provider catalogs", () => {
    const catalog = getLaunchModelCatalog("claude", CATALOG_FIXTURE);
    const providers = new Set(
      catalog.choices.flatMap((choice) =>
        choice.selection.kind === "concrete" ? [choice.provider] : []
      )
    );
    expect(providers).toEqual(new Set(["anthropic"]));
  });
});

describe("isDefaultOnlyLaunchProvider", () => {
  it("flags providers without concrete catalog mappings", () => {
    expect(isDefaultOnlyLaunchProvider("vscode")).toBe(true);
    expect(isDefaultOnlyLaunchProvider("cursor")).toBe(true);
    expect(isDefaultOnlyLaunchProvider("copilot")).toBe(true);
    expect(isDefaultOnlyLaunchProvider("pi")).toBe(true);
    expect(isDefaultOnlyLaunchProvider("codex-app")).toBe(true);
  });

  it("does not flag providers that have a concrete catalog mapping", () => {
    expect(isDefaultOnlyLaunchProvider("claude")).toBe(false);
    expect(isDefaultOnlyLaunchProvider("codex")).toBe(false);
    expect(isDefaultOnlyLaunchProvider("opencode")).toBe(false);
    expect(isDefaultOnlyLaunchProvider("cursor-agent")).toBe(false);
    expect(isDefaultOnlyLaunchProvider("ralph-native")).toBe(false);
  });
});

describe("findLaunchModelChoice", () => {
  it("resolves the Default sentinel back to its choice", () => {
    const catalog = getLaunchModelCatalog("claude", CATALOG_FIXTURE);
    const found = findLaunchModelChoice(catalog, DEFAULT_LAUNCH_MODEL_SELECTION);
    expect(found?.selection.kind).toBe("default");
  });

  it("resolves a concrete selection by provider and model name", () => {
    const catalog = getLaunchModelCatalog("opencode", CATALOG_FIXTURE);
    const found = findLaunchModelChoice(catalog, {
      kind: "concrete",
      provider: "openai",
      modelName: "gpt-5.4",
    });
    expect(found?.cliValue).toBe("openai/gpt-5.4");
  });

  it("returns undefined when the stored selection is no longer in the catalog", () => {
    const catalog = getLaunchModelCatalog("claude", CATALOG_FIXTURE);
    const found = findLaunchModelChoice(catalog, {
      kind: "concrete",
      provider: "anthropic",
      modelName: "claude-removed-model",
    });
    expect(found).toBeUndefined();
  });
});
