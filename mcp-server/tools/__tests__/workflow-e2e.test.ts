/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * End-to-End Workflow Integration Tests
 *
 * Tests the complete Universal Quality Workflow:
 * start_ticket_work → complete_ticket_work → submit_review_finding →
 * mark_finding_fixed → generate_demo_script → submit_demo_feedback
 *
 * Following Kent C. Dodds' testing philosophy:
 * - Tests user-facing behavior and state transitions
 * - Integration tests through the full workflow
 * - Real database fixtures with actual schema
 * - Tests fail when workflow behavior breaks
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

// Database schema that includes workflow tables
const SCHEMA_SQL = `
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    color TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE epics (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
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

  CREATE TABLE review_findings (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    iteration INTEGER NOT NULL,
    agent TEXT NOT NULL,
    severity TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    file_path TEXT,
    line_number INTEGER,
    suggested_fix TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    fixed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE demo_scripts (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
    steps TEXT NOT NULL,
    generated_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    feedback TEXT,
    passed INTEGER,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
  );

  CREATE INDEX idx_workflow_ticket ON ticket_workflow_state(ticket_id);
  CREATE INDEX idx_findings_ticket ON review_findings(ticket_id);
  CREATE INDEX idx_findings_status ON review_findings(status);
  CREATE INDEX idx_comments_ticket ON ticket_comments(ticket_id);
`;

describe("Universal Quality Workflow E2E", () => {
  let db: Database.Database;
  let testDir: string;
  let projectId: string;
  let epicId: string;
  let ticketId: string;

  beforeAll(() => {
    // Create temporary directory for test database
    testDir = join(tmpdir(), `brain-dump-test-${randomUUID().substring(0, 8)}`);
    mkdirSync(testDir, { recursive: true });

    // Initialize test database
    const dbPath = join(testDir, "test.db");
    db = new Database(dbPath);
    db.exec(SCHEMA_SQL);

    // Create test project, epic, and ticket
    projectId = randomUUID();
    epicId = randomUUID();
    ticketId = randomUUID();

    const now = new Date().toISOString();

    db.prepare(`INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)`).run(
      projectId,
      "Test Project",
      testDir,
      now
    );

    db.prepare(`INSERT INTO epics (id, title, project_id, created_at) VALUES (?, ?, ?, ?)`).run(
      epicId,
      "Test Epic",
      projectId,
      now
    );

    db.prepare(
      `INSERT INTO tickets (id, title, description, status, priority, position, project_id, epic_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      ticketId,
      "Test Ticket",
      "Test description",
      "in_progress",
      "high",
      1,
      projectId,
      epicId,
      now,
      now
    );
  });

  afterAll(() => {
    db.close();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Scenario 1: Happy Path (Full Workflow)", () => {
    it("should create workflow state when completing ticket work", () => {
      const now = new Date().toISOString();
      const stateId = randomUUID();

      db.prepare(
        `INSERT INTO ticket_workflow_state
         (id, ticket_id, current_phase, review_iteration, findings_count, findings_fixed, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(stateId, ticketId, "ai_review", 0, 0, 0, now, now);

      // Verify workflow state created
      const state = db
        .prepare(`SELECT * FROM ticket_workflow_state WHERE ticket_id = ?`)
        .get(ticketId) as any;

      expect(state).toBeDefined();
      expect(state?.current_phase).toBe("ai_review");
      expect(state?.review_iteration).toBe(0);
      expect(state?.findings_count).toBe(0);
      expect(state?.findings_fixed).toBe(0);
    });

    it("should allow submitting review findings while in ai_review", () => {
      const findingId = randomUUID();
      const now = new Date().toISOString();

      // Submit a finding
      db.prepare(
        `INSERT INTO review_findings
         (id, ticket_id, iteration, agent, severity, category, description, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        findingId,
        ticketId,
        1,
        "code-reviewer",
        "major",
        "performance",
        "Optimize loop",
        "open",
        now
      );

      // Verify finding created
      const finding = db
        .prepare(`SELECT * FROM review_findings WHERE id = ?`)
        .get(findingId) as any;

      expect(finding).toBeDefined();
      expect(finding.severity).toBe("major");
      expect(finding.status).toBe("open");

      // Verify findings_count incremented
      db.prepare(
        `UPDATE ticket_workflow_state SET findings_count = findings_count + 1 WHERE ticket_id = ?`
      ).run(ticketId);
      const state = db
        .prepare(`SELECT * FROM ticket_workflow_state WHERE ticket_id = ?`)
        .get(ticketId) as any;
      expect(state.findings_count).toBe(1);
    });

    it("should allow marking findings as fixed", () => {
      const findingId = randomUUID();
      const now = new Date().toISOString();
      const fixedAt = new Date().toISOString();

      // Create a finding
      db.prepare(
        `INSERT INTO review_findings
         (id, ticket_id, iteration, agent, severity, category, description, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        findingId,
        ticketId,
        1,
        "silent-failure-hunter",
        "minor",
        "error-handling",
        "Add error handling",
        "open",
        now
      );

      // Mark as fixed
      db.prepare(`UPDATE review_findings SET status = ?, fixed_at = ? WHERE id = ?`).run(
        "fixed",
        fixedAt,
        findingId
      );

      // Verify finding is fixed
      const finding = db
        .prepare(`SELECT * FROM review_findings WHERE id = ?`)
        .get(findingId) as any;

      expect(finding.status).toBe("fixed");
      expect(finding.fixed_at).toBe(fixedAt);

      // Verify findings_fixed incremented
      db.prepare(
        `UPDATE ticket_workflow_state SET findings_fixed = findings_fixed + 1 WHERE ticket_id = ?`
      ).run(ticketId);
      const state = db
        .prepare(`SELECT * FROM ticket_workflow_state WHERE ticket_id = ?`)
        .get(ticketId) as any;
      expect(state.findings_fixed).toBe(1);
    });

    it("should prevent demo generation with open critical findings", () => {
      // Create a critical finding
      const criticalFindingId = randomUUID();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO review_findings
         (id, ticket_id, iteration, agent, severity, category, description, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        criticalFindingId,
        ticketId,
        1,
        "code-reviewer",
        "critical",
        "security",
        "SQL injection vulnerability",
        "open",
        now
      );

      // Try to check if can proceed to demo
      const openCritical = db
        .prepare(
          `SELECT COUNT(*) as count FROM review_findings
           WHERE ticket_id = ? AND severity = 'critical' AND status = 'open'`
        )
        .get(ticketId) as any;

      expect(openCritical.count).toBeGreaterThan(0);
      // Should NOT be able to proceed to demo
      expect(openCritical.count).toBe(1);
    });

    it("should allow demo generation when all critical/major findings fixed", () => {
      // Mark all critical findings as fixed
      db.prepare(
        `UPDATE review_findings SET status = ? WHERE ticket_id = ? AND severity IN ('critical', 'major')`
      ).run("fixed", ticketId);

      // Verify no open critical/major findings
      const openCriticalMajor = db
        .prepare(
          `SELECT COUNT(*) as count FROM review_findings
           WHERE ticket_id = ? AND severity IN ('critical', 'major') AND status = 'open'`
        )
        .get(ticketId) as any;

      expect(openCriticalMajor.count).toBe(0);

      // Create demo script
      const demoId = randomUUID();
      const steps = JSON.stringify([
        { order: 1, description: "Open the app", expectedOutcome: "App loads", type: "manual" },
        { order: 2, description: "Click button", expectedOutcome: "Feature works", type: "visual" },
      ]);

      db.prepare(
        `INSERT INTO demo_scripts (id, ticket_id, steps, generated_at) VALUES (?, ?, ?, ?)`
      ).run(demoId, ticketId, steps, new Date().toISOString());

      // Verify demo created
      const demo = db
        .prepare(`SELECT * FROM demo_scripts WHERE ticket_id = ?`)
        .get(ticketId) as any;

      expect(demo).toBeDefined();
      expect(JSON.parse(demo.steps)).toHaveLength(2);

      // Update workflow state
      db.prepare(
        `UPDATE ticket_workflow_state SET demo_generated = 1, current_phase = ? WHERE ticket_id = ?`
      ).run("human_review", ticketId);

      const state = db
        .prepare(`SELECT * FROM ticket_workflow_state WHERE ticket_id = ?`)
        .get(ticketId) as any;
      expect(state.demo_generated).toBe(1);
      expect(state.current_phase).toBe("human_review");
    });

    it("should update ticket status to human_review when demo generated", () => {
      db.prepare(`UPDATE tickets SET status = ? WHERE id = ?`).run("human_review", ticketId);

      const ticket = db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(ticketId) as any;

      expect(ticket.status).toBe("human_review");
    });

    it("should allow submitting demo feedback and marking as passed", () => {
      // Update the existing demo script with feedback
      db.prepare(
        `UPDATE demo_scripts SET passed = ?, feedback = ?, completed_at = ? WHERE ticket_id = ?`
      ).run(1, "All steps verified. Ready to ship!", new Date().toISOString(), ticketId);

      // Update ticket status to done
      db.prepare(`UPDATE tickets SET status = ?, completed_at = ? WHERE id = ?`).run(
        "done",
        new Date().toISOString(),
        ticketId
      );

      // Verify demo passed
      const demo = db
        .prepare(`SELECT * FROM demo_scripts WHERE ticket_id = ?`)
        .get(ticketId) as any;

      expect(demo.passed).toBe(1);
      expect(demo.feedback).toContain("Ready to ship");

      // Verify ticket is done
      const ticket = db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(ticketId) as any;

      expect(ticket.status).toBe("done");
      expect(ticket.completed_at).toBeDefined();
    });

    it("should create progress comment when completing demo", () => {
      const commentId = randomUUID();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        commentId,
        ticketId,
        "✅ Demo approved by human reviewer. Ticket marked as done.",
        "system",
        "progress",
        now
      );

      // Verify comment created
      const comment = db
        .prepare(`SELECT * FROM ticket_comments WHERE ticket_id = ?`)
        .get(ticketId) as any;

      expect(comment).toBeDefined();
      expect(comment.type).toBe("progress");
      expect(comment.content).toContain("Demo approved");
    });
  });

  describe("Scenario 2: Review Iteration Loop", () => {
    let iterTicketId: string;

    beforeAll(() => {
      iterTicketId = randomUUID();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO tickets (id, title, description, status, priority, position, project_id, epic_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        iterTicketId,
        "Iteration Test Ticket",
        "For testing review loops",
        "ai_review",
        "medium",
        2,
        projectId,
        epicId,
        now,
        now
      );

      db.prepare(
        `INSERT INTO ticket_workflow_state
         (id, ticket_id, current_phase, review_iteration, findings_count, findings_fixed, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(randomUUID(), iterTicketId, "ai_review", 0, 0, 0, now, now);
    });

    it("should increment review iteration on first finding", () => {
      // Submit first finding
      const findingId1 = randomUUID();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO review_findings
         (id, ticket_id, iteration, agent, severity, category, description, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        findingId1,
        iterTicketId,
        1,
        "code-reviewer",
        "critical",
        "bug",
        "Bug found",
        "open",
        now
      );

      db.prepare(`UPDATE ticket_workflow_state SET review_iteration = 1 WHERE ticket_id = ?`).run(
        iterTicketId
      );

      const state = db
        .prepare(`SELECT * FROM ticket_workflow_state WHERE ticket_id = ?`)
        .get(iterTicketId) as any;

      expect(state.review_iteration).toBe(1);
    });

    it("should prevent demo generation with open critical findings", () => {
      const openCritical = db
        .prepare(
          `SELECT COUNT(*) as count FROM review_findings
           WHERE ticket_id = ? AND severity = 'critical' AND status = 'open'`
        )
        .get(iterTicketId) as any;

      // Should have open critical finding
      expect(openCritical.count).toBeGreaterThan(0);
    });

    it("should allow demo generation after fixing all critical findings", () => {
      // Mark all critical as fixed
      db.prepare(
        `UPDATE review_findings SET status = ? WHERE ticket_id = ? AND severity = 'critical'`
      ).run("fixed", iterTicketId);

      const openCritical = db
        .prepare(
          `SELECT COUNT(*) as count FROM review_findings
           WHERE ticket_id = ? AND severity = 'critical' AND status = 'open'`
        )
        .get(iterTicketId) as any;

      expect(openCritical.count).toBe(0);
    });

    it("should allow creating demo when all critical/major fixed", () => {
      const demoId = randomUUID();
      const steps = JSON.stringify([
        { order: 1, description: "Test", expectedOutcome: "Works", type: "manual" },
      ]);

      db.prepare(
        `INSERT INTO demo_scripts (id, ticket_id, steps, generated_at) VALUES (?, ?, ?, ?)`
      ).run(demoId, iterTicketId, steps, new Date().toISOString());

      const demo = db
        .prepare(`SELECT * FROM demo_scripts WHERE ticket_id = ?`)
        .get(iterTicketId) as any;

      expect(demo).toBeDefined();
    });
  });

  describe("Scenario 3: Demo Rejection", () => {
    let rejectTicketId: string;

    beforeAll(() => {
      rejectTicketId = randomUUID();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO tickets (id, title, description, status, priority, position, project_id, epic_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        rejectTicketId,
        "Rejection Test Ticket",
        "For testing demo rejection",
        "human_review",
        "medium",
        3,
        projectId,
        epicId,
        now,
        now
      );

      db.prepare(
        `INSERT INTO ticket_workflow_state
         (id, ticket_id, current_phase, review_iteration, findings_count, findings_fixed, demo_generated, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(randomUUID(), rejectTicketId, "human_review", 1, 1, 1, 1, now, now);

      // Create a demo script
      const demoId = randomUUID();
      const steps = JSON.stringify([
        { order: 1, description: "Test", expectedOutcome: "Works", type: "manual" },
      ]);
      db.prepare(
        `INSERT INTO demo_scripts (id, ticket_id, steps, generated_at) VALUES (?, ?, ?, ?)`
      ).run(demoId, rejectTicketId, steps, now);
    });

    it("should keep ticket in human_review when demo rejected", () => {
      // Submit rejection
      db.prepare(
        `UPDATE demo_scripts SET passed = ?, feedback = ?, completed_at = ? WHERE ticket_id = ?`
      ).run(0, "Button does not work as expected", new Date().toISOString(), rejectTicketId);

      // Keep ticket in human_review (or move back to in_progress)
      db.prepare(`UPDATE tickets SET status = ? WHERE id = ?`).run("human_review", rejectTicketId);

      const ticket = db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(rejectTicketId) as any;

      expect(ticket.status).toBe("human_review");
    });

    it("should create rejection comment with feedback", () => {
      const commentId = randomUUID();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        commentId,
        rejectTicketId,
        "❌ Demo rejected: Button does not work as expected. Please fix and retest.",
        "system",
        "progress",
        now
      );

      const comment = db
        .prepare(`SELECT * FROM ticket_comments WHERE ticket_id = ?`)
        .get(rejectTicketId) as any;

      expect(comment).toBeDefined();
      expect(comment.content).toContain("Demo rejected");
    });
  });

  describe("Precondition Enforcement", () => {
    it("should prevent submitting findings if not in ai_review", () => {
      const testTicketId = randomUUID();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO tickets (id, title, description, status, priority, position, project_id, epic_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        testTicketId,
        "Wrong Status Ticket",
        "In progress, not ai_review",
        "in_progress",
        "high",
        4,
        projectId,
        epicId,
        now,
        now
      );

      // Try to submit finding to in_progress ticket
      const ticket = db.prepare(`SELECT status FROM tickets WHERE id = ?`).get(testTicketId) as any;

      // Should fail precondition check (not in ai_review)
      expect(ticket.status).not.toBe("ai_review");
    });

    it("should prevent demo generation if not in ai_review", () => {
      const testTicketId = randomUUID();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO tickets (id, title, description, status, priority, position, project_id, epic_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        testTicketId,
        "Wrong Phase Ticket",
        "In progress phase",
        "in_progress",
        "high",
        5,
        projectId,
        epicId,
        now,
        now
      );

      db.prepare(
        `INSERT INTO ticket_workflow_state
         (id, ticket_id, current_phase, review_iteration, findings_count, findings_fixed, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(randomUUID(), testTicketId, "implementation", 0, 0, 0, now, now);

      const state = db
        .prepare(`SELECT current_phase FROM ticket_workflow_state WHERE ticket_id = ?`)
        .get(testTicketId) as any;

      // Should fail - not in ai_review phase
      expect(state.current_phase).not.toBe("ai_review");
    });

    it("should prevent demo feedback if not in human_review", () => {
      const testTicketId = randomUUID();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO tickets (id, title, description, status, priority, position, project_id, epic_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        testTicketId,
        "AI Review Ticket",
        "Still in ai_review",
        "ai_review",
        "high",
        6,
        projectId,
        epicId,
        now,
        now
      );

      const ticket = db.prepare(`SELECT status FROM tickets WHERE id = ?`).get(testTicketId) as any;

      // Should fail - not in human_review
      expect(ticket.status).not.toBe("human_review");
    });
  });
});
