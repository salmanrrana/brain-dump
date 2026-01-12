import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../lib/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync, rmSync } from "fs";

// We'll test the logic directly since server functions need a runtime
describe("Projects API Logic", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  const testDir = "/tmp/brain-dump-test-project";

  beforeAll(() => {
    // Create test directory
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }

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
        completed_at TEXT
      );
    `);
  });

  afterAll(() => {
    sqlite.close();
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  beforeEach(() => {
    // Clear projects before each test
    sqlite.exec("DELETE FROM projects");
  });

  describe("getProjects", () => {
    it("should return empty array when no projects exist", () => {
      const result = db.select().from(schema.projects).all();
      expect(result).toEqual([]);
    });

    it("should return all projects", () => {
      const id1 = randomUUID();
      const id2 = randomUUID();

      db.insert(schema.projects).values([
        { id: id1, name: "Project 1", path: "/path/1" },
        { id: id2, name: "Project 2", path: "/path/2" },
      ]).run();

      const result = db.select().from(schema.projects).all();
      expect(result).toHaveLength(2);
    });
  });

  describe("getProject", () => {
    it("should return a project by ID", () => {
      const id = randomUUID();
      db.insert(schema.projects).values({
        id,
        name: "Test Project",
        path: "/test/path",
      }).run();

      const result = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
      expect(result).toBeDefined();
      expect(result?.name).toBe("Test Project");
    });

    it("should return undefined for non-existent ID", () => {
      const result = db.select().from(schema.projects).where(eq(schema.projects.id, "non-existent")).get();
      expect(result).toBeUndefined();
    });
  });

  describe("createProject", () => {
    it("should create a project with valid input", () => {
      const id = randomUUID();
      db.insert(schema.projects).values({
        id,
        name: "New Project",
        path: testDir,
        color: "#ff0000",
      }).run();

      const result = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
      expect(result).toBeDefined();
      expect(result?.name).toBe("New Project");
      expect(result?.path).toBe(testDir);
      expect(result?.color).toBe("#ff0000");
    });

    it("should enforce unique path constraint", () => {
      const id1 = randomUUID();
      db.insert(schema.projects).values({
        id: id1,
        name: "Project 1",
        path: "/unique/path",
      }).run();

      const id2 = randomUUID();
      expect(() => {
        db.insert(schema.projects).values({
          id: id2,
          name: "Project 2",
          path: "/unique/path",
        }).run();
      }).toThrow();
    });
  });

  describe("updateProject", () => {
    it("should update project name", () => {
      const id = randomUUID();
      db.insert(schema.projects).values({
        id,
        name: "Original Name",
        path: "/update/test",
      }).run();

      db.update(schema.projects)
        .set({ name: "Updated Name" })
        .where(eq(schema.projects.id, id))
        .run();

      const result = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
      expect(result?.name).toBe("Updated Name");
    });

    it("should update project color", () => {
      const id = randomUUID();
      db.insert(schema.projects).values({
        id,
        name: "Color Test",
        path: "/color/test",
      }).run();

      db.update(schema.projects)
        .set({ color: "#00ff00" })
        .where(eq(schema.projects.id, id))
        .run();

      const result = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
      expect(result?.color).toBe("#00ff00");
    });
  });

  describe("deleteProject", () => {
    it("should delete a project", () => {
      const id = randomUUID();
      db.insert(schema.projects).values({
        id,
        name: "To Delete",
        path: "/delete/test",
      }).run();

      db.delete(schema.projects).where(eq(schema.projects.id, id)).run();

      const result = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
      expect(result).toBeUndefined();
    });

    it("should cascade delete epics when project is deleted", () => {
      const projectId = randomUUID();
      const epicId = randomUUID();

      db.insert(schema.projects).values({
        id: projectId,
        name: "Cascade Delete Test",
        path: "/cascade/delete",
      }).run();

      db.insert(schema.epics).values({
        id: epicId,
        title: "Epic to Delete",
        projectId: projectId,
      }).run();

      db.delete(schema.projects).where(eq(schema.projects.id, projectId)).run();

      const epic = db.select().from(schema.epics).where(eq(schema.epics.id, epicId)).get();
      expect(epic).toBeUndefined();
    });

    it("should cascade delete tickets when project is deleted", () => {
      const projectId = randomUUID();
      const ticketId = randomUUID();

      db.insert(schema.projects).values({
        id: projectId,
        name: "Ticket Cascade Test",
        path: "/ticket/cascade",
      }).run();

      db.insert(schema.tickets).values({
        id: ticketId,
        title: "Ticket to Delete",
        projectId: projectId,
        position: 1,
      }).run();

      db.delete(schema.projects).where(eq(schema.projects.id, projectId)).run();

      const ticket = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
      expect(ticket).toBeUndefined();
    });
  });
});
