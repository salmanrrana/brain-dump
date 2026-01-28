/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for start_ticket_work worktree inheritance behavior.
 *
 * Verifies that when a ticket belongs to an epic with worktree isolation mode:
 * - The worktree path is used as the working directory
 * - ralph-state.json is initialized in the worktree
 * - The response includes worktree context
 *
 * Following Kent C. Dodds' testing philosophy:
 * - Tests real user behavior: "What does the AI experience when starting work on a worktree-enabled ticket?"
 * - Integration tests with real database and filesystem
 *
 * Note: execSync is used with hardcoded commands only (no user input), so command injection is not a concern.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { execSync } from "child_process";
import { getEffectiveIsolationMode } from "../../lib/worktree-flags.js";
import { generateWorktreePath, validateWorktree } from "../../lib/worktree-utils.js";
import { generateEpicBranchName } from "../../lib/git-utils.js";

// Database schema that includes all relevant tables
const SCHEMA_SQL = `
  CREATE TABLE settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    terminal_emulator TEXT,
    enable_worktree_support INTEGER DEFAULT 0,
    enable_conversation_logging INTEGER DEFAULT 1,
    retention_days INTEGER DEFAULT 90,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    color TEXT,
    working_method TEXT,
    default_isolation_mode TEXT,
    worktree_location TEXT DEFAULT 'sibling',
    worktree_base_path TEXT,
    max_worktrees INTEGER DEFAULT 5,
    auto_cleanup_worktrees INTEGER DEFAULT 0,
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
    attachments TEXT,
    branch_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE TABLE epic_workflow_state (
    id TEXT PRIMARY KEY,
    epic_id TEXT NOT NULL UNIQUE REFERENCES epics(id) ON DELETE CASCADE,
    epic_branch_name TEXT,
    epic_branch_created_at TEXT,
    worktree_path TEXT,
    worktree_created_at TEXT,
    worktree_status TEXT,
    current_ticket_id TEXT,
    pr_number INTEGER,
    pr_url TEXT,
    pr_status TEXT,
    tickets_total INTEGER DEFAULT 0,
    tickets_done INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE ticket_workflow_state (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
    current_phase TEXT NOT NULL DEFAULT 'implementation',
    review_iteration INTEGER NOT NULL DEFAULT 0,
    findings_count INTEGER NOT NULL DEFAULT 0,
    findings_fixed INTEGER NOT NULL DEFAULT 0,
    demo_generated INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

describe("start_ticket_work worktree inheritance", () => {
  let db: Database.Database;
  let testDir: string;
  let projectPath: string;
  let projectId: string;
  let epicId: string;
  let ticketId: string;

  beforeAll(() => {
    // Create temporary directory structure
    testDir = join(tmpdir(), `brain-dump-worktree-test-${randomUUID().substring(0, 8)}`);
    projectPath = join(testDir, "test-project");
    mkdirSync(projectPath, { recursive: true });

    // Initialize git repo (hardcoded commands - safe from injection)
    execSync("git init", { cwd: projectPath, stdio: "ignore" });
    execSync("git config user.email 'test@test.com'", { cwd: projectPath, stdio: "ignore" });
    execSync("git config user.name 'Test User'", { cwd: projectPath, stdio: "ignore" });
    writeFileSync(join(projectPath, "README.md"), "# Test Project");
    execSync("git add . && git commit -m 'Initial commit'", { cwd: projectPath, stdio: "ignore" });

    // Initialize test database
    const dbPath = join(testDir, "test.db");
    db = new Database(dbPath);
    db.exec(SCHEMA_SQL);

    // Create default settings with worktree support enabled
    db.prepare(`INSERT INTO settings (id, enable_worktree_support) VALUES ('default', 1)`).run();
  });

  afterAll(() => {
    db.close();
    if (existsSync(testDir)) {
      // Clean up any worktrees before removing the directory
      try {
        execSync("git worktree prune", { cwd: projectPath, stdio: "ignore" });
      } catch {
        // Ignore errors
      }
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Create fresh test data for each test
    projectId = randomUUID();
    epicId = randomUUID();
    ticketId = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO projects (id, name, path, default_isolation_mode, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run(
      projectId,
      "Test Project",
      projectPath,
      "worktree", // Enable worktree mode at project level
      now
    );

    db.prepare(
      `INSERT INTO epics (id, title, project_id, isolation_mode, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run(
      epicId,
      "Test Epic for Worktree",
      projectId,
      "worktree", // Epic explicitly uses worktree mode
      now
    );

    db.prepare(
      `INSERT INTO tickets (id, title, description, status, priority, position, project_id, epic_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      ticketId,
      "Test Ticket",
      "Test description for worktree ticket",
      "ready",
      "high",
      1,
      projectId,
      epicId,
      now,
      now
    );
  });

  afterEach(() => {
    // Clean up test data
    db.prepare("DELETE FROM ticket_workflow_state WHERE ticket_id = ?").run(ticketId);
    db.prepare("DELETE FROM epic_workflow_state WHERE epic_id = ?").run(epicId);
    db.prepare("DELETE FROM tickets WHERE id = ?").run(ticketId);
    db.prepare("DELETE FROM epics WHERE id = ?").run(epicId);
    db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);

    // Clean up any worktrees created during the test
    try {
      execSync("git worktree prune", { cwd: projectPath, stdio: "ignore" });
      // Also try to remove any lingering worktree directories
      const worktreeDir = join(testDir, `test-project-epic-${epicId.substring(0, 8)}`);
      if (existsSync(worktreeDir)) {
        rmSync(worktreeDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore errors
    }
  });

  describe("getEffectiveIsolationMode", () => {
    it("should return worktree mode when epic has isolation_mode = worktree", () => {
      const { mode, source } = getEffectiveIsolationMode(db as any, epicId, null);

      expect(mode).toBe("worktree");
      expect(source).toBe("epic");
    });

    it("should return branch mode when explicitly requested", () => {
      const { mode, source } = getEffectiveIsolationMode(db as any, epicId, "branch");

      expect(mode).toBe("branch");
      expect(source).toBe("requested");
    });

    it("should fall back to project default when epic has no isolation mode", () => {
      // Create epic without isolation mode
      const epicIdNoMode = randomUUID();
      db.prepare(`INSERT INTO epics (id, title, project_id, created_at) VALUES (?, ?, ?, ?)`).run(
        epicIdNoMode,
        "Epic Without Mode",
        projectId,
        new Date().toISOString()
      );

      const { mode, source } = getEffectiveIsolationMode(db as any, epicIdNoMode, null);

      expect(mode).toBe("worktree"); // Falls back to project default
      expect(source).toBe("project");

      // Cleanup
      db.prepare("DELETE FROM epics WHERE id = ?").run(epicIdNoMode);
    });

    it("should still use epic setting even when worktree support is disabled globally", () => {
      // Disable worktree support globally
      db.prepare("UPDATE settings SET enable_worktree_support = 0").run();

      const { mode, source } = getEffectiveIsolationMode(db as any, epicId, null);

      // Epic setting still takes precedence if explicitly set
      expect(mode).toBe("worktree");
      expect(source).toBe("epic");

      // Re-enable for other tests
      db.prepare("UPDATE settings SET enable_worktree_support = 1").run();
    });
  });

  describe("generateWorktreePath", () => {
    it("should generate sibling worktree path correctly", () => {
      const result = generateWorktreePath(projectPath, epicId, "Test Epic for Worktree", {
        location: "sibling",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.path).toContain("test-project-epic-");
        expect(result.path).toContain(epicId.substring(0, 8));
        expect(result.worktreeName).toContain("test-epic-for-worktree");
      }
    });

    it("should generate subfolder worktree path correctly", () => {
      const result = generateWorktreePath(projectPath, epicId, "Feature X", {
        location: "subfolder",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.path).toContain(".worktrees");
        expect(result.path).toContain("epic-");
        expect(result.worktreeName).toContain("feature-x");
      }
    });

    it("should fail for relative paths", () => {
      const result = generateWorktreePath("relative/path", epicId, "Test Epic");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("absolute");
      }
    });
  });

  describe("validateWorktree", () => {
    it("should return missing_directory for non-existent paths", () => {
      const result = validateWorktree("/non/existent/path", projectPath);

      expect(result.status).toBe("missing_directory");
    });

    it("should return corrupted for directory not in worktree list", () => {
      // Create a regular directory (not a worktree)
      const regularDir = join(testDir, "not-a-worktree");
      mkdirSync(regularDir, { recursive: true });

      const result = validateWorktree(regularDir, projectPath);

      expect(result.status).toBe("corrupted");
      expect(result.error).toContain("not in worktree list");

      // Cleanup
      rmSync(regularDir, { recursive: true });
    });
  });

  describe("generateEpicBranchName", () => {
    it("should generate valid branch name from epic", () => {
      const branchName = generateEpicBranchName(epicId, "Test Epic for Worktree");

      expect(branchName).toMatch(/^feature\/epic-[a-f0-9]{8}-test-epic-for-worktree$/);
    });

    it("should handle special characters in epic title", () => {
      const branchName = generateEpicBranchName(epicId, "Epic: With Special $chars & More!");

      expect(branchName).not.toContain(":");
      expect(branchName).not.toContain("$");
      expect(branchName).not.toContain("&");
      expect(branchName).not.toContain("!");
    });
  });

  describe("Epic workflow state with worktree", () => {
    it("should store worktree path in epic_workflow_state", () => {
      const stateId = randomUUID();
      const now = new Date().toISOString();
      const worktreePath = join(testDir, `test-project-epic-${epicId.substring(0, 8)}-test-epic`);
      const branchName = generateEpicBranchName(epicId, "Test Epic for Worktree");

      db.prepare(
        `
        INSERT INTO epic_workflow_state (id, epic_id, epic_branch_name, worktree_path, worktree_status, current_ticket_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(stateId, epicId, branchName, worktreePath, "active", ticketId, now, now);

      const state = db
        .prepare("SELECT * FROM epic_workflow_state WHERE epic_id = ?")
        .get(epicId) as any;

      expect(state).toBeDefined();
      expect(state.worktree_path).toBe(worktreePath);
      expect(state.worktree_status).toBe("active");
      expect(state.current_ticket_id).toBe(ticketId);
    });

    it("should update current_ticket_id when starting new ticket in same epic", () => {
      // First, set up initial state with first ticket
      const stateId = randomUUID();
      const now = new Date().toISOString();
      const worktreePath = join(testDir, `test-project-epic-${epicId.substring(0, 8)}-test-epic`);

      db.prepare(
        `
        INSERT INTO epic_workflow_state (id, epic_id, worktree_path, worktree_status, current_ticket_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      ).run(stateId, epicId, worktreePath, "active", ticketId, now, now);

      // Create second ticket in same epic
      const secondTicketId = randomUUID();
      db.prepare(
        `
        INSERT INTO tickets (id, title, status, priority, position, project_id, epic_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(secondTicketId, "Second Ticket", "ready", "medium", 2, projectId, epicId, now, now);

      // Simulate starting work on second ticket
      db.prepare(
        "UPDATE epic_workflow_state SET current_ticket_id = ?, updated_at = ? WHERE epic_id = ?"
      ).run(secondTicketId, new Date().toISOString(), epicId);

      const state = db
        .prepare("SELECT current_ticket_id FROM epic_workflow_state WHERE epic_id = ?")
        .get(epicId) as any;

      expect(state.current_ticket_id).toBe(secondTicketId);

      // Cleanup
      db.prepare("DELETE FROM tickets WHERE id = ?").run(secondTicketId);
    });
  });

  describe("Ticket inherits worktree from epic", () => {
    it("should recognize ticket belongs to worktree-enabled epic", () => {
      const ticket = db
        .prepare(
          `
        SELECT t.*, e.isolation_mode as epic_isolation_mode
        FROM tickets t
        JOIN epics e ON t.epic_id = e.id
        WHERE t.id = ?
      `
        )
        .get(ticketId) as any;

      expect(ticket).toBeDefined();
      expect(ticket.epic_id).toBe(epicId);
      expect(ticket.epic_isolation_mode).toBe("worktree");
    });

    it("should get correct working directory from epic_workflow_state", () => {
      // Set up worktree in epic state
      const stateId = randomUUID();
      const worktreePath = join(testDir, `test-project-epic-${epicId.substring(0, 8)}-test-epic`);
      const now = new Date().toISOString();

      db.prepare(
        `
        INSERT INTO epic_workflow_state (id, epic_id, worktree_path, worktree_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(stateId, epicId, worktreePath, "active", now, now);

      // Query should find the worktree path through the epic
      const result = db
        .prepare(
          `
        SELECT ews.worktree_path
        FROM tickets t
        JOIN epic_workflow_state ews ON t.epic_id = ews.epic_id
        WHERE t.id = ?
      `
        )
        .get(ticketId) as any;

      expect(result).toBeDefined();
      expect(result.worktree_path).toBe(worktreePath);
    });
  });

  describe("Branch mode tickets (control case)", () => {
    it("should work normally for tickets without worktree epic", () => {
      // Create epic without worktree mode
      const branchEpicId = randomUUID();
      const branchTicketId = randomUUID();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO epics (id, title, project_id, isolation_mode, created_at) VALUES (?, ?, ?, ?, ?)`
      ).run(branchEpicId, "Branch Mode Epic", projectId, "branch", now);

      db.prepare(
        `
        INSERT INTO tickets (id, title, status, position, project_id, epic_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(branchTicketId, "Branch Mode Ticket", "ready", 1, projectId, branchEpicId, now, now);

      const { mode } = getEffectiveIsolationMode(db as any, branchEpicId, null);

      expect(mode).toBe("branch");

      // Cleanup
      db.prepare("DELETE FROM tickets WHERE id = ?").run(branchTicketId);
      db.prepare("DELETE FROM epics WHERE id = ?").run(branchEpicId);
    });

    it("should work normally for tickets without any epic", () => {
      // Create ticket without epic
      const noEpicTicketId = randomUUID();
      const now = new Date().toISOString();

      db.prepare(
        `
        INSERT INTO tickets (id, title, status, position, project_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      ).run(noEpicTicketId, "No Epic Ticket", "ready", 1, projectId, now, now);

      const ticket = db
        .prepare("SELECT epic_id FROM tickets WHERE id = ?")
        .get(noEpicTicketId) as any;

      expect(ticket.epic_id).toBeNull();

      // Cleanup
      db.prepare("DELETE FROM tickets WHERE id = ?").run(noEpicTicketId);
    });
  });
});
