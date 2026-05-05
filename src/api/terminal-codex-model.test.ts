import { describe, expect, it } from "vitest";
import { buildCodexInteractiveCommand } from "./terminal";

describe("Codex interactive model command generation", () => {
  it("omits --model when no concrete model is selected", () => {
    expect(buildCodexInteractiveCommand()).toBe('codex "$(cat "$CONTEXT_FILE")"');
  });

  it("adds --model for concrete OpenAI selections", () => {
    expect(
      buildCodexInteractiveCommand({
        kind: "concrete",
        provider: "openai",
        modelName: "gpt-5.4",
      })
    ).toBe('codex --model "gpt-5.4" "$(cat "$CONTEXT_FILE")"');
  });

  it("shell-escapes model values before writing launch scripts", () => {
    expect(
      buildCodexInteractiveCommand({
        kind: "concrete",
        provider: "openai",
        modelName: 'gpt "$HOME" `date` !',
      })
    ).toContain('--model "gpt \\"\\$HOME\\" \\`date\\` \\!"');
  });
});
