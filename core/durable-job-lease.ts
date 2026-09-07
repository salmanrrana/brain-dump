import type { DbHandle } from "./types.ts";
import { ValidationError } from "./errors.ts";

export interface DurableJobLeaseOptions<Row, Job> {
  tableName: string;
  selectReadySql: string;
  selectReadyArgs: unknown[];
  selectClaimedSql?: string;
  claimWhereSql: string;
  claimWhereArgs: (row: Row) => unknown[];
  workerId: string;
  leaseExpiresAt: string;
  now: string;
  toJob: (row: Row) => Job;
}

export interface SettleDurableJobLeaseOptions<Row, Job> {
  tableName: string;
  jobId: string;
  workerId: string;
  attemptCount: number;
  status: string;
  nextRunAt: string;
  error: string | null;
  completedAt: string | null;
  now: string;
  notLeasedMessage: string;
  selectSettledSql?: string;
  toJob: (row: Row) => Job;
}

function assertSafeIdentifier(identifier: string): void {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new ValidationError(`Unsafe durable job table identifier: ${identifier}`);
  }
}

function getChanges(db: DbHandle): number {
  return (db.prepare("SELECT changes() AS changes").get() as { changes: number }).changes;
}

export function claimDurableJobLease<Row extends { id: string }, Job>(
  db: DbHandle,
  options: DurableJobLeaseOptions<Row, Job>
): Job | null {
  assertSafeIdentifier(options.tableName);

  const claim = db.transaction(() => {
    const row = db.prepare(options.selectReadySql).get(...options.selectReadyArgs) as
      | Row
      | undefined;
    if (!row) return null;

    db.prepare(
      `UPDATE ${options.tableName}
       SET status = 'running', attempt_count = attempt_count + 1, leased_by = ?,
           lease_expires_at = ?, updated_at = ?
       WHERE id = ? AND (${options.claimWhereSql})`
    ).run(
      options.workerId,
      options.leaseExpiresAt,
      options.now,
      row.id,
      ...options.claimWhereArgs(row)
    );

    if (getChanges(db) !== 1) return null;

    const claimed = db
      .prepare(options.selectClaimedSql ?? `SELECT * FROM ${options.tableName} WHERE id = ?`)
      .get(row.id) as Row;
    return options.toJob(claimed);
  });

  return claim.immediate();
}

export function settleDurableJobLease<Row, Job>(
  db: DbHandle,
  options: SettleDurableJobLeaseOptions<Row, Job>
): Job {
  assertSafeIdentifier(options.tableName);

  const settle = db.transaction(() => {
    db.prepare(
      `UPDATE ${options.tableName}
       SET status = ?, next_run_at = ?, last_error = ?, leased_by = NULL,
           lease_expires_at = NULL, completed_at = ?, updated_at = ?
       WHERE id = ? AND status = 'running' AND leased_by = ? AND attempt_count = ?`
    ).run(
      options.status,
      options.nextRunAt,
      options.error,
      options.completedAt,
      options.now,
      options.jobId,
      options.workerId,
      options.attemptCount
    );

    if (getChanges(db) !== 1) {
      throw new ValidationError(options.notLeasedMessage);
    }

    const row = db
      .prepare(options.selectSettledSql ?? `SELECT * FROM ${options.tableName} WHERE id = ?`)
      .get(options.jobId) as Row | undefined;
    if (!row) throw new ValidationError(`Durable job ${options.jobId} was not found.`);
    return options.toJob(row);
  });

  return settle.immediate();
}
