import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../lib/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

// We'll test the logic directly since server functions need a runtime
describe("Tickets API Logic", () => {
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
        linked_files TEXT, branch_name TEXT, pr_number INTEGER, pr_url TEXT, pr_status TEXT,
        attachments TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      );

      CREATE INDEX idx_tickets_project ON tickets(project_id);
      CREATE INDEX idx_tickets_epic ON tickets(epic_id);
      CREATE INDEX idx_tickets_status ON tickets(status);
    `);
  });

  afterAll(() => {
    sqlite.close();
  });

  beforeEach(() => {
    // Clear tables before each test
    sqlite.exec("DELETE FROM tickets");
    sqlite.exec("DELETE FROM epics");
    sqlite.exec("DELETE FROM projects");
  });

  // Helper functions
  const createTestProject = () => {
    const projectId = randomUUID();
    db.insert(schema.projects)
      .values({
        id: projectId,
        name: "Test Project",
        path: `/tmp/test-${projectId}`,
      })
      .run();
    return projectId;
  };

  const createTestEpic = (projectId: string) => {
    const epicId = randomUUID();
    db.insert(schema.epics)
      .values({
        id: epicId,
        title: "Test Epic",
        projectId,
      })
      .run();
    return epicId;
  };

  describe("getTickets", () => {
    it("should return empty array when no tickets exist", () => {
      const projectId = createTestProject();
      const result = db
        .select()
        .from(schema.tickets)
        .where(eq(schema.tickets.projectId, projectId))
        .all();
      expect(result).toEqual([]);
    });

    it("should return all tickets for a project", () => {
      const projectId = createTestProject();

      db.insert(schema.tickets)
        .values([
          { id: randomUUID(), title: "Ticket 1", projectId, position: 1 },
          { id: randomUUID(), title: "Ticket 2", projectId, position: 2 },
        ])
        .run();

      const result = db
        .select()
        .from(schema.tickets)
        .where(eq(schema.tickets.projectId, projectId))
        .all();
      expect(result).toHaveLength(2);
    });

    it("should filter by status", () => {
      const projectId = createTestProject();

      db.insert(schema.tickets)
        .values([
          {
            id: randomUUID(),
            title: "Backlog",
            projectId,
            position: 1,
            status: "backlog",
          },
          {
            id: randomUUID(),
            title: "In Progress",
            projectId,
            position: 2,
            status: "in_progress",
          },
        ])
        .run();

      const result = db
        .select()
        .from(schema.tickets)
        .where(and(eq(schema.tickets.projectId, projectId), eq(schema.tickets.status, "backlog")))
        .all();
      expect(result).toHaveLength(1);
      expect(result[0]?.title).toBe("Backlog");
    });

    it("should filter by epic", () => {
      const projectId = createTestProject();
      const epicId = createTestEpic(projectId);

      db.insert(schema.tickets)
        .values([
          {
            id: randomUUID(),
            title: "With Epic",
            projectId,
            epicId,
            position: 1,
          },
          {
            id: randomUUID(),
            title: "Without Epic",
            projectId,
            position: 2,
          },
        ])
        .run();

      const result = db
        .select()
        .from(schema.tickets)
        .where(eq(schema.tickets.epicId, epicId))
        .all();
      expect(result).toHaveLength(1);
      expect(result[0]?.title).toBe("With Epic");
    });
  });

  describe("getTicket", () => {
    it("should return a ticket by ID", () => {
      const projectId = createTestProject();
      const ticketId = randomUUID();

      db.insert(schema.tickets)
        .values({
          id: ticketId,
          title: "Test Ticket",
          description: "A test ticket",
          projectId,
          position: 1,
          priority: "high",
        })
        .run();

      const result = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
      expect(result).toBeDefined();
      expect(result?.title).toBe("Test Ticket");
      expect(result?.priority).toBe("high");
    });

    it("should return undefined for non-existent ID", () => {
      const result = db
        .select()
        .from(schema.tickets)
        .where(eq(schema.tickets.id, "non-existent"))
        .get();
      expect(result).toBeUndefined();
    });
  });

  describe("createTicket", () => {
    it("should create a ticket with required fields", () => {
      const projectId = createTestProject();
      const ticketId = randomUUID();

      db.insert(schema.tickets)
        .values({
          id: ticketId,
          title: "New Ticket",
          projectId,
          position: 1,
        })
        .run();

      const result = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
      expect(result).toBeDefined();
      expect(result?.title).toBe("New Ticket");
      expect(result?.status).toBe("backlog");
    });

    it("should create a ticket with all optional fields", () => {
      const projectId = createTestProject();
      const epicId = createTestEpic(projectId);
      const ticketId = randomUUID();

      db.insert(schema.tickets)
        .values({
          id: ticketId,
          title: "Full Ticket",
          description: "A detailed description",
          projectId,
          epicId,
          position: 1,
          priority: "high",
          tags: JSON.stringify(["bug", "urgent"]),
        })
        .run();

      const result = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
      expect(result).toBeDefined();
      expect(result?.title).toBe("Full Ticket");
      expect(result?.description).toBe("A detailed description");
      expect(result?.epicId).toBe(epicId);
      expect(result?.priority).toBe("high");
      expect(JSON.parse(result?.tags ?? "[]")).toEqual(["bug", "urgent"]);
    });

    it("should fail to create ticket for non-existent project", () => {
      const ticketId = randomUUID();

      expect(() => {
        db.insert(schema.tickets)
          .values({
            id: ticketId,
            title: "Orphan Ticket",
            projectId: "non-existent",
            position: 1,
          })
          .run();
      }).toThrow();
    });
  });

  describe("updateTicket", () => {
    it("should update ticket title", () => {
      const projectId = createTestProject();
      const ticketId = randomUUID();

      db.insert(schema.tickets)
        .values({
          id: ticketId,
          title: "Original Title",
          projectId,
          position: 1,
        })
        .run();

      db.update(schema.tickets)
        .set({ title: "Updated Title" })
        .where(eq(schema.tickets.id, ticketId))
        .run();

      const result = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
      expect(result?.title).toBe("Updated Title");
    });

    it("should update ticket status", () => {
      const projectId = createTestProject();
      const ticketId = randomUUID();

      db.insert(schema.tickets)
        .values({
          id: ticketId,
          title: "Ticket",
          projectId,
          position: 1,
        })
        .run();

      db.update(schema.tickets)
        .set({ status: "in_progress" })
        .where(eq(schema.tickets.id, ticketId))
        .run();

      const result = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
      expect(result?.status).toBe("in_progress");
    });

    it("should update ticket subtasks", () => {
      const projectId = createTestProject();
      const ticketId = randomUUID();

      db.insert(schema.tickets)
        .values({
          id: ticketId,
          title: "Ticket",
          projectId,
          position: 1,
        })
        .run();

      const subtasks = [
        { id: "1", text: "Subtask 1", completed: false },
        { id: "2", text: "Subtask 2", completed: true },
      ];

      db.update(schema.tickets)
        .set({ subtasks: JSON.stringify(subtasks) })
        .where(eq(schema.tickets.id, ticketId))
        .run();

      const result = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
      expect(JSON.parse(result?.subtasks ?? "[]")).toEqual(subtasks);
    });

    it("should update blocked status", () => {
      const projectId = createTestProject();
      const ticketId = randomUUID();

      db.insert(schema.tickets)
        .values({
          id: ticketId,
          title: "Ticket",
          projectId,
          position: 1,
        })
        .run();

      db.update(schema.tickets)
        .set({ isBlocked: true, blockedReason: "Waiting for design" })
        .where(eq(schema.tickets.id, ticketId))
        .run();

      const result = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
      expect(result?.isBlocked).toBe(true);
      expect(result?.blockedReason).toBe("Waiting for design");
    });
  });

  describe("updateTicketStatus", () => {
    it("should update only the status field", () => {
      const projectId = createTestProject();
      const ticketId = randomUUID();

      db.insert(schema.tickets)
        .values({
          id: ticketId,
          title: "Ticket",
          description: "Description",
          projectId,
          position: 1,
        })
        .run();

      db.update(schema.tickets)
        .set({ status: "ai_review" })
        .where(eq(schema.tickets.id, ticketId))
        .run();

      const result = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
      expect(result?.status).toBe("ai_review");
      expect(result?.title).toBe("Ticket");
      expect(result?.description).toBe("Description");
    });

    it("should set completedAt when status is done", () => {
      const projectId = createTestProject();
      const ticketId = randomUUID();

      db.insert(schema.tickets)
        .values({
          id: ticketId,
          title: "Ticket",
          projectId,
          position: 1,
        })
        .run();

      const completedAt = new Date().toISOString();
      db.update(schema.tickets)
        .set({ status: "done", completedAt })
        .where(eq(schema.tickets.id, ticketId))
        .run();

      const result = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
      expect(result?.status).toBe("done");
      expect(result?.completedAt).toBeDefined();
    });
  });

  describe("updateTicketPosition", () => {
    it("should update only the position field", () => {
      const projectId = createTestProject();
      const ticketId = randomUUID();

      db.insert(schema.tickets)
        .values({
          id: ticketId,
          title: "Ticket",
          projectId,
          position: 1,
        })
        .run();

      db.update(schema.tickets).set({ position: 5.5 }).where(eq(schema.tickets.id, ticketId)).run();

      const result = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
      expect(result?.position).toBe(5.5);
    });

    it("should allow fractional positions for ordering", () => {
      const projectId = createTestProject();

      db.insert(schema.tickets)
        .values([
          { id: randomUUID(), title: "Ticket 1", projectId, position: 1 },
          { id: randomUUID(), title: "Ticket 2", projectId, position: 2 },
          { id: randomUUID(), title: "Ticket 3", projectId, position: 1.5 },
        ])
        .run();

      const result = db
        .select()
        .from(schema.tickets)
        .where(eq(schema.tickets.projectId, projectId))
        .orderBy(schema.tickets.position)
        .all();

      expect(result).toHaveLength(3);
      expect(result[0]?.title).toBe("Ticket 1");
      expect(result[1]?.title).toBe("Ticket 3");
      expect(result[2]?.title).toBe("Ticket 2");
    });
  });

  describe("deleteTicket", () => {
    it("should delete a ticket", () => {
      const projectId = createTestProject();
      const ticketId = randomUUID();

      db.insert(schema.tickets)
        .values({
          id: ticketId,
          title: "To Delete",
          projectId,
          position: 1,
        })
        .run();

      db.delete(schema.tickets).where(eq(schema.tickets.id, ticketId)).run();

      const result = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
      expect(result).toBeUndefined();
    });
  });

  describe("cascade behaviors", () => {
    it("should delete tickets when project is deleted", () => {
      const projectId = createTestProject();
      const ticketId = randomUUID();

      db.insert(schema.tickets)
        .values({
          id: ticketId,
          title: "Ticket",
          projectId,
          position: 1,
        })
        .run();

      db.delete(schema.projects).where(eq(schema.projects.id, projectId)).run();

      const ticket = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
      expect(ticket).toBeUndefined();
    });

    it("should set epic_id to null when epic is deleted", () => {
      const projectId = createTestProject();
      const epicId = createTestEpic(projectId);
      const ticketId = randomUUID();

      db.insert(schema.tickets)
        .values({
          id: ticketId,
          title: "Ticket",
          projectId,
          epicId,
          position: 1,
        })
        .run();

      db.delete(schema.epics).where(eq(schema.epics.id, epicId)).run();

      const ticket = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
      expect(ticket).toBeDefined();
      expect(ticket?.epicId).toBeNull();
    });
  });
});
