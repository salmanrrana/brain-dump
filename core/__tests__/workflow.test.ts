import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import { startWork, completeWork, startEpicWork } from "../workflow.ts";
import { TicketNotFoundError, EpicNotFoundError, GitError, InvalidStateError } from "../errors.ts";
import type { GitOperations, GitCommandResult } from "../types.ts";

// ============================================
// Test helpers
// ============================================

let db: Database.Database;

function seedProject(id = "proj-1", path = "/tmp/test-project") {
  db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    "Test Project",
    path,
    new Date().toISOString()
  );
  return id;
}

function seedTicket(
  id = "ticket-1",
  projectId = "proj-1",
  options: { status?: string; epicId?: string; branchName?: string } = {}
) {
  const now = new Date().toISOString();
  const { status = "backlog", epicId = null, branchName = null } = options;
  db.prepare(
    `INSERT INTO tickets (id, title, status, priority, position, project_id, epic_id, branch_name, created_at, updated_at)
     VALUES (?, ?, ?, 'medium', 1, ?, ?, ?, ?, ?)`
  ).run(id, `Ticket ${id}`, status, projectId, epicId, branchName, now, now);
  return id;
}

function seedEpic(id = "epic-1", projectId = "proj-1") {
  db.prepare("INSERT INTO epics (id, title, project_id, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    `Epic ${id}`,
    projectId,
    new Date().toISOString()
  );
  return id;
}

/**
 * Mock GitOperations for testing. Tracks branches that exist.
 */
function createMockGit(
  existingBranches: string[] = ["main"]
): GitOperations & { createdBranches: string[]; checkedOut: string[] } {
  const branches = new Set(existingBranches);
  const createdBranches: string[] = [];
  const checkedOut: string[] = [];

  return {
    createdBranches,
    checkedOut,
    run(command: string, _cwd: string): GitCommandResult {
      // Simulate git rev-parse --git-dir (always success for tests)
      if (command.includes("rev-parse --git-dir")) {
        return { success: true, output: ".git" };
      }
      // Simulate git log
      if (command.includes("git log")) {
        return { success: true, output: "abc1234 Initial commit" };
      }
      // Simulate git diff --name-only
      if (command.includes("--name-only")) {
        return { success: true, output: "src/file.ts" };
      }
      return { success: true, output: "" };
    },
    branchExists(branch: string, _cwd: string): boolean {
      return branches.has(branch);
    },
    checkout(branch: string, _cwd: string): GitCommandResult {
      checkedOut.push(branch);
      return { success: true, output: "" };
    },
    createBranch(branch: string, _cwd: string): GitCommandResult {
      branches.add(branch);
      createdBranches.push(branch);
      return { success: true, output: "" };
    },
  };
}

beforeEach(() => {
  const result = createTestDatabase();
  db = result.db;
});

// ============================================
// startWork
// ============================================

describe("startWork", () => {
  it("creates a ticket-specific branch and moves ticket to in_progress", () => {
    seedProject();
    seedTicket();
    const git = createMockGit();

    const result = startWork(db, "ticket-1", git);

    expect(result.branch).toMatch(/^feature\/ticket-1/);
    expect(result.branchCreated).toBe(true);
    expect(result.usingEpicBranch).toBe(false);
    expect(result.ticket.status).toBe("in_progress");

    // Verify DB was updated
    const row = db
      .prepare("SELECT status, branch_name FROM tickets WHERE id = ?")
      .get("ticket-1") as {
      status: string;
      branch_name: string;
    };
    expect(row.status).toBe("in_progress");
    expect(row.branch_name).toMatch(/^feature\/ticket-1/);
  });

  it("posts an audit comment", () => {
    seedProject();
    seedTicket();
    const git = createMockGit();

    startWork(db, "ticket-1", git);

    const comments = db
      .prepare("SELECT * FROM ticket_comments WHERE ticket_id = ?")
      .all("ticket-1") as {
      content: string;
      type: string;
    }[];
    expect(comments).toHaveLength(1);
    expect(comments[0]!.content).toContain("Started work on ticket");
    expect(comments[0]!.type).toBe("progress");
  });

  it("initializes ticket_workflow_state", () => {
    seedProject();
    seedTicket();
    const git = createMockGit();

    startWork(db, "ticket-1", git);

    const state = db
      .prepare("SELECT * FROM ticket_workflow_state WHERE ticket_id = ?")
      .get("ticket-1") as {
      current_phase: string;
      review_iteration: number;
    };
    expect(state.current_phase).toBe("implementation");
    expect(state.review_iteration).toBe(0);
  });

  it("returns early when ticket is already in_progress with a branch", () => {
    seedProject();
    seedTicket("ticket-1", "proj-1", { status: "in_progress", branchName: "feature/existing" });
    const git = createMockGit();

    const result = startWork(db, "ticket-1", git);

    expect(result.branch).toBe("feature/existing");
    expect(result.branchCreated).toBe(false);
    expect(result.warnings).toContain("Ticket is already in progress.");
    expect(git.createdBranches).toHaveLength(0);
  });

  it("uses epic branch when ticket belongs to an epic with a branch", () => {
    seedProject();
    seedEpic();
    seedTicket("ticket-1", "proj-1", { epicId: "epic-1" });
    const git = createMockGit(["main"]);

    const result = startWork(db, "ticket-1", git);

    // Since no epic workflow state exists yet, it auto-creates an epic branch
    expect(result.usingEpicBranch).toBe(true);
    expect(result.branch).toMatch(/^feature\/epic-epic-1/);
    expect(result.branchCreated).toBe(true);

    // Verify epic workflow state was created
    const epicState = db
      .prepare("SELECT * FROM epic_workflow_state WHERE epic_id = ?")
      .get("epic-1") as {
      epic_branch_name: string;
      current_ticket_id: string;
    };
    expect(epicState.epic_branch_name).toMatch(/^feature\/epic-epic-1/);
    expect(epicState.current_ticket_id).toBe("ticket-1");
  });

  it("reuses existing epic branch from workflow state", () => {
    seedProject();
    seedEpic();
    seedTicket("ticket-1", "proj-1", { epicId: "epic-1" });

    // Pre-create epic workflow state
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO epic_workflow_state (id, epic_id, epic_branch_name, epic_branch_created_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("ews-1", "epic-1", "feature/epic-existing", now, now, now);

    const git = createMockGit(["main", "feature/epic-existing"]);

    const result = startWork(db, "ticket-1", git);

    expect(result.usingEpicBranch).toBe(true);
    expect(result.branch).toBe("feature/epic-existing");
    expect(result.branchCreated).toBe(false);
    expect(git.checkedOut).toContain("feature/epic-existing");
  });

  it("throws TicketNotFoundError for nonexistent ticket", () => {
    expect(() => startWork(db, "nonexistent", createMockGit())).toThrow(TicketNotFoundError);
  });

  it("throws GitError when not a git repository", () => {
    seedProject();
    seedTicket();
    const git = createMockGit();
    git.run = (_cmd: string, _cwd: string) => ({
      success: false,
      output: "",
      error: "not a git repo",
    });

    expect(() => startWork(db, "ticket-1", git)).toThrow(GitError);
  });
});

// ============================================
// completeWork
// ============================================

describe("completeWork", () => {
  it("moves ticket to ai_review and returns work summary", () => {
    seedProject();
    seedTicket("ticket-1", "proj-1", { status: "in_progress" });
    const git = createMockGit();

    const result = completeWork(db, "ticket-1", git, "Implemented the feature");

    expect(result.status).toBe("ai_review");
    expect(result.workSummary).toContain("Implemented the feature");
    expect(result.nextSteps.length).toBeGreaterThan(0);

    // Verify DB was updated
    const row = db.prepare("SELECT status FROM tickets WHERE id = ?").get("ticket-1") as {
      status: string;
    };
    expect(row.status).toBe("ai_review");
  });

  it("increments review_iteration on workflow state", () => {
    seedProject();
    seedTicket("ticket-1", "proj-1", { status: "in_progress" });
    const git = createMockGit();

    // Pre-create workflow state (as if startWork was called)
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO ticket_workflow_state (id, ticket_id, current_phase, review_iteration, findings_count, findings_fixed, demo_generated, created_at, updated_at)
       VALUES (?, ?, 'implementation', 0, 0, 0, 0, ?, ?)`
    ).run("ws-1", "ticket-1", now, now);

    completeWork(db, "ticket-1", git);

    const state = db
      .prepare(
        "SELECT review_iteration, current_phase FROM ticket_workflow_state WHERE ticket_id = ?"
      )
      .get("ticket-1") as { review_iteration: number; current_phase: string };
    expect(state.review_iteration).toBe(1);
    expect(state.current_phase).toBe("ai_review");
  });

  it("posts a work summary comment", () => {
    seedProject();
    seedTicket("ticket-1", "proj-1", { status: "in_progress" });
    const git = createMockGit();

    completeWork(db, "ticket-1", git, "Did the work");

    const comments = db
      .prepare("SELECT * FROM ticket_comments WHERE ticket_id = ?")
      .all("ticket-1") as {
      content: string;
      type: string;
    }[];
    const summaryComment = comments.find((c) => c.type === "work_summary");
    expect(summaryComment).toBeDefined();
    expect(summaryComment!.content).toContain("Did the work");
  });

  it("suggests next ticket from same project", () => {
    seedProject();
    seedTicket("ticket-1", "proj-1", { status: "in_progress" });
    seedTicket("ticket-2", "proj-1", { status: "ready" });
    const git = createMockGit();

    const result = completeWork(db, "ticket-1", git);

    expect(result.suggestedNextTicket).toBeDefined();
    expect(result.suggestedNextTicket!.id).toBe("ticket-2");
  });

  it("throws TicketNotFoundError for nonexistent ticket", () => {
    expect(() => completeWork(db, "nonexistent", createMockGit())).toThrow(TicketNotFoundError);
  });

  it("throws InvalidStateError when ticket is already done", () => {
    seedProject();
    seedTicket("ticket-1", "proj-1", { status: "done" });

    expect(() => completeWork(db, "ticket-1", createMockGit())).toThrow(InvalidStateError);
  });

  it("throws InvalidStateError when ticket is in ai_review", () => {
    seedProject();
    seedTicket("ticket-1", "proj-1", { status: "ai_review" });

    expect(() => completeWork(db, "ticket-1", createMockGit())).toThrow(InvalidStateError);
  });
});

// ============================================
// startEpicWork
// ============================================

describe("startEpicWork", () => {
  it("creates an epic branch and initializes workflow state", () => {
    seedProject();
    seedEpic();
    seedTicket("ticket-1", "proj-1", { epicId: "epic-1" });
    const git = createMockGit();

    const result = startEpicWork(db, "epic-1", git);

    expect(result.branch).toMatch(/^feature\/epic-epic-1/);
    expect(result.branchCreated).toBe(true);
    expect(result.epic.title).toBe("Epic epic-1");
    expect(result.tickets).toHaveLength(1);

    // Verify epic workflow state
    const state = db
      .prepare("SELECT * FROM epic_workflow_state WHERE epic_id = ?")
      .get("epic-1") as {
      epic_branch_name: string;
      total_tickets: number;
    };
    expect(state.epic_branch_name).toMatch(/^feature\/epic-epic-1/);
    expect(state.total_tickets).toBe(1);
  });

  it("returns existing branch when epic work already started", () => {
    seedProject();
    seedEpic();
    seedTicket("ticket-1", "proj-1", { epicId: "epic-1" });

    // Pre-create epic workflow state with branch
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO epic_workflow_state (id, epic_id, epic_branch_name, epic_branch_created_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("ews-1", "epic-1", "feature/epic-existing", now, now, now);

    const git = createMockGit(["main", "feature/epic-existing"]);

    const result = startEpicWork(db, "epic-1", git);

    expect(result.branch).toBe("feature/epic-existing");
    expect(result.branchCreated).toBe(false);
  });

  it("throws EpicNotFoundError for nonexistent epic", () => {
    expect(() => startEpicWork(db, "nonexistent", createMockGit())).toThrow(EpicNotFoundError);
  });

  it("throws GitError when not a git repository", () => {
    seedProject();
    seedEpic();
    const git = createMockGit();
    git.run = (_cmd: string, _cwd: string) => ({
      success: false,
      output: "",
      error: "not a git repo",
    });

    expect(() => startEpicWork(db, "epic-1", git)).toThrow(GitError);
  });
});
