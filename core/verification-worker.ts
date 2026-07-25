import { randomUUID } from "crypto";
import { spawn, type SpawnOptions } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import type { DbHandle, ExecFileNoThrowResult } from "./types.ts";
import { addComment } from "./comment.ts";
import { ValidationError } from "./errors.ts";
import {
  addInfraErrorAttentionComment,
  infraErrorBlockedReason,
  returnVerificationTicketForHumanAction,
} from "./verification-lifecycle.ts";
import {
  claimNextVerificationJob,
  getVerificationJob,
  hasClaimableVerificationJob,
  isVerificationWorkerPaused,
  renewVerificationJobLease,
} from "./verification-queue.ts";
import { verifyTicket, type VerificationRun, type VerifyTicketParams } from "./verification.ts";
import type { VerificationExecutionSurface } from "./verifier-identity.ts";

interface ClaimedJobLease {
  jobId: string;
  ticketId: string;
  workerId: string;
  attemptCount: number;
}

export interface VerificationWorkerOptions {
  workerId?: string;
  provider?: string;
  executionSurface?: VerificationExecutionSurface;
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
  afterJob?: () => Promise<void>;
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
  paused: boolean;
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
  params: ClaimedJobLease & {
    error: string;
    retryAt: string;
    now: string;
    requireActiveLease: boolean;
  }
): boolean {
  const whereClause = params.requireActiveLease
    ? "id = ? AND leased_by = ? AND attempt_count = ?"
    : "id = ?";
  const args = params.requireActiveLease
    ? [params.retryAt, params.error, params.now, params.jobId, params.workerId, params.attemptCount]
    : [params.retryAt, params.error, params.now, params.jobId];
  db.prepare(
    `UPDATE verification_jobs
     SET status = 'failed', next_run_at = ?, last_error = ?, leased_by = NULL,
         lease_expires_at = NULL, completed_at = NULL, updated_at = ?
     WHERE ${whereClause}`
  ).run(...args);
  const result = db.prepare("SELECT changes() as changes").get() as { changes: number };
  if (result.changes !== 1) return false;

  db.prepare(
    `UPDATE tickets
     SET is_blocked = 0, blocked_reason = NULL, updated_at = ?
     WHERE id = ? AND status = 'ai_verification'`
  ).run(params.now, params.ticketId);
  return result.changes === 1;
}

function markWorkerExceptionBlocked(
  db: DbHandle,
  params: ClaimedJobLease & {
    error: string;
    now: string;
  }
): boolean {
  const reason = `Automatic verification worker failed: ${params.error}`;
  db.prepare(
    `UPDATE verification_jobs
     SET status = 'blocked', last_error = ?, leased_by = NULL, lease_expires_at = NULL,
         completed_at = ?, updated_at = ?
     WHERE id = ? AND leased_by = ? AND attempt_count = ?`
  ).run(reason, params.now, params.now, params.jobId, params.workerId, params.attemptCount);
  const result = db.prepare("SELECT changes() as changes").get() as { changes: number };
  if (result.changes !== 1) return false;

  returnVerificationTicketForHumanAction(db, params.ticketId, reason, params.now);
  addComment(db, {
    ticketId: params.ticketId,
    author: "brain-dump",
    type: "comment",
    content: `## Verification Worker Blocked\n\n${reason}`,
    phase: "ai_verification",
    actorKind: "system",
    provider: "brain-dump",
  });
  return true;
}

function buildLostLeaseResult(
  workerId: string,
  lease: ClaimedJobLease,
  error: string
): VerificationWorkerRunResult {
  return {
    claimed: true,
    workerId,
    ticketId: lease.ticketId,
    jobId: lease.jobId,
    attemptCount: lease.attemptCount,
    jobStatus: "stale",
    error: `Verification worker lost its job lease before settling: ${error}`,
  };
}

function requeueInfraErrorResult(
  db: DbHandle,
  params: ClaimedJobLease & {
    error: string;
    now: string;
    retryAt: string;
    runStatus?: VerificationRun["status"];
    requireActiveLease: boolean;
  }
): VerificationWorkerRunResult {
  const requeued = requeueInfraError(db, params);
  if (!requeued) return buildLostLeaseResult(params.workerId, params, params.error);
  const result: VerificationWorkerRunResult = {
    claimed: true,
    workerId: params.workerId,
    ticketId: params.ticketId,
    jobId: params.jobId,
    attemptCount: params.attemptCount,
    jobStatus: "failed",
    retryAt: params.retryAt,
    error: params.error,
  };
  if (params.runStatus) result.runStatus = params.runStatus;
  return result;
}

export async function runNextVerificationJob(
  db: DbHandle,
  options: VerificationWorkerOptions = {}
): Promise<VerificationWorkerRunResult> {
  const workerId = options.workerId ?? `verification-worker-${randomUUID()}`;
  const now = nowIso(options.now);
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  const job = claimNextVerificationJob(db, {
    workerId,
    now,
    leaseMs,
  });
  if (!job) return { claimed: false, workerId };
  const lease: ClaimedJobLease = {
    jobId: job.id,
    ticketId: job.ticketId,
    workerId,
    attemptCount: job.attemptCount,
  };

  const verify = options.verifyTicketFn ?? verifyTicket;
  const heartbeatIntervalMs = Math.max(25, Math.min(30_000, Math.floor(leaseMs / 3)));
  const leaseClockStartedAt = Date.now();
  const leaseClockBase = new Date(now).getTime();
  const heartbeat = setInterval(() => {
    try {
      const renewed = renewVerificationJobLease(db, {
        ...lease,
        now: new Date(leaseClockBase + (Date.now() - leaseClockStartedAt)).toISOString(),
        leaseMs,
      });
      if (!renewed) clearInterval(heartbeat);
    } catch (error) {
      console.error("[VerificationWorker] Lease heartbeat failed:", error);
    }
  }, heartbeatIntervalMs);
  heartbeat.unref?.();

  try {
    const run = await verify(db, {
      ticketId: job.ticketId,
      ...(options.provider !== undefined
        ? { provider: options.provider }
        : { provider: job.provider }),
      executionSurface: options.executionSurface ?? "enqueue-drain",
      ...(options.projectPath !== undefined ? { projectPath: options.projectPath } : {}),
      ...(options.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
      ...(options.execFileNoThrow !== undefined
        ? { execFileNoThrow: options.execFileNoThrow }
        : {}),
      verificationJobLease: lease,
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
      return requeueInfraErrorResult(db, {
        ...lease,
        error: message,
        retryAt,
        now: run.finishedAt,
        runStatus: run.status,
        requireActiveLease: false,
      });
    }
    let attentionCommentError: string | undefined;
    if (run.status === "infra_error") {
      // Retries exhausted: the lifecycle already blocked the ticket; post the
      // loud notice it skipped for leased runs. The run is already settled, so
      // a comment failure must not fall into the outer catch — that path would
      // misreport it as a lost lease.
      try {
        const reason = infraErrorBlockedReason(run);
        returnVerificationTicketForHumanAction(db, job.ticketId, reason, run.finishedAt);
        addInfraErrorAttentionComment(db, {
          ticketId: job.ticketId,
          runId: run.id,
          reason,
          provider: run.identity.provider,
        });
      } catch (error) {
        attentionCommentError = `Verification settled as blocked, but posting the infra-error attention comment failed: ${errorMessage(error)}`;
      }
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
    if (attentionCommentError) result.error = attentionCommentError;
    return result;
  } catch (error) {
    const message = errorMessage(error);
    if (job.attemptCount < (options.maxInfraAttempts ?? DEFAULT_MAX_INFRA_ATTEMPTS)) {
      const retryAt = retryAtIso(
        options.now ?? (() => new Date()),
        options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
      );
      return requeueInfraErrorResult(db, {
        ...lease,
        error: message,
        retryAt,
        now: nowIso(options.now),
        requireActiveLease: true,
      });
    }

    const blocked = markWorkerExceptionBlocked(db, {
      ...lease,
      error: message,
      now: nowIso(options.now),
    });
    if (!blocked) return buildLostLeaseResult(workerId, lease, message);
    return {
      claimed: true,
      workerId,
      ticketId: job.ticketId,
      jobId: job.id,
      attemptCount: job.attemptCount,
      jobStatus: "blocked",
      error: message,
    };
  } finally {
    clearInterval(heartbeat);
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
    paused: isVerificationWorkerPaused(db),
    queueDepth: rows.filter((row) => row.status === "queued" || row.status === "failed").length,
    byStatus,
    oldestQueuedAt,
    oldestRunningLeaseExpiresAt,
    lastError,
  };
}

export function isVerificationExecutionAllowedFromEnv(): boolean {
  if (process.env.BRAIN_DUMP_DISABLE_VERIFICATION_WORKER === "1") return false;
  if (process.env.BRAIN_DUMP_DISABLE_DB_STARTUP_TASKS === "1") return false;
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") return false;
  // Verifier-booted and Playwright-driven app instances must never execute
  // jobs: a verification boot running its own worker recurses into the queue,
  // and leaked boots become zombie executors running frozen code (observed
  // 2026-07-06: a leaked boot's worker leased jobs with stale runner code).
  if (process.env.BRAIN_DUMP_VERIFY_BOOT === "1") return false;
  if (process.env.PLAYWRIGHT_E2E === "1") return false;
  return true;
}

export function shouldStartVerificationWorkerFromEnv(): boolean {
  if (!isVerificationExecutionAllowedFromEnv()) return false;
  // The resident 10s poller is explicit opt-in (long-lived CI/ops boxes).
  // Default deployments drain once at boot and on every enqueue via one-shot
  // processes, so nothing runs between enqueues and every execution loads
  // current on-disk code instead of the server's boot-time module graph.
  return process.env.BRAIN_DUMP_VERIFICATION_WORKER_POLL === "1";
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
  let lastWorkerError: string | null = null;
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
    let nextDelayMs = intervalMs;
    try {
      const result = await runNextVerificationJob(db, {
        ...options,
        workerId,
        executionSurface: options.executionSurface ?? "resident-poller",
      });
      if (result.claimed) processedCount += 1;
      if (result.claimed) await options.afterJob?.();
      if (result.error) lastWorkerError = result.error;
      nextDelayMs = result.claimed ? 0 : intervalMs;
    } catch (error) {
      lastWorkerError = errorMessage(error);
      console.error("[VerificationWorker] Poll failed:", error);
    } finally {
      running = false;
      lastFinishedAt = nowIso(options.now);
      schedule(nextDelayMs);
    }
  };

  schedule(0);

  return {
    workerId,
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
    status: () => {
      const queueStatus = getVerificationWorkerQueueStatus(db);
      return {
        ...queueStatus,
        lastError: lastWorkerError ?? queueStatus.lastError,
        running,
        processedCount,
        lastStartedAt,
        lastFinishedAt,
      };
    },
  };
}

const DEFAULT_DRAIN_RETRY_FOLLOW_BUDGET_MS = 15 * 60 * 1000;
const DRAIN_RETRY_WAIT_CHUNK_MS = 30_000;

export interface DrainVerificationQueueResult {
  workerId: string;
  processed: number;
  lastError: string | null;
}

/**
 * Drain the verification queue until no job is claimable, then return.
 *
 * This is the one-shot replacement for the resident poller: it runs jobs
 * back-to-back, follows infra_error retries scheduled in the near future
 * (bounded by followRetryBudgetMs so a one-shot process still honors retry
 * backoff), and exits when the queue is empty. Concurrent drains are safe:
 * durable job leases serialize claims, and a drain that claims nothing exits.
 */
export async function drainVerificationQueue(
  db: DbHandle,
  options: VerificationWorkerOptions & { followRetryBudgetMs?: number } = {}
): Promise<DrainVerificationQueueResult> {
  const workerId = options.workerId ?? `verification-drain-${process.pid}-${randomUUID()}`;
  const followRetryBudgetMs = options.followRetryBudgetMs ?? DEFAULT_DRAIN_RETRY_FOLLOW_BUDGET_MS;
  const startedAtMs = (options.now?.() ?? new Date()).getTime();
  let processed = 0;
  let lastError: string | null = null;

  for (;;) {
    const result = await runNextVerificationJob(db, {
      ...options,
      workerId,
      executionSurface: options.executionSurface ?? "boot-drain",
    });
    if (result.error) lastError = result.error;
    if (result.claimed) {
      processed += 1;
      await options.afterJob?.();
      continue;
    }

    if (isVerificationWorkerPaused(db)) break;

    // Nothing claimable right now. If a queued job has a retry scheduled in
    // the near future, wait for it inside the budget instead of stranding it
    // until the next enqueue. Settled assertion-failure jobs (completed_at set,
    // ticket looped back to implementation) are NOT pending retries — without
    // the completed_at filter a one-shot drain would linger polling for the
    // whole follow budget after every loop-back. The ticket-status guard
    // mirrors the claim path: a retry whose ticket already left
    // ai_verification can never be claimed, so it must not be waited on.
    const row = db
      .prepare(
        `SELECT MIN(next_run_at) as next FROM verification_jobs
         WHERE status IN ('queued', 'failed') AND completed_at IS NULL
           AND EXISTS (
             SELECT 1 FROM tickets
             WHERE tickets.id = verification_jobs.ticket_id
               AND tickets.status = 'ai_verification'
           )`
      )
      .get() as { next: string | null } | undefined;
    if (!row?.next) break;
    const nextMs = Date.parse(row.next);
    if (!Number.isFinite(nextMs)) break;
    const nowMs = (options.now?.() ?? new Date()).getTime();
    const waitMs = Math.max(nextMs - nowMs, 250);
    if (nowMs + waitMs - startedAtMs > followRetryBudgetMs) break;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(waitMs, DRAIN_RETRY_WAIT_CHUNK_MS))
    );
  }

  return { workerId, processed, lastError };
}

export interface SpawnVerificationDrainOptions {
  brainDumpRoot: string;
  spawnImpl?: (command: string, args: string[], options: SpawnOptions) => ReturnType<typeof spawn>;
  logError?: (message: string) => void;
}

export interface SpawnVerificationDrainResult {
  spawned: boolean;
  pid?: number;
  error?: string;
}

export interface SpawnVerificationRecoveryDrainResult extends SpawnVerificationDrainResult {
  needed: boolean;
}

/**
 * Launch a detached one-shot verification drain process.
 *
 * The spawned process loads CURRENT on-disk code, so a long-running server
 * that enqueues a job never executes verification with its boot-time module
 * graph. Spawn failures are reported to the caller (and logError), never
 * thrown: an enqueue must not fail because the drain could not start — the
 * job stays queued for the next boot/enqueue drain.
 */
export function spawnDetachedVerificationDrain(
  options: SpawnVerificationDrainOptions
): SpawnVerificationDrainResult {
  const spawnImpl = options.spawnImpl ?? spawn;
  try {
    const child = spawnImpl(
      process.execPath,
      ["--import", "tsx", "cli/brain-dump.ts", "verify", "worker", "--drain"],
      {
        cwd: options.brainDumpRoot,
        detached: process.platform !== "win32",
        stdio: "ignore",
        env: {
          ...process.env,
          BRAIN_DUMP_DISABLE_DB_STARTUP_TASKS: "1",
          BRAIN_DUMP_VERIFICATION_SURFACE: "enqueue-drain",
        },
      }
    );
    child.unref?.();
    return { spawned: true, ...(child.pid !== undefined ? { pid: child.pid } : {}) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.logError?.(`Failed to spawn verification drain: ${message}`);
    return { spawned: false, error: message };
  }
}

export function spawnDetachedVerificationDrainIfNeeded(
  db: DbHandle,
  options: SpawnVerificationDrainOptions & { now?: string }
): SpawnVerificationRecoveryDrainResult {
  if (!hasClaimableVerificationJob(db, options.now !== undefined ? { now: options.now } : {})) {
    return { needed: false, spawned: false };
  }
  return { needed: true, ...spawnDetachedVerificationDrain(options) };
}

/**
 * Resolve the Brain Dump repo root from a module URL by probing for the CLI
 * entrypoint. Works from source trees (cli/, mcp-server/tools/) and from the
 * bundled MCP server (mcp-server/dist/index.js) alike.
 */
export function resolveBrainDumpRootFrom(moduleUrl: string): string | null {
  for (const relative of ["..", "../..", "../../.."]) {
    try {
      const candidate = fileURLToPath(new URL(relative, moduleUrl));
      if (existsSync(join(candidate, "cli", "brain-dump.ts"))) return candidate;
    } catch {
      // Invalid URL for this candidate depth; try the next one.
    }
  }
  return null;
}
