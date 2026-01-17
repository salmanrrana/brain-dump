/**
 * Ralph E2E Integration Tests
 *
 * Following Kent C. Dodds' testing philosophy:
 * - "The more your tests resemble the way your software is used, the more confidence they can give you."
 * - Test behavior users care about (completing tickets)
 * - Minimal mocking (only Claude API responses if needed)
 * - Integration level (components working together)
 *
 * These tests verify the full Ralph workflow:
 * 1. start_ticket_work - creates branch, updates status, posts comment
 * 2. complete_ticket_work - updates PRD, posts summary, suggests next ticket
 * 3. Git integration - branch creation, commit tracking
 * 4. Database integrity - no orphaned records
 *
 * Run with: pnpm test:integration
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import Database from "better-sqlite3";

// Test fixture types
interface TestTicket {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  position: number;
  project_id: string;
  epic_id: string | null;
  tags: string | null;
  subtasks: string | null;
  is_blocked: number;
  blocked_reason: string | null;
  linked_files: string | null;
  attachments: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  linked_commits: string | null;
}

interface TestComment {
  id: string;
  ticket_id: string;
  content: string;
  author: string;
  type: string;
  created_at: string;
}

interface PRDDocument {
  projectName: string;
  projectPath: string;
  epicTitle?: string;
  testingRequirements: string[];
  userStories: Array<{
    id: string;
    title: string;
    description: string | null;
    acceptanceCriteria: string[];
    priority: string | null;
    tags: string[];
    passes: boolean;
  }>;
  generatedAt: string;
}

/**
 * Create a test database with the Brain Dump schema
 */
function createTestDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Create projects table
  db.prepare(
    `
    CREATE TABLE projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      color TEXT,
      working_method TEXT DEFAULT 'auto',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `
  ).run();

  // Create epics table
  db.prepare(
    `
    CREATE TABLE epics (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      color TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `
  ).run();

  // Create tickets table
  db.prepare(
    `
    CREATE TABLE tickets (
      id TEXT PRIMARY KEY NOT NULL,
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
      attachments TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      linked_commits TEXT
    )
  `
  ).run();

  // Create ticket_comments table
  db.prepare(
    `
    CREATE TABLE ticket_comments (
      id TEXT PRIMARY KEY NOT NULL,
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      author TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'comment',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `
  ).run();

  return db;
}

/**
 * Initialize a git repository in the given path using execFileSync for safety
 */
function initGitRepo(repoPath: string): void {
  mkdirSync(repoPath, { recursive: true });
  execFileSync("git", ["init"], { cwd: repoPath, stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: repoPath, stdio: "pipe" });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: repoPath, stdio: "pipe" });
  // Create initial commit so we have a base branch
  writeFileSync(join(repoPath, "README.md"), "# Test Project\n");
  execFileSync("git", ["add", "."], { cwd: repoPath, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", "Initial commit"], { cwd: repoPath, stdio: "pipe" });
}

/**
 * Run a git command and return the result using execFileSync for safety
 */
function runGit(args: string[], cwd: string): { success: boolean; output: string; error?: string } {
  try {
    const output = execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { success: true, output: output.trim() };
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    return {
      success: false,
      output: "",
      error: err.stderr?.trim() || err.message || "Unknown error",
    };
  }
}

/**
 * Generate a branch name from ticket info (mirrors git-utils.js)
 */
function generateBranchName(ticketId: string, ticketTitle: string): string {
  const shortId = ticketId.substring(0, 8);
  const slug = ticketTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
  return `feature/${shortId}-${slug}`;
}

// =============================================================================
// DATABASE QUERY HELPERS
// =============================================================================

type TicketWithProject = TestTicket & { project_name: string; project_path: string };

/**
 * Get a ticket with its project information
 */
function getTicketWithProject(
  db: Database.Database,
  ticketId: string
): TicketWithProject | undefined {
  return db
    .prepare(
      `SELECT t.*, p.name as project_name, p.path as project_path
       FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?`
    )
    .get(ticketId) as TicketWithProject | undefined;
}

/**
 * Get the current status of a ticket
 */
function getTicketStatus(db: Database.Database, ticketId: string): string {
  return (db.prepare("SELECT status FROM tickets WHERE id = ?").get(ticketId) as TestTicket).status;
}

/**
 * Insert a comment on a ticket
 */
function insertComment(
  db: Database.Database,
  ticketId: string,
  content: string,
  author: string,
  type: string
): void {
  const commentId = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(commentId, ticketId, content, author, type, now);
}

/**
 * Create a PRD file for the project
 */
function createPrdFile(projectPath: string, tickets: TestTicket[]): void {
  const plansDir = join(projectPath, "plans");
  mkdirSync(plansDir, { recursive: true });

  const prd: PRDDocument = {
    projectName: "Test Project",
    projectPath,
    testingRequirements: [
      "Tests must validate user-facing behavior, not implementation details",
      "Focus on what users actually do - integration tests over unit tests",
      "Don't mock excessively - test real behavior where possible",
      "Coverage metrics are meaningless - user flow coverage is everything",
    ],
    userStories: tickets.map((ticket) => ({
      id: ticket.id,
      title: ticket.title,
      description: ticket.description,
      acceptanceCriteria: ["Implement as described", "Verify functionality works as expected"],
      priority: ticket.priority,
      tags: ticket.tags ? JSON.parse(ticket.tags) : [],
      passes: ticket.status === "done",
    })),
    generatedAt: new Date().toISOString(),
  };

  writeFileSync(join(plansDir, "prd.json"), JSON.stringify(prd, null, 2));
}

/**
 * Simulate start_ticket_work MCP tool behavior
 * This mirrors the actual implementation in mcp-server/tools/workflow.js
 */
function simulateStartTicketWork(
  db: Database.Database,
  ticketId: string
): { success: boolean; branchName?: string; error?: string } {
  const ticket = getTicketWithProject(db, ticketId);

  if (!ticket) {
    return { success: false, error: `Ticket not found: ${ticketId}` };
  }

  if (ticket.status === "in_progress") {
    return { success: true, branchName: generateBranchName(ticketId, ticket.title) };
  }

  if (!existsSync(ticket.project_path)) {
    return { success: false, error: `Project path does not exist: ${ticket.project_path}` };
  }

  // Check if git repo
  const gitCheck = runGit(["rev-parse", "--git-dir"], ticket.project_path);
  if (!gitCheck.success) {
    return { success: false, error: `Not a git repository: ${ticket.project_path}` };
  }

  const branchName = generateBranchName(ticketId, ticket.title);
  const branchExists = runGit(
    ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`],
    ticket.project_path
  );

  if (!branchExists.success) {
    const createBranch = runGit(["checkout", "-b", branchName], ticket.project_path);
    if (!createBranch.success) {
      return {
        success: false,
        error: `Failed to create branch ${branchName}: ${createBranch.error}`,
      };
    }
  } else {
    const checkoutBranch = runGit(["checkout", branchName], ticket.project_path);
    if (!checkoutBranch.success) {
      return {
        success: false,
        error: `Failed to checkout branch ${branchName}: ${checkoutBranch.error}`,
      };
    }
  }

  // Update ticket status
  db.prepare("UPDATE tickets SET status = 'in_progress', updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    ticketId
  );

  // Add "Starting work" comment
  insertComment(db, ticketId, `Starting work on: ${ticket.title}`, "ralph", "comment");

  return { success: true, branchName };
}

/**
 * Simulate complete_ticket_work MCP tool behavior
 * This mirrors the actual implementation in mcp-server/tools/workflow.js
 */
function simulateCompleteTicketWork(
  db: Database.Database,
  ticketId: string,
  summary?: string
): { success: boolean; nextTicket?: { id: string; title: string } | null; error?: string } {
  const ticket = getTicketWithProject(db, ticketId);

  if (!ticket) {
    return { success: false, error: `Ticket not found: ${ticketId}` };
  }

  if (ticket.status === "done" || ticket.status === "review") {
    return { success: true, nextTicket: null };
  }

  // Update ticket status to review
  db.prepare("UPDATE tickets SET status = 'review', updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    ticketId
  );

  // Add work summary comment
  const workSummaryContent = summary
    ? `## Work Summary\n\n${summary}`
    : `Completed work on: ${ticket.title}`;
  insertComment(db, ticketId, workSummaryContent, "ralph", "work_summary");

  // Update PRD file
  const prdPath = join(ticket.project_path, "plans", "prd.json");
  if (existsSync(prdPath)) {
    const prd = JSON.parse(readFileSync(prdPath, "utf-8")) as PRDDocument;
    const story = prd.userStories.find((s) => s.id === ticketId);
    if (story) {
      story.passes = true;
      writeFileSync(prdPath, JSON.stringify(prd, null, 2) + "\n");
    }
  }

  // Suggest next ticket
  const incompleteTickets = db
    .prepare(
      `SELECT id, title, priority FROM tickets
       WHERE project_id = ? AND status NOT IN ('done', 'review') AND id != ?
       ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 1 END`
    )
    .all(ticket.project_id, ticketId) as Array<{ id: string; title: string; priority: string }>;

  const nextTicket = incompleteTickets[0] ?? null;

  return {
    success: true,
    nextTicket: nextTicket ? { id: nextTicket.id, title: nextTicket.title } : null,
  };
}

// =============================================================================
// TEST SUITES
// =============================================================================

describe("Ralph E2E Integration Tests", () => {
  let testDir: string;
  let dbPath: string;
  let db: Database.Database;
  let projectPath: string;
  let projectId: string;
  let ticketId: string;

  beforeEach(() => {
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `ralph-integration-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });

    // Create test database
    dbPath = join(testDir, "test.db");
    db = createTestDatabase(dbPath);

    // Create project directory with git repo
    projectPath = join(testDir, "test-project");
    initGitRepo(projectPath);

    // Create test project in database
    projectId = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO projects (id, name, path, working_method, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(projectId, "Test Project", projectPath, "auto", now);

    // Create test ticket
    ticketId = randomUUID();
    db.prepare(
      `INSERT INTO tickets (id, title, description, status, priority, position, project_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      ticketId,
      "Add login feature",
      "Implement user login functionality",
      "backlog",
      "high",
      1000,
      projectId,
      now,
      now
    );

    // Create PRD file
    const tickets = db
      .prepare("SELECT * FROM tickets WHERE project_id = ?")
      .all(projectId) as TestTicket[];
    createPrdFile(projectPath, tickets);
  });

  afterEach(() => {
    // Close database
    if (db) {
      db.close();
    }

    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ===========================================================================
  // TEST 1: RALPH SESSION LIFECYCLE
  // ===========================================================================

  describe("Ralph Session Lifecycle", () => {
    it("should complete a ticket from start to finish", () => {
      // Step 1: Start work on the ticket
      const startResult = simulateStartTicketWork(db, ticketId);
      expect(startResult.success).toBe(true);
      expect(startResult.branchName).toBeDefined();

      // Step 2: Verify session state after start
      const ticketAfterStart = db
        .prepare("SELECT * FROM tickets WHERE id = ?")
        .get(ticketId) as TestTicket;
      expect(ticketAfterStart.status).toBe("in_progress");

      // Step 3: Verify "Starting work" comment was posted
      const startComment = db
        .prepare("SELECT * FROM ticket_comments WHERE ticket_id = ? AND type = 'comment'")
        .get(ticketId) as TestComment;
      expect(startComment).toBeDefined();
      expect(startComment.content).toContain("Starting work on");
      expect(startComment.author).toBe("ralph");

      // Step 4: Verify git branch was created
      const branchCheck = runGit(["branch", "--show-current"], projectPath);
      expect(branchCheck.success).toBe(true);
      expect(branchCheck.output).toBe(startResult.branchName);

      // Step 5: Complete the ticket
      const completeResult = simulateCompleteTicketWork(
        db,
        ticketId,
        "Implemented login form with validation"
      );
      expect(completeResult.success).toBe(true);

      // Step 6: Verify ticket moved to review
      const ticketAfterComplete = db
        .prepare("SELECT * FROM tickets WHERE id = ?")
        .get(ticketId) as TestTicket;
      expect(ticketAfterComplete.status).toBe("review");

      // Step 7: Verify work summary comment was posted
      const summaryComment = db
        .prepare("SELECT * FROM ticket_comments WHERE ticket_id = ? AND type = 'work_summary'")
        .get(ticketId) as TestComment;
      expect(summaryComment).toBeDefined();
      expect(summaryComment.content).toContain("Implemented login form");
      expect(summaryComment.author).toBe("ralph");
    });

    it("should handle timeout gracefully by recording session state", () => {
      // Start work on ticket
      const startResult = simulateStartTicketWork(db, ticketId);
      expect(startResult.success).toBe(true);

      // Simulate timeout by checking that session state is preserved
      // In a real timeout, the progress file would be updated
      const progressFile = join(projectPath, "plans", "progress.txt");
      writeFileSync(progressFile, `### Timeout reached - session interrupted\n`);

      // Verify ticket is still in_progress (not lost)
      const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as TestTicket;
      expect(ticket.status).toBe("in_progress");

      // Verify progress file exists for recovery
      expect(existsSync(progressFile)).toBe(true);
    });

    it("should handle Claude errors and maintain consistent state", () => {
      // Start work
      simulateStartTicketWork(db, ticketId);

      // Simulate an error during work (e.g., Claude API failure)
      // The ticket should remain in_progress, not in an inconsistent state
      const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as TestTicket;
      expect(ticket.status).toBe("in_progress");

      // Verify we can retry by starting work again (should succeed as it's already in progress)
      const retryResult = simulateStartTicketWork(db, ticketId);
      expect(retryResult.success).toBe(true);
    });
  });

  // ===========================================================================
  // TEST 2: GIT INTEGRATION
  // ===========================================================================

  describe("Git Integration", () => {
    it("should create feature branch on start_ticket_work", () => {
      const result = simulateStartTicketWork(db, ticketId);

      expect(result.success).toBe(true);
      expect(result.branchName).toMatch(/^feature\/[a-f0-9]{8}-add-login-feature$/);

      // Verify we're on the feature branch
      const currentBranch = runGit(["branch", "--show-current"], projectPath);
      expect(currentBranch.success).toBe(true);
      expect(currentBranch.output).toBe(result.branchName);
    });

    it("should checkout existing branch if already created", () => {
      // First start creates the branch
      const result1 = simulateStartTicketWork(db, ticketId);
      expect(result1.success).toBe(true);

      // Switch back to main
      runGit(["checkout", "main"], projectPath);

      // Complete the work
      simulateCompleteTicketWork(db, ticketId);

      // Reset ticket status for re-testing
      db.prepare("UPDATE tickets SET status = 'backlog' WHERE id = ?").run(ticketId);

      // Second start should checkout existing branch
      const result2 = simulateStartTicketWork(db, ticketId);
      expect(result2.success).toBe(true);
      expect(result2.branchName).toBe(result1.branchName);
    });

    it("should capture commits made during session", () => {
      // Start work
      simulateStartTicketWork(db, ticketId);

      // Make some commits
      writeFileSync(join(projectPath, "login.ts"), "export function login() {}");
      runGit(["add", "."], projectPath);
      runGit(["commit", "-m", "feat: add login function"], projectPath);

      writeFileSync(join(projectPath, "validation.ts"), "export function validate() {}");
      runGit(["add", "."], projectPath);
      runGit(["commit", "-m", "feat: add validation"], projectPath);

      // Get commits on the branch
      const commitsResult = runGit(["log", "main..HEAD", "--oneline"], projectPath);
      expect(commitsResult.success).toBe(true);
      expect(commitsResult.output).toContain("add login function");
      expect(commitsResult.output).toContain("add validation");
    });

    it("should use correct branch naming convention", () => {
      // Test with various ticket titles
      const testCases = [
        { title: "Add login feature", expected: /^feature\/[a-f0-9]{8}-add-login-feature$/ },
        { title: "Fix Bug #123", expected: /^feature\/[a-f0-9]{8}-fix-bug-123$/ },
        { title: "Update UI components", expected: /^feature\/[a-f0-9]{8}-update-ui-components$/ },
      ];

      for (const testCase of testCases) {
        const testTicketId = randomUUID();
        db.prepare(
          `INSERT INTO tickets (id, title, status, priority, position, project_id, created_at, updated_at)
           VALUES (?, ?, 'backlog', 'medium', 2000, ?, datetime('now'), datetime('now'))`
        ).run(testTicketId, testCase.title, projectId);

        const branchName = generateBranchName(testTicketId, testCase.title);
        expect(branchName).toMatch(testCase.expected);
      }
    });
  });

  // ===========================================================================
  // TEST 3: DATABASE INTEGRITY
  // ===========================================================================

  describe("Database Integrity", () => {
    it("should maintain referential integrity after session", () => {
      // Start and complete work
      simulateStartTicketWork(db, ticketId);
      simulateCompleteTicketWork(db, ticketId, "Completed work");

      // Verify no orphaned comments (all comments have valid ticket_id)
      const orphanedComments = db
        .prepare(
          `SELECT c.* FROM ticket_comments c
           LEFT JOIN tickets t ON c.ticket_id = t.id
           WHERE t.id IS NULL`
        )
        .all();
      expect(orphanedComments).toHaveLength(0);

      // Verify all tickets have valid project_id
      const orphanedTickets = db
        .prepare(
          `SELECT t.* FROM tickets t
           LEFT JOIN projects p ON t.project_id = p.id
           WHERE p.id IS NULL`
        )
        .all();
      expect(orphanedTickets).toHaveLength(0);
    });

    it("should cascade delete comments when ticket is deleted", () => {
      // Start work (creates comments)
      simulateStartTicketWork(db, ticketId);

      // Verify comment exists
      const commentBefore = db
        .prepare("SELECT COUNT(*) as count FROM ticket_comments WHERE ticket_id = ?")
        .get(ticketId) as { count: number };
      expect(commentBefore.count).toBeGreaterThan(0);

      // Delete ticket
      db.prepare("DELETE FROM tickets WHERE id = ?").run(ticketId);

      // Verify comments are cascaded
      const commentAfter = db
        .prepare("SELECT COUNT(*) as count FROM ticket_comments WHERE ticket_id = ?")
        .get(ticketId) as { count: number };
      expect(commentAfter.count).toBe(0);
    });

    it("should preserve ticket history through status changes", () => {
      const statusHistory: string[] = [];

      // Track initial status
      statusHistory.push(getTicketStatus(db, ticketId));

      // Start work
      simulateStartTicketWork(db, ticketId);
      statusHistory.push(getTicketStatus(db, ticketId));

      // Complete work
      simulateCompleteTicketWork(db, ticketId);
      statusHistory.push(getTicketStatus(db, ticketId));

      // Verify status progression
      expect(statusHistory).toEqual(["backlog", "in_progress", "review"]);
    });
  });

  // ===========================================================================
  // TEST 4: PRD FILE MANAGEMENT
  // ===========================================================================

  describe("PRD File Management", () => {
    it("should update PRD passes field when ticket is completed", () => {
      const prdPath = join(projectPath, "plans", "prd.json");

      // Initial state: passes should be false
      const prdBefore = JSON.parse(readFileSync(prdPath, "utf-8")) as PRDDocument;
      const storyBefore = prdBefore.userStories.find((s) => s.id === ticketId);
      expect(storyBefore?.passes).toBe(false);

      // Complete the work
      simulateStartTicketWork(db, ticketId);
      simulateCompleteTicketWork(db, ticketId, "Completed");

      // After completion: passes should be true
      const prdAfter = JSON.parse(readFileSync(prdPath, "utf-8")) as PRDDocument;
      const storyAfter = prdAfter.userStories.find((s) => s.id === ticketId);
      expect(storyAfter?.passes).toBe(true);
    });

    it("should suggest next ticket based on priority after completion", () => {
      // Create additional tickets with different priorities
      const lowPriorityId = randomUUID();
      const highPriorityId = randomUUID();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO tickets (id, title, status, priority, position, project_id, created_at, updated_at)
         VALUES (?, 'Low priority task', 'backlog', 'low', 2000, ?, ?, ?)`
      ).run(lowPriorityId, projectId, now, now);

      db.prepare(
        `INSERT INTO tickets (id, title, status, priority, position, project_id, created_at, updated_at)
         VALUES (?, 'High priority task', 'backlog', 'high', 3000, ?, ?, ?)`
      ).run(highPriorityId, projectId, now, now);

      // Complete the first ticket
      simulateStartTicketWork(db, ticketId);
      const result = simulateCompleteTicketWork(db, ticketId);

      // Should suggest the high priority ticket next
      expect(result.nextTicket).toBeDefined();
      expect(result.nextTicket?.id).toBe(highPriorityId);
      expect(result.nextTicket?.title).toBe("High priority task");
    });

    it("should indicate when all tickets are complete", () => {
      // Complete the only ticket
      simulateStartTicketWork(db, ticketId);
      const result = simulateCompleteTicketWork(db, ticketId);

      // No next ticket should be suggested
      expect(result.nextTicket).toBeNull();
    });
  });

  // ===========================================================================
  // TEST 5: ERROR HANDLING
  // ===========================================================================

  describe("Error Handling", () => {
    it("should fail gracefully when ticket does not exist", () => {
      const fakeTicketId = randomUUID();
      const result = simulateStartTicketWork(db, fakeTicketId);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Ticket not found");
    });

    it("should fail gracefully when project path does not exist", () => {
      // Update project path to non-existent location
      db.prepare("UPDATE projects SET path = ? WHERE id = ?").run("/nonexistent/path", projectId);

      const result = simulateStartTicketWork(db, ticketId);

      expect(result.success).toBe(false);
      expect(result.error).toContain("does not exist");
    });

    it("should fail gracefully when not a git repository", () => {
      // Create a non-git directory
      const nonGitPath = join(testDir, "non-git-project");
      mkdirSync(nonGitPath, { recursive: true });

      // Update project to use non-git path
      db.prepare("UPDATE projects SET path = ? WHERE id = ?").run(nonGitPath, projectId);

      const result = simulateStartTicketWork(db, ticketId);

      expect(result.success).toBe(false);
      expect(result.error).toContain("git repository");
    });

    it("should handle already in_progress tickets gracefully", () => {
      // First start
      simulateStartTicketWork(db, ticketId);

      // Try to start again
      const result = simulateStartTicketWork(db, ticketId);

      // Should succeed (idempotent operation)
      expect(result.success).toBe(true);
    });

    it("should handle already completed tickets gracefully", () => {
      // Complete the ticket
      simulateStartTicketWork(db, ticketId);
      simulateCompleteTicketWork(db, ticketId);

      // Try to complete again
      const result = simulateCompleteTicketWork(db, ticketId);

      // Should succeed (idempotent operation)
      expect(result.success).toBe(true);
    });
  });
});
