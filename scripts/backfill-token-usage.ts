#!/usr/bin/env tsx
/**
 * Backfill token usage from existing Claude Code JSONL transcript files.
 *
 * Scans ~/.claude/projects/<project-hash>/ for main session JSONL transcripts,
 * parses each for token usage, matches to telemetry sessions by time overlap,
 * and records usage via the core recordUsage function.
 *
 * Usage:
 *   npx tsx scripts/backfill-token-usage.ts [--dry-run] [--limit N]
 *
 * Options:
 *   --dry-run   Show what would be recorded without writing to DB
 *   --limit N   Only process the first N files
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as readline from "node:readline";
import { initDatabase, consoleLogger, recordUsage } from "../core/index.ts";
import type { DbHandle } from "../core/index.ts";

// --- Types ---

interface ModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

interface TelemetrySessionRow {
  id: string;
  ticket_id: string | null;
  started_at: string;
  ended_at: string | null;
}

// --- JSONL Parser (inlined from parse-transcript-tokens.ts) ---

async function parseTranscript(filePath: string): Promise<ModelUsage[]> {
  const totals = new Map<string, Omit<ModelUsage, "model">>();

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
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

// --- Session Matching ---

function findMatchingSession(db: DbHandle, fileMtime: Date): TelemetrySessionRow | undefined {
  // Find a telemetry session whose time range contains the file's modification time.
  // The file mtime is roughly when the session ended, so we look for sessions
  // that started before the mtime and ended after or near it.
  // Also try sessions that haven't ended yet if they started before the file.

  // Strategy: find session whose started_at is closest to but before the file mtime
  const row = db
    .prepare(
      `SELECT id, ticket_id, started_at, ended_at
       FROM telemetry_sessions
       WHERE started_at <= ?
       ORDER BY started_at DESC
       LIMIT 1`
    )
    .get(fileMtime.toISOString()) as TelemetrySessionRow | undefined;

  if (!row) return undefined;

  // Verify the session is a reasonable match (within 24 hours)
  const sessionStart = new Date(row.started_at);
  const diffMs = fileMtime.getTime() - sessionStart.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours > 24) return undefined;

  return row;
}

// --- Main ---

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitIdx = args.indexOf("--limit");
  const limitArg = limitIdx >= 0 ? args[limitIdx + 1] : undefined;
  const limit = limitArg ? parseInt(limitArg, 10) : Infinity;

  // Find the JSONL project directory for brain-dump
  const homeDir = os.homedir();
  const projectDir = path.join(
    homeDir,
    ".claude",
    "projects",
    "-home-xtra-code-personal-projects-brain-dump"
  );

  if (!fs.existsSync(projectDir)) {
    console.error(`Project directory not found: ${projectDir}`);
    process.exit(1);
  }

  // Find main session JSONL files (not subagent ones)
  const allFiles = fs.readdirSync(projectDir);
  const jsonlFiles = allFiles
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => path.join(projectDir, f))
    .slice(0, limit);

  console.log(`Found ${jsonlFiles.length} main session JSONL files`);
  if (dryRun) console.log("DRY RUN — no data will be written\n");

  const { db } = initDatabase({ logger: consoleLogger });

  // Build set of existing backfill timestamps to prevent duplicates
  const existingBackfillDates = new Set(
    (
      db
        .prepare("SELECT DISTINCT recorded_at FROM token_usage WHERE source = 'jsonl-backfill'")
        .all() as Array<{ recorded_at: string }>
    ).map((r) => r.recorded_at)
  );

  const existingCount = (
    db.prepare("SELECT COUNT(*) as count FROM token_usage").get() as { count: number }
  ).count;
  console.log(`Existing token_usage rows: ${existingCount}`);
  console.log(`Existing backfill timestamps: ${existingBackfillDates.size}\n`);

  let processed = 0;
  let recorded = 0;
  let skippedEmpty = 0;
  let skippedDuplicate = 0;
  let skippedError = 0;
  let totalCostUsd = 0;

  for (const filePath of jsonlFiles) {
    const fileName = path.basename(filePath, ".jsonl");
    const stat = fs.statSync(filePath);
    const fileMtime = stat.mtime;

    // Skip files already backfilled (matched by exact recorded_at timestamp)
    if (existingBackfillDates.has(fileMtime.toISOString())) {
      skippedDuplicate++;
      continue;
    }

    try {
      const usage = await parseTranscript(filePath);

      if (usage.length === 0) {
        skippedEmpty++;
        continue;
      }

      // Try to match to a telemetry session
      const session = findMatchingSession(db, fileMtime);
      const ticketId = session?.ticket_id || undefined;
      const sessionId = session?.id || undefined;

      const totalTokens = usage.reduce((sum, u) => sum + u.inputTokens + u.outputTokens, 0);

      if (dryRun) {
        console.log(
          `[DRY] ${fileName} → ${usage.length} model(s), ` +
            `${totalTokens.toLocaleString()} tokens, ` +
            `session=${sessionId?.slice(0, 8) || "none"}, ` +
            `ticket=${ticketId?.slice(0, 8) || "none"}, ` +
            `date=${fileMtime.toISOString().slice(0, 10)}`
        );
        processed++;
        continue;
      }

      // Record usage for each model, using the file's mtime as recorded_at
      for (const u of usage) {
        const result = recordUsage(db, {
          model: u.model,
          inputTokens: u.inputTokens,
          outputTokens: u.outputTokens,
          cacheReadTokens: u.cacheReadTokens,
          cacheCreationTokens: u.cacheCreationTokens,
          source: "jsonl-backfill",
          recordedAt: fileMtime.toISOString(),
          ...(sessionId ? { telemetrySessionId: sessionId } : {}),
          ...(ticketId ? { ticketId } : {}),
        });
        totalCostUsd += result.costUsd ?? 0;
        recorded++;
      }

      processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error processing ${fileName}: ${message}`);
      skippedError++;
    }
  }

  console.log("\n--- Backfill Summary ---");
  console.log(`Files processed: ${processed}`);
  console.log(`Files skipped (no usage data): ${skippedEmpty}`);
  console.log(`Files skipped (already backfilled): ${skippedDuplicate}`);
  console.log(`Files skipped (errors): ${skippedError}`);
  console.log(`Token usage rows recorded: ${recorded}`);
  console.log(`Total cost: $${totalCostUsd.toFixed(2)}`);

  if (dryRun) {
    console.log("\nRe-run without --dry-run to actually record data.");
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Backfill error: ${message}`);
  process.exit(1);
});
