import { randomUUID } from "crypto";
import { mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import { getCodeChangePatch, getCodeChangeSummary } from "../code-changes.ts";
import type { ExecFileNoThrowResult } from "../types.ts";
import { seedEpic, seedProject, seedTicket } from "./test-helpers.ts";

interface RecordedCall {
  command: string;
  args: string[];
  cwd?: string;
  timeoutMs?: number;
  maxBuffer?: number;
}

let db: Database.Database;
let tempDirs: string[] = [];

beforeEach(() => {
  const result = createTestDatabase();
  db = result.db;
  tempDirs = [];
});

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createRepoDir(): string {
  const dir = mkdtemp();
  mkdirSync(join(dir, ".git"));
  return dir;
}

function mkdtemp(): string {
  const dir = join(tmpdir(), `brain-dump-code-changes-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

function createExecResult(overrides: Partial<ExecFileNoThrowResult> = {}): ExecFileNoThrowResult {
  return {
    success: true,
    stdout: "",
    stderr: "",
    exitCode: 0,
    ...overrides,
  };
}

function createCommandKey(args: string[], cwd: string): string {
  return JSON.stringify(["git", args, cwd]);
}

function createRecordingExec(results: Record<string, ExecFileNoThrowResult>) {
  const calls: RecordedCall[] = [];

  return {
    calls,
    execFileNoThrow: async (
      command: string,
      args: string[],
      options?: { cwd?: string; timeoutMs?: number; maxBuffer?: number }
    ) => {
      calls.push({
        command,
        args,
        ...(options?.cwd ? { cwd: options.cwd } : {}),
        ...(options?.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
        ...(options?.maxBuffer ? { maxBuffer: options.maxBuffer } : {}),
      });

      const key = createCommandKey(args, options?.cwd ?? "");
      return results[key] ?? createExecResult();
    },
  };
}

function linkCommits(ticketId: string, hashes: string[]): void {
  db.prepare("UPDATE tickets SET linked_commits = ? WHERE id = ?").run(
    JSON.stringify(
      hashes.map((hash) => ({
        hash,
        message: `Commit ${hash}`,
        linkedAt: "2026-03-08T01:00:00.000Z",
      }))
    ),
    ticketId
  );
}

describe("getCodeChangeSummary", () => {
  it("returns ticket grouped sources and file summaries from linked commits, branch, and PR metadata", async () => {
    const repoPath = createRepoDir();
    seedProject(db, { id: "proj-1", path: repoPath });
    seedTicket(db, {
      id: "ticket-1",
      projectId: "proj-1",
      branchName: "feature/ticket-1",
    });
    linkCommits("ticket-1", ["abcdef1234567890"]);
    db.prepare("UPDATE tickets SET pr_number = ?, pr_url = ?, pr_status = ? WHERE id = ?").run(
      42,
      "https://github.com/example/repo/pull/42",
      "open",
      "ticket-1"
    );

    const { execFileNoThrow, calls } = createRecordingExec({
      [createCommandKey(
        ["cat-file", "-e", "--end-of-options", "abcdef1234567890^{commit}"],
        repoPath
      )]: createExecResult(),
      [createCommandKey(
        [
          "show",
          "--numstat",
          "--format=",
          "--find-renames",
          "--end-of-options",
          "abcdef1234567890",
        ],
        repoPath
      )]: createExecResult({ stdout: "10\t2\tsrc/commit.ts\n" }),
      [createCommandKey(
        [
          "show",
          "--name-status",
          "--format=",
          "--find-renames",
          "--end-of-options",
          "abcdef1234567890",
        ],
        repoPath
      )]: createExecResult({ stdout: "M\tsrc/commit.ts\n" }),
      [createCommandKey(
        ["rev-parse", "--verify", "--end-of-options", "feature/ticket-1"],
        repoPath
      )]: createExecResult(),
      [createCommandKey(["rev-parse", "--verify", "main"], repoPath)]: createExecResult(),
      [createCommandKey(
        ["diff", "--numstat", "--find-renames", "--end-of-options", "main...feature/ticket-1"],
        repoPath
      )]: createExecResult({ stdout: "3\t1\tsrc/branch.ts\n" }),
      [createCommandKey(
        ["diff", "--name-status", "--find-renames", "--end-of-options", "main...feature/ticket-1"],
        repoPath
      )]: createExecResult({ stdout: "A\tsrc/branch.ts\n" }),
    });

    const summary = await getCodeChangeSummary(
      { type: "ticket", id: "ticket-1" },
      { db, execFileNoThrow }
    );

    expect(summary.state.kind).toBe("available");
    expect(summary.groups).toHaveLength(1);
    expect(summary.groups[0]).toMatchObject({
      ticketId: "ticket-1",
      title: "Ticket ticket-1",
      totals: { files: 2, additions: 13, deletions: 3 },
    });
    expect(summary.groups[0]?.sources.map((source) => source.kind)).toEqual([
      "linked_commit",
      "ticket_branch",
      "ticket_pr",
    ]);
    expect(summary.groups[0]?.sources.at(-1)).toMatchObject({
      kind: "ticket_pr",
      prNumber: 42,
      state: { kind: "metadata_only" },
    });
    expect(summary.groups[0]?.files).toEqual([
      {
        path: "src/branch.ts",
        additions: 3,
        deletions: 1,
        binary: false,
        status: "A",
        sourceIds: ["ticket:ticket-1:branch:feature/ticket-1"],
      },
      {
        path: "src/commit.ts",
        additions: 10,
        deletions: 2,
        binary: false,
        status: "M",
        sourceIds: ["ticket:ticket-1:commit:abcdef1234567890"],
      },
    ]);
    expect(calls.every((call) => call.command === "git" && call.timeoutMs === 10_000)).toBe(true);
    expect(calls.some((call) => call.args.includes("main...feature/ticket-1"))).toBe(true);
  });

  it("aggregates epic ticket groups in ticket order and preserves duplicate commit boundaries", async () => {
    const repoPath = createRepoDir();
    seedProject(db, { id: "proj-1", path: repoPath });
    seedEpic(db, { id: "epic-1", projectId: "proj-1", title: "Code Review Epic" });
    seedTicket(db, { id: "ticket-1", projectId: "proj-1", epicId: "epic-1" });
    seedTicket(db, { id: "ticket-2", projectId: "proj-1", epicId: "epic-1" });
    linkCommits("ticket-1", ["1111111111111111"]);
    linkCommits("ticket-2", ["1111111111111111"]);

    const results = {
      [createCommandKey(
        ["cat-file", "-e", "--end-of-options", "1111111111111111^{commit}"],
        repoPath
      )]: createExecResult(),
      [createCommandKey(
        [
          "show",
          "--numstat",
          "--format=",
          "--find-renames",
          "--end-of-options",
          "1111111111111111",
        ],
        repoPath
      )]: createExecResult({ stdout: "5\t1\tsrc/shared.ts\n" }),
      [createCommandKey(
        [
          "show",
          "--name-status",
          "--format=",
          "--find-renames",
          "--end-of-options",
          "1111111111111111",
        ],
        repoPath
      )]: createExecResult({ stdout: "M\tsrc/shared.ts\n" }),
    };
    const { execFileNoThrow } = createRecordingExec(results);

    const summary = await getCodeChangeSummary(
      { type: "epic", id: "epic-1" },
      { db, execFileNoThrow }
    );

    expect(summary.groups.map((group) => group.ticketId)).toEqual(["ticket-1", "ticket-2"]);
    expect(summary.groups[0]?.files[0]).toMatchObject({
      path: "src/shared.ts",
      sourceIds: ["ticket:ticket-1:commit:1111111111111111"],
    });
    expect(summary.groups[1]?.files[0]).toMatchObject({
      path: "src/shared.ts",
      sourceIds: ["ticket:ticket-2:commit:1111111111111111"],
    });
    expect(summary.totals).toEqual({ files: 1, additions: 10, deletions: 2 });
  });

  it("returns an explicit missing git repo state without running git", async () => {
    const projectPath = mkdtemp();
    seedProject(db, { id: "proj-1", path: projectPath });
    seedTicket(db, { id: "ticket-1", projectId: "proj-1" });
    const { execFileNoThrow, calls } = createRecordingExec({});

    const summary = await getCodeChangeSummary(
      { type: "ticket", id: "ticket-1" },
      { db, execFileNoThrow }
    );

    expect(summary.state.kind).toBe("missing_git_repo");
    expect(summary.groups[0]?.sources[0]).toMatchObject({
      kind: "unavailable",
      state: { kind: "missing_git_repo" },
    });
    expect(calls).toEqual([]);
  });

  it("returns a missing commit state instead of crashing on stale linked commits", async () => {
    const repoPath = createRepoDir();
    seedProject(db, { id: "proj-1", path: repoPath });
    seedTicket(db, { id: "ticket-1", projectId: "proj-1" });
    linkCommits("ticket-1", ["deadbeefdeadbeef"]);
    const { execFileNoThrow } = createRecordingExec({
      [createCommandKey(
        ["cat-file", "-e", "--end-of-options", "deadbeefdeadbeef^{commit}"],
        repoPath
      )]: createExecResult({ success: false, exitCode: 128, stderr: "fatal: Not a valid object" }),
    });

    const summary = await getCodeChangeSummary(
      { type: "ticket", id: "ticket-1" },
      { db, execFileNoThrow }
    );

    expect(summary.groups[0]?.state.kind).toBe("missing_commit");
    expect(summary.groups[0]?.files).toEqual([]);
    expect(summary.groups[0]?.sources[0]).toMatchObject({
      kind: "linked_commit",
      state: { kind: "missing_commit" },
    });
  });

  it("handles binary and large file numstat output", async () => {
    const repoPath = createRepoDir();
    seedProject(db, { id: "proj-1", path: repoPath });
    seedTicket(db, { id: "ticket-1", projectId: "proj-1" });
    linkCommits("ticket-1", ["abcdef1234567890"]);
    const { execFileNoThrow } = createRecordingExec({
      [createCommandKey(
        ["cat-file", "-e", "--end-of-options", "abcdef1234567890^{commit}"],
        repoPath
      )]: createExecResult(),
      [createCommandKey(
        [
          "show",
          "--numstat",
          "--format=",
          "--find-renames",
          "--end-of-options",
          "abcdef1234567890",
        ],
        repoPath
      )]: createExecResult({ stdout: "-\t-\tassets/logo.png\n100000\t4\tsrc/large.ts\n" }),
      [createCommandKey(
        [
          "show",
          "--name-status",
          "--format=",
          "--find-renames",
          "--end-of-options",
          "abcdef1234567890",
        ],
        repoPath
      )]: createExecResult({ stdout: "A\tassets/logo.png\nM\tsrc/large.ts\n" }),
    });

    const summary = await getCodeChangeSummary(
      { type: "ticket", id: "ticket-1" },
      { db, execFileNoThrow }
    );

    expect(summary.groups[0]?.files).toEqual([
      {
        path: "assets/logo.png",
        additions: 0,
        deletions: 0,
        binary: true,
        status: "A",
        sourceIds: ["ticket:ticket-1:commit:abcdef1234567890"],
      },
      {
        path: "src/large.ts",
        additions: 100000,
        deletions: 4,
        binary: false,
        status: "M",
        sourceIds: ["ticket:ticket-1:commit:abcdef1234567890"],
      },
    ]);
    expect(summary.groups[0]?.totals).toEqual({ files: 2, additions: 100000, deletions: 4 });
  });

  it("returns explicit no linked changes state for tickets without commits, branch, or PR metadata", async () => {
    const repoPath = createRepoDir();
    seedProject(db, { id: "proj-1", path: repoPath });
    seedTicket(db, { id: "ticket-1", projectId: "proj-1" });
    const { execFileNoThrow } = createRecordingExec({});

    const summary = await getCodeChangeSummary(
      { type: "ticket", id: "ticket-1" },
      { db, execFileNoThrow }
    );

    expect(summary.state.kind).toBe("no_linked_changes");
    expect(summary.groups[0]?.sources).toEqual([]);
  });
});

describe("getCodeChangePatch", () => {
  it("lazily fetches a unified diff for a selected source and file", async () => {
    const repoPath = createRepoDir();
    seedProject(db, { id: "proj-1", path: repoPath });
    seedTicket(db, { id: "ticket-1", projectId: "proj-1" });
    linkCommits("ticket-1", ["abcdef1234567890"]);
    const { execFileNoThrow, calls } = createRecordingExec({
      [createCommandKey(
        ["cat-file", "-e", "--end-of-options", "abcdef1234567890^{commit}"],
        repoPath
      )]: createExecResult(),
      [createCommandKey(
        [
          "show",
          "--numstat",
          "--format=",
          "--find-renames",
          "--end-of-options",
          "abcdef1234567890",
        ],
        repoPath
      )]: createExecResult({ stdout: "10\t2\tsrc/commit.ts\n" }),
      [createCommandKey(
        [
          "show",
          "--name-status",
          "--format=",
          "--find-renames",
          "--end-of-options",
          "abcdef1234567890",
        ],
        repoPath
      )]: createExecResult({ stdout: "M\tsrc/commit.ts\n" }),
      [createCommandKey(
        [
          "show",
          "--format=",
          "--find-renames",
          "--end-of-options",
          "abcdef1234567890",
          "--",
          "src/commit.ts",
        ],
        repoPath
      )]: createExecResult({ stdout: "diff --git a/src/commit.ts b/src/commit.ts\n+changed" }),
    });

    const patch = await getCodeChangePatch(
      {
        scope: { type: "ticket", id: "ticket-1" },
        sourceId: "ticket:ticket-1:commit:abcdef1234567890",
        filePath: "src/commit.ts",
      },
      { db, execFileNoThrow }
    );

    expect(patch).toMatchObject({
      state: { kind: "available" },
      patches: [
        {
          sourceId: "ticket:ticket-1:commit:abcdef1234567890",
          patch: "diff --git a/src/commit.ts b/src/commit.ts\n+changed",
        },
      ],
    });
    expect(calls.at(-1)).toMatchObject({
      command: "git",
      args: [
        "show",
        "--format=",
        "--find-renames",
        "--end-of-options",
        "abcdef1234567890",
        "--",
        "src/commit.ts",
      ],
      maxBuffer: 16 * 1024 * 1024,
    });
  });

  it("passes --ignore-all-space to git when ignoreWhitespace is requested", async () => {
    const repoPath = createRepoDir();
    seedProject(db, { id: "proj-1", path: repoPath });
    seedTicket(db, { id: "ticket-1", projectId: "proj-1" });
    linkCommits("ticket-1", ["abcdef1234567890"]);
    const { execFileNoThrow, calls } = createRecordingExec({
      [createCommandKey(
        ["cat-file", "-e", "--end-of-options", "abcdef1234567890^{commit}"],
        repoPath
      )]: createExecResult(),
      [createCommandKey(
        [
          "show",
          "--numstat",
          "--format=",
          "--find-renames",
          "--end-of-options",
          "abcdef1234567890",
        ],
        repoPath
      )]: createExecResult({ stdout: "10\t2\tsrc/commit.ts\n" }),
      [createCommandKey(
        [
          "show",
          "--name-status",
          "--format=",
          "--find-renames",
          "--end-of-options",
          "abcdef1234567890",
        ],
        repoPath
      )]: createExecResult({ stdout: "M\tsrc/commit.ts\n" }),
      [createCommandKey(
        [
          "show",
          "--format=",
          "--find-renames",
          "--ignore-all-space",
          "--end-of-options",
          "abcdef1234567890",
          "--",
          "src/commit.ts",
        ],
        repoPath
      )]: createExecResult({ stdout: "diff --git a/src/commit.ts b/src/commit.ts\n+changed" }),
    });

    const patch = await getCodeChangePatch(
      {
        scope: { type: "ticket", id: "ticket-1" },
        sourceId: "ticket:ticket-1:commit:abcdef1234567890",
        filePath: "src/commit.ts",
        ignoreWhitespace: true,
      },
      { db, execFileNoThrow }
    );

    expect(patch.state.kind).toBe("available");
    expect(calls.at(-1)?.args).toEqual([
      "show",
      "--format=",
      "--find-renames",
      "--ignore-all-space",
      "--end-of-options",
      "abcdef1234567890",
      "--",
      "src/commit.ts",
    ]);
  });

  it("guards the branch diff path with --end-of-options and honors ignoreWhitespace", async () => {
    const repoPath = createRepoDir();
    seedProject(db, { id: "proj-1", path: repoPath });
    seedTicket(db, { id: "ticket-1", projectId: "proj-1", branchName: "feature/ticket-1" });
    const { execFileNoThrow, calls } = createRecordingExec({
      [createCommandKey(
        ["rev-parse", "--verify", "--end-of-options", "feature/ticket-1"],
        repoPath
      )]: createExecResult(),
      [createCommandKey(["rev-parse", "--verify", "main"], repoPath)]: createExecResult(),
      [createCommandKey(
        ["diff", "--numstat", "--find-renames", "--end-of-options", "main...feature/ticket-1"],
        repoPath
      )]: createExecResult({ stdout: "3\t1\tsrc/branch.ts\n" }),
      [createCommandKey(
        ["diff", "--name-status", "--find-renames", "--end-of-options", "main...feature/ticket-1"],
        repoPath
      )]: createExecResult({ stdout: "A\tsrc/branch.ts\n" }),
      [createCommandKey(
        [
          "diff",
          "--find-renames",
          "--ignore-all-space",
          "--end-of-options",
          "main...feature/ticket-1",
          "--",
          "src/branch.ts",
        ],
        repoPath
      )]: createExecResult({ stdout: "diff --git a/src/branch.ts b/src/branch.ts\n+changed" }),
    });

    const patch = await getCodeChangePatch(
      {
        scope: { type: "ticket", id: "ticket-1" },
        sourceId: "ticket:ticket-1:branch:feature/ticket-1",
        filePath: "src/branch.ts",
        ignoreWhitespace: true,
      },
      { db, execFileNoThrow }
    );

    expect(patch.state.kind).toBe("available");
    expect(calls.at(-1)?.args).toEqual([
      "diff",
      "--find-renames",
      "--ignore-all-space",
      "--end-of-options",
      "main...feature/ticket-1",
      "--",
      "src/branch.ts",
    ]);
  });
});
