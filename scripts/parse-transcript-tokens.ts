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
import { parseClaudeTranscript } from "../core/claude-transcript.ts";

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

  const { usage: results } = await parseClaudeTranscript(filePath);
  process.stdout.write(JSON.stringify(results) + "\n");
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Error parsing transcript: ${message}\n`);
  process.exit(1);
});
