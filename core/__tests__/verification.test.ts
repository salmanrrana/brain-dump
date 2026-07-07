import { createServer, type Server } from "http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { pathToFileURL } from "url";
import { tmpdir } from "os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import {
  listVerificationRuns,
  verificationTestInternals,
  verifyTicket,
  type VerifyTicketParams,
  type VerificationRun,
} from "../verification.ts";
import {
  claimNextVerificationJob,
  enqueueVerificationJob,
  getVerificationJob,
  isVerificationWorkerPaused,
  listVerificationJobs,
  settleVerificationJob,
} from "../verification-queue.ts";
import {
  getVerificationOperationsStatus,
  markVerificationJobDead,
  requeueVerificationJob,
  setVerificationWorkerPaused,
} from "../verification-ops.ts";
import {
  drainVerificationQueue,
  getVerificationWorkerQueueStatus,
  isVerificationExecutionAllowedFromEnv,
  resolveBrainDumpRootFrom,
  runNextVerificationJob,
  shouldStartVerificationWorkerFromEnv,
  spawnDetachedVerificationDrain,
  type VerificationWorkerOptions,
} from "../verification-worker.ts";
import type { DemoStep, ExecFileNoThrowOptions } from "../types.ts";

let db: Database.Database;
let server: Server | null = null;
let tempDir: string;
let previousXdgDataHome: string | undefined;
let previousProviderEnv: Record<string, string | undefined> = {};

const PROVIDER_ENV_KEYS = [
  "BRAIN_DUMP_RALPH_PROVIDER",
  "BRAIN_DUMP_PROVIDER",
  "OPENCODE",
  "CURSOR_AGENT",
  "COPILOT_CLI",
  "CODEX",
  "CURSOR",
  "PI",
  "CLAUDE_CODE",
  "CLAUDE_CODE_ENTRYPOINT",
];

function seedProject(): void {
  db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
    "project-1",
    "Fixture",
    tempDir,
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

function seedAdditionalTicket(ticketId: string, steps: DemoStep[]): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tickets (id, title, status, priority, position, project_id, created_at, updated_at)
     VALUES (?, 'Verify me too', 'ai_verification', 'high', 2, 'project-1', ?, ?)`
  ).run(ticketId, now, now);
  db.prepare(
    `INSERT INTO ticket_workflow_state
     (id, ticket_id, current_phase, review_iteration, findings_count, findings_fixed, demo_generated, created_at, updated_at)
     VALUES (?, ?, 'ai_verification', 1, 0, 0, 1, ?, ?)`
  ).run(`state-${ticketId}`, ticketId, now, now);
  db.prepare(
    `INSERT INTO demo_scripts (id, ticket_id, steps, generated_at)
     VALUES (?, ?, ?, ?)`
  ).run(`demo-${ticketId}`, ticketId, JSON.stringify(steps), now);
}

function lifecycleSnapshot(ticketId: string): Record<string, unknown> {
  const ticket = db
    .prepare("SELECT status, is_blocked FROM tickets WHERE id = ?")
    .get(ticketId) as { status: string; is_blocked: number };
  const run = db
    .prepare("SELECT status, certified FROM verification_runs WHERE ticket_id = ?")
    .get(ticketId) as { status: string; certified: number };
  const reportCount = db
    .prepare(
      "SELECT COUNT(*) as count FROM ticket_comments WHERE ticket_id = ? AND type = 'verification_report'"
    )
    .get(ticketId) as { count: number };
  const findingCount = db
    .prepare(
      "SELECT COUNT(*) as count FROM review_findings WHERE ticket_id = ? AND category = 'verification'"
    )
    .get(ticketId) as { count: number };

  return {
    ticketStatus: ticket.status,
    isBlocked: ticket.is_blocked,
    runStatus: run.status,
    certified: run.certified,
    verificationReportCount: reportCount.count,
    verificationFindingCount: findingCount.count,
  };
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

function uiTextStep(): DemoStep {
  return {
    order: 1,
    description: "Open delayed page",
    expectedOutcome: "Delayed content appears",
    type: "visual",
    automation: {
      kind: "ui",
      route: "/",
      actions: [{ act: "waitFor", selector: "body" }],
      assert: [
        { type: "visible", selector: "body" },
        { type: "text", selector: "body", expected: "Projects" },
      ],
      screenshot: true,
    },
  };
}

function commandStep(stdout = "command ok"): DemoStep {
  return {
    order: 1,
    description: "Run a command check",
    expectedOutcome: "Command output is captured",
    type: "automated",
    automation: {
      kind: "command",
      command: {
        argv: ["node", "--version"],
        timeoutMs: 1_000,
        expectedExitCode: 0,
      },
      assert: [{ type: "stdoutContains", expected: stdout }],
    },
  };
}

function fileStep(expected = "file ok"): DemoStep {
  return {
    order: 2,
    description: "Read a fixture file",
    expectedOutcome: "File content is captured",
    type: "automated",
    automation: {
      kind: "file",
      path: "fixture.txt",
      assert: [{ type: "contains", expected }],
    },
  };
}

function manualStep(): DemoStep {
  return {
    order: 1,
    description: "Manual inspection",
    expectedOutcome: "Human can inspect",
    type: "manual",
  };
}

function invalidAutomationStep(): DemoStep {
  return {
    order: 1,
    description: "Broken automation",
    expectedOutcome: "Runner reports infrastructure error",
    type: "automated",
  };
}

function createCleanExecFileNoThrow(
  onCommand?: (command: string, args: string[], options?: ExecFileNoThrowOptions) => void
) {
  return async (command: string, args: string[], options?: ExecFileNoThrowOptions) => {
    if (command === "git" && args.join(" ") === "rev-parse HEAD") {
      return { success: true, stdout: "abc123\n", stderr: "", exitCode: 0 };
    }
    if (command === "git" && args.join(" ") === "status --short") {
      return { success: true, stdout: "", stderr: "", exitCode: 0 };
    }
    if (command === "git" && args.join(" ") === "diff --name-only HEAD~1 HEAD") {
      return { success: true, stdout: "", stderr: "", exitCode: 0 };
    }
    onCommand?.(command, args, options);
    return { success: true, stdout: "command ok\n", stderr: "", exitCode: 0 };
  };
}

function fakeWorkerRun(params: VerifyTicketParams): VerificationRun {
  const now = new Date().toISOString();
  const provider = params.provider ?? "unknown";
  const identity = {
    provider,
    actor: `${provider} ralph` as `${string} ralph`,
    providerSource: params.provider ? "explicit" : "unknown",
    executionSurface: params.executionSurface ?? "enqueue-drain",
    workerId: params.verificationJobLease?.workerId ?? null,
    codeGitSha: "verifier-sha",
  } as const;
  return {
    id: "fake-run",
    ticketId: params.ticketId,
    round: 1,
    status: "passed",
    certified: true,
    gitSha: "target-sha",
    identity,
    startedAt: now,
    finishedAt: now,
    manifest: {
      runId: "fake-run",
      ticketId: params.ticketId,
      round: 1,
      status: "passed",
      certified: true,
      gitSha: "target-sha",
      dirty: false,
      port: 0,
      bootCommand: [],
      bootLog: "",
      startedAt: now,
      finishedAt: now,
      stepVerdicts: [],
      evidenceFiles: [],
      verifier: identity,
      manifestHash: "fake-hash",
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
  previousProviderEnv = Object.fromEntries(PROVIDER_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of PROVIDER_ENV_KEYS) delete process.env[key];
  tempDir = mkdtempSync(join(tmpdir(), "brain-dump-verification-"));
  process.env.XDG_DATA_HOME = tempDir;
  db = createTestDatabase().db;
  seedProject();
  seedTicket();
});

afterEach(async () => {
  vi.doUnmock("@playwright/test");
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
  for (const key of PROVIDER_ENV_KEYS) {
    const value = previousProviderEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  rmSync(tempDir, { recursive: true, force: true });
});

describe("verifyTicket", () => {
  it("discovers direct Vite boot commands that honor the runner-selected port", () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({
        scripts: { dev: "vite dev --port 4242" },
        devDependencies: { vite: "7.1.7" },
      })
    );
    writeFileSync(join(tempDir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");

    expect(verificationTestInternals.discoverBootCommand(tempDir, 43123)).toEqual([
      "pnpm",
      "exec",
      "vite",
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      "43123",
      "--strictPort",
    ]);
  });

  it("boots an isolated verification app with the selected port and devtools env disabled", async () => {
    seedDemo([apiStep()]);
    const script = `
      const http = require("http");
      if (process.env.PLAYWRIGHT_E2E !== "1" || process.env.BRAIN_DUMP_VERIFY_BOOT !== "1") {
        console.error("missing verification boot env");
        process.exit(42);
      }
      const port = Number(process.env.PORT);
      http.createServer((request, response) => {
        if (request.url === "/health") {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ ok: true }));
          return;
        }
        response.writeHead(200);
        response.end("ready");
      }).listen(port, "127.0.0.1", () => console.log("listening " + port));
    `;

    const run = await verifyTicket(db, {
      ticketId: "ticket-1",
      bootCommand: [process.execPath, "-e", script],
      timeoutMs: 5_000,
    });

    expect(run.status).toBe("passed");
    expect(run.manifest.port).toBeGreaterThan(0);
    expect(run.manifest.bootCommand).toEqual([process.execPath, "-e", script]);
  });

  it("records boot command, port, and stderr in infra-error manifests", async () => {
    seedDemo([apiStep()]);
    const script = `
      console.error("devtools EADDRINUSE fixed event bus port");
      setTimeout(() => process.exit(1), 50);
    `;

    const run = await verifyTicket(db, {
      ticketId: "ticket-1",
      bootCommand: [process.execPath, "-e", script],
      timeoutMs: 250,
    });

    expect(run.status).toBe("infra_error");
    expect(run.manifest.port).toBeGreaterThan(0);
    expect(run.manifest.bootCommand).toEqual([process.execPath, "-e", script]);
    expect(run.manifest.bootLog).toContain("devtools EADDRINUSE fixed event bus port");
    expect(run.manifest.bootLog).toContain("Boot command exited before readiness");
    expect(run.manifest.stepVerdicts[0]?.message).toContain("Boot command exited before readiness");
  });

  it("preserves boot metadata when a step fails after readiness", async () => {
    seedDemo([apiStep()]);
    const script = `
      const http = require("http");
      const port = Number(process.env.PORT);
      http.createServer((request, response) => {
        if (request.url === "/health") {
          request.socket.destroy();
          return;
        }
        response.writeHead(200);
        response.end("ready");
      }).listen(port, "127.0.0.1", () => console.log("ready before step failure " + port));
    `;

    const run = await verifyTicket(db, {
      ticketId: "ticket-1",
      bootCommand: [process.execPath, "-e", script],
      timeoutMs: 5_000,
    });

    expect(run.status).toBe("infra_error");
    expect(run.manifest.port).toBeGreaterThan(0);
    expect(run.manifest.bootCommand).toEqual([process.execPath, "-e", script]);
    expect(run.manifest.bootLog).toContain("ready before step failure");
  });

  it("skips the splash screen and waits for UI text assertions", async () => {
    seedDemo([uiTextStep()]);
    const waitFor = vi.fn(async () => {});
    const isVisible = vi.fn(async () => true);
    const textContent = vi.fn(async () => "Loading Brain Dump");
    const toContainText = vi.fn(async () => {});
    const addInitScript = vi.fn(async () => {});
    const goto = vi.fn(async () => {});
    const evaluate = vi.fn(async () => ({ ok: true }));
    const screenshot = vi.fn(async ({ path }: { path: string }) =>
      writeFileSync(path, "fake image")
    );
    const locator = vi.fn(() => ({
      first: () => ({ isVisible, textContent }),
      waitFor,
    }));
    const close = vi.fn(async () => {});
    vi.doMock("@playwright/test", () => ({
      chromium: {
        launch: vi.fn(async () => ({
          newPage: vi.fn(async () => ({
            addInitScript,
            goto,
            evaluate,
            keyboard: { press: vi.fn(async () => {}) },
            locator,
            screenshot,
            url: () => "http://127.0.0.1:4242/",
          })),
          close,
        })),
      },
      expect: () => ({ toContainText }),
    }));
    const baseUrl = await startFixtureServer();

    const run = await verifyTicket(db, { ticketId: "ticket-1", baseUrl });

    expect(run.status).toBe("passed");
    expect(addInitScript).toHaveBeenCalledWith(expect.any(Function), {
      resultKey: "__brainDumpVerificationSplashSkip",
      splashShownKey: "bd:splash-shown",
    });
    expect(goto).toHaveBeenCalledWith(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    expect(evaluate).toHaveBeenCalledWith(
      expect.any(Function),
      "__brainDumpVerificationSplashSkip"
    );
    expect(toContainText).toHaveBeenCalledWith("Projects", { timeout: 10_000 });
    expect(textContent).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it("scrolls the asserted text into view before capturing the screenshot", async () => {
    seedDemo([uiTextStep()]);
    // The app shell scrolls inside nested overflow containers, so without an
    // explicit scroll the screenshot shows the top of the page while text
    // asserted further down passes invisibly.
    const order: string[] = [];
    const scrollIntoViewIfNeeded = vi.fn(async () => {
      order.push("scroll");
    });
    const getByText = vi.fn(() => ({ first: () => ({ scrollIntoViewIfNeeded }) }));
    const toContainText = vi.fn(async () => {});
    const screenshot = vi.fn(async ({ path }: { path: string }) => {
      order.push("screenshot");
      writeFileSync(path, "fake image");
    });
    const locator = vi.fn(() => ({
      first: () => ({ isVisible: vi.fn(async () => true) }),
      waitFor: vi.fn(async () => {}),
    }));
    vi.doMock("@playwright/test", () => ({
      chromium: {
        launch: vi.fn(async () => ({
          newPage: vi.fn(async () => ({
            addInitScript: vi.fn(async () => {}),
            goto: vi.fn(async () => {}),
            evaluate: vi.fn(async () => ({ ok: true })),
            keyboard: { press: vi.fn(async () => {}) },
            locator,
            getByText,
            screenshot,
            url: () => "http://127.0.0.1:4242/",
          })),
          close: vi.fn(async () => {}),
        })),
      },
      expect: () => ({ toContainText }),
    }));
    const baseUrl = await startFixtureServer();

    const run = await verifyTicket(db, { ticketId: "ticket-1", baseUrl });

    expect(run.status).toBe("passed");
    expect(getByText).toHaveBeenCalledWith("Projects");
    expect(order).toEqual(["scroll", "screenshot"]);
  });

  it("fails UI steps when the splash overlay never dismisses", async () => {
    seedDemo([uiTextStep()]);
    const toContainText = vi.fn(async () => {});
    const screenshot = vi.fn(async ({ path }: { path: string }) =>
      writeFileSync(path, "fake image")
    );
    // Text assertions pass against the SSR DOM under the overlay, so without
    // the dismissal gate this run would certify a splash-only screenshot.
    const locator = vi.fn((selector: string) => ({
      first: () => ({ isVisible: vi.fn(async () => true) }),
      waitFor: vi.fn(async (options?: { state?: string }) => {
        if (selector === '[data-testid="app-splash"]' && options?.state === "detached") {
          throw new Error("Timeout 15000ms exceeded");
        }
      }),
    }));
    vi.doMock("@playwright/test", () => ({
      chromium: {
        launch: vi.fn(async () => ({
          newPage: vi.fn(async () => ({
            addInitScript: vi.fn(async () => {}),
            goto: vi.fn(async () => {}),
            evaluate: vi.fn(async () => ({ ok: true })),
            keyboard: { press: vi.fn(async () => {}) },
            locator,
            screenshot,
            url: () => "http://127.0.0.1:4242/",
          })),
          close: vi.fn(async () => {}),
        })),
      },
      expect: () => ({ toContainText }),
    }));
    const baseUrl = await startFixtureServer();

    const run = await verifyTicket(db, { ticketId: "ticket-1", baseUrl });

    expect(run.status).toBe("failed");
    expect(run.manifest.stepVerdicts[0]?.message).toContain("splash overlay did not dismiss");
  });

  it("warms up UI routes before assertions on self-booted apps and tolerates warm-up failures", async () => {
    seedDemo([uiTextStep()]);
    const gotoCalls: { url: string; options?: { waitUntil?: string } }[] = [];
    const goto = vi.fn(async (url: string, options?: { waitUntil?: string }) => {
      gotoCalls.push({ url, ...(options !== undefined ? { options } : {}) });
      // The warm-up navigation crashing must not fail the run: real steps
      // re-navigate and assert for themselves.
      if (options?.waitUntil === "networkidle") throw new Error("warm-up nav crashed");
    });
    const toContainText = vi.fn(async () => {});
    const screenshot = vi.fn(async ({ path }: { path: string }) =>
      writeFileSync(path, "fake image")
    );
    const locator = vi.fn(() => ({
      first: () => ({ isVisible: vi.fn(async () => true) }),
      waitFor: vi.fn(async () => {}),
    }));
    vi.doMock("@playwright/test", () => ({
      chromium: {
        launch: vi.fn(async () => ({
          newPage: vi.fn(async () => ({
            addInitScript: vi.fn(async () => {}),
            goto,
            evaluate: vi.fn(async () => ({ ok: true })),
            keyboard: { press: vi.fn(async () => {}) },
            locator,
            screenshot,
            url: () => "http://127.0.0.1:4242/",
          })),
          close: vi.fn(async () => {}),
        })),
      },
      expect: () => ({ toContainText }),
    }));
    const script = `
      const http = require("http");
      http.createServer((request, response) => {
        response.writeHead(200);
        response.end("ready");
      }).listen(Number(process.env.PORT), "127.0.0.1");
    `;

    const run = await verifyTicket(db, {
      ticketId: "ticket-1",
      bootCommand: [process.execPath, "-e", script],
      timeoutMs: 5_000,
    });

    expect(run.status).toBe("passed");
    // Warm-up visits the step's route first with a settled-network wait...
    expect(gotoCalls[0]?.options?.waitUntil).toBe("networkidle");
    expect(gotoCalls[0]?.url.endsWith("/")).toBe(true);
    // ...and the real step still performs its own navigation and assertions.
    expect(gotoCalls.some((call) => call.options?.waitUntil === "domcontentloaded")).toBe(true);
    expect(toContainText).toHaveBeenCalledWith("Projects", { timeout: 10_000 });
  });

  it("fails UI steps when splash skip setup fails", async () => {
    seedDemo([uiTextStep()]);
    const waitFor = vi.fn(async () => {});
    const isVisible = vi.fn(async () => true);
    const toContainText = vi.fn(async () => {});
    const screenshot = vi.fn(async ({ path }: { path: string }) =>
      writeFileSync(path, "fake image")
    );
    const locator = vi.fn(() => ({
      first: () => ({ isVisible }),
      waitFor,
    }));
    vi.doMock("@playwright/test", () => ({
      chromium: {
        launch: vi.fn(async () => ({
          newPage: vi.fn(async () => ({
            addInitScript: vi.fn(async () => {}),
            goto: vi.fn(async () => {}),
            evaluate: vi.fn(async () => ({ ok: false, error: "session storage disabled" })),
            keyboard: { press: vi.fn(async () => {}) },
            locator,
            screenshot,
            url: () => "http://127.0.0.1:4242/",
          })),
          close: vi.fn(async () => {}),
        })),
      },
      expect: () => ({ toContainText }),
    }));
    const baseUrl = await startFixtureServer();

    const run = await verifyTicket(db, { ticketId: "ticket-1", baseUrl });

    expect(run.status).toBe("failed");
    expect(run.manifest.stepVerdicts[0]?.message).toContain(
      "Brain Dump splash skip setup failed: session storage disabled"
    );
  });

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
    expect(run.identity).toMatchObject({
      provider: "unknown",
      actor: "unknown ralph",
      providerSource: "unknown",
      executionSurface: "cli-direct",
      workerId: null,
    });
    expect(run.manifest.verifier).toEqual(run.identity);
  });

  it("records verifier code sha separately from the target project sha", async () => {
    seedDemo([commandStep()]);

    const run = await verifyTicket(db, {
      ticketId: "ticket-1",
      projectPath: tempDir,
      execFileNoThrow: async (command, args, options) => {
        if (command === "git" && args.join(" ") === "rev-parse HEAD") {
          return {
            success: true,
            stdout: options?.cwd === tempDir ? "target-sha\n" : "verifier-sha\n",
            stderr: "",
            exitCode: 0,
          };
        }
        if (command === "git" && args.join(" ") === "status --short") {
          return { success: true, stdout: "", stderr: "", exitCode: 0 };
        }
        if (command === "git" && args.join(" ") === "diff --name-only HEAD~1 HEAD") {
          return { success: true, stdout: "", stderr: "", exitCode: 0 };
        }
        return { success: true, stdout: "command ok\n", stderr: "", exitCode: 0 };
      },
    });

    expect(run.gitSha).toBe("target-sha");
    expect(run.identity.codeGitSha).toBe("verifier-sha");
    expect(run.manifest.verifier.codeGitSha).toBe("verifier-sha");
  });

  it("keeps runs with non-certifiable coverage rationale uncertified", async () => {
    seedDemo([
      {
        ...apiStep(),
        coverageRationale: "criterion:1 requires an external provider account outside automation.",
      },
    ]);
    const baseUrl = await startFixtureServer();

    const run = await verifyTicket(db, { ticketId: "ticket-1", baseUrl });

    expect(run.status).toBe("uncertified");
    expect(run.certified).toBe(false);
    expect(run.manifest.stepVerdicts.at(-1)).toMatchObject({
      order: 0,
      status: "skipped",
      message:
        "Verification run uncertified because the demo includes a non-certifiable coverage rationale.",
    });
    const ticket = db
      .prepare("SELECT status, is_blocked FROM tickets WHERE id = 'ticket-1'")
      .get() as { status: string; is_blocked: number };
    expect(ticket).toEqual({ status: "ai_verification", is_blocked: 1 });
    const comment = db
      .prepare("SELECT content FROM ticket_comments WHERE ticket_id = 'ticket-1'")
      .get() as { content: string };
    expect(comment.content).toContain(
      "Rationale: criterion:1 requires an external provider account"
    );
  });

  it("certifies command and file steps with sealed evidence without booting an app", async () => {
    db.prepare("UPDATE projects SET path = ? WHERE id = 'project-1'").run(tempDir);
    writeFileSync(join(tempDir, "fixture.txt"), "file ok\n");
    seedDemo([commandStep(), fileStep()]);
    const commandCalls: Array<{
      command: string;
      args: string[];
      cwd?: string;
      env?: NodeJS.ProcessEnv;
    }> = [];

    const run = await verifyTicket(db, {
      ticketId: "ticket-1",
      projectPath: tempDir,
      execFileNoThrow: createCleanExecFileNoThrow((command, args, options) => {
        commandCalls.push({
          command,
          args,
          ...(options?.cwd ? { cwd: options.cwd } : {}),
          ...(options?.env ? { env: options.env } : {}),
        });
      }),
    });

    expect(run.status).toBe("passed");
    expect(run.certified).toBe(true);
    expect(run.manifest.port).toBe(0);
    expect(run.manifest.bootCommand).toEqual([]);
    expect(commandCalls).toEqual([
      {
        command: "node",
        args: ["--version"],
        cwd: tempDir,
        env: expect.not.objectContaining({ BRAIN_DUMP_PROVIDER: expect.any(String) }),
      },
    ]);
    expect(run.manifest.evidenceFiles.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("step-1-command.json"),
        expect.stringContaining("step-2-file.json"),
      ])
    );
  });

  it("allows noisy command output while keeping evidence output capped", async () => {
    db.prepare("UPDATE projects SET path = ? WHERE id = 'project-1'").run(tempDir);
    seedDemo([commandStep()]);
    let commandMaxBuffer = 0;

    const run = await verifyTicket(db, {
      ticketId: "ticket-1",
      projectPath: tempDir,
      execFileNoThrow: async (command, args, options) => {
        if (command === "git") return createCleanExecFileNoThrow()(command, args, options);
        commandMaxBuffer = options?.maxBuffer ?? 0;
        return {
          success: true,
          stdout: "command ok\n",
          stderr: "warning\n".repeat(20_000),
          exitCode: 0,
        };
      },
    });

    const evidencePath = run.manifest.stepVerdicts[0]?.evidenceFiles[0]?.path;
    if (!evidencePath) throw new Error("Expected command evidence");
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as {
      result: { stderr: string };
    };

    expect(run.status).toBe("passed");
    expect(commandMaxBuffer).toBe(16 * 1024 * 1024);
    expect(evidence.result.stderr.length).toBeLessThan(20_000 * "warning\n".length);
    expect(evidence.result.stderr).toContain("[truncated");
  });

  it("strips secret environment variables from command execution and redacts captured evidence", async () => {
    db.prepare("UPDATE projects SET path = ? WHERE id = 'project-1'").run(tempDir);
    const previousSecret = process.env.BRAIN_DUMP_TEST_SECRET_TOKEN;
    process.env.BRAIN_DUMP_TEST_SECRET_TOKEN = "super-secret-token-value";
    seedDemo([
      commandStep("missing super-secret-token-value"),
      fileStep("missing super-secret-token-value"),
    ]);
    writeFileSync(join(tempDir, "fixture.txt"), "file leaked super-secret-token-value\n");
    let commandEnv: NodeJS.ProcessEnv | undefined;

    try {
      const run = await verifyTicket(db, {
        ticketId: "ticket-1",
        projectPath: tempDir,
        execFileNoThrow: async (command, args, options) => {
          if (command === "git") return createCleanExecFileNoThrow()(command, args, options);
          commandEnv = options?.env;
          return {
            success: true,
            stdout: "stdout leaked super-secret-token-value\n",
            stderr: "Authorization: Bearer super-secret-token-value\n",
            exitCode: 0,
          };
        },
      });

      const commandEvidencePath = run.manifest.stepVerdicts[0]?.evidenceFiles[0]?.path;
      const fileEvidencePath = run.manifest.stepVerdicts[1]?.evidenceFiles[0]?.path;
      if (!commandEvidencePath || !fileEvidencePath) throw new Error("Expected evidence files");
      const commandEvidence = readFileSync(commandEvidencePath, "utf8");
      const fileEvidence = readFileSync(fileEvidencePath, "utf8");
      const finding = db
        .prepare("SELECT description FROM review_findings WHERE ticket_id = 'ticket-1' LIMIT 1")
        .get() as { description: string };

      expect(commandEnv).not.toHaveProperty("BRAIN_DUMP_TEST_SECRET_TOKEN");
      expect(commandEvidence).not.toContain("super-secret-token-value");
      expect(fileEvidence).not.toContain("super-secret-token-value");
      expect(JSON.stringify(run.manifest)).not.toContain("super-secret-token-value");
      expect(finding.description).not.toContain("super-secret-token-value");
      expect(commandEvidence).toContain("[redacted]");
      expect(fileEvidence).toContain("[redacted]");
      expect(finding.description).toContain("[redacted]");
    } finally {
      if (previousSecret === undefined) {
        delete process.env.BRAIN_DUMP_TEST_SECRET_TOKEN;
      } else {
        process.env.BRAIN_DUMP_TEST_SECRET_TOKEN = previousSecret;
      }
    }
  });

  it("files actionable findings when command assertions fail", async () => {
    seedDemo([commandStep("missing text")]);

    const run = await verifyTicket(db, {
      ticketId: "ticket-1",
      projectPath: tempDir,
      execFileNoThrow: createCleanExecFileNoThrow(),
    });

    expect(run.status).toBe("failed");
    expect(run.manifest.stepVerdicts[0]?.message).toContain("expected stdout to contain");
    const finding = db
      .prepare(
        "SELECT category, description FROM review_findings WHERE ticket_id = 'ticket-1' LIMIT 1"
      )
      .get() as { category: string; description: string };
    expect(finding.category).toBe("verification");
    expect(finding.description).toContain("expected stdout to contain");
    expect(finding.description).toContain("Evidence:");
  });

  it("rejects unsafe persisted command specs before execution", async () => {
    const unsafeStep = commandStep();
    if (unsafeStep.automation?.kind !== "command") throw new Error("Expected command step");
    unsafeStep.automation.command.argv = ["sh", "-c", "echo unsafe"];
    seedDemo([unsafeStep]);
    let commandExecuted = false;

    const run = await verifyTicket(db, {
      ticketId: "ticket-1",
      projectPath: tempDir,
      execFileNoThrow: createCleanExecFileNoThrow((command) => {
        if (command !== "git") commandExecuted = true;
      }),
    });

    expect(run.status).toBe("infra_error");
    expect(run.manifest.stepVerdicts[0]?.message).toContain("must not invoke a shell interpreter");
    expect(commandExecuted).toBe(false);
  });

  it("rejects destructive persisted command specs before execution", async () => {
    const unsafeStep = commandStep();
    if (unsafeStep.automation?.kind !== "command") throw new Error("Expected command step");
    unsafeStep.automation.command.argv = ["rm", "-rf", "tmp"];
    seedDemo([unsafeStep]);
    let commandExecuted = false;

    const run = await verifyTicket(db, {
      ticketId: "ticket-1",
      projectPath: tempDir,
      execFileNoThrow: createCleanExecFileNoThrow((command) => {
        if (command !== "git") commandExecuted = true;
      }),
    });

    expect(run.status).toBe("infra_error");
    expect(run.manifest.stepVerdicts[0]?.message).toContain("uses blocked command token");
    expect(commandExecuted).toBe(false);
  });

  it("records file read problems as failed step evidence", async () => {
    db.prepare("UPDATE projects SET path = ? WHERE id = 'project-1'").run(tempDir);
    mkdirSync(join(tempDir, "fixture.txt"));
    seedDemo([fileStep()]);

    const run = await verifyTicket(db, {
      ticketId: "ticket-1",
      projectPath: tempDir,
      execFileNoThrow: createCleanExecFileNoThrow(),
    });

    expect(run.status).toBe("failed");
    expect(run.manifest.stepVerdicts[0]).toMatchObject({
      order: 2,
      status: "failed",
    });
    expect(run.manifest.stepVerdicts[0]?.message).toContain("not a regular file");
    expect(run.manifest.stepVerdicts[0]?.evidenceFiles[0]?.path).toContain("step-2-file.json");
  });

  it("rejects sensitive persisted file specs before reading evidence", async () => {
    db.prepare("UPDATE projects SET path = ? WHERE id = 'project-1'").run(tempDir);
    writeFileSync(join(tempDir, ".env"), "DATABASE_URL=postgres://secret\n");
    const sensitiveStep = fileStep();
    if (sensitiveStep.automation?.kind !== "file") throw new Error("Expected file step");
    sensitiveStep.automation.path = ".env";
    sensitiveStep.automation.assert = [{ type: "exists" }];
    seedDemo([sensitiveStep]);

    const run = await verifyTicket(db, {
      ticketId: "ticket-1",
      projectPath: tempDir,
      execFileNoThrow: createCleanExecFileNoThrow(),
    });

    expect(run.status).toBe("infra_error");
    expect(run.manifest.stepVerdicts[0]?.message).toContain(
      "must not target sensitive credential or secret files"
    );
    expect(JSON.stringify(run.manifest)).not.toContain("postgres://secret");
  });

  it("does not snapshot file contents for exists-only file assertions", async () => {
    db.prepare("UPDATE projects SET path = ? WHERE id = 'project-1'").run(tempDir);
    writeFileSync(join(tempDir, "fixture.txt"), "file ok\nextra content\n");
    const existsStep = fileStep();
    if (existsStep.automation?.kind !== "file") throw new Error("Expected file step");
    existsStep.automation.assert = [{ type: "exists" }];
    seedDemo([existsStep]);

    const run = await verifyTicket(db, {
      ticketId: "ticket-1",
      projectPath: tempDir,
      execFileNoThrow: createCleanExecFileNoThrow(),
    });

    const evidencePath = run.manifest.stepVerdicts[0]?.evidenceFiles[0]?.path;
    if (!evidencePath) throw new Error("Expected file evidence");
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as {
      file: { snippet: string | null; hash: string | null };
    };

    expect(run.status).toBe("passed");
    expect(evidence.file.snippet).toBeNull();
    expect(evidence.file.hash).toBeNull();
  });

  it("rejects symlink escapes before reading file evidence", async () => {
    const projectPath = join(tempDir, "project");
    const outsidePath = join(tempDir, "outside");
    mkdirSync(projectPath);
    mkdirSync(outsidePath);
    writeFileSync(join(outsidePath, "secret.txt"), "file ok\n");
    symlinkSync(join(outsidePath, "secret.txt"), join(projectPath, "fixture.txt"));
    db.prepare("UPDATE projects SET path = ? WHERE id = 'project-1'").run(projectPath);
    seedDemo([fileStep()]);

    const run = await verifyTicket(db, {
      ticketId: "ticket-1",
      projectPath,
      execFileNoThrow: createCleanExecFileNoThrow(),
    });

    expect(run.status).toBe("infra_error");
    expect(run.manifest.stepVerdicts[0]?.message).toContain(
      "must not resolve outside the project directory"
    );
  });

  it("reruns the full command and file step suite after a verification failure", async () => {
    db.prepare("UPDATE projects SET path = ? WHERE id = 'project-1'").run(tempDir);
    writeFileSync(join(tempDir, "fixture.txt"), "wrong content\n");
    seedDemo([commandStep(), fileStep()]);
    let commandRunCount = 0;

    const firstRun = await verifyTicket(db, {
      ticketId: "ticket-1",
      projectPath: tempDir,
      execFileNoThrow: createCleanExecFileNoThrow((command) => {
        if (command === "node") commandRunCount += 1;
      }),
    });
    moveTicketBackToVerification();
    writeFileSync(join(tempDir, "fixture.txt"), "file ok\n");
    const secondRun = await verifyTicket(db, {
      ticketId: "ticket-1",
      projectPath: tempDir,
      execFileNoThrow: createCleanExecFileNoThrow((command) => {
        if (command === "node") commandRunCount += 1;
      }),
    });

    expect(firstRun.status).toBe("failed");
    expect(secondRun.status).toBe("passed");
    expect(secondRun.manifest.stepVerdicts.map((step) => step.order)).toEqual([1, 2]);
    expect(commandRunCount).toBe(2);
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

  it("marks runs uncertified when committed verification code changed", async () => {
    seedDemo([apiStep()]);
    const baseUrl = await startFixtureServer();

    const run = await verifyTicket(db, {
      ticketId: "ticket-1",
      baseUrl,
      execFileNoThrow: async (command, args) => {
        if (command === "git" && args.join(" ") === "rev-parse HEAD") {
          return { success: true, stdout: "abc123\n", stderr: "", exitCode: 0 };
        }
        if (command === "git" && args.join(" ") === "status --short") {
          return { success: true, stdout: "", stderr: "", exitCode: 0 };
        }
        if (command === "git" && args.join(" ") === "diff --name-only HEAD~1 HEAD") {
          return {
            success: true,
            stdout: "core/verification-lifecycle.ts\n",
            stderr: "",
            exitCode: 0,
          };
        }
        return { success: true, stdout: "", stderr: "", exitCode: 0 };
      },
    });

    expect(run.status).toBe("uncertified");
    expect(run.manifest.stepVerdicts.at(-1)?.message).toContain("verification/manifest code");
  });

  it("does not settle a passed run after the ticket leaves ai_verification", async () => {
    seedDemo([commandStep()]);

    await expect(
      verifyTicket(db, {
        ticketId: "ticket-1",
        projectPath: tempDir,
        execFileNoThrow: createCleanExecFileNoThrow((command) => {
          if (command === "node") {
            db.prepare("UPDATE tickets SET status = 'ready' WHERE id = 'ticket-1'").run();
          }
        }),
      })
    ).rejects.toThrow(/ai_verification/);
    expect(db.prepare("SELECT status FROM tickets WHERE id = 'ticket-1'").get()).toMatchObject({
      status: "ready",
    });
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
      identity: {
        provider: "claude",
        actor: "claude ralph",
        providerSource: "explicit",
        executionSurface: "cli-direct",
        workerId: null,
        codeGitSha: "abc123",
      },
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
        verifier: {
          provider: "claude",
          actor: "claude ralph",
          providerSource: "explicit",
          executionSurface: "cli-direct",
          workerId: null,
          codeGitSha: "abc123",
        },
        manifestHash: "manifest-hash",
      },
    };

    expect(() =>
      verificationTestInternals.attachRunEvidenceAndReport(db, run, [apiStep()])
    ).toThrow(/evidence file is missing/);

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

  it("keeps duplicate enqueue cheap by not claiming or incrementing attempts", () => {
    seedDemo([apiStep()]);

    enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:00:00.000Z" });
    const refreshed = enqueueVerificationJob(db, "ticket-1", {
      now: "2026-03-08T01:00:01.000Z",
    });

    expect(refreshed).toMatchObject({
      status: "queued",
      attemptCount: 0,
      leasedBy: null,
      leaseExpiresAt: null,
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

  it("dead-letters exhausted jobs through the durable settlement path", () => {
    seedDemo([apiStep()]);
    const job = enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:00:00.000Z" });
    const claimed = claimNextVerificationJob(db, {
      workerId: "worker-1",
      now: "2026-03-08T01:00:01.000Z",
      leaseMs: 60_000,
    });

    const dead = settleVerificationJob(db, {
      jobId: job.id,
      workerId: "worker-1",
      attemptCount: claimed!.attemptCount,
      status: "dead",
      error: "retry budget exhausted",
      now: "2026-03-08T01:00:02.000Z",
    });

    expect(dead).toMatchObject({
      status: "dead",
      leasedBy: null,
      leaseExpiresAt: null,
      completedAt: "2026-03-08T01:00:02.000Z",
      lastError: "retry budget exhausted",
    });
    expect(
      claimNextVerificationJob(db, {
        workerId: "worker-2",
        now: "2026-03-08T01:00:03.000Z",
        leaseMs: 60_000,
      })
    ).toBeNull();
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
  it.each([
    { name: "pass", steps: [apiStep()], expectedStatus: "passed" },
    { name: "assertion failure", steps: [apiStep(201)], expectedStatus: "failed" },
    { name: "uncertified", steps: [manualStep()], expectedStatus: "uncertified" },
    { name: "infra error", steps: [invalidAutomationStep()], expectedStatus: "infra_error" },
  ])(
    "persists the same lifecycle state for direct and worker $name outcomes",
    async ({ steps, expectedStatus }) => {
      seedDemo(steps);
      seedAdditionalTicket("ticket-2", steps);
      enqueueVerificationJob(db, "ticket-2", { now: "2026-03-08T01:00:00.000Z" });
      const baseUrl = await startFixtureServer();

      const directRun = await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
      const workerResult = await runNextVerificationJob(db, {
        workerId: "worker-1",
        baseUrl,
        maxInfraAttempts: 1,
        now: () => new Date("2026-03-08T01:00:01.000Z"),
      });

      expect(directRun.status).toBe(expectedStatus);
      expect(workerResult.runStatus).toBe(expectedStatus);
      expect(lifecycleSnapshot("ticket-2")).toEqual(lifecycleSnapshot("ticket-1"));
    }
  );

  it("claims a queued job and verifies it without a per-ticket command", async () => {
    seedDemo([apiStep()]);
    enqueueVerificationJob(db, "ticket-1", {
      now: "2026-03-08T01:00:00.000Z",
      provider: "opencode",
    });
    const baseUrl = await startFixtureServer();

    const result = await runNextVerificationJob(db, {
      workerId: "worker-1",
      provider: "opencode",
      executionSurface: "enqueue-drain",
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
      provider: "opencode",
      actor: "opencode ralph",
      providerSource: "explicit",
      executionSurface: "enqueue-drain",
      workerId: "worker-1",
    });
    const run = listVerificationRuns(db, "ticket-1")[0]!;
    expect(run.identity).toMatchObject({
      provider: "opencode",
      actor: "opencode ralph",
      providerSource: "explicit",
      executionSurface: "enqueue-drain",
      workerId: "worker-1",
    });
    expect(run.manifest.verifier).toEqual(run.identity);
    const evidenceUploaders = db
      .prepare("SELECT attachments FROM tickets WHERE id = 'ticket-1'")
      .get() as { attachments: string };
    expect(JSON.parse(evidenceUploaders.attachments)).toEqual(
      expect.arrayContaining([expect.objectContaining({ uploadedBy: "opencode ralph" })])
    );
    expect(
      db.prepare("SELECT author FROM ticket_comments WHERE ticket_id = 'ticket-1'").get()
    ).toMatchObject({ author: "opencode ralph" });
    expect(db.prepare("SELECT status FROM tickets WHERE id = 'ticket-1'").get()).toMatchObject({
      status: "done",
    });
  });

  it("preserves queued provider attribution when a drain has no provider option", async () => {
    seedDemo([apiStep()]);
    enqueueVerificationJob(db, "ticket-1", {
      now: "2026-03-08T01:00:00.000Z",
      provider: "opencode",
    });
    const baseUrl = await startFixtureServer();

    await runNextVerificationJob(db, {
      workerId: "worker-1",
      executionSurface: "enqueue-drain",
      baseUrl,
      now: () => new Date("2026-03-08T01:00:01.000Z"),
    });

    expect(getVerificationJob(db, "ticket-1")).toMatchObject({
      provider: "opencode",
      actor: "opencode ralph",
      providerSource: "explicit",
    });
    expect(listVerificationRuns(db, "ticket-1")[0]?.identity).toMatchObject({
      provider: "opencode",
      actor: "opencode ralph",
      providerSource: "explicit",
    });
  });

  it("drains failed retry jobs that become ready inside the follow budget", async () => {
    seedDemo([apiStep()]);
    const job = enqueueVerificationJob(db, "ticket-1", { now: new Date().toISOString() });
    const nextRunAt = new Date(Date.now() + 10).toISOString();
    db.prepare(
      "UPDATE verification_jobs SET status = 'failed', next_run_at = ?, last_error = 'retry me' WHERE id = ?"
    ).run(nextRunAt, job.id);

    const result = await drainVerificationQueue(db, {
      workerId: "drain-worker",
      followRetryBudgetMs: 1_000,
      verifyTicketFn: async (_db, params) => {
        settleVerificationJob(db, {
          jobId: params.verificationJobLease!.jobId,
          workerId: params.verificationJobLease!.workerId,
          attemptCount: params.verificationJobLease!.attemptCount,
          status: "succeeded",
        });
        return fakeWorkerRun(params);
      },
    });

    expect(result.processed).toBe(1);
    expect(getVerificationJob(db, "ticket-1")).toMatchObject({ status: "succeeded" });
  });

  it("infers queued job attribution from session metadata before falling back to unknown", () => {
    seedDemo([apiStep()]);
    db.prepare(
      `INSERT INTO ralph_sessions (id, ticket_id, project_id, current_state, state_history, started_at)
       VALUES ('session-provider', 'ticket-1', 'project-1', 'reviewing', ?, '2026-03-08T00:59:00.000Z')`
    ).run(JSON.stringify([{ state: "reviewing", metadata: { provider: "cursor-agent" } }]));

    const job = enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:00:00.000Z" });

    expect(job).toMatchObject({
      provider: "cursor-agent",
      actor: "cursor-agent ralph",
      providerSource: "session",
      executionSurface: "enqueue-drain",
      workerId: null,
      codeGitSha: null,
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

  it("rejects a direct verification run before booting while a worker owns the active lease", async () => {
    seedDemo([apiStep()]);
    enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:00:00.000Z" });
    claimNextVerificationJob(db, {
      workerId: "worker-1",
      now: "2026-03-08T01:00:01.000Z",
      leaseMs: 60_000,
    });
    const baseUrl = await startFixtureServer();

    await expect(verifyTicket(db, { ticketId: "ticket-1", baseUrl })).rejects.toThrow(
      /automatic verification job/
    );
    expect(getVerificationJob(db, "ticket-1")).toMatchObject({
      status: "running",
      leasedBy: "worker-1",
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
    expect(getVerificationOperationsStatus(db, { now: "2026-03-08T01:01:00.000Z" })).toMatchObject({
      queue: {
        depth: 1,
        runnableDepth: 1,
        byStatus: { queued: 1 },
        oldestQueuedAgeMs: 60_000,
      },
      schema: { ok: true },
    });
  });

  it("pauses and resumes worker claims with ticket audit comments but no certification", async () => {
    seedDemo([apiStep()]);
    enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:00:00.000Z" });

    const paused = setVerificationWorkerPaused(db, {
      paused: true,
      reason: "playwright outage",
      now: "2026-03-08T01:00:01.000Z",
    });
    const verifyTicketFn: NonNullable<VerificationWorkerOptions["verifyTicketFn"]> = vi.fn(
      async (_db, params) => fakeWorkerRun(params)
    );
    const result = await runNextVerificationJob(db, {
      workerId: "paused-worker",
      verifyTicketFn,
    });

    expect(paused).toMatchObject({ paused: true, affectedTicketIds: ["ticket-1"] });
    expect(isVerificationWorkerPaused(db)).toBe(true);
    expect(result).toEqual({ claimed: false, workerId: "paused-worker" });
    expect(verifyTicketFn).not.toHaveBeenCalled();
    expect(getVerificationJob(db, "ticket-1")).toMatchObject({ status: "queued" });
    expect(listVerificationRuns(db, "ticket-1")).toHaveLength(0);

    const resumed = setVerificationWorkerPaused(db, {
      paused: false,
      reason: "browser fixed",
      now: "2026-03-08T01:00:02.000Z",
    });
    expect(resumed).toMatchObject({ paused: false, affectedTicketIds: ["ticket-1"] });
    expect(isVerificationWorkerPaused(db)).toBe(false);
    expect(listVerificationRuns(db, "ticket-1")).toHaveLength(0);

    const comments = db
      .prepare("SELECT content FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at ASC")
      .all("ticket-1") as Array<{ content: string }>;
    expect(comments.map((comment) => comment.content).join("\n")).toContain(
      "Verification Worker Paused"
    );
    expect(comments.map((comment) => comment.content).join("\n")).toContain(
      "Verification Worker Resumed"
    );
  });

  it("dead-letters and requeues jobs with audit comments without certifying tickets", () => {
    seedDemo([apiStep()]);
    enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:00:00.000Z" });

    const dead = markVerificationJobDead(db, {
      ticketId: "ticket-1",
      reason: "fixture removed",
      now: "2026-03-08T01:00:01.000Z",
    });
    expect(dead).toMatchObject({ previousStatus: "queued", ticketBlocked: true });
    expect(getVerificationJob(db, "ticket-1")).toMatchObject({
      status: "dead",
      lastError: "Verification job marked dead: fixture removed",
    });
    expect(
      db.prepare("SELECT status, is_blocked FROM tickets WHERE id = 'ticket-1'").get()
    ).toMatchObject({
      status: "ai_verification",
      is_blocked: 1,
    });
    expect(listVerificationRuns(db, "ticket-1")).toHaveLength(0);

    const requeued = requeueVerificationJob(db, {
      ticketId: "ticket-1",
      reason: "fixture restored",
      now: "2026-03-08T01:00:02.000Z",
    });
    expect(requeued).toMatchObject({ previousStatus: "dead", ticketBlocked: false });
    expect(getVerificationJob(db, "ticket-1")).toMatchObject({
      status: "queued",
      attemptCount: 0,
      lastError: null,
      completedAt: null,
    });
    expect(
      db.prepare("SELECT status, is_blocked FROM tickets WHERE id = 'ticket-1'").get()
    ).toMatchObject({
      status: "ai_verification",
      is_blocked: 0,
    });
    expect(listVerificationRuns(db, "ticket-1")).toHaveLength(0);

    const comments = db
      .prepare("SELECT content FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at ASC")
      .all("ticket-1") as Array<{ content: string }>;
    const commentText = comments.map((comment) => comment.content).join("\n");
    expect(commentText).toContain("Verification Job Dead-Lettered");
    expect(commentText).toContain("Verification Job Requeued");
  });

  it("surfaces stale leases, retrying jobs, dead letters, and schema drift for doctor output", () => {
    seedDemo([apiStep()]);
    const job = enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:00:00.000Z" });
    claimNextVerificationJob(db, {
      workerId: "stale-worker",
      now: "2026-03-08T01:00:01.000Z",
      leaseMs: 1_000,
    });

    let status = getVerificationOperationsStatus(db, {
      now: "2026-03-08T01:00:03.000Z",
      strandedAfterMs: 1,
    });
    expect(status.queue.staleRunningLeases).toBe(1);
    expect(status.issues.map((issue) => issue.message).join("\n")).toContain("stale");

    requeueVerificationJob(db, {
      ticketId: "ticket-1",
      reason: "lease owner crashed",
      now: "2026-03-08T01:00:04.000Z",
    });
    db.prepare(
      `UPDATE verification_jobs
       SET status = 'failed', next_run_at = ?, last_error = 'boot retry', completed_at = NULL, updated_at = ?
       WHERE id = ?`
    ).run("2026-03-08T01:05:00.000Z", "2026-03-08T01:00:05.000Z", job.id);

    status = getVerificationOperationsStatus(db, { now: "2026-03-08T01:00:06.000Z" });
    expect(status.queue.retryingCount).toBe(1);
    expect(status.queue.lastError).toBe("boot retry");

    markVerificationJobDead(db, {
      ticketId: "ticket-1",
      reason: "unrecoverable boot loop",
      now: "2026-03-08T01:00:07.000Z",
    });
    status = getVerificationOperationsStatus(db, { now: "2026-03-08T01:00:08.000Z" });
    expect(status.queue.deadCount).toBe(1);
    expect(status.issues.map((issue) => issue.message).join("\n")).toContain("dead-letter");

    db.prepare("ALTER TABLE verification_jobs RENAME TO verification_jobs_drift").run();
    status = getVerificationOperationsStatus(db, { now: "2026-03-08T01:00:09.000Z" });
    expect(status.schema).toMatchObject({ ok: false, missingTables: ["verification_jobs"] });
    expect(status.issues.some((issue) => issue.severity === "error")).toBe(true);
  });
});

describe("verification drain (one-shot worker)", () => {
  it("drains every claimable job until the queue is empty", async () => {
    seedDemo([apiStep()]);
    seedAdditionalTicket("ticket-2", [apiStep()]);
    enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:00:00.000Z" });
    enqueueVerificationJob(db, "ticket-2", { now: "2026-03-08T01:00:00.000Z" });
    const baseUrl = await startFixtureServer();

    const result = await drainVerificationQueue(db, {
      baseUrl,
      followRetryBudgetMs: 0,
      now: () => new Date("2026-03-08T01:00:01.000Z"),
    });

    expect(result.processed).toBe(2);
    expect(result.lastError).toBeNull();
    expect(db.prepare("SELECT status FROM tickets WHERE id = 'ticket-1'").get()).toMatchObject({
      status: "done",
    });
    expect(db.prepare("SELECT status FROM tickets WHERE id = 'ticket-2'").get()).toMatchObject({
      status: "done",
    });
    expect(getVerificationWorkerQueueStatus(db).queueDepth).toBe(0);
  });

  it("returns without waiting when only future retries remain outside the budget", async () => {
    seedDemo([apiStep()]);
    enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:00:00.000Z" });
    db.prepare("UPDATE verification_jobs SET next_run_at = ?").run("2026-03-08T02:00:00.000Z");

    const result = await drainVerificationQueue(db, {
      followRetryBudgetMs: 0,
      now: () => new Date("2026-03-08T01:00:01.000Z"),
    });

    expect(result.processed).toBe(0);
    expect(getVerificationJob(db, "ticket-1")).toMatchObject({ status: "queued" });
  });

  it("spawns a detached one-shot drain command that loads current on-disk code", () => {
    const child = { pid: 4242, unref: vi.fn() };
    const spawnImpl = vi.fn(() => child);

    const result = spawnDetachedVerificationDrain({
      brainDumpRoot: "/repo",
      spawnImpl: spawnImpl as unknown as typeof import("child_process").spawn,
    });

    expect(result).toEqual({ spawned: true, pid: 4242 });
    expect(spawnImpl).toHaveBeenCalledWith(
      process.execPath,
      ["--import", "tsx", "cli/brain-dump.ts", "verify", "worker", "--drain"],
      expect.objectContaining({
        cwd: "/repo",
        stdio: "ignore",
        detached: process.platform !== "win32",
        env: expect.objectContaining({ BRAIN_DUMP_VERIFICATION_SURFACE: "enqueue-drain" }),
      })
    );
    expect(child.unref).toHaveBeenCalled();
  });

  it("reports spawn failures instead of throwing so the job stays queued", () => {
    const errors: string[] = [];

    const result = spawnDetachedVerificationDrain({
      brainDumpRoot: "/repo",
      spawnImpl: (() => {
        throw new Error("spawn ENOENT");
      }) as unknown as typeof import("child_process").spawn,
      logError: (message) => errors.push(message),
    });

    expect(result).toMatchObject({ spawned: false, error: "spawn ENOENT" });
    expect(errors[0]).toContain("spawn ENOENT");
  });

  it("resolves the Brain Dump root from adapter module locations", () => {
    const cliModuleUrl = pathToFileURL(join(process.cwd(), "cli", "commands", "verify.ts")).href;
    const root = resolveBrainDumpRootFrom(cliModuleUrl);
    expect(root && resolve(root)).toBe(resolve(process.cwd()));

    const nowhere = pathToFileURL(join(tmpdir(), "not-brain-dump", "x.ts")).href;
    expect(resolveBrainDumpRootFrom(nowhere)).toBeNull();
  });

  it("blocks execution in verifier boots and keeps the resident poller opt-in", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VITEST", "false");
    vi.stubEnv("BRAIN_DUMP_DISABLE_VERIFICATION_WORKER", "");
    vi.stubEnv("BRAIN_DUMP_DISABLE_DB_STARTUP_TASKS", "");
    vi.stubEnv("BRAIN_DUMP_VERIFY_BOOT", "");
    vi.stubEnv("PLAYWRIGHT_E2E", "");
    vi.stubEnv("BRAIN_DUMP_VERIFICATION_WORKER_POLL", "");
    try {
      expect(isVerificationExecutionAllowedFromEnv()).toBe(true);
      // Default: no resident poller even where execution is allowed.
      expect(shouldStartVerificationWorkerFromEnv()).toBe(false);

      vi.stubEnv("BRAIN_DUMP_VERIFICATION_WORKER_POLL", "1");
      expect(shouldStartVerificationWorkerFromEnv()).toBe(true);

      // A verifier-booted app must never execute jobs, opt-in or not.
      vi.stubEnv("BRAIN_DUMP_VERIFY_BOOT", "1");
      expect(isVerificationExecutionAllowedFromEnv()).toBe(false);
      expect(shouldStartVerificationWorkerFromEnv()).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
