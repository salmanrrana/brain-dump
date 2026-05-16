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
      '"$CURSOR_AGENT_BIN" --force --approve-mcps --trust "${CURSOR_AGENT_MODEL_ARGS[@]}" -p "$(cat "$PROMPT_FILE")"'
    );
  });

  it("omits --model when no concrete model is selected", () => {
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

    expect(script).toContain("CURSOR_AGENT_MODEL_ARGS=()");
    expect(script).toContain(
      'if [ -n "${BRAIN_DUMP_LAUNCH_MODEL:-}" ]; then\n    CURSOR_AGENT_MODEL_ARGS+=(--model "${BRAIN_DUMP_LAUNCH_MODEL}")\n  fi'
    );
    expect(script).not.toContain("export BRAIN_DUMP_LAUNCH_MODEL=");
  });

  it("passes concrete Cursor models into the Ralph invocation", () => {
    const script = generateRalphScript(
      "/tmp/project",
      3,
      false,
      undefined,
      undefined,
      null,
      undefined,
      "cursor-agent",
      { type: "implementation" },
      {
        kind: "concrete",
        provider: "cursor",
        modelName: "Composer 2",
      }
    );

    expect(script).toContain('export BRAIN_DUMP_LAUNCH_MODEL_PROVIDER="cursor"');
    expect(script).toContain('export BRAIN_DUMP_LAUNCH_MODEL="Composer 2"');
    expect(script).toContain('CURSOR_AGENT_MODEL_ARGS+=(--model "${BRAIN_DUMP_LAUNCH_MODEL}")');
  });
});
