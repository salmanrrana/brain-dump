/**
 * End-to-end proof of the AI verification loop (epic completion gate).
 *
 * Drives a sample epic through the complete lifecycle using the REAL core
 * functions and the REAL production schema (createTestDatabase runs the full
 * migrations) — no hand-rolled schema, no reimplemented tool logic:
 *
 *   start-work → complete-work → ai_review findings → generate-demo with
 *   automation specs → verification run against a running fixture app (an
 *   in-process http.Server injected via baseUrl; the runner's process-spawn
 *   boot path is deliberately out of scope to keep this CI gate hermetic) →
 *   forced assertion failure → loop-back (finding filed, status in_progress,
 *   Ralph context contains the failure section) → fix → re-verify full suite
 *   passes → runner sets done with evidence + sealed manifest → last ticket
 *   done fires epic completion → PR created automatically.
 *
 * Zero human interaction: no submit-feedback, no change_request comments, no
 * manual status flips. Only the runner (verifyTicket) moves the ticket to done.
 *
 * The "automatic verification worker" block proves the same loop through the
 * durable queue: generate-demo enqueues, one-shot drains lease and execute,
 * crashed leases are re-leased after expiry, and no step needs a human to run
 * a manual `brain-dump verify` command.
 *
 * This file runs as part of `pnpm check` (see the test:verification-loop
 * script) because it is the epic's completion gate.
 */
import { createServer, type Server } from "http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../core/db.ts";
import { completeWork, startWork } from "../core/workflow.ts";
import { checkComplete, generateDemo, markFixed, submitFinding } from "../core/review.ts";
import { addComment } from "../core/comment.ts";
import {
  computeManifestIntegrity,
  listVerificationRuns,
  verifyTicket,
} from "../core/verification.ts";
import {
  claimNextVerificationJob,
  getVerificationJob,
  settleVerificationJob,
} from "../core/verification-queue.ts";
import {
  drainVerificationQueue,
  getVerificationWorkerQueueStatus,
  runNextVerificationJob,
} from "../core/verification-worker.ts";
import { getVerificationFailuresByTicketId } from "../src/lib/ralph-launch/change-request-context.ts";
import type { DemoStep, GitCommandResult, GitOperations } from "../core/types.ts";

const LIVE_TICKET = "ticket-live";
const DONE_TICKET = "ticket-done";
const EPIC_ID = "epic-verify";
const PROVIDER = "claude";

let db: Database.Database;
let server: Server | null = null;
let tempDir: string;
let previousXdgDataHome: string | undefined;

function createMockGit(existingBranches: string[] = ["main"]): GitOperations {
  const branches = new Set(existingBranches);

  return {
    run(command: string): GitCommandResult {
      if (command.includes("rev-parse --git-dir")) return { success: true, output: ".git" };
      if (command.includes("git log")) return { success: true, output: "abc1234 feat: fixture" };
      if (command.includes("--name-only")) return { success: true, output: "src/fixture.ts" };
      return { success: true, output: "" };
    },
    branchExists(branch: string): boolean {
      return branches.has(branch);
    },
    checkout(): GitCommandResult {
      return { success: true, output: "" };
    },
    createBranch(branch: string): GitCommandResult {
      branches.add(branch);
      return { success: true, output: "" };
    },
  };
}

type ExecCall = [string, ...string[]];

/** execFileNoThrow stub: clean git tree by default, gh returns a fresh PR. */
function createExecStub(options: { dirtyFiles?: string } = {}) {
  const calls: ExecCall[] = [];
  const stub = async (command: string, args: string[]) => {
    calls.push([command, ...args]);
    if (command === "git" && args.join(" ") === "rev-parse HEAD") {
      return { success: true, stdout: "e2e-sha-111\n", stderr: "", exitCode: 0 };
    }
    if (command === "git" && args.join(" ") === "status --short") {
      return { success: true, stdout: options.dirtyFiles ?? "", stderr: "", exitCode: 0 };
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
  };
  return { calls, stub };
}

function seedProjectAndEpic(): void {
  const now = new Date().toISOString();
  db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
    "project-1",
    "Fixture Project",
    tempDir,
    now
  );
  db.prepare("INSERT INTO epics (id, title, project_id, created_at) VALUES (?, ?, ?, ?)").run(
    EPIC_ID,
    "Verification Loop Epic",
    "project-1",
    now
  );
}

function seedTicket(id: string, status: string, epicId: string | null = EPIC_ID): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tickets (id, title, status, priority, position, project_id, epic_id, created_at, updated_at)
     VALUES (?, ?, ?, 'high', 1, 'project-1', ?, ?, ?)`
  ).run(id, `Ticket ${id}`, status, epicId, now, now);
}

/** Sibling epic ticket that already passed verification, so completing the
 *  live ticket makes the epic fully done and fires the auto-PR. */
function seedVerifiedDoneTicket(branchName: string): void {
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE tickets SET status = 'done', branch_name = ?, updated_at = ? WHERE id = ?"
  ).run(branchName, now, DONE_TICKET);
  db.prepare(
    `INSERT INTO verification_runs (id, ticket_id, round, status, certified, manifest, git_sha, started_at, finished_at)
     VALUES ('run-done-ticket', ?, 1, 'passed', 1, ?, 'sha-done', ?, ?)`
  ).run(
    DONE_TICKET,
    JSON.stringify({
      manifestHash: "manifest-done-ticket",
      evidenceFiles: [{ path: join(tempDir, "done-evidence.json"), hash: "hash" }],
    }),
    now,
    now
  );
}

function addTestReport(ticketId: string): void {
  addComment(db, {
    ticketId,
    content: "pnpm check: pass (type-check, lint, vitest)",
    author: "ralph",
    type: "test_report",
  });
}

function apiStep(order: number, expectedStatus: number): DemoStep {
  return {
    order,
    description: `Call fixture endpoint ${order}`,
    expectedOutcome: `Endpoint responds with ${expectedStatus}`,
    type: "automated",
    app: { start: ["node", "verification-server.mjs", "{port}"] },
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

async function startFixtureServer(): Promise<string> {
  server = createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    response.writeHead(404);
    response.end("not found");
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture server address");
  return `http://127.0.0.1:${address.port}`;
}

function ticketRow(id: string): {
  status: string;
  is_blocked: number;
  blocked_reason: string | null;
  completed_at: string | null;
  pr_number: number | null;
  attachments: string | null;
} {
  return db
    .prepare(
      "SELECT status, is_blocked, blocked_reason, completed_at, pr_number, attachments FROM tickets WHERE id = ?"
    )
    .get(id) as ReturnType<typeof ticketRow>;
}

function verificationReportComments(ticketId: string): Array<{ content: string; author: string }> {
  return db
    .prepare(
      "SELECT content, author FROM ticket_comments WHERE ticket_id = ? AND type = 'verification_report' ORDER BY created_at"
    )
    .all(ticketId) as Array<{ content: string; author: string }>;
}

beforeEach(() => {
  previousXdgDataHome = process.env.XDG_DATA_HOME;
  tempDir = mkdtempSync(join(tmpdir(), "brain-dump-verification-loop-"));
  process.env.XDG_DATA_HOME = tempDir;
  db = createTestDatabase().db;
  seedProjectAndEpic();
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

describe("verification loop end-to-end", () => {
  it("drives failure → repair → auto-done → epic auto-PR with zero human interaction", async () => {
    seedTicket(LIVE_TICKET, "ready");
    seedTicket(DONE_TICKET, "in_progress");
    const git = createMockGit();
    const baseUrl = await startFixtureServer();

    // ---- Implementation phase -------------------------------------------
    const started = startWork(db, LIVE_TICKET, git);
    expect(ticketRow(LIVE_TICKET).status).toBe("in_progress");
    expect(started.branch).toBeTruthy();
    seedVerifiedDoneTicket(started.branch);

    addTestReport(LIVE_TICKET);
    completeWork(db, LIVE_TICKET, git, "Implemented the fixture endpoint");
    expect(ticketRow(LIVE_TICKET).status).toBe("ai_review");

    // ---- AI review phase -------------------------------------------------
    const finding = submitFinding(db, {
      ticketId: LIVE_TICKET,
      agent: "code-reviewer",
      severity: "major",
      category: "error-handling",
      description: "Endpoint swallows fetch errors",
    });
    markFixed(db, finding.id, "fixed");
    expect(checkComplete(db, LIVE_TICKET).canProceedToVerification).toBe(true);

    // Demo with automation specs; step 1 intentionally asserts the WRONG
    // status so the first verification round fails.
    generateDemo(db, {
      ticketId: LIVE_TICKET,
      steps: [apiStep(1, 201), apiStep(2, 200)],
    });
    expect(ticketRow(LIVE_TICKET).status).toBe("ai_verification");

    // ---- Verification round 1: forced failure → loop-back ----------------
    const round1Exec = createExecStub();
    const round1 = await verifyTicket(db, {
      ticketId: LIVE_TICKET,
      baseUrl,
      provider: PROVIDER,
      execFileNoThrow: round1Exec.stub,
    });

    expect(round1.status).toBe("failed");
    expect(round1.manifest.stepVerdicts).toHaveLength(2);
    const after1 = ticketRow(LIVE_TICKET);
    expect(after1.status).toBe("in_progress");
    expect(after1.is_blocked).toBe(0);
    expect(after1.completed_at).toBeNull();

    // Finding filed with the verification category, open, from the runner.
    const verificationFindings = db
      .prepare(
        "SELECT id, severity, category, status, description FROM review_findings WHERE ticket_id = ? AND category = 'verification'"
      )
      .all(LIVE_TICKET) as Array<{
      id: string;
      severity: string;
      category: string;
      status: string;
      description: string;
    }>;
    expect(verificationFindings).toHaveLength(1);
    expect(verificationFindings[0]).toMatchObject({ severity: "major", status: "open" });
    expect(verificationFindings[0]!.description).toContain("expected status 201, got 200");

    // The failure (steps + evidence paths) is surfaced to the next Ralph
    // iteration — this exact text feeds the "Verification Failures - Fix
    // This First" prompt section.
    const failureContext = getVerificationFailuresByTicketId(db, [LIVE_TICKET])[LIVE_TICKET];
    expect(failureContext).toBeTruthy();
    expect(failureContext).toContain("Step 1");
    expect(failureContext).toContain("Evidence:");
    expect(failureContext).toContain(round1.id);

    // Exactly one verification_report comment for round 1, authored by the
    // provider's ralph identity.
    const reportsAfterRound1 = verificationReportComments(LIVE_TICKET);
    expect(reportsAfterRound1).toHaveLength(1);
    expect(reportsAfterRound1[0]!.author).toBe(`${PROVIDER} ralph`);
    expect(reportsAfterRound1[0]!.content).toContain(round1.id);

    // Evidence files from the failed round exist on disk and are hashed.
    expect(round1.manifest.evidenceFiles.length).toBeGreaterThan(0);
    for (const evidence of round1.manifest.evidenceFiles) {
      expect(existsSync(evidence.path)).toBe(true);
      expect(evidence.hash).toMatch(/^[a-f0-9]{64}$/);
    }

    // ---- Repair iteration -------------------------------------------------
    addTestReport(LIVE_TICKET);
    completeWork(db, LIVE_TICKET, git, "Fixed the endpoint status code");

    // Convergence gate: demo regeneration is blocked while the verification
    // finding is still open.
    expect(() =>
      generateDemo(db, { ticketId: LIVE_TICKET, steps: [apiStep(1, 200), apiStep(2, 200)] })
    ).toThrow(/critical|major|finding/i);

    markFixed(db, verificationFindings[0]!.id, "fixed");
    generateDemo(db, { ticketId: LIVE_TICKET, steps: [apiStep(1, 200), apiStep(2, 200)] });
    expect(ticketRow(LIVE_TICKET).status).toBe("ai_verification");

    // ---- Verification round 2: full suite passes → runner sets done ------
    const round2Exec = createExecStub();
    const round2 = await verifyTicket(db, {
      ticketId: LIVE_TICKET,
      baseUrl,
      provider: PROVIDER,
      execFileNoThrow: round2Exec.stub,
    });

    expect(round2.status).toBe("passed");
    expect(round2.certified).toBe(true);
    expect(round2.round).toBe(2);
    // Re-verification re-ran the FULL suite, not just the failed step.
    expect(round2.manifest.stepVerdicts).toHaveLength(2);
    expect(round2.manifest.stepVerdicts.every((step) => step.status === "passed")).toBe(true);

    const after2 = ticketRow(LIVE_TICKET);
    expect(after2.status).toBe("done");
    expect(after2.completed_at).toBeTruthy();

    // Sealed manifest validates against the stored run row.
    const storedRun = db.prepare("SELECT * FROM verification_runs WHERE id = ?").get(round2.id) as {
      id: string;
      ticket_id: string;
      round: number;
      status: string;
      certified: number;
      git_sha: string | null;
      started_at: string;
      finished_at: string;
      manifest: string;
    };
    const integrity = computeManifestIntegrity({
      id: storedRun.id,
      ticketId: storedRun.ticket_id,
      round: storedRun.round,
      status: storedRun.status,
      certified: Boolean(storedRun.certified),
      gitSha: storedRun.git_sha,
      startedAt: storedRun.started_at,
      finishedAt: storedRun.finished_at,
      manifest: storedRun.manifest,
    });
    expect(integrity.integrityStatus).toBe("valid");

    // Evidence files exist and are attached with the "{provider} ralph" uploader.
    for (const evidence of round2.manifest.evidenceFiles) {
      expect(existsSync(evidence.path)).toBe(true);
    }
    const attachments = JSON.parse(ticketRow(LIVE_TICKET).attachments ?? "[]") as Array<{
      uploadedBy: string;
      type: string;
    }>;
    expect(attachments.length).toBeGreaterThan(0);
    expect(attachments.every((attachment) => attachment.uploadedBy === `${PROVIDER} ralph`)).toBe(
      true
    );
    expect(attachments.some((attachment) => attachment.type === "verification-manifest")).toBe(
      true
    );

    // Exactly ONE verification_report comment per run.
    const reportsAfterRound2 = verificationReportComments(LIVE_TICKET);
    expect(reportsAfterRound2).toHaveLength(2);
    expect(reportsAfterRound2[1]!.content).toContain(round2.id);

    // The stale failure report is no longer injected after a passing run.
    expect(getVerificationFailuresByTicketId(db, [LIVE_TICKET])[LIVE_TICKET]).toBeUndefined();

    // Full audit trail: both rounds recorded, findings filed AND fixed.
    expect(listVerificationRuns(db, LIVE_TICKET).map((run) => run.round)).toEqual([2, 1]);
    const findingStatuses = db
      .prepare("SELECT status FROM review_findings WHERE ticket_id = ?")
      .all(LIVE_TICKET) as Array<{ status: string }>;
    expect(findingStatuses.every((row) => row.status === "fixed")).toBe(true);

    // ---- Epic completion → auto-PR ----------------------------------------
    expect(round2.epicAutoPr?.branchResults[0]).toMatchObject({
      success: true,
      action: "created",
      prNumber: 91,
    });
    expect(round2Exec.calls).toContainEqual(["git", "push", "-u", "origin", started.branch]);
    expect(
      round2Exec.calls.some((call) => call[0] === "gh" && call[1] === "pr" && call[2] === "create")
    ).toBe(true);
    expect(ticketRow(LIVE_TICKET).pr_number).toBe(91);

    // Zero human interaction: nothing in the trail required a human.
    const humanGateComments = db
      .prepare(
        "SELECT COUNT(*) as count FROM ticket_comments WHERE ticket_id = ? AND type = 'change_request'"
      )
      .get(LIVE_TICKET) as { count: number };
    expect(humanGateComments.count).toBe(0);
  });

  it("tripwire: a diff touching core/verification* stays blocked in ai_verification and never reaches done", async () => {
    seedTicket(LIVE_TICKET, "ai_verification", null);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO ticket_workflow_state (id, ticket_id, current_phase, review_iteration, findings_count, findings_fixed, demo_generated, created_at, updated_at)
       VALUES ('state-trip', ?, 'ai_verification', 1, 0, 0, 1, ?, ?)`
    ).run(LIVE_TICKET, now, now);
    db.prepare(
      `INSERT INTO demo_scripts (id, ticket_id, steps, generated_at) VALUES ('demo-trip', ?, ?, ?)`
    ).run(LIVE_TICKET, JSON.stringify([apiStep(1, 200)]), now);
    const baseUrl = await startFixtureServer();

    const tripwireExec = createExecStub({ dirtyFiles: " M core/verification.ts\n" });
    const run = await verifyTicket(db, {
      ticketId: LIVE_TICKET,
      baseUrl,
      provider: PROVIDER,
      execFileNoThrow: tripwireExec.stub,
    });

    expect(run.status).toBe("uncertified");
    expect(run.certified).toBe(false);
    const ticket = ticketRow(LIVE_TICKET);
    expect(ticket.status).toBe("ai_verification");
    expect(ticket.is_blocked).toBe(1);
    expect(ticket.blocked_reason).toContain("uncertified");
    expect(ticket.completed_at).toBeNull();

    // The stored run is flagged as the tripwire state by the integrity audit.
    const storedRun = db.prepare("SELECT * FROM verification_runs WHERE id = ?").get(run.id) as {
      id: string;
      ticket_id: string;
      round: number;
      status: string;
      certified: number;
      git_sha: string | null;
      started_at: string;
      finished_at: string;
      manifest: string;
    };
    expect(
      computeManifestIntegrity({
        id: storedRun.id,
        ticketId: storedRun.ticket_id,
        round: storedRun.round,
        status: storedRun.status,
        certified: Boolean(storedRun.certified),
        gitSha: storedRun.git_sha,
        startedAt: storedRun.started_at,
        finishedAt: storedRun.finished_at,
        manifest: storedRun.manifest,
      }).integrityStatus
    ).toBe("uncertified-tripwire");
  });
});

/** Scoped PRD file in the fixture project so verification settlement can prove
 *  `passes` only flips true when the runner sets the ticket to done. */
function seedPrdFile(): string {
  const plansDir = join(tempDir, "plans");
  mkdirSync(plansDir, { recursive: true });
  const prdPath = join(plansDir, "prd.json");
  writeFileSync(
    prdPath,
    JSON.stringify({
      userStories: [{ id: LIVE_TICKET, title: "Live fixture ticket", passes: false }],
    })
  );
  return prdPath;
}

function prdPasses(prdPath: string): boolean {
  const prd = JSON.parse(readFileSync(prdPath, "utf-8")) as {
    userStories: Array<{ id: string; passes: boolean }>;
  };
  return prd.userStories.find((story) => story.id === LIVE_TICKET)!.passes;
}

function verificationJobRowCount(): number {
  return (db.prepare("SELECT COUNT(*) as count FROM verification_jobs").get() as { count: number })
    .count;
}

/**
 * Worker-driven proof: the automatic path from the merged acceptance criteria.
 *
 * No test in this block ever calls verifyTicket directly or shells out to
 * `brain-dump verify` — tickets are driven exclusively through the public
 * workflow/review APIs Ralph uses, and verification executes only behind the
 * queue worker (drainVerificationQueue / runNextVerificationJob), exactly like
 * the boot/enqueue one-shot drain processes in production. If a handoff ever
 * stopped enqueueing runnable work, or a drain stopped picking it up, these
 * tests fail — a ticket that can only move via a human running a manual
 * command is the regression this block exists to catch.
 */
describe("automatic verification worker (queue-driven)", () => {
  it("queues on generate-demo and drains failure → repair → rerun → done → epic auto-PR with no manual verify command", async () => {
    seedTicket(LIVE_TICKET, "ready");
    seedTicket(DONE_TICKET, "in_progress");
    const prdPath = seedPrdFile();
    const git = createMockGit();
    const baseUrl = await startFixtureServer();

    // ---- Implementation + review, exactly as Ralph drives it --------------
    const started = startWork(db, LIVE_TICKET, git);
    seedVerifiedDoneTicket(started.branch);
    addTestReport(LIVE_TICKET);
    completeWork(db, LIVE_TICKET, git, "Implemented the fixture endpoint");
    expect(checkComplete(db, LIVE_TICKET).canProceedToVerification).toBe(true);
    generateDemo(db, {
      ticketId: LIVE_TICKET,
      steps: [apiStep(1, 201), apiStep(2, 200)],
    });

    // The handoff itself recorded runnable work: one pending job, visible to
    // queue health, with no human in the loop.
    const queuedJob = getVerificationJob(db, LIVE_TICKET);
    expect(queuedJob).toMatchObject({ status: "queued", attemptCount: 0 });
    expect(getVerificationWorkerQueueStatus(db).queueDepth).toBe(1);
    expect(prdPasses(prdPath)).toBe(false);

    // ---- Drain 1: worker claims the queued job, round 1 fails -------------
    const drain1Exec = createExecStub();
    const drain1 = await drainVerificationQueue(db, {
      workerId: "drain-round-1",
      provider: PROVIDER,
      baseUrl,
      execFileNoThrow: drain1Exec.stub,
    });
    expect(drain1.processed).toBe(1);

    // Loop-back happened entirely behind the worker: ticket back to
    // implementation, job settled (not retryable — repair re-enqueues), and
    // the failure context queued for the next Ralph iteration.
    expect(ticketRow(LIVE_TICKET).status).toBe("in_progress");
    const failedJob = getVerificationJob(db, LIVE_TICKET);
    expect(failedJob).toMatchObject({ status: "failed", leasedBy: null });
    expect(failedJob!.completedAt).toBeTruthy();
    expect(failedJob!.lastError).toContain("returned to implementation");
    expect(getVerificationFailuresByTicketId(db, [LIVE_TICKET])[LIVE_TICKET]).toContain("Step 1");
    expect(prdPasses(prdPath)).toBe(false);

    // A second drain right now claims nothing and exits immediately — the
    // settled loop-back job is not a pending retry, so a one-shot drain never
    // lingers waiting on work that only a repaired handoff can re-create.
    const idleDrain = await drainVerificationQueue(db, {
      workerId: "drain-idle",
      provider: PROVIDER,
      baseUrl,
      execFileNoThrow: createExecStub().stub,
    });
    expect(idleDrain.processed).toBe(0);

    // ---- Repair iteration: fix, regenerate demo, job re-queued ------------
    const openFinding = db
      .prepare(
        "SELECT id FROM review_findings WHERE ticket_id = ? AND category = 'verification' AND status = 'open'"
      )
      .get(LIVE_TICKET) as { id: string };
    addTestReport(LIVE_TICKET);
    completeWork(db, LIVE_TICKET, git, "Fixed the endpoint status code");
    markFixed(db, openFinding.id, "fixed");
    generateDemo(db, { ticketId: LIVE_TICKET, steps: [apiStep(1, 200), apiStep(2, 200)] });

    // Idempotent enqueue: the repair refreshed the SAME durable job row.
    expect(verificationJobRowCount()).toBe(1);
    expect(getVerificationJob(db, LIVE_TICKET)).toMatchObject({
      status: "queued",
      attemptCount: 0,
      lastError: null,
    });

    // ---- Drain 2: a different worker (fresh process) completes the loop ---
    const drain2Exec = createExecStub();
    const drain2 = await drainVerificationQueue(db, {
      workerId: "drain-round-2",
      provider: PROVIDER,
      baseUrl,
      execFileNoThrow: drain2Exec.stub,
    });
    expect(drain2.processed).toBe(1);

    // Runner-driven completion: done ticket, succeeded job, epic auto-PR.
    const finalTicket = ticketRow(LIVE_TICKET);
    expect(finalTicket.status).toBe("done");
    expect(finalTicket.completed_at).toBeTruthy();
    expect(finalTicket.pr_number).toBe(91);
    expect(
      drain2Exec.calls.some((call) => call[0] === "gh" && call[1] === "pr" && call[2] === "create")
    ).toBe(true);

    const finalJob = getVerificationJob(db, LIVE_TICKET);
    expect(finalJob).toMatchObject({
      status: "succeeded",
      actor: `${PROVIDER} ralph`,
      leasedBy: null,
    });
    // Stale-code hazard surfaced: the settled job records WHICH worker ran it
    // and the verifier code SHA it executed, so a job verified by old code is
    // attributable after the fact.
    expect(finalJob!.workerId).toBe("drain-round-2");
    expect(finalJob!.codeGitSha).toBe("e2e-sha-111");
    expect(getVerificationWorkerQueueStatus(db).queueDepth).toBe(0);

    // Full-suite rerun across rounds, evidence attributed to "{provider} ralph".
    expect(listVerificationRuns(db, LIVE_TICKET).map((run) => run.round)).toEqual([2, 1]);
    const reports = verificationReportComments(LIVE_TICKET);
    expect(reports).toHaveLength(2);
    expect(reports.every((report) => report.author === `${PROVIDER} ralph`)).toBe(true);

    // PRD `passes` flipped true only via the runner's done transition.
    expect(prdPasses(prdPath)).toBe(true);

    // Nothing in the trail required a human: no manual verify invocation
    // happened (verifyTicket was never called by this test), no legacy
    // human_review status exists, no change_request comment exists.
    const humanReviewTickets = db
      .prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'human_review'")
      .get() as { count: number };
    expect(humanReviewTickets.count).toBe(0);
    const changeRequests = db
      .prepare(
        "SELECT COUNT(*) as count FROM ticket_comments WHERE ticket_id = ? AND type = 'change_request'"
      )
      .get(LIVE_TICKET) as { count: number };
    expect(changeRequests.count).toBe(0);
  });

  it("re-leases an expired lease after a worker restart and rejects stale settlement", async () => {
    seedTicket(LIVE_TICKET, "ready", null);
    const git = createMockGit();
    const baseUrl = await startFixtureServer();

    startWork(db, LIVE_TICKET, git);
    addTestReport(LIVE_TICKET);
    completeWork(db, LIVE_TICKET, git, "Implemented the fixture endpoint");
    generateDemo(db, { ticketId: LIVE_TICKET, steps: [apiStep(1, 200)] });

    // Worker A claims the job, then "crashes" without settling.
    const t0 = new Date();
    const crashedClaim = claimNextVerificationJob(db, {
      workerId: "worker-crashed",
      now: t0.toISOString(),
      leaseMs: 60_000,
    });
    expect(crashedClaim).toMatchObject({ status: "running", leasedBy: "worker-crashed" });

    // While the lease is active nobody else can claim the job — no duplicate
    // in-flight verification runs.
    const duringLease = new Date(t0.getTime() + 30_000).toISOString();
    expect(claimNextVerificationJob(db, { workerId: "worker-eager", now: duringLease })).toBeNull();

    // The queued job survived the crash: after lease expiry a restarted worker
    // re-leases the SAME durable row and completes verification.
    const afterExpiry = new Date(t0.getTime() + 120_000);
    const resumed = await runNextVerificationJob(db, {
      workerId: "worker-resumed",
      provider: PROVIDER,
      baseUrl,
      execFileNoThrow: createExecStub().stub,
      now: () => afterExpiry,
    });
    expect(resumed).toMatchObject({
      claimed: true,
      workerId: "worker-resumed",
      ticketId: LIVE_TICKET,
      runStatus: "passed",
      jobStatus: "succeeded",
    });
    expect(ticketRow(LIVE_TICKET).status).toBe("done");
    expect(verificationJobRowCount()).toBe(1);

    // The crashed worker's stale lease can never settle the job it lost.
    expect(() =>
      settleVerificationJob(db, {
        jobId: crashedClaim!.id,
        workerId: "worker-crashed",
        attemptCount: crashedClaim!.attemptCount,
        status: "succeeded",
      })
    ).toThrow(/not leased/i);
  });
});
