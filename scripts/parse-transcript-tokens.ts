#!/usr/bin/env tsx
/**
 * Parse Claude Code JSONL transcript files and extract token usage per model.
 *
 * Usage: npx tsx scripts/parse-transcript-tokens.ts <path-to-jsonl>
 *
 * Reads a Claude Code JSONL transcript, extracts usage data from assistant
 * messages, groups by model, and outputs a JSON array to stdout:
 *
 *   [{model, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens}]
 *
 * Exit codes:
 *   0 - success (even if no usage data found — outputs [])
 *   1 - missing or invalid arguments
 */

import * as fs from "node:fs";
import * as readline from "node:readline";

interface ModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

async function parseTranscript(filePath: string): Promise<ModelUsage[]> {
  const totals = new Map<
    string,
    {
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheCreationTokens: number;
    }
  >();

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    try {
      const obj = JSON.parse(line);

      if (obj.type !== "assistant") continue;

      const usage = obj.message?.usage;
      const model = obj.message?.model;
      if (!usage || !model) continue;

      const inputTokens = usage.input_tokens ?? 0;
      const outputTokens = usage.output_tokens ?? 0;
      const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
      const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;

      const existing = totals.get(model);
      if (existing) {
        existing.inputTokens += inputTokens;
        existing.outputTokens += outputTokens;
        existing.cacheReadTokens += cacheReadTokens;
        existing.cacheCreationTokens += cacheCreationTokens;
      } else {
        totals.set(model, { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens });
      }
    } catch {
      // Skip malformed lines — not an error
      continue;
    }
  }

  return Array.from(totals.entries()).map(([model, counts]) => ({ model, ...counts }));
}

// --- Main ---

const filePath = process.argv[2];

if (!filePath) {
  process.stderr.write("Usage: parse-transcript-tokens.ts <path-to-jsonl>\n");
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  process.stderr.write(`File not found: ${filePath}\n`);
  process.exit(1);
}

parseTranscript(filePath)
  .then((results) => {
    process.stdout.write(JSON.stringify(results) + "\n");
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error parsing transcript: ${message}\n`);
    process.exit(1);
  });
