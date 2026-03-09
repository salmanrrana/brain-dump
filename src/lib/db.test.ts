import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { startTelemetrySession } from "../../core/telemetry.ts";
import { ensureTelemetryTables, ensureTicketWorkflowColumns } from "./db-bootstrap";

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
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE epics (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        color TEXT,
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

  it("upgrades an older database by creating telemetry tables and preserving data", () => {
    const legacyDb = new Database(":memory:");
    legacyDb.pragma("foreign_keys = ON");

    legacyDb.exec(`
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
        completed_at TEXT
      );

      CREATE TABLE ticket_comments (
        id TEXT PRIMARY KEY NOT NULL,
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        author TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'comment',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX idx_epics_project ON epics(project_id);
      CREATE INDEX idx_tickets_project ON tickets(project_id);
      CREATE INDEX idx_tickets_epic ON tickets(epic_id);
      CREATE INDEX idx_tickets_status ON tickets(status);
      CREATE INDEX idx_comments_ticket ON ticket_comments(ticket_id);
    `);

    legacyDb
      .prepare("INSERT INTO projects (id, name, path) VALUES (?, ?, ?)")
      .run("project-1", "Legacy Project", "/tmp/legacy-project");
    legacyDb
      .prepare(
        `INSERT INTO tickets
          (id, title, status, priority, position, project_id, created_at, updated_at)
          VALUES (?, ?, 'in_progress', 'high', 1000, ?, datetime('now'), datetime('now'))`
      )
      .run("ticket-1", "Legacy Ticket", "project-1");
    legacyDb
      .prepare("INSERT INTO ticket_comments (id, ticket_id, content, author) VALUES (?, ?, ?, ?)")
      .run("comment-1", "ticket-1", "Existing comment", "tester");

    ensureTicketWorkflowColumns(legacyDb);
    ensureTelemetryTables(legacyDb);

    const tableNames = legacyDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('telemetry_sessions', 'telemetry_events') ORDER BY name"
      )
      .all() as Array<{ name: string }>;

    expect(tableNames.map((row) => row.name)).toEqual(["telemetry_events", "telemetry_sessions"]);

    const indexNames = legacyDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_telemetry_%' ORDER BY name"
      )
      .all() as Array<{ name: string }>;

    expect(indexNames.map((row) => row.name)).toEqual([
      "idx_telemetry_events_correlation",
      "idx_telemetry_events_created",
      "idx_telemetry_events_session",
      "idx_telemetry_events_ticket",
      "idx_telemetry_events_type",
      "idx_telemetry_sessions_project",
      "idx_telemetry_sessions_started",
      "idx_telemetry_sessions_ticket",
    ]);

    const ticketColumns = legacyDb.prepare("PRAGMA table_info(tickets)").all() as Array<{
      name: string;
    }>;

    expect(ticketColumns.map((column) => column.name)).toContain("branch_name");

    const preservedProject = legacyDb
      .prepare("SELECT id, name FROM projects WHERE id = ?")
      .get("project-1") as { id: string; name: string } | undefined;
    const preservedComment = legacyDb
      .prepare("SELECT id, content FROM ticket_comments WHERE id = ?")
      .get("comment-1") as { id: string; content: string } | undefined;

    expect(preservedProject).toEqual({ id: "project-1", name: "Legacy Project" });
    expect(preservedComment).toEqual({ id: "comment-1", content: "Existing comment" });

    expect(() =>
      startTelemetrySession(legacyDb, { ticketId: "ticket-1" }, () => "test-env")
    ).not.toThrow();

    const sessionCount = legacyDb
      .prepare("SELECT COUNT(*) as count FROM telemetry_sessions WHERE ticket_id = ?")
      .get("ticket-1") as { count: number };

    expect(sessionCount.count).toBe(1);

    legacyDb.close();
  });
});
