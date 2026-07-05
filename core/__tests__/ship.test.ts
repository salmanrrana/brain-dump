import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import {
  DEMO_STEPS_SENTINEL,
  execFileNoThrow,
  parseCommitHashFromOutput,
  parseGitStatusShortOutput,
  parsePullRequestRef,
  renderDemoStepsMarkdown,
  replaceSentinelBlock,
  resolveShipScope,
  handleEpicCompletionAutoPr,
  syncPrVerificationChecklist,
} from "../ship.ts";
import { seedEpic, seedProject, seedTicket } from "./test-helpers.ts";

let db: Database.Database;

beforeEach(() => {
  const result = createTestDatabase();
  db = result.db;
});

function createExecResult(overrides: Partial<Awaited<ReturnType<typeof execFileNoThrow>>> = {}) {
  return {
    success: true,
    stdout: "",
    stderr: "",
    exitCode: 0,
    ...overrides,
  };
}

function seedVerificationRun(ticketId: string, overrides: { gitSha?: string } = {}): void {
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
    JSON.stringify({ evidenceFiles: [{ path: `/tmp/${ticketId}.json`, hash: "hash" }] }),
    overrides.gitSha ?? "abc123",
    "2026-03-08T01:00:00.000Z",
    "2026-03-08T01:01:00.000Z"
  );
}

describe("execFileNoThrow", () => {
  it("returns a structured success result instead of throwing", async () => {
    const result = await execFileNoThrow("node", ["-e", "process.stdout.write('ok')"]);

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(typeof result.stdout).toBe("string");
    expect(typeof result.stderr).toBe("string");
  });

  it("returns a structured failure result instead of throwing", async () => {
    const result = await execFileNoThrow("node", [
      "-e",
      "process.stderr.write('boom'); process.exit(3)",
    ]);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(3);
    expect(result.error).toContain("Command failed");
    expect(typeof result.stdout).toBe("string");
    expect(typeof result.stderr).toBe("string");
  });
});

describe("resolveShipScope", () => {
  it("resolves trusted ticket scope data from ticket and project records", () => {
    seedProject(db, { id: "proj-1", path: "/tmp/ship-project" });
    seedEpic(db, { id: "epic-1", projectId: "proj-1", title: "Ship Epic" });
    seedTicket(db, {
      id: "ticket-1",
      projectId: "proj-1",
      branchName: "feature/ticket-1-ship",
      epicId: "epic-1",
    });

    db.prepare("UPDATE tickets SET pr_number = ?, pr_url = ?, pr_status = ? WHERE id = ?").run(
      42,
      "https://github.com/org/repo/pull/42",
      "draft",
      "ticket-1"
    );

    const scope = resolveShipScope(db, { scopeType: "ticket", scopeId: "ticket-1" });

    expect(scope).toMatchObject({
      scopeType: "ticket",
      ticketId: "ticket-1",
      title: "Ticket ticket-1",
      projectPath: "/tmp/ship-project",
      branchName: "feature/ticket-1-ship",
      epicId: "epic-1",
      prNumber: 42,
      prStatus: "draft",
    });
  });

  it("resolves trusted epic scope data including ticket ids and workflow state", () => {
    seedProject(db, { id: "proj-1", path: "/tmp/ship-project" });
    seedEpic(db, { id: "epic-1", projectId: "proj-1", title: "Ship Epic" });
    seedTicket(db, { id: "ticket-1", projectId: "proj-1", epicId: "epic-1" });
    seedTicket(db, { id: "ticket-2", projectId: "proj-1", epicId: "epic-1" });

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO epic_workflow_state (
        id,
        epic_id,
        epic_branch_name,
        epic_branch_created_at,
        pr_number,
        pr_url,
        pr_status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "ews-1",
      "epic-1",
      "feature/epic-ship",
      now,
      77,
      "https://github.com/org/repo/pull/77",
      "open",
      now,
      now
    );

    const scope = resolveShipScope(db, { scopeType: "epic", scopeId: "epic-1" });

    expect(scope).toMatchObject({
      scopeType: "epic",
      epicId: "epic-1",
      title: "Ship Epic",
      projectPath: "/tmp/ship-project",
      branchName: "feature/epic-ship",
      prNumber: 77,
      prStatus: "open",
      ticketIds: ["ticket-1", "ticket-2"],
    });
  });
});

describe("parseGitStatusShortOutput", () => {
  it("parses tracked, untracked, deleted, and renamed files from realistic short status output", () => {
    const output = [
      " M src/modified.ts",
      "A  src/staged.ts",
      "D  src/deleted.ts",
      "R  src/old-name.ts -> src/new-name.ts",
      "MM src/both.ts",
      "?? src/new-file.ts",
    ].join("\n");

    expect(parseGitStatusShortOutput(output)).toEqual([
      {
        path: "src/modified.ts",
        status: "M",
        indexStatus: " ",
        workingTreeStatus: "M",
      },
      {
        path: "src/staged.ts",
        status: "A",
        indexStatus: "A",
        workingTreeStatus: " ",
      },
      {
        path: "src/deleted.ts",
        status: "D",
        indexStatus: "D",
        workingTreeStatus: " ",
      },
      {
        path: "src/new-name.ts",
        originalPath: "src/old-name.ts",
        status: "R",
        indexStatus: "R",
        workingTreeStatus: " ",
      },
      {
        path: "src/both.ts",
        status: "MM",
        indexStatus: "M",
        workingTreeStatus: "M",
      },
      {
        path: "src/new-file.ts",
        status: "??",
        indexStatus: "?",
        workingTreeStatus: "?",
      },
    ]);
  });
});

describe("parseCommitHashFromOutput", () => {
  it("extracts the commit hash from standard git commit output", () => {
    const output = "[feature/ship 1a2b3c4] Add ship helpers\n 3 files changed, 42 insertions(+)";

    expect(parseCommitHashFromOutput(output)).toBe("1a2b3c4");
  });

  it("supports detached head commit output", () => {
    const output = "[detached HEAD abcdef1] Fix parser";

    expect(parseCommitHashFromOutput(output)).toBe("abcdef1");
  });
});

describe("parsePullRequestRef", () => {
  it("extracts the PR URL and number from gh pr create output", () => {
    const output = "https://github.com/openai/brain-dump/pull/128\n";

    expect(parsePullRequestRef(output)).toEqual({
      number: 128,
      url: "https://github.com/openai/brain-dump/pull/128",
    });
  });
});

describe("handleEpicCompletionAutoPr", () => {
  function seedCompletedEpic(): void {
    seedProject(db, { id: "proj-1", path: "/tmp/ship-project" });
    seedEpic(db, { id: "epic-1", projectId: "proj-1", title: "Ship Epic" });
    seedTicket(db, {
      id: "ticket-1",
      projectId: "proj-1",
      epicId: "epic-1",
      status: "done",
      branchName: "feature/epic-ship",
    });
    seedTicket(db, {
      id: "ticket-2",
      projectId: "proj-1",
      epicId: "epic-1",
      status: "done",
      branchName: "feature/epic-ship",
    });
    seedVerificationRun("ticket-1", { gitSha: "sha111" });
    seedVerificationRun("ticket-2", { gitSha: "sha222" });
  }

  it("skips PR work until every ticket in the epic is done", async () => {
    seedProject(db, { id: "proj-1", path: "/tmp/ship-project" });
    seedEpic(db, { id: "epic-1", projectId: "proj-1", title: "Ship Epic" });
    seedTicket(db, {
      id: "ticket-1",
      projectId: "proj-1",
      epicId: "epic-1",
      status: "done",
      branchName: "feature/epic-ship",
    });
    seedTicket(db, {
      id: "ticket-2",
      projectId: "proj-1",
      epicId: "epic-1",
      status: "ai_verification",
      branchName: "feature/epic-ship",
    });

    const calls: string[] = [];
    const result = await handleEpicCompletionAutoPr(
      { completedTicketId: "ticket-1" },
      {
        db,
        execFileNoThrow: async (command, args) => {
          calls.push([command, ...args].join(" "));
          return createExecResult();
        },
      }
    );

    expect(result).toMatchObject({ completed: false, skipped: true, branchResults: [] });
    expect(calls).toEqual([]);
  });

  it("creates one ready PR when the final epic ticket passes verification", async () => {
    seedCompletedEpic();
    const calls: Array<{ command: string; args: string[]; cwd?: string }> = [];

    const result = await handleEpicCompletionAutoPr(
      { completedTicketId: "ticket-2" },
      {
        db,
        execFileNoThrow: async (command, args, options) => {
          calls.push({ command, args, ...(options?.cwd ? { cwd: options.cwd } : {}) });
          if (command === "gh" && args[0] === "pr" && args[1] === "list") {
            return createExecResult({ stdout: "[]" });
          }
          if (command === "gh" && args[0] === "pr" && args[1] === "create") {
            return createExecResult({ stdout: "https://github.com/org/repo/pull/88\n" });
          }
          return createExecResult();
        },
      }
    );

    expect(result.branchResults).toEqual([
      expect.objectContaining({
        branchName: "feature/epic-ship",
        success: true,
        action: "created",
        prNumber: 88,
      }),
    ]);
    expect(calls.map((call) => [call.command, ...call.args])).toEqual([
      [
        "gh",
        "pr",
        "list",
        "--head",
        "feature/epic-ship",
        "--json",
        "number,url,isDraft,state",
        "--limit",
        "1",
      ],
      ["git", "push", "-u", "origin", "feature/epic-ship"],
      [
        "gh",
        "pr",
        "create",
        "--title",
        "[Epic] Ship Epic",
        "--body",
        expect.stringContaining("All tickets in this epic passed AI verification"),
        "--base",
        "main",
        "--head",
        "feature/epic-ship",
      ],
    ]);
    const ticketLinks = db
      .prepare("SELECT id, pr_number, pr_status FROM tickets ORDER BY id")
      .all() as Array<{ id: string; pr_number: number | null; pr_status: string | null }>;
    expect(ticketLinks).toEqual([
      { id: "ticket-1", pr_number: 88, pr_status: "open" },
      { id: "ticket-2", pr_number: 88, pr_status: "open" },
    ]);
    const comment = db
      .prepare("SELECT content, type FROM ticket_comments WHERE type = 'progress'")
      .get() as { content: string; type: string };
    expect(comment.type).toBe("progress");
    expect(comment.content).toContain("Ready PR #88 was created automatically");
  });

  it("marks an existing draft epic PR ready and rewrites its body", async () => {
    seedCompletedEpic();
    const calls: Array<{ command: string; args: string[] }> = [];

    const result = await handleEpicCompletionAutoPr(
      { completedTicketId: "ticket-2" },
      {
        db,
        execFileNoThrow: async (command, args) => {
          calls.push({ command, args });
          if (command === "gh" && args[0] === "pr" && args[1] === "list") {
            return createExecResult({
              stdout: JSON.stringify([
                {
                  number: 77,
                  url: "https://github.com/org/repo/pull/77",
                  isDraft: true,
                  state: "OPEN",
                },
              ]),
            });
          }
          return createExecResult();
        },
      }
    );

    expect(result.branchResults[0]).toMatchObject({
      success: true,
      action: "readied",
      prNumber: 77,
    });
    expect(calls.map((call) => [call.command, ...call.args])).toEqual([
      [
        "gh",
        "pr",
        "list",
        "--head",
        "feature/epic-ship",
        "--json",
        "number,url,isDraft,state",
        "--limit",
        "1",
      ],
      ["gh", "pr", "edit", "77", "--body", expect.stringContaining("sha111"), "--base", "main"],
      ["gh", "pr", "ready", "77"],
    ]);
    const state = db
      .prepare(
        "SELECT pr_number, pr_url, pr_status FROM epic_workflow_state WHERE epic_id = 'epic-1'"
      )
      .get() as { pr_number: number; pr_url: string; pr_status: string };
    expect(state).toEqual({
      pr_number: 77,
      pr_url: "https://github.com/org/repo/pull/77",
      pr_status: "open",
    });
  });

  it("does not open duplicate PRs when an existing open PR already matches the branch", async () => {
    seedCompletedEpic();
    const calls: Array<{ command: string; args: string[] }> = [];

    const result = await handleEpicCompletionAutoPr(
      { completedTicketId: "ticket-2" },
      {
        db,
        execFileNoThrow: async (command, args) => {
          calls.push({ command, args });
          if (command === "gh" && args[0] === "pr" && args[1] === "list") {
            return createExecResult({
              stdout: JSON.stringify([
                {
                  number: 66,
                  url: "https://github.com/org/repo/pull/66",
                  isDraft: false,
                  state: "OPEN",
                },
              ]),
            });
          }
          return createExecResult();
        },
      }
    );

    expect(result.branchResults[0]).toMatchObject({
      success: true,
      action: "updated",
      prNumber: 66,
    });
    expect(calls.some((call) => call.command === "git")).toBe(false);
    expect(calls.some((call) => call.args[0] === "pr" && call.args[1] === "create")).toBe(false);
  });

  it("respects the epic auto-PR setting", async () => {
    seedCompletedEpic();
    db.prepare("UPDATE settings SET epic_auto_pr = 0 WHERE id = 'default'").run();
    const calls: string[] = [];

    const result = await handleEpicCompletionAutoPr(
      { completedTicketId: "ticket-2" },
      {
        db,
        execFileNoThrow: async (command, args) => {
          calls.push([command, ...args].join(" "));
          return createExecResult();
        },
      }
    );

    expect(result).toMatchObject({ completed: true, skipped: true });
    expect(result.message).toContain("disabled");
    expect(calls).toEqual([]);
  });

  it("posts a visible comment when GitHub CLI operations fail", async () => {
    seedCompletedEpic();

    const result = await handleEpicCompletionAutoPr(
      { completedTicketId: "ticket-2" },
      {
        db,
        execFileNoThrow: async () =>
          createExecResult({ success: false, stderr: "gh auth required" }),
      }
    );

    expect(result.branchResults[0]).toMatchObject({ success: false, action: "failed" });
    const comment = db.prepare("SELECT content FROM ticket_comments").get() as { content: string };
    expect(comment.content).toContain("Epic Auto-PR Needs Attention");
    expect(comment.content).toContain("gh auth required");
  });
});

describe("replaceSentinelBlock", () => {
  it("replaces the sentinel block up to the next section header", () => {
    const body = [
      "# Title",
      "",
      DEMO_STEPS_SENTINEL,
      "1. Old step",
      "",
      "## Notes",
      "Keep this section",
    ].join("\n");

    const updated = replaceSentinelBlock(
      body,
      ["1. Open the modal", "2. Verify the PR updates"].join("\n")
    );

    expect(updated).toBe(
      [
        "# Title",
        "",
        DEMO_STEPS_SENTINEL,
        "1. Open the modal",
        "2. Verify the PR updates",
        "",
        "## Notes",
        "Keep this section",
      ].join("\n")
    );
  });

  it("is idempotent when called repeatedly with the same replacement", () => {
    const body = [DEMO_STEPS_SENTINEL, "1. Placeholder"].join("\n");
    const replacement = "1. Run review\n2. Ship changes";

    const once = replaceSentinelBlock(body, replacement);
    const twice = replaceSentinelBlock(once, replacement);

    expect(twice).toBe(once);
  });
});

describe("renderDemoStepsMarkdown", () => {
  it("renders sorted numbered steps with expected outcomes", () => {
    const markdown = renderDemoStepsMarkdown([
      {
        order: 2,
        description: "Verify the PR link appears",
        expectedOutcome: "The linked PR URL is visible.",
        type: "visual",
      },
      {
        order: 1,
        description: "Open the Ship Changes modal",
        expectedOutcome: "Preflight data loads immediately.",
        type: "manual",
      },
    ]);

    expect(markdown).toBe(
      [
        "1. Open the Ship Changes modal",
        "   Expected: Preflight data loads immediately.",
        "2. Verify the PR link appears",
        "   Expected: The linked PR URL is visible.",
      ].join("\n")
    );
  });
});

describe("syncPrVerificationChecklist", () => {
  it("returns early when the ticket has no linked PR", async () => {
    seedProject(db, { id: "proj-1", path: "/tmp/ship-project" });
    seedTicket(db, {
      id: "ticket-1",
      projectId: "proj-1",
      branchName: "feature/ticket-1-ship",
    });

    const calls: string[] = [];
    const result = await syncPrVerificationChecklist(
      { ticketId: "ticket-1" },
      {
        db,
        execFileNoThrow: async (command, args) => {
          calls.push([command, ...args].join(" "));
          return createExecResult();
        },
      }
    );

    expect(result).toEqual({
      success: true,
      updated: false,
      skipped: true,
      message: "No linked PR found for ticket ticket-1; skipped PR checklist sync.",
    });
    expect(calls).toEqual([]);
  });

  it("replaces the demo sentinel block and updates the PR body through gh", async () => {
    seedProject(db, { id: "proj-1", path: "/tmp/ship-project" });
    seedTicket(db, {
      id: "ticket-1",
      projectId: "proj-1",
      branchName: "feature/ticket-1-ship",
    });
    db.prepare("UPDATE tickets SET pr_number = ?, pr_url = ?, pr_status = ? WHERE id = ?").run(
      42,
      "https://github.com/openai/brain-dump/pull/42",
      "draft",
      "ticket-1"
    );
    db.prepare(
      `INSERT INTO demo_scripts (id, ticket_id, steps, generated_at)
       VALUES (?, ?, ?, ?)`
    ).run(
      "demo-1",
      "ticket-1",
      JSON.stringify([
        {
          order: 2,
          description: "Confirm the PR badge updates",
          expectedOutcome: "The PR badge shows the linked pull request.",
          type: "visual",
        },
        {
          order: 1,
          description: "Generate the demo script",
          expectedOutcome: "The ticket moves to AI verification.",
          type: "manual",
        },
      ]),
      "2026-03-08T02:00:00.000Z"
    );

    const calls: Array<{ command: string; args: string[]; cwd?: string }> = [];
    const result = await syncPrVerificationChecklist(
      { ticketId: "ticket-1" },
      {
        db,
        execFileNoThrow: async (command, args, options) => {
          const call: { command: string; args: string[]; cwd?: string } = { command, args };
          if (options?.cwd) {
            call.cwd = options.cwd;
          }
          calls.push(call);

          if (command === "gh" && args[0] === "pr" && args[1] === "view") {
            return createExecResult({
              stdout: ["# Demo PR", "", DEMO_STEPS_SENTINEL, "_Placeholder_", "", "## Notes"].join(
                "\n"
              ),
            });
          }

          return createExecResult();
        },
      }
    );

    expect(result).toEqual({
      success: true,
      updated: true,
      skipped: false,
      prUrl: "https://github.com/openai/brain-dump/pull/42",
      message: "Updated PR #42 with 2 demo steps.",
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({
      command: "gh",
      args: ["pr", "view", "42", "--json", "body", "--jq", ".body"],
      cwd: "/tmp/ship-project",
    });
    expect(calls[1]?.command).toBe("gh");
    expect(calls[1]?.args[0]).toBe("pr");
    expect(calls[1]?.args[1]).toBe("edit");
    expect(calls[1]?.args[2]).toBe("42");
    expect(calls[1]?.args[3]).toBe("--body");
    expect(calls[1]?.args[4]).toContain("1. Generate the demo script");
    expect(calls[1]?.args[4]).toContain("Expected: The ticket moves to AI verification.");
    expect(calls[1]?.args[4]).toContain("2. Confirm the PR badge updates");
    expect(calls[1]?.args[4]).toContain("## Notes");
  });

  it("is idempotent when the PR already contains the current demo steps", async () => {
    seedProject(db, { id: "proj-1", path: "/tmp/ship-project" });
    seedTicket(db, {
      id: "ticket-1",
      projectId: "proj-1",
      branchName: "feature/ticket-1-ship",
    });
    db.prepare("UPDATE tickets SET pr_number = ?, pr_url = ?, pr_status = ? WHERE id = ?").run(
      42,
      "https://github.com/openai/brain-dump/pull/42",
      "open",
      "ticket-1"
    );

    const steps = [
      {
        order: 1,
        description: "Generate the demo script",
        expectedOutcome: "The ticket moves to AI verification.",
        type: "manual" as const,
      },
    ];

    db.prepare(
      `INSERT INTO demo_scripts (id, ticket_id, steps, generated_at)
       VALUES (?, ?, ?, ?)`
    ).run("demo-1", "ticket-1", JSON.stringify(steps), "2026-03-08T02:00:00.000Z");

    const calls: Array<{ command: string; args: string[] }> = [];
    const currentBody = [DEMO_STEPS_SENTINEL, renderDemoStepsMarkdown(steps)].join("\n");
    const result = await syncPrVerificationChecklist(
      { ticketId: "ticket-1" },
      {
        db,
        execFileNoThrow: async (command, args) => {
          calls.push({ command, args });

          if (command === "gh" && args[0] === "pr" && args[1] === "view") {
            return createExecResult({ stdout: currentBody });
          }

          return createExecResult();
        },
      }
    );

    expect(result).toEqual({
      success: true,
      updated: false,
      skipped: false,
      prUrl: "https://github.com/openai/brain-dump/pull/42",
      message: "PR #42 already contains the latest demo steps.",
    });
    expect(calls).toHaveLength(1);
  });
});
