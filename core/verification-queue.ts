import { randomUUID } from "crypto";
import type { DbHandle } from "./types.ts";
import { TicketNotFoundError, ValidationError } from "./errors.ts";

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
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface EnqueueVerificationJobOptions {
  now?: string;
}

export interface ClaimVerificationJobOptions {
  workerId: string;
  now?: string;
  leaseMs?: number;
}

export interface SettleVerificationJobOptions {
  jobId: string;
  status: "succeeded" | "failed" | "blocked" | "dead";
  error?: string;
  nextRunAt?: string;
  now?: string;
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

  if (existing) {
    db.prepare(
      `UPDATE verification_jobs
       SET demo_script_id = ?, status = 'queued', attempt_count = 0, next_run_at = ?,
           last_error = NULL, leased_by = NULL, lease_expires_at = NULL,
           completed_at = NULL, updated_at = ?
       WHERE ticket_id = ?`
    ).run(demoScriptId, now, now, ticketId);
  } else {
    db.prepare(
      `INSERT INTO verification_jobs (
         id, ticket_id, demo_script_id, status, attempt_count, next_run_at,
         created_at, updated_at
       ) VALUES (?, ?, ?, 'queued', 0, ?, ?, ?)`
    ).run(randomUUID(), ticketId, demoScriptId, now, now, now);
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

  return db.transaction(() => {
    const row = db
      .prepare(
        `SELECT * FROM verification_jobs
         WHERE (status IN ('queued', 'failed') AND next_run_at <= ?)
            OR (status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
         ORDER BY next_run_at ASC, created_at ASC
         LIMIT 1`
      )
      .get(now, now) as DbVerificationJobRow | undefined;

    if (!row) return null;

    db.prepare(
      `UPDATE verification_jobs
       SET status = 'running', attempt_count = attempt_count + 1, leased_by = ?,
           lease_expires_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(options.workerId, leaseExpiresAt, now, row.id);

    const claimed = db
      .prepare("SELECT * FROM verification_jobs WHERE id = ?")
      .get(row.id) as DbVerificationJobRow;
    return toVerificationJob(claimed);
  })();
}

export function settleVerificationJob(
  db: DbHandle,
  options: SettleVerificationJobOptions
): VerificationJob {
  const now = nowIso(options.now);
  const completedAt = options.status === "failed" && options.nextRunAt ? null : now;
  const nextRunAt = options.nextRunAt ?? now;

  db.prepare(
    `UPDATE verification_jobs
     SET status = ?, next_run_at = ?, last_error = ?, leased_by = NULL,
         lease_expires_at = NULL, completed_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(options.status, nextRunAt, options.error ?? null, completedAt, now, options.jobId);

  const row = db.prepare("SELECT * FROM verification_jobs WHERE id = ?").get(options.jobId) as
    | DbVerificationJobRow
    | undefined;
  if (!row) throw new ValidationError(`Verification job ${options.jobId} was not found.`);
  return toVerificationJob(row);
}
