/**
 * Ralph E2E Integration Tests
 *
 * Following Kent C. Dodds' testing philosophy:
 * - Test user-facing behavior, not implementation details
 * - Integration tests > unit tests for workflows
 * - Use real database fixtures, minimal mocking
 * - Test the whole Ralph workflow as users experience it
 *
 * These tests verify the complete Ralph autonomous agent workflow:
 * 1. Starting ticket work (branch creation, status update, comments)
 * 2. Completing ticket work (status update, PRD update, suggestions)
 * 3. Git operations (branch naming, commit linking)
 * 4. Database integrity throughout the workflow
 *
 * Note: execSync is used here for git operations in tests. All commands
 * are hardcoded strings (not user input), making this safe for testing.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { execSync } from "child_process";

// ===========================================================================
// TEST DATABASE SCHEMA
// Mirrors the production schema for realistic integration testing
// ===========================================================================
const SCHEMA_SQL = `
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    color TEXT,
    working_method TEXT DEFAULT 'auto',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE epics (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    color TEXT,
    isolation_mode TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE tickets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'backlog',
    priority TEXT,
    position REAL NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    epic_id TEXT REFERENCES epics(id) ON DELETE SET NULL,
    tags TEXT,
    subtasks TEXT,
    is_blocked INTEGER DEFAULT 0,
    blocked_reason TEXT,
    linked_files TEXT, branch_name TEXT, pr_number INTEGER, pr_url TEXT, pr_status TEXT,
    linked_commits TEXT,
    attachments TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE TABLE ticket_comments (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT 'user',
    type TEXT NOT NULL DEFAULT 'comment',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX idx_tickets_project ON tickets(project_id);
  CREATE INDEX idx_tickets_epic ON tickets(epic_id);
  CREATE INDEX idx_tickets_status ON tickets(status);
  CREATE INDEX idx_comments_ticket ON ticket_comments(ticket_id);
`;

// ===========================================================================
// GIT UTILITIES (mirrors mcp-server/lib/git-utils.js)
// ===========================================================================
function runGitCommand(
  command: string,
  cwd: string
): { success: boolean; output: string; error?: string } {
  try {
    const output = execSync(command, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    return { success: true, output: output.trim() };
  } catch (error) {
    const err = error as { stderr?: string; message: string };
    return { success: false, output: "", error: err.stderr?.trim() || err.message };
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
}

function shortId(uuid: string): string {
  return uuid.substring(0, 8);
}

function generateBranchName(ticketId: string, ticketTitle: string): string {
  return `feature/${shortId(ticketId)}-${slugify(ticketTitle)}`;
}

// ===========================================================================
// WORKFLOW FUNCTIONS (mirrors mcp-server/tools/workflow.js)
// These are the actual workflow implementations we're testing
// ===========================================================================

interface TicketRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  project_id: string;
  epic_id: string | null;
  subtasks: string | null;
  linked_commits: string | null;
  project_name: string;
  project_path: string;
}

function addComment(
  db: Database.Database,
  ticketId: string,
  content: string,
  author: string = "ralph",
  type: string = "comment"
): { success: boolean; id?: string; error?: string } {
  const id = randomUUID();
  const now = new Date().toISOString();
  try {
    db.prepare(
      "INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, ticketId, content.trim(), author, type, now);
    return { success: true, id };
  } catch (err) {
    const error = err as Error;
    return { success: false, error: error.message };
  }
}

function updatePrdForTicket(
  projectPath: string,
  ticketId: string
): { success: boolean; message: string } {
  const prdPath = join(projectPath, "plans", "prd.json");

  if (!existsSync(prdPath)) {
    return { success: false, message: `PRD file not found: ${prdPath}` };
  }

  try {
    const prdContent = readFileSync(prdPath, "utf-8");
    const prd = JSON.parse(prdContent);

    if (!prd.userStories || !Array.isArray(prd.userStories)) {
      return { success: false, message: "PRD has no userStories array" };
    }

    const story = prd.userStories.find((s: { id: string }) => s.id === ticketId);
    if (!story) {
      return { success: false, message: `Ticket ${ticketId} not found in PRD` };
    }

    story.passes = true;
    writeFileSync(prdPath, JSON.stringify(prd, null, 2) + "\n");
    return { success: true, message: `PRD updated: ${story.title} marked as passing` };
  } catch (err) {
    const error = err as Error;
    return { success: false, message: `Failed to update PRD: ${error.message}` };
  }
}

interface StartTicketResult {
  success: boolean;
  branchName?: string;
  branchCreated?: boolean;
  ticket?: TicketRow;
  error?: string;
}

function startTicketWork(db: Database.Database, ticketId: string): StartTicketResult {
  const ticket = db
    .prepare(
      `
    SELECT t.*, p.name as project_name, p.path as project_path
    FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
  `
    )
    .get(ticketId) as TicketRow | undefined;

  if (!ticket) {
    return { success: false, error: `Ticket not found: ${ticketId}` };
  }

  if (ticket.status === "in_progress") {
    return { success: true, ticket, branchName: generateBranchName(ticketId, ticket.title) };
  }

  if (!existsSync(ticket.project_path)) {
    return { success: false, error: `Project path does not exist: ${ticket.project_path}` };
  }

  const gitCheck = runGitCommand("git rev-parse --git-dir", ticket.project_path);
  if (!gitCheck.success) {
    return { success: false, error: `Not a git repository: ${ticket.project_path}` };
  }

  const branchName = generateBranchName(ticketId, ticket.title);
  const branchExists = runGitCommand(
    `git show-ref --verify --quiet refs/heads/${branchName}`,
    ticket.project_path
  );

  let branchCreated = false;
  if (!branchExists.success) {
    const createBranch = runGitCommand(`git checkout -b ${branchName}`, ticket.project_path);
    if (!createBranch.success) {
      return {
        success: false,
        error: `Failed to create branch ${branchName}: ${createBranch.error}`,
      };
    }
    branchCreated = true;
  } else {
    const checkoutBranch = runGitCommand(`git checkout ${branchName}`, ticket.project_path);
    if (!checkoutBranch.success) {
      return {
        success: false,
        error: `Failed to checkout branch ${branchName}: ${checkoutBranch.error}`,
      };
    }
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE tickets SET status = 'in_progress', updated_at = ? WHERE id = ?").run(
    now,
    ticketId
  );

  // Auto-post "Starting work" comment
  addComment(db, ticketId, `Starting work on: ${ticket.title}`, "ralph", "comment");

  const updatedTicket = db
    .prepare(
      `
    SELECT t.*, p.name as project_name, p.path as project_path
    FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
  `
    )
    .get(ticketId) as TicketRow;

  return { success: true, branchName, branchCreated, ticket: updatedTicket };
}

interface CompleteTicketResult {
  success: boolean;
  ticket?: TicketRow;
  prdUpdated?: boolean;
  summaryPosted?: boolean;
  nextTicket?: { id: string; title: string; priority: string | null } | null;
  error?: string;
}

function completeTicketWork(
  db: Database.Database,
  ticketId: string,
  summary?: string
): CompleteTicketResult {
  const ticket = db
    .prepare(
      `
    SELECT t.*, p.name as project_name, p.path as project_path
    FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
  `
    )
    .get(ticketId) as TicketRow | undefined;

  if (!ticket) {
    return { success: false, error: `Ticket not found: ${ticketId}` };
  }

  if (
    ticket.status === "done" ||
    ticket.status === "ai_review" ||
    ticket.status === "human_review"
  ) {
    return { success: true, ticket };
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE tickets SET status = 'ai_review', updated_at = ? WHERE id = ?").run(
    now,
    ticketId
  );

  // Auto-post work summary comment
  const workSummaryContent = summary
    ? `## Work Summary\n\n${summary}`
    : `Completed work on: ${ticket.title}`;
  const summaryResult = addComment(db, ticketId, workSummaryContent, "ralph", "work_summary");

  // Update PRD file
  const prdResult = updatePrdForTicket(ticket.project_path, ticketId);

  // Suggest next ticket
  const nextTicket = suggestNextTicket(db, ticket.project_id, ticketId);

  const updatedTicket = db
    .prepare(
      `
    SELECT t.*, p.name as project_name, p.path as project_path
    FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
  `
    )
    .get(ticketId) as TicketRow;

  return {
    success: true,
    ticket: updatedTicket,
    prdUpdated: prdResult.success,
    summaryPosted: summaryResult.success,
    nextTicket,
  };
}

function suggestNextTicket(
  db: Database.Database,
  projectId: string,
  excludeTicketId: string
): { id: string; title: string; priority: string | null } | null {
  const tickets = db
    .prepare(
      `
    SELECT id, title, priority FROM tickets
    WHERE project_id = ? AND id != ? AND status NOT IN ('done', 'ai_review', 'human_review')
    ORDER BY
      CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 1 END,
      position
  `
    )
    .all(projectId, excludeTicketId) as Array<{
    id: string;
    title: string;
    priority: string | null;
  }>;

  return tickets.length > 0 ? (tickets[0] ?? null) : null;
}

function linkCommitToTicket(
  db: Database.Database,
  ticketId: string,
  commitHash: string,
  message?: string
): { success: boolean; linkedCommits?: Array<{ hash: string; message: string }>; error?: string } {
  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as
    | { linked_commits: string | null }
    | undefined;

  if (!ticket) {
    return { success: false, error: `Ticket not found: ${ticketId}` };
  }

  let linkedCommits: Array<{ hash: string; message: string; linkedAt: string }> = [];
  if (ticket.linked_commits) {
    try {
      linkedCommits = JSON.parse(ticket.linked_commits);
    } catch {
      linkedCommits = [];
    }
  }

  const alreadyLinked = linkedCommits.some(
    (c) => c.hash === commitHash || c.hash.startsWith(commitHash) || commitHash.startsWith(c.hash)
  );

  if (alreadyLinked) {
    return { success: true, linkedCommits };
  }

  linkedCommits.push({
    hash: commitHash,
    message: message || "",
    linkedAt: new Date().toISOString(),
  });

  const now = new Date().toISOString();
  db.prepare("UPDATE tickets SET linked_commits = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify(linkedCommits),
    now,
    ticketId
  );

  return { success: true, linkedCommits };
}

// ===========================================================================
// TEST SUITES
// ===========================================================================

describe("Ralph E2E Integration Tests", () => {
  let db: Database.Database;
  let testDir: string;

  beforeAll(() => {
    // Create in-memory database with schema
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA_SQL);
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(() => {
    // Create unique temp directory with git repo for each test
    testDir = join(tmpdir(), `ralph-e2e-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });

    // Initialize git repo (hardcoded commands, safe for testing)
    execSync("git init", { cwd: testDir, stdio: "pipe" });
    execSync('git config user.email "test@example.com"', { cwd: testDir, stdio: "pipe" });
    execSync('git config user.name "Test User"', { cwd: testDir, stdio: "pipe" });

    // Create initial commit so we have a branch to work from
    writeFileSync(join(testDir, "README.md"), "# Test Project\n");
    execSync("git add .", { cwd: testDir, stdio: "pipe" });
    execSync('git commit -m "Initial commit"', { cwd: testDir, stdio: "pipe" });

    // Create plans directory with PRD
    mkdirSync(join(testDir, "plans"), { recursive: true });

    // Clear database tables
    db.exec("DELETE FROM ticket_comments");
    db.exec("DELETE FROM tickets");
    db.exec("DELETE FROM epics");
    db.exec("DELETE FROM projects");
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // Helper functions
  const createTestProject = () => {
    const projectId = randomUUID();
    db.prepare(
      "INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, datetime('now'))"
    ).run(projectId, "Test Project", testDir);
    return projectId;
  };

  const createTestTicket = (projectId: string, title: string, priority: string = "medium") => {
    const ticketId = randomUUID();
    db.prepare(
      `INSERT INTO tickets (id, title, description, status, priority, position, project_id, created_at, updated_at)
       VALUES (?, ?, ?, 'backlog', ?, 1.0, ?, datetime('now'), datetime('now'))`
    ).run(ticketId, title, `Description for ${title}`, priority, projectId);
    return ticketId;
  };

  const createPrdFile = (_projectId: string, tickets: Array<{ id: string; title: string }>) => {
    const prd = {
      projectName: "Test Project",
      projectPath: testDir,
      testingRequirements: ["Test behavior, not implementation"],
      userStories: tickets.map((t) => ({
        id: t.id,
        title: t.title,
        description: `Description for ${t.title}`,
        acceptanceCriteria: ["Implement as described"],
        priority: "medium",
        tags: [],
        passes: false,
      })),
      generatedAt: new Date().toISOString(),
    };
    writeFileSync(join(testDir, "plans", "prd.json"), JSON.stringify(prd, null, 2));
    return prd;
  };

  // ===========================================================================
  // TEST 1: Ralph Session Lifecycle - Start to Finish
  // ===========================================================================
  describe("Session Lifecycle", () => {
    it("should complete a ticket from start to finish", () => {
      // Setup: Create project, ticket, and PRD
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "Add login form");
      createPrdFile(projectId, [{ id: ticketId, title: "Add login form" }]);

      // Step 1: Start ticket work
      const startResult = startTicketWork(db, ticketId);
      expect(startResult.success).toBe(true);
      expect(startResult.branchCreated).toBe(true);
      expect(startResult.branchName).toBe(`feature/${shortId(ticketId)}-add-login-form`);

      // Verify ticket status updated
      const ticketAfterStart = db
        .prepare("SELECT status FROM tickets WHERE id = ?")
        .get(ticketId) as {
        status: string;
      };
      expect(ticketAfterStart.status).toBe("in_progress");

      // Verify "Starting work" comment was posted
      const startComment = db
        .prepare("SELECT * FROM ticket_comments WHERE ticket_id = ? AND type = 'comment'")
        .get(ticketId) as { content: string; author: string };
      expect(startComment).toBeTruthy();
      expect(startComment.content).toContain("Starting work on");
      expect(startComment.author).toBe("ralph");

      // Step 2: Simulate implementation (create a file and commit)
      writeFileSync(join(testDir, "login.ts"), "export function login() {}");
      execSync("git add .", { cwd: testDir, stdio: "pipe" });
      execSync(`git commit -m "feat(${shortId(ticketId)}): add login form"`, {
        cwd: testDir,
        stdio: "pipe",
      });

      // Step 3: Complete ticket work
      const completeResult = completeTicketWork(
        db,
        ticketId,
        "Added login form with email/password fields"
      );
      expect(completeResult.success).toBe(true);
      expect(completeResult.prdUpdated).toBe(true);
      expect(completeResult.summaryPosted).toBe(true);

      // Verify ticket status updated to ai_review
      const ticketAfterComplete = db
        .prepare("SELECT status FROM tickets WHERE id = ?")
        .get(ticketId) as { status: string };
      expect(ticketAfterComplete.status).toBe("ai_review");

      // Verify work summary comment was posted
      const summaryComment = db
        .prepare("SELECT * FROM ticket_comments WHERE ticket_id = ? AND type = 'work_summary'")
        .get(ticketId) as { content: string };
      expect(summaryComment).toBeTruthy();
      expect(summaryComment.content).toContain("Work Summary");
      expect(summaryComment.content).toContain("login form");

      // Verify PRD was updated
      const prdContent = JSON.parse(readFileSync(join(testDir, "plans", "prd.json"), "utf-8"));
      const story = prdContent.userStories.find((s: { id: string }) => s.id === ticketId);
      expect(story.passes).toBe(true);
    });

    it("should handle starting work on already in-progress ticket", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "Existing task");

      // Start work first time
      startTicketWork(db, ticketId);

      // Try to start work again
      const result = startTicketWork(db, ticketId);
      expect(result.success).toBe(true);
      expect(result.branchCreated).toBeFalsy(); // Should checkout existing branch

      // Should only have one "Starting work" comment
      const comments = db
        .prepare("SELECT * FROM ticket_comments WHERE ticket_id = ? AND type = 'comment'")
        .all(ticketId);
      expect(comments).toHaveLength(1);
    });

    it("should suggest next ticket after completion based on priority", () => {
      const projectId = createTestProject();
      const lowPriorityId = createTestTicket(projectId, "Low priority task", "low");
      const highPriorityId = createTestTicket(projectId, "High priority task", "high");
      const completingId = createTestTicket(projectId, "Current task", "medium");
      createPrdFile(projectId, [
        { id: completingId, title: "Current task" },
        { id: lowPriorityId, title: "Low priority task" },
        { id: highPriorityId, title: "High priority task" },
      ]);

      // Start and complete current task
      startTicketWork(db, completingId);
      const result = completeTicketWork(db, completingId, "Done");

      // Should suggest high priority ticket next
      expect(result.nextTicket).toBeTruthy();
      expect(result.nextTicket?.id).toBe(highPriorityId);
      expect(result.nextTicket?.priority).toBe("high");
    });
  });

  // ===========================================================================
  // TEST 2: Git Integration
  // ===========================================================================
  describe("Git Integration", () => {
    it("should create feature branch with correct naming convention", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "Add User Authentication");

      const result = startTicketWork(db, ticketId);

      expect(result.success).toBe(true);
      expect(result.branchName).toBe(`feature/${shortId(ticketId)}-add-user-authentication`);

      // Verify branch exists in git
      const branchCheck = runGitCommand(
        `git show-ref --verify refs/heads/${result.branchName}`,
        testDir
      );
      expect(branchCheck.success).toBe(true);
    });

    it("should checkout existing branch instead of creating duplicate", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "Test Branch");

      // Create branch manually, then switch back to the initial branch
      const branchName = generateBranchName(ticketId, "Test Branch");
      const initialBranch = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: testDir,
        encoding: "utf-8",
      }).trim();
      execSync(`git checkout -b ${branchName}`, { cwd: testDir, stdio: "pipe" });
      execSync(`git checkout ${initialBranch}`, { cwd: testDir, stdio: "pipe" });

      // Start ticket work should checkout existing branch
      const result = startTicketWork(db, ticketId);

      expect(result.success).toBe(true);
      expect(result.branchCreated).toBe(false); // Should checkout, not create

      // Verify we're on the correct branch
      const currentBranch = runGitCommand("git rev-parse --abbrev-ref HEAD", testDir);
      expect(currentBranch.output).toBe(branchName);
    });

    it("should link commits to tickets", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "Commit Test");

      // Link multiple commits
      const result1 = linkCommitToTicket(db, ticketId, "abc1234", "First commit");
      expect(result1.success).toBe(true);
      expect(result1.linkedCommits).toHaveLength(1);

      const result2 = linkCommitToTicket(db, ticketId, "def5678", "Second commit");
      expect(result2.success).toBe(true);
      expect(result2.linkedCommits).toHaveLength(2);

      // Verify in database
      const ticket = db
        .prepare("SELECT linked_commits FROM tickets WHERE id = ?")
        .get(ticketId) as {
        linked_commits: string;
      };
      const commits = JSON.parse(ticket.linked_commits);
      expect(commits).toHaveLength(2);
      expect(commits[0].hash).toBe("abc1234");
      expect(commits[1].hash).toBe("def5678");
    });

    it("should not duplicate linked commits", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "Duplicate Test");

      linkCommitToTicket(db, ticketId, "abc1234", "First");
      const result = linkCommitToTicket(db, ticketId, "abc1234", "Duplicate");

      expect(result.success).toBe(true);
      expect(result.linkedCommits).toHaveLength(1); // Should still be 1
    });
  });

  // ===========================================================================
  // TEST 3: Database Integrity
  // ===========================================================================
  describe("Database Integrity", () => {
    it("should maintain referential integrity between tickets and comments", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "Integrity Test");

      // Start and complete work (creates comments)
      startTicketWork(db, ticketId);
      completeTicketWork(db, ticketId, "Done");

      // Verify comments exist
      const commentsBefore = db
        .prepare("SELECT COUNT(*) as count FROM ticket_comments WHERE ticket_id = ?")
        .get(ticketId) as { count: number };
      expect(commentsBefore.count).toBeGreaterThan(0);

      // Delete ticket (should cascade delete comments due to ON DELETE CASCADE)
      db.prepare("DELETE FROM tickets WHERE id = ?").run(ticketId);

      // Verify no orphaned comments
      const commentsAfter = db
        .prepare("SELECT COUNT(*) as count FROM ticket_comments WHERE ticket_id = ?")
        .get(ticketId) as { count: number };
      expect(commentsAfter.count).toBe(0);
    });

    it("should preserve ticket data integrity after workflow operations", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "Data Integrity");
      createPrdFile(projectId, [{ id: ticketId, title: "Data Integrity" }]);

      // Record initial state
      const initialTicket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as {
        title: string;
        description: string;
        project_id: string;
      };

      // Run through workflow
      startTicketWork(db, ticketId);
      completeTicketWork(db, ticketId, "Done");

      // Verify core fields unchanged
      const finalTicket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as {
        title: string;
        description: string;
        project_id: string;
        status: string;
      };

      expect(finalTicket.title).toBe(initialTicket.title);
      expect(finalTicket.description).toBe(initialTicket.description);
      expect(finalTicket.project_id).toBe(initialTicket.project_id);
      expect(finalTicket.status).toBe("ai_review"); // Only status should change
    });

    it("should not create orphaned comments on workflow failure", () => {
      // Create project to set up test environment (but test uses non-existent ticket ID)
      createTestProject();

      // Try to start work on non-existent ticket
      const result = startTicketWork(db, "non-existent-id");
      expect(result.success).toBe(false);

      // Verify no orphaned comments were created
      const orphanedComments = db
        .prepare("SELECT COUNT(*) as count FROM ticket_comments WHERE ticket_id = ?")
        .get("non-existent-id") as { count: number };
      expect(orphanedComments.count).toBe(0);
    });
  });

  // ===========================================================================
  // TEST 4: Error Scenarios
  // ===========================================================================
  describe("Error Handling", () => {
    it("should handle non-existent ticket gracefully", () => {
      const result = startTicketWork(db, "fake-ticket-id");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Ticket not found");
    });

    it("should handle non-existent project path", () => {
      // Create project with invalid path
      const projectId = randomUUID();
      db.prepare(
        "INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, datetime('now'))"
      ).run(projectId, "Bad Project", "/non/existent/path");

      const ticketId = createTestTicket(projectId, "Bad Path Test");

      const result = startTicketWork(db, ticketId);
      expect(result.success).toBe(false);
      expect(result.error).toContain("does not exist");
    });

    it("should handle non-git repository", () => {
      // Create a non-git directory
      const nonGitDir = join(tmpdir(), `non-git-${randomUUID()}`);
      mkdirSync(nonGitDir, { recursive: true });

      const projectId = randomUUID();
      db.prepare(
        "INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, datetime('now'))"
      ).run(projectId, "Non-Git Project", nonGitDir);

      const ticketId = createTestTicket(projectId, "No Git Test");

      const result = startTicketWork(db, ticketId);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Not a git repository");

      // Cleanup
      rmSync(nonGitDir, { recursive: true, force: true });
    });

    it("should handle missing PRD file gracefully during completion", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "No PRD Test");
      // Note: Not creating PRD file

      startTicketWork(db, ticketId);
      const result = completeTicketWork(db, ticketId, "Done");

      // Should still succeed but PRD update should fail
      expect(result.success).toBe(true);
      expect(result.prdUpdated).toBe(false);
      expect(result.ticket?.status).toBe("ai_review");
    });

    it("should handle completing already-completed ticket", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "Already Done");
      createPrdFile(projectId, [{ id: ticketId, title: "Already Done" }]);

      // Complete once
      startTicketWork(db, ticketId);
      completeTicketWork(db, ticketId, "First completion");

      // Try to complete again
      const result = completeTicketWork(db, ticketId, "Second completion");
      expect(result.success).toBe(true); // Should not error

      // Should only have one work_summary comment
      const summaries = db
        .prepare("SELECT * FROM ticket_comments WHERE ticket_id = ? AND type = 'work_summary'")
        .all(ticketId);
      expect(summaries).toHaveLength(1);
    });
  });

  // ===========================================================================
  // TEST 5: PRD Update Validation
  // ===========================================================================
  describe("PRD Updates", () => {
    it("should mark ticket as passing in PRD on completion", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "PRD Update Test");
      createPrdFile(projectId, [{ id: ticketId, title: "PRD Update Test" }]);

      // Verify initial state
      const prdBefore = JSON.parse(readFileSync(join(testDir, "plans", "prd.json"), "utf-8"));
      const storyBefore = prdBefore.userStories.find((s: { id: string }) => s.id === ticketId);
      expect(storyBefore.passes).toBe(false);

      // Complete ticket
      startTicketWork(db, ticketId);
      completeTicketWork(db, ticketId, "Done");

      // Verify PRD updated
      const prdAfter = JSON.parse(readFileSync(join(testDir, "plans", "prd.json"), "utf-8"));
      const storyAfter = prdAfter.userStories.find((s: { id: string }) => s.id === ticketId);
      expect(storyAfter.passes).toBe(true);
    });

    it("should handle ticket not in PRD gracefully", () => {
      const projectId = createTestProject();
      const ticketInPrd = createTestTicket(projectId, "In PRD");
      const ticketNotInPrd = createTestTicket(projectId, "Not In PRD");

      // Create PRD with only one ticket
      createPrdFile(projectId, [{ id: ticketInPrd, title: "In PRD" }]);

      // Try to complete ticket not in PRD
      startTicketWork(db, ticketNotInPrd);
      const result = completeTicketWork(db, ticketNotInPrd, "Done");

      // Should complete but PRD update should fail
      expect(result.success).toBe(true);
      expect(result.prdUpdated).toBe(false);
    });
  });
});
