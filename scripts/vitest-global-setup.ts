/**
 * Vitest globalSetup: wipe the previous run's .vitest-xdg sandbox.
 *
 * vitest.config.ts and vitest.quarantine.config.ts redirect XDG_DATA_HOME /
 * XDG_STATE_HOME into the repo-local .vitest-xdg/ so tests never touch the
 * real Brain Dump database. The verification suites write evidence artifacts
 * (screenshots, manifests, run directories) under that sandbox on every run
 * and nothing deleted them — observed at 273MB / 41k files, which exhausted
 * the OS inotify watch budget and killed `vite dev` with ENOSPC.
 *
 * The path is hardcoded to the repo-local sandbox those configs create; a
 * user's real XDG directories are never touched.
 */
import { rmSync } from "node:fs";
import { resolve } from "node:path";

export default function globalSetup(): void {
  rmSync(resolve(import.meta.dirname, "..", ".vitest-xdg"), { recursive: true, force: true });
}
