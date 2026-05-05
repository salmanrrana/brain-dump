import { describe, expect, it } from "vitest";
import { generateRalphScript } from "./ralph-script";

describe("generateRalphScript model selection", () => {
  it("does not add model override environment when no concrete model is selected", () => {
    const script = generateRalphScript("/tmp/project");

    expect(script).not.toContain("BRAIN_DUMP_LAUNCH_MODEL_PROVIDER");
    expect(script).not.toContain("BRAIN_DUMP_LAUNCH_MODEL=");
  });

  it("threads concrete model selection into generated Ralph scripts", () => {
    const script = generateRalphScript(
      "/tmp/project",
      3,
      false,
      undefined,
      undefined,
      null,
      undefined,
      "codex",
      { type: "implementation" },
      {
        kind: "concrete",
        provider: "openai",
        modelName: "gpt-5.4",
      }
    );

    expect(script).toContain('export BRAIN_DUMP_LAUNCH_MODEL_PROVIDER="openai"');
    expect(script).toContain('export BRAIN_DUMP_LAUNCH_MODEL="gpt-5.4"');
  });

  it("passes concrete OpenCode selections as --model provider/model", () => {
    const script = generateRalphScript(
      "/tmp/project",
      3,
      false,
      undefined,
      undefined,
      null,
      undefined,
      "opencode",
      { type: "implementation" },
      {
        kind: "concrete",
        provider: "openai",
        modelName: "gpt-5.4",
      }
    );

    expect(script).toContain(
      'OPENCODE_MODEL_ARGS+=(--model "${BRAIN_DUMP_LAUNCH_MODEL_PROVIDER}/${BRAIN_DUMP_LAUNCH_MODEL}")'
    );
    expect(script).toContain('opencode run "${OPENCODE_MODEL_ARGS[@]}" "$(cat "$PROMPT_FILE")"');
  });

  it("passes concrete Claude selections as --model modelName", () => {
    const script = generateRalphScript(
      "/tmp/project",
      3,
      false,
      undefined,
      undefined,
      null,
      undefined,
      "claude",
      { type: "implementation" },
      {
        kind: "concrete",
        provider: "anthropic",
        modelName: "claude-sonnet-4-6",
      }
    );

    expect(script).toContain(
      'claude --dangerously-skip-permissions --model "$BRAIN_DUMP_LAUNCH_MODEL" --output-format text -p "$(cat "$PROMPT_FILE")"'
    );
  });

  it("passes concrete Codex selections as --model modelName", () => {
    const script = generateRalphScript(
      "/tmp/project",
      3,
      false,
      undefined,
      undefined,
      null,
      undefined,
      "codex",
      { type: "implementation" },
      {
        kind: "concrete",
        provider: "openai",
        modelName: "gpt-5.4",
      }
    );

    expect(script).toContain('CODEX_MODEL_ARGS+=(--model "${BRAIN_DUMP_LAUNCH_MODEL}")');
    expect(script).toContain(
      'codex exec "${CODEX_MODEL_ARGS[@]}" --dangerously-bypass-approvals-and-sandbox "$(cat "$PROMPT_FILE")"'
    );
  });

  it("passes concrete Claude selections into Docker Ralph invocations", () => {
    const script = generateRalphScript(
      "/tmp/project",
      3,
      true,
      undefined,
      undefined,
      null,
      undefined,
      "claude",
      { type: "implementation" },
      {
        kind: "concrete",
        provider: "anthropic",
        modelName: "claude-sonnet-4-6",
      }
    );

    expect(script).toContain(
      'claude --dangerously-skip-permissions \\\n    --model "claude-sonnet-4-6" /workspace/.ralph-prompt.md'
    );
  });
});
