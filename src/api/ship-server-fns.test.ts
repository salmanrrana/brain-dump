import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "../../core/index.ts";
import type { DbHandle, ExecFileNoThrowResult } from "../../core/index.ts";
import { seedEpic, seedProject, seedTicket } from "../../core/__tests__/test-helpers.ts";
import { commitAndShip, generatePrBody, getShipPrepData, pushBranch } from "./ship-core";

type MockExec = (
  command: string,
  args: string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }
) => Promise<ExecFileNoThrowResult>;

interface RecordedCall {
  command: string;
  args: string[];
  options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number };
}

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

function createCommandKey(command: string, args: string[], cwd?: string): string {
  return JSON.stringify([command, args, cwd ?? null]);
}

function createRecordingExec(results: Record<string, ExecFileNoThrowResult>): {
  execFileNoThrow: MockExec;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];

  return {
    calls,
    execFileNoThrow: async (command, args, options) => {
      const call: RecordedCall = {
        command,
        args: [...args],
      };
      if (options) {
        call.options = options;
      }
      calls.push(call);

      const key = createCommandKey(command, args, options?.cwd);
      return results[key] ?? createExecResult();
    },
  };
}

function seedWorkSummary(
  ticketId: string,
  content: string,
  createdAt = "2026-03-08T01:00:00.000Z"
): void {
  db.prepare(
    `INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(`comment-${ticketId}-${createdAt}`, ticketId, content, "ralph", "work_summary", createdAt);
}

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
      "git log -1 --format=%H%n%s": createExecResult({
        stdout: "abcdef1234567890\nfeat(ticket-1): existing branch work\n",
      }),
    });

    const result = await getShipPrepData(
      { ticketId: "ticket-1" },
      {
        db,
        execFileNoThrow,
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
      ghAvailable: true,
      remoteConfigured: true,
      inferredScope: {
        type: "ticket",
        id: "ticket-1",
        title: "Ticket ticket-1",
      },
      existingPr: null,
      headCommit: {
        hash: "abcdef1234567890",
        message: "feat(ticket-1): existing branch work",
      },
    });
  });

  it("marks protected branches as unsafe, exposes existing PR linkage, and treats missing gh/remotes as failed checks", async () => {
    seedProject(db, { id: "proj-1", path: "/tmp/ship-project" });
    seedEpic(db, { id: "epic-1", projectId: "proj-1", title: "Ship Epic" });

    db.prepare(
      `INSERT INTO epic_workflow_state (
        id,
        epic_id,
        epic_branch_name,
        pr_number,
        pr_url,
        pr_status,
        epic_branch_created_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "ews-1",
      "epic-1",
      "main",
      57,
      "https://example.com/pull/57",
      "open",
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
      "git log -1 --format=%H%n%s": createExecResult({
        stdout: "fedcba9876543210\nfeat(epic-1): existing epic branch\n",
      }),
    });

    const result = await getShipPrepData(
      { epicId: "epic-1" },
      {
        db,
        execFileNoThrow,
      }
    );

    expect(result.isSafeToShip).toBe(false);
    expect(result.ghAvailable).toBe(false);
    expect(result.remoteConfigured).toBe(false);
    expect(result.inferredScope).toEqual({
      type: "epic",
      id: "epic-1",
      title: "Ship Epic",
    });
    expect(result.existingPr).toEqual({
      number: 57,
      url: "https://example.com/pull/57",
      status: "open",
    });
    expect(result.headCommit).toEqual({
      hash: "fedcba9876543210",
      message: "feat(epic-1): existing epic branch",
    });
  });

  it("fails when neither or both scope ids are provided", async () => {
    const deps = {
      db,
      execFileNoThrow: createMockExec({}),
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
        }
      )
    ).rejects.toThrow("Unable to inspect changed files: fatal: not a git repository");
  });
});

describe("generatePrBody", () => {
  it("renders epic scope tickets, checkbox criteria, work summaries, and the demo sentinel", () => {
    seedProject(db, { id: "proj-1", name: "Brain Dump", path: "/tmp/ship-project" });
    seedEpic(db, {
      id: "epic-1",
      projectId: "proj-1",
      title: "Ship Changes",
    });
    seedTicket(db, {
      id: "ticket-1",
      projectId: "proj-1",
      epicId: "epic-1",
      description: "Primary shipping flow",
      subtasks: JSON.stringify([
        { id: "ac-1", criterion: "Stage only selected files", status: "pending" },
        { id: "ac-2", criterion: "Persist PR metadata", status: "passed" },
      ]),
    });
    seedTicket(db, {
      id: "ticket-2",
      projectId: "proj-1",
      epicId: "epic-1",
      description: "## Acceptance Criteria\n- [ ] Show demo step sentinel",
    });
    seedWorkSummary("ticket-1", "## Summary\n- Added commit + PR orchestration");

    db.prepare(
      `INSERT INTO epic_workflow_state (
        id,
        epic_id,
        epic_branch_name,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?)`
    ).run(
      "ews-1",
      "epic-1",
      "feature/epic-1-ship",
      "2026-03-08T01:00:00.000Z",
      "2026-03-08T01:00:00.000Z"
    );

    const result = generatePrBody(
      {
        scopeType: "epic",
        scopeId: "epic-1",
      },
      db
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.body).toContain("# [Epic] Ship Changes");
    expect(result.body).toContain("- Project: Brain Dump");
    expect(result.body).toContain("### Ticket ticket-1 (`ticket-1`)");
    expect(result.body).toContain("- [ ] Stage only selected files");
    expect(result.body).toContain("- [x] Persist PR metadata");
    expect(result.body).toContain("- [ ] Show demo step sentinel");
    expect(result.body).toContain("## Implementation Notes");
    expect(result.body).toContain("> - Added commit + PR orchestration");
    expect(result.body).toContain("<!-- brain-dump:demo-steps -->");
  });
});

describe("commitAndShip", () => {
  it("stages only selected files and links commit and PR metadata across all epic tickets", async () => {
    seedProject(db, { id: "proj-1", path: "/tmp/ship-project" });
    seedEpic(db, { id: "epic-1", projectId: "proj-1", title: "Ship Epic" });
    seedTicket(db, {
      id: "ticket-1",
      projectId: "proj-1",
      epicId: "epic-1",
    });
    seedTicket(db, {
      id: "ticket-2",
      projectId: "proj-1",
      epicId: "epic-1",
    });

    db.prepare(
      `INSERT INTO epic_workflow_state (
        id,
        epic_id,
        epic_branch_name,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?)`
    ).run(
      "ews-1",
      "epic-1",
      "feature/epic-1-ship",
      "2026-03-08T01:00:00.000Z",
      "2026-03-08T01:00:00.000Z"
    );

    const prBody = "# PR body\n\n## Demo Steps\n<!-- brain-dump:demo-steps -->";
    const { execFileNoThrow, calls } = createRecordingExec({
      [createCommandKey("git", ["add", "--", "src/a.ts", "src/b.ts"], "/tmp/ship-project")]:
        createExecResult(),
      [createCommandKey(
        "git",
        ["commit", "-m", "feat(585695ad): ship changes"],
        "/tmp/ship-project"
      )]: createExecResult({
        stdout: "[feature/epic-1-ship abc1234] feat(585695ad): ship changes\n 2 files changed",
      }),
      [createCommandKey(
        "git",
        ["push", "-u", "origin", "feature/epic-1-ship"],
        "/tmp/ship-project"
      )]: createExecResult(),
      [createCommandKey(
        "gh",
        [
          "pr",
          "create",
          "--head",
          "feature/epic-1-ship",
          "--title",
          "Ship Changes",
          "--body",
          prBody,
          "--draft",
        ],
        "/tmp/ship-project"
      )]: createExecResult({
        stdout: "https://github.com/example/brain-dump/pull/42\n",
      }),
    });

    const result = await commitAndShip(
      {
        scopeType: "epic",
        scopeId: "epic-1",
        message: "feat(585695ad): ship changes",
        selectedPaths: ["src/a.ts", "src/b.ts", "src/a.ts"],
        prTitle: "Ship Changes",
        prBody,
        draft: true,
      },
      {
        db,
        execFileNoThrow,
        now: () => "2026-03-08T02:00:00.000Z",
        createId: () => "ews-created",
      }
    );

    expect(result).toEqual({
      success: true,
      commitHash: "abc1234",
      prNumber: 42,
      prUrl: "https://github.com/example/brain-dump/pull/42",
    });

    expect(calls).toEqual([
      {
        command: "git",
        args: ["add", "--", "src/a.ts", "src/b.ts"],
        options: { cwd: "/tmp/ship-project" },
      },
      {
        command: "git",
        args: ["commit", "-m", "feat(585695ad): ship changes"],
        options: { cwd: "/tmp/ship-project" },
      },
      {
        command: "git",
        args: ["push", "-u", "origin", "feature/epic-1-ship"],
        options: { cwd: "/tmp/ship-project" },
      },
      {
        command: "gh",
        args: [
          "pr",
          "create",
          "--head",
          "feature/epic-1-ship",
          "--title",
          "Ship Changes",
          "--body",
          prBody,
          "--draft",
        ],
        options: {
          cwd: "/tmp/ship-project",
          env: expect.objectContaining({
            GH_PROMPT_DISABLED: "1",
            GIT_TERMINAL_PROMPT: "0",
          }),
          timeoutMs: 30_000,
        },
      },
    ]);

    const tickets = db
      .prepare(
        "SELECT id, linked_commits, pr_number, pr_url, pr_status FROM tickets WHERE epic_id = ? ORDER BY id ASC"
      )
      .all("epic-1") as Array<{
      id: string;
      linked_commits: string | null;
      pr_number: number | null;
      pr_url: string | null;
      pr_status: string | null;
    }>;

    expect(tickets).toHaveLength(2);
    for (const ticket of tickets) {
      expect(JSON.parse(ticket.linked_commits ?? "[]")).toEqual([
        {
          hash: "abc1234",
          message: "feat(585695ad): ship changes",
          linkedAt: expect.any(String),
        },
      ]);
      expect(ticket.pr_number).toBe(42);
      expect(ticket.pr_url).toBe("https://github.com/example/brain-dump/pull/42");
      expect(ticket.pr_status).toBe("draft");
    }

    const epicWorkflowState = db
      .prepare(
        "SELECT pr_number, pr_url, pr_status, updated_at FROM epic_workflow_state WHERE epic_id = ?"
      )
      .get("epic-1") as {
      pr_number: number | null;
      pr_url: string | null;
      pr_status: string | null;
      updated_at: string;
    };

    expect(epicWorkflowState).toEqual({
      pr_number: 42,
      pr_url: "https://github.com/example/brain-dump/pull/42",
      pr_status: "draft",
      updated_at: "2026-03-08T02:00:00.000Z",
    });
  });

  it("returns a structured error when gh output does not include a PR reference", async () => {
    seedProject(db, { id: "proj-1", path: "/tmp/ship-project" });
    seedTicket(db, {
      id: "ticket-1",
      projectId: "proj-1",
      branchName: "feature/ticket-1-ship",
    });

    const { execFileNoThrow } = createRecordingExec({
      [createCommandKey("git", ["add", "--", "src/a.ts"], "/tmp/ship-project")]: createExecResult(),
      [createCommandKey("git", ["commit", "-m", "feat(ticket-1): ship"], "/tmp/ship-project")]:
        createExecResult({
          stdout: "[feature/ticket-1-ship abcdef1] feat(ticket-1): ship\n 1 file changed",
        }),
      [createCommandKey(
        "git",
        ["push", "-u", "origin", "feature/ticket-1-ship"],
        "/tmp/ship-project"
      )]: createExecResult(),
      [createCommandKey(
        "gh",
        [
          "pr",
          "create",
          "--head",
          "feature/ticket-1-ship",
          "--title",
          "Ticket Ship",
          "--body",
          "body",
        ],
        "/tmp/ship-project"
      )]: createExecResult({
        stdout: "created pull request successfully",
      }),
    });

    const result = await commitAndShip(
      {
        scopeType: "ticket",
        scopeId: "ticket-1",
        message: "feat(ticket-1): ship",
        selectedPaths: ["src/a.ts"],
        prTitle: "Ticket Ship",
        prBody: "body",
        draft: false,
      },
      {
        db,
        execFileNoThrow,
        now: () => "2026-03-08T02:00:00.000Z",
        createId: () => "unused",
      }
    );

    expect(result).toEqual({
      success: false,
      step: "pr",
      error: "Pull request was created, but the PR URL/number could not be parsed from gh output.",
    });
  });

  it("creates a pull request from the current branch when there are no changed files", async () => {
    seedProject(db, { id: "proj-1", path: "/tmp/ship-project" });
    seedTicket(db, {
      id: "ticket-1",
      projectId: "proj-1",
      branchName: "feature/ticket-1-ship",
    });

    const { execFileNoThrow, calls } = createRecordingExec({
      [createCommandKey("git", ["status", "--short"], "/tmp/ship-project")]: createExecResult(),
      [createCommandKey("git", ["log", "-1", "--format=%H%n%s"], "/tmp/ship-project")]:
        createExecResult({
          stdout: "abcdef1\nfeat(ticket-1): existing branch work\n",
        }),
      [createCommandKey(
        "git",
        ["push", "-u", "origin", "feature/ticket-1-ship"],
        "/tmp/ship-project"
      )]: createExecResult(),
      [createCommandKey(
        "gh",
        [
          "pr",
          "create",
          "--head",
          "feature/ticket-1-ship",
          "--title",
          "Ticket Ship",
          "--body",
          "body",
        ],
        "/tmp/ship-project"
      )]: createExecResult({
        stdout: "https://github.com/example/brain-dump/pull/57\n",
      }),
    });

    const result = await commitAndShip(
      {
        scopeType: "ticket",
        scopeId: "ticket-1",
        message: "feat(ticket-1): ignored when branch is clean",
        selectedPaths: [],
        prTitle: "Ticket Ship",
        prBody: "body",
        draft: false,
      },
      {
        db,
        execFileNoThrow,
        now: () => "2026-03-08T02:00:00.000Z",
        createId: () => "unused",
      }
    );

    expect(result).toEqual({
      success: true,
      commitHash: "abcdef1",
      prNumber: 57,
      prUrl: "https://github.com/example/brain-dump/pull/57",
    });

    expect(calls).toEqual([
      {
        command: "git",
        args: ["status", "--short"],
        options: { cwd: "/tmp/ship-project" },
      },
      {
        command: "git",
        args: ["log", "-1", "--format=%H%n%s"],
        options: { cwd: "/tmp/ship-project" },
      },
      {
        command: "git",
        args: ["push", "-u", "origin", "feature/ticket-1-ship"],
        options: { cwd: "/tmp/ship-project" },
      },
      {
        command: "gh",
        args: [
          "pr",
          "create",
          "--head",
          "feature/ticket-1-ship",
          "--title",
          "Ticket Ship",
          "--body",
          "body",
        ],
        options: {
          cwd: "/tmp/ship-project",
          env: expect.objectContaining({
            GH_PROMPT_DISABLED: "1",
            GIT_TERMINAL_PROMPT: "0",
          }),
          timeoutMs: 30_000,
        },
      },
    ]);

    const ticket = db
      .prepare("SELECT linked_commits, pr_number, pr_url, pr_status FROM tickets WHERE id = ?")
      .get("ticket-1") as {
      linked_commits: string | null;
      pr_number: number | null;
      pr_url: string | null;
      pr_status: string | null;
    };

    expect(JSON.parse(ticket.linked_commits ?? "[]")).toEqual([
      {
        hash: "abcdef1",
        message: "feat(ticket-1): existing branch work",
        linkedAt: expect.any(String),
      },
    ]);
    expect(ticket.pr_number).toBe(57);
    expect(ticket.pr_url).toBe("https://github.com/example/brain-dump/pull/57");
    expect(ticket.pr_status).toBe("open");
  });

  it("returns a structured error when gh pr create times out in headless mode", async () => {
    seedProject(db, { id: "proj-1", path: "/tmp/ship-project" });
    seedTicket(db, {
      id: "ticket-1",
      projectId: "proj-1",
      branchName: "feature/ticket-1-ship",
    });

    const { execFileNoThrow, calls } = createRecordingExec({
      [createCommandKey("git", ["add", "--", "src/a.ts"], "/tmp/ship-project")]: createExecResult(),
      [createCommandKey("git", ["commit", "-m", "feat(ticket-1): ship"], "/tmp/ship-project")]:
        createExecResult({
          stdout: "[feature/ticket-1-ship abcdef1] feat(ticket-1): ship\n 1 file changed",
        }),
      [createCommandKey(
        "git",
        ["push", "-u", "origin", "feature/ticket-1-ship"],
        "/tmp/ship-project"
      )]: createExecResult(),
      [createCommandKey(
        "gh",
        [
          "pr",
          "create",
          "--head",
          "feature/ticket-1-ship",
          "--title",
          "Ticket Ship",
          "--body",
          "body",
        ],
        "/tmp/ship-project"
      )]: createExecResult({
        success: false,
        error: "Command failed: gh pr create timed out",
      }),
    });

    const result = await commitAndShip(
      {
        scopeType: "ticket",
        scopeId: "ticket-1",
        message: "feat(ticket-1): ship",
        selectedPaths: ["src/a.ts"],
        prTitle: "Ticket Ship",
        prBody: "body",
        draft: false,
      },
      {
        db,
        execFileNoThrow,
        now: () => "2026-03-08T02:00:00.000Z",
        createId: () => "unused",
      }
    );

    expect(result).toEqual({
      success: false,
      step: "pr",
      error:
        "Failed to create pull request: GitHub CLI timed out waiting for a non-interactive result. Check gh auth and repository defaults, then retry.",
    });

    expect(calls.at(-1)).toEqual({
      command: "gh",
      args: [
        "pr",
        "create",
        "--head",
        "feature/ticket-1-ship",
        "--title",
        "Ticket Ship",
        "--body",
        "body",
      ],
      options: {
        cwd: "/tmp/ship-project",
        env: expect.objectContaining({
          GH_PROMPT_DISABLED: "1",
          GIT_TERMINAL_PROMPT: "0",
        }),
        timeoutMs: 30_000,
      },
    });
  });
});

describe("pushBranch", () => {
  it("pushes the resolved branch for ticket scope using trusted server-side context", async () => {
    seedProject(db, { id: "proj-1", path: "/tmp/ship-project" });
    seedTicket(db, {
      id: "ticket-1",
      projectId: "proj-1",
      branchName: "feature/ticket-1-ship",
    });

    const { execFileNoThrow, calls } = createRecordingExec({
      [createCommandKey("git", ["push", "origin", "feature/ticket-1-ship"], "/tmp/ship-project")]:
        createExecResult(),
    });

    const result = await pushBranch(
      {
        scopeType: "ticket",
        scopeId: "ticket-1",
      },
      {
        db,
        execFileNoThrow,
      }
    );

    expect(result).toEqual({
      success: true,
      branchName: "feature/ticket-1-ship",
    });
    expect(calls).toEqual([
      {
        command: "git",
        args: ["push", "origin", "feature/ticket-1-ship"],
        options: { cwd: "/tmp/ship-project" },
      },
    ]);
  });

  it("returns a structured error when no workflow branch exists", async () => {
    seedProject(db, { id: "proj-1", path: "/tmp/ship-project" });
    seedEpic(db, { id: "epic-1", projectId: "proj-1", title: "Ship Epic" });

    const result = await pushBranch(
      {
        scopeType: "epic",
        scopeId: "epic-1",
      },
      {
        db,
        execFileNoThrow: createMockExec({}),
      }
    );

    expect(result).toEqual({
      success: false,
      error: "No branch is linked to this epic. Start workflow branch creation first.",
    });
  });
});
