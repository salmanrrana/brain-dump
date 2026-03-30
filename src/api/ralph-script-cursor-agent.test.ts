import { describe, expect, it } from "vitest";
import { generateRalphScript } from "./ralph-script";

describe("generateRalphScript cursor-agent backend", () => {
  it("uses the resolved Cursor Agent binary in the Ralph loop", () => {
    const script = generateRalphScript(
      "/tmp/project",
      3,
      false,
      undefined,
      undefined,
      null,
      undefined,
      "cursor-agent"
    );

    expect(script).toContain("export RALPH_SESSION=1");
    expect(script).toContain('agent --help 2>&1 | grep -qi "Cursor Agent"');
    expect(script).toContain('cursor-agent --help 2>&1 | grep -qi "Cursor Agent"');
    expect(script).toContain('CURSOR_AGENT_BIN="agent"');
    expect(script).toContain("export CURSOR_AGENT=1");
    expect(script).toContain(
      '"$CURSOR_AGENT_BIN" --force --approve-mcps --trust -p "$(cat "$PROMPT_FILE")"'
    );
  });
});
