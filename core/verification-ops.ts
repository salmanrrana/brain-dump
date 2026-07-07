import type { DbHandle } from "./types.ts";
import { addComment } from "./comment.ts";
import { ValidationError } from "./errors.ts";
import {
  getVerificationJob,
  isVerificationWorkerPaused,
  listVerificationJobs,
  type VerificationJob,
} from "./verification-queue.ts";
import {
  isVerificationExecutionAllowedFromEnv,
  shouldStartVerificationWorkerFromEnv,
} from "./verification-worker.ts";

export interface VerificationSchemaHealth {
  ok: boolean;
  missingTables: string[];
  missingColumns: Record<string, string[]>;
}

export interface VerificationOpsIssue {
  severity: "warning" | "error";
  message: string;
  remediation: string;
}

export interface VerificationWorkerLastDrain {
  workerId: string;
  finishedAt: string;
  executionSurface: string | null;
}

export interface VerificationOperationsStatus {
  worker: {
    executionAllowed: boolean;
    residentPollingEnabled: boolean;
    residentPollingConfigured: boolean;
    residentPollingUnexpected: boolean;
    paused: boolean;
  };
  queue: {
    depth: number;
    runnableDepth: number;
    byStatus: Record<string, number>;
    oldestQueuedAt: string | null;
    oldestQueuedAgeMs: number | null;
    activeRunningLeases: number;
    staleRunningLeases: number;
    retryingCount: number;
    blockedCount: number;
    deadCount: number;
    lastError: string | null;
  };
  lastDrain: VerificationWorkerLastDrain | null;
  schema: VerificationSchemaHealth;
  issues: VerificationOpsIssue[];
}

export interface SetVerificationWorkerPausedParams {
  paused: boolean;
  reason?: string | undefined;
  operator?: string | undefined;
  now?: string | undefined;
}

export interface SetVerificationWorkerPausedResult {
  paused: boolean;
  affectedTicketIds: string[];
  reason: string | null;
}

export interface RequeueVerificationJobParams {
  ticketId: string;
  reason?: string | undefined;
  operator?: string | undefined;
  now?: string | undefined;
}

export interface MarkVerificationJobDeadParams {
  ticketId: string;
  reason: string;
  operator?: string | undefined;
  now?: string | undefined;
}

export interface VerificationJobControlResult {
  job: VerificationJob;
  previousStatus: VerificationJob["status"];
  ticketBlocked: boolean;
  auditCommentAdded: boolean;
}

interface SchemaRequirement {
  table: string;
  columns: string[];
}

interface OpsJobRow {
  id: string;
  ticket_id: string;
  status: VerificationJob["status"];
  next_run_at: string;
  last_error: string | null;
  leased_by: string | null;
  lease_expires_at: string | null;
  worker_id: string | null;
  execution_surface: string | null;
  updated_at: string;
  completed_at: string | null;
  ticket_status: string | null;
}

const SETTINGS_ID = "default";
const DEFAULT_STRANDED_AFTER_MS = 5 * 60 * 1000;

const SCHEMA_REQUIREMENTS: SchemaRequirement[] = [
  {
    table: "verification_jobs",
    columns: [
      "id",
      "ticket_id",
      "demo_script_id",
      "status",
      "attempt_count",
      "next_run_at",
      "last_error",
      "leased_by",
      "lease_expires_at",
      "provider",
      "actor",
      "provider_source",
      "execution_surface",
      "worker_id",
      "code_git_sha",
      "created_at",
      "updated_at",
      "completed_at",
    ],
  },
  {
    table: "verification_runs",
    columns: [
      "id",
      "ticket_id",
      "round",
      "status",
      "certified",
      "manifest",
      "worker_id",
      "code_git_sha",
      "started_at",
      "finished_at",
    ],
  },
  {
    table: "settings",
    columns: ["id", "verification_worker_paused"],
  },
  {
    table: "tickets",
    columns: ["id", "status", "is_blocked", "blocked_reason", "updated_at"],
  },
];

function nowIso(value?: string): string {
  return value ?? new Date().toISOString();
}

function millisBetween(now: string, then: string | null): number | null {
  if (!then) return null;
  const nowMs = Date.parse(now);
  const thenMs = Date.parse(then);
  if (!Number.isFinite(nowMs) || !Number.isFinite(thenMs)) return null;
  return Math.max(0, nowMs - thenMs);
}

function tableExists(db: DbHandle, table: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as { name: string } | undefined;
  return Boolean(row);
}

function tableColumns(db: DbHandle, table: string): string[] {
  if (!/^[a-z_][a-z0-9_]*$/i.test(table)) {
    throw new ValidationError(`Unsafe table name in verification schema check: ${table}`);
  }
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

function normalizeReason(reason: string | undefined): string | null {
  const trimmed = reason?.trim();
  return trimmed ? trimmed : null;
}

function requireReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) {
    throw new ValidationError(
      "A non-empty --reason is required for this verification job control."
    );
  }
  return trimmed;
}

function isActiveLease(job: VerificationJob, now: string): boolean {
  return job.status === "running" && job.leaseExpiresAt !== null && job.leaseExpiresAt > now;
}

function requireVerificationJob(db: DbHandle, ticketId: string): VerificationJob {
  const job = getVerificationJob(db, ticketId);
  if (!job) {
    throw new ValidationError(`No verification job found for ticket ${ticketId}.`);
  }
  return job;
}

function getTicketStatus(db: DbHandle, ticketId: string): string {
  const row = db.prepare("SELECT status FROM tickets WHERE id = ?").get(ticketId) as
    | { status: string }
    | undefined;
  if (!row) {
    throw new ValidationError(`Ticket ${ticketId} was not found.`);
  }
  return row.status;
}

function assertTicketInVerification(db: DbHandle, ticketId: string): void {
  const status = getTicketStatus(db, ticketId);
  if (status !== "ai_verification") {
    throw new ValidationError(
      `Cannot control verification job for ticket ${ticketId}: ticket is ${status}, expected ai_verification.`
    );
  }
}

function addControlComment(
  db: DbHandle,
  params: {
    ticketId: string;
    title: string;
    body: string;
    operator: string | undefined;
    reason: string | null;
  }
): void {
  const lines = [`## ${params.title}`, "", params.body];
  if (params.reason) lines.push("", `Reason: ${params.reason}`);
  if (params.operator) lines.push("", `Operator: ${params.operator}`);
  addComment(db, {
    ticketId: params.ticketId,
    author: "brain-dump",
    type: "comment",
    content: lines.join("\n"),
  });
}

function activeVerificationTicketIds(db: DbHandle): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT tickets.id
       FROM verification_jobs
       JOIN tickets ON tickets.id = verification_jobs.ticket_id
       WHERE tickets.status = 'ai_verification'
         AND verification_jobs.status IN ('queued', 'running', 'failed', 'blocked')
       ORDER BY tickets.updated_at DESC`
    )
    .all() as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

function readOpsRows(db: DbHandle, schema: VerificationSchemaHealth): OpsJobRow[] {
  if (!schema.ok || schema.missingTables.includes("verification_jobs")) return [];
  return db
    .prepare(
      `SELECT verification_jobs.id, verification_jobs.ticket_id, verification_jobs.status,
              verification_jobs.next_run_at, verification_jobs.last_error,
              verification_jobs.leased_by, verification_jobs.lease_expires_at,
              verification_jobs.worker_id, verification_jobs.execution_surface,
              verification_jobs.updated_at, verification_jobs.completed_at,
              tickets.status as ticket_status
       FROM verification_jobs
       LEFT JOIN tickets ON tickets.id = verification_jobs.ticket_id
       ORDER BY verification_jobs.next_run_at ASC, verification_jobs.created_at ASC`
    )
    .all() as OpsJobRow[];
}

function findLastDrain(rows: OpsJobRow[]): VerificationWorkerLastDrain | null {
  let latest: OpsJobRow | null = null;
  for (const row of rows) {
    if (!row.worker_id) continue;
    if (!latest) {
      latest = row;
      continue;
    }
    const rowTime = row.completed_at ?? row.updated_at;
    const latestTime = latest.completed_at ?? latest.updated_at;
    if (rowTime > latestTime) latest = row;
  }
  if (!latest?.worker_id) return null;
  return {
    workerId: latest.worker_id,
    finishedAt: latest.completed_at ?? latest.updated_at,
    executionSurface: latest.execution_surface,
  };
}

function buildIssues(params: {
  status: Omit<VerificationOperationsStatus, "issues">;
  now: string;
  strandedAfterMs: number;
}): VerificationOpsIssue[] {
  const issues: VerificationOpsIssue[] = [];
  const { status, now, strandedAfterMs } = params;

  if (!status.schema.ok) {
    const missing = [
      ...status.schema.missingTables.map((table) => `${table} table`),
      ...Object.entries(status.schema.missingColumns).map(
        ([table, columns]) => `${table}.${columns.join(",")}`
      ),
    ].join("; ");
    issues.push({
      severity: "error",
      message: `Verification schema drift detected: ${missing}`,
      remediation:
        "Restart Brain Dump to run startup migrations, then run `brain-dump admin check --full`; if drift persists, run the database migrations before draining verification jobs.",
    });
  }

  if (status.worker.paused) {
    issues.push({
      severity: "warning",
      message: "Verification worker is paused; queued jobs will not be claimed.",
      remediation:
        "Run `brain-dump verify resume --reason <why>` after the underlying issue is fixed.",
    });
  }

  if (status.worker.residentPollingUnexpected) {
    issues.push({
      severity: "warning",
      message:
        "Resident verification polling is configured where verification execution is disabled.",
      remediation:
        "Unset BRAIN_DUMP_VERIFICATION_WORKER_POLL or remove the environment flag that disables verification execution.",
    });
  }

  const hasStrandedQueue =
    !status.worker.paused &&
    status.queue.runnableDepth > 0 &&
    status.queue.activeRunningLeases === 0 &&
    status.queue.oldestQueuedAgeMs !== null &&
    status.queue.oldestQueuedAgeMs >= strandedAfterMs &&
    (status.lastDrain === null ||
      (millisBetween(now, status.lastDrain.finishedAt) ?? 0) >= strandedAfterMs);

  if (hasStrandedQueue) {
    issues.push({
      severity: "warning",
      message: "Runnable verification jobs are queued but no recent drain has run.",
      remediation:
        "Check enqueue drain spawn failures in logs, then run `brain-dump verify worker --drain --pretty` or restart Brain Dump to trigger a boot drain.",
    });
  }

  if (status.queue.staleRunningLeases > 0) {
    issues.push({
      severity: "warning",
      message: `${status.queue.staleRunningLeases} verification lease(s) are stale and can be recovered.`,
      remediation:
        "Run `brain-dump verify worker --drain --pretty` to let a fresh worker reclaim them, or `brain-dump verify requeue --ticket <id> --reason <why>` for a targeted reset.",
    });
  }

  if (status.queue.deadCount > 0) {
    issues.push({
      severity: "warning",
      message: `${status.queue.deadCount} verification job(s) are in the dead-letter state.`,
      remediation:
        "Inspect with `brain-dump verify jobs --pretty`; after a fix lands, requeue with `brain-dump verify requeue --ticket <id> --reason <why>`.",
    });
  }

  if (status.queue.blockedCount > 0) {
    issues.push({
      severity: "warning",
      message: `${status.queue.blockedCount} verification job(s) are blocked and need operator attention.`,
      remediation:
        "Inspect the ticket comments/evidence, then requeue after repair or mark dead with `brain-dump verify dead --ticket <id> --reason <why>`.",
    });
  }

  return issues;
}

export function getVerificationSchemaHealth(db: DbHandle): VerificationSchemaHealth {
  const missingTables: string[] = [];
  const missingColumns: Record<string, string[]> = {};

  for (const requirement of SCHEMA_REQUIREMENTS) {
    if (!tableExists(db, requirement.table)) {
      missingTables.push(requirement.table);
      continue;
    }
    const columns = new Set(tableColumns(db, requirement.table));
    const missing = requirement.columns.filter((column) => !columns.has(column));
    if (missing.length > 0) missingColumns[requirement.table] = missing;
  }

  return {
    ok: missingTables.length === 0 && Object.keys(missingColumns).length === 0,
    missingTables,
    missingColumns,
  };
}

export function getVerificationOperationsStatus(
  db: DbHandle,
  options: { now?: string; strandedAfterMs?: number } = {}
): VerificationOperationsStatus {
  const now = nowIso(options.now);
  const strandedAfterMs = options.strandedAfterMs ?? DEFAULT_STRANDED_AFTER_MS;
  const schema = getVerificationSchemaHealth(db);
  const rows = readOpsRows(db, schema);
  const byStatus: Record<string, number> = {};
  let oldestQueuedAt: string | null = null;
  let activeRunningLeases = 0;
  let staleRunningLeases = 0;
  let retryingCount = 0;
  let blockedCount = 0;
  let deadCount = 0;
  let lastError: string | null = null;
  let lastErrorUpdatedAt: string | null = null;

  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    if (row.last_error && (!lastErrorUpdatedAt || row.updated_at > lastErrorUpdatedAt)) {
      lastError = row.last_error;
      lastErrorUpdatedAt = row.updated_at;
    }
    if (row.status === "blocked") blockedCount += 1;
    if (row.status === "dead") deadCount += 1;
    if (row.status === "running") {
      if (row.lease_expires_at !== null && row.lease_expires_at <= now) {
        staleRunningLeases += 1;
      } else {
        activeRunningLeases += 1;
      }
    }
    if (
      row.status === "failed" &&
      row.completed_at === null &&
      row.ticket_status === "ai_verification" &&
      row.next_run_at > now
    ) {
      retryingCount += 1;
    }
    if (
      (row.status === "queued" || row.status === "failed") &&
      row.completed_at === null &&
      row.ticket_status === "ai_verification"
    ) {
      if (oldestQueuedAt === null || row.next_run_at < oldestQueuedAt)
        oldestQueuedAt = row.next_run_at;
    }
  }

  const paused =
    schema.missingTables.includes("settings") ||
    schema.missingColumns.settings?.includes("verification_worker_paused")
      ? false
      : isVerificationWorkerPaused(db);
  const worker = {
    executionAllowed: isVerificationExecutionAllowedFromEnv(),
    residentPollingEnabled: shouldStartVerificationWorkerFromEnv(),
    residentPollingConfigured: process.env.BRAIN_DUMP_VERIFICATION_WORKER_POLL === "1",
    residentPollingUnexpected:
      process.env.BRAIN_DUMP_VERIFICATION_WORKER_POLL === "1" &&
      !isVerificationExecutionAllowedFromEnv(),
    paused,
  };
  const queue = {
    depth: rows.filter(
      (row) =>
        (row.status === "queued" || row.status === "failed") &&
        row.completed_at === null &&
        row.ticket_status === "ai_verification"
    ).length,
    runnableDepth: rows.filter(
      (row) =>
        !paused &&
        (row.status === "queued" || row.status === "failed") &&
        row.completed_at === null &&
        row.ticket_status === "ai_verification" &&
        row.next_run_at <= now
    ).length,
    byStatus,
    oldestQueuedAt,
    oldestQueuedAgeMs: millisBetween(now, oldestQueuedAt),
    activeRunningLeases,
    staleRunningLeases,
    retryingCount,
    blockedCount,
    deadCount,
    lastError,
  };
  const baseStatus = {
    worker,
    queue,
    lastDrain: findLastDrain(rows),
    schema,
  };
  return {
    ...baseStatus,
    issues: buildIssues({ status: baseStatus, now, strandedAfterMs }),
  };
}

export function setVerificationWorkerPaused(
  db: DbHandle,
  params: SetVerificationWorkerPausedParams
): SetVerificationWorkerPausedResult {
  const now = nowIso(params.now);
  const reason = normalizeReason(params.reason);
  const affectedTicketIds = activeVerificationTicketIds(db);

  db.transaction(() => {
    db.prepare("INSERT OR IGNORE INTO settings (id) VALUES (?)").run(SETTINGS_ID);
    db.prepare(
      "UPDATE settings SET verification_worker_paused = ?, updated_at = ? WHERE id = ?"
    ).run(params.paused ? 1 : 0, now, SETTINGS_ID);

    for (const ticketId of affectedTicketIds) {
      addControlComment(db, {
        ticketId,
        title: params.paused ? "Verification Worker Paused" : "Verification Worker Resumed",
        body: params.paused
          ? "Automatic verification drains will not claim this ticket until an operator resumes the worker."
          : "Automatic verification drains may claim this ticket again. This control only resumes execution; it does not write evidence or certify the ticket.",
        operator: params.operator,
        reason,
      });
    }
  })();

  return { paused: params.paused, affectedTicketIds, reason };
}

export function requeueVerificationJob(
  db: DbHandle,
  params: RequeueVerificationJobParams
): VerificationJobControlResult {
  const now = nowIso(params.now);
  const reason = normalizeReason(params.reason);
  assertTicketInVerification(db, params.ticketId);
  const job = requireVerificationJob(db, params.ticketId);
  if (job.status === "succeeded") {
    throw new ValidationError(
      `Cannot requeue verification job for ticket ${params.ticketId}: the job already succeeded.`
    );
  }
  if (isActiveLease(job, now)) {
    throw new ValidationError(
      `Cannot requeue verification job for ticket ${params.ticketId}: active lease owned by ${job.leasedBy} expires at ${job.leaseExpiresAt}.`
    );
  }

  db.transaction(() => {
    db.prepare(
      `UPDATE verification_jobs
       SET status = 'queued', attempt_count = 0, next_run_at = ?, last_error = NULL,
           leased_by = NULL, lease_expires_at = NULL, completed_at = NULL, updated_at = ?
       WHERE ticket_id = ?`
    ).run(now, now, params.ticketId);
    db.prepare(
      "UPDATE tickets SET is_blocked = 0, blocked_reason = NULL, updated_at = ? WHERE id = ?"
    ).run(now, params.ticketId);
    addControlComment(db, {
      ticketId: params.ticketId,
      title: "Verification Job Requeued",
      body: `The verification job was reset from ${job.status} to queued. This only schedules a new runner attempt; it does not write evidence or certify the ticket.`,
      operator: params.operator,
      reason,
    });
  })();

  const updated = getVerificationJob(db, params.ticketId);
  if (!updated) {
    throw new ValidationError(`Verification job for ticket ${params.ticketId} disappeared.`);
  }
  return {
    job: updated,
    previousStatus: job.status,
    ticketBlocked: false,
    auditCommentAdded: true,
  };
}

export function markVerificationJobDead(
  db: DbHandle,
  params: MarkVerificationJobDeadParams
): VerificationJobControlResult {
  const now = nowIso(params.now);
  const reason = requireReason(params.reason);
  assertTicketInVerification(db, params.ticketId);
  const job = requireVerificationJob(db, params.ticketId);
  if (job.status === "succeeded") {
    throw new ValidationError(
      `Cannot mark verification job for ticket ${params.ticketId} dead: the job already succeeded.`
    );
  }
  if (isActiveLease(job, now)) {
    throw new ValidationError(
      `Cannot mark verification job for ticket ${params.ticketId} dead: active lease owned by ${job.leasedBy} expires at ${job.leaseExpiresAt}.`
    );
  }

  const blockedReason = `Verification job marked dead: ${reason}`;
  db.transaction(() => {
    db.prepare(
      `UPDATE verification_jobs
       SET status = 'dead', last_error = ?, leased_by = NULL, lease_expires_at = NULL,
           completed_at = ?, updated_at = ?
       WHERE ticket_id = ?`
    ).run(blockedReason, now, now, params.ticketId);
    db.prepare(
      "UPDATE tickets SET is_blocked = 1, blocked_reason = ?, updated_at = ? WHERE id = ?"
    ).run(blockedReason, now, params.ticketId);
    addControlComment(db, {
      ticketId: params.ticketId,
      title: "Verification Job Dead-Lettered",
      body: "An operator marked this verification job unrecoverable. This blocks the ticket for attention but does not write evidence or certify it.",
      operator: params.operator,
      reason,
    });
  })();

  const updated = getVerificationJob(db, params.ticketId);
  if (!updated) {
    throw new ValidationError(`Verification job for ticket ${params.ticketId} disappeared.`);
  }
  return {
    job: updated,
    previousStatus: job.status,
    ticketBlocked: true,
    auditCommentAdded: true,
  };
}

export function summarizeVerificationJobsForOps(db: DbHandle): VerificationJob[] {
  return listVerificationJobs(db);
}
