import { randomUUID } from "crypto";
import { addComment } from "./comment.ts";
import type { DbHandle } from "./types.ts";
import { claimDurableJobLease, settleDurableJobLease } from "./durable-job-lease.ts";
import { ValidationError } from "./errors.ts";

export interface AutonomousEpicLaunchProfile {
  epicId: string;
  projectPath: string;
  scriptPath: string;
  scriptContent?: string;
  maxIterations: number;
  expiresAt?: string;
  provider?: string;
  modelProvider?: string;
  modelName?: string;
  reviewerProvider?: string;
  reviewerModelProvider?: string;
  reviewerModelName?: string;
  useSandbox?: boolean;
  originalWorkingMethod?: string;
}

export interface EpicContinuationJob {
  id: string;
  epicId: string;
  ticketId: string;
  status: "queued" | "running" | "failed" | "succeeded" | "dead";
  attemptCount: number;
  nextRunAt: string;
  lastError: string | null;
  leasedBy: string | null;
  leaseExpiresAt: string | null;
  completedAt: string | null;
  profile: AutonomousEpicLaunchProfile;
}

interface ContinuationRow {
  id: string;
  epic_id: string;
  ticket_id: string;
  status: EpicContinuationJob["status"];
  attempt_count: number;
  next_run_at: string;
  last_error: string | null;
  leased_by: string | null;
  lease_expires_at: string | null;
  completed_at: string | null;
  profile_json?: string;
}

const SELECT_CONTINUATION_WITH_PROFILE = `SELECT j.*, l.profile_json
  FROM epic_continuation_jobs j
  JOIN autonomous_epic_launches l ON l.epic_id = j.epic_id
  WHERE j.id = ?`;

function parseLaunchProfile(value: string | undefined): AutonomousEpicLaunchProfile {
  if (!value) throw new ValidationError("Epic continuation launch profile is missing.");
  let profile: unknown;
  try {
    profile = JSON.parse(value);
  } catch {
    throw new ValidationError("Epic continuation launch profile is not valid JSON.");
  }
  if (
    !profile ||
    typeof profile !== "object" ||
    typeof (profile as AutonomousEpicLaunchProfile).epicId !== "string" ||
    typeof (profile as AutonomousEpicLaunchProfile).projectPath !== "string" ||
    typeof (profile as AutonomousEpicLaunchProfile).scriptPath !== "string" ||
    typeof (profile as AutonomousEpicLaunchProfile).maxIterations !== "number" ||
    typeof (profile as AutonomousEpicLaunchProfile).expiresAt !== "string"
  ) {
    throw new ValidationError("Epic continuation launch profile is incomplete.");
  }
  return profile as AutonomousEpicLaunchProfile;
}

function toJob(row: ContinuationRow): EpicContinuationJob {
  return {
    id: row.id,
    epicId: row.epic_id,
    ticketId: row.ticket_id,
    status: row.status,
    attemptCount: row.attempt_count,
    nextRunAt: row.next_run_at,
    lastError: row.last_error,
    leasedBy: row.leased_by,
    leaseExpiresAt: row.lease_expires_at,
    completedAt: row.completed_at,
    profile: parseLaunchProfile(row.profile_json),
  };
}

function quarantineInvalidProfiles(db: DbHandle, now: string): void {
  const rows = db
    .prepare(
      `SELECT j.id, j.epic_id, j.ticket_id, l.profile_json
       FROM epic_continuation_jobs j
       JOIN autonomous_epic_launches l ON l.epic_id = j.epic_id
       WHERE j.status IN ('queued', 'failed', 'running')`
    )
    .all() as Array<Pick<ContinuationRow, "id" | "epic_id" | "ticket_id" | "profile_json">>;
  for (const row of rows) {
    try {
      parseLaunchProfile(row.profile_json);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const reason = `Automatic epic continuation cannot start: ${message}`;
      db.transaction(() => {
        db.prepare(
          `UPDATE epic_continuation_jobs
           SET status = 'dead', last_error = ?, leased_by = NULL, lease_expires_at = NULL,
               completed_at = ?, updated_at = ? WHERE id = ?`
        ).run(reason, now, now, row.id);
        db.prepare(
          "UPDATE tickets SET is_blocked = 1, blocked_reason = ?, updated_at = ? WHERE id = ?"
        ).run(reason, now, row.ticket_id);
        setAutonomousEpicLaunchActive(db, row.epic_id, false, now);
        addComment(db, {
          ticketId: row.ticket_id,
          content: reason,
          author: "brain-dump",
          type: "progress",
          phase: "system_workflow",
          actorKind: "system",
          provider: "brain-dump",
        });
      })();
    }
  }
}

export function saveAutonomousEpicLaunch(
  db: DbHandle,
  profile: AutonomousEpicLaunchProfile,
  now = new Date().toISOString()
): void {
  const persistedProfile = {
    ...profile,
    expiresAt: profile.expiresAt ?? new Date(Date.parse(now) + 24 * 60 * 60 * 1000).toISOString(),
  };
  db.prepare(
    `INSERT INTO autonomous_epic_launches (epic_id, profile_json, active, created_at, updated_at)
     VALUES (?, ?, 1, ?, ?)
     ON CONFLICT(epic_id) DO UPDATE SET
       profile_json = excluded.profile_json, active = 1, updated_at = excluded.updated_at`
  ).run(profile.epicId, JSON.stringify(persistedProfile), now, now);
}

export function setAutonomousEpicLaunchActive(
  db: DbHandle,
  epicId: string,
  active: boolean,
  now = new Date().toISOString()
): void {
  db.prepare(
    "UPDATE autonomous_epic_launches SET active = ?, updated_at = ? WHERE epic_id = ?"
  ).run(active ? 1 : 0, now, epicId);
}

/**
 * Settle running continuation rows whose target ticket is already done. The
 * table is unique per epic, so a stale "running" row (parent process died
 * before settling, or the promise was lost) vetoes every later repair enqueue
 * for that epic until its lease expires — up to 24 hours.
 *
 * By default only rows with an expired (or missing) lease are touched: a live
 * lease may belong to a child epic script that finished its target ticket but
 * is still working the epic, and settling it mid-flight would make the owner's
 * later settlement fail. `includeLiveLeases` overrides that guard for the
 * enqueue path, where a verification failure needs the epic's single
 * continuation slot right now and a running row for a done ticket cannot serve
 * the repair.
 */
export function reconcileObsoleteEpicContinuations(
  db: DbHandle,
  options: { epicId?: string; now?: string; includeLiveLeases?: boolean } = {}
): number {
  const now = options.now ?? new Date().toISOString();
  const params: string[] = [now, now];
  let where = `status = 'running'
         AND ticket_id IN (SELECT id FROM tickets WHERE status = 'done')`;
  if (!options.includeLiveLeases) {
    where += " AND (lease_expires_at IS NULL OR lease_expires_at <= ?)";
    params.push(now);
  }
  if (options.epicId) {
    where += " AND epic_id = ?";
    params.push(options.epicId);
  }
  const result = db
    .prepare(
      `UPDATE epic_continuation_jobs
       SET status = 'succeeded', leased_by = NULL, lease_expires_at = NULL,
           last_error = 'Settled as obsolete: the continuation''s target ticket is already done.',
           completed_at = ?, updated_at = ?
       WHERE ${where}`
    )
    .run(...params);
  return result.changes;
}

export function enqueueEpicContinuationForTicket(
  db: DbHandle,
  ticketId: string,
  now = new Date().toISOString()
): EpicContinuationJob | null {
  const launch = db
    .prepare(
      `SELECT l.epic_id
       FROM autonomous_epic_launches l
       JOIN tickets t ON t.epic_id = l.epic_id
       WHERE t.id = ? AND t.status = 'in_progress' AND l.active = 1
         AND json_extract(l.profile_json, '$.expiresAt') > ?`
    )
    .get(ticketId, now) as { epic_id: string } | undefined;
  if (!launch) return null;

  reconcileObsoleteEpicContinuations(db, { epicId: launch.epic_id, now, includeLiveLeases: true });
  db.prepare(
    `INSERT INTO epic_continuation_jobs
       (id, epic_id, ticket_id, status, attempt_count, next_run_at, created_at, updated_at)
     VALUES (?, ?, ?, 'queued', 0, ?, ?, ?)
     ON CONFLICT(epic_id) DO UPDATE SET
       ticket_id = excluded.ticket_id, status = 'queued', attempt_count = 0,
       next_run_at = excluded.next_run_at, last_error = NULL, leased_by = NULL,
       lease_expires_at = NULL, completed_at = NULL, updated_at = excluded.updated_at
     WHERE epic_continuation_jobs.status != 'running'
        OR epic_continuation_jobs.lease_expires_at IS NULL
        OR epic_continuation_jobs.lease_expires_at <= excluded.next_run_at`
  ).run(randomUUID(), launch.epic_id, ticketId, now, now, now);

  const row = db
    .prepare(
      `SELECT j.*, l.profile_json
       FROM epic_continuation_jobs j
       JOIN autonomous_epic_launches l ON l.epic_id = j.epic_id
       WHERE j.epic_id = ?`
    )
    .get(launch.epic_id) as ContinuationRow;
  return toJob(row);
}

export function claimNextEpicContinuation(
  db: DbHandle,
  options: { workerId: string; now?: string; leaseMs?: number }
): EpicContinuationJob | null {
  const now = options.now ?? new Date().toISOString();
  reconcileObsoleteEpicContinuations(db, { now });
  quarantineInvalidProfiles(db, now);
  const leaseExpiresAt = new Date(
    new Date(now).getTime() + (options.leaseMs ?? 2 * 60 * 1000)
  ).toISOString();
  return claimDurableJobLease<ContinuationRow, EpicContinuationJob>(db, {
    tableName: "epic_continuation_jobs",
    selectReadySql: `SELECT j.*, l.profile_json
      FROM epic_continuation_jobs j
      JOIN autonomous_epic_launches l ON l.epic_id = j.epic_id AND l.active = 1
        AND json_extract(l.profile_json, '$.expiresAt') > ?
      JOIN tickets t ON t.id = j.ticket_id AND t.epic_id = j.epic_id
      WHERE t.status = 'in_progress' AND (
        (j.status IN ('queued', 'failed') AND j.next_run_at <= ?)
        OR (j.status = 'running' AND j.lease_expires_at IS NOT NULL AND j.lease_expires_at <= ?)
      ) ORDER BY j.next_run_at, j.created_at LIMIT 1`,
    selectReadyArgs: [now, now, now],
    selectClaimedSql: SELECT_CONTINUATION_WITH_PROFILE,
    claimWhereSql: `EXISTS (
        SELECT 1 FROM autonomous_epic_launches l
        JOIN tickets t ON t.id = epic_continuation_jobs.ticket_id
        WHERE l.epic_id = epic_continuation_jobs.epic_id AND l.active = 1
          AND json_extract(l.profile_json, '$.expiresAt') > ?
          AND t.epic_id = epic_continuation_jobs.epic_id AND t.status = 'in_progress'
      ) AND ((status IN ('queued', 'failed') AND next_run_at <= ?)
        OR (status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?))`,
    claimWhereArgs: () => [now, now, now],
    workerId: options.workerId,
    leaseExpiresAt,
    now,
    toJob,
  });
}

export async function runNextEpicContinuation(
  db: DbHandle,
  options: {
    workerId?: string;
    now?: () => Date;
    leaseMs?: number;
    maxAttempts?: number;
    retryDelayMs?: number;
    launch: (profile: AutonomousEpicLaunchProfile, ticketId: string) => Promise<void>;
  }
): Promise<{ claimed: boolean; status?: string; ticketId?: string; error?: string }> {
  const workerId = options.workerId ?? `epic-continuation-${randomUUID()}`;
  const now = (options.now?.() ?? new Date()).toISOString();
  const job = claimNextEpicContinuation(db, {
    workerId,
    now,
    leaseMs: options.leaseMs ?? 24 * 60 * 60 * 1000,
  });
  if (!job) return { claimed: false };

  // The enqueue path may settle this row as obsolete mid-launch when the
  // target ticket reaches done (freeing the epic's single continuation slot
  // for a newer repair). Losing the lease that way is a benign race: the row
  // is already settled, so report the launch outcome without letting the
  // lost-lease error crash the drain loop or trigger ticket-blocking side
  // effects for work that is finished.
  const settleOrDetectLostLease = (params: {
    status: "succeeded" | "failed" | "dead";
    nextRunAt: string;
    error: string | null;
    completedAt: string | null;
  }): boolean => {
    try {
      settleDurableJobLease<ContinuationRow, EpicContinuationJob>(db, {
        tableName: "epic_continuation_jobs",
        jobId: job.id,
        workerId,
        attemptCount: job.attemptCount,
        status: params.status,
        nextRunAt: params.nextRunAt,
        error: params.error,
        completedAt: params.completedAt,
        now,
        notLeasedMessage: `Epic continuation ${job.id} lost its lease.`,
        selectSettledSql: SELECT_CONTINUATION_WITH_PROFILE,
        toJob,
      });
      return true;
    } catch {
      return false;
    }
  };

  try {
    await options.launch(job.profile, job.ticketId);
    settleOrDetectLostLease({ status: "succeeded", nextRunAt: now, error: null, completedAt: now });
    return { claimed: true, status: "succeeded", ticketId: job.ticketId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const exhausted = job.attemptCount >= (options.maxAttempts ?? 3);
    const nextRunAt = new Date(
      (options.now?.() ?? new Date()).getTime() + (options.retryDelayMs ?? 30_000)
    ).toISOString();
    const settled = settleOrDetectLostLease({
      status: exhausted ? "dead" : "failed",
      nextRunAt,
      error: message,
      completedAt: exhausted ? now : null,
    });
    if (!settled) {
      // Another actor settled the row (obsolete reconcile or lease takeover);
      // do not block a ticket this worker no longer owns.
      return { claimed: true, status: "failed", ticketId: job.ticketId, error: message };
    }
    if (exhausted) {
      const reason = `Automatic epic continuation failed after ${job.attemptCount} attempts: ${message}`;
      db.transaction(() => {
        db.prepare(
          "UPDATE tickets SET is_blocked = 1, blocked_reason = ?, updated_at = ? WHERE id = ?"
        ).run(reason, now, job.ticketId);
        setAutonomousEpicLaunchActive(db, job.epicId, false, now);
        addComment(db, {
          ticketId: job.ticketId,
          content: `${reason}\n\nThe ticket remains in implementation so it can be resumed after the launch problem is repaired.`,
          author: "brain-dump",
          type: "progress",
          phase: "system_workflow",
          actorKind: "system",
          provider: "brain-dump",
        });
      })();
    }
    return {
      claimed: true,
      status: exhausted ? "dead" : "failed",
      ticketId: job.ticketId,
      error: message,
    };
  }
}

export async function drainEpicContinuations(
  db: DbHandle,
  options: Parameters<typeof runNextEpicContinuation>[1]
): Promise<{ processed: number; lastError: string | null }> {
  let processed = 0;
  let lastError: string | null = null;
  for (;;) {
    const result = await runNextEpicContinuation(db, options);
    if (!result.claimed) break;
    processed += 1;
    if (result.error) lastError = result.error;
    if (result.status === "failed") {
      await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs ?? 30_000));
    }
  }
  return { processed, lastError };
}
