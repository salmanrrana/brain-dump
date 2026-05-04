import { describe, expect, it } from "vitest";
import { PROJECT_WORKING_METHOD_PROVIDER_IDS } from "../../lib/launch-provider-contract";
import { PROJECT_WORKING_METHOD_UI_PROVIDERS } from "../../lib/ui-launch-registry";
import { settingsFormSchema, workingMethodSchema } from "./settings-form-schema";

const validSettings = {
  terminalEmulator: "",
  defaultProjectsDirectory: "",
  defaultWorkingMethod: "pi",
  ralphSandbox: false,
  ralphTimeout: 3600,
  ralphMaxIterations: 20,
  dockerRuntime: "auto",
  autoCreatePr: true,
  prTargetBranch: "dev",
  conversationLoggingEnabled: true,
  conversationRetentionDays: 90,
} as const;

describe("settings form schema", () => {
  it("accepts every shared working method, including Pi", () => {
    expect(PROJECT_WORKING_METHOD_UI_PROVIDERS.map((provider) => provider.id)).toEqual(
      PROJECT_WORKING_METHOD_PROVIDER_IDS
    );

    for (const workingMethod of PROJECT_WORKING_METHOD_PROVIDER_IDS) {
      expect(workingMethodSchema.parse(workingMethod)).toBe(workingMethod);
    }

    expect(settingsFormSchema.parse(validSettings).defaultWorkingMethod).toBe("pi");
  });

  it("rejects unknown working methods", () => {
    expect(() => workingMethodSchema.parse("unknown-provider")).toThrow();
  });
});
