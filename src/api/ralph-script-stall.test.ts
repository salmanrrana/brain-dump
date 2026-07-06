import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { generateRalphScript } from "./ralph-script";

/**
 * The no-progress circuit breaker must stop the loop when iterations keep
 * "finishing" without any ticket staying done. Comparing only against the
 * previous iteration's incomplete count missed oscillation: an iteration
 * marks a PRD story passing, the next repairs a bad handoff and flips it
 * back, and the plain last-value comparison saw "change" every time — the
 * loop burned ~25 iterations on one repeating blocker before a human
 * intervened (2026-07-06). Progress must mean a new best-ever floor.
 */
describe("generateRalphScript no-progress circuit breaker", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ralph-stall-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it("counts progress only when the incomplete count reaches a new low", () => {
    const script = generateRalphScript("/tmp/project", 3);

    expect(script).toContain("BEST_INCOMPLETE_COUNT=999999");
    expect(script).toContain('[ "$INCOMPLETE" -lt "$BEST_INCOMPLETE_COUNT" ]');
    // The oscillation-vulnerable last-value comparison must be gone.
    expect(script).not.toContain("LAST_INCOMPLETE_COUNT");
    // The stall log line still carries the STALLED: marker operators grep for.
    expect(script).toContain("STALLED: No new ticket completed");
    // An unreadable/empty PRD (reads as 0/0) must skip tracking entirely,
    // never latch the floor at 0 and poison every later iteration.
    expect(script).toContain('if [ "$TOTAL" = "0" ]; then');
    expect(script).toContain("progress tracking skipped");
  });

  it("generates a script that passes a bash syntax check", () => {
    const script = generateRalphScript("/tmp/project", 3);
    const scriptPath = join(tmp, "ralph.sh");
    writeFileSync(scriptPath, script);

    // bash -n parses without executing; catches template-escaping mistakes.
    expect(() => execFileSync("bash", ["-n", scriptPath])).not.toThrow();
  });
});
