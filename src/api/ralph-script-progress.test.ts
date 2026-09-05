import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { generateRalphScript } from "./ralph-script";

it.skipIf(process.platform === "win32")(
  "keeps tracked project progress clean when the launcher times out",
  () => {
    const root = mkdtempSync(join(tmpdir(), "ralph-tracked-progress-"));
    const project = join(root, "project");
    const state = join(root, "state");
    const bin = join(root, "bin");
    try {
      mkdirSync(join(project, "plans"), { recursive: true });
      mkdirSync(bin);
      mkdirSync(join(root, "tmp"));
      const progress = join(project, "plans/progress.txt");
      writeFileSync(progress, "Project history\n");
      writeFileSync(
        join(project, "plans/prd.json"),
        JSON.stringify({
          userStories: [{ id: "t", title: "T", passes: false, status: "in_progress" }],
        })
      );
      execFileSync("git", ["init", "-q", project]);
      execFileSync("git", ["-C", project, "add", "plans/progress.txt"]);
      writeFileSync(join(bin, "claude"), "#!/bin/sh\nsleep 30\n", { mode: 0o700 });
      const script = join(root, "ralph.sh");
      writeFileSync(script, generateRalphScript(project, 1, false, undefined, 1));
      expect(() =>
        execFileSync("bash", [script], {
          timeout: 10000,
          stdio: "pipe",
          env: {
            ...process.env,
            PATH: bin + ":" + process.env.PATH,
            XDG_STATE_HOME: state,
            TMPDIR: join(root, "tmp"),
            BRAIN_DUMP_EPIC_CONTINUATION: "1",
          },
        })
      ).toThrow();
      expect(readFileSync(progress, "utf8")).toBe("Project history\n");
      const logs = join(state, "brain-dump/ralph");
      const log = readdirSync(logs).find((name) => name.endsWith(".progress.txt"))!;
      expect(readFileSync(join(logs, log), "utf8")).toContain("Session Timeout");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
  15000
);
