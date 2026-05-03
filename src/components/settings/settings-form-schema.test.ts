import { describe, expect, it } from "vitest";
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
  it("accepts Pi as a working method", () => {
    expect(workingMethodSchema.parse("pi")).toBe("pi");
    expect(settingsFormSchema.parse(validSettings).defaultWorkingMethod).toBe("pi");
  });

  it("rejects unknown working methods", () => {
    expect(() => workingMethodSchema.parse("unknown-provider")).toThrow();
  });
});
