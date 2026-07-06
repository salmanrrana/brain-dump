import { createServer, type Server } from "http";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import {
  listVerificationRuns,
  verificationTestInternals,
  verifyTicket,
  type VerificationRun,
} from "../verification.ts";
import {
  claimNextVerificationJob,
  enqueueVerificationJob,
  getVerificationJob,
  listVerificationJobs,
  settleVerificationJob,
} from "../verification-queue.ts";
import {
  getVerificationWorkerQueueStatus,
  runNextVerificationJob,
} from "../verification-worker.ts";
import type { DemoStep } from "../types.ts";

let db: Database.Database;
let server: Server | null = null;
let tempDir: string;
let previousXdgDataHome: string | undefined;

function seedProject(): void {
  db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
    "project-1",
    "Fixture",
    process.cwd(),
    new Date().toISOString()
  );
}

function seedTicket(status = "ai_verification"): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tickets (id, title, status, priority, position, project_id, created_at, updated_at)
     VALUES ('ticket-1', 'Verify me', ?, 'high', 1, 'project-1', ?, ?)`
  ).run(status, now, now);
  db.prepare(
    `INSERT INTO ticket_workflow_state
     (id, ticket_id, current_phase, review_iteration, findings_count, findings_fixed, demo_generated, created_at, updated_at)
     VALUES ('state-1', 'ticket-1', ?, 1, 0, 0, 1, ?, ?)`
  ).run(status, now, now);
}

function seedDemo(steps: DemoStep[]): void {
  db.prepare(
    `INSERT INTO demo_scripts (id, ticket_id, steps, generated_at)
     VALUES ('demo-1', 'ticket-1', ?, ?)`
  ).run(JSON.stringify(steps), new Date().toISOString());
}

function seedPassedVerificationRun(ticketId: string, gitSha: string): void {
  db.prepare(
    `INSERT INTO verification_runs (
      id,
      ticket_id,
      round,
      status,
      certified,
      manifest,
      git_sha,
      started_at,
      finished_at
    ) VALUES (?, ?, 1, 'passed', 1, ?, ?, ?, ?)`
  ).run(
    `run-${ticketId}`,
    ticketId,
    JSON.stringify({
      manifestHash: `manifest-${ticketId}`,
      evidenceFiles: [{ path: join(tempDir, `${ticketId}.json`), hash: "hash" }],
    }),
    gitSha,
    "2026-03-08T01:00:00.000Z",
    "2026-03-08T01:01:00.000Z"
  );
}

function apiStep(expectedStatus = 200): DemoStep {
  return {
    order: 1,
    description: "Call health endpoint",
    expectedOutcome: "API responds",
    type: "automated",
    automation: {
      kind: "api",
      request: { method: "GET", path: "/health" },
      assert: [
        { type: "status", expected: expectedStatus },
        { type: "bodyContains", expected: "ok" },
      ],
    },
  };
}

async function startFixtureServer(status = 200): Promise<string> {
  server = createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    response.writeHead(404);
    response.end("not found");
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing server address");
  return `http://127.0.0.1:${address.port}`;
}

beforeEach(() => {
  previousXdgDataHome = process.env.XDG_DATA_HOME;
  tempDir = mkdtempSync(join(tmpdir(), "brain-dump-verification-"));
  process.env.XDG_DATA_HOME = tempDir;
  db = createTestDatabase().db;
  seedProject();
  seedTicket();
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) {
      resolve();
      return;
    }
    server.close((error) => (error ? reject(error) : resolve()));
  });
  server = null;
  if (previousXdgDataHome === undefined) {
    delete process.env.XDG_DATA_HOME;
  } else {
    process.env.XDG_DATA_HOME = previousXdgDataHome;
  }
  rmSync(tempDir, { recursive: true, force: true });
});

describe("verifyTicket", () => {
  it("records a certified run and completes the ticket when all automation passes", async () => {
    seedDemo([apiStep()]);
    const baseUrl = await startFixtureServer();

    const run = await verifyTicket(db, { ticketId: "ticket-1", baseUrl });

    expect(run.status).toBe("passed");
    expect(run.certified).toBe(true);
    expect(run.round).toBe(1);
    expect(run.manifest.stepVerdicts).toHaveLength(1);
    expect(run.manifest.evidenceFiles[0]?.hash).toMatch(/^[a-f0-9]{64}$/);
    const ticket = db
      .prepare("SELECT status, completed_at FROM tickets WHERE id = 'ticket-1'")
      .get() as {
      status: string;
      completed_at: string | null;
    };
    expect(ticket.status).toBe("done");
    expect(ticket.completed_at).toBeTruthy();
    const comment = db
      .prepare("SELECT author, type FROM ticket_comments WHERE ticket_id = 'ticket-1'")
      .get() as { author: string; type: string };
    expect(comment).toEqual({ author: "unknown ralph", type: "verification_report" });
  });

  it("returns the epic auto-PR result after the final certified epic ticket completes", async () => {
    seedDemo([apiStep()]);
    const now = new Date().toISOString();
    db.prepare("INSERT INTO epics (id, title, project_id, created_at) VALUES (?, ?, ?, ?)").run(
      "epic-1",
      "Verification Epic",
      "project-1",
      now
    );
    db.prepare("UPDATE tickets SET epic_id = ?, branch_name = ? WHERE id = 'ticket-1'").run(
      "epic-1",
      "feature/verification-epic"
    );
    db.prepare(
      `INSERT INTO tickets (id, title, status, priority, position, project_id, epic_id, branch_name, created_at, updated_at)
       VALUES (?, ?, 'done', 'high', 2, 'project-1', 'epic-1', ?, ?, ?)`
    ).run("ticket-2", "Already verified", "feature/verification-epic", now, now);
    seedPassedVerificationRun("ticket-2", "sha222");
    const baseUrl = await startFixtureServer();
    const calls: Array<[string, ...string[]]> = [];

    const run = await verifyTicket(db, {
      ticketId: "ticket-1",
      baseUrl,
      execFileNoThrow: async (command, args) => {
        calls.push([command, ...args]);
        if (command === "git" && args.join(" ") === "rev-parse HEAD") {
          return { success: true, stdout: "sha111\n", stderr: "", exitCode: 0 };
        }
        if (command === "git" && args.join(" ") === "status --short") {
          return { success: true, stdout: "", stderr: "", exitCode: 0 };
        }
        if (command === "gh" && args[0] === "pr" && args[1] === "list") {
          return { success: true, stdout: "[]", stderr: "", exitCode: 0 };
        }
        if (command === "gh" && args[0] === "pr" && args[1] === "create") {
          return {
            success: true,
            stdout: "https://github.com/org/repo/pull/91\n",
            stderr: "",
            exitCode: 0,
          };
        }
        return { success: true, stdout: "", stderr: "", exitCode: 0 };
      },
    });

    expect(run.status).toBe("passed");
    expect(run.epicAutoPr?.branchResults[0]).toMatchObject({
      success: true,
      action: "created",
      prNumber: 91,
    });
    expect(calls).toContainEqual(["git", "push", "-u", "origin", "feature/verification-epic"]);
  });

  function moveTicketBackToVerification(): void {
    const now = new Date().toISOString();
    db.prepare(
      "UPDATE tickets SET status = 'ai_verification', updated_at = ? WHERE id = 'ticket-1'"
    ).run(now);
    db.prepare(
      "UPDATE ticket_workflow_state SET current_phase = 'ai_verification', updated_at = ? WHERE ticket_id = 'ticket-1'"
    ).run(now);
  }

  it("files verification findings and returns failed rounds to implementation", async () => {
    seedDemo([apiStep(201), apiStep(201)]);
    const baseUrl = await startFixtureServer();

    const firstRun = await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
    moveTicketBackToVerification();
    const secondRun = await verifyTicket(db, { ticketId: "ticket-1", baseUrl });

    expect(firstRun.status).toBe("failed");
    expect(secondRun.round).toBe(2);
    expect(secondRun.manifest.stepVerdicts).toHaveLength(2);
    const ticket = db
      .prepare("SELECT status, completed_at FROM tickets WHERE id = 'ticket-1'")
      .get() as {
      status: string;
      completed_at: string | null;
    };
    expect(ticket.status).toBe("in_progress");
    expect(ticket.completed_at).toBeNull();
    const findings = db
      .prepare(
        "SELECT severity, category, description, status FROM review_findings WHERE ticket_id = 'ticket-1' ORDER BY created_at"
      )
      .all() as Array<{ severity: string; category: string; description: string; status: string }>;
    expect(findings).toHaveLength(4);
    expect(findings[0]).toMatchObject({
      severity: "major",
      category: "verification",
      status: "open",
    });
    expect(findings[0]?.description).toContain("expected status 201, got 200");
    expect(listVerificationRuns(db, "ticket-1").map((run) => run.round)).toEqual([2, 1]);
  });

  it("blocks after three consecutive failures on the same step", async () => {
    seedDemo([apiStep(201)]);
    const baseUrl = await startFixtureServer();

    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
    moveTicketBackToVerification();
    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
    moveTicketBackToVerification();
    const thirdRun = await verifyTicket(db, { ticketId: "ticket-1", baseUrl });

    expect(thirdRun.status).toBe("failed");
    const ticket = db
      .prepare("SELECT status, is_blocked, blocked_reason FROM tickets WHERE id = 'ticket-1'")
      .get() as { status: string; is_blocked: number; blocked_reason: string | null };
    expect(ticket.status).toBe("ai_verification");
    expect(ticket.is_blocked).toBe(1);
    expect(ticket.blocked_reason).toContain("3 consecutive times on step 1");
    const comment = db
      .prepare(
        "SELECT content FROM ticket_comments WHERE ticket_id = 'ticket-1' AND type = 'comment'"
      )
      .get() as { content: string };
    expect(comment.content).toContain("Needs Attention");
  });

  it("does not crash loop-back when a prior failed run has a malformed manifest", async () => {
    seedDemo([apiStep(201)]);
    const baseUrl = await startFixtureServer();

    const firstRun = await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
    db.prepare("UPDATE verification_runs SET manifest = '{bad json' WHERE id = ?").run(firstRun.id);
    moveTicketBackToVerification();
    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
    moveTicketBackToVerification();
    const thirdRun = await verifyTicket(db, { ticketId: "ticket-1", baseUrl });

    expect(thirdRun.status).toBe("failed");
    const ticket = db
      .prepare("SELECT status, is_blocked FROM tickets WHERE id = 'ticket-1'")
      .get() as { status: string; is_blocked: number };
    expect(ticket.status).toBe("in_progress");
    expect(ticket.is_blocked).toBe(0);
  });

  it("leaves manual-only demos uncertified and visibly blocked", async () => {
    seedDemo([
      {
        order: 1,
        description: "Manual inspection",
        expectedOutcome: "Human can inspect",
        type: "manual",
      },
    ]);
    const baseUrl = await startFixtureServer();

    const run = await verifyTicket(db, { ticketId: "ticket-1", baseUrl });

    expect(run.status).toBe("uncertified");
    const ticket = db
      .prepare("SELECT status, is_blocked, blocked_reason FROM tickets WHERE id = 'ticket-1'")
      .get() as { status: string; is_blocked: number; blocked_reason: string | null };
    expect(ticket.status).toBe("ai_verification");
    expect(ticket.is_blocked).toBe(1);
    expect(ticket.blocked_reason).toContain("uncertified");
  });

  it("marks runs uncertified when verification code changed", async () => {
    seedDemo([apiStep()]);
    const baseUrl = await startFixtureServer();

    const run = await verifyTicket(db, {
      ticketId: "ticket-1",
      baseUrl,
      execFileNoThrow: async (command, args) => {
        if (command === "git" && args.join(" ") === "rev-parse HEAD") {
          return { success: true, stdout: "abc123\n", stderr: "", exitCode: 0 };
        }
        return {
          success: true,
          stdout: " M core/verification.ts\n",
          stderr: "",
          exitCode: 0,
        };
      },
    });

    expect(run.status).toBe("uncertified");
    expect(run.manifest.stepVerdicts.at(-1)?.message).toContain("verification/manifest code");
    const ticket = db
      .prepare("SELECT status, is_blocked FROM tickets WHERE id = 'ticket-1'")
      .get() as { status: string; is_blocked: number };
    expect(ticket.status).toBe("ai_verification");
    expect(ticket.is_blocked).toBe(1);
  });

  it("refuses to report certified evidence when an expected evidence file is missing", () => {
    const now = new Date().toISOString();
    const missingPath = join(tempDir, "missing-api.json");
    const run: VerificationRun = {
      id: "run-missing-evidence",
      ticketId: "ticket-1",
      round: 1,
      status: "passed",
      certified: true,
      gitSha: "abc123",
      startedAt: now,
      finishedAt: now,
      manifest: {
        runId: "run-missing-evidence",
        ticketId: "ticket-1",
        round: 1,
        status: "passed",
        certified: true,
        gitSha: "abc123",
        dirty: false,
        port: 4242,
        bootCommand: [],
        bootLog: "",
        startedAt: now,
        finishedAt: now,
        stepVerdicts: [
          {
            order: 1,
            status: "passed",
            message: "API assertions passed.",
            durationMs: 12,
            evidenceFiles: [{ path: missingPath, hash: "missing-hash" }],
          },
        ],
        evidenceFiles: [{ path: missingPath, hash: "missing-hash" }],
        manifestHash: "manifest-hash",
      },
    };

    expect(() => verificationTestInternals.attachRunEvidenceAndReport(db, run, "claude")).toThrow(
      /evidence file is missing/
    );

    const comments = db
      .prepare("SELECT COUNT(*) as count FROM ticket_comments WHERE ticket_id = 'ticket-1'")
      .get() as { count: number };
    expect(comments.count).toBe(0);
  });
});

describe("verification queue", () => {
  it("enqueues one durable pending job per ticket and refreshes duplicates", () => {
    seedDemo([apiStep()]);

    const first = enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:00:00.000Z" });
    const second = enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:01:00.000Z" });

    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({
      ticketId: "ticket-1",
      demoScriptId: "demo-1",
      status: "queued",
      attemptCount: 0,
      nextRunAt: "2026-03-08T01:01:00.000Z",
    });
    expect(listVerificationJobs(db)).toHaveLength(1);
  });

  it("leases one queued job to one worker", () => {
    seedDemo([apiStep()]);
    enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:00:00.000Z" });

    const claimed = claimNextVerificationJob(db, {
      workerId: "worker-1",
      now: "2026-03-08T01:00:01.000Z",
      leaseMs: 60_000,
    });
    const secondClaim = claimNextVerificationJob(db, {
      workerId: "worker-2",
      now: "2026-03-08T01:00:02.000Z",
      leaseMs: 60_000,
    });

    expect(claimed).toMatchObject({
      status: "running",
      leasedBy: "worker-1",
      attemptCount: 1,
    });
    expect(secondClaim).toBeNull();
  });

  it("recovers expired running leases after restart", () => {
    seedDemo([apiStep()]);
    enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:00:00.000Z" });
    claimNextVerificationJob(db, {
      workerId: "worker-1",
      now: "2026-03-08T01:00:01.000Z",
      leaseMs: 1_000,
    });

    const recovered = claimNextVerificationJob(db, {
      workerId: "worker-2",
      now: "2026-03-08T01:00:03.000Z",
      leaseMs: 60_000,
    });

    expect(recovered).toMatchObject({
      status: "running",
      leasedBy: "worker-2",
      attemptCount: 2,
    });
  });

  it("supports retry scheduling without making failed jobs immediately runnable", () => {
    seedDemo([apiStep()]);
    const job = enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:00:00.000Z" });
    const claimed = claimNextVerificationJob(db, {
      workerId: "worker-1",
      now: "2026-03-08T01:00:01.000Z",
      leaseMs: 60_000,
    });

    settleVerificationJob(db, {
      jobId: job.id,
      workerId: "worker-1",
      attemptCount: claimed!.attemptCount,
      status: "failed",
      error: "boot failed",
      nextRunAt: "2026-03-08T01:05:00.000Z",
      now: "2026-03-08T01:00:02.000Z",
    });

    expect(
      claimNextVerificationJob(db, {
        workerId: "worker-2",
        now: "2026-03-08T01:04:59.000Z",
        leaseMs: 60_000,
      })
    ).toBeNull();
    expect(
      claimNextVerificationJob(db, {
        workerId: "worker-2",
        now: "2026-03-08T01:05:00.000Z",
        leaseMs: 60_000,
      })
    ).toMatchObject({ status: "running", leasedBy: "worker-2", attemptCount: 2 });
    expect(getVerificationJob(db, "ticket-1")?.lastError).toBe("boot failed");
  });

  it("rejects stale workers settling leases they no longer own", () => {
    seedDemo([apiStep()]);
    const job = enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:00:00.000Z" });
    const firstClaim = claimNextVerificationJob(db, {
      workerId: "worker-1",
      now: "2026-03-08T01:00:01.000Z",
      leaseMs: 1_000,
    });
    claimNextVerificationJob(db, {
      workerId: "worker-2",
      now: "2026-03-08T01:00:03.000Z",
      leaseMs: 60_000,
    });

    expect(() =>
      settleVerificationJob(db, {
        jobId: job.id,
        workerId: "worker-1",
        attemptCount: firstClaim!.attemptCount,
        status: "succeeded",
        now: "2026-03-08T01:00:04.000Z",
      })
    ).toThrow(/not leased by worker-1/);
    expect(getVerificationJob(db, "ticket-1")).toMatchObject({
      status: "running",
      leasedBy: "worker-2",
      attemptCount: 2,
    });
  });

  it("does not claim queued jobs after the ticket leaves ai_verification", () => {
    seedDemo([apiStep()]);
    enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:00:00.000Z" });
    db.prepare("UPDATE tickets SET status = 'in_progress' WHERE id = 'ticket-1'").run();

    expect(
      claimNextVerificationJob(db, {
        workerId: "worker-1",
        now: "2026-03-08T01:00:01.000Z",
        leaseMs: 60_000,
      })
    ).toBeNull();
  });

  it("does not refresh an unexpired running lease", () => {
    seedDemo([apiStep()]);
    enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:00:00.000Z" });
    claimNextVerificationJob(db, {
      workerId: "worker-1",
      now: "2026-03-08T01:00:01.000Z",
      leaseMs: 60_000,
    });

    expect(() =>
      enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:00:02.000Z" })
    ).toThrow(/active verification lease/);
  });
});

describe("verification worker", () => {
  it("claims a queued job and verifies it without a per-ticket command", async () => {
    seedDemo([apiStep()]);
    enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:00:00.000Z" });
    const baseUrl = await startFixtureServer();

    const result = await runNextVerificationJob(db, {
      workerId: "worker-1",
      baseUrl,
      now: () => new Date("2026-03-08T01:00:01.000Z"),
    });

    expect(result).toMatchObject({
      claimed: true,
      ticketId: "ticket-1",
      runStatus: "passed",
      jobStatus: "succeeded",
    });
    expect(getVerificationJob(db, "ticket-1")).toMatchObject({
      status: "succeeded",
      leasedBy: null,
    });
    expect(db.prepare("SELECT status FROM tickets WHERE id = 'ticket-1'").get()).toMatchObject({
      status: "done",
    });
  });

  it("does not claim a second job while the first lease is active", async () => {
    seedDemo([apiStep()]);
    enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:00:00.000Z" });

    const first = claimNextVerificationJob(db, {
      workerId: "worker-1",
      now: "2026-03-08T01:00:01.000Z",
      leaseMs: 60_000,
    });
    const result = await runNextVerificationJob(db, {
      workerId: "worker-2",
      now: () => new Date("2026-03-08T01:00:02.000Z"),
    });

    expect(first).toMatchObject({ leasedBy: "worker-1" });
    expect(result).toEqual({ claimed: false, workerId: "worker-2" });
  });

  it("rejects verification settlement from a worker that lost its lease", async () => {
    seedDemo([apiStep()]);
    const job = enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:00:00.000Z" });
    const staleClaim = claimNextVerificationJob(db, {
      workerId: "worker-1",
      now: "2026-03-08T01:00:01.000Z",
      leaseMs: 1_000,
    });
    claimNextVerificationJob(db, {
      workerId: "worker-2",
      now: "2026-03-08T01:00:03.000Z",
      leaseMs: 60_000,
    });
    const baseUrl = await startFixtureServer();

    await expect(
      verifyTicket(db, {
        ticketId: "ticket-1",
        baseUrl,
        verificationJobLease: {
          jobId: job.id,
          workerId: "worker-1",
          attemptCount: staleClaim!.attemptCount,
        },
      })
    ).rejects.toThrow(/not leased by worker-1/);
    expect(getVerificationJob(db, "ticket-1")).toMatchObject({
      status: "running",
      leasedBy: "worker-2",
      attemptCount: 2,
    });
    expect(db.prepare("SELECT status FROM tickets WHERE id = 'ticket-1'").get()).toMatchObject({
      status: "ai_verification",
    });
  });

  it("retries worker infrastructure errors before blocking loudly", async () => {
    seedDemo([apiStep()]);
    enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:00:00.000Z" });

    const result = await runNextVerificationJob(db, {
      workerId: "worker-1",
      maxInfraAttempts: 2,
      retryDelayMs: 60_000,
      now: () => new Date("2026-03-08T01:00:01.000Z"),
      verifyTicketFn: async () => {
        throw new Error("boot crashed");
      },
    });

    expect(result).toMatchObject({
      claimed: true,
      jobStatus: "failed",
      retryAt: "2026-03-08T01:01:01.000Z",
      error: "boot crashed",
    });
    expect(getVerificationJob(db, "ticket-1")).toMatchObject({
      status: "failed",
      lastError: "boot crashed",
      completedAt: null,
    });
    expect(db.prepare("SELECT is_blocked FROM tickets WHERE id = 'ticket-1'").get()).toMatchObject({
      is_blocked: 0,
    });
  });

  it("blocks loudly after worker infrastructure retries are exhausted", async () => {
    seedDemo([apiStep()]);
    enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:00:00.000Z" });
    claimNextVerificationJob(db, {
      workerId: "worker-1",
      now: "2026-03-08T01:00:01.000Z",
      leaseMs: 1_000,
    });

    const result = await runNextVerificationJob(db, {
      workerId: "worker-2",
      maxInfraAttempts: 2,
      now: () => new Date("2026-03-08T01:00:03.000Z"),
      verifyTicketFn: async () => {
        throw new Error("boot crashed again");
      },
    });

    expect(result).toMatchObject({
      claimed: true,
      attemptCount: 2,
      jobStatus: "blocked",
      error: "boot crashed again",
    });
    expect(getVerificationJob(db, "ticket-1")).toMatchObject({
      status: "blocked",
      lastError: "Automatic verification worker failed: boot crashed again",
    });
    expect(
      db.prepare("SELECT is_blocked, blocked_reason FROM tickets WHERE id = 'ticket-1'").get()
    ).toMatchObject({
      is_blocked: 1,
      blocked_reason: "Automatic verification worker failed: boot crashed again",
    });
  });

  it("reports queue health for operator diagnostics", () => {
    seedDemo([apiStep()]);
    enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:00:00.000Z" });

    expect(getVerificationWorkerQueueStatus(db)).toMatchObject({
      queueDepth: 1,
      byStatus: { queued: 1 },
      oldestQueuedAt: "2026-03-08T01:00:00.000Z",
    });
  });
});
