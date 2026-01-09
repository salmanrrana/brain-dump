import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../lib/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

// We'll test the logic directly since server functions need a runtime
describe("Epics API Logic", () => {
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
    `);
  });

  afterAll(() => {
    sqlite.close();
  });

  beforeEach(() => {
    // Clear tables before each test (order matters due to FK constraints)
    sqlite.exec("DELETE FROM tickets");
    sqlite.exec("DELETE FROM epics");
    sqlite.exec("DELETE FROM projects");
  });

  // Helper to create a project for tests
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

  describe("getEpicsByProject", () => {
    it("should return empty array when no epics exist for project", () => {
      const projectId = createTestProject();
      const result = db
        .select()
        .from(schema.epics)
        .where(eq(schema.epics.projectId, projectId))
        .all();
      expect(result).toEqual([]);
    });

    it("should return all epics for a project", () => {
      const projectId = createTestProject();
      const epicId1 = randomUUID();
      const epicId2 = randomUUID();

      db.insert(schema.epics)
        .values([
          { id: epicId1, title: "Epic 1", projectId },
          { id: epicId2, title: "Epic 2", projectId },
        ])
        .run();

      const result = db
        .select()
        .from(schema.epics)
        .where(eq(schema.epics.projectId, projectId))
        .all();
      expect(result).toHaveLength(2);
    });

    it("should not return epics from other projects", () => {
      const projectId1 = createTestProject();
      const projectId2 = randomUUID();
      db.insert(schema.projects)
        .values({
          id: projectId2,
          name: "Other Project",
          path: `/tmp/other-${projectId2}`,
        })
        .run();

      const epicId1 = randomUUID();
      const epicId2 = randomUUID();

      db.insert(schema.epics)
        .values([
          { id: epicId1, title: "Epic 1", projectId: projectId1 },
          { id: epicId2, title: "Epic 2", projectId: projectId2 },
        ])
        .run();

      const result = db
        .select()
        .from(schema.epics)
        .where(eq(schema.epics.projectId, projectId1))
        .all();
      expect(result).toHaveLength(1);
      expect(result[0]?.title).toBe("Epic 1");
    });
  });

  describe("getEpic", () => {
    it("should return an epic by ID", () => {
      const projectId = createTestProject();
      const epicId = randomUUID();

      db.insert(schema.epics)
        .values({
          id: epicId,
          title: "Test Epic",
          description: "A test epic",
          projectId,
        })
        .run();

      const result = db
        .select()
        .from(schema.epics)
        .where(eq(schema.epics.id, epicId))
        .get();
      expect(result).toBeDefined();
      expect(result?.title).toBe("Test Epic");
      expect(result?.description).toBe("A test epic");
    });

    it("should return undefined for non-existent ID", () => {
      const result = db
        .select()
        .from(schema.epics)
        .where(eq(schema.epics.id, "non-existent"))
        .get();
      expect(result).toBeUndefined();
    });
  });

  describe("createEpic", () => {
    it("should create an epic with valid input", () => {
      const projectId = createTestProject();
      const epicId = randomUUID();

      db.insert(schema.epics)
        .values({
          id: epicId,
          title: "New Epic",
          description: "Epic description",
          projectId,
          color: "#ff0000",
        })
        .run();

      const result = db
        .select()
        .from(schema.epics)
        .where(eq(schema.epics.id, epicId))
        .get();
      expect(result).toBeDefined();
      expect(result?.title).toBe("New Epic");
      expect(result?.description).toBe("Epic description");
      expect(result?.color).toBe("#ff0000");
      expect(result?.projectId).toBe(projectId);
    });

    it("should create an epic without optional fields", () => {
      const projectId = createTestProject();
      const epicId = randomUUID();

      db.insert(schema.epics)
        .values({
          id: epicId,
          title: "Minimal Epic",
          projectId,
        })
        .run();

      const result = db
        .select()
        .from(schema.epics)
        .where(eq(schema.epics.id, epicId))
        .get();
      expect(result).toBeDefined();
      expect(result?.title).toBe("Minimal Epic");
      expect(result?.description).toBeNull();
      expect(result?.color).toBeNull();
    });

    it("should fail to create epic for non-existent project", () => {
      const epicId = randomUUID();

      expect(() => {
        db.insert(schema.epics)
          .values({
            id: epicId,
            title: "Orphan Epic",
            projectId: "non-existent",
          })
          .run();
      }).toThrow();
    });
  });

  describe("updateEpic", () => {
    it("should update epic title", () => {
      const projectId = createTestProject();
      const epicId = randomUUID();

      db.insert(schema.epics)
        .values({
          id: epicId,
          title: "Original Title",
          projectId,
        })
        .run();

      db.update(schema.epics)
        .set({ title: "Updated Title" })
        .where(eq(schema.epics.id, epicId))
        .run();

      const result = db
        .select()
        .from(schema.epics)
        .where(eq(schema.epics.id, epicId))
        .get();
      expect(result?.title).toBe("Updated Title");
    });

    it("should update epic description", () => {
      const projectId = createTestProject();
      const epicId = randomUUID();

      db.insert(schema.epics)
        .values({
          id: epicId,
          title: "Epic",
          projectId,
        })
        .run();

      db.update(schema.epics)
        .set({ description: "New description" })
        .where(eq(schema.epics.id, epicId))
        .run();

      const result = db
        .select()
        .from(schema.epics)
        .where(eq(schema.epics.id, epicId))
        .get();
      expect(result?.description).toBe("New description");
    });

    it("should update epic color", () => {
      const projectId = createTestProject();
      const epicId = randomUUID();

      db.insert(schema.epics)
        .values({
          id: epicId,
          title: "Epic",
          projectId,
        })
        .run();

      db.update(schema.epics)
        .set({ color: "#00ff00" })
        .where(eq(schema.epics.id, epicId))
        .run();

      const result = db
        .select()
        .from(schema.epics)
        .where(eq(schema.epics.id, epicId))
        .get();
      expect(result?.color).toBe("#00ff00");
    });
  });

  describe("deleteEpic", () => {
    it("should delete an epic", () => {
      const projectId = createTestProject();
      const epicId = randomUUID();

      db.insert(schema.epics)
        .values({
          id: epicId,
          title: "To Delete",
          projectId,
        })
        .run();

      db.delete(schema.epics).where(eq(schema.epics.id, epicId)).run();

      const result = db
        .select()
        .from(schema.epics)
        .where(eq(schema.epics.id, epicId))
        .get();
      expect(result).toBeUndefined();
    });

    it("should set epic_id to null on tickets when epic is deleted", () => {
      const projectId = createTestProject();
      const epicId = randomUUID();
      const ticketId = randomUUID();

      db.insert(schema.epics)
        .values({
          id: epicId,
          title: "Epic with Tickets",
          projectId,
        })
        .run();

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

      const ticket = db
        .select()
        .from(schema.tickets)
        .where(eq(schema.tickets.id, ticketId))
        .get();
      expect(ticket).toBeDefined();
      expect(ticket?.epicId).toBeNull();
    });
  });

  describe("cascade delete", () => {
    it("should delete epics when project is deleted", () => {
      const projectId = createTestProject();
      const epicId = randomUUID();

      db.insert(schema.epics)
        .values({
          id: epicId,
          title: "Epic to Delete",
          projectId,
        })
        .run();

      db.delete(schema.projects).where(eq(schema.projects.id, projectId)).run();

      const epic = db
        .select()
        .from(schema.epics)
        .where(eq(schema.epics.id, epicId))
        .get();
      expect(epic).toBeUndefined();
    });
  });
});
