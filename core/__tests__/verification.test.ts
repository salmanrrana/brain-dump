import { createServer, type Server } from "http";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "fs";
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
  hasClaimableVerificationJob,
  isVerificationWorkerPaused,
  listVerificationJobs,
  renewVerificationJobLease,
  settleVerificationJob,
} from "../verification-queue.ts";
import {
  getVerificationOperationsStatus,
  markVerificationJobDead,
  reconcileVerificationTicketStates,
  requeueVerificationJob,
  resolveVerificationFailure,
  setVerificationWorkerPaused,
} from "../verification-ops.ts";
import { classifyVerificationRunFailure } from "../verification-lifecycle.ts";
import {
  drainVerificationQueue,
  getVerificationWorkerQueueStatus,
  isVerificationExecutionAllowedFromEnv,
  resolveBrainDumpRootFrom,
  runNextVerificationJob,
  shouldStartVerificationWorkerFromEnv,
  spawnDetachedVerificationDrain,
  spawnDetachedVerificationDrainIfNeeded,
  type VerificationWorkerOptions,
} from "../verification-worker.ts";
import { saveAutonomousEpicLaunch } from "../epic-continuation.ts";
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
    if (command === "git" && args.join(" ") === "status --short --untracked-files=all") {
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
    if (request.url?.startsWith("/health")) {
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

  it("honors a project-declared start command from .brain-dump/verify.json for any stack", () => {
    mkdirSync(join(tempDir, ".brain-dump"), { recursive: true });
    writeFileSync(
      join(tempDir, ".brain-dump", "verify.json"),
      JSON.stringify({ start: ["uvicorn", "app:app", "--port", "{port}", "--host", "{host}"] })
    );

    expect(verificationTestInternals.discoverBootCommand(tempDir, 51234)).toEqual([
      "uvicorn",
      "app:app",
      "--port",
      "51234",
      "--host",
      "127.0.0.1",
    ]);
  });

  it("boots a non-Node project with the AI-authored demo app command", async () => {
    mkdirSync(join(tempDir, "server"));
    writeFileSync(
      join(tempDir, "server", "verification-server.mjs"),
      `import { createServer } from "node:http";
if (process.env.BRAIN_DUMP_TEST_SECRET_TOKEN) process.exit(42);
const host = process.argv[2];
const port = Number(process.argv[3]);
createServer((request, response) => {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ ok: true }));
}).listen(port, host);`
    );
    seedDemo([
      {
        ...apiStep(),
        app: {
          start: ["node", "verification-server.mjs", "{host}", "{port}"],
          cwd: "server",
        },
      },
    ]);

    process.env.BRAIN_DUMP_TEST_SECRET_TOKEN = "must-not-reach-project-app";
    let run: VerificationRun;
    try {
      run = await verifyTicket(db, { ticketId: "ticket-1", timeoutMs: 5_000 });
    } finally {
      delete process.env.BRAIN_DUMP_TEST_SECRET_TOKEN;
    }

    expect(run.status).toBe("passed");
    expect(run.manifest.bootCommand).toEqual([
      "node",
      "verification-server.mjs",
      "127.0.0.1",
      String(run.manifest.port),
    ]);
    expect(run.manifest.bootCwd).toBe("server");
  });

  it("honors a package.json brainDump.verify.start declaration", () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ brainDump: { verify: { start: "npm run serve -- --port {port}" } } })
    );

    expect(verificationTestInternals.discoverBootCommand(tempDir, 44001)).toEqual([
      "npm",
      "run",
      "serve",
      "--",
      "--port",
      "44001",
    ]);
  });

  it("falls back to a serve script when no dev/start script exists", () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ scripts: { serve: "http-server ." } })
    );

    expect(verificationTestInternals.discoverBootCommand(tempDir, 45000)).toEqual([
      "npm",
      "run",
      "serve",
      "--",
      "--host",
      "127.0.0.1",
      "--port",
      "45000",
    ]);
  });

  it("gives an actionable error listing scripts when the project has no bootable command", () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ scripts: { lint: "eslint .", test: "vitest" } })
    );

    expect(() => verificationTestInternals.discoverBootCommand(tempDir, 46000)).toThrow(
      /Available scripts: lint, test.*\.brain-dump\/verify\.json/s
    );
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
      first: () => ({
        isVisible,
        textContent,
        waitFor,
        click: vi.fn(async () => {}),
        fill: vi.fn(async () => {}),
      }),
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

  it("passes UI steps whose action selectors match many rendered elements", async () => {
    const step = uiTextStep();
    if (step.automation?.kind !== "ui") throw new Error("Expected ui step");
    step.automation.actions = [
      { act: "waitFor", selector: "[data-testid^='portfolio-row-']" },
      { act: "click", selector: "button[aria-label='Refresh dashboard data']" },
    ];
    seedDemo([step]);
    const firstWaitFor = vi.fn(async () => {});
    const firstClick = vi.fn(async () => {});
    // Strict (multi-match) waitFor throws exactly like Playwright does when a
    // prefix selector resolves to many populated rows; only the splash
    // dismissal passes options and is allowed through.
    const strictWaitFor = vi.fn(async (options?: unknown) => {
      if (!options) throw new Error("strict mode violation: resolved to 26 elements");
    });
    const toContainText = vi.fn(async () => {});
    const screenshot = vi.fn(async ({ path }: { path: string }) =>
      writeFileSync(path, "fake image")
    );
    const locator = vi.fn(() => ({
      first: () => ({
        isVisible: vi.fn(async () => true),
        waitFor: firstWaitFor,
        click: firstClick,
        fill: vi.fn(async () => {}),
      }),
      waitFor: strictWaitFor,
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

    expect(run.status).toBe("passed");
    expect(firstWaitFor).toHaveBeenCalled();
    expect(firstClick).toHaveBeenCalled();
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
      first: () => ({
        isVisible: vi.fn(async () => true),
        waitFor: vi.fn(async () => {}),
        click: vi.fn(async () => {}),
        fill: vi.fn(async () => {}),
      }),
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
      first: () => ({
        isVisible: vi.fn(async () => true),
        waitFor: vi.fn(async () => {}),
        click: vi.fn(async () => {}),
        fill: vi.fn(async () => {}),
      }),
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
      first: () => ({
        isVisible: vi.fn(async () => true),
        waitFor: vi.fn(async () => {}),
        click: vi.fn(async () => {}),
        fill: vi.fn(async () => {}),
      }),
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
      first: () => ({
        isVisible,
        waitFor: vi.fn(async () => {}),
        click: vi.fn(async () => {}),
        fill: vi.fn(async () => {}),
      }),
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
      .prepare(
        "SELECT author, type, phase, actor_kind, provider, model_provider, model_name FROM ticket_comments WHERE ticket_id = 'ticket-1'"
      )
      .get();
    expect(comment).toEqual({
      author: "unknown ralph",
      type: "verification_report",
      phase: "ai_verification",
      actor_kind: "system",
      provider: "unknown",
      model_provider: null,
      model_name: null,
    });
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
        if (command === "git" && args.join(" ") === "status --short --untracked-files=all") {
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

  it("returns first-time coverage-rationale runs to implementation with an actionable finding", async () => {
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
    expect(ticket).toEqual({ status: "in_progress", is_blocked: 0 });
    const finding = db
      .prepare(
        "SELECT severity, category, description, status FROM review_findings WHERE ticket_id = 'ticket-1'"
      )
      .get() as { severity: string; category: string; description: string; status: string };
    expect(finding).toMatchObject({ severity: "major", category: "verification", status: "open" });
    expect(finding.description).toContain("passed every executed step but could not be certified");
    expect(finding.description).toContain("criterion:1 requires an external provider account");
    const report = db
      .prepare(
        "SELECT content FROM ticket_comments WHERE ticket_id = 'ticket-1' AND type = 'verification_report'"
      )
      .get() as { content: string };
    expect(report.content).toContain(
      "Rationale: criterion:1 requires an external provider account"
    );
    const healComment = db
      .prepare(
        "SELECT content FROM ticket_comments WHERE ticket_id = 'ticket-1' AND type = 'comment'"
      )
      .get() as { content: string };
    expect(healComment.content).toContain("returned to implementation");
    expect(healComment.content).toContain("What to do next");
  });

  it("replaces a stale epic continuation so an uncertified return has a resumer", async () => {
    seedDemo([
      {
        ...apiStep(),
        coverageRationale: "criterion:1 requires an external provider account outside automation.",
      },
    ]);
    const now = new Date().toISOString();
    db.prepare("INSERT INTO epics (id, title, project_id, created_at) VALUES (?, ?, ?, ?)").run(
      "epic-1",
      "Verification Epic",
      "project-1",
      now
    );
    db.prepare("UPDATE tickets SET epic_id = 'epic-1' WHERE id = 'ticket-1'").run();
    db.prepare(
      `INSERT INTO tickets (id, title, status, priority, position, project_id, epic_id, created_at, updated_at)
       VALUES ('ticket-2', 'Earlier ticket', 'done', 'high', 2, 'project-1', 'epic-1', ?, ?)`
    ).run(now, now);
    saveAutonomousEpicLaunch(db, {
      epicId: "epic-1",
      projectPath: tempDir,
      scriptPath: "/tmp/ralph.sh",
      maxIterations: 7,
    });
    db.prepare(
      `INSERT INTO epic_continuation_jobs
         (id, epic_id, ticket_id, status, attempt_count, next_run_at, leased_by, lease_expires_at, created_at, updated_at)
       VALUES ('stale-job', 'epic-1', 'ticket-2', 'running', 1, ?, 'dead-worker', '2099-01-01T00:00:00.000Z', ?, ?)`
    ).run(now, now, now);
    const baseUrl = await startFixtureServer();

    const run = await verifyTicket(db, { ticketId: "ticket-1", baseUrl });

    expect(run.status).toBe("uncertified");
    const continuation = db
      .prepare("SELECT ticket_id, status FROM epic_continuation_jobs WHERE epic_id = 'epic-1'")
      .get() as { ticket_id: string; status: string };
    expect(continuation).toEqual({ ticket_id: "ticket-1", status: "queued" });
    const attention = db
      .prepare(
        "SELECT count(*) count FROM ticket_comments WHERE ticket_id = 'ticket-1' AND content LIKE '%no autonomous resumer%'"
      )
      .get() as { count: number };
    expect(attention.count).toBe(0);
  });

  it("warns on the ticket when a live continuation for another ticket holds the epic slot", async () => {
    seedDemo([
      {
        ...apiStep(),
        coverageRationale: "criterion:1 requires an external provider account outside automation.",
      },
    ]);
    const now = new Date().toISOString();
    db.prepare("INSERT INTO epics (id, title, project_id, created_at) VALUES (?, ?, ?, ?)").run(
      "epic-1",
      "Verification Epic",
      "project-1",
      now
    );
    db.prepare("UPDATE tickets SET epic_id = 'epic-1' WHERE id = 'ticket-1'").run();
    db.prepare(
      `INSERT INTO tickets (id, title, status, priority, position, project_id, epic_id, created_at, updated_at)
       VALUES ('ticket-2', 'Sibling repair', 'in_progress', 'high', 2, 'project-1', 'epic-1', ?, ?)`
    ).run(now, now);
    saveAutonomousEpicLaunch(db, {
      epicId: "epic-1",
      projectPath: tempDir,
      scriptPath: "/tmp/ralph.sh",
      maxIterations: 7,
    });
    db.prepare(
      `INSERT INTO epic_continuation_jobs
         (id, epic_id, ticket_id, status, attempt_count, next_run_at, leased_by, lease_expires_at, created_at, updated_at)
       VALUES ('live-job', 'epic-1', 'ticket-2', 'running', 1, ?, 'live-worker', '2099-01-01T00:00:00.000Z', ?, ?)`
    ).run(now, now, now);
    const baseUrl = await startFixtureServer();

    const run = await verifyTicket(db, { ticketId: "ticket-1", baseUrl });

    expect(run.status).toBe("uncertified");
    const continuation = db
      .prepare("SELECT ticket_id, status FROM epic_continuation_jobs WHERE epic_id = 'epic-1'")
      .get() as { ticket_id: string; status: string };
    expect(continuation).toEqual({ ticket_id: "ticket-2", status: "running" });
    const attention = db
      .prepare(
        "SELECT content FROM ticket_comments WHERE ticket_id = 'ticket-1' AND content LIKE '%no autonomous resumer%'"
      )
      .get() as { content: string };
    expect(attention.content).toContain("was **not** scheduled");
    expect(attention.content).toContain("ticket-2");
  });

  it("blocks the second consecutive uncertified run for human attention", async () => {
    seedDemo([
      {
        ...apiStep(),
        coverageRationale: "criterion:1 requires an external provider account outside automation.",
      },
    ]);
    const baseUrl = await startFixtureServer();

    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
    moveTicketBackToVerification();
    const secondRun = await verifyTicket(db, { ticketId: "ticket-1", baseUrl });

    expect(secondRun.status).toBe("uncertified");
    const ticket = db
      .prepare("SELECT status, is_blocked, blocked_reason FROM tickets WHERE id = 'ticket-1'")
      .get() as { status: string; is_blocked: number; blocked_reason: string | null };
    expect(ticket.status).toBe("in_progress");
    expect(ticket.is_blocked).toBe(1);
    expect(ticket.blocked_reason).toContain("non-certifiable coverage rationale");
    const comments = db
      .prepare(
        "SELECT content FROM ticket_comments WHERE ticket_id = 'ticket-1' AND type = 'comment' ORDER BY created_at"
      )
      .all() as Array<{ content: string }>;
    expect(comments.at(-1)?.content).toContain("Needs Attention — verification blocked");
    expect(comments.at(-1)?.content).toContain("still not certifiable");
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

  it("certifies a newly generated artifact when a file step explicitly verifies it", async () => {
    const artifactPath = join(tempDir, "generated", "report.json");
    const generatedFileStep = fileStep('"ok":true');
    if (generatedFileStep.automation?.kind !== "file") throw new Error("Expected file step");
    generatedFileStep.automation.path = "generated/report.json";
    seedDemo([commandStep("generated"), generatedFileStep]);
    let generated = false;

    const run = await verifyTicket(db, {
      ticketId: "ticket-1",
      projectPath: tempDir,
      execFileNoThrow: async (command, args, options) => {
        const joined = args.join(" ");
        if (command === "git" && joined === "rev-parse HEAD") {
          return { success: true, stdout: "artifact-sha\n", stderr: "", exitCode: 0 };
        }
        if (command === "git" && joined === "status --short --untracked-files=all") {
          return {
            success: true,
            stdout: generated && options?.cwd === tempDir ? "?? generated/report.json\n" : "",
            stderr: "",
            exitCode: 0,
          };
        }
        if (command === "git" && joined === "diff --name-only HEAD~1 HEAD") {
          return { success: true, stdout: "", stderr: "", exitCode: 0 };
        }
        if (command === "git" && args[0] === "diff") {
          return { success: true, stdout: "", stderr: "", exitCode: 0 };
        }
        if (command === "git" && args[0] === "ls-files") {
          return {
            success: true,
            stdout: generated && options?.cwd === tempDir ? "generated/report.json\0" : "",
            stderr: "",
            exitCode: 0,
          };
        }
        if (command === "node") {
          mkdirSync(join(tempDir, "generated"));
          writeFileSync(artifactPath, '{"ok":true}\n');
          generated = true;
          return { success: true, stdout: "generated\n", stderr: "", exitCode: 0 };
        }
        return { success: true, stdout: "", stderr: "", exitCode: 0 };
      },
    });

    expect(run.status).toBe("passed");
    expect(run.certified).toBe(true);
    expect(run.manifest.dirty).toBe(true);
    expect(run.manifest.dirtyDiffHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("asserts against complete noisy command output while keeping evidence capped", async () => {
    db.prepare("UPDATE projects SET path = ? WHERE id = 'project-1'").run(tempDir);
    const beyondEvidenceLimit = "appears after the evidence limit";
    const step = commandStep();
    if (step.automation?.kind !== "command") throw new Error("Expected command automation");
    step.automation.assert = [
      { type: "stdoutContains", expected: beyondEvidenceLimit },
      { type: "stderrContains", expected: beyondEvidenceLimit },
    ];
    seedDemo([step]);
    let commandMaxBuffer = 0;

    const run = await verifyTicket(db, {
      ticketId: "ticket-1",
      projectPath: tempDir,
      execFileNoThrow: async (command, args, options) => {
        if (command === "git") return createCleanExecFileNoThrow()(command, args, options);
        commandMaxBuffer = options?.maxBuffer ?? 0;
        return {
          success: true,
          stdout: `${"command output\n".repeat(20_000)}${beyondEvidenceLimit}\n`,
          stderr: `${"warning\n".repeat(20_000)}${beyondEvidenceLimit}\n`,
          exitCode: 0,
        };
      },
    });

    const evidencePath = run.manifest.stepVerdicts[0]?.evidenceFiles[0]?.path;
    if (!evidencePath) throw new Error("Expected command evidence");
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as {
      result: { stdout: string; stderr: string };
    };

    expect(run.status).toBe("passed");
    expect(commandMaxBuffer).toBe(16 * 1024 * 1024);
    expect(evidence.result.stdout).not.toContain(beyondEvidenceLimit);
    expect(evidence.result.stdout).toContain("[truncated");
    expect(evidence.result.stderr.length).toBeLessThan(20_000 * "warning\n".length);
    expect(evidence.result.stderr).not.toContain(beyondEvidenceLimit);
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
    db.prepare(
      `INSERT INTO epic_workflow_state (id, epic_id, tickets_total, tickets_done, created_at, updated_at)
       VALUES ('ews-1', 'epic-1', 2, 0, ?, ?)`
    ).run(now, now);
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
        if (command === "git" && args.join(" ") === "status --short --untracked-files=all") {
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
    expect(
      db
        .prepare(
          "SELECT tickets_total, tickets_done FROM epic_workflow_state WHERE epic_id = 'epic-1'"
        )
        .get()
    ).toEqual({ tickets_total: 2, tickets_done: 2 });
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
    expect(ticket.status).toBe("in_progress");
    expect(ticket.is_blocked).toBe(1);
    expect(ticket.blocked_reason).toContain("3 consecutive times on step 1");
    const comment = db
      .prepare(
        "SELECT content FROM ticket_comments WHERE ticket_id = 'ticket-1' AND type = 'comment'"
      )
      .get() as { content: string };
    expect(comment.content).toContain("Needs Attention");
  });

  it("blocks after three consecutive failures on the same assertion even when the demo renumbers its steps", async () => {
    seedDemo([apiStep(201)]);
    const baseUrl = await startFixtureServer();

    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
    moveTicketBackToVerification();
    db.prepare("UPDATE demo_scripts SET steps = ? WHERE ticket_id = 'ticket-1'").run(
      JSON.stringify([{ ...apiStep(201), order: 2 }])
    );
    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
    moveTicketBackToVerification();
    db.prepare("UPDATE demo_scripts SET steps = ? WHERE ticket_id = 'ticket-1'").run(
      JSON.stringify([{ ...apiStep(201), order: 3 }])
    );
    const thirdRun = await verifyTicket(db, { ticketId: "ticket-1", baseUrl });

    expect(thirdRun.status).toBe("failed");
    const ticket = db
      .prepare("SELECT status, is_blocked, blocked_reason FROM tickets WHERE id = 'ticket-1'")
      .get() as { status: string; is_blocked: number; blocked_reason: string | null };
    expect(ticket.status).toBe("in_progress");
    expect(ticket.is_blocked).toBe(1);
    expect(ticket.blocked_reason).toContain("3 consecutive times");
  });

  it("blocks a recurring failed assertion when unrelated passing assertions change", async () => {
    const stepWithAssertions = (
      order: number,
      assertions: NonNullable<DemoStep["automation"]>["assert"]
    ): DemoStep => ({
      ...apiStep(201),
      order,
      automation: {
        kind: "api",
        request: { method: "GET", path: "/health" },
        assert: assertions as never,
      },
    });
    seedDemo([stepWithAssertions(1, [{ type: "status", expected: 201 }])]);
    const baseUrl = await startFixtureServer();

    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
    moveTicketBackToVerification();
    db.prepare("UPDATE demo_scripts SET steps = ? WHERE ticket_id = 'ticket-1'").run(
      JSON.stringify([
        stepWithAssertions(2, [
          { type: "bodyContains", expected: "ok" },
          { type: "status", expected: 201 },
        ]),
      ])
    );
    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
    moveTicketBackToVerification();
    db.prepare("UPDATE demo_scripts SET steps = ? WHERE ticket_id = 'ticket-1'").run(
      JSON.stringify([
        stepWithAssertions(3, [
          { type: "status", expected: 201 },
          { type: "bodyContains", expected: "ok" },
          { type: "bodyContains", expected: "status" },
        ]),
      ])
    );
    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });

    const ticket = db
      .prepare("SELECT status, is_blocked FROM tickets WHERE id = 'ticket-1'")
      .get() as { status: string; is_blocked: number };
    expect(ticket).toEqual({ status: "in_progress", is_blocked: 1 });
  });

  it("does not conflate identical messages from different assertion targets", async () => {
    const stepForPath = (path: string, order: number): DemoStep => ({
      ...apiStep(201),
      order,
      automation: {
        kind: "api",
        request: { method: "GET", path },
        assert: [{ type: "status", expected: 201 }],
      },
    });
    seedDemo([stepForPath("/health?target=users", 1)]);
    const baseUrl = await startFixtureServer();

    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
    moveTicketBackToVerification();
    db.prepare("UPDATE demo_scripts SET steps = ? WHERE ticket_id = 'ticket-1'").run(
      JSON.stringify([stepForPath("/health?target=orders", 2)])
    );
    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
    moveTicketBackToVerification();
    db.prepare("UPDATE demo_scripts SET steps = ? WHERE ticket_id = 'ticket-1'").run(
      JSON.stringify([stepForPath("/health?target=payments", 3)])
    );
    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });

    const ticket = db
      .prepare("SELECT status, is_blocked FROM tickets WHERE id = 'ticket-1'")
      .get() as { status: string; is_blocked: number };
    expect(ticket).toEqual({ status: "in_progress", is_blocked: 0 });
  });

  it("does not conflate failures after an assertion's expected value changes", async () => {
    const stepForStatus = (expected: number, order: number): DemoStep => ({
      ...apiStep(expected),
      order,
    });
    seedDemo([stepForStatus(201, 1)]);
    const baseUrl = await startFixtureServer();

    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
    moveTicketBackToVerification();
    db.prepare("UPDATE demo_scripts SET steps = ? WHERE ticket_id = 'ticket-1'").run(
      JSON.stringify([stepForStatus(202, 2)])
    );
    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
    moveTicketBackToVerification();
    db.prepare("UPDATE demo_scripts SET steps = ? WHERE ticket_id = 'ticket-1'").run(
      JSON.stringify([stepForStatus(203, 3)])
    );
    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });

    const ticket = db
      .prepare("SELECT status, is_blocked FROM tickets WHERE id = 'ticket-1'")
      .get() as { status: string; is_blocked: number };
    expect(ticket).toEqual({ status: "in_progress", is_blocked: 0 });
  });

  it("blocks after five consecutive non-passing runs even without a shared failure", async () => {
    const setSteps = (steps: DemoStep[]): void => {
      db.prepare("UPDATE demo_scripts SET steps = ? WHERE ticket_id = 'ticket-1'").run(
        JSON.stringify(steps)
      );
    };
    seedDemo([apiStep(201)]);
    const baseUrl = await startFixtureServer();

    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
    moveTicketBackToVerification();
    setSteps([manualStep()]);
    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
    moveTicketBackToVerification();
    setSteps([{ ...apiStep(202), order: 3, description: "Different check" }]);
    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
    moveTicketBackToVerification();
    setSteps([manualStep()]);
    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
    moveTicketBackToVerification();
    setSteps([{ ...apiStep(203), order: 5, description: "Yet another check" }]);
    const fifthRun = await verifyTicket(db, { ticketId: "ticket-1", baseUrl });

    expect(fifthRun.status).toBe("failed");
    const ticket = db
      .prepare("SELECT status, is_blocked, blocked_reason FROM tickets WHERE id = 'ticket-1'")
      .get() as { status: string; is_blocked: number; blocked_reason: string | null };
    expect(ticket.status).toBe("in_progress");
    expect(ticket.is_blocked).toBe(1);
    expect(ticket.blocked_reason).toContain("consecutive non-passing runs");
  });

  it("seals a dirty-worktree diff hash into the manifest", async () => {
    seedDemo([apiStep(200)]);
    const baseUrl = await startFixtureServer();

    const run = await verifyTicket(db, {
      ticketId: "ticket-1",
      baseUrl,
      execFileNoThrow: async (command, args) => {
        if (command === "git" && args.join(" ") === "rev-parse HEAD") {
          return { success: true, stdout: "sha-dirty\n", stderr: "", exitCode: 0 };
        }
        if (command === "git" && args.join(" ") === "status --short --untracked-files=all") {
          return { success: true, stdout: " M src/app.ts\n", stderr: "", exitCode: 0 };
        }
        if (command === "git" && args[0] === "diff" && args[1] === "HEAD") {
          return {
            success: true,
            stdout: "diff --git a/src/app.ts b/src/app.ts\n+changed\n",
            stderr: "",
            exitCode: 0,
          };
        }
        return { success: true, stdout: "", stderr: "", exitCode: 0 };
      },
    });

    expect(run.manifest.dirty).toBe(true);
    expect(run.manifest.dirtyDiffHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes the dirty-worktree hash when untracked file contents change", async () => {
    const untrackedPath = join(tempDir, "draft.ts");
    writeFileSync(untrackedPath, "export const value = 1;\n");
    const execFileNoThrow: NonNullable<VerifyTicketParams["execFileNoThrow"]> = async (
      command,
      args
    ) => {
      const joined = args.join(" ");
      if (command === "git" && joined === "rev-parse HEAD") {
        return { success: true, stdout: "sha-dirty\n", stderr: "", exitCode: 0 };
      }
      if (command === "git" && joined === "status --short --untracked-files=all") {
        return { success: true, stdout: "?? draft.ts\n", stderr: "", exitCode: 0 };
      }
      if (command === "git" && args[0] === "diff") {
        return { success: true, stdout: "", stderr: "", exitCode: 0 };
      }
      if (command === "git" && args[0] === "ls-files") {
        return { success: true, stdout: "draft.ts\0", stderr: "", exitCode: 0 };
      }
      return { success: true, stdout: "", stderr: "", exitCode: 0 };
    };

    const first = await verificationTestInternals.getGitInfo(tempDir, execFileNoThrow);
    writeFileSync(untrackedPath, "export const value = 2;\n");
    const second = await verificationTestInternals.getGitInfo(tempDir, execFileNoThrow);

    expect(first.dirtyDiffHash).toMatch(/^[0-9a-f]{64}$/);
    expect(second.dirtyDiffHash).toMatch(/^[0-9a-f]{64}$/);
    expect(second.dirtyDiffHash).not.toBe(first.dirtyDiffHash);
  });

  it("fails the worktree seal when an untracked file cannot be read", async () => {
    const execFileNoThrow: NonNullable<VerifyTicketParams["execFileNoThrow"]> = async (
      command,
      args
    ) => {
      const joined = args.join(" ");
      if (command === "git" && joined === "rev-parse HEAD") {
        return { success: true, stdout: "sha-dirty\n", stderr: "", exitCode: 0 };
      }
      if (command === "git" && joined === "status --short --untracked-files=all") {
        return { success: true, stdout: "?? disappeared.ts\n", stderr: "", exitCode: 0 };
      }
      if (command === "git" && args[0] === "diff") {
        return { success: true, stdout: "", stderr: "", exitCode: 0 };
      }
      if (command === "git" && args[0] === "ls-files") {
        return { success: true, stdout: "disappeared.ts\0", stderr: "", exitCode: 0 };
      }
      return { success: true, stdout: "", stderr: "", exitCode: 0 };
    };

    const info = await verificationTestInternals.getGitInfo(tempDir, execFileNoThrow);

    expect(info.dirtyDiffHash).toBeNull();
    expect(info.worktreeSealFailed).toBe(true);
  });

  it("fails the worktree seal when untracked content exceeds the hashing budget", async () => {
    const oversizedPath = join(tempDir, "oversized.bin");
    writeFileSync(oversizedPath, "x");
    truncateSync(oversizedPath, 33 * 1024 * 1024);
    const execFileNoThrow: NonNullable<VerifyTicketParams["execFileNoThrow"]> = async (
      command,
      args
    ) => {
      const joined = args.join(" ");
      if (command === "git" && joined === "rev-parse HEAD") {
        return { success: true, stdout: "sha-dirty\n", stderr: "", exitCode: 0 };
      }
      if (command === "git" && joined === "status --short --untracked-files=all") {
        return { success: true, stdout: "?? oversized.bin\n", stderr: "", exitCode: 0 };
      }
      if (command === "git" && args[0] === "diff") {
        return { success: true, stdout: "", stderr: "", exitCode: 0 };
      }
      if (command === "git" && args[0] === "ls-files") {
        return { success: true, stdout: "oversized.bin\0", stderr: "", exitCode: 0 };
      }
      return { success: true, stdout: "", stderr: "", exitCode: 0 };
    };

    const info = await verificationTestInternals.getGitInfo(tempDir, execFileNoThrow);

    expect(info.dirtyDiffHash).toBeNull();
    expect(info.worktreeSealFailed).toBe(true);
  });

  it("fails the worktree seal when a submodule has uncommitted contents", async () => {
    const execFileNoThrow: NonNullable<VerifyTicketParams["execFileNoThrow"]> = async (
      command,
      args
    ) => {
      const joined = args.join(" ");
      if (command === "git" && joined === "rev-parse HEAD") {
        return { success: true, stdout: "sha-dirty\n", stderr: "", exitCode: 0 };
      }
      if (command === "git" && joined === "status --short --untracked-files=all") {
        return { success: true, stdout: " M vendor/library\n", stderr: "", exitCode: 0 };
      }
      if (
        command === "git" &&
        joined === "diff --full-index --binary --no-ext-diff --no-textconv HEAD"
      ) {
        return {
          success: true,
          stdout:
            "diff --git a/vendor/library b/vendor/library\n-Subproject commit abcdef1\n+Subproject commit abcdef1-dirty\n",
          stderr: "",
          exitCode: 0,
        };
      }
      if (command === "git" && args[0] === "ls-files") {
        return { success: true, stdout: "", stderr: "", exitCode: 0 };
      }
      return { success: true, stdout: "", stderr: "", exitCode: 0 };
    };

    const info = await verificationTestInternals.getGitInfo(tempDir, execFileNoThrow);

    expect(info.dirtyDiffHash).toBeNull();
    expect(info.worktreeSealFailed).toBe(true);
  });

  it("fails closed when Git metadata commands are unavailable", async () => {
    const info = await verificationTestInternals.getGitInfo(tempDir, async () => ({
      success: false,
      stdout: "",
      stderr: "git executable unavailable",
      exitCode: 127,
    }));

    expect(info.dirty).toBe(true);
    expect(info.dirtyDiffHash).toBeNull();
    expect(info.worktreeSealFailed).toBe(true);
  });

  it("fails the worktree seal for an untracked directory entry", async () => {
    mkdirSync(join(tempDir, "embedded-repository"));
    const execFileNoThrow: NonNullable<VerifyTicketParams["execFileNoThrow"]> = async (
      command,
      args
    ) => {
      const joined = args.join(" ");
      if (command === "git" && joined === "rev-parse HEAD") {
        return { success: true, stdout: "sha-dirty\n", stderr: "", exitCode: 0 };
      }
      if (command === "git" && joined === "status --short --untracked-files=all") {
        return {
          success: true,
          stdout: "?? embedded-repository/\n",
          stderr: "",
          exitCode: 0,
        };
      }
      if (command === "git" && args[0] === "diff") {
        return { success: true, stdout: "", stderr: "", exitCode: 0 };
      }
      if (command === "git" && args[0] === "ls-files") {
        return {
          success: true,
          stdout: "embedded-repository\0",
          stderr: "",
          exitCode: 0,
        };
      }
      return { success: true, stdout: "", stderr: "", exitCode: 0 };
    };

    const info = await verificationTestInternals.getGitInfo(tempDir, execFileNoThrow);

    expect(info.dirtyDiffHash).toBeNull();
    expect(info.worktreeSealFailed).toBe(true);
  });

  it("leaves a dirty worktree uncertified when its tracked diff cannot be sealed", async () => {
    seedDemo([apiStep(200)]);
    const baseUrl = await startFixtureServer();

    const run = await verifyTicket(db, {
      ticketId: "ticket-1",
      baseUrl,
      execFileNoThrow: async (command, args) => {
        const joined = args.join(" ");
        if (command === "git" && joined === "rev-parse HEAD") {
          return { success: true, stdout: "sha-dirty\n", stderr: "", exitCode: 0 };
        }
        if (command === "git" && joined === "status --short --untracked-files=all") {
          return { success: true, stdout: " M src/app.ts\n", stderr: "", exitCode: 0 };
        }
        if (
          command === "git" &&
          joined === "diff --full-index --binary --no-ext-diff --no-textconv HEAD"
        ) {
          return { success: false, stdout: "", stderr: "buffer exceeded", exitCode: 1 };
        }
        return { success: true, stdout: "", stderr: "", exitCode: 0 };
      },
    });

    expect(run.status).toBe("uncertified");
    expect(run.certified).toBe(false);
    expect(run.manifest.dirtyDiffHash).toBeNull();
    expect(run.manifest.stepVerdicts).toContainEqual(
      expect.objectContaining({
        status: "skipped",
        message: expect.stringContaining("dirty worktree could not be sealed"),
      })
    );
  });

  it("leaves a Git worktree uncertified when its status and seal cannot be read", async () => {
    seedDemo([apiStep(200)]);
    const baseUrl = await startFixtureServer();

    const run = await verifyTicket(db, {
      ticketId: "ticket-1",
      baseUrl,
      execFileNoThrow: async (command, args) => {
        if (command === "git" && args.join(" ") === "rev-parse HEAD") {
          return { success: true, stdout: "sha-unknown\n", stderr: "", exitCode: 0 };
        }
        return { success: false, stdout: "", stderr: "git unavailable", exitCode: 1 };
      },
    });

    expect(run.status).toBe("uncertified");
    expect(run.certified).toBe(false);
    expect(run.manifest.dirtyDiffHash).toBeNull();
  });

  it("leaves a run uncertified when verification changes the sealed worktree", async () => {
    seedDemo([apiStep(200)]);
    const baseUrl = await startFixtureServer();
    let targetStatusReads = 0;

    const run = await verifyTicket(db, {
      ticketId: "ticket-1",
      baseUrl,
      execFileNoThrow: async (command, args, options) => {
        const joined = args.join(" ");
        if (command === "git" && joined === "rev-parse HEAD") {
          return { success: true, stdout: "sha-dirty\n", stderr: "", exitCode: 0 };
        }
        if (command === "git" && joined === "status --short --untracked-files=all") {
          if (options?.cwd === tempDir) targetStatusReads += 1;
          return {
            success: true,
            stdout: targetStatusReads > 1 ? " M src/app.ts\n" : "",
            stderr: "",
            exitCode: 0,
          };
        }
        if (command === "git" && args[0] === "diff") {
          return {
            success: true,
            stdout: targetStatusReads > 1 ? "+changed during verification\n" : "",
            stderr: "",
            exitCode: 0,
          };
        }
        return { success: true, stdout: "", stderr: "", exitCode: 0 };
      },
    });

    expect(run.status).toBe("uncertified");
    expect(run.certified).toBe(false);
    expect(run.manifest.dirtyDiffHash).toBeNull();
    expect(run.manifest.stepVerdicts).toContainEqual(
      expect.objectContaining({
        status: "skipped",
        message: expect.stringContaining("worktree changed while verification was running"),
      })
    );
  });

  it("resolve-verification-failure clears a blocked ticket with a structured record and returns it to ai_review", async () => {
    seedDemo([apiStep(201)]);
    enqueueVerificationJob(db, "ticket-1");
    const baseUrl = await startFixtureServer();
    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
    moveTicketBackToVerification();
    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
    moveTicketBackToVerification();
    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });

    const blocked = db.prepare("SELECT is_blocked FROM tickets WHERE id = 'ticket-1'").get() as {
      is_blocked: number;
    };
    expect(blocked.is_blocked).toBe(1);

    const result = resolveVerificationFailure(db, {
      ticketId: "ticket-1",
      rootCause: "CORS allowlist rejected the runner's random loopback port",
      classification: "connectivity",
      validation: "Random-port origin now receives CORS headers; full test suite green.",
      fixCommits: ["a678f99"],
      whyNextAttemptWillPass: "The demo now boots through verify.json with {port} substitution.",
      operator: "release-engineer",
    });

    expect(result.newStatus).toBe("ai_review");
    expect(result.latestRunId).toBeTruthy();
    const ticket = db
      .prepare("SELECT status, is_blocked, blocked_reason FROM tickets WHERE id = 'ticket-1'")
      .get() as { status: string; is_blocked: number; blocked_reason: string | null };
    expect(ticket).toEqual({ status: "ai_review", is_blocked: 0, blocked_reason: null });
    const phase = db
      .prepare("SELECT current_phase FROM ticket_workflow_state WHERE ticket_id = 'ticket-1'")
      .get() as { current_phase: string };
    expect(phase.current_phase).toBe("ai_review");
    const job = db
      .prepare(
        "SELECT status, last_error, completed_at FROM verification_jobs WHERE ticket_id = 'ticket-1'"
      )
      .get() as { status: string; last_error: string | null; completed_at: string | null };
    expect(job.status).toBe("failed");
    expect(job.last_error).toBeNull();
    expect(job.completed_at).toBeTruthy();
    expect(
      db
        .prepare(
          "SELECT verification_streak_reset_at FROM ticket_workflow_state WHERE ticket_id = 'ticket-1'"
        )
        .get()
    ).toMatchObject({ verification_streak_reset_at: expect.any(String) });
    const comment = db
      .prepare(
        "SELECT content FROM ticket_comments WHERE ticket_id = 'ticket-1' AND content LIKE '%Verification Failure Resolved%'"
      )
      .get() as { content: string };
    expect(comment.content).toContain("Root cause: CORS allowlist rejected");
    expect(comment.content).toContain("a678f99");
    expect(comment.content).toContain("Classification: connectivity");
    expect(comment.content).toContain("Resolved by: release-engineer");
    expect(comment.content).toContain("Mark every open verification finding");

    moveTicketBackToVerification();
    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
    expect(
      db.prepare("SELECT status, is_blocked FROM tickets WHERE id = 'ticket-1'").get()
    ).toMatchObject({ status: "in_progress", is_blocked: 0 });
  });

  it("resolve-verification-failure refuses unblocked tickets and empty evidence", async () => {
    seedDemo([apiStep(201)]);
    const baseUrl = await startFixtureServer();
    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });

    expect(() =>
      resolveVerificationFailure(db, {
        ticketId: "ticket-1",
        rootCause: "anything",
        classification: "other",
        validation: "anything",
      })
    ).toThrow(/not blocked/);

    db.prepare(
      "UPDATE tickets SET is_blocked = 1, blocked_reason = 'x' WHERE id = 'ticket-1'"
    ).run();
    expect(() =>
      resolveVerificationFailure(db, {
        ticketId: "ticket-1",
        rootCause: "  ",
        classification: "other",
        validation: "proof",
      })
    ).toThrow(/rootCause/);
    expect(() =>
      resolveVerificationFailure(db, {
        ticketId: "ticket-1",
        rootCause: "cause",
        classification: "other",
        validation: "",
      })
    ).toThrow(/validation/);
  });

  it("resolve-verification-failure refuses an unrelated blocker after a historical run", async () => {
    seedDemo([apiStep(201)]);
    const baseUrl = await startFixtureServer();
    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
    db.prepare(
      `UPDATE tickets
       SET is_blocked = 1,
           blocked_reason = 'Automatic epic continuation failed after 3 attempts: provider exited'
       WHERE id = 'ticket-1'`
    ).run();

    expect(() =>
      resolveVerificationFailure(db, {
        ticketId: "ticket-1",
        rootCause: "provider exited",
        classification: "environment",
        validation: "provider now starts",
      })
    ).toThrow(/current blocker was not created by the latest verification run/);
  });

  it("keeps the verification blocker when scoped PRD synchronization fails", async () => {
    seedDemo([apiStep(201)]);
    const baseUrl = await startFixtureServer();
    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
    moveTicketBackToVerification();
    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
    moveTicketBackToVerification();
    await verifyTicket(db, { ticketId: "ticket-1", baseUrl });
    mkdirSync(join(tempDir, "plans"));
    writeFileSync(join(tempDir, "plans", "prd.json"), "{malformed");

    expect(() =>
      resolveVerificationFailure(db, {
        ticketId: "ticket-1",
        rootCause: "The random-port app boot was rejected by CORS.",
        classification: "connectivity",
        validation: "The random-port smoke test now passes.",
      })
    ).toThrow(/could not synchronize the scoped PRD/);

    expect(
      db.prepare("SELECT status, is_blocked FROM tickets WHERE id = 'ticket-1'").get()
    ).toMatchObject({ status: "in_progress", is_blocked: 1 });
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

  it("returns manual-only demos to implementation once, then blocks visibly on repeat", async () => {
    seedDemo([
      {
        order: 1,
        description: "Manual inspection",
        expectedOutcome: "Human can inspect",
        type: "manual",
      },
    ]);
    const baseUrl = await startFixtureServer();

    const firstRun = await verifyTicket(db, { ticketId: "ticket-1", baseUrl });

    expect(firstRun.status).toBe("uncertified");
    const healedTicket = db
      .prepare("SELECT status, is_blocked FROM tickets WHERE id = 'ticket-1'")
      .get() as { status: string; is_blocked: number };
    expect(healedTicket).toEqual({ status: "in_progress", is_blocked: 0 });

    moveTicketBackToVerification();
    const secondRun = await verifyTicket(db, { ticketId: "ticket-1", baseUrl });

    expect(secondRun.status).toBe("uncertified");
    const ticket = db
      .prepare("SELECT status, is_blocked, blocked_reason FROM tickets WHERE id = 'ticket-1'")
      .get() as { status: string; is_blocked: number; blocked_reason: string | null };
    expect(ticket.status).toBe("in_progress");
    expect(ticket.is_blocked).toBe(1);
    expect(ticket.blocked_reason).toContain("uncertified");
    expect(ticket.blocked_reason).toContain("Manual steps cannot be certified");
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
        if (
          command === "git" &&
          args.join(" ") === "diff --full-index --binary --no-ext-diff --no-textconv HEAD"
        ) {
          return {
            success: true,
            stdout: "diff --git a/core/verification.ts b/core/verification.ts\n+changed\n",
            stderr: "",
            exitCode: 0,
          };
        }
        if (command === "git" && args[0] === "ls-files") {
          return { success: true, stdout: "", stderr: "", exitCode: 0 };
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
      .prepare("SELECT status, is_blocked, blocked_reason FROM tickets WHERE id = 'ticket-1'")
      .get() as { status: string; is_blocked: number; blocked_reason: string | null };
    expect(ticket.status).toBe("in_progress");
    expect(ticket.is_blocked).toBe(1);
    expect(ticket.blocked_reason).toContain("verification/manifest code");
  });

  it("does not trip the verification tripwire for a target project's web manifest", async () => {
    seedDemo([apiStep()]);
    const baseUrl = await startFixtureServer();

    const run = await verifyTicket(db, {
      ticketId: "ticket-1",
      baseUrl,
      execFileNoThrow: async (command, args) => {
        if (command === "git" && args.join(" ") === "rev-parse HEAD") {
          return { success: true, stdout: "abc123\n", stderr: "", exitCode: 0 };
        }
        if (command === "git" && args.join(" ") === "status --short --untracked-files=all") {
          return {
            success: true,
            stdout: " M public/manifest.json\n M src/site.webmanifest\n",
            stderr: "",
            exitCode: 0,
          };
        }
        return { success: true, stdout: "", stderr: "", exitCode: 0 };
      },
    });

    expect(run.status).toBe("passed");
    expect(run.certified).toBe(true);
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
        if (command === "git" && args.join(" ") === "status --short --untracked-files=all") {
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

describe("classifyVerificationRunFailure", () => {
  const runWithMessages = (
    messages: string[],
    status = "failed",
    automationKind?: "api" | "ui" | "command" | "file"
  ): VerificationRun =>
    ({
      manifest: {
        stepVerdicts: messages.map((message, index) => ({
          order: index + 1,
          status,
          message,
          durationMs: 0,
          evidenceFiles: [],
          ...(automationKind ? { automationKind } : {}),
        })),
      },
    }) as unknown as VerificationRun;

  it("labels network-layer errors as connectivity", () => {
    const classification = classifyVerificationRunFailure(
      runWithMessages(["page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:36287/"])
    );
    expect(classification?.kind).toBe("connectivity");
  });

  it("labels a step where several independent UI assertions failed together as connectivity", () => {
    const classification = classifyVerificationRunFailure(
      runWithMessages(
        [
          "expected [data-testid^='portfolio-row-'] to be visible; expected [data-testid='expert-framework']:nth-child(8) to be visible; UI assertion failed: expect(locator).toContainText(expected) failed",
        ],
        "failed",
        "ui"
      )
    );
    expect(classification?.kind).toBe("connectivity");
  });

  it("labels a lone failing assertion as an assertion failure", () => {
    const classification = classifyVerificationRunFailure(
      runWithMessages(["expected status 201, got 200"])
    );
    expect(classification?.kind).toBe("assertion");
  });

  it("does not classify several command assertions as a UI connectivity failure", () => {
    const classification = classifyVerificationRunFailure(
      runWithMessages(
        [
          "expected stdout to contain one; expected stdout to contain two; expected stderr not to contain error",
        ],
        "failed",
        "command"
      )
    );
    expect(classification?.kind).toBe("assertion");
  });

  it("returns null when no step failed", () => {
    expect(classifyVerificationRunFailure(runWithMessages(["all good"], "passed"))).toBeNull();
  });
});

describe("verification failure identity", () => {
  it("distinguishes UI assertions reached through different state-changing actions", () => {
    const stepForButton = (selector: string): DemoStep => ({
      order: 1,
      description: "Trigger a mutation",
      expectedOutcome: "A success toast appears",
      type: "visual",
      automation: {
        kind: "ui",
        route: "/settings",
        actions: [{ act: "click", selector }],
        assert: [{ type: "text", selector: "[role='status']", expected: "Saved" }],
        screenshot: true,
      },
    });
    const verdict = {
      order: 1,
      status: "failed" as const,
      message: "UI assertion failed",
      durationMs: 1,
      evidenceFiles: [],
      failedAssertionIndexes: [0],
    };

    const save = verificationTestInternals.withAutomationKey(stepForButton("#save"), verdict);
    const publish = verificationTestInternals.withAutomationKey(stepForButton("#publish"), verdict);

    expect(save.failureKeys).toHaveLength(1);
    expect(publish.failureKeys).toHaveLength(1);
    expect(save.failureKeys).not.toEqual(publish.failureKeys);
  });

  it("retains non-assertion failure identities alongside assertion identities", () => {
    const step = commandStep("expected output");
    const verdict = {
      order: 1,
      status: "failed" as const,
      message: "exit code and stdout failed",
      durationMs: 1,
      evidenceFiles: [],
      failedAssertionIndexes: [0],
      failureKeys: ["stable-exit-code-failure"],
    };

    const sealed = verificationTestInternals.withAutomationKey(step, verdict);

    expect(sealed.failureKeys).toContain("stable-exit-code-failure");
    expect(sealed.failureKeys).toHaveLength(2);
  });

  it("does not exempt tracked mutations or files checked before a later command", () => {
    mkdirSync(join(tempDir, "generated"));
    writeFileSync(join(tempDir, "generated", "report.json"), '{"ok":true}\n');
    const before = {
      sha: "sha",
      dirty: false,
      dirtyDiffHash: null,
      worktreeSealFailed: false,
      dirtyFiles: [],
      untrackedFiles: [],
      changedFiles: [],
    };
    const after = {
      sha: "sha",
      dirty: true,
      dirtyDiffHash: "hash",
      worktreeSealFailed: false,
      dirtyFiles: ["generated/report.json"],
      untrackedFiles: ["generated/report.json"],
      changedFiles: ["generated/report.json"],
    };
    const notExistsStep = fileStep();
    if (notExistsStep.automation?.kind !== "file") throw new Error("Expected file step");
    notExistsStep.automation.path = "generated/report.json";
    notExistsStep.automation.assert = [{ type: "notExists" }];
    const positiveFileStep = fileStep('"ok":true');
    if (positiveFileStep.automation?.kind !== "file") throw new Error("Expected file step");
    positiveFileStep.automation.path = "generated/report.json";

    expect(
      verificationTestInternals.isDeclaredGeneratedArtifactChange(
        before,
        after,
        [notExistsStep, commandStep()],
        tempDir,
        [],
        "run"
      )
    ).toBe(false);
    expect(
      verificationTestInternals.isDeclaredGeneratedArtifactChange(
        before,
        { ...after, untrackedFiles: [] },
        [commandStep(), positiveFileStep],
        tempDir,
        [],
        "run"
      )
    ).toBe(false);
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

  it("reports queued and expired jobs as claimable for a recovery supervisor", () => {
    seedDemo([apiStep()]);
    enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:00:00.000Z" });

    expect(hasClaimableVerificationJob(db, { now: "2026-03-08T01:00:01.000Z" })).toBe(true);
    claimNextVerificationJob(db, {
      workerId: "worker-1",
      now: "2026-03-08T01:00:01.000Z",
      leaseMs: 1_000,
    });
    expect(hasClaimableVerificationJob(db, { now: "2026-03-08T01:00:01.500Z" })).toBe(false);
    expect(hasClaimableVerificationJob(db, { now: "2026-03-08T01:00:03.000Z" })).toBe(true);
  });

  it("renews an owned running lease so another worker cannot reclaim it", () => {
    seedDemo([apiStep()]);
    const job = enqueueVerificationJob(db, "ticket-1", {
      now: "2026-03-08T01:00:00.000Z",
    });
    const claimed = claimNextVerificationJob(db, {
      workerId: "worker-1",
      now: "2026-03-08T01:00:01.000Z",
      leaseMs: 1_000,
    });

    expect(
      renewVerificationJobLease(db, {
        jobId: job.id,
        workerId: "worker-1",
        attemptCount: claimed!.attemptCount,
        now: "2026-03-08T01:00:01.500Z",
        leaseMs: 60_000,
      })
    ).toBe(true);
    expect(
      claimNextVerificationJob(db, {
        workerId: "worker-2",
        now: "2026-03-08T01:00:03.000Z",
        leaseMs: 60_000,
      })
    ).toBeNull();
    expect(getVerificationJob(db, "ticket-1")?.leaseExpiresAt).toBe("2026-03-08T01:01:01.500Z");
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

  it("heartbeats its lease while a slow verification is running", async () => {
    seedDemo([apiStep()]);
    enqueueVerificationJob(db, "ticket-1", { now: new Date().toISOString() });
    let initialExpiry = "";
    let renewedExpiry = "";

    const result = await runNextVerificationJob(db, {
      workerId: "heartbeat-worker",
      leaseMs: 250,
      verifyTicketFn: async (_db, params) => {
        initialExpiry = getVerificationJob(db, "ticket-1")?.leaseExpiresAt ?? "";
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 180));
        renewedExpiry = getVerificationJob(db, "ticket-1")?.leaseExpiresAt ?? "";
        settleVerificationJob(db, {
          jobId: params.verificationJobLease!.jobId,
          workerId: params.verificationJobLease!.workerId,
          attemptCount: params.verificationJobLease!.attemptCount,
          status: "succeeded",
        });
        return fakeWorkerRun(params);
      },
    });

    expect(result).toMatchObject({ claimed: true, jobStatus: "succeeded" });
    expect(Date.parse(renewedExpiry)).toBeGreaterThan(Date.parse(initialExpiry));
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
      db
        .prepare("SELECT status, is_blocked, blocked_reason FROM tickets WHERE id = 'ticket-1'")
        .get()
    ).toMatchObject({
      status: "in_progress",
      is_blocked: 1,
      blocked_reason: "Automatic verification worker failed: boot crashed again",
    });

    const resolved = resolveVerificationFailure(db, {
      ticketId: "ticket-1",
      rootCause: "The verification worker boot environment was missing its browser runtime.",
      classification: "environment",
      validation: "The browser runtime is installed and the worker smoke test passes.",
    });
    expect(resolved).toMatchObject({ newStatus: "ai_review", latestRunId: null });
    const resolutionComment = db
      .prepare(
        "SELECT content FROM ticket_comments WHERE ticket_id = 'ticket-1' AND content LIKE '%Verification Failure Resolved%'"
      )
      .get() as { content: string };
    expect(resolutionComment.content).toContain("none (worker failed before run persistence)");
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
      status: "in_progress",
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

  it("reconciles missing jobs automatically and exits terminal verification states", () => {
    seedDemo([apiStep()]);

    const recovered = reconcileVerificationTicketStates(db, {
      now: "2026-03-08T01:00:00.000Z",
    });
    expect(recovered).toEqual({
      enqueuedTicketIds: ["ticket-1"],
      humanActionTicketIds: [],
    });
    expect(getVerificationJob(db, "ticket-1")).toMatchObject({ status: "queued" });

    db.prepare(
      `UPDATE verification_jobs
       SET status = 'blocked', last_error = 'Browser runtime is unavailable'
       WHERE ticket_id = 'ticket-1'`
    ).run();
    const terminal = reconcileVerificationTicketStates(db, {
      now: "2026-03-08T01:00:01.000Z",
    });
    expect(terminal).toEqual({
      enqueuedTicketIds: [],
      humanActionTicketIds: ["ticket-1"],
    });
    expect(
      db
        .prepare("SELECT status, is_blocked, blocked_reason FROM tickets WHERE id = 'ticket-1'")
        .get()
    ).toMatchObject({
      status: "in_progress",
      is_blocked: 1,
      blocked_reason: "Browser runtime is unavailable",
    });
  });

  it("returns an ai_verification ticket without a demo to human action", () => {
    db.prepare("DELETE FROM demo_scripts WHERE ticket_id = 'ticket-1'").run();

    const result = reconcileVerificationTicketStates(db, {
      now: "2026-03-08T01:00:00.000Z",
    });

    expect(result).toEqual({
      enqueuedTicketIds: [],
      humanActionTicketIds: ["ticket-1"],
    });
    expect(
      db
        .prepare("SELECT status, is_blocked, blocked_reason FROM tickets WHERE id = 'ticket-1'")
        .get()
    ).toMatchObject({
      status: "in_progress",
      is_blocked: 1,
      blocked_reason: "AI verification has no demo script or runner job to execute.",
    });
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
  it("exits immediately while paused instead of waiting on pending jobs", async () => {
    seedDemo([apiStep()]);
    enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:00:00.000Z" });
    setVerificationWorkerPaused(db, {
      paused: true,
      reason: "maintenance",
      now: "2026-03-08T01:00:01.000Z",
    });
    const verifyTicketFn: NonNullable<VerificationWorkerOptions["verifyTicketFn"]> = vi.fn(
      async (_db, params) => fakeWorkerRun(params)
    );

    const startedAt = Date.now();
    const result = await drainVerificationQueue(db, {
      followRetryBudgetMs: 10_000,
      verifyTicketFn,
    });

    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(result.processed).toBe(0);
    expect(verifyTicketFn).not.toHaveBeenCalled();
    expect(getVerificationJob(db, "ticket-1")).toMatchObject({ status: "queued" });
  });

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

  it("spawns a recovery drain only when a job is claimable", () => {
    seedDemo([apiStep()]);
    enqueueVerificationJob(db, "ticket-1", { now: "2026-03-08T01:00:00.000Z" });
    claimNextVerificationJob(db, {
      workerId: "dead-worker",
      now: "2026-03-08T01:00:01.000Z",
      leaseMs: 1_000,
    });
    const child = { pid: 4343, unref: vi.fn() };
    const spawnImpl = vi.fn(() => child);

    const active = spawnDetachedVerificationDrainIfNeeded(db, {
      brainDumpRoot: "/repo",
      now: "2026-03-08T01:00:01.500Z",
      spawnImpl: spawnImpl as unknown as typeof import("child_process").spawn,
    });
    const expired = spawnDetachedVerificationDrainIfNeeded(db, {
      brainDumpRoot: "/repo",
      now: "2026-03-08T01:00:03.000Z",
      spawnImpl: spawnImpl as unknown as typeof import("child_process").spawn,
    });

    expect(active).toEqual({ needed: false, spawned: false });
    expect(expired).toEqual({ needed: true, spawned: true, pid: 4343 });
    expect(spawnImpl).toHaveBeenCalledTimes(1);
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
