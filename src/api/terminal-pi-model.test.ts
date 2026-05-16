import { describe, expect, it } from "vitest";
import { buildPiInteractiveCommand } from "./terminal";

describe("Pi interactive model command generation", () => {
  it("omits --model when no concrete model is selected", () => {
    expect(buildPiInteractiveCommand()).toBe('pi "$PI_PROMPT"');
  });

  it("adds --model provider/model for concrete Pi selections", () => {
    expect(
      buildPiInteractiveCommand({
        kind: "concrete",
        provider: "openai-codex",
        modelName: "gpt-5.5",
      })
    ).toBe('pi --model "openai-codex/gpt-5.5" "$PI_PROMPT"');
  });

  it("shell-escapes model values without dropping Pi's provider prefix", () => {
    expect(
      buildPiInteractiveCommand({
        kind: "concrete",
        provider: "opencode-go",
        modelName: 'qwen "$HOME" `date` !',
      })
    ).toContain('--model "opencode-go/qwen \\"\\$HOME\\" \\`date\\` \\!"');
  });
});
