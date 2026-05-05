import { describe, expect, it } from "vitest";
import { buildClaudeInteractiveCommand } from "./terminal";

describe("Claude interactive model command generation", () => {
  it("omits --model when no concrete model is selected", () => {
    expect(buildClaudeInteractiveCommand()).toBe('claude "$CONTEXT_FILE"');
  });

  it("adds --model for concrete Anthropic selections", () => {
    expect(
      buildClaudeInteractiveCommand({
        kind: "concrete",
        provider: "anthropic",
        modelName: "claude-sonnet-4-6",
      })
    ).toBe('claude --model "claude-sonnet-4-6" "$CONTEXT_FILE"');
  });

  it("shell-escapes model values before writing launch scripts", () => {
    expect(
      buildClaudeInteractiveCommand({
        kind: "concrete",
        provider: "anthropic",
        modelName: 'claude "$HOME" `date` !',
      })
    ).toContain('--model "claude \\"\\$HOME\\" \\`date\\` \\!"');
  });
});
