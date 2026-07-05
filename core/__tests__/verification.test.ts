import { createServer, type Server } from "http";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import { listVerificationRuns, verifyTicket } from "../verification.ts";
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

  it("records failed rounds without completing the ticket", async () => {
    seedDemo([apiStep(201), apiStep(201)]);
    const baseUrl = await startFixtureServer();

    const firstRun = await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
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
    expect(ticket.status).toBe("ai_verification");
    expect(ticket.completed_at).toBeNull();
    expect(listVerificationRuns(db, "ticket-1").map((run) => run.round)).toEqual([2, 1]);
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
});
