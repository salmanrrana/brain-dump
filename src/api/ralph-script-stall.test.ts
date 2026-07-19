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
    expect(script).toContain("PRD_STATUS_HIGH_WATER=");
    expect(script).toContain('elif [ "$WORKFLOW_ADVANCED" = "1" ]; then');
    expect(script).toContain("A ticket reached a new workflow phase");
    expect(script).toContain("current>(high[s.id]??-1)");
    // The oscillation-vulnerable last-value comparison must be gone.
    expect(script).not.toContain("LAST_INCOMPLETE_COUNT");
    // The stall log line still carries the STALLED: marker operators grep for.
    expect(script).toContain("STALLED: No new ticket completed");
    // An unreadable/empty PRD (reads as 0/0) must skip tracking entirely,
    // never latch the floor at 0 and poison every later iteration.
    expect(script).toContain('if [ "$TOTAL" = "0" ]; then');
    expect(script).toContain("progress tracking skipped");
    expect(script).toContain('x.every(s=>s.status==="ai_verification")');
    expect(script).toContain('elif [ "$WAITING_FOR_VERIFICATION" = "1" ]; then');
    expect(script).toContain("no-progress tracking paused");
  });

  it("pins durable continuation launches to the failed ticket", () => {
    const script = generateRalphScript("/tmp/project", 3);
    expect(script).toContain("RESUME_TICKET_ID=${2:-}");
    expect(script).toContain("Continuation target: resume ticket $RESUME_TICKET_ID");
    expect(script).toContain("Ralph is waiting without spending an iteration");
    expect(script).toContain("Do not call start-work for another ticket");
    expect(script).toContain('if [ "${BRAIN_DUMP_EPIC_CONTINUATION:-0}" = "1" ]; then');
  });

  it("generates a script that passes a bash syntax check", () => {
    const script = generateRalphScript("/tmp/project", 3);
    const scriptPath = join(tmp, "ralph.sh");
    writeFileSync(scriptPath, script);

    // bash -n parses without executing; catches template-escaping mistakes.
    expect(() => execFileSync("bash", ["-n", scriptPath])).not.toThrow();
  });
});
