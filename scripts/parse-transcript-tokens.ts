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
  const totals = new Map<string, Omit<ModelUsage, "model">>();

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      // Skip malformed JSON lines — expected in JSONL files
      continue;
    }

    if (typeof obj !== "object" || obj === null) continue;
    const record = obj as Record<string, unknown>;
    if (record.type !== "assistant") continue;

    const message = record.message as Record<string, unknown> | undefined;
    const usage = message?.usage as Record<string, unknown> | undefined;
    const model = message?.model;
    if (!usage || typeof model !== "string") continue;

    const inputTokens = Number(usage.input_tokens) || 0;
    const outputTokens = Number(usage.output_tokens) || 0;
    const cacheReadTokens = Number(usage.cache_read_input_tokens) || 0;
    const cacheCreationTokens = Number(usage.cache_creation_input_tokens) || 0;

    const existing = totals.get(model);
    if (existing) {
      existing.inputTokens += inputTokens;
      existing.outputTokens += outputTokens;
      existing.cacheReadTokens += cacheReadTokens;
      existing.cacheCreationTokens += cacheCreationTokens;
    } else {
      totals.set(model, { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens });
    }
  }

  return Array.from(totals.entries()).map(([model, counts]) => ({ model, ...counts }));
}

// --- Main ---

async function main(): Promise<void> {
  const filePath = process.argv[2];

  if (!filePath) {
    process.stderr.write("Usage: parse-transcript-tokens.ts <path-to-jsonl>\n");
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    process.stderr.write(`File not found: ${filePath}\n`);
    process.exit(1);
  }

  const results = await parseTranscript(filePath);
  process.stdout.write(JSON.stringify(results) + "\n");
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Error parsing transcript: ${message}\n`);
  process.exit(1);
});
