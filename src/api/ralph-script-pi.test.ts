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

  it("instructs CLI-first workflow access so a provider without MCP keeps working", () => {
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

    // A CLI-only provider (Pi has no Brain Dump MCP server) must be told the
    // brain-dump CLI is the interface and that missing MCP tools are expected,
    // so it does not bail out with "MCP tools unavailable" mid-loop.
    expect(script).toContain("## Workflow Tool Access");
    expect(script).toContain("Do not stop because MCP tools are unavailable");
    expect(script).toContain("WORKFLOW_TOOLS_UNAVAILABLE");
    expect(script).toContain("brain-dump session create --ticket");
    expect(script).toContain("brain-dump review check-complete --ticket <id> --pretty");
    expect(script).not.toContain("use MCP tools literally");
  });

  it("gives the fresh-eyes reviewer CLI-first review commands", () => {
    const script = generateRalphScript(
      "/tmp/project",
      3,
      false,
      undefined,
      undefined,
      null,
      undefined,
      "pi",
      { type: "implementation" },
      undefined,
      undefined,
      { aiBackend: "claude" }
    );

    expect(script).toContain("Fresh Eyes Reviewer");
    expect(script).toContain("Do not stop because MCP tools are unavailable");
    expect(script).toContain("brain-dump review get-review-context --ticket <ticketId> --pretty");
    expect(script).toContain("brain-dump review submit-finding --ticket <ticketId>");
    expect(script).toContain(
      "already completed the ticket's active sessions during the verification handoff"
    );
  });
});
