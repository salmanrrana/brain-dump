import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

it.each([
  { response: '{"id":"usage-1"}', count: 1 },
  { response: '{"recorded":false,"skipped":true}', count: 0 },
])("reports $count recorded models for $response", ({ response, count }) => {
  const root = mkdtempSync(join(tmpdir(), "usage-hook-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "brain-dump"),
    `#!/bin/sh
if [ "$2" = "parse-transcript" ]; then
  printf '%s\\n' '[{"model":"claude-sonnet-4-6","inputTokens":1,"outputTokens":2,"cacheReadTokens":0,"cacheCreationTokens":0}]'
else
  printf '%s\\n' '${response}'
fi
`,
    { mode: 0o755 }
  );
  const transcript = join(root, "transcript.jsonl");
  writeFileSync(transcript, '{"timestamp":"2026-09-05T06:00:00.000Z"}\n');
  try {
    const result = spawnSync("bash", [resolve(".claude/hooks/capture-token-usage.sh")], {
      cwd: root,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CLAUDE_PROJECT_DIR: root },
      input: JSON.stringify({ transcript_path: transcript }),
      encoding: "utf8",
      timeout: 10_000,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(root, ".claude", "capture-token-usage.log"), "utf8")).toContain(
      `Recorded token usage for ${count}/1 model(s)`
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("keeps parser JSON clean through the real pnpm package-script fallback", () => {
  const root = mkdtempSync(join(tmpdir(), "usage-hook-pnpm-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  const pnpm = spawnSync("which", ["pnpm"], { encoding: "utf8" }).stdout.trim();
  symlinkSync(pnpm, join(bin, "pnpm"));
  symlinkSync(process.execPath, join(bin, "node"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "hook-fixture",
      version: "1.0.0",
      scripts: { "brain-dump": "node fixture-cli.cjs" },
    })
  );
  writeFileSync(
    join(root, "fixture-cli.cjs"),
    `console.log(JSON.stringify(process.argv.includes('parse-transcript') ? [{model:'claude-sonnet-4-6',inputTokens:1,outputTokens:2,cacheReadTokens:0,cacheCreationTokens:0}] : {id:'usage-1'}));`
  );
  const transcript = join(root, "transcript.jsonl");
  writeFileSync(transcript, '{"timestamp":"2026-09-05T06:00:00.000Z"}\n');
  try {
    const result = spawnSync("/bin/bash", [resolve(".claude/hooks/capture-token-usage.sh")], {
      cwd: root,
      env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, HOME: root, CLAUDE_PROJECT_DIR: root },
      input: JSON.stringify({ transcript_path: transcript }),
      encoding: "utf8",
      timeout: 15_000,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(root, ".claude", "capture-token-usage.log"), "utf8")).toContain(
      "Recorded token usage for 1/1 model(s)"
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
