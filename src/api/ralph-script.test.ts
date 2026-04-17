import { describe, expect, it } from "vitest";
import { generateRalphScript } from "./ralph-script";

describe("generateRalphScript codex backend", () => {
  it("runs Codex via 'exec' with the combined bypass flag so the loop advances", () => {
    const script = generateRalphScript(
      "/tmp/project",
      3,
      false,
      undefined,
      undefined,
      null,
      undefined,
      "codex"
    );

    expect(script).toContain("export RALPH_SESSION=1");
    // Headless entrypoint — 'exec' subcommand is what exits after one iteration.
    expect(script).toContain(
      'codex exec --dangerously-bypass-approvals-and-sandbox "$(cat "$PROMPT_FILE")"'
    );
    // Preflight probes both the exec subcommand and the bypass flag.
    expect(script).toContain("codex --help 2>&1");
    expect(script).toContain("codex exec --help 2>&1");
    expect(script).toContain("--dangerously-bypass-approvals-and-sandbox");
  });

  it("does not launch the interactive TUI entrypoint without 'exec'", () => {
    const script = generateRalphScript(
      "/tmp/project",
      3,
      false,
      undefined,
      undefined,
      null,
      undefined,
      "codex"
    );

    // The bare-TUI invocation — `codex "$(cat "$PROMPT_FILE")"` — must not appear,
    // because it blocks the loop from advancing.
    expect(script).not.toMatch(/^\s*codex "\$\(cat "\$PROMPT_FILE"\)"\s*$/m);
  });

  it("does not run Codex under its sandbox during Ralph (parity with Claude)", () => {
    const script = generateRalphScript(
      "/tmp/project",
      3,
      false,
      undefined,
      undefined,
      null,
      undefined,
      "codex"
    );

    // Sandbox modes recreate the permission-prompt nightmare we are fixing.
    expect(script).not.toContain("--sandbox read-only");
    expect(script).not.toContain("--sandbox workspace-write");
  });
});
