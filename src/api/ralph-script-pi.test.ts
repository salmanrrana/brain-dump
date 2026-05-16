import { describe, expect, it } from "vitest";
import { generateRalphScript } from "./ralph-script";

describe("generateRalphScript pi backend", () => {
  it("uses Pi CLI headlessly with Brain Dump provider markers", () => {
    const script = generateRalphScript(
      "/tmp/project",
      3,
      false,
      undefined,
      undefined,
      null,
      undefined,
      "pi"
    );

    expect(script).toContain("export RALPH_SESSION=1");
    expect(script).toContain("command -v pi");
    expect(script).toContain('PI_HELP_OUTPUT="$(pi --help 2>&1)"');
    expect(script).toContain("Installed Pi CLI is missing prompt/headless support");
    expect(script).toContain("export PI=1");
    expect(script).toContain("export BRAIN_DUMP_PROVIDER=pi");
    expect(script).toContain("export BRAIN_DUMP_RALPH_PROVIDER=pi");
    expect(script).toContain('pi "${PI_MODEL_ARGS[@]}" -p "$(cat "$PROMPT_FILE")"');
  });
});
