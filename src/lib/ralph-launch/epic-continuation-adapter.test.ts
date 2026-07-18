import { EventEmitter } from "events";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { launchEpicContinuationHeadless } from "./epic-continuation-adapter";

describe("headless epic continuation adapter", () => {
  const paths: string[] = [];
  afterEach(() =>
    paths.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }))
  );

  it("spawns the Brain Dump-owned script directly with the resume ticket", async () => {
    const projectPath = mkdtempSync(join(tmpdir(), "continuation-project-"));
    paths.push(projectPath);
    const scriptPath = join(projectPath, "ralph.sh");
    writeFileSync(scriptPath, "#!/bin/bash\n");
    const child = new EventEmitter();
    const spawnImpl = vi.fn(() => {
      queueMicrotask(() => child.emit("exit", 0));
      return child;
    });

    await launchEpicContinuationHeadless(
      { epicId: "e", projectPath, scriptPath, maxIterations: 9 },
      "failed-ticket",
      { spawnImpl: spawnImpl as never }
    );

    expect(spawnImpl).toHaveBeenCalledWith(
      "bash",
      [scriptPath, "9", "failed-ticket"],
      expect.objectContaining({ cwd: projectPath, stdio: "ignore" })
    );
  });

  it("rejects a continuation whose process exits unsuccessfully", async () => {
    const projectPath = mkdtempSync(join(tmpdir(), "continuation-project-"));
    paths.push(projectPath);
    const scriptPath = join(projectPath, "ralph.sh");
    writeFileSync(scriptPath, "#!/bin/bash\n");
    const child = new EventEmitter();
    const spawnImpl = vi.fn(() => {
      queueMicrotask(() => child.emit("exit", 1));
      return child;
    });

    await expect(
      launchEpicContinuationHeadless(
        { epicId: "e", projectPath, scriptPath, maxIterations: 9 },
        "failed-ticket",
        { spawnImpl: spawnImpl as never }
      )
    ).rejects.toThrow("exited with code 1");
  });
});
