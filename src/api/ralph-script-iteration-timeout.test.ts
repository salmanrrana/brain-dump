import { describe, expect, it } from "vitest";
import { DEFAULT_PER_ITERATION_TIMEOUT_SECONDS, generateRalphScript } from "./ralph-script";

/**
 * The wrapper loop must wrap each AI invocation in a per-iteration timeout so a
 * single iteration whose AI process never exits (hangs on the invocation line)
 * is killed and surfaced, instead of silently stalling the loop until the
 * session-level timeout fires.
 */
describe("generateRalphScript per-iteration timeout", () => {
  it("wires up a per-iteration timeout and wraps the AI invocation with it", () => {
    const script = generateRalphScript("/tmp/project", 3);

    expect(script).toContain(`PER_ITERATION_TIMEOUT=${DEFAULT_PER_ITERATION_TIMEOUT_SECONDS}`);
    expect(script).toContain("command -v timeout");
    expect(script).toContain(
      'ITER_TIMEOUT_CMD="timeout --signal=TERM --kill-after=30 $PER_ITERATION_TIMEOUT"'
    );
    // The actual AI invocation is prefixed with the timeout command.
    expect(script).toContain("$ITER_TIMEOUT_CMD claude --dangerously-skip-permissions");
  });

  it("writes a distinct ITERATION TIMEOUT warning to progress.txt when the timeout fires", () => {
    const script = generateRalphScript("/tmp/project", 3);

    expect(script).toContain("AI_ITER_TIMEOUT=true");
    expect(script).toContain("[ $AI_EXIT_CODE -eq 124 ]");
    expect(script).toContain("[ $AI_EXIT_CODE -eq 137 ]");
    expect(script).toContain("ITERATION TIMEOUT:");
    // Distinct from the existing no-progress STALLED message and session timeout.
    expect(script).toContain("STALLED:");
    expect(script).toContain("Session Timeout");
  });

  it("clamps the per-iteration timeout so it never exceeds the session timeout", () => {
    const shortSession = 600; // 10 minutes, shorter than the 30-minute default
    const script = generateRalphScript("/tmp/project", 3, false, undefined, shortSession);

    expect(script).toContain(`PER_ITERATION_TIMEOUT=${shortSession}`);
  });

  it("falls back gracefully when the timeout binary is unavailable", () => {
    const script = generateRalphScript("/tmp/project", 3);

    expect(script).toContain("per-iteration AI timeout disabled");
  });
});
