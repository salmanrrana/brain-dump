import Database from "better-sqlite3";
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { recalculateCosts, recordUsage, syncDefaultCostModels } from "./cost.ts";
import type { DbHandle } from "./types.ts";
import type { RecalculateResult } from "./cost.ts";
import type { Dirent } from "node:fs";

interface UsageCounts {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

interface BrainTelemetrySession {
  telemetrySessionId: string;
  ticketId: string | null;
  projectPath: string;
  environment: string | null;
  startedAt: string;
  endedAt: string | null;
  firstEventAt: string | null;
  lastEventAt: string | null;
}

export interface BackfillSourceResult {
  source: string;
  checked: boolean;
  insertedRows: number;
  skippedExistingRows: number;
  matchedSessions: number;
  message: string | null;
}

export interface DeepRecalculateResult extends RecalculateResult {
  backfills: BackfillSourceResult[];
}

interface TimeWindow {
  startMs: number;
  endMs: number;
}

interface OpenCodeSession {
  id: string;
  projectId: string;
  timeCreated: number;
  timeUpdated: number;
}

interface ClaudeTranscript {
  path: string;
  mtimeMs: number;
  usage: UsageCounts[];
  firstEventMs: number | null;
  lastEventMs: number | null;
}

interface CodexTranscript {
  path: string;
  cwd: string | null;
  mtimeMs: number;
  model: string | null;
  usage: UsageCounts[];
  firstEventMs: number | null;
  lastEventMs: number | null;
}

function backfillResult(
  source: string,
  checked: boolean,
  message: string | null,
  overrides?: Partial<Omit<BackfillSourceResult, "source" | "checked" | "message">>
): BackfillSourceResult {
  return {
    source,
    checked,
    insertedRows: overrides?.insertedRows ?? 0,
    skippedExistingRows: overrides?.skippedExistingRows ?? 0,
    matchedSessions: overrides?.matchedSessions ?? 0,
    message,
  };
}

function getSessionWindow(session: BrainTelemetrySession): TimeWindow {
  const startMs = Date.parse(session.firstEventAt ?? session.startedAt);
  const endMs = Date.parse(session.lastEventAt ?? session.endedAt ?? session.startedAt);
  return {
    startMs,
    endMs: Math.max(startMs, endMs),
  };
}

function overlapMs(left: TimeWindow, right: TimeWindow): number {
  return Math.max(0, Math.min(left.endMs, right.endMs) - Math.max(left.startMs, right.startMs));
}

function sessionHasUsage(db: DbHandle, telemetrySessionId: string): boolean {
  const existing = db
    .prepare("SELECT COUNT(*) as count FROM token_usage WHERE telemetry_session_id = ?")
    .get(telemetrySessionId) as { count: number };
  return existing.count > 0;
}

function loadMissingUsageSessions(db: DbHandle, environments: string[]): BrainTelemetrySession[] {
  const placeholders = environments.map(() => "?").join(", ");
  return db
    .prepare(
      `SELECT
         ts.id as telemetrySessionId,
         ts.ticket_id as ticketId,
         p.path as projectPath,
         ts.environment,
         ts.started_at as startedAt,
         ts.ended_at as endedAt,
         MIN(te.created_at) as firstEventAt,
         MAX(te.created_at) as lastEventAt
       FROM telemetry_sessions ts
       LEFT JOIN telemetry_events te ON te.session_id = ts.id
       LEFT JOIN tickets t ON t.id = ts.ticket_id
       LEFT JOIN projects p ON p.id = COALESCE(ts.project_id, t.project_id)
       LEFT JOIN token_usage tu ON tu.telemetry_session_id = ts.id
       WHERE ts.environment IN (${placeholders})
         AND p.path IS NOT NULL
       GROUP BY ts.id
       HAVING COUNT(tu.id) = 0
       ORDER BY ts.started_at`
    )
    .all(...environments) as BrainTelemetrySession[];
}

function insertUsageRows(
  db: DbHandle,
  session: BrainTelemetrySession,
  usage: UsageCounts[],
  source: string,
  recordedAt: string
): number {
  let insertedRows = 0;
  for (const row of usage) {
    if (
      row.inputTokens <= 0 &&
      row.outputTokens <= 0 &&
      row.cacheReadTokens <= 0 &&
      row.cacheCreationTokens <= 0
    ) {
      continue;
    }
    recordUsage(db, {
      telemetrySessionId: session.telemetrySessionId,
      ...(session.ticketId ? { ticketId: session.ticketId } : {}),
      model: row.model,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cacheReadTokens: row.cacheReadTokens,
      cacheCreationTokens: row.cacheCreationTokens,
      source,
      recordedAt,
    });
    insertedRows += 1;
  }
  return insertedRows;
}

function backfillOpenCode(db: DbHandle): BackfillSourceResult {
  const dbPath = join(homedir(), ".local", "share", "opencode", "opencode.db");
  if (!existsSync(dbPath)) {
    return backfillResult("opencode", false, "OpenCode database not found.");
  }

  const sessions = loadMissingUsageSessions(db, ["opencode"]);
  if (sessions.length === 0) {
    return backfillResult("opencode", true, "No OpenCode telemetry sessions need backfill.");
  }

  const opencodeDb = new Database(dbPath, { readonly: true });
  try {
    const projects = opencodeDb.prepare("SELECT id, worktree FROM project").all() as Array<{
      id: string;
      worktree: string;
    }>;
    const projectIdByPath = new Map(projects.map((project) => [project.worktree, project.id]));
    const openCodeSessions = opencodeDb
      .prepare(
        `SELECT id, project_id as projectId, time_created as timeCreated, time_updated as timeUpdated
         FROM session
         WHERE parent_id IS NULL
         ORDER BY time_created`
      )
      .all() as OpenCodeSession[];

    const usedOpenCodeSessionIds = new Set<string>();
    let insertedRows = 0;
    let skippedExistingRows = 0;
    let matchedSessions = 0;

    for (const session of sessions) {
      if (sessionHasUsage(db, session.telemetrySessionId)) {
        skippedExistingRows += 1;
        continue;
      }

      const projectId = projectIdByPath.get(session.projectPath);
      if (!projectId) continue;

      const sessionWindow = getSessionWindow(session);
      const match = openCodeSessions
        .filter(
          (candidate) =>
            candidate.projectId === projectId && !usedOpenCodeSessionIds.has(candidate.id)
        )
        .map((candidate) => {
          const candidateWindow = { startMs: candidate.timeCreated, endMs: candidate.timeUpdated };
          return {
            candidate,
            overlap: overlapMs(sessionWindow, candidateWindow),
            distance: Math.abs(sessionWindow.endMs - candidate.timeUpdated),
          };
        })
        .filter((entry) => entry.overlap > 0 || entry.distance < 15 * 60_000)
        .sort((a, b) => b.overlap - a.overlap || a.distance - b.distance)[0]?.candidate;
      if (!match) continue;

      const usage = opencodeDb
        .prepare(
          `SELECT
             json_extract(data, '$.modelID') as model,
             COALESCE(SUM(json_extract(data, '$.tokens.input')), 0) as inputTokens,
             COALESCE(SUM(json_extract(data, '$.tokens.output')), 0) as outputTokens,
             COALESCE(SUM(json_extract(data, '$.tokens.cache.read')), 0) as cacheReadTokens,
             COALESCE(SUM(json_extract(data, '$.tokens.cache.write')), 0) as cacheCreationTokens
           FROM message
           WHERE session_id = ?
             AND json_extract(data, '$.role') = 'assistant'
             AND json_extract(data, '$.modelID') IS NOT NULL
           GROUP BY model`
        )
        .all(match.id) as UsageCounts[];
      const insertedForSession = insertUsageRows(
        db,
        session,
        usage,
        "opencode-backfill",
        new Date(match.timeUpdated).toISOString()
      );
      if (insertedForSession === 0) continue;

      usedOpenCodeSessionIds.add(match.id);
      insertedRows += insertedForSession;
      matchedSessions += 1;
    }

    return backfillResult("opencode", true, null, {
      insertedRows,
      skippedExistingRows,
      matchedSessions,
    });
  } finally {
    opencodeDb.close();
  }
}

function claudeProjectDir(projectPath: string): string {
  return join(homedir(), ".claude", "projects", projectPath.replace(/\//g, "-"));
}

async function parseClaudeTranscript(filePath: string): Promise<ClaudeTranscript> {
  const totals = new Map<string, Omit<UsageCounts, "model">>();
  let firstEventMs: number | null = null;
  let lastEventMs: number | null = null;

  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;

    const record = parsed as Record<string, unknown>;
    const timestamp = typeof record.timestamp === "string" ? Date.parse(record.timestamp) : NaN;
    if (!Number.isNaN(timestamp)) {
      firstEventMs = firstEventMs == null ? timestamp : Math.min(firstEventMs, timestamp);
      lastEventMs = lastEventMs == null ? timestamp : Math.max(lastEventMs, timestamp);
    }

    if (record.type !== "assistant") continue;
    const message = record.message as Record<string, unknown> | undefined;
    const usage = message?.usage as Record<string, unknown> | undefined;
    const model = message?.model;
    if (!usage || typeof model !== "string") continue;

    const existing = totals.get(model) ?? {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
    existing.inputTokens += Number(usage.input_tokens) || 0;
    existing.outputTokens += Number(usage.output_tokens) || 0;
    existing.cacheReadTokens += Number(usage.cache_read_input_tokens) || 0;
    existing.cacheCreationTokens += Number(usage.cache_creation_input_tokens) || 0;
    totals.set(model, existing);
  }

  const stat = statSync(filePath);
  return {
    path: filePath,
    mtimeMs: stat.mtimeMs,
    usage: Array.from(totals.entries()).map(([model, counts]) => ({ model, ...counts })),
    firstEventMs,
    lastEventMs,
  };
}

async function backfillClaudeCode(db: DbHandle): Promise<BackfillSourceResult> {
  const sessions = loadMissingUsageSessions(db, ["claude-code", "claude"]);
  if (sessions.length === 0) {
    return backfillResult("claude-code", true, "No Claude telemetry sessions need backfill.");
  }

  const transcripts: ClaudeTranscript[] = [];
  const projectPaths = new Set(sessions.map((session) => session.projectPath));
  for (const projectPath of projectPaths) {
    const dir = claudeProjectDir(projectPath);
    if (!existsSync(dir)) continue;

    for (const fileName of readdirSync(dir)) {
      if (!fileName.endsWith(".jsonl")) continue;
      const transcript = await parseClaudeTranscript(join(dir, fileName));
      if (transcript.usage.length > 0) transcripts.push(transcript);
    }
  }

  if (transcripts.length === 0) {
    return backfillResult("claude-code", true, "No Claude transcript usage records found.");
  }

  const usedTranscriptPaths = new Set<string>();
  let insertedRows = 0;
  let skippedExistingRows = 0;
  let matchedSessions = 0;

  for (const session of sessions) {
    if (sessionHasUsage(db, session.telemetrySessionId)) {
      skippedExistingRows += 1;
      continue;
    }

    const sessionWindow = getSessionWindow(session);
    const match = transcripts
      .filter((transcript) => !usedTranscriptPaths.has(transcript.path))
      .map((transcript) => {
        const transcriptStart = transcript.firstEventMs ?? transcript.mtimeMs;
        const transcriptEnd = transcript.lastEventMs ?? transcript.mtimeMs;
        return {
          transcript,
          overlap: overlapMs(sessionWindow, { startMs: transcriptStart, endMs: transcriptEnd }),
          distance: Math.abs(sessionWindow.endMs - transcript.mtimeMs),
        };
      })
      .filter((entry) => entry.overlap > 0 || entry.distance < 24 * 60 * 60_000)
      .sort((a, b) => b.overlap - a.overlap || a.distance - b.distance)[0]?.transcript;
    if (!match) continue;

    const insertedForSession = insertUsageRows(
      db,
      session,
      match.usage,
      "claude-jsonl-backfill",
      new Date(match.mtimeMs).toISOString()
    );
    if (insertedForSession === 0) continue;

    usedTranscriptPaths.add(match.path);
    insertedRows += insertedForSession;
    matchedSessions += 1;
  }

  return backfillResult("claude-code", true, null, {
    insertedRows,
    skippedExistingRows,
    matchedSessions,
  });
}

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function extractString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function listJsonlFiles(root: string): string[] {
  if (!existsSync(root)) return [];

  const files: string[] = [];
  const visit = (dir: string) => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(entryPath);
      }
    }
  };

  visit(root);
  return files;
}

async function parseCodexTranscript(filePath: string): Promise<CodexTranscript> {
  let cwd: string | null = null;
  let model: string | null = null;
  let firstEventMs: number | null = null;
  let lastEventMs: number | null = null;
  const totals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };

  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;

    const record = parsed as Record<string, unknown>;
    const timestamp = typeof record.timestamp === "string" ? Date.parse(record.timestamp) : NaN;
    if (!Number.isNaN(timestamp)) {
      firstEventMs = firstEventMs == null ? timestamp : Math.min(firstEventMs, timestamp);
      lastEventMs = lastEventMs == null ? timestamp : Math.max(lastEventMs, timestamp);
    }

    if (record.type === "session_meta") {
      const payload = record.payload as Record<string, unknown> | undefined;
      cwd = extractString(payload?.cwd) ?? cwd;
      model =
        extractString(payload?.model) ??
        extractString(payload?.model_id) ??
        extractString(payload?.modelName) ??
        model;
      continue;
    }

    const payload = record.payload as Record<string, unknown> | undefined;
    if (record.type !== "event_msg" || payload?.type !== "token_count") continue;

    const info = payload.info as Record<string, unknown> | null | undefined;
    const lastUsage = info?.last_token_usage as Record<string, unknown> | undefined;
    if (!lastUsage) continue;

    const inputTokens = toNumber(lastUsage.input_tokens);
    const cachedInputTokens = toNumber(lastUsage.cached_input_tokens);
    totals.inputTokens += Math.max(0, inputTokens - cachedInputTokens);
    totals.cacheReadTokens += cachedInputTokens;
    totals.outputTokens += toNumber(lastUsage.output_tokens);
  }

  const stat = statSync(filePath);
  return {
    path: filePath,
    cwd,
    mtimeMs: stat.mtimeMs,
    model,
    usage: model ? [{ model, ...totals }] : [],
    firstEventMs,
    lastEventMs,
  };
}

async function backfillCodexCli(db: DbHandle): Promise<BackfillSourceResult> {
  const sessions = loadMissingUsageSessions(db, ["codex"]);
  const transcriptFiles = listJsonlFiles(join(homedir(), ".codex", "sessions"));
  if (transcriptFiles.length === 0) {
    return backfillResult("codex", false, "Codex CLI transcript directory not found.");
  }
  if (sessions.length === 0) {
    return backfillResult("codex", true, "No Codex telemetry sessions need backfill.");
  }

  const transcripts = (await Promise.all(transcriptFiles.map(parseCodexTranscript))).filter(
    (transcript) => transcript.usage.length > 0
  );
  if (transcripts.length === 0) {
    return backfillResult(
      "codex",
      true,
      "Codex CLI logs were found, but no billable model identifier was present."
    );
  }

  const usedTranscriptPaths = new Set<string>();
  let insertedRows = 0;
  let skippedExistingRows = 0;
  let matchedSessions = 0;

  for (const session of sessions) {
    if (sessionHasUsage(db, session.telemetrySessionId)) {
      skippedExistingRows += 1;
      continue;
    }

    const sessionWindow = getSessionWindow(session);
    const match = transcripts
      .filter(
        (transcript) =>
          transcript.cwd === session.projectPath && !usedTranscriptPaths.has(transcript.path)
      )
      .map((transcript) => {
        const transcriptStart = transcript.firstEventMs ?? transcript.mtimeMs;
        const transcriptEnd = transcript.lastEventMs ?? transcript.mtimeMs;
        return {
          transcript,
          overlap: overlapMs(sessionWindow, { startMs: transcriptStart, endMs: transcriptEnd }),
          distance: Math.abs(sessionWindow.endMs - transcript.mtimeMs),
        };
      })
      .filter((entry) => entry.overlap > 0 || entry.distance < 24 * 60 * 60_000)
      .sort((a, b) => b.overlap - a.overlap || a.distance - b.distance)[0]?.transcript;
    if (!match) continue;

    const insertedForSession = insertUsageRows(
      db,
      session,
      match.usage,
      "codex-jsonl-backfill",
      new Date(match.mtimeMs).toISOString()
    );
    if (insertedForSession === 0) continue;

    usedTranscriptPaths.add(match.path);
    insertedRows += insertedForSession;
    matchedSessions += 1;
  }

  return backfillResult("codex", true, null, {
    insertedRows,
    skippedExistingRows,
    matchedSessions,
  });
}

function checkedCliProviderWithoutBillableUsage(
  db: DbHandle,
  source: string,
  environments: string[],
  logRoots: string[],
  message: string
): BackfillSourceResult {
  const sessions = loadMissingUsageSessions(db, environments);
  const foundLogRoot = logRoots.some((root) => existsSync(root));
  if (!foundLogRoot) {
    return backfillResult(source, false, `${source} CLI logs were not found.`);
  }
  if (sessions.length === 0) {
    return backfillResult(source, true, `No ${source} telemetry sessions need backfill.`);
  }
  return backfillResult(source, true, message);
}

export async function deepRecalculateCosts(db: DbHandle): Promise<DeepRecalculateResult> {
  syncDefaultCostModels(db);

  const backfills = [
    backfillOpenCode(db),
    await backfillClaudeCode(db),
    await backfillCodexCli(db),
    checkedCliProviderWithoutBillableUsage(
      db,
      "cursor-agent",
      ["cursor-agent"],
      [join(homedir(), ".cursor", "projects")],
      "Cursor Agent CLI logs were found, but no billable input/output token records were present."
    ),
    checkedCliProviderWithoutBillableUsage(
      db,
      "copilot-cli",
      ["copilot-cli", "copilot"],
      [join(homedir(), ".copilot", "session-state")],
      "Copilot CLI logs were found, but they do not expose billable input/output token records."
    ),
  ];
  const recalculation = recalculateCosts(db);

  return {
    ...recalculation,
    backfills,
  };
}
