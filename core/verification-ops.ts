import type { DbHandle } from "./types.ts";
import {
  addComment,
  resolveCommentIdentity,
  type ResolveCommentIdentityParams,
} from "./comment.ts";
import { ValidationError } from "./errors.ts";
import { updatePrdForDbTicketIfPresent } from "./prd-sync.ts";
import { returnVerificationTicketForHumanAction } from "./verification-lifecycle.ts";
import {
  enqueueVerificationJob,
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

export interface VerificationTicketReconciliationResult {
  enqueuedTicketIds: string[];
  humanActionTicketIds: string[];
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

function assertTicketCanBeRequeued(db: DbHandle, ticketId: string, job: VerificationJob): void {
  const status = getTicketStatus(db, ticketId);
  const isHumanActionTicket =
    status === "in_progress" && (job.status === "blocked" || job.status === "dead");
  if (status !== "ai_verification" && !isHumanActionTicket) {
    throw new ValidationError(
      `Cannot requeue verification job for ticket ${ticketId}: ticket is ${status}, expected ai_verification or an in_progress ticket blocked by this job.`
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
    phase: "ai_verification",
    actorKind: "system",
    provider: "brain-dump",
  });
}

/**
 * Repair lifecycle drift at startup. Tickets with executable handoffs regain
 * an automatic job; tickets whose runner already terminated (or which have no
 * handoff to execute) leave ai_verification with an explicit human blocker.
 */
export function reconcileVerificationTicketStates(
  db: DbHandle,
  options: { now?: string } = {}
): VerificationTicketReconciliationResult {
  const now = nowIso(options.now);
  const rows = db
    .prepare(
      `SELECT tickets.id, demo_scripts.id AS demo_id,
              verification_jobs.status AS job_status,
              verification_jobs.last_error AS job_error
       FROM tickets
       LEFT JOIN demo_scripts ON demo_scripts.ticket_id = tickets.id
       LEFT JOIN verification_jobs ON verification_jobs.ticket_id = tickets.id
       WHERE tickets.status = 'ai_verification'`
    )
    .all() as Array<{
    id: string;
    demo_id: string | null;
    job_status: VerificationJob["status"] | null;
    job_error: string | null;
  }>;
  const enqueuedTicketIds: string[] = [];
  const humanActionTicketIds: string[] = [];

  db.transaction(() => {
    for (const row of rows) {
      if (row.job_status === null && row.demo_id !== null) {
        enqueueVerificationJob(db, row.id, { now });
        enqueuedTicketIds.push(row.id);
        addControlComment(db, {
          ticketId: row.id,
          title: "Verification Job Recovered",
          body: "The ticket was in AI verification without a runner job. Brain Dump recreated the job automatically.",
          operator: undefined,
          reason: null,
        });
        continue;
      }

      let reason: string | null = null;
      if (row.job_status === null) {
        reason = "AI verification has no demo script or runner job to execute.";
      } else if (row.job_status === "blocked" || row.job_status === "dead") {
        reason = row.job_error ?? `Verification job ended in ${row.job_status}.`;
      } else if (row.job_status === "succeeded") {
        reason =
          "Verification job succeeded but the ticket did not reach done; lifecycle state needs inspection.";
      }
      if (reason === null) continue;

      returnVerificationTicketForHumanAction(db, row.id, reason, now);
      humanActionTicketIds.push(row.id);
      addControlComment(db, {
        ticketId: row.id,
        title: "Verification Requires Human Action",
        body: "The runner has no automatic work left. The ticket was returned to in_progress and blocked with the reason below.",
        operator: undefined,
        reason,
      });
    }
  })();

  return { enqueuedTicketIds, humanActionTicketIds };
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
  const job = requireVerificationJob(db, params.ticketId);
  assertTicketCanBeRequeued(db, params.ticketId, job);
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
      `UPDATE tickets
       SET status = 'ai_verification', is_blocked = 0, blocked_reason = NULL, updated_at = ?
       WHERE id = ?`
    ).run(now, params.ticketId);
    db.prepare(
      `UPDATE ticket_workflow_state
       SET current_phase = 'ai_verification', demo_generated = 1, updated_at = ?
       WHERE ticket_id = ?`
    ).run(now, params.ticketId);
    updatePrdForDbTicketIfPresent(db, params.ticketId, false, "ai_verification");
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

export const VERIFICATION_FAILURE_RESOLUTION_CLASSIFICATIONS = [
  "connectivity",
  "environment",
  "demo-spec",
  "product-defect",
  "other",
] as const;

export type VerificationFailureResolutionClassification =
  (typeof VERIFICATION_FAILURE_RESOLUTION_CLASSIFICATIONS)[number];

export interface ResolveVerificationFailureParams {
  ticketId: string;
  rootCause: string;
  classification: VerificationFailureResolutionClassification;
  validation: string;
  fixCommits?: string[] | undefined;
  whyNextAttemptWillPass?: string | undefined;
  operator?: string | undefined;
  commentIdentity?: Pick<
    ResolveCommentIdentityParams,
    "author" | "provider" | "modelProvider" | "modelName" | "env"
  >;
  now?: string | undefined;
}

export interface ResolveVerificationFailureResult {
  ticketId: string;
  previousStatus: string;
  newStatus: "ai_review";
  latestRunId: string | null;
  clearedBlockedReason: string | null;
}

function requireNonEmpty(value: string | undefined, field: string): string {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) {
    throw new ValidationError(
      `resolve-verification-failure requires a non-empty ${field}. A blocker may only be cleared with a durable record of what failed, why, and how the fix was proven.`
    );
  }
  return trimmed;
}

/**
 * First-class agent path out of a verification block. Until now an agent
 * could fix the cause and post comments, but had no tool to clear the
 * blocker — the ticket stayed blocked until a human ran `verify requeue`
 * (observed: a CORS fix validated and documented while its ticket sat
 * blocked for hours). Resolution demands the structured story (root cause,
 * classification, validation) and returns the ticket to ai_review, so the
 * addressed verification findings must then be marked fixed before the normal
 * check-complete → generate-demo path re-enters verification. The runner keeps
 * sole authority over certification.
 */
export function resolveVerificationFailure(
  db: DbHandle,
  params: ResolveVerificationFailureParams
): ResolveVerificationFailureResult {
  const now = nowIso(params.now);
  const rootCause = requireNonEmpty(params.rootCause, "rootCause");
  const validation = requireNonEmpty(params.validation, "validation");

  const ticket = db
    .prepare("SELECT id, status, is_blocked, blocked_reason FROM tickets WHERE id = ?")
    .get(params.ticketId) as
    | { id: string; status: string; is_blocked: number; blocked_reason: string | null }
    | undefined;
  if (!ticket) {
    throw new ValidationError(`Ticket ${params.ticketId} was not found.`);
  }
  if (!ticket.is_blocked) {
    throw new ValidationError(
      `Ticket ${params.ticketId} is not blocked; there is no verification failure to resolve. Continue the normal workflow instead.`
    );
  }
  if (ticket.status !== "in_progress" && ticket.status !== "ai_review") {
    throw new ValidationError(
      `Cannot resolve verification failure for ticket ${params.ticketId}: ticket is ${ticket.status}, expected a blocked in_progress or ai_review ticket.`
    );
  }
  const latestRun = db
    .prepare(
      "SELECT id, status FROM verification_runs WHERE ticket_id = ? ORDER BY round DESC LIMIT 1"
    )
    .get(params.ticketId) as { id: string; status: string } | undefined;
  const verificationJob = db
    .prepare("SELECT status, last_error FROM verification_jobs WHERE ticket_id = ?")
    .get(params.ticketId) as { status: string; last_error: string | null } | undefined;
  const blockedReason = ticket.blocked_reason ?? "";
  const matchesLatestRun =
    (latestRun?.status === "failed" && blockedReason.includes(`Latest run: ${latestRun.id}.`)) ||
    (latestRun?.status === "uncertified" &&
      blockedReason.startsWith("Verification uncertified:")) ||
    (latestRun?.status === "infra_error" && blockedReason.startsWith("Verification infra_error:"));
  const matchesBlockedJob =
    verificationJob?.status === "blocked" &&
    (verificationJob.last_error === blockedReason || matchesLatestRun);
  if (!matchesBlockedJob && !matchesLatestRun) {
    throw new ValidationError(
      `Ticket ${params.ticketId} is blocked, but its current blocker was not created by the latest verification run or blocked verification job. Resolve it through the owning workflow instead.`
    );
  }

  const fixCommits = (params.fixCommits ?? []).map((commit) => commit.trim()).filter(Boolean);
  const commentIdentity = resolveCommentIdentity({
    phase: "repair",
    actorKind: "ai",
    role: "implementation",
    ...params.commentIdentity,
  });
  const commentLines = [
    "## Verification Failure Resolved",
    "",
    `- Failed run: ${latestRun?.id ?? "none (worker failed before run persistence)"}`,
    `- Resolved by: ${params.operator?.trim() || "brain-dump"}`,
    `- Classification: ${params.classification}`,
    `- Root cause: ${rootCause}`,
    `- Fix commits: ${fixCommits.length > 0 ? fixCommits.join(", ") : "none recorded"}`,
    `- Validation: ${validation}`,
    ...(params.whyNextAttemptWillPass?.trim()
      ? [`- Why the next attempt should pass: ${params.whyNextAttemptWillPass.trim()}`]
      : []),
    ...(ticket.blocked_reason ? ["", `Cleared blocker: ${ticket.blocked_reason}`] : []),
    "",
    "The ticket returned to `ai_review`. Mark every open verification finding addressed by this fix as `fixed`, then continue with check-complete → generate-demo to re-enter verification; the runner still owns certification.",
  ];

  db.transaction(() => {
    const ticketUpdate = db
      .prepare(
        `UPDATE tickets
       SET status = 'ai_review', is_blocked = 0, blocked_reason = NULL,
           completed_at = NULL, updated_at = ?
       WHERE id = ? AND status = ? AND is_blocked = 1 AND blocked_reason IS ?`
      )
      .run(now, params.ticketId, ticket.status, ticket.blocked_reason);
    if (ticketUpdate.changes !== 1) {
      throw new ValidationError(
        `Verification blocker resolution for ticket ${params.ticketId} lost a concurrent state change. Re-read the ticket and retry only if it is still blocked by the same verification failure.`
      );
    }
    if (matchesBlockedJob) {
      const jobUpdate = db
        .prepare(
          `UPDATE verification_jobs
           SET status = 'failed', last_error = NULL, leased_by = NULL,
               lease_expires_at = NULL, completed_at = ?, next_run_at = ?, updated_at = ?
           WHERE ticket_id = ? AND status = 'blocked' AND last_error IS ?`
        )
        .run(now, now, now, params.ticketId, verificationJob.last_error);
      if (jobUpdate.changes !== 1) {
        throw new ValidationError(
          `Verification job resolution for ticket ${params.ticketId} lost a concurrent state change. Re-read the job and retry only if it is still blocked by the same verification failure.`
        );
      }
    }
    db.prepare(
      `UPDATE ticket_workflow_state
       SET current_phase = 'ai_review', demo_generated = 0,
           verification_streak_reset_at = ?, updated_at = ?
       WHERE ticket_id = ?`
    ).run(now, now, params.ticketId);
    const prdResult = updatePrdForDbTicketIfPresent(db, params.ticketId, false, "ai_review");
    if (!prdResult.success) {
      throw new ValidationError(
        `Verification blocker resolution could not synchronize the scoped PRD: ${prdResult.message}`
      );
    }
    addComment(db, {
      ticketId: params.ticketId,
      type: "comment",
      content: commentLines.join("\n"),
      ...commentIdentity,
    });
  })();

  return {
    ticketId: params.ticketId,
    previousStatus: ticket.status,
    newStatus: "ai_review",
    latestRunId: latestRun?.id ?? null,
    clearedBlockedReason: ticket.blocked_reason,
  };
}

export function markVerificationJobDead(
  db: DbHandle,
  params: MarkVerificationJobDeadParams
): VerificationJobControlResult {
  const now = nowIso(params.now);
  const reason = requireReason(params.reason);
  const job = requireVerificationJob(db, params.ticketId);
  if (getTicketStatus(db, params.ticketId) !== "ai_verification") {
    throw new ValidationError(
      `Cannot mark verification job for ticket ${params.ticketId} dead: ticket is no longer in ai_verification.`
    );
  }
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
    returnVerificationTicketForHumanAction(db, params.ticketId, blockedReason, now);
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
