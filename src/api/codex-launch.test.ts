import { describe, it, expect } from "vitest";
import { buildCodexAppLaunchPlan } from "./codex-launch";

describe("buildCodexAppLaunchPlan", () => {
  it("builds macOS project/context launch commands with both app aliases", () => {
    const plan = buildCodexAppLaunchPlan(
      "/Users/test/dev/brain-dump",
      "/Users/test/dev/brain-dump/.brain-dump-context.md",
      "darwin"
    );

    expect(plan.projectCommands).toEqual([
      'open -a "Codex" "/Users/test/dev/brain-dump"',
      'open -a "Codex.app" "/Users/test/dev/brain-dump"',
    ]);
    expect(plan.contextCommands).toEqual([
      'open -a "Codex" "/Users/test/dev/brain-dump/.brain-dump-context.md"',
      'open -a "Codex.app" "/Users/test/dev/brain-dump/.brain-dump-context.md"',
    ]);
  });

  it("escapes shell-sensitive characters in paths", () => {
    const plan = buildCodexAppLaunchPlan(
      '/Users/test/$HOME/my "project"',
      '/Users/test/$HOME/my "project"/.brain-dump-context.md',
      "darwin"
    );

    expect(plan.projectCommands[0]).toContain("\\$HOME");
    expect(plan.projectCommands[0]).toContain('\\"project\\"');
    expect(plan.contextCommands[0]).toContain("\\$HOME");
    expect(plan.contextCommands[0]).toContain('\\"project\\"');
  });

  it("uses codex command fallback on non-macOS platforms", () => {
    const plan = buildCodexAppLaunchPlan("/workspace/repo", "/workspace/repo/.brain-dump-context.md", "linux");

    expect(plan.projectCommands).toEqual(['codex "/workspace/repo"']);
    expect(plan.contextCommands).toEqual(['codex "/workspace/repo/.brain-dump-context.md"']);
  });
});
