import { randomUUID } from "crypto";
import type { DbHandle } from "./types.ts";
import { claimDurableJobLease, settleDurableJobLease } from "./durable-job-lease.ts";
import { TicketNotFoundError, ValidationError } from "./errors.ts";
import {
  resolveVerifierIdentity,
  type VerificationExecutionSurface,
  type VerificationProviderSource,
} from "./verifier-identity.ts";

export type VerificationJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "blocked"
  | "dead";

export interface VerificationJob {
  id: string;
  ticketId: string;
  demoScriptId: string;
  status: VerificationJobStatus;
  attemptCount: number;
  nextRunAt: string;
  lastError: string | null;
  leasedBy: string | null;
  leaseExpiresAt: string | null;
  provider: string;
  actor: string;
  providerSource: VerificationProviderSource;
  executionSurface: VerificationExecutionSurface;
  workerId: string | null;
  codeGitSha: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface EnqueueVerificationJobOptions {
  now?: string;
  provider?: string | null | undefined;
  executionSurface?: VerificationExecutionSurface | undefined;
}

export interface ClaimVerificationJobOptions {
  workerId: string;
  now?: string;
  leaseMs?: number;
}

export interface SettleVerificationJobOptions {
  jobId: string;
  workerId: string;
  attemptCount: number;
  status: "succeeded" | "failed" | "blocked" | "dead";
  error?: string;
  nextRunAt?: string;
  now?: string;
  provider?: string | undefined;
  actor?: string | undefined;
  providerSource?: VerificationProviderSource | undefined;
  executionSurface?: VerificationExecutionSurface | undefined;
  codeGitSha?: string | null | undefined;
}

const DEFAULT_LEASE_MS = 5 * 60 * 1000;

interface DbVerificationJobRow {
  id: string;
  ticket_id: string;
  demo_script_id: string;
  status: VerificationJobStatus;
  attempt_count: number;
  next_run_at: string;
  last_error: string | null;
  leased_by: string | null;
  lease_expires_at: string | null;
  provider: string | null;
  actor: string | null;
  provider_source: VerificationProviderSource | null;
  execution_surface: VerificationExecutionSurface | null;
  worker_id: string | null;
  code_git_sha: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

function nowIso(value?: string): string {
  return value ?? new Date().toISOString();
}

function toVerificationJob(row: DbVerificationJobRow): VerificationJob {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    demoScriptId: row.demo_script_id,
    status: row.status,
    attemptCount: row.attempt_count,
    nextRunAt: row.next_run_at,
    lastError: row.last_error,
    leasedBy: row.leased_by,
    leaseExpiresAt: row.lease_expires_at,
    provider: row.provider ?? "unknown",
    actor: row.actor ?? "unknown ralph",
    providerSource: row.provider_source ?? "unknown",
    executionSurface: row.execution_surface ?? "enqueue-drain",
    workerId: row.worker_id,
    codeGitSha: row.code_git_sha,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function getTicketStatus(db: DbHandle, ticketId: string): string {
  const row = db.prepare("SELECT status FROM tickets WHERE id = ?").get(ticketId) as
    | { status: string }
    | undefined;
  if (!row) throw new TicketNotFoundError(ticketId);
  return row.status;
}

function getDemoScriptId(db: DbHandle, ticketId: string): string {
  const row = db.prepare("SELECT id FROM demo_scripts WHERE ticket_id = ?").get(ticketId) as
    | { id: string }
    | undefined;
  if (!row) {
    throw new ValidationError(
      `Cannot enqueue verification: ticket ${ticketId} has no demo script.`
    );
  }
  return row.id;
}

export function enqueueVerificationJob(
  db: DbHandle,
  ticketId: string,
  options: EnqueueVerificationJobOptions = {}
): VerificationJob {
  const status = getTicketStatus(db, ticketId);
  if (status !== "ai_verification") {
    throw new ValidationError(
      `Cannot enqueue verification: ticket ${ticketId} is ${status}, expected ai_verification.`
    );
  }

  const demoScriptId = getDemoScriptId(db, ticketId);
  const now = nowIso(options.now);
  const existing = getVerificationJob(db, ticketId);
  const identity = resolveVerifierIdentity(db, {
    ticketId,
    provider: options.provider,
    executionSurface: options.executionSurface ?? "enqueue-drain",
  });

  if (existing) {
    if (
      existing.status === "running" &&
      existing.leaseExpiresAt !== null &&
      existing.leaseExpiresAt > now
    ) {
      throw new ValidationError(
        `Cannot enqueue verification: ticket ${ticketId} already has an active verification lease.`
      );
    }

    db.prepare(
      `UPDATE verification_jobs
       SET demo_script_id = ?, status = 'queued', attempt_count = 0, next_run_at = ?,
           last_error = NULL, leased_by = NULL, lease_expires_at = NULL,
           provider = ?, actor = ?, provider_source = ?, execution_surface = ?,
           worker_id = NULL, code_git_sha = NULL, completed_at = NULL, updated_at = ?
       WHERE ticket_id = ?`
    ).run(
      demoScriptId,
      now,
      identity.provider,
      identity.actor,
      identity.providerSource,
      identity.executionSurface,
      now,
      ticketId
    );
  } else {
    db.prepare(
      `INSERT INTO verification_jobs (
         id, ticket_id, demo_script_id, status, attempt_count, next_run_at,
         provider, actor, provider_source, execution_surface, created_at, updated_at
       ) VALUES (?, ?, ?, 'queued', 0, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      ticketId,
      demoScriptId,
      now,
      identity.provider,
      identity.actor,
      identity.providerSource,
      identity.executionSurface,
      now,
      now
    );
  }

  const job = getVerificationJob(db, ticketId);
  if (!job) {
    throw new ValidationError(
      `Cannot enqueue verification: job for ticket ${ticketId} was not saved.`
    );
  }
  return job;
}

export function getVerificationJob(db: DbHandle, ticketId: string): VerificationJob | null {
  const row = db.prepare("SELECT * FROM verification_jobs WHERE ticket_id = ?").get(ticketId) as
    | DbVerificationJobRow
    | undefined;
  return row ? toVerificationJob(row) : null;
}

export function listVerificationJobs(db: DbHandle): VerificationJob[] {
  const rows = db
    .prepare("SELECT * FROM verification_jobs ORDER BY next_run_at ASC, created_at ASC")
    .all() as DbVerificationJobRow[];
  return rows.map(toVerificationJob);
}

export function claimNextVerificationJob(
  db: DbHandle,
  options: ClaimVerificationJobOptions
): VerificationJob | null {
  const now = nowIso(options.now);
  const leaseExpiresAt = new Date(
    new Date(now).getTime() + (options.leaseMs ?? DEFAULT_LEASE_MS)
  ).toISOString();

  return claimDurableJobLease<DbVerificationJobRow, VerificationJob>(db, {
    tableName: "verification_jobs",
    selectReadySql: `SELECT verification_jobs.* FROM verification_jobs
      JOIN tickets ON tickets.id = verification_jobs.ticket_id
      WHERE tickets.status = 'ai_verification'
        AND (
          (verification_jobs.status IN ('queued', 'failed') AND verification_jobs.next_run_at <= ?)
          OR (
            verification_jobs.status = 'running'
            AND verification_jobs.lease_expires_at IS NOT NULL
            AND verification_jobs.lease_expires_at <= ?
          )
        )
      ORDER BY verification_jobs.next_run_at ASC, verification_jobs.created_at ASC
      LIMIT 1`,
    selectReadyArgs: [now, now],
    claimWhereSql: `EXISTS (
        SELECT 1 FROM tickets
        WHERE tickets.id = verification_jobs.ticket_id
          AND tickets.status = 'ai_verification'
      )
      AND (
        (status IN ('queued', 'failed') AND next_run_at <= ?)
        OR (status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
      )`,
    claimWhereArgs: () => [now, now],
    workerId: options.workerId,
    leaseExpiresAt,
    now,
    toJob: toVerificationJob,
  });
}

export function settleVerificationJob(
  db: DbHandle,
  options: SettleVerificationJobOptions
): VerificationJob {
  const now = nowIso(options.now);
  const completedAt = options.status === "failed" && options.nextRunAt ? null : now;
  const nextRunAt = options.nextRunAt ?? now;

  const job = settleDurableJobLease<DbVerificationJobRow, VerificationJob>(db, {
    tableName: "verification_jobs",
    jobId: options.jobId,
    workerId: options.workerId,
    attemptCount: options.attemptCount,
    status: options.status,
    nextRunAt,
    error: options.error ?? null,
    completedAt,
    now,
    notLeasedMessage: `Verification job ${options.jobId} is not leased by ${options.workerId} for attempt ${options.attemptCount}.`,
    toJob: toVerificationJob,
  });
  db.prepare(
    `UPDATE verification_jobs
     SET provider = COALESCE(?, provider), actor = COALESCE(?, actor),
         provider_source = COALESCE(?, provider_source),
         execution_surface = COALESCE(?, execution_surface), worker_id = ?, code_git_sha = ?
     WHERE id = ?`
  ).run(
    options.provider ?? null,
    options.actor ?? null,
    options.providerSource ?? null,
    options.executionSurface ?? null,
    options.workerId ?? null,
    options.codeGitSha ?? null,
    options.jobId
  );
  return getVerificationJob(db, job.ticketId) ?? job;
}

export function settleVerificationJobForTicket(
  db: DbHandle,
  ticketId: string,
  status: "succeeded" | "failed" | "blocked",
  options: {
    error?: string;
    now?: string;
    provider?: string;
    actor?: string;
    providerSource?: VerificationProviderSource;
    executionSurface?: VerificationExecutionSurface;
    workerId?: string | null;
    codeGitSha?: string | null;
  } = {}
): VerificationJob | null {
  const now = nowIso(options.now);
  const completedAt = status === "failed" ? null : now;
  db.prepare(
    `UPDATE verification_jobs
     SET status = ?, next_run_at = ?, last_error = ?, leased_by = NULL,
         lease_expires_at = NULL, completed_at = ?, updated_at = ?,
         provider = COALESCE(?, provider), actor = COALESCE(?, actor),
         provider_source = COALESCE(?, provider_source),
         execution_surface = COALESCE(?, execution_surface), worker_id = ?, code_git_sha = ?
     WHERE ticket_id = ?`
  ).run(
    status,
    now,
    options.error ?? null,
    completedAt,
    now,
    options.provider ?? null,
    options.actor ?? null,
    options.providerSource ?? null,
    options.executionSurface ?? null,
    options.workerId ?? null,
    options.codeGitSha ?? null,
    ticketId
  );

  const result = db.prepare("SELECT changes() as changes").get() as { changes: number };
  if (result.changes === 0) return null;
  return getVerificationJob(db, ticketId);
}
