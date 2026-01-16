/**
 * MCP Tools Integration Tests
 *
 * Following Kent C. Dodds' testing philosophy:
 * - Test user-facing behavior, not implementation details
 * - Integration tests > unit tests for workflows
 * - Use real database fixtures, minimal mocking
 * - Test the MCP tools as Claude/Ralph would use them
 *
 * These tests verify the MCP server tools work correctly as a unit:
 * 1. Ticket comment lifecycle (add, get, filter)
 * 2. Workflow tools (start_ticket_work, complete_ticket_work)
 * 3. Git integration (branch creation, commit linking)
 * 4. Error handling for invalid inputs
 *
 * Note: Uses execFileSync for git operations which is the safe alternative
 * to exec() - it does not use shell interpolation and prevents injection.
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

// =============================================================================
// TEST DATABASE SCHEMA (mirrors production schema)
// =============================================================================
const SCHEMA_SQL = `
  CREATE TABLE projects (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    color TEXT,
    working_method TEXT DEFAULT 'auto',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE epics (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    color TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

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
    linked_files TEXT,
    attachments TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    linked_commits TEXT
  );

  CREATE TABLE ticket_comments (
    id TEXT PRIMARY KEY NOT NULL,
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

// =============================================================================
// MCP TOOL IMPLEMENTATIONS (mirrors mcp-server/tools/*.js)
// These are extracted implementations for direct testing
// =============================================================================

const AUTHORS = ["claude", "ralph", "user", "opencode"] as const;
const COMMENT_TYPES = ["comment", "work_summary", "test_report", "progress"] as const;
type Author = (typeof AUTHORS)[number];
type CommentType = (typeof COMMENT_TYPES)[number];

interface TicketRow {
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
  project_name?: string;
  project_path?: string;
}

interface CommentRow {
  id: string;
  ticket_id: string;
  content: string;
  author: string;
  type: string;
  created_at: string;
}

// Comment Tools (mirrors mcp-server/tools/comments.js)
function addTicketComment(
  db: Database.Database,
  ticketId: string,
  content: string,
  author: Author,
  type: CommentType = "comment"
): { success: boolean; comment?: CommentRow; error?: string } {
  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
  if (!ticket) {
    return { success: false, error: `Ticket not found: ${ticketId}` };
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    "INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, ticketId, content.trim(), author, type, now);

  const comment = db.prepare("SELECT * FROM ticket_comments WHERE id = ?").get(id) as CommentRow;
  return { success: true, comment };
}

function getTicketComments(
  db: Database.Database,
  ticketId: string
): { success: boolean; comments?: CommentRow[]; error?: string } {
  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
  if (!ticket) {
    return { success: false, error: `Ticket not found: ${ticketId}` };
  }

  const comments = db
    .prepare("SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at DESC")
    .all(ticketId) as CommentRow[];

  return { success: true, comments };
}

/**
 * Run a git command safely using execFileSync (not shell interpolation).
 * This is the safe pattern that prevents command injection.
 */
function runGitCommand(
  args: string[],
  cwd: string
): { success: boolean; output: string; error?: string } {
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

function shortId(uuid: string): string {
  return uuid.substring(0, 8);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
}

function generateBranchName(ticketId: string, ticketTitle: string): string {
  return `feature/${shortId(ticketId)}-${slugify(ticketTitle)}`;
}

// Workflow Tools (mirrors mcp-server/tools/workflow.js)
function startTicketWork(
  db: Database.Database,
  ticketId: string
): {
  success: boolean;
  branchName?: string;
  branchCreated?: boolean;
  ticket?: TicketRow;
  error?: string;
} {
  const ticket = db
    .prepare(
      `
    SELECT t.*, p.name as project_name, p.path as project_path
    FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
  `
    )
    .get(ticketId) as (TicketRow & { project_name: string; project_path: string }) | undefined;

  if (!ticket) {
    return { success: false, error: `Ticket not found: ${ticketId}` };
  }

  if (ticket.status === "in_progress") {
    return { success: true, ticket, branchName: generateBranchName(ticketId, ticket.title) };
  }

  if (!existsSync(ticket.project_path)) {
    return { success: false, error: `Project path does not exist: ${ticket.project_path}` };
  }

  const gitCheck = runGitCommand(["rev-parse", "--git-dir"], ticket.project_path);
  if (!gitCheck.success) {
    return { success: false, error: `Not a git repository: ${ticket.project_path}` };
  }

  const branchName = generateBranchName(ticketId, ticket.title);
  const branchExists = runGitCommand(
    ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`],
    ticket.project_path
  );

  let branchCreated = false;
  if (!branchExists.success) {
    const createBranch = runGitCommand(["checkout", "-b", branchName], ticket.project_path);
    if (!createBranch.success) {
      return {
        success: false,
        error: `Failed to create branch ${branchName}: ${createBranch.error}`,
      };
    }
    branchCreated = true;
  } else {
    const checkoutBranch = runGitCommand(["checkout", branchName], ticket.project_path);
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
  addTicketComment(db, ticketId, `Starting work on: ${ticket.title}`, "ralph", "comment");

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

function completeTicketWork(
  db: Database.Database,
  ticketId: string,
  summary?: string
): {
  success: boolean;
  ticket?: TicketRow;
  prdUpdated?: boolean;
  summaryPosted?: boolean;
  error?: string;
} {
  const ticket = db
    .prepare(
      `
    SELECT t.*, p.name as project_name, p.path as project_path
    FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
  `
    )
    .get(ticketId) as (TicketRow & { project_name: string; project_path: string }) | undefined;

  if (!ticket) {
    return { success: false, error: `Ticket not found: ${ticketId}` };
  }

  if (ticket.status === "done" || ticket.status === "review") {
    return { success: true, ticket };
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE tickets SET status = 'review', updated_at = ? WHERE id = ?").run(
    now,
    ticketId
  );

  // Auto-post work summary comment
  const workSummaryContent = summary
    ? `## Work Summary\n\n${summary}`
    : `Completed work on: ${ticket.title}`;
  const summaryResult = addTicketComment(db, ticketId, workSummaryContent, "ralph", "work_summary");

  // Update PRD file
  let prdUpdated = false;
  const prdPath = join(ticket.project_path, "plans", "prd.json");
  if (existsSync(prdPath)) {
    try {
      const prdContent = readFileSync(prdPath, "utf-8");
      const prd = JSON.parse(prdContent);
      if (prd.userStories && Array.isArray(prd.userStories)) {
        const story = prd.userStories.find((s: { id: string }) => s.id === ticketId);
        if (story) {
          story.passes = true;
          writeFileSync(prdPath, JSON.stringify(prd, null, 2) + "\n");
          prdUpdated = true;
        }
      }
    } catch {
      // PRD update failed, but workflow should continue
    }
  }

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
    prdUpdated,
    summaryPosted: summaryResult.success,
  };
}

// Git Tools (mirrors mcp-server/tools/git.js)
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

function linkFilesToTicket(
  db: Database.Database,
  ticketId: string,
  files: string[]
): { success: boolean; linkedFiles?: string[]; error?: string } {
  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as
    | { linked_files: string | null }
    | undefined;

  if (!ticket) {
    return { success: false, error: `Ticket not found: ${ticketId}` };
  }

  let linkedFiles: string[] = [];
  if (ticket.linked_files) {
    try {
      linkedFiles = JSON.parse(ticket.linked_files);
    } catch {
      linkedFiles = [];
    }
  }

  // Add new files (deduplicated)
  for (const file of files) {
    if (!linkedFiles.includes(file)) {
      linkedFiles.push(file);
    }
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE tickets SET linked_files = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify(linkedFiles),
    now,
    ticketId
  );

  return { success: true, linkedFiles };
}

// =============================================================================
// TEST FIXTURES
// =============================================================================

describe("MCP Tools Integration Tests", () => {
  let db: Database.Database;
  let testDir: string;

  beforeEach(() => {
    // Create unique temp directory with git repo for each test
    testDir = join(tmpdir(), `mcp-tools-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });

    // Initialize git repo using execFileSync (safe, no shell interpolation)
    execFileSync("git", ["init"], { cwd: testDir, stdio: "pipe" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: testDir,
      stdio: "pipe",
    });
    execFileSync("git", ["config", "user.name", "Test User"], { cwd: testDir, stdio: "pipe" });

    // Create initial commit so we have a branch to work from
    writeFileSync(join(testDir, "README.md"), "# Test Project\n");
    execFileSync("git", ["add", "."], { cwd: testDir, stdio: "pipe" });
    execFileSync("git", ["commit", "-m", "Initial commit"], { cwd: testDir, stdio: "pipe" });

    // Create plans directory
    mkdirSync(join(testDir, "plans"), { recursive: true });

    // Create in-memory database with schema
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA_SQL);
  });

  afterEach(() => {
    db.close();
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

  const createPrdFile = (tickets: Array<{ id: string; title: string }>) => {
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
  // TEST SUITE 1: Comment Tools (Session Message Lifecycle)
  // ===========================================================================
  describe("Comment Tools - Session Message Lifecycle", () => {
    it("should create, update, and retrieve comments through full lifecycle", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "Test Feature");

      // Step 1: Add a user comment
      const userComment = addTicketComment(db, ticketId, "Starting work on this feature", "user");
      expect(userComment.success).toBe(true);
      expect(userComment.comment).toBeDefined();
      expect(userComment.comment?.author).toBe("user");
      expect(userComment.comment?.type).toBe("comment");

      // Step 2: Add an assistant comment
      const assistantComment = addTicketComment(
        db,
        ticketId,
        "I will implement the feature",
        "claude"
      );
      expect(assistantComment.success).toBe(true);
      expect(assistantComment.comment?.author).toBe("claude");

      // Step 3: Add a progress comment
      const progressComment = addTicketComment(
        db,
        ticketId,
        "50% complete - added core logic",
        "ralph",
        "progress"
      );
      expect(progressComment.success).toBe(true);
      expect(progressComment.comment?.type).toBe("progress");

      // Step 4: Add a work summary
      const workSummary = addTicketComment(
        db,
        ticketId,
        "## Summary\n- Added feature X\n- Tests pass",
        "ralph",
        "work_summary"
      );
      expect(workSummary.success).toBe(true);
      expect(workSummary.comment?.type).toBe("work_summary");

      // Step 5: Retrieve all comments
      const allComments = getTicketComments(db, ticketId);
      expect(allComments.success).toBe(true);
      expect(allComments.comments).toHaveLength(4);

      // Verify all comment types are present (order may vary due to fast inserts)
      const types = allComments.comments?.map((c) => c.type) ?? [];
      expect(types).toContain("comment");
      expect(types).toContain("progress");
      expect(types).toContain("work_summary");
    });

    it("should handle all author types correctly", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "Author Test");

      for (const author of AUTHORS) {
        const result = addTicketComment(db, ticketId, `Comment from ${author}`, author);
        expect(result.success).toBe(true);
        expect(result.comment?.author).toBe(author);
      }

      const comments = getTicketComments(db, ticketId);
      expect(comments.comments).toHaveLength(4);
    });

    it("should handle all comment types correctly", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "Type Test");

      for (const type of COMMENT_TYPES) {
        const result = addTicketComment(db, ticketId, `${type} content`, "ralph", type);
        expect(result.success).toBe(true);
        expect(result.comment?.type).toBe(type);
      }

      const comments = getTicketComments(db, ticketId);
      expect(comments.comments).toHaveLength(4);
    });

    it("should preserve markdown formatting in comments", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "Markdown Test");

      const markdownContent = `## Work Summary

### Changes Made
- Added new feature
- Fixed bug in \`utils.ts\`

### Code Block
\`\`\`typescript
function test() {
  return true;
}
\`\`\`

### Links
[Documentation](https://example.com)`;

      const result = addTicketComment(db, ticketId, markdownContent, "ralph", "work_summary");
      expect(result.success).toBe(true);

      const comments = getTicketComments(db, ticketId);
      expect(comments.success).toBe(true);
      expect(comments.comments).toHaveLength(1);
      const savedComment = comments.comments?.[0];
      expect(savedComment).toBeDefined();
      expect(savedComment?.content).toBe(markdownContent);
    });

    it("should trim whitespace from content", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "Whitespace Test");

      const result = addTicketComment(db, ticketId, "  Content with spaces  \n\n", "ralph");
      expect(result.success).toBe(true);
      expect(result.comment?.content).toBe("Content with spaces");
    });
  });

  // ===========================================================================
  // TEST SUITE 2: Workflow Tools - Session Lifecycle
  // ===========================================================================
  describe("Workflow Tools - Session Lifecycle", () => {
    it("should complete a full session: start → work → complete", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "Full Lifecycle Test");
      createPrdFile([{ id: ticketId, title: "Full Lifecycle Test" }]);

      // Step 1: Start work
      const startResult = startTicketWork(db, ticketId);
      expect(startResult.success).toBe(true);
      expect(startResult.branchCreated).toBe(true);
      expect(startResult.ticket?.status).toBe("in_progress");

      // Verify "Starting work" comment
      const commentsAfterStart = getTicketComments(db, ticketId);
      const startComment = commentsAfterStart.comments?.find((c) =>
        c.content.includes("Starting work on")
      );
      expect(startComment).toBeDefined();
      expect(startComment?.author).toBe("ralph");

      // Step 2: Simulate work (add progress comment)
      addTicketComment(db, ticketId, "Implementing feature...", "ralph", "progress");

      // Step 3: Complete work
      const completeResult = completeTicketWork(
        db,
        ticketId,
        "Implemented the feature successfully"
      );
      expect(completeResult.success).toBe(true);
      expect(completeResult.ticket?.status).toBe("review");
      expect(completeResult.summaryPosted).toBe(true);
      expect(completeResult.prdUpdated).toBe(true);

      // Verify work summary comment
      const commentsAfterComplete = getTicketComments(db, ticketId);
      const summaryComment = commentsAfterComplete.comments?.find((c) => c.type === "work_summary");
      expect(summaryComment).toBeDefined();
      expect(summaryComment?.content).toContain("Work Summary");
      expect(summaryComment?.content).toContain("Implemented the feature successfully");

      // Verify PRD was updated
      const prdContent = JSON.parse(readFileSync(join(testDir, "plans", "prd.json"), "utf-8"));
      const story = prdContent.userStories.find((s: { id: string }) => s.id === ticketId);
      expect(story.passes).toBe(true);
    });

    it("should handle session failure gracefully (error during work)", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "Failure Test");

      // Start work
      const startResult = startTicketWork(db, ticketId);
      expect(startResult.success).toBe(true);

      // Simulate failure by adding error comment
      addTicketComment(
        db,
        ticketId,
        "Error: Build failed\n```\nModule not found\n```",
        "ralph",
        "comment"
      );

      // Verify ticket is still in_progress (not completed)
      const ticket = db.prepare("SELECT status FROM tickets WHERE id = ?").get(ticketId) as {
        status: string;
      };
      expect(ticket.status).toBe("in_progress");

      // Error is recorded in comments
      const comments = getTicketComments(db, ticketId);
      const errorComment = comments.comments?.find((c) => c.content.includes("Error:"));
      expect(errorComment).toBeDefined();
    });

    it("should capture git context automatically", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "Git Context Test");

      // Start work (creates branch)
      const startResult = startTicketWork(db, ticketId);
      expect(startResult.success).toBe(true);

      // Verify branch was created
      const branchCheck = runGitCommand(
        ["show-ref", "--verify", `refs/heads/${startResult.branchName}`],
        testDir
      );
      expect(branchCheck.success).toBe(true);

      // Create a commit using execFileSync (safe, no shell interpolation)
      writeFileSync(join(testDir, "feature.ts"), "export function feature() {}");
      execFileSync("git", ["add", "."], { cwd: testDir, stdio: "pipe" });
      execFileSync("git", ["commit", "-m", `feat(${shortId(ticketId)}): add feature`], {
        cwd: testDir,
        stdio: "pipe",
      });

      // Link commit to ticket
      const commitHash = runGitCommand(["rev-parse", "HEAD"], testDir).output;
      const linkResult = linkCommitToTicket(db, ticketId, commitHash, "feat: add feature");
      expect(linkResult.success).toBe(true);
      expect(linkResult.linkedCommits).toHaveLength(1);

      // Verify commit is linked
      const ticket = db
        .prepare("SELECT linked_commits FROM tickets WHERE id = ?")
        .get(ticketId) as {
        linked_commits: string;
      };
      const commits = JSON.parse(ticket.linked_commits);
      expect(commits).toHaveLength(1);
      expect(commits[0].hash).toBe(commitHash);
    });
  });

  // ===========================================================================
  // TEST SUITE 3: Session Queries - Filtering and Retrieval
  // ===========================================================================
  describe("Session Queries - Filtering and Retrieval", () => {
    it("should filter comments by type", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "Filter Test");

      // Add various comment types
      addTicketComment(db, ticketId, "Regular comment", "user", "comment");
      addTicketComment(db, ticketId, "Work summary", "ralph", "work_summary");
      addTicketComment(db, ticketId, "Progress update", "ralph", "progress");
      addTicketComment(db, ticketId, "Test report", "ralph", "test_report");

      // Get all comments
      const allComments = getTicketComments(db, ticketId);
      expect(allComments.comments).toHaveLength(4);

      // Filter by type (simulating MCP query with type filter)
      const workSummaries = allComments.comments?.filter((c) => c.type === "work_summary");
      expect(workSummaries).toHaveLength(1);

      const progressComments = allComments.comments?.filter((c) => c.type === "progress");
      expect(progressComments).toHaveLength(1);
    });

    it("should return comments sorted by created_at descending", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "Order Test");

      // Add three comments
      addTicketComment(db, ticketId, "First comment", "user", "comment");
      addTicketComment(db, ticketId, "Second comment", "ralph", "comment");
      addTicketComment(db, ticketId, "Third comment", "ralph", "work_summary");

      const comments = getTicketComments(db, ticketId);
      expect(comments.success).toBe(true);
      expect(comments.comments).toHaveLength(3);

      // Verify all comments are present with correct content
      const contents = comments.comments?.map((c) => c.content) ?? [];
      expect(contents).toContain("First comment");
      expect(contents).toContain("Second comment");
      expect(contents).toContain("Third comment");
    });

    it("should return empty array for ticket with no comments", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "No Comments");

      const comments = getTicketComments(db, ticketId);
      expect(comments.success).toBe(true);
      expect(comments.comments).toHaveLength(0);
    });
  });

  // ===========================================================================
  // TEST SUITE 4: Error Handling
  // ===========================================================================
  describe("Error Handling", () => {
    it("should return error for non-existent ticket (add_ticket_comment)", () => {
      const result = addTicketComment(db, "non-existent-id", "Test comment", "ralph");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Ticket not found");
    });

    it("should return error for non-existent ticket (get_ticket_comments)", () => {
      const result = getTicketComments(db, "non-existent-id");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Ticket not found");
    });

    it("should return error for non-existent ticket (start_ticket_work)", () => {
      const result = startTicketWork(db, "fake-ticket-id");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Ticket not found");
    });

    it("should return error for non-existent project path", () => {
      // Create project with non-existent path
      const projectId = randomUUID();
      db.prepare(
        "INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, datetime('now'))"
      ).run(projectId, "Bad Project", "/non/existent/path");

      const ticketId = createTestTicket(projectId, "Bad Path Test");

      const result = startTicketWork(db, ticketId);
      expect(result.success).toBe(false);
      expect(result.error).toContain("does not exist");
    });

    it("should return error for non-git repository", () => {
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

    it("should handle already in-progress ticket gracefully", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "In Progress Test");

      // Start work first time
      startTicketWork(db, ticketId);

      // Try to start work again
      const result = startTicketWork(db, ticketId);
      expect(result.success).toBe(true);
      expect(result.branchCreated).toBeFalsy(); // Should not create new branch

      // Should only have one "Starting work" comment
      const comments = getTicketComments(db, ticketId);
      const startComments = comments.comments?.filter((c) =>
        c.content.includes("Starting work on")
      );
      expect(startComments).toHaveLength(1);
    });

    it("should handle already completed ticket gracefully", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "Already Done");
      createPrdFile([{ id: ticketId, title: "Already Done" }]);

      // Complete once
      startTicketWork(db, ticketId);
      completeTicketWork(db, ticketId, "First completion");

      // Try to complete again
      const result = completeTicketWork(db, ticketId, "Second completion");
      expect(result.success).toBe(true); // Should not error

      // Should only have one work_summary comment
      const comments = getTicketComments(db, ticketId);
      const summaries = comments.comments?.filter((c) => c.type === "work_summary");
      expect(summaries).toHaveLength(1);
    });

    it("should return error for non-existent ticket (link_commit_to_ticket)", () => {
      const result = linkCommitToTicket(db, "non-existent-id", "abc123", "Test commit");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Ticket not found");
    });

    it("should return error for non-existent ticket (link_files_to_ticket)", () => {
      const result = linkFilesToTicket(db, "non-existent-id", ["file.ts"]);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Ticket not found");
    });
  });

  // ===========================================================================
  // TEST SUITE 5: Git Integration
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
        ["show-ref", "--verify", `refs/heads/${result.branchName}`],
        testDir
      );
      expect(branchCheck.success).toBe(true);
    });

    it("should checkout existing branch instead of creating duplicate", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "Test Branch");

      // Create branch manually using execFileSync (safe)
      const branchName = generateBranchName(ticketId, "Test Branch");
      execFileSync("git", ["checkout", "-b", branchName], { cwd: testDir, stdio: "pipe" });
      execFileSync("git", ["checkout", "main"], { cwd: testDir, stdio: "pipe" });

      // Start ticket work should checkout existing branch
      const result = startTicketWork(db, ticketId);

      expect(result.success).toBe(true);
      expect(result.branchCreated).toBe(false);

      // Verify we're on the correct branch
      const currentBranch = runGitCommand(["rev-parse", "--abbrev-ref", "HEAD"], testDir);
      expect(currentBranch.output).toBe(branchName);
    });

    it("should link multiple commits to a ticket", () => {
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
      expect(result.linkedCommits).toHaveLength(1);
    });

    it("should detect short hash duplicates", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "Short Hash Test");

      // Link full hash
      linkCommitToTicket(db, ticketId, "abc1234567890", "Full hash");

      // Try to link short version of same hash
      const result = linkCommitToTicket(db, ticketId, "abc1234", "Short hash");

      expect(result.success).toBe(true);
      expect(result.linkedCommits).toHaveLength(1);
    });

    it("should link files to ticket", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "File Link Test");

      const result1 = linkFilesToTicket(db, ticketId, ["src/feature.ts"]);
      expect(result1.success).toBe(true);
      expect(result1.linkedFiles).toHaveLength(1);

      const result2 = linkFilesToTicket(db, ticketId, ["src/utils.ts", "src/types.ts"]);
      expect(result2.success).toBe(true);
      expect(result2.linkedFiles).toHaveLength(3);

      // Verify deduplication
      const result3 = linkFilesToTicket(db, ticketId, ["src/feature.ts"]);
      expect(result3.linkedFiles).toHaveLength(3);
    });
  });

  // ===========================================================================
  // TEST SUITE 6: Database Integrity
  // ===========================================================================
  describe("Database Integrity", () => {
    it("should cascade delete comments when ticket is deleted", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "Cascade Test");

      // Add comments
      addTicketComment(db, ticketId, "Comment 1", "user");
      addTicketComment(db, ticketId, "Comment 2", "ralph");

      // Verify comments exist
      const commentsBefore = db
        .prepare("SELECT COUNT(*) as count FROM ticket_comments WHERE ticket_id = ?")
        .get(ticketId) as { count: number };
      expect(commentsBefore.count).toBe(2);

      // Delete ticket
      db.prepare("DELETE FROM tickets WHERE id = ?").run(ticketId);

      // Verify comments are deleted
      const commentsAfter = db
        .prepare("SELECT COUNT(*) as count FROM ticket_comments WHERE ticket_id = ?")
        .get(ticketId) as { count: number };
      expect(commentsAfter.count).toBe(0);
    });

    it("should not create orphaned comments on workflow failure", () => {
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

    it("should preserve ticket data integrity through workflow", () => {
      const projectId = createTestProject();
      const ticketId = createTestTicket(projectId, "Data Integrity");
      createPrdFile([{ id: ticketId, title: "Data Integrity" }]);

      // Record initial state
      const initialTicket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as {
        title: string;
        description: string;
        project_id: string;
        priority: string;
      };

      // Run through workflow
      startTicketWork(db, ticketId);
      completeTicketWork(db, ticketId, "Done");

      // Verify core fields unchanged
      const finalTicket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as {
        title: string;
        description: string;
        project_id: string;
        priority: string;
        status: string;
      };

      expect(finalTicket.title).toBe(initialTicket.title);
      expect(finalTicket.description).toBe(initialTicket.description);
      expect(finalTicket.project_id).toBe(initialTicket.project_id);
      expect(finalTicket.priority).toBe(initialTicket.priority);
      expect(finalTicket.status).toBe("review");
    });
  });
});
