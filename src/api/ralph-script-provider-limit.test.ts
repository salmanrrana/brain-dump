import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { generateRalphScript } from "./ralph-script";

/**
 * A provider usage/session-limit rejection fails every retry identically and
 * each retry still spends quota (observed 2026-07-19: five byte-identical
 * "You've hit your session limit" transcripts, 15 quota-charged attempts, and
 * a closing terminal blaming "CLI cannot start properly"). The loop must
 * detect the rejection, stop without retries, and say what actually happened.
 */
describe("generateRalphScript provider usage-limit handling", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ralph-limit-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it("captures AI output and stops without retries on a usage-limit rejection", () => {
    const script = generateRalphScript("/tmp/project", 3);

    // Claude print-mode output is teed so the loop can inspect it.
    expect(script).toContain('tee "$AI_OUTPUT_FILE"');
    // tee must not mask the AI exit code.
    expect(script).toContain("set -o pipefail");
    // The detector matches the provider's limit phrasing, not generic errors.
    expect(script).toContain("detect_provider_limit()");
    expect(script).toContain("hit|reached) your (session|usage|weekly|5-hour) limit");
    // A detected limit breaks out of the retry loop immediately...
    expect(script).toContain('detect_provider_limit "$AI_OUTPUT_FILE"');
    expect(script).toContain("AI_PROVIDER_LIMIT=true");
    // ...and aborts with an honest, durable explanation instead of the
    // misleading "CLI cannot start properly" banner.
    expect(script).toContain("usage limit reached — Ralph is stopping without retries");
    expect(script).toContain("PROVIDER LIMIT:");
    expect(script).toContain("NOT a code or workflow failure");
  });

  it("detects the reviewer hitting the limit too", () => {
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
      undefined,
      undefined,
      { aiBackend: "claude" }
    );
    // The fresh-eyes reviewer block re-checks the captured output on failure.
    const reviewFailureIndex = script.indexOf("REVIEW FAILURE");
    expect(reviewFailureIndex).toBeGreaterThan(-1);
    const reviewerSection = script.slice(reviewFailureIndex, reviewFailureIndex + 600);
    expect(reviewerSection).toContain('detect_provider_limit "$AI_OUTPUT_FILE"');
  });

  it("generates a script that passes a bash syntax check", () => {
    const script = generateRalphScript("/tmp/project", 3);
    const scriptPath = join(tmp, "ralph-limit.sh");
    writeFileSync(scriptPath, script);
    // bash -n parses without executing; catches template-escaping mistakes.
    expect(() => execFileSync("bash", ["-n", scriptPath])).not.toThrow();
  });
});
