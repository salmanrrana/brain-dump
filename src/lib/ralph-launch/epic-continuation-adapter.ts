import { spawn, type SpawnOptions } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { AutonomousEpicLaunchProfile } from "../../../core/epic-continuation.ts";

export interface HeadlessEpicContinuationDependencies {
  spawnImpl?: typeof spawn;
}

export async function launchEpicContinuationHeadless(
  profile: AutonomousEpicLaunchProfile,
  ticketId: string,
  dependencies: HeadlessEpicContinuationDependencies = {}
): Promise<void> {
  if (!existsSync(profile.projectPath)) {
    throw new Error(`Epic continuation project directory is missing: ${profile.projectPath}`);
  }
  if (!existsSync(profile.scriptPath)) {
    if (!profile.scriptContent) {
      throw new Error(`Epic continuation script is missing: ${profile.scriptPath}`);
    }
    mkdirSync(dirname(profile.scriptPath), { recursive: true });
    writeFileSync(profile.scriptPath, profile.scriptContent, { mode: 0o700 });
  }

  const spawnImpl = dependencies.spawnImpl ?? spawn;
  await new Promise<void>((resolve, reject) => {
    const options: SpawnOptions = {
      cwd: profile.projectPath,
      detached: process.platform !== "win32",
      stdio: "ignore",
      env: { ...process.env, BRAIN_DUMP_EPIC_CONTINUATION: "1" },
    };
    const child = spawnImpl(
      "bash",
      [profile.scriptPath, String(profile.maxIterations), ticketId],
      options
    );
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Epic continuation exited with code ${code ?? "unknown"}.`));
    });
  });
}
