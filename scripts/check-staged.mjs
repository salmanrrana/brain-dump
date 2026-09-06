#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function run(command, args, cwd = process.cwd()) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

const pathsResult = spawnSync("git", ["diff", "--cached", "--name-only", "-z"], {
  encoding: "buffer",
});
if (pathsResult.error) throw pathsResult.error;
if (pathsResult.status !== 0) process.exit(pathsResult.status ?? 1);
const changed = pathsResult.stdout.toString().split("\0").filter(Boolean);

const snapshot = mkdtempSync(join(tmpdir(), "brain-dump-staged-"));
let exitCode = 0;
try {
  exitCode = run("git", ["checkout-index", "--all", `--prefix=${snapshot}/`]);
  if (exitCode === 0) {
    symlinkSync(resolve("node_modules"), join(snapshot, "node_modules"), "dir");
    symlinkSync(
      resolve("mcp-server/node_modules"),
      join(snapshot, "mcp-server/node_modules"),
      "dir"
    );
    exitCode = run("pnpm", ["check:fast", "--", ...changed], snapshot);
  }
} finally {
  rmSync(snapshot, { recursive: true, force: true });
}

process.exitCode = exitCode;
