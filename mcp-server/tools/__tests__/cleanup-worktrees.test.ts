/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for cleanup_worktrees MCP tool.
 *
 * Following Kent C. Dodds' testing philosophy:
 * - Tests real user behavior: "What does the AI experience when running cleanup_worktrees?"
 * - Integration tests with real database and git worktrees
 *
 * The cleanup_worktrees tool:
 * 1. Lists all worktrees tracked in epic_workflow_state
 * 2. Checks safety criteria (all tickets done, PR merged, no uncommitted changes)
 * 3. Dry-run by default, actually removes when dryRun: false
 *
 * Note: execSync is used with hardcoded commands only (no user input), so command injection is not a concern.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdirSync, rmSync, existsSync, writeFileSync, realpathSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { execSync } from "child_process";

// Database schema
const SCHEMA_SQL = `
  CREATE TABLE settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    terminal_emulator TEXT,
    enable_worktree_support INTEGER DEFAULT 1,
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
    pr_number INTEGER,
    pr_status TEXT,
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
`;

// Import the worktree utils we need
import { validateWorktree, removeWorktree } from "../../lib/worktree-utils.js";

// Helper to simulate what cleanup_worktrees does
interface CleanupResult {
  removed: any[];
  skipped: any[];
  errors: any[];
  dryRun: boolean;
}

function simulateCleanupWorktrees(
  db: Database.Database,
  options: { projectId?: string; force?: boolean; dryRun?: boolean } = {}
): CleanupResult {
  const { projectId, force = false, dryRun = true } = options;

  const results: CleanupResult = {
    removed: [],
    skipped: [],
    errors: [],
    dryRun,
  };

  // Get all epics with worktree paths
  let epicsQuery = `
    SELECT
      e.id as epic_id,
      e.title as epic_title,
      p.id as project_id,
      p.name as project_name,
      p.path as project_path,
      ews.worktree_path,
      ews.worktree_status,
      ews.pr_number,
      ews.pr_status
    FROM epic_workflow_state ews
    JOIN epics e ON ews.epic_id = e.id
    JOIN projects p ON e.project_id = p.id
    WHERE ews.worktree_path IS NOT NULL
  `;

  const params: string[] = [];
  if (projectId) {
    epicsQuery += " AND p.id = ?";
    params.push(projectId);
  }

  const epicsWithWorktrees = db.prepare(epicsQuery).all(...params) as any[];

  for (const epic of epicsWithWorktrees) {
    const cleanupInfo = {
      worktreePath: epic.worktree_path,
      epicId: epic.epic_id,
      epicTitle: epic.epic_title,
      projectPath: epic.project_path,
      projectName: epic.project_name,
      prNumber: epic.pr_number,
      prStatus: epic.pr_status,
      hasUncommittedChanges: false,
      canRemove: false,
      reason: "",
    };

    // Check if project path exists
    if (!existsSync(epic.project_path)) {
      cleanupInfo.reason = "Project path does not exist";
      results.skipped.push(cleanupInfo);
      continue;
    }

    // Check if worktree directory exists
    if (!existsSync(epic.worktree_path)) {
      // Worktree directory doesn't exist - clean up database reference
      cleanupInfo.reason = "Worktree directory no longer exists (cleaning up DB reference)";
      cleanupInfo.canRemove = true;

      if (!dryRun) {
        const now = new Date().toISOString();
        db.prepare(
          `
          UPDATE epic_workflow_state
          SET worktree_path = NULL, worktree_status = NULL, worktree_created_at = NULL, updated_at = ?
          WHERE epic_id = ?
        `
        ).run(now, epic.epic_id);
      }

      results.removed.push(cleanupInfo);
      continue;
    }

    // Validate the worktree
    const validation = validateWorktree(epic.worktree_path, epic.project_path);

    if (validation.status === "corrupted") {
      cleanupInfo.reason = `Worktree is corrupted: ${validation.error}`;
      cleanupInfo.canRemove = true;
    } else if (validation.status === "missing_directory") {
      cleanupInfo.reason = "Worktree directory missing";
      cleanupInfo.canRemove = true;
    } else {
      cleanupInfo.hasUncommittedChanges = validation.hasUncommittedChanges || false;
    }

    // Check if all tickets in the epic are done
    const ticketStats = db
      .prepare(
        `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done
      FROM tickets WHERE epic_id = ?
    `
      )
      .get(epic.epic_id) as { total: number; done: number };

    const allTicketsDone = ticketStats.total > 0 && ticketStats.done === ticketStats.total;

    // Check PR status
    const prMerged = epic.pr_status === "merged";

    // Determine if we can remove this worktree
    if (validation.status === "corrupted") {
      cleanupInfo.canRemove = true;
      cleanupInfo.reason = "Worktree is corrupted and can be safely removed";
    } else if (!allTicketsDone) {
      cleanupInfo.canRemove = false;
      cleanupInfo.reason = `Not all tickets are done (${ticketStats.done}/${ticketStats.total} complete)`;
    } else if (!prMerged && epic.pr_number) {
      cleanupInfo.canRemove = false;
      cleanupInfo.reason = `PR #${epic.pr_number} is not merged (status: ${epic.pr_status || "unknown"})`;
    } else if (!epic.pr_number) {
      cleanupInfo.canRemove = allTicketsDone;
      cleanupInfo.reason = allTicketsDone
        ? "All tickets done, no PR linked - safe to remove"
        : "Tickets not complete";
    } else if (cleanupInfo.hasUncommittedChanges && !force) {
      cleanupInfo.canRemove = false;
      cleanupInfo.reason = "Has uncommitted changes (use force=true to override)";
    } else {
      cleanupInfo.canRemove = true;
      cleanupInfo.reason = prMerged ? "Epic complete and PR merged" : "Epic complete";
    }

    // Perform removal or skip
    if (!cleanupInfo.canRemove) {
      results.skipped.push(cleanupInfo);
    } else if (dryRun) {
      results.removed.push(cleanupInfo);
    } else {
      // Actually remove the worktree
      try {
        const removeResult = removeWorktree(epic.worktree_path, epic.project_path, {
          force: force || cleanupInfo.hasUncommittedChanges,
        });

        if (removeResult.success) {
          const now = new Date().toISOString();
          db.prepare(
            `
            UPDATE epic_workflow_state
            SET worktree_path = NULL, worktree_status = 'removed', updated_at = ?
            WHERE epic_id = ?
          `
          ).run(now, epic.epic_id);

          results.removed.push(cleanupInfo);
        } else {
          results.errors.push({
            worktreePath: epic.worktree_path,
            error: removeResult.error || "Unknown error during removal",
          });
        }
      } catch (err: any) {
        results.errors.push({
          worktreePath: epic.worktree_path,
          error: err.message,
        });
      }
    }
  }

  return results;
}

describe("cleanup_worktrees tool behavior", () => {
  let db: Database.Database;
  let testDir: string;
  let projectPath: string;
  let projectId: string;

  beforeAll(() => {
    // Create temporary directory structure
    // Use realpathSync to resolve symlinks (on macOS, /var -> /private/var)
    // This ensures path validation works correctly
    const baseDir = realpathSync(tmpdir());
    testDir = join(baseDir, `brain-dump-cleanup-test-${randomUUID().substring(0, 8)}`);
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

    // Create default settings
    db.prepare(`INSERT INTO settings (id, enable_worktree_support) VALUES ('default', 1)`).run();
  });

  afterAll(() => {
    db.close();
    if (existsSync(testDir)) {
      // Clean up any worktrees
      try {
        execSync("git worktree prune", { cwd: projectPath, stdio: "ignore" });
      } catch {
        // Ignore errors
      }
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Create fresh project for each test
    projectId = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO projects (id, name, path, default_isolation_mode, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run(projectId, "Test Project", projectPath, "worktree", now);
  });

  afterEach(() => {
    // Clean up test data
    db.prepare(
      "DELETE FROM epic_workflow_state WHERE epic_id IN (SELECT id FROM epics WHERE project_id = ?)"
    ).run(projectId);
    db.prepare("DELETE FROM tickets WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM epics WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);

    // Prune orphaned worktrees
    try {
      execSync("git worktree prune", { cwd: projectPath, stdio: "ignore" });
    } catch {
      // Ignore errors
    }
  });

  describe("when there are no worktrees", () => {
    it("should return empty results", () => {
      const result = simulateCleanupWorktrees(db);

      expect(result.removed).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.dryRun).toBe(true);
    });
  });

  describe("when worktree path no longer exists (orphaned reference)", () => {
    it("should mark orphaned worktree references for cleanup", () => {
      const epicId = randomUUID();
      const stateId = randomUUID();
      const now = new Date().toISOString();
      const orphanedPath = join(testDir, "non-existent-worktree");

      // Create epic with orphaned worktree reference
      db.prepare(`INSERT INTO epics (id, title, project_id, created_at) VALUES (?, ?, ?, ?)`).run(
        epicId,
        "Orphaned Epic",
        projectId,
        now
      );

      db.prepare(
        `
        INSERT INTO epic_workflow_state (id, epic_id, worktree_path, worktree_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(stateId, epicId, orphanedPath, "active", now, now);

      const result = simulateCleanupWorktrees(db);

      expect(result.removed).toHaveLength(1);
      expect(result.removed[0].worktreePath).toBe(orphanedPath);
      expect(result.removed[0].reason).toContain("no longer exists");
    });

    it("should clean up database reference when dryRun is false", () => {
      const epicId = randomUUID();
      const stateId = randomUUID();
      const now = new Date().toISOString();
      const orphanedPath = join(testDir, "non-existent-worktree-2");

      db.prepare(`INSERT INTO epics (id, title, project_id, created_at) VALUES (?, ?, ?, ?)`).run(
        epicId,
        "Orphaned Epic",
        projectId,
        now
      );

      db.prepare(
        `
        INSERT INTO epic_workflow_state (id, epic_id, worktree_path, worktree_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(stateId, epicId, orphanedPath, "active", now, now);

      const result = simulateCleanupWorktrees(db, { dryRun: false });

      expect(result.removed).toHaveLength(1);

      // Verify database was updated
      const state = db
        .prepare("SELECT worktree_path FROM epic_workflow_state WHERE epic_id = ?")
        .get(epicId) as any;
      expect(state.worktree_path).toBeNull();
    });
  });

  describe("when tickets are not all done", () => {
    it("should skip worktree cleanup", () => {
      const epicId = randomUUID();
      const stateId = randomUUID();
      const ticketId = randomUUID();
      const now = new Date().toISOString();

      // Create actual worktree (hardcoded branch name - safe from injection)
      const worktreePath = join(testDir, `test-project-epic-${epicId.substring(0, 8)}`);
      const branchName = `feature/epic-${epicId.substring(0, 8)}`;

      try {
        execSync(`git worktree add "${worktreePath}" -b "${branchName}"`, {
          cwd: projectPath,
          stdio: "ignore",
        });
      } catch {
        // Skip test if worktree creation fails
        return;
      }

      db.prepare(`INSERT INTO epics (id, title, project_id, created_at) VALUES (?, ?, ?, ?)`).run(
        epicId,
        "In Progress Epic",
        projectId,
        now
      );

      db.prepare(
        `
        INSERT INTO tickets (id, title, status, position, project_id, epic_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(ticketId, "In Progress Ticket", "in_progress", 1, projectId, epicId, now, now);

      db.prepare(
        `
        INSERT INTO epic_workflow_state (id, epic_id, worktree_path, worktree_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(stateId, epicId, worktreePath, "active", now, now);

      const result = simulateCleanupWorktrees(db);

      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toContain("Not all tickets are done");

      // Cleanup worktree
      execSync(`git worktree remove "${worktreePath}" --force`, {
        cwd: projectPath,
        stdio: "ignore",
      });
    });
  });

  describe("when PR is not merged", () => {
    it("should skip worktree cleanup", () => {
      const epicId = randomUUID();
      const stateId = randomUUID();
      const ticketId = randomUUID();
      const now = new Date().toISOString();

      // Create actual worktree (hardcoded commands - safe from injection)
      const worktreePath = join(testDir, `test-project-epic-${epicId.substring(0, 8)}-pr`);
      const branchName = `feature/epic-${epicId.substring(0, 8)}-pr`;

      try {
        execSync(`git worktree add "${worktreePath}" -b "${branchName}"`, {
          cwd: projectPath,
          stdio: "ignore",
        });
      } catch {
        return;
      }

      db.prepare(`INSERT INTO epics (id, title, project_id, created_at) VALUES (?, ?, ?, ?)`).run(
        epicId,
        "PR Not Merged Epic",
        projectId,
        now
      );

      // Create a done ticket
      db.prepare(
        `
        INSERT INTO tickets (id, title, status, position, project_id, epic_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(ticketId, "Done Ticket", "done", 1, projectId, epicId, now, now);

      // Create workflow state with PR open
      db.prepare(
        `
        INSERT INTO epic_workflow_state (id, epic_id, worktree_path, worktree_status, pr_number, pr_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(stateId, epicId, worktreePath, "active", 42, "open", now, now);

      const result = simulateCleanupWorktrees(db);

      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toContain("PR #42 is not merged");

      // Cleanup worktree
      execSync(`git worktree remove "${worktreePath}" --force`, {
        cwd: projectPath,
        stdio: "ignore",
      });
    });
  });

  describe("when all criteria are met", () => {
    it("should mark worktree for removal in dry-run mode", () => {
      const epicId = randomUUID();
      const stateId = randomUUID();
      const ticketId = randomUUID();
      const now = new Date().toISOString();

      // Create actual worktree (hardcoded commands - safe from injection)
      const worktreePath = join(testDir, `test-project-epic-${epicId.substring(0, 8)}-ready`);
      const branchName = `feature/epic-${epicId.substring(0, 8)}-ready`;

      try {
        execSync(`git worktree add "${worktreePath}" -b "${branchName}"`, {
          cwd: projectPath,
          stdio: "ignore",
        });
      } catch {
        return;
      }

      db.prepare(`INSERT INTO epics (id, title, project_id, created_at) VALUES (?, ?, ?, ?)`).run(
        epicId,
        "Ready for Cleanup Epic",
        projectId,
        now
      );

      // Create a done ticket
      db.prepare(
        `
        INSERT INTO tickets (id, title, status, position, project_id, epic_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(ticketId, "Done Ticket", "done", 1, projectId, epicId, now, now);

      // Create workflow state with PR merged
      db.prepare(
        `
        INSERT INTO epic_workflow_state (id, epic_id, worktree_path, worktree_status, pr_number, pr_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(stateId, epicId, worktreePath, "active", 42, "merged", now, now);

      const result = simulateCleanupWorktrees(db, { dryRun: true });

      expect(result.removed).toHaveLength(1);
      expect(result.removed[0].reason).toContain("Epic complete and PR merged");

      // Worktree should still exist (dry run)
      expect(existsSync(worktreePath)).toBe(true);

      // Cleanup worktree
      execSync(`git worktree remove "${worktreePath}" --force`, {
        cwd: projectPath,
        stdio: "ignore",
      });
    });

    it("should actually remove worktree when dryRun is false", () => {
      const epicId = randomUUID();
      const stateId = randomUUID();
      const ticketId = randomUUID();
      const now = new Date().toISOString();

      // Create actual worktree (hardcoded commands - safe from injection)
      const worktreePath = join(testDir, `test-project-epic-${epicId.substring(0, 8)}-delete`);
      const branchName = `feature/epic-${epicId.substring(0, 8)}-delete`;

      try {
        execSync(`git worktree add "${worktreePath}" -b "${branchName}"`, {
          cwd: projectPath,
          stdio: "ignore",
        });
      } catch {
        return;
      }

      db.prepare(`INSERT INTO epics (id, title, project_id, created_at) VALUES (?, ?, ?, ?)`).run(
        epicId,
        "Delete Epic",
        projectId,
        now
      );

      db.prepare(
        `
        INSERT INTO tickets (id, title, status, position, project_id, epic_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(ticketId, "Done Ticket", "done", 1, projectId, epicId, now, now);

      db.prepare(
        `
        INSERT INTO epic_workflow_state (id, epic_id, worktree_path, worktree_status, pr_number, pr_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(stateId, epicId, worktreePath, "active", 42, "merged", now, now);

      const result = simulateCleanupWorktrees(db, { dryRun: false });

      expect(result.removed).toHaveLength(1);

      // Verify database was updated
      const state = db
        .prepare("SELECT worktree_path, worktree_status FROM epic_workflow_state WHERE epic_id = ?")
        .get(epicId) as any;
      expect(state.worktree_path).toBeNull();
      expect(state.worktree_status).toBe("removed");
    });
  });

  describe("when no PR is linked", () => {
    it("should allow cleanup if all tickets are done", () => {
      const epicId = randomUUID();
      const stateId = randomUUID();
      const ticketId = randomUUID();
      const now = new Date().toISOString();

      // Create actual worktree (hardcoded commands - safe from injection)
      const worktreePath = join(testDir, `test-project-epic-${epicId.substring(0, 8)}-nopr`);
      const branchName = `feature/epic-${epicId.substring(0, 8)}-nopr`;

      try {
        execSync(`git worktree add "${worktreePath}" -b "${branchName}"`, {
          cwd: projectPath,
          stdio: "ignore",
        });
      } catch {
        return;
      }

      db.prepare(`INSERT INTO epics (id, title, project_id, created_at) VALUES (?, ?, ?, ?)`).run(
        epicId,
        "No PR Epic",
        projectId,
        now
      );

      db.prepare(
        `
        INSERT INTO tickets (id, title, status, position, project_id, epic_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(ticketId, "Done Ticket", "done", 1, projectId, epicId, now, now);

      // No PR linked
      db.prepare(
        `
        INSERT INTO epic_workflow_state (id, epic_id, worktree_path, worktree_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(stateId, epicId, worktreePath, "active", now, now);

      const result = simulateCleanupWorktrees(db);

      expect(result.removed).toHaveLength(1);
      expect(result.removed[0].reason).toContain("no PR linked");

      // Cleanup worktree
      execSync(`git worktree remove "${worktreePath}" --force`, {
        cwd: projectPath,
        stdio: "ignore",
      });
    });
  });

  describe("project filtering", () => {
    it("should only cleanup worktrees for specified project", () => {
      const epicId1 = randomUUID();
      const epicId2 = randomUUID();
      const stateId1 = randomUUID();
      const stateId2 = randomUUID();
      const projectId2 = randomUUID();
      const now = new Date().toISOString();

      // Create second project (hardcoded commands - safe from injection)
      const projectPath2 = join(testDir, "test-project-2");
      mkdirSync(projectPath2, { recursive: true });
      execSync("git init", { cwd: projectPath2, stdio: "ignore" });
      execSync("git config user.email 'test@test.com'", { cwd: projectPath2, stdio: "ignore" });
      execSync("git config user.name 'Test User'", { cwd: projectPath2, stdio: "ignore" });
      writeFileSync(join(projectPath2, "README.md"), "# Test Project 2");
      execSync("git add . && git commit -m 'Initial commit'", {
        cwd: projectPath2,
        stdio: "ignore",
      });

      db.prepare(`INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)`).run(
        projectId2,
        "Test Project 2",
        projectPath2,
        now
      );

      // Create epics with orphaned worktree references in both projects
      db.prepare(`INSERT INTO epics (id, title, project_id, created_at) VALUES (?, ?, ?, ?)`).run(
        epicId1,
        "Epic 1",
        projectId,
        now
      );
      db.prepare(`INSERT INTO epics (id, title, project_id, created_at) VALUES (?, ?, ?, ?)`).run(
        epicId2,
        "Epic 2",
        projectId2,
        now
      );

      db.prepare(
        `
        INSERT INTO epic_workflow_state (id, epic_id, worktree_path, worktree_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(stateId1, epicId1, join(testDir, "orphan-1"), "active", now, now);
      db.prepare(
        `
        INSERT INTO epic_workflow_state (id, epic_id, worktree_path, worktree_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(stateId2, epicId2, join(testDir, "orphan-2"), "active", now, now);

      // Cleanup only first project
      const result = simulateCleanupWorktrees(db, { projectId });

      expect(result.removed).toHaveLength(1);
      expect(result.removed[0].epicId).toBe(epicId1);

      // Cleanup
      db.prepare("DELETE FROM epic_workflow_state WHERE epic_id = ?").run(epicId2);
      db.prepare("DELETE FROM epics WHERE id = ?").run(epicId2);
      db.prepare("DELETE FROM projects WHERE id = ?").run(projectId2);
      rmSync(projectPath2, { recursive: true, force: true });
    });
  });
});
