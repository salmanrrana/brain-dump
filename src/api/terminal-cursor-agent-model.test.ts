import { describe, expect, it } from "vitest";
import { buildCursorAgentInteractiveCommand } from "./terminal";

describe("Cursor Agent interactive model command generation", () => {
  it("omits --model when no concrete model is selected", () => {
    expect(buildCursorAgentInteractiveCommand()).toBe(
      '"$CURSOR_AGENT_BIN" --force --approve-mcps --trust -p "$AGENT_PROMPT"'
    );
  });

  it("adds --model for concrete Cursor selections", () => {
    expect(
      buildCursorAgentInteractiveCommand({
        kind: "concrete",
        provider: "cursor",
        modelName: "Composer 2",
      })
    ).toBe(
      '"$CURSOR_AGENT_BIN" --force --approve-mcps --trust --model "Composer 2" -p "$AGENT_PROMPT"'
    );
  });

  it("shell-escapes model values before writing launch scripts", () => {
    expect(
      buildCursorAgentInteractiveCommand({
        kind: "concrete",
        provider: "cursor",
        modelName: 'cursor "$HOME" `date` !',
      })
    ).toContain('--model "cursor \\"\\$HOME\\" \\`date\\` \\!"');
  });
});
