#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

function gitPaths(args) {
  const result = spawnSync("git", args, { encoding: "buffer" });
  if (result.error) throw result.error;
  if (result.status !== 0) return [];
  return result.stdout.toString().split("\0").filter(Boolean);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const passedPaths = process.argv.slice(2).filter((arg) => arg !== "--");
const changed = passedPaths.length
  ? passedPaths
  : [
      ...gitPaths(["diff", "--name-only", "--diff-filter=ACMRD", "-z", "HEAD"]),
      ...gitPaths(["ls-files", "--others", "--exclude-standard", "-z"]),
    ];
const uniqueChanged = [...new Set(changed)];

run("pnpm", ["lint"]);
run("pnpm", ["type-check:fast"]);

const needsBroadTests = uniqueChanged.some(
  (path) =>
    !existsSync(path) ||
    /(^|\/)(?:package\.json|pnpm-lock\.yaml|tsconfig\.json|vite\.config\.ts|vitest[^/]*\.ts|eslint\.config\.js|scripts\/check-fast\.mjs)$/.test(
      path
    )
);
const related = uniqueChanged.filter(
  (path) => existsSync(path) && /\.(?:js|jsx|mjs|cjs|ts|tsx)$/.test(path)
);

if (needsBroadTests) {
  run("pnpm", ["test:all"]);
} else if (related.length > 0) {
  run("pnpm", [
    "exec",
    "vitest",
    "related",
    "--run",
    "--project",
    "node",
    "--project",
    "dom",
    "--passWithNoTests",
    ...related,
  ]);
} else {
  console.log("check:fast: lint and types passed; no runtime-related source files changed");
}
