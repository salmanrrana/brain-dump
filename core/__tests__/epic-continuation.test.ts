import { beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import {
  claimNextEpicContinuation,
  enqueueEpicContinuationForTicket,
  runNextEpicContinuation,
  saveAutonomousEpicLaunch,
  setAutonomousEpicLaunchActive,
} from "../epic-continuation.ts";

describe("durable epic continuation", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase().db;
    const now = "2026-07-18T00:00:00.000Z";
    db.prepare(
      "INSERT INTO projects (id, name, path, created_at) VALUES ('p', 'P', '/tmp/p', ?)"
    ).run(now);
    db.prepare(
      "INSERT INTO epics (id, title, project_id, created_at) VALUES ('e', 'E', 'p', ?)"
    ).run(now);
    db.prepare(
      `INSERT INTO tickets (id, title, status, position, project_id, epic_id, created_at, updated_at)
       VALUES ('failed-ticket', 'Failed', 'in_progress', 1, 'p', 'e', ?, ?),
              ('next-ticket', 'Next', 'ready', 2, 'p', 'e', ?, ?)`
    ).run(now, now, now, now);
  });

  it("enqueues only active autonomous launches and coalesces by epic", () => {
    expect(enqueueEpicContinuationForTicket(db, "failed-ticket")).toBeNull();
    saveAutonomousEpicLaunch(db, {
      epicId: "e",
      projectPath: "/tmp/p",
      scriptPath: "/tmp/ralph.sh",
      maxIterations: 7,
      provider: "codex",
    });

    const first = enqueueEpicContinuationForTicket(db, "failed-ticket")!;
    const second = enqueueEpicContinuationForTicket(db, "failed-ticket")!;
    expect(second.id).toBe(first.id);
    expect(second.profile.provider).toBe("codex");
    expect(db.prepare("SELECT count(*) count FROM epic_continuation_jobs").get()).toEqual({
      count: 1,
    });

    setAutonomousEpicLaunchActive(db, "e", false);
    db.prepare("DELETE FROM epic_continuation_jobs").run();
    expect(enqueueEpicContinuationForTicket(db, "failed-ticket")).toBeNull();
  });

  it("replaces a stale running continuation whose target ticket is already done", () => {
    saveAutonomousEpicLaunch(db, {
      epicId: "e",
      projectPath: "/tmp/p",
      scriptPath: "/tmp/ralph.sh",
      maxIterations: 7,
    });
    const now = "2026-07-18T00:00:00.000Z";
    db.prepare("UPDATE tickets SET status = 'done' WHERE id = 'next-ticket'").run();
    db.prepare(
      `INSERT INTO epic_continuation_jobs
         (id, epic_id, ticket_id, status, attempt_count, next_run_at, leased_by, lease_expires_at, created_at, updated_at)
       VALUES ('stale-job', 'e', 'next-ticket', 'running', 1, ?, 'dead-worker', '2099-01-01T00:00:00.000Z', ?, ?)`
    ).run(now, now, now);

    const job = enqueueEpicContinuationForTicket(db, "failed-ticket", now)!;

    expect(job.ticketId).toBe("failed-ticket");
    expect(job.status).toBe("queued");
    expect(db.prepare("SELECT count(*) count FROM epic_continuation_jobs").get()).toEqual({
      count: 1,
    });
  });

  it("claim reconciliation leaves a live-leased running row alone even when its ticket is done", () => {
    saveAutonomousEpicLaunch(db, {
      epicId: "e",
      projectPath: "/tmp/p",
      scriptPath: "/tmp/ralph.sh",
      maxIterations: 7,
    });
    const now = "2026-07-18T00:00:00.000Z";
    db.prepare("UPDATE tickets SET status = 'done' WHERE id = 'next-ticket'").run();
    db.prepare(
      `INSERT INTO epic_continuation_jobs
         (id, epic_id, ticket_id, status, attempt_count, next_run_at, leased_by, lease_expires_at, created_at, updated_at)
       VALUES ('live-job', 'e', 'next-ticket', 'running', 1, ?, 'live-worker', '2099-01-01T00:00:00.000Z', ?, ?)`
    ).run(now, now, now);

    expect(claimNextEpicContinuation(db, { workerId: "other-worker", now })).toBeNull();

    expect(
      db.prepare("SELECT status, leased_by FROM epic_continuation_jobs WHERE id = 'live-job'").get()
    ).toEqual({ status: "running", leased_by: "live-worker" });
  });

  it("claim reconciliation settles an expired-lease running row for a done ticket", () => {
    saveAutonomousEpicLaunch(db, {
      epicId: "e",
      projectPath: "/tmp/p",
      scriptPath: "/tmp/ralph.sh",
      maxIterations: 7,
    });
    const now = "2026-07-18T12:00:00.000Z";
    db.prepare("UPDATE tickets SET status = 'done' WHERE id = 'next-ticket'").run();
    db.prepare(
      `INSERT INTO epic_continuation_jobs
         (id, epic_id, ticket_id, status, attempt_count, next_run_at, leased_by, lease_expires_at, created_at, updated_at)
       VALUES ('orphan-job', 'e', 'next-ticket', 'running', 1, ?, 'dead-worker', '2026-07-18T00:30:00.000Z', ?, ?)`
    ).run("2026-07-18T00:00:00.000Z", "2026-07-18T00:00:00.000Z", "2026-07-18T00:00:00.000Z");

    expect(claimNextEpicContinuation(db, { workerId: "other-worker", now })).toBeNull();

    expect(
      db.prepare("SELECT status, completed_at FROM epic_continuation_jobs WHERE id = 'orphan-job'").get()
    ).toMatchObject({ status: "succeeded", completed_at: now });
  });

  it("does not clobber a running continuation whose target ticket is still in progress", () => {
    saveAutonomousEpicLaunch(db, {
      epicId: "e",
      projectPath: "/tmp/p",
      scriptPath: "/tmp/ralph.sh",
      maxIterations: 7,
    });
    const now = "2026-07-18T00:00:00.000Z";
    db.prepare("UPDATE tickets SET status = 'in_progress' WHERE id = 'next-ticket'").run();
    db.prepare(
      `INSERT INTO epic_continuation_jobs
         (id, epic_id, ticket_id, status, attempt_count, next_run_at, leased_by, lease_expires_at, created_at, updated_at)
       VALUES ('live-job', 'e', 'next-ticket', 'running', 1, ?, 'live-worker', '2099-01-01T00:00:00.000Z', ?, ?)`
    ).run(now, now, now);

    const job = enqueueEpicContinuationForTicket(db, "failed-ticket", now)!;

    expect(job.id).toBe("live-job");
    expect(job.ticketId).toBe("next-ticket");
    expect(job.status).toBe("running");
  });

  it("leases and launches the failed in_progress ticket without promoting its sibling", async () => {
    saveAutonomousEpicLaunch(db, {
      epicId: "e",
      projectPath: "/tmp/p",
      scriptPath: "/tmp/ralph.sh",
      maxIterations: 7,
    });
    enqueueEpicContinuationForTicket(db, "failed-ticket", "2026-07-18T00:00:00.000Z");
    const launch = vi.fn().mockResolvedValue(undefined);

    const result = await runNextEpicContinuation(db, {
      workerId: "worker-1",
      now: () => new Date("2026-07-18T00:00:01.000Z"),
      launch,
    });

    expect(result).toMatchObject({ claimed: true, status: "succeeded", ticketId: "failed-ticket" });
    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({ epicId: "e", projectPath: "/tmp/p", scriptPath: "/tmp/ralph.sh" }),
      "failed-ticket"
    );
    expect(db.prepare("SELECT status FROM tickets WHERE id = 'next-ticket'").get()).toEqual({
      status: "ready",
    });
  });

  it("reclaims expired leases and stops after a bounded number of launch failures", async () => {
    saveAutonomousEpicLaunch(db, {
      epicId: "e",
      projectPath: "/tmp/p",
      scriptPath: "/tmp/ralph.sh",
      maxIterations: 7,
    });
    enqueueEpicContinuationForTicket(db, "failed-ticket", "2026-07-18T00:00:00.000Z");
    const launch = vi.fn().mockRejectedValue(new Error("spawn failed"));

    const abandoned = claimNextEpicContinuation(db, {
      workerId: "abandoned-worker",
      now: "2026-07-18T00:00:01.000Z",
      leaseMs: 1_000,
    });
    expect(abandoned?.status).toBe("running");

    for (let attempt = 2; attempt <= 3; attempt += 1) {
      const result = await runNextEpicContinuation(db, {
        workerId: `worker-${attempt}`,
        now: () => new Date(`2026-07-18T00:00:0${attempt}.000Z`),
        retryDelayMs: 0,
        maxAttempts: 3,
        launch,
      });
      expect(result.status).toBe(attempt === 3 ? "dead" : "failed");
    }
    expect(launch).toHaveBeenCalledTimes(2);
    expect(
      db.prepare("SELECT is_blocked, blocked_reason FROM tickets WHERE id = 'failed-ticket'").get()
    ).toMatchObject({ is_blocked: 1, blocked_reason: expect.stringContaining("spawn failed") });
    expect(
      db.prepare("SELECT active FROM autonomous_epic_launches WHERE epic_id = 'e'").get()
    ).toEqual({ active: 0 });
    expect(
      db.prepare("SELECT content FROM ticket_comments WHERE ticket_id = 'failed-ticket'").get()
    ).toMatchObject({ content: expect.stringContaining("failed after 3 attempts") });
  });

  it("quarantines a malformed persisted launch profile instead of poisoning the worker", () => {
    saveAutonomousEpicLaunch(db, {
      epicId: "e",
      projectPath: "/tmp/p",
      scriptPath: "/tmp/ralph.sh",
      maxIterations: 7,
    });
    enqueueEpicContinuationForTicket(db, "failed-ticket");
    db.prepare(
      "UPDATE autonomous_epic_launches SET profile_json = 'not-json' WHERE epic_id = 'e'"
    ).run();

    expect(claimNextEpicContinuation(db, { workerId: "worker" })).toBeNull();
    expect(
      db.prepare("SELECT status FROM epic_continuation_jobs WHERE epic_id = 'e'").get()
    ).toEqual({
      status: "dead",
    });
    expect(db.prepare("SELECT is_blocked FROM tickets WHERE id = 'failed-ticket'").get()).toEqual({
      is_blocked: 1,
    });
  });
});
