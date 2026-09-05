import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import { verifyTicket } from "../verification/run.ts";
import { getTicketBriefing } from "../ticket-briefing.ts";
import type { DemoStep } from "../types.ts";

let db: Database.Database;
let root: string;
let project: string;
let server: Server | undefined;
const fileStep: DemoStep = {
  order: 1,
  description: "Check result",
  expectedOutcome: "ok",
  type: "automated",
  automation: { kind: "file", path: "result.txt", assert: [{ type: "contains", expected: "ok" }] },
};
const apiStep: DemoStep = {
  order: 1,
  description: "Call health",
  expectedOutcome: "Healthy",
  type: "automated",
  automation: {
    kind: "api",
    request: { method: "GET", path: "/health" },
    assert: [{ type: "status", expected: 200 }],
  },
};
function git(...args: string[]): string {
  return execFileSync("git", args, {
    cwd: project,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function setSteps(steps: DemoStep[]): void {
  db.prepare("UPDATE demo_scripts SET steps = ? WHERE ticket_id = 't'").run(JSON.stringify(steps));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "verification-safety-"));
  project = join(root, "project");
  mkdirSync(project);
  vi.stubEnv("HOME", root);
  vi.stubEnv("USERPROFILE", root);
  vi.stubEnv("APPDATA", join(root, "roaming"));
  vi.stubEnv("XDG_DATA_HOME", join(root, "data"));
  vi.stubEnv("XDG_STATE_HOME", join(root, "state"));
  db = createTestDatabase().db;
  db.prepare("INSERT INTO projects (id, name, path) VALUES ('p', 'Fixture', ?)").run(project);
  db.prepare(
    "INSERT INTO tickets (id, title, project_id, status) VALUES ('t', 'Fixture', 'p', 'ai_verification')"
  ).run();
  db.prepare(
    "INSERT INTO demo_scripts (id, ticket_id, steps, generated_at) VALUES ('d', 't', ?, ?)"
  ).run(JSON.stringify([fileStep]), new Date().toISOString());
  writeFileSync(join(project, "result.txt"), "ok");
});
afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
  db.close();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe("verification execution safety", () => {
  it("refuses another branch's code without switching the user's checkout", async () => {
    git("init", "-b", "main");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.invalid");
    git("add", ".");
    git("commit", "-m", "initial");
    git("checkout", "-b", "feature/expected");
    writeFileSync(join(project, "result.txt"), "broken");
    git("add", ".");
    git("commit", "-m", "ticket change");
    git("checkout", "main");
    db.prepare("UPDATE tickets SET branch_name = 'feature/expected' WHERE id = 't'").run();
    const run = await verifyTicket(db, { ticketId: "t" });
    expect(run.status).toBe("infra_error");
    expect(run.manifest.stepVerdicts[0]?.message).toContain("source mismatch");
    expect(git("branch", "--show-current")).toBe("main");
    expect(db.prepare("SELECT status FROM tickets WHERE id = 't'").get()).toEqual({
      status: "in_progress",
    });
  });

  it.each(["committed", "uncommitted"])(
    "refuses %s changes after the reviewed revision",
    async (change) => {
      git("init", "-b", "main");
      git("config", "user.name", "Fixture");
      git("config", "user.email", "fixture@example.invalid");
      git("add", ".");
      git("commit", "-m", "initial");
      const reviewed = git("rev-parse", "HEAD");
      if (change === "committed") git("commit", "--allow-empty", "-m", "unreviewed");
      else writeFileSync(join(project, "result.txt"), "unreviewed but still ok");
      db.prepare(
        "INSERT INTO ticket_workflow_state (id, ticket_id, reviewed_through_commit) VALUES ('w', 't', ?)"
      ).run(reviewed);
      const run = await verifyTicket(db, { ticketId: "t" });
      expect(run.certified).toBe(false);
      expect(run.manifest.stepVerdicts[0]?.message).toContain(`reviewed ${reviewed}`);
    }
  );

  it.each(["readiness", "headers", "body"])(
    "times out stalled HTTP %s and releases the connection",
    async (stall) => {
      setSteps([apiStep]);
      server = createServer((request, response) => {
        if (stall === "readiness") return;
        if (request.url === "/") {
          response.end("ready");
          return;
        }
        if (stall === "body") {
          response.writeHead(200);
          response.write("partial");
        }
      });
      await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing server address");
      const run = await verifyTicket(db, {
        ticketId: "t",
        baseUrl: `http://127.0.0.1:${address.port}`,
        timeoutMs: 50,
      });
      expect(run.status).toBe("infra_error");
      expect(run.manifest.stepVerdicts[0]?.message).toMatch(/timed out/i);
    }
  );

  it("gives booted applications private data and home directories", async () => {
    setSteps([apiStep]);
    const parentDatabase = join(root, "data", "brain-dump", "brain-dump.db");
    mkdirSync(join(root, "data", "brain-dump"), { recursive: true });
    writeFileSync(parentDatabase, "keep daily-driver data");
    writeFileSync(
      join(project, "server.cjs"),
      `
      const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
      const dir = path.join(process.env.XDG_DATA_HOME, 'brain-dump');
      fs.mkdirSync(dir, {recursive:true});
      fs.writeFileSync(path.join(dir, 'brain-dump.db'), 'fixture mutation');
      http.createServer((q,s) => s.end(JSON.stringify({home:process.env.HOME, data:dir})))
        .listen(Number(process.env.PORT), '127.0.0.1');
    `
    );
    const run = await verifyTicket(db, { ticketId: "t", bootCommand: ["node", "server.cjs"] });
    expect(run.status).toBe("passed");
    expect(readFileSync(parentDatabase, "utf8")).toBe("keep daily-driver data");
    expect(run.manifest.stepVerdicts[0]?.response?.body).toContain("app-data");
  });

  it("refuses project dotenv credentials even with an isolated home", async () => {
    setSteps([apiStep]);
    writeFileSync(join(project, ".env"), "DATABASE_URL=postgres://live.invalid\n");
    const run = await verifyTicket(db, { ticketId: "t", bootCommand: ["node", "server.cjs"] });
    expect(run.status).toBe("infra_error");
    expect(run.manifest.stepVerdicts[0]?.message).toContain("could load live credentials");
  });
});

describe("ticket briefing evidence", () => {
  it("ignores damaged old manifests and warns without crashing for damaged latest evidence", async () => {
    db.prepare(
      "INSERT INTO verification_runs (id, ticket_id, round, status, certified, manifest, started_at, finished_at) VALUES ('old', 't', 0, 'failed', 0, 'broken json', '2020', '2020')"
    ).run();
    const run = await verifyTicket(db, { ticketId: "t" });
    expect(getTicketBriefing(db, "t")).toMatchObject({
      verificationWarning: null,
      failedVerification: null,
    });
    db.prepare("UPDATE verification_runs SET manifest = 'broken json' WHERE id = ?").run(run.id);
    expect(getTicketBriefing(db, "t").verificationWarning).toContain(run.id);
  });
});
