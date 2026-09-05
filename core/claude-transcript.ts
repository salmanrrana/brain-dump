import { createReadStream, statSync } from "node:fs";
import { createInterface } from "node:readline";

export interface TranscriptUsageCounts {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface ClaudeTranscript {
  path: string;
  mtimeMs: number;
  usage: TranscriptUsageCounts[];
  firstEventMs: number | null;
  lastEventMs: number | null;
}

/** Read usage snapshots once per Claude message, shared by live hooks and backfills. */
export async function parseClaudeTranscript(filePath: string): Promise<ClaudeTranscript> {
  const totals = new Map<string, Omit<TranscriptUsageCounts, "model">>();
  const messages = new Map<string, Omit<TranscriptUsageCounts, "model">>();
  let firstEventMs: number | null = null;
  let lastEventMs: number | null = null;
  const lines = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const record = parsed as Record<string, unknown>;
    const timestamp = typeof record.timestamp === "string" ? Date.parse(record.timestamp) : NaN;
    if (Number.isFinite(timestamp)) {
      firstEventMs = firstEventMs === null ? timestamp : Math.min(firstEventMs, timestamp);
      lastEventMs = lastEventMs === null ? timestamp : Math.max(lastEventMs, timestamp);
    }
    if (record.type !== "assistant") continue;
    const message = record.message as Record<string, unknown> | undefined;
    const usage = message?.usage as Record<string, unknown> | undefined;
    const model = message?.model;
    if (!usage || typeof model !== "string") continue;
    const counts = {
      inputTokens: Number(usage.input_tokens) || 0,
      outputTokens: Number(usage.output_tokens) || 0,
      cacheReadTokens: Number(usage.cache_read_input_tokens) || 0,
      cacheCreationTokens: Number(usage.cache_creation_input_tokens) || 0,
    };
    // Content blocks repeat cumulative usage for the same message. Replace
    // that snapshot; legacy rows without an ID remain independent events.
    const key = typeof message?.id === "string" ? `${model}:${message.id}` : null;
    const previous = key ? messages.get(key) : undefined;
    if (key) messages.set(key, counts);
    const total = totals.get(model);
    if (total) {
      total.inputTokens += counts.inputTokens - (previous?.inputTokens ?? 0);
      total.outputTokens += counts.outputTokens - (previous?.outputTokens ?? 0);
      total.cacheReadTokens += counts.cacheReadTokens - (previous?.cacheReadTokens ?? 0);
      total.cacheCreationTokens +=
        counts.cacheCreationTokens - (previous?.cacheCreationTokens ?? 0);
    } else {
      totals.set(model, { ...counts });
    }
  }
  return {
    path: filePath,
    mtimeMs: statSync(filePath).mtimeMs,
    usage: Array.from(totals, ([model, counts]) => ({ model, ...counts })),
    firstEventMs,
    lastEventMs,
  };
}
