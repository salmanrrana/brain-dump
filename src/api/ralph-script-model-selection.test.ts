import { describe, expect, it } from "vitest";
import { generateRalphScript } from "./ralph-script";

describe("generateRalphScript model selection", () => {
  it("does not add model override environment when no concrete model is selected", () => {
    const script = generateRalphScript("/tmp/project");

    expect(script).not.toContain("BRAIN_DUMP_LAUNCH_MODEL_PROVIDER");
    expect(script).not.toContain("BRAIN_DUMP_LAUNCH_MODEL=");
  });

  it("threads concrete model selection into generated Ralph scripts", () => {
    const script = generateRalphScript(
      "/tmp/project",
      3,
      false,
      undefined,
      undefined,
      null,
      undefined,
      "codex",
      { type: "implementation" },
      {
        kind: "concrete",
        provider: "openai",
        modelName: "gpt-5.4",
      }
    );

    expect(script).toContain('export BRAIN_DUMP_LAUNCH_MODEL_PROVIDER="openai"');
    expect(script).toContain('export BRAIN_DUMP_LAUNCH_MODEL="gpt-5.4"');
  });
});
