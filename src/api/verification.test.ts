import { describe, expect, it } from "vitest";
import { verifierFromRunRow } from "./verification.ts";

describe("verifierFromRunRow", () => {
  it("falls back to persisted identity columns when legacy manifests have no verifier", () => {
    expect(
      verifierFromRunRow(
        {
          provider: "opencode",
          actor: "opencode ralph",
          providerSource: "explicit",
          executionSurface: "enqueue-drain",
          workerId: "worker-1",
          codeGitSha: "verifier-sha",
        },
        null
      )
    ).toEqual({
      provider: "opencode",
      actor: "opencode ralph",
      providerSource: "explicit",
      executionSurface: "enqueue-drain",
      workerId: "worker-1",
      codeGitSha: "verifier-sha",
    });
  });
});
