import { beforeEach, describe, expect, it } from "vitest";
import type { Stats } from "fs";
import { createTestDatabase } from "../../core/index.ts";
import type { DbHandle, ExecFileNoThrowResult } from "../../core/index.ts";
import { seedEpic, seedProject, seedTicket } from "../../core/__tests__/test-helpers.ts";
import { getShipPrepData, isReviewMarkerFresh } from "./ship-server-fns";

type MockExec = (
  command: string,
  args: string[],
  options?: { cwd?: string }
) => Promise<ExecFileNoThrowResult>;

let db: DbHandle;

beforeEach(() => {
  const result = createTestDatabase();
  db = result.db;
});

function createExecResult(overrides: Partial<ExecFileNoThrowResult> = {}): ExecFileNoThrowResult {
  return {
    success: true,
    stdout: "",
    stderr: "",
    exitCode: 0,
    ...overrides,
  };
}

function createMockExec(results: Record<string, ExecFileNoThrowResult>): MockExec {
  return async (command, args) => {
    const key = [command, ...args].join(" ");
    return results[key] ?? createExecResult();
  };
}

function createStats(mtimeMs: number): Stats {
  return {
    mtimeMs,
  } as Stats;
}

describe("isReviewMarkerFresh", () => {
  it("returns true when the review marker was updated within 5 minutes", async () => {
    const now = 10 * 60 * 1000;
    const stat = async () => createStats(now - (5 * 60 * 1000 - 1));

    await expect(
      isReviewMarkerFresh("/tmp/project", {
        stat,
        now: () => now,
      })
    ).resolves.toBe(true);
  });

  it("returns false when the review marker is missing or stale", async () => {
    const missingStat = async () => {
      throw new Error("ENOENT");
    };

    await expect(
      isReviewMarkerFresh("/tmp/project", {
        stat: missingStat,
        now: () => Date.now(),
      })
    ).resolves.toBe(false);
  });
});

describe("getShipPrepData", () => {
  it("resolves ticket scope server-side and returns the full preflight payload", async () => {
    seedProject(db, { id: "proj-1", path: "/tmp/ship-project" });
    seedEpic(db, { id: "epic-1", projectId: "proj-1", title: "Ship Epic" });
    seedTicket(db, {
      id: "ticket-1",
      projectId: "proj-1",
      epicId: "epic-1",
      branchName: "feature/ticket-1-ship",
    });

    const execFileNoThrow = createMockExec({
      "git status --short": createExecResult({
        stdout: [
          " M src/modified.ts",
          "D  src/deleted.ts",
          "R  src/old-name.ts -> src/new-name.ts",
          "?? src/new-file.ts",
        ].join("\n"),
      }),
      "git branch --show-current": createExecResult({
        stdout: "feature/ticket-1-ship\n",
      }),
      "which gh": createExecResult({
        stdout: "/usr/bin/gh\n",
      }),
      "git remote": createExecResult({
        stdout: "origin\n",
      }),
    });

    const result = await getShipPrepData(
      { ticketId: "ticket-1" },
      {
        db,
        execFileNoThrow,
        stat: async () => createStats(Date.now()),
        now: () => Date.now(),
      }
    );

    expect(result).toEqual({
      changedFiles: [
        { path: "src/modified.ts", status: "M" },
        { path: "src/deleted.ts", status: "D" },
        { path: "src/new-name.ts", status: "R" },
        { path: "src/new-file.ts", status: "??" },
      ],
      currentBranch: "feature/ticket-1-ship",
      isSafeToShip: true,
      reviewMarkerFresh: true,
      ghAvailable: true,
      remoteConfigured: true,
      inferredScope: {
        type: "ticket",
        id: "ticket-1",
        title: "Ticket ticket-1",
      },
    });
  });

  it("marks protected branches as unsafe and treats missing gh/remotes as failed checks", async () => {
    seedProject(db, { id: "proj-1", path: "/tmp/ship-project" });
    seedEpic(db, { id: "epic-1", projectId: "proj-1", title: "Ship Epic" });

    db.prepare(
      `INSERT INTO epic_workflow_state (
        id,
        epic_id,
        epic_branch_name,
        epic_branch_created_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      "ews-1",
      "epic-1",
      "main",
      new Date().toISOString(),
      new Date().toISOString(),
      new Date().toISOString()
    );

    const execFileNoThrow = createMockExec({
      "git status --short": createExecResult(),
      "git branch --show-current": createExecResult({
        stdout: "main\n",
      }),
      "which gh": createExecResult({
        success: false,
        exitCode: 1,
        error: "Command failed",
      }),
      "git remote": createExecResult(),
    });

    const result = await getShipPrepData(
      { epicId: "epic-1" },
      {
        db,
        execFileNoThrow,
        stat: async () => createStats(0),
        now: () => REVIEW_STALE_NOW,
      }
    );

    expect(result.isSafeToShip).toBe(false);
    expect(result.ghAvailable).toBe(false);
    expect(result.remoteConfigured).toBe(false);
    expect(result.reviewMarkerFresh).toBe(false);
    expect(result.inferredScope).toEqual({
      type: "epic",
      id: "epic-1",
      title: "Ship Epic",
    });
  });

  it("fails when neither or both scope ids are provided", async () => {
    const deps = {
      db,
      execFileNoThrow: createMockExec({}),
      stat: async () => createStats(Date.now()),
      now: () => Date.now(),
    };

    await expect(getShipPrepData({}, deps)).rejects.toThrow(
      "Provide exactly one of ticketId or epicId"
    );
    await expect(getShipPrepData({ ticketId: "ticket-1", epicId: "epic-1" }, deps)).rejects.toThrow(
      "Provide exactly one of ticketId or epicId"
    );
  });

  it("surfaces git command failures instead of silently hiding them", async () => {
    seedProject(db, { id: "proj-1", path: "/tmp/ship-project" });
    seedTicket(db, {
      id: "ticket-1",
      projectId: "proj-1",
      branchName: "feature/ticket-1-ship",
    });

    const execFileNoThrow = createMockExec({
      "git status --short": createExecResult({
        success: false,
        stderr: "fatal: not a git repository",
        exitCode: 128,
        error: "Command failed: git status --short",
      }),
      "git branch --show-current": createExecResult({
        stdout: "feature/ticket-1-ship\n",
      }),
      "git remote": createExecResult({
        stdout: "origin\n",
      }),
    });

    await expect(
      getShipPrepData(
        { ticketId: "ticket-1" },
        {
          db,
          execFileNoThrow,
          stat: async () => createStats(Date.now()),
          now: () => Date.now(),
        }
      )
    ).rejects.toThrow("Unable to inspect changed files: fatal: not a git repository");
  });
});

const REVIEW_STALE_NOW = 6 * 60 * 1000;
