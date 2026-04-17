/**
 * CLI integration tests.
 *
 * Spawns `tsx cli/brain-dump.ts` with real args via execFile (no shell).
 * Each test gets an isolated data directory via XDG_DATA_HOME / XDG_STATE_HOME.
 */

import { execFile } from "child_process";
import { mkdtempSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Each test spawns multiple tsx subprocesses sequentially.
// Under parallel load from the full suite, 5s default is too tight.
vi.setConfig({ testTimeout: 15_000 });

// ── Test Harness ────────────────────────────────────────────────

const CLI_PATH = resolve(__dirname, "../brain-dump.ts");
const TSX_PATH = resolve(__dirname, "../../node_modules/.bin/tsx");

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

let tempDir: string;
let projectCounter = 0;

/** Create a real directory for use as a project path. */
function makeProjDir(name?: string): string {
  projectCounter++;
  const dir = join(tempDir, "projects", name ?? `proj-${projectCounter}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Run the CLI with given args in an isolated data directory.
 * Uses execFile (no shell) to avoid injection risks.
 */
function run(...args: string[]): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      TSX_PATH,
      [CLI_PATH, ...args],
      {
        env: {
          ...process.env,
          XDG_DATA_HOME: join(tempDir, "data"),
          XDG_STATE_HOME: join(tempDir, "state"),
          // Prevent legacy migration from touching real data
          HOME: tempDir,
        },
        timeout: 30_000,
      },
      (error, stdout, stderr) => {
        // execFile sets error.code to the exit code number
        const exitCode =
          error && typeof (error as NodeJS.ErrnoException).code === "number"
            ? ((error as NodeJS.ErrnoException).code as unknown as number)
            : error
              ? 1
              : 0;
        resolve({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          exitCode,
        });
      }
    );
  });
}

/** Parse stdout as JSON, failing with a helpful message if it's not valid JSON. */
function parseJson(result: RunResult): unknown {
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(
      `Expected valid JSON on stdout but got:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }
}

/**
 * Extract the JSON object from stderr which may contain [brain-dump] log lines.
 * The error JSON is always a `{...}` block written by outputError().
 */
function parseStderrJson(stderr: string): Record<string, unknown> {
  const match = stderr.match(/^\{[\s\S]*\}$/m);
  if (match) {
    return JSON.parse(match[0]) as Record<string, unknown>;
  }
  // Try to find multi-line JSON block
  const lines = stderr.split("\n");
  let jsonStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trimStart().startsWith("{")) {
      jsonStart = i;
      break;
    }
  }
  if (jsonStart >= 0) {
    const jsonBlock = lines.slice(jsonStart).join("\n");
    return JSON.parse(jsonBlock) as Record<string, unknown>;
  }
  throw new Error(`No JSON found in stderr:\n${stderr}`);
}

/** Run CLI, assert exit 0, return parsed JSON. */
async function runOk(...args: string[]): Promise<unknown> {
  const result = await run(...args);
  expect(result.exitCode, `CLI failed with stderr: ${result.stderr}`).toBe(0);
  return parseJson(result);
}

/** Run CLI, assert non-zero exit, return parsed error JSON from stderr. */
async function runErr(...args: string[]): Promise<Record<string, unknown>> {
  const result = await run(...args);
  expect(result.exitCode).not.toBe(0);
  return parseStderrJson(result.stderr);
}

// ── Setup / Teardown ────────────────────────────────────────────

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "brain-dump-test-"));
  projectCounter = 0;
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ── Project Commands ────────────────────────────────────────────

describe("project", () => {
  it("list returns empty array on fresh database", async () => {
    const result = await runOk("project", "list");
    expect(result).toEqual([]);
  });

  it("create and get via list", async () => {
    const projPath = makeProjDir("test-project");
    const created = (await runOk(
      "project",
      "create",
      "--name",
      "TestProject",
      "--path",
      projPath
    )) as Record<string, unknown>;

    expect(created).toHaveProperty("id");
    expect(created.name).toBe("TestProject");
    expect(created.path).toBe(projPath);

    const list = (await runOk("project", "list")) as Array<Record<string, unknown>>;
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe("TestProject");
  });

  it("find by path", async () => {
    const projPath = makeProjDir("find-test");
    await runOk("project", "create", "--name", "FindMe", "--path", projPath);

    const found = (await runOk("project", "find", "--path", projPath)) as Record<string, unknown>;
    expect(found.name).toBe("FindMe");
  });

  it("find by path returns not-found for unknown path", async () => {
    const found = (await runOk("project", "find", "--path", "/nonexistent-path-abc123")) as Record<
      string,
      unknown
    >;
    expect(found.found).toBe(false);
  });

  it("delete dry-run without --confirm", async () => {
    const projPath = makeProjDir("del-test");
    const created = (await runOk(
      "project",
      "create",
      "--name",
      "ToDelete",
      "--path",
      projPath
    )) as Record<string, unknown>;

    const dryRun = (await runOk("project", "delete", "--project", created.id as string)) as Record<
      string,
      unknown
    >;
    expect(dryRun.dryRun).toBe(true);

    // Project still exists
    const list = (await runOk("project", "list")) as unknown[];
    expect(list).toHaveLength(1);
  });

  it("delete with --confirm actually deletes", async () => {
    const projPath = makeProjDir("del-real");
    const created = (await runOk(
      "project",
      "create",
      "--name",
      "ToDelete",
      "--path",
      projPath
    )) as Record<string, unknown>;

    await runOk("project", "delete", "--project", created.id as string, "--confirm");

    const list = (await runOk("project", "list")) as unknown[];
    expect(list).toHaveLength(0);
  });

  it("create missing --name flag errors", async () => {
    const projPath = makeProjDir("no-name");
    const err = await runErr("project", "create", "--path", projPath);
    expect(err.error).toBe("VALIDATION_ERROR");
    expect(err.message).toMatch(/--name/);
  });
});

// ── Ticket Commands ─────────────────────────────────────────────

describe("ticket", () => {
  async function createProject(): Promise<string> {
    const projPath = makeProjDir("ticket-test");
    const p = (await runOk(
      "project",
      "create",
      "--name",
      "TicketTestProject",
      "--path",
      projPath
    )) as Record<string, unknown>;
    return p.id as string;
  }

  it("create and get a ticket", async () => {
    const projectId = await createProject();

    const created = (await runOk(
      "ticket",
      "create",
      "--project",
      projectId,
      "--title",
      "Test Ticket",
      "--priority",
      "high"
    )) as Record<string, unknown>;

    expect(created).toHaveProperty("id");
    expect(created.title).toBe("Test Ticket");
    expect(created.priority).toBe("high");
    expect(created.status).toBe("backlog");

    const got = (await runOk("ticket", "get", "--ticket", created.id as string)) as Record<
      string,
      unknown
    >;
    expect(got.title).toBe("Test Ticket");
  });

  it("list tickets for a project", { timeout: 10_000 }, async () => {
    const projectId = await createProject();
    await runOk("ticket", "create", "--project", projectId, "--title", "T1");
    await runOk("ticket", "create", "--project", projectId, "--title", "T2");

    const list = (await runOk("ticket", "list", "--project", projectId)) as unknown[];
    expect(list).toHaveLength(2);
  });

  it("update ticket fields", async () => {
    const projectId = await createProject();
    const created = (await runOk(
      "ticket",
      "create",
      "--project",
      projectId,
      "--title",
      "Original"
    )) as Record<string, unknown>;

    const updated = (await runOk(
      "ticket",
      "update",
      "--ticket",
      created.id as string,
      "--title",
      "Updated Title",
      "--priority",
      "low"
    )) as Record<string, unknown>;
    expect(updated.title).toBe("Updated Title");
    expect(updated.priority).toBe("low");
  });

  it("update-status changes ticket status", async () => {
    const projectId = await createProject();
    const created = (await runOk(
      "ticket",
      "create",
      "--project",
      projectId,
      "--title",
      "Status Test"
    )) as Record<string, unknown>;

    const updated = (await runOk(
      "ticket",
      "update-status",
      "--ticket",
      created.id as string,
      "--status",
      "ready"
    )) as Record<string, unknown>;
    expect(updated.status).toBe("ready");
  });

  it("delete dry-run without --confirm", async () => {
    const projectId = await createProject();
    const created = (await runOk(
      "ticket",
      "create",
      "--project",
      projectId,
      "--title",
      "DeleteMe"
    )) as Record<string, unknown>;

    const dryRun = (await runOk("ticket", "delete", "--ticket", created.id as string)) as Record<
      string,
      unknown
    >;
    expect(dryRun.dryRun).toBe(true);

    const list = (await runOk("ticket", "list", "--project", projectId)) as unknown[];
    expect(list).toHaveLength(1);
  });

  it("create missing --project flag errors", async () => {
    const err = await runErr("ticket", "create", "--title", "No Project");
    expect(err.error).toBe("VALIDATION_ERROR");
    expect(err.message).toMatch(/--project/);
  });

  it("update-status invalid enum errors", async () => {
    const projectId = await createProject();
    const created = (await runOk(
      "ticket",
      "create",
      "--project",
      projectId,
      "--title",
      "EnumTest"
    )) as Record<string, unknown>;

    const err = await runErr(
      "ticket",
      "update-status",
      "--ticket",
      created.id as string,
      "--status",
      "invalid_status"
    );
    expect(err.error).toBe("VALIDATION_ERROR");
    expect(err.message).toMatch(/invalid_status/);
  });

  it("list-by-epic returns tickets in an epic", async () => {
    const projectId = await createProject();
    const epic = (await runOk(
      "epic",
      "create",
      "--project",
      projectId,
      "--title",
      "TestEpic"
    )) as Record<string, unknown>;

    await runOk(
      "ticket",
      "create",
      "--project",
      projectId,
      "--title",
      "EpicTicket",
      "--epic",
      epic.id as string
    );

    const list = (await runOk("ticket", "list-by-epic", "--epic", epic.id as string)) as unknown[];
    expect(list).toHaveLength(1);
  });
});

// ── Epic Commands ───────────────────────────────────────────────

describe("epic", () => {
  async function createProject(): Promise<string> {
    const projPath = makeProjDir("epic-test");
    const p = (await runOk(
      "project",
      "create",
      "--name",
      "EpicTestProject",
      "--path",
      projPath
    )) as Record<string, unknown>;
    return p.id as string;
  }

  it("create and list epics", async () => {
    const projectId = await createProject();

    const created = (await runOk(
      "epic",
      "create",
      "--project",
      projectId,
      "--title",
      "Test Epic"
    )) as Record<string, unknown>;
    expect(created).toHaveProperty("id");
    expect(created.title).toBe("Test Epic");

    const list = (await runOk("epic", "list", "--project", projectId)) as unknown[];
    expect(list).toHaveLength(1);
  });

  it("update epic", async () => {
    const projectId = await createProject();
    const created = (await runOk(
      "epic",
      "create",
      "--project",
      projectId,
      "--title",
      "Old Title"
    )) as Record<string, unknown>;

    const updated = (await runOk(
      "epic",
      "update",
      "--epic",
      created.id as string,
      "--title",
      "New Title"
    )) as Record<string, unknown>;
    expect(updated.title).toBe("New Title");
  });

  it("delete dry-run without --confirm", async () => {
    const projectId = await createProject();
    const created = (await runOk(
      "epic",
      "create",
      "--project",
      projectId,
      "--title",
      "DelEpic"
    )) as Record<string, unknown>;

    const dryRun = (await runOk("epic", "delete", "--epic", created.id as string)) as Record<
      string,
      unknown
    >;
    expect(dryRun.dryRun).toBe(true);

    const list = (await runOk("epic", "list", "--project", projectId)) as unknown[];
    expect(list).toHaveLength(1);
  });

  it("delete with --confirm actually deletes", async () => {
    const projectId = await createProject();
    const created = (await runOk(
      "epic",
      "create",
      "--project",
      projectId,
      "--title",
      "DelEpicReal"
    )) as Record<string, unknown>;

    await runOk("epic", "delete", "--epic", created.id as string, "--confirm");

    const list = (await runOk("epic", "list", "--project", projectId)) as unknown[];
    expect(list).toHaveLength(0);
  });

  it("create missing --project flag errors", async () => {
    const err = await runErr("epic", "create", "--title", "NoProject");
    expect(err.error).toBe("VALIDATION_ERROR");
    expect(err.message).toMatch(/--project/);
  });
});

// ── Review Commands ─────────────────────────────────────────────

describe("review", () => {
  async function setupTicket(): Promise<{ projectId: string; ticketId: string }> {
    const projPath = makeProjDir("review-test");
    const p = (await runOk(
      "project",
      "create",
      "--name",
      "ReviewProject",
      "--path",
      projPath
    )) as Record<string, unknown>;

    const t = (await runOk(
      "ticket",
      "create",
      "--project",
      p.id as string,
      "--title",
      "Review Ticket"
    )) as Record<string, unknown>;

    // Move to ai_review so review actions work
    await runOk("ticket", "update-status", "--ticket", t.id as string, "--status", "in_progress");
    await runOk("ticket", "update-status", "--ticket", t.id as string, "--status", "ai_review");

    return { projectId: p.id as string, ticketId: t.id as string };
  }

  it("submit-finding and get-findings", async () => {
    const { ticketId } = await setupTicket();

    const finding = (await runOk(
      "review",
      "submit-finding",
      "--ticket",
      ticketId,
      "--severity",
      "minor",
      "--agent",
      "code-reviewer",
      "--category",
      "style",
      "--description",
      "Test finding"
    )) as Record<string, unknown>;
    expect(finding).toHaveProperty("id");

    const findings = (await runOk("review", "get-findings", "--ticket", ticketId)) as unknown[];
    expect(findings).toHaveLength(1);
  });

  it("check-complete returns status", async () => {
    const { ticketId } = await setupTicket();

    const result = (await runOk("review", "check-complete", "--ticket", ticketId)) as Record<
      string,
      unknown
    >;
    expect(result).toHaveProperty("canProceedToHumanReview");
  });

  it("submit-finding missing required flags errors", async () => {
    const err = await runErr(
      "review",
      "submit-finding",
      "--ticket",
      "fake-id",
      "--severity",
      "minor"
    );
    expect(err.error).toBe("VALIDATION_ERROR");
    expect(err.message).toMatch(/--agent/);
  });
});

// ── Session Commands ────────────────────────────────────────────

describe("session", () => {
  async function setupTicket(): Promise<string> {
    const projPath = makeProjDir("session-test");
    const p = (await runOk(
      "project",
      "create",
      "--name",
      "SessionProject",
      "--path",
      projPath
    )) as Record<string, unknown>;

    const t = (await runOk(
      "ticket",
      "create",
      "--project",
      p.id as string,
      "--title",
      "Session Ticket"
    )) as Record<string, unknown>;
    return t.id as string;
  }

  it("create, update, and complete a session", async () => {
    const ticketId = await setupTicket();

    const session = (await runOk("session", "create", "--ticket", ticketId)) as Record<
      string,
      unknown
    >;
    expect(session).toHaveProperty("id");
    expect(session.currentState).toBe("idle");

    const updated = (await runOk(
      "session",
      "update",
      "--session",
      session.id as string,
      "--state",
      "analyzing"
    )) as Record<string, unknown>;
    // updateState returns { session: { currentState, ... }, previousState, ... }
    const updatedSession = updated.session as Record<string, unknown>;
    expect(updatedSession.currentState).toBe("analyzing");

    const completed = (await runOk(
      "session",
      "complete",
      "--session",
      session.id as string,
      "--outcome",
      "success"
    )) as Record<string, unknown>;
    expect(completed.outcome).toBe("success");
  });

  it("list sessions for a ticket", async () => {
    const ticketId = await setupTicket();
    await runOk("session", "create", "--ticket", ticketId);

    // listSessions returns { ticketId, ticketTitle, sessions: [...] }
    const result = (await runOk("session", "list", "--ticket", ticketId)) as Record<
      string,
      unknown
    >;
    const sessions = result.sessions as unknown[];
    expect(sessions).toHaveLength(1);
  });

  it("emit-event and get-events", async () => {
    const ticketId = await setupTicket();
    const session = (await runOk("session", "create", "--ticket", ticketId)) as Record<
      string,
      unknown
    >;

    await runOk(
      "session",
      "emit-event",
      "--session",
      session.id as string,
      "--event-type",
      "progress"
    );

    const events = (await runOk(
      "session",
      "get-events",
      "--session",
      session.id as string
    )) as unknown[];
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it("update with invalid state enum errors", async () => {
    const ticketId = await setupTicket();
    const session = (await runOk("session", "create", "--ticket", ticketId)) as Record<
      string,
      unknown
    >;

    const err = await runErr(
      "session",
      "update",
      "--session",
      session.id as string,
      "--state",
      "bogus"
    );
    expect(err.error).toBe("VALIDATION_ERROR");
    expect(err.message).toMatch(/bogus/);
  });

  it("create missing --ticket flag errors", async () => {
    const err = await runErr("session", "create");
    expect(err.error).toBe("VALIDATION_ERROR");
    expect(err.message).toMatch(/--ticket/);
  });
});

// ── Telemetry Commands ──────────────────────────────────────────

describe("telemetry", () => {
  it("start and end a telemetry session", async () => {
    const session = (await runOk("telemetry", "start")) as Record<string, unknown>;
    expect(session).toHaveProperty("id");

    const ended = (await runOk(
      "telemetry",
      "end",
      "--session",
      session.id as string,
      "--outcome",
      "success"
    )) as Record<string, unknown>;
    // endTelemetrySession returns { sessionId, durationMs, ... }
    expect(ended).toHaveProperty("sessionId");
  });

  it("log-context with boolean flags", async () => {
    const session = (await runOk("telemetry", "start")) as Record<string, unknown>;

    // logContext returns a plain event ID string
    const result = await runOk(
      "telemetry",
      "log-context",
      "--session",
      session.id as string,
      "--has-description",
      "--has-criteria",
      "--criteria-count",
      "5"
    );
    expect(typeof result).toBe("string");
  });

  it("list telemetry sessions", async () => {
    await runOk("telemetry", "start");

    const list = (await runOk("telemetry", "list")) as unknown[];
    expect(list.length).toBeGreaterThanOrEqual(1);
  });

  it("end missing --session flag errors", async () => {
    const err = await runErr("telemetry", "end");
    expect(err.error).toBe("VALIDATION_ERROR");
    expect(err.message).toMatch(/--session/);
  });
});

// ── Workflow Launch Commands ────────────────────────────────────

describe("workflow launch", () => {
  async function setupTicket(): Promise<{ ticketId: string; epicId: string }> {
    const projPath = makeProjDir("launch-test");
    const p = (await runOk(
      "project",
      "create",
      "--name",
      "LaunchProject",
      "--path",
      projPath
    )) as Record<string, unknown>;

    const epic = (await runOk(
      "epic",
      "create",
      "--project",
      p.id as string,
      "--title",
      "LaunchEpic"
    )) as Record<string, unknown>;

    const t = (await runOk(
      "ticket",
      "create",
      "--project",
      p.id as string,
      "--title",
      "Launch Ticket",
      "--epic",
      epic.id as string
    )) as Record<string, unknown>;

    return { ticketId: t.id as string, epicId: epic.id as string };
  }

  it("launch-ticket requires --ticket", async () => {
    const err = await runErr("workflow", "launch-ticket");
    expect(err.error).toBe("VALIDATION_ERROR");
    expect(err.message).toMatch(/--ticket/);
  });

  it("launch-ticket rejects an unknown provider", async () => {
    const { ticketId } = await setupTicket();
    const err = await runErr(
      "workflow",
      "launch-ticket",
      "--ticket",
      ticketId,
      "--provider",
      "bogus-provider"
    );
    expect(err.error).toBe("VALIDATION_ERROR");
    expect(err.message).toMatch(/--provider/);
    expect(err.message).toMatch(/bogus-provider/);
  });

  it("launch-ticket returns a structured failure when the ticket does not exist", async () => {
    const result = await run(
      "workflow",
      "launch-ticket",
      "--ticket",
      "__definitely-missing__",
      "--provider",
      "claude-code"
    );
    expect(result.exitCode).toBe(1);
    const payload = parseJson({ ...result, exitCode: 0 }) as Record<string, unknown>;
    expect(payload.success).toBe(false);
    expect(String(payload.message)).toMatch(/Ticket not found/);
    expect(payload.provider).toBe("claude-code");
  });

  it("launch-epic requires --epic", async () => {
    const err = await runErr("workflow", "launch-epic");
    expect(err.error).toBe("VALIDATION_ERROR");
    expect(err.message).toMatch(/--epic/);
  });

  it("launch-epic returns a structured failure when the epic does not exist", async () => {
    const result = await run("workflow", "launch-epic", "--epic", "__definitely-missing__");
    expect(result.exitCode).toBe(1);
    const payload = parseJson({ ...result, exitCode: 0 }) as Record<string, unknown>;
    expect(payload.success).toBe(false);
    expect(String(payload.message)).toMatch(/Epic not found/);
    expect(payload.provider).toBeNull();
  });
});

// ── Unknown Command / Help ──────────────────────────────────────

describe("help and unknown commands", () => {
  it("help exits with 0", async () => {
    const result = await run("help");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Resources:");
  });

  it("unknown resource exits with 1", async () => {
    const result = await run("nonexistent");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown command");
  });

  it("unknown action within resource exits with 1", async () => {
    const err = await runErr("project", "nonexistent-action");
    expect(err.error).toBe("INVALID_ACTION");
  });
});

// ── JSON Output Shape ───────────────────────────────────────────

describe("JSON output consistency", () => {
  it("project create returns all expected fields", async () => {
    const projPath = makeProjDir("shape-test");
    const result = (await runOk(
      "project",
      "create",
      "--name",
      "ShapeTest",
      "--path",
      projPath
    )) as Record<string, unknown>;

    expect(typeof result.id).toBe("string");
    expect(typeof result.name).toBe("string");
    expect(typeof result.path).toBe("string");
    expect(typeof result.createdAt).toBe("string");
  });

  it("ticket create returns all expected fields", async () => {
    const projPath = makeProjDir("shape-project");
    const project = (await runOk(
      "project",
      "create",
      "--name",
      "ShapeProject",
      "--path",
      projPath
    )) as Record<string, unknown>;

    const ticket = (await runOk(
      "ticket",
      "create",
      "--project",
      project.id as string,
      "--title",
      "Shape Ticket",
      "--priority",
      "medium",
      "--tags",
      "a,b,c"
    )) as Record<string, unknown>;

    expect(typeof ticket.id).toBe("string");
    expect(typeof ticket.title).toBe("string");
    expect(typeof ticket.status).toBe("string");
    expect(typeof ticket.createdAt).toBe("string");
    expect(ticket.priority).toBe("medium");
    expect(ticket.tags).toEqual(["a", "b", "c"]);
  });

  it("error responses have consistent shape", async () => {
    const err = await runErr("project", "create");
    expect(typeof err.error).toBe("string");
    expect(typeof err.message).toBe("string");
  });
});
