import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import { verifyTicket } from "../verification/run.ts";
import type { DemoStep } from "../types.ts";
import { classifyVerificationRunFailure } from "../verification/lifecycle.ts";

let root: string;
let db: Database.Database;
let server: Server;
let baseUrl: string;
let mutations: number;
let broken: boolean;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "verification-performance-"));
  vi.stubEnv("XDG_STATE_HOME", join(root, "state"));
  vi.stubEnv("XDG_DATA_HOME", join(root, "data"));
  db = createTestDatabase().db;
  db.prepare("INSERT INTO projects(id,name,path) VALUES('p','P',?)").run(root);
  db.prepare(
    "INSERT INTO tickets(id,title,project_id,status) VALUES('t','T','p','ai_verification')"
  ).run();
  mutations = 0;
  broken = true;
  server = createServer((req, res) => {
    if (req.url === "/reset") {
      req.socket.destroy();
      return;
    }
    if (req.url === "/page") {
      res.setHeader("content-type", "text/html");
      res.end(`<script>fetch('/reset').catch(() => {
        document.body.innerHTML = '<p id="loaded">Loaded with a failed request</p>';
      })</script>`);
      return;
    }
    if (req.url === "/stall") return;
    if (req.url === "/mutation") {
      mutations++;
      setTimeout(() => res.end("ok"), 500);
      return;
    }
    res.statusCode = req.url === "/first" && broken ? 500 : 200;
    res.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No server port");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

function api(order: number, path: string, method: "GET" | "POST" = "GET"): DemoStep {
  return {
    order,
    type: "automated",
    description: path,
    expectedOutcome: "HTTP 200",
    automation: {
      kind: "api",
      request: { method, path },
      assert: [{ type: "status", expected: 200 }],
    },
  };
}

function seed(steps: DemoStep[]): void {
  db.prepare("INSERT INTO demo_scripts(id,ticket_id,steps,generated_at) VALUES('d','t',?,?)").run(
    JSON.stringify(steps),
    new Date().toISOString()
  );
}

it("stops after the first failure, then executes every step on the repaired run", async () => {
  seed([api(1, "/first"), api(2, "/mutation", "POST")]);
  const start = Date.now();
  const failed = await verifyTicket(db, { ticketId: "t", baseUrl });
  console.info(`Failed-run elapsed: ${Date.now() - start}ms; later mutations: ${mutations}`);
  expect(failed.status).toBe("failed");
  expect(mutations).toBe(0);
  expect(failed.manifest.stepVerdicts.map((step) => step.status)).toEqual(["failed", "skipped"]);
  expect(failed.manifest.evidenceFiles).toHaveLength(1);
  broken = false;
  db.prepare("UPDATE tickets SET status='ai_verification',is_blocked=0 WHERE id='t'").run();
  const repaired = await verifyTicket(db, { ticketId: "t", baseUrl });
  expect(repaired.manifest.stepVerdicts.map((step) => step.status)).toEqual(["passed", "passed"]);
  expect(mutations).toBe(1);
});

it("does not replay completed steps when a later request times out", async () => {
  seed([api(1, "/mutation", "POST"), api(2, "/stall")]);
  const run = await verifyTicket(db, { ticketId: "t", baseUrl, timeoutMs: 700 });
  console.info(`Mutations before timeout settlement: ${mutations}`);
  expect(mutations).toBe(1);
  expect(run.manifest.retryable).toBe(false);
  expect(run.manifest.stepVerdicts[0]?.status).toBe("passed");
  expect(run.manifest.stepVerdicts[1]?.message).toMatch(/timed out/i);
  expect(run.manifest.stepVerdicts[1]?.durationMs).toBeGreaterThanOrEqual(650);
  expect(db.prepare("SELECT blocked_reason FROM tickets WHERE id='t'").get()).toMatchObject({
    blocked_reason: expect.stringMatching(/timed out/i),
  });
});

it("cancels readiness polling after the boot process has already exited", async () => {
  seed([api(1, "/health")]);
  writeFileSync(join(root, "fail.cjs"), "process.exit(1)\n");
  const fetchImpl = vi.fn(async () => {
    throw new Error("server absent");
  });
  const run = await verifyTicket(db, {
    ticketId: "t",
    bootCommand: ["node", "fail.cjs"],
    timeoutMs: 1000,
    fetchImpl,
  });
  expect(run.status).toBe("infra_error");
  const callsAtSettlement = fetchImpl.mock.calls.length;
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(fetchImpl).toHaveBeenCalledTimes(callsAtSettlement);
});

it.each([false, true])(
  "captures browser connectivity evidence without failing successful checks (passing=%s)",
  async (passing) => {
    seed([
      {
        order: 1,
        type: "visual",
        description: "Check the loaded widget",
        expectedOutcome: "The widget is visible",
        automation: {
          kind: "ui",
          route: "/page",
          actions: [{ act: "waitFor", selector: "#loaded" }],
          assert: [{ type: "visible", selector: passing ? "#loaded" : "#missing-widget" }],
          screenshot: true,
        },
      },
    ]);
    const run = await verifyTicket(db, { ticketId: "t", baseUrl });
    expect(run.status).toBe(passing ? "passed" : "failed");
    expect(run.manifest.evidenceFiles).toHaveLength(1);
    if (passing) {
      expect(classifyVerificationRunFailure(run)).toBeNull();
    } else {
      expect(run.manifest.stepVerdicts[0]?.message).toContain("Browser request failed:");
      expect(classifyVerificationRunFailure(run)?.kind).toBe("connectivity");
    }
  }
);
