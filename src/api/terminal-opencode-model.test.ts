import { describe, expect, it } from "vitest";
import { buildOpenCodeInteractiveCommand, formatOpenCodeLaunchModelValue } from "./terminal";

describe("OpenCode interactive model command generation", () => {
  it("uses provider/model format for concrete launch selections", () => {
    expect(
      formatOpenCodeLaunchModelValue({
        kind: "concrete",
        provider: "openai",
        modelName: "gpt-5.4",
      })
    ).toBe("openai/gpt-5.4");
  });

  it("omits --model when no concrete model is selected", () => {
    expect(buildOpenCodeInteractiveCommand("/tmp/project")).toBe(
      'opencode "/tmp/project" --prompt "$(cat "$CONTEXT_FILE")"'
    );
  });

  it("adds --model provider/model for concrete selections", () => {
    expect(
      buildOpenCodeInteractiveCommand("/tmp/project", {
        kind: "concrete",
        provider: "anthropic",
        modelName: "claude-sonnet-4-6",
      })
    ).toBe(
      'opencode "/tmp/project" --model "anthropic/claude-sonnet-4-6" --prompt "$(cat "$CONTEXT_FILE")"'
    );
  });

  it("shell-escapes model values without dropping OpenCode's provider prefix", () => {
    expect(
      buildOpenCodeInteractiveCommand("/tmp/project", {
        kind: "concrete",
        provider: "openai",
        modelName: 'gpt "$HOME" `date` !',
      })
    ).toContain('--model "openai/gpt \\"\\$HOME\\" \\`date\\` \\!"');
  });
});
