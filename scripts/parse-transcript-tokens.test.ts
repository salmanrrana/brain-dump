import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it.each([
  ["script", ["scripts/parse-transcript-tokens.ts"]],
  ["CLI", ["cli/brain-dump.ts", "telemetry", "parse-transcript", "--transcript"]],
])("%s counts streamed messages once without opening the database", (_name, command) => {
  const root = mkdtempSync(join(tmpdir(), "claude-usage-"));
  const transcript = join(root, "transcript.jsonl");
  function message(id: string, output: number): string {
    return JSON.stringify({
      type: "assistant",
      message: {
        id,
        model: "claude-sonnet-4-6",
        usage: {
          input_tokens: 3,
          output_tokens: output,
          cache_read_input_tokens: 100,
          cache_creation_input_tokens: 20,
        },
      },
    });
  }
  try {
    writeFileSync(
      transcript,
      [message("msg-1", 4), message("msg-1", 10), message("msg-1", 10), message("msg-2", 2)].join(
        "\n"
      )
    );
    const result = spawnSync(process.execPath, ["--import", "tsx", ...command, transcript], {
      env: { ...process.env, XDG_DATA_HOME: join(root, "data"), HOME: join(root, "home") },
      encoding: "utf8",
      timeout: 10_000,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(join(root, "data", "brain-dump", "brain-dump.db"))).toBe(false);
    expect(JSON.parse(result.stdout)).toEqual([
      {
        model: "claude-sonnet-4-6",
        inputTokens: 6,
        outputTokens: 12,
        cacheReadTokens: 200,
        cacheCreationTokens: 40,
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
