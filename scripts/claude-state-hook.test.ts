import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

it.each([undefined, "implementing", "testing", "committing", "reviewing"])(
  "uses the current PreToolUse contract for state %s",
  (state) => {
    const root = mkdtempSync(join(tmpdir(), "claude-state-hook-"));
    const sessionId = 'session-with-"quotes"';
    if (state) {
      mkdirSync(join(root, ".claude"));
      writeFileSync(
        join(root, ".claude", "ralph-state.json"),
        JSON.stringify({ currentState: state, sessionId })
      );
    }
    try {
      const result = spawnSync("bash", [resolve(".claude/hooks/enforce-state-before-write.sh")], {
        cwd: root,
        env: { ...process.env, CLAUDE_PROJECT_DIR: root },
        input: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: "page.tsx" } }),
        encoding: "utf8",
        timeout: 5_000,
      });
      expect(result.status, result.stderr).toBe(0);
      if (state === "reviewing") {
        expect(JSON.parse(result.stdout)).toEqual({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: expect.stringContaining(sessionId),
          },
        });
      } else {
        expect(result.stdout).toBe("");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
);
