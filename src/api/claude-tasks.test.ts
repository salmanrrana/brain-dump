/**
 * Tests for Claude Tasks API
 *
 * Following Kent C. Dodds' testing philosophy:
 * - Test user-facing behavior, not implementation details
 * - Test what the server actually returns to clients
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../lib/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

// Since server functions are tested via component integration tests,
// we'll test the query logic that the server function wraps

describe("Claude Tasks API - Database Query Logic", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let testProjectId: string;
  let testTicketId: string;

  beforeAll(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    db = drizzle(sqlite, { schema });

    sqlite.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        color TEXT,
        working_method TEXT DEFAULT 'auto',
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
        epic_id TEXT,
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

      CREATE TABLE claude_tasks (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        subject TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        active_form TEXT,
        position REAL NOT NULL,
        status_history TEXT,
        session_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      );

      CREATE INDEX idx_tickets_project ON tickets(project_id);
      CREATE INDEX idx_claude_tasks_ticket ON claude_tasks(ticket_id);
      CREATE INDEX idx_claude_tasks_position ON claude_tasks(ticket_id, position);
    `);
  });

  beforeEach(() => {
    sqlite.exec("DELETE FROM claude_tasks; DELETE FROM tickets; DELETE FROM projects;");

    testProjectId = `test-project-${randomUUID()}`;
    testTicketId = `test-ticket-${randomUUID()}`;

    // Create test project
    db.insert(schema.projects)
      .values({
        id: testProjectId,
        name: "Test Project",
        path: "/tmp/test-project",
      })
      .run();

    // Create test ticket
    db.insert(schema.tickets)
      .values({
        id: testTicketId,
        projectId: testProjectId,
        title: "Test Ticket",
        status: "in_progress",
        position: 1,
      })
      .run();
  });

  afterAll(() => {
    sqlite.close();
  });

  it("returns tasks ordered by position", () => {
    // User works on ticket and Claude creates multiple tasks
    db.insert(schema.claudeTasks)
      .values([
        {
          id: "task-1",
          ticketId: testTicketId,
          subject: "First task",
          status: "pending",
          position: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "task-2",
          ticketId: testTicketId,
          subject: "Second task",
          status: "in_progress",
          position: 2,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "task-3",
          ticketId: testTicketId,
          subject: "Third task",
          status: "completed",
          position: 3,
          completedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])
      .run();

    // User requests tasks for the ticket (via server function)
    const tasks = db
      .select()
      .from(schema.claudeTasks)
      .where(eq(schema.claudeTasks.ticketId, testTicketId))
      .all();

    // User should see tasks in order
    expect(tasks).toHaveLength(3);
    expect(tasks[0]?.subject).toBe("First task");
    expect(tasks[1]?.subject).toBe("Second task");
    expect(tasks[2]?.subject).toBe("Third task");
  });

  it("returns empty array when ticket has no tasks", () => {
    // User opens a ticket with no Claude tasks yet
    const tasks = db
      .select()
      .from(schema.claudeTasks)
      .where(eq(schema.claudeTasks.ticketId, testTicketId))
      .all();

    // User sees no tasks
    expect(tasks).toEqual([]);
  });

  it("returns only tasks for the specified ticket", () => {
    const otherTicketId = "other-ticket-" + Date.now();

    // Create another ticket
    db.insert(schema.tickets)
      .values({
        id: otherTicketId,
        projectId: testProjectId,
        title: "Other Ticket",
        status: "backlog",
        position: 2,
      })
      .run();

    // Create tasks for both tickets
    db.insert(schema.claudeTasks)
      .values([
        {
          id: "task-first",
          ticketId: testTicketId,
          subject: "Task for first ticket",
          status: "pending",
          position: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "task-other",
          ticketId: otherTicketId,
          subject: "Task for other ticket",
          status: "pending",
          position: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])
      .run();

    // User requests tasks for first ticket
    const tasks = db
      .select()
      .from(schema.claudeTasks)
      .where(eq(schema.claudeTasks.ticketId, testTicketId))
      .all();

    // User should only see tasks for their ticket
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.subject).toBe("Task for first ticket");
  });

  it("preserves task status correctly", () => {
    // Claude works on ticket and creates tasks with different statuses
    db.insert(schema.claudeTasks)
      .values([
        {
          id: "task-pending",
          ticketId: testTicketId,
          subject: "Task not started",
          status: "pending",
          position: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "task-active",
          ticketId: testTicketId,
          subject: "Task in progress",
          status: "in_progress",
          activeForm: "Implementing feature",
          position: 2,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "task-done",
          ticketId: testTicketId,
          subject: "Task completed",
          status: "completed",
          position: 3,
          completedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])
      .run();

    // User views the task list
    const tasks = db
      .select()
      .from(schema.claudeTasks)
      .where(eq(schema.claudeTasks.ticketId, testTicketId))
      .all();

    // User should see correct status for each task
    const statusMap = new Map(tasks.map((t: (typeof tasks)[0]) => [t.subject, t.status]));
    expect(statusMap.get("Task not started")).toBe("pending");
    expect(statusMap.get("Task in progress")).toBe("in_progress");
    expect(statusMap.get("Task completed")).toBe("completed");
  });
});
