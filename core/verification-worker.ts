import { randomUUID } from "crypto";
import type { DbHandle, ExecFileNoThrowResult } from "./types.ts";
import { addComment } from "./comment.ts";
import { ValidationError } from "./errors.ts";
import { getVerificationJob, claimNextVerificationJob } from "./verification-queue.ts";
import { verifyTicket, type VerificationRun, type VerifyTicketParams } from "./verification.ts";

export interface VerificationWorkerOptions {
  workerId?: string;
  provider?: string;
  projectPath?: string;
  baseUrl?: string;
  intervalMs?: number;
  leaseMs?: number;
  maxInfraAttempts?: number;
  retryDelayMs?: number;
  execFileNoThrow?: (
    command: string,
    args: string[],
    options?: { cwd?: string; timeoutMs?: number; maxBuffer?: number }
  ) => Promise<ExecFileNoThrowResult>;
  verifyTicketFn?: (db: DbHandle, params: VerifyTicketParams) => Promise<VerificationRun>;
  now?: () => Date;
}

export interface VerificationWorkerRunResult {
  claimed: boolean;
  workerId: string;
  ticketId?: string;
  jobId?: string;
  attemptCount?: number;
  runStatus?: VerificationRun["status"];
  jobStatus?: string;
  retryAt?: string;
  error?: string;
}

export interface VerificationWorkerQueueStatus {
  enabled: boolean;
  queueDepth: number;
  byStatus: Record<string, number>;
  oldestQueuedAt: string | null;
  oldestRunningLeaseExpiresAt: string | null;
  lastError: string | null;
}

export interface VerificationWorkerHandle {
  workerId: string;
  stop: () => void;
  status: () => VerificationWorkerQueueStatus & {
    running: boolean;
    processedCount: number;
    lastStartedAt: string | null;
    lastFinishedAt: string | null;
  };
}

const DEFAULT_INTERVAL_MS = 10_000;
const DEFAULT_LEASE_MS = 2 * 60 * 1000;
const DEFAULT_MAX_INFRA_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 30_000;

function nowIso(now?: () => Date): string {
  return (now?.() ?? new Date()).toISOString();
}

function retryAtIso(now: () => Date, retryDelayMs: number): string {
  return new Date(now().getTime() + retryDelayMs).toISOString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requeueInfraError(
  db: DbHandle,
  params: {
    jobId: string;
    ticketId: string;
    error: string;
    retryAt: string;
    now: string;
  }
): void {
  db.prepare(
    `UPDATE tickets
     SET is_blocked = 0, blocked_reason = NULL, updated_at = ?
     WHERE id = ? AND status = 'ai_verification'`
  ).run(params.now, params.ticketId);
  db.prepare(
    `UPDATE verification_jobs
     SET status = 'failed', next_run_at = ?, last_error = ?, leased_by = NULL,
         lease_expires_at = NULL, completed_at = NULL, updated_at = ?
     WHERE id = ?`
  ).run(params.retryAt, params.error, params.now, params.jobId);
}

function markWorkerExceptionBlocked(
  db: DbHandle,
  params: {
    jobId: string;
    ticketId: string;
    error: string;
    now: string;
  }
): void {
  const reason = `Automatic verification worker failed: ${params.error}`;
  db.prepare(
    `UPDATE tickets
     SET is_blocked = 1, blocked_reason = ?, updated_at = ?
     WHERE id = ? AND status = 'ai_verification'`
  ).run(reason, params.now, params.ticketId);
  db.prepare(
    `UPDATE verification_jobs
     SET status = 'blocked', last_error = ?, leased_by = NULL, lease_expires_at = NULL,
         completed_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(reason, params.now, params.now, params.jobId);
  addComment(db, {
    ticketId: params.ticketId,
    author: "brain-dump",
    type: "comment",
    content: `## Verification Worker Blocked\n\n${reason}`,
  });
}

export async function runNextVerificationJob(
  db: DbHandle,
  options: VerificationWorkerOptions = {}
): Promise<VerificationWorkerRunResult> {
  const workerId = options.workerId ?? `verification-worker-${randomUUID()}`;
  const now = nowIso(options.now);
  const job = claimNextVerificationJob(db, {
    workerId,
    now,
    leaseMs: options.leaseMs ?? DEFAULT_LEASE_MS,
  });
  if (!job) return { claimed: false, workerId };

  const verify = options.verifyTicketFn ?? verifyTicket;
  try {
    const run = await verify(db, {
      ticketId: job.ticketId,
      ...(options.provider !== undefined ? { provider: options.provider } : {}),
      ...(options.projectPath !== undefined ? { projectPath: options.projectPath } : {}),
      ...(options.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
      ...(options.execFileNoThrow !== undefined
        ? { execFileNoThrow: options.execFileNoThrow }
        : {}),
    });

    if (
      run.status === "infra_error" &&
      job.attemptCount < (options.maxInfraAttempts ?? DEFAULT_MAX_INFRA_ATTEMPTS)
    ) {
      const retryAt = retryAtIso(
        options.now ?? (() => new Date()),
        options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
      );
      const message = run.manifest.stepVerdicts[0]?.message ?? "Verification infrastructure error";
      requeueInfraError(db, {
        jobId: job.id,
        ticketId: job.ticketId,
        error: message,
        retryAt,
        now: run.finishedAt,
      });
      return {
        claimed: true,
        workerId,
        ticketId: job.ticketId,
        jobId: job.id,
        attemptCount: job.attemptCount,
        runStatus: run.status,
        jobStatus: "failed",
        retryAt,
        error: message,
      };
    }

    const updatedJob = getVerificationJob(db, job.ticketId);
    const result: VerificationWorkerRunResult = {
      claimed: true,
      workerId,
      ticketId: job.ticketId,
      jobId: job.id,
      attemptCount: job.attemptCount,
      runStatus: run.status,
    };
    if (updatedJob) result.jobStatus = updatedJob.status;
    return result;
  } catch (error) {
    const message = errorMessage(error);
    if (job.attemptCount < (options.maxInfraAttempts ?? DEFAULT_MAX_INFRA_ATTEMPTS)) {
      const retryAt = retryAtIso(
        options.now ?? (() => new Date()),
        options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
      );
      requeueInfraError(db, {
        jobId: job.id,
        ticketId: job.ticketId,
        error: message,
        retryAt,
        now: nowIso(options.now),
      });
      return {
        claimed: true,
        workerId,
        ticketId: job.ticketId,
        jobId: job.id,
        attemptCount: job.attemptCount,
        jobStatus: "failed",
        retryAt,
        error: message,
      };
    }

    markWorkerExceptionBlocked(db, {
      jobId: job.id,
      ticketId: job.ticketId,
      error: message,
      now: nowIso(options.now),
    });
    return {
      claimed: true,
      workerId,
      ticketId: job.ticketId,
      jobId: job.id,
      attemptCount: job.attemptCount,
      jobStatus: "blocked",
      error: message,
    };
  }
}

export function getVerificationWorkerQueueStatus(db: DbHandle): VerificationWorkerQueueStatus {
  const rows = db
    .prepare(
      `SELECT status, next_run_at, lease_expires_at, last_error
       FROM verification_jobs
       ORDER BY next_run_at ASC, created_at ASC`
    )
    .all() as Array<{
    status: string;
    next_run_at: string;
    lease_expires_at: string | null;
    last_error: string | null;
  }>;
  const byStatus: Record<string, number> = {};
  let oldestQueuedAt: string | null = null;
  let oldestRunningLeaseExpiresAt: string | null = null;
  let lastError: string | null = null;

  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    if ((row.status === "queued" || row.status === "failed") && oldestQueuedAt === null) {
      oldestQueuedAt = row.next_run_at;
    }
    if (row.status === "running" && row.lease_expires_at !== null) {
      if (oldestRunningLeaseExpiresAt === null) {
        oldestRunningLeaseExpiresAt = row.lease_expires_at;
      } else if (row.lease_expires_at < oldestRunningLeaseExpiresAt) {
        oldestRunningLeaseExpiresAt = row.lease_expires_at;
      }
    }
    if (row.last_error !== null) lastError = row.last_error;
  }

  return {
    enabled: shouldStartVerificationWorkerFromEnv(),
    queueDepth: rows.filter((row) => row.status === "queued" || row.status === "failed").length,
    byStatus,
    oldestQueuedAt,
    oldestRunningLeaseExpiresAt,
    lastError,
  };
}

export function shouldStartVerificationWorkerFromEnv(): boolean {
  if (process.env.BRAIN_DUMP_DISABLE_VERIFICATION_WORKER === "1") return false;
  if (process.env.BRAIN_DUMP_DISABLE_DB_STARTUP_TASKS === "1") return false;
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") return false;
  return true;
}

export function startVerificationWorker(
  db: DbHandle,
  options: VerificationWorkerOptions = {}
): VerificationWorkerHandle {
  if ((options.intervalMs ?? DEFAULT_INTERVAL_MS) <= 0) {
    throw new ValidationError("Verification worker interval must be greater than zero.");
  }

  const workerId = options.workerId ?? `verification-worker-${process.pid}-${randomUUID()}`;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  let stopped = false;
  let running = false;
  let processedCount = 0;
  let lastStartedAt: string | null = null;
  let lastFinishedAt: string | null = null;
  let timer: NodeJS.Timeout | null = null;

  const schedule = (delayMs: number): void => {
    if (stopped) return;
    timer = setTimeout(() => {
      void tick();
    }, delayMs);
    timer.unref?.();
  };

  const tick = async (): Promise<void> => {
    if (stopped || running) return;
    running = true;
    lastStartedAt = nowIso(options.now);
    try {
      const result = await runNextVerificationJob(db, { ...options, workerId });
      if (result.claimed) processedCount += 1;
      schedule(result.claimed ? 0 : intervalMs);
    } finally {
      running = false;
      lastFinishedAt = nowIso(options.now);
    }
  };

  schedule(0);

  return {
    workerId,
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
    status: () => ({
      ...getVerificationWorkerQueueStatus(db),
      running,
      processedCount,
      lastStartedAt,
      lastFinishedAt,
    }),
  };
}
