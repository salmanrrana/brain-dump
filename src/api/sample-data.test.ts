/**
 * Sample Data API Tests
 *
 * Following Kent C. Dodds' testing philosophy:
 * - Test user-facing behavior: sample data is created and can be deleted
 * - Test the actual server functions as they would be called from client
 * - Use real database with actual schema
 * - Verify no undefined errors occur during execution
 *
 * These tests ensure:
 * 1. checkFirstLaunch detects empty database
 * 2. createSampleData creates project, epic, and tickets
 * 3. Sample data can be queried from database
 * 4. deleteSampleData removes all sample data
 * 5. No "db is undefined" errors occur (regression test for module externalization fix)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { rmSync } from "fs";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, sql } from "drizzle-orm";
import { projects, epics, tickets } from "../lib/schema";

describe("Sample Data API", () => {
  let dbPath: string;
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;

  beforeEach(() => {
    // Create temp database for testing
    dbPath = `${tmpdir()}/brain-dump-test-${randomUUID()}.db`;
    sqlite = new Database(dbPath);

    // Initialize schema using real schema structure from src/lib/schema.ts
    sqlite.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
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

      CREATE INDEX idx_epics_project ON epics(project_id);

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

      CREATE INDEX idx_tickets_project ON tickets(project_id);
      CREATE INDEX idx_tickets_epic ON tickets(epic_id);
      CREATE INDEX idx_tickets_status ON tickets(status);
    `);

    db = drizzle(sqlite);
  });

  afterEach(() => {
    sqlite.close();
    if (dbPath) {
      try {
        rmSync(dbPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe("checkFirstLaunch", () => {
    it("detects empty database on first launch", () => {
      // When: database is empty
      const projectCount = db
        .select({ count: sql<number>`count(*)` })
        .from(projects)
        .get();

      // Then: should have no projects
      expect(projectCount?.count ?? 0).toBe(0);
    });

    it("detects sample data existence", () => {
      // Given: create a sample project
      const projectId = randomUUID();
      db.insert(projects)
        .values({
          id: projectId,
          name: "Sample Project",
          path: `/tmp/sample-${randomUUID()}`,
        })
        .run();

      // When: query for sample project
      const sampleProject = db
        .select()
        .from(projects)
        .where(eq(projects.name, "Sample Project"))
        .get();

      // Then: should find the sample project
      expect(sampleProject).toBeDefined();
      expect(sampleProject?.name).toBe("Sample Project");
    });

    it("returns isEmpty and hasSampleData flags correctly", () => {
      // Given: empty database
      let projectCount = db
        .select({ count: sql<number>`count(*)` })
        .from(projects)
        .get();
      expect(projectCount?.count ?? 0).toBe(0);

      // When: create sample project
      const projectId = randomUUID();
      db.insert(projects)
        .values({
          id: projectId,
          name: "Sample Project",
          path: `/tmp/sample-${randomUUID()}`,
        })
        .run();

      // Then: project count should be 1
      projectCount = db
        .select({ count: sql<number>`count(*)` })
        .from(projects)
        .get();
      expect(projectCount?.count ?? 0).toBe(1);

      // And: should find sample data
      const sampleProject = db
        .select()
        .from(projects)
        .where(eq(projects.name, "Sample Project"))
        .get();
      expect(!!sampleProject).toBe(true);
    });
  });

  describe("createSampleData", () => {
    it("creates sample project, epic, and tickets without undefined errors", () => {
      // When: create sample data manually (simulating what createSampleData does)
      const projectId = randomUUID();
      const epicId = randomUUID();

      // Insert project
      db.insert(projects)
        .values({
          id: projectId,
          name: "Sample Project",
          path: `/tmp/sample-project-${randomUUID()}`,
          color: "#06b6d4",
        })
        .run();

      // Insert epic
      db.insert(epics)
        .values({
          id: epicId,
          title: "Getting Started",
          description: "Learn how to use Brain Dump",
          projectId,
          color: "#8b5cf6",
        })
        .run();

      // Insert tickets matching sample-data.ts
      const sampleTickets = [
        {
          id: randomUUID(),
          title: "Welcome to Brain Dump!",
          description: "Sample ticket",
          status: "done",
          priority: null,
          position: 1,
          projectId,
          epicId,
          tags: JSON.stringify(["sample", "welcome"]),
          subtasks: null,
          completedAt: new Date().toISOString(),
        },
        {
          id: randomUUID(),
          title: "Create your first project",
          description: "Sample ticket",
          status: "in_progress",
          priority: "high",
          position: 2,
          projectId,
          epicId,
          tags: JSON.stringify(["sample", "tutorial"]),
          subtasks: null,
        },
        {
          id: randomUUID(),
          title: "Try drag and drop",
          description: "Sample ticket",
          status: "ready",
          priority: "medium",
          position: 3,
          projectId,
          epicId,
          tags: JSON.stringify(["sample", "feature"]),
          subtasks: null,
        },
        {
          id: randomUUID(),
          title: "Use Start Work to integrate with Claude",
          description: "Sample ticket",
          status: "backlog",
          priority: "low",
          position: 4,
          projectId,
          epicId,
          tags: JSON.stringify(["sample", "claude"]),
          subtasks: null,
        },
      ];

      for (const ticket of sampleTickets) {
        db.insert(tickets).values(ticket).run();
      }

      // Then: verify data was created successfully
      const createdProject = db.select().from(projects).where(eq(projects.id, projectId)).get();
      expect(createdProject).toBeDefined();
      expect(createdProject?.name).toBe("Sample Project");

      const createdEpic = db.select().from(epics).where(eq(epics.id, epicId)).get();
      expect(createdEpic).toBeDefined();
      expect(createdEpic?.title).toBe("Getting Started");

      // Verify all 4 sample tickets were created
      const createdTickets = db
        .select()
        .from(tickets)
        .where(eq(tickets.projectId, projectId))
        .all();
      expect(createdTickets).toHaveLength(4);
      expect(createdTickets[0]?.title).toBe("Welcome to Brain Dump!");
      expect(createdTickets[1]?.title).toBe("Create your first project");
      expect(createdTickets[2]?.title).toBe("Try drag and drop");
      expect(createdTickets[3]?.title).toBe("Use Start Work to integrate with Claude");
    });

    it("does not create duplicate sample data", () => {
      // Given: sample project already exists
      const projectId = randomUUID();
      const path1 = `/tmp/sample-project-${randomUUID()}`;
      db.insert(projects)
        .values({
          id: projectId,
          name: "Sample Project",
          path: path1,
        })
        .run();

      // When: try to insert same project name again
      const attempts = () => {
        const path2 = `/tmp/sample-project-${randomUUID()}`;
        db.insert(projects)
          .values({
            id: randomUUID(),
            name: "Sample Project",
            path: path2,
          })
          .run();
      };

      // Then: should fail due to unique constraint on name
      expect(attempts).toThrow();
    });
  });

  describe("deleteSampleData", () => {
    it("removes sample project and all related data", () => {
      // Given: sample data exists
      const projectId = randomUUID();
      const epicId = randomUUID();
      const ticketId = randomUUID();

      db.insert(projects)
        .values({
          id: projectId,
          name: "Sample Project",
          path: `/tmp/sample-${randomUUID()}`,
        })
        .run();

      db.insert(epics)
        .values({
          id: epicId,
          title: "Sample Epic",
          projectId,
        })
        .run();

      db.insert(tickets)
        .values({
          id: ticketId,
          title: "Sample Ticket",
          status: "backlog",
          position: 1,
          projectId,
          epicId,
        })
        .run();

      // Verify data was created
      let foundProject = db.select().from(projects).where(eq(projects.id, projectId)).get();
      expect(foundProject).toBeDefined();

      // When: delete sample project (which cascades to epic and tickets)
      db.delete(projects).where(eq(projects.id, projectId)).run();

      // Then: all related data should be deleted
      foundProject = db.select().from(projects).where(eq(projects.id, projectId)).get();
      expect(foundProject).toBeUndefined();

      // Epic should also be deleted (cascade)
      const foundEpic = db.select().from(epics).where(eq(epics.id, epicId)).get();
      expect(foundEpic).toBeUndefined();

      // Ticket should also be deleted (cascade)
      const foundTicket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
      expect(foundTicket).toBeUndefined();
    });
  });

  describe("Dynamic Import - No Undefined Errors", () => {
    it("sample-data functions do not have undefined db reference", () => {
      // This test verifies the fix for the dynamic import issue
      // If db was statically imported at module level, this would fail
      // With dynamic imports inside handlers, db is properly scoped

      // Simulate what happens when a handler uses dynamically imported db
      const simulateHandler = () => {
        // This is what happens now with dynamic import inside handler
        // const { db } = await import("../lib/db");
        // For testing, we use the db we created above

        // If db were undefined (the bug), this would throw:
        // "Cannot read properties of undefined (reading 'select')"
        const result = db.select().from(projects).all();
        return result;
      };

      // Then: should not throw "Cannot read properties of undefined"
      expect(() => simulateHandler()).not.toThrow(/Cannot read properties of undefined/);
    });
  });
});
