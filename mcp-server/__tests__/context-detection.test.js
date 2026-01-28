/**
 * Unit tests for context detection system.
 * Tests detection of active context based on ticket status, session state, and project state.
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  detectContext,
  detectAllActiveContexts,
  isContextRelevant,
  getContextSummary,
} from "../lib/context-detection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Helper to initialize test database with schema
function initializeTestDatabase() {
  const db = new Database(":memory:");

  // Read and execute schema
  const schemaPath = path.join(__dirname, "../lib/schema.sql");
  try {
    const schema = readFileSync(schemaPath, "utf-8");
    db.exec(schema);
  } catch {
    // If schema.sql doesn't exist, create tables manually
    db.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        color TEXT,
        working_method TEXT DEFAULT 'auto',
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
        is_blocked INTEGER DEFAULT 0,
        blocked_reason TEXT,
        linked_files TEXT,
        attachments TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        branch_name TEXT,
        pr_number INTEGER,
        pr_url TEXT,
        pr_status TEXT
      );

      CREATE TABLE conversation_sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id),
        ticket_id TEXT REFERENCES tickets(id),
        environment TEXT,
        data_classification TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX idx_epics_project ON epics(project_id);
      CREATE INDEX idx_tickets_project ON tickets(project_id);
      CREATE INDEX idx_tickets_epic ON tickets(epic_id);
      CREATE INDEX idx_tickets_status ON tickets(status);
      CREATE INDEX idx_comments_ticket ON ticket_comments(ticket_id);
    `);
  }

  return db;
}

// Helper to insert test data
function insertTestProject(db, id = "proj-1", name = "Test Project") {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)`
  ).run(id, name, `/tmp/${id}`, now);
  return id;
}

function insertTestTicket(
  db,
  ticketId = "ticket-1",
  projectId = "proj-1",
  status = "backlog",
  title = "Test Ticket"
) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tickets
     (id, title, status, project_id, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(ticketId, title, status, projectId, 1.0, now, now);
  return ticketId;
}

function insertTestSession(
  db,
  sessionId = "session-1",
  ticketId = null,
  projectId = null
) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO conversation_sessions
     (id, project_id, ticket_id, environment, data_classification, started_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(sessionId, projectId, ticketId, "test", "internal", now, now);
  return sessionId;
}

describe("Context Detection System", () => {
  let db;

  beforeEach(() => {
    db = initializeTestDatabase();
  });

  describe("detectContext", () => {
    it("should return idle context when no ticket or session provided", () => {
      const context = detectContext(db);
      expect(context.type).toBe("admin");
      expect(context.description).toBe("Administrative/setup context");
    });

    it("should return ticket_work context for in_progress ticket", () => {
      insertTestProject(db);
      insertTestTicket(db, "ticket-1", "proj-1", "in_progress");

      const context = detectContext(db, { ticketId: "ticket-1" });

      expect(context.type).toBe("ticket_work");
      expect(context.status).toBe("in_progress");
      expect(context.ticketId).toBe("ticket-1");
      expect(context.description).toBe("Active ticket implementation");
    });

    it("should return review context for ai_review ticket", () => {
      insertTestProject(db);
      insertTestTicket(db, "ticket-2", "proj-1", "ai_review");

      const context = detectContext(db, { ticketId: "ticket-2" });

      expect(context.type).toBe("review");
      expect(context.status).toBe("ai_review");
      expect(context.metadata.reviewPhase).toBe("automated");
    });

    it("should return review context for human_review ticket", () => {
      insertTestProject(db);
      insertTestTicket(db, "ticket-3", "proj-1", "human_review");

      const context = detectContext(db, { ticketId: "ticket-3" });

      expect(context.type).toBe("review");
      expect(context.status).toBe("human_review");
      expect(context.metadata.reviewPhase).toBe("manual");
    });

    it("should return planning context for backlog ticket", () => {
      insertTestProject(db);
      insertTestTicket(db, "ticket-4", "proj-1", "backlog");

      const context = detectContext(db, { ticketId: "ticket-4" });

      expect(context.type).toBe("planning");
      expect(context.status).toBe("backlog");
      expect(context.metadata.readinessLevel).toBe("needs_planning");
    });

    it("should return planning context for ready ticket", () => {
      insertTestProject(db);
      insertTestTicket(db, "ticket-5", "proj-1", "ready");

      const context = detectContext(db, { ticketId: "ticket-5" });

      expect(context.type).toBe("planning");
      expect(context.status).toBe("ready");
      expect(context.metadata.readinessLevel).toBe("ready_to_work");
    });

    it("should return admin context for done ticket", () => {
      insertTestProject(db);
      insertTestTicket(db, "ticket-6", "proj-1", "done");

      const context = detectContext(db, { ticketId: "ticket-6" });

      expect(context.type).toBe("admin");
      expect(context.status).toBe("done");
    });

    it("should include project details in context metadata", () => {
      insertTestProject(db, "proj-2", "My Project");
      insertTestTicket(db, "ticket-7", "proj-2", "in_progress");

      const context = detectContext(db, { ticketId: "ticket-7" });

      expect(context.metadata.project).not.toBeNull();
      expect(context.metadata.project.name).toBe("My Project");
    });

    it("should find ticket from session ID", () => {
      insertTestProject(db);
      insertTestTicket(db, "ticket-8", "proj-1", "in_progress");
      insertTestSession(db, "session-1", "ticket-8", "proj-1");

      const context = detectContext(db, { sessionId: "session-1" });

      expect(context.type).toBe("ticket_work");
      expect(context.ticketId).toBe("ticket-8");
    });

    it("should include session details in metadata", () => {
      insertTestProject(db);
      insertTestTicket(db, "ticket-9", "proj-1", "in_progress");
      insertTestSession(db, "session-2", "ticket-9", "proj-1");

      const context = detectContext(db, { sessionId: "session-2" });

      expect(context.metadata.session).not.toBeNull();
      expect(context.metadata.session.id).toBe("session-2");
    });

    it("should handle non-existent tickets gracefully", () => {
      const context = detectContext(db, { ticketId: "nonexistent" });

      expect(context.type).toBe("admin");
      expect(context.description).toBe("Administrative/setup context");
    });
  });

  describe("isContextRelevant", () => {
    it("should identify relevant tools for ticket_work context", () => {
      const context = { type: "ticket_work" };

      expect(isContextRelevant(context, "ticket_work")).toBe(true);
      expect(isContextRelevant(context, "code")).toBe(true);
      expect(isContextRelevant(context, "testing")).toBe(true);
      expect(isContextRelevant(context, "git")).toBe(true);
      expect(isContextRelevant(context, "general")).toBe(true);
      expect(isContextRelevant(context, "admin")).toBe(false);
    });

    it("should identify relevant tools for review context", () => {
      const context = { type: "review" };

      expect(isContextRelevant(context, "review")).toBe(true);
      expect(isContextRelevant(context, "code")).toBe(true);
      expect(isContextRelevant(context, "testing")).toBe(true);
      expect(isContextRelevant(context, "general")).toBe(true);
      expect(isContextRelevant(context, "ticket_management")).toBe(false);
    });

    it("should identify relevant tools for planning context", () => {
      const context = { type: "planning" };

      expect(isContextRelevant(context, "planning")).toBe(true);
      expect(isContextRelevant(context, "ticket_management")).toBe(true);
      expect(isContextRelevant(context, "general")).toBe(true);
      expect(isContextRelevant(context, "ticket_work")).toBe(false);
    });

    it("should identify relevant tools for admin context", () => {
      const context = { type: "admin" };

      expect(isContextRelevant(context, "admin")).toBe(true);
      expect(isContextRelevant(context, "settings")).toBe(true);
      expect(isContextRelevant(context, "general")).toBe(true);
      expect(isContextRelevant(context, "project_management")).toBe(true);
      expect(isContextRelevant(context, "code")).toBe(false);
    });

    it("should return false for null context", () => {
      expect(isContextRelevant(null, "ticket_work")).toBe(false);
    });

    it("should return false for null toolCategory", () => {
      const context = { type: "ticket_work" };
      expect(isContextRelevant(context, null)).toBe(false);
    });
  });

  describe("getContextSummary", () => {
    it("should generate summary for ticket_work context", () => {
      insertTestProject(db);
      insertTestTicket(db, "ticket-10", "proj-1", "in_progress");
      const context = detectContext(db, { ticketId: "ticket-10" });

      const summary = getContextSummary(context);

      expect(summary).toContain("ticket_work");
      expect(summary).toContain("ticket-10");
      expect(summary).toContain("in_progress");
    });

    it("should generate summary for review context", () => {
      insertTestProject(db);
      insertTestTicket(db, "ticket-11", "proj-1", "ai_review");
      const context = detectContext(db, { ticketId: "ticket-11" });

      const summary = getContextSummary(context);

      expect(summary).toContain("review");
      expect(summary).toContain("ai_review");
    });

    it("should generate summary for admin context without ticket", () => {
      const context = detectContext(db);

      const summary = getContextSummary(context);

      expect(summary).toContain("admin");
      expect(summary).not.toContain("Ticket");
    });

    it("should handle null context", () => {
      const summary = getContextSummary(null);
      expect(summary).toBe("Unknown context");
    });
  });

  describe("detectAllActiveContexts", () => {
    it("should return empty array when no active sessions", () => {
      const contexts = detectAllActiveContexts(db);
      expect(contexts).toEqual([]);
    });

    it("should return contexts for all active sessions", () => {
      insertTestProject(db, "proj-1");
      insertTestProject(db, "proj-2");
      insertTestTicket(db, "ticket-1", "proj-1", "in_progress");
      insertTestTicket(db, "ticket-2", "proj-2", "ai_review");
      insertTestSession(db, "session-1", "ticket-1", "proj-1");
      insertTestSession(db, "session-2", "ticket-2", "proj-2");

      const contexts = detectAllActiveContexts(db);

      expect(contexts).toHaveLength(2);
      expect(contexts[0].type).toBe("ticket_work");
      expect(contexts[1].type).toBe("review");
    });

    it("should not include ended sessions", () => {
      insertTestProject(db);
      insertTestTicket(db, "ticket-12", "proj-1", "in_progress");
      const sessionId = "session-3";
      insertTestSession(db, sessionId, "ticket-12", "proj-1");

      // End the session
      const now = new Date().toISOString();
      db.prepare("UPDATE conversation_sessions SET ended_at = ? WHERE id = ?").run(
        now,
        sessionId
      );

      const contexts = detectAllActiveContexts(db);

      expect(contexts).toHaveLength(0);
    });
  });

  describe("Context metadata structure", () => {
    it("should include stateFile structure for Ralph compatibility", () => {
      insertTestProject(db);
      insertTestTicket(db, "ticket-13", "proj-1", "in_progress");

      const context = detectContext(db, {
        ticketId: "ticket-13",
        sessionId: "test-session",
      });

      expect(context.metadata.stateFile).toBeDefined();
      expect(context.metadata.stateFile.sessionId).toBe("test-session");
      expect(context.metadata.stateFile.ticketId).toBe("ticket-13");
      expect(context.metadata.stateFile.currentState).toBe("implementing");
    });

    it("should use correct state for different context types", () => {
      insertTestProject(db);
      insertTestTicket(db, "ticket-14", "proj-1", "planning");
      insertTestTicket(db, "ticket-15", "proj-1", "ai_review");
      insertTestTicket(db, "ticket-16", "proj-1", "done");

      const planning = detectContext(db, { ticketId: "ticket-14" });
      const review = detectContext(db, { ticketId: "ticket-15" });
      const done = detectContext(db, { ticketId: "ticket-16" });

      expect(planning.metadata.stateFile.currentState).toBe("planning");
      expect(review.metadata.stateFile.currentState).toBe("reviewing");
      expect(done.metadata.stateFile.currentState).toBe("complete");
    });
  });
});
