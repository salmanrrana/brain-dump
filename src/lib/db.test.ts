import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

describe("Database Schema", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;

  beforeAll(() => {
    // Use in-memory database for tests
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    db = drizzle(sqlite, { schema });

    // Create tables
    sqlite.exec(`
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

      CREATE INDEX idx_epics_project ON epics(project_id);
      CREATE INDEX idx_tickets_project ON tickets(project_id);
      CREATE INDEX idx_tickets_epic ON tickets(epic_id);
      CREATE INDEX idx_tickets_status ON tickets(status);
    `);
  });

  afterAll(() => {
    sqlite.close();
  });

  it("should insert and query a project", () => {
    const projectId = randomUUID();
    db.insert(schema.projects)
      .values({
        id: projectId,
        name: "Test Project",
        path: "/tmp/test-project",
      })
      .run();

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();

    expect(project).toBeDefined();
    expect(project?.name).toBe("Test Project");
    expect(project?.path).toBe("/tmp/test-project");
  });

  it("should insert and query an epic with project reference", () => {
    const projectId = randomUUID();
    const epicId = randomUUID();

    db.insert(schema.projects)
      .values({
        id: projectId,
        name: "Epic Test Project",
        path: "/tmp/epic-test",
      })
      .run();

    db.insert(schema.epics)
      .values({
        id: epicId,
        title: "Test Epic",
        description: "A test epic",
        projectId: projectId,
      })
      .run();

    const epic = db.select().from(schema.epics).where(eq(schema.epics.id, epicId)).get();

    expect(epic).toBeDefined();
    expect(epic?.title).toBe("Test Epic");
    expect(epic?.projectId).toBe(projectId);
  });

  it("should insert and query a ticket", () => {
    const projectId = randomUUID();
    const ticketId = randomUUID();

    db.insert(schema.projects)
      .values({
        id: projectId,
        name: "Ticket Test Project",
        path: "/tmp/ticket-test",
      })
      .run();

    db.insert(schema.tickets)
      .values({
        id: ticketId,
        title: "Test Ticket",
        description: "A test ticket",
        projectId: projectId,
        position: 1.0,
        priority: "high",
        tags: JSON.stringify(["test", "bug"]),
      })
      .run();

    const ticket = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();

    expect(ticket).toBeDefined();
    expect(ticket?.title).toBe("Test Ticket");
    expect(ticket?.priority).toBe("high");
    expect(JSON.parse(ticket?.tags ?? "[]")).toEqual(["test", "bug"]);
  });

  it("should cascade delete epics when project is deleted", () => {
    const projectId = randomUUID();
    const epicId = randomUUID();

    db.insert(schema.projects)
      .values({
        id: projectId,
        name: "Cascade Test Project",
        path: "/tmp/cascade-test",
      })
      .run();

    db.insert(schema.epics)
      .values({
        id: epicId,
        title: "Cascade Test Epic",
        projectId: projectId,
      })
      .run();

    // Delete project
    db.delete(schema.projects).where(eq(schema.projects.id, projectId)).run();

    // Epic should be gone
    const epic = db.select().from(schema.epics).where(eq(schema.epics.id, epicId)).get();

    expect(epic).toBeUndefined();
  });
});
