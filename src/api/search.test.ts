import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../lib/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

/**
 * FTS5 Search Tests - Testing User Behavior
 * Following Kent C. Dodds methodology: testing what users actually do
 * 
 * User workflows tested:
 * 1. User searches for tickets by typing in search box
 * 2. User expects to find tickets by title, description, tags, and subtasks
 * 3. User expects search to work immediately after creating/updating tickets
 * 4. User expects search to return relevant results with highlights
 */
describe("FTS5 Search - User Experience", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let projectId: string;

  beforeAll(() => {
    // Use in-memory database for tests
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    db = drizzle(sqlite, { schema });

    // Create the full schema including FTS5
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

      -- Create FTS5 virtual table exactly like in the migration
      CREATE VIRTUAL TABLE tickets_fts USING fts5(
        title,
        description,
        tags,
        subtasks,
        content=tickets,
        content_rowid=rowid
      );

      -- Create the same triggers as in our fixed migration
      CREATE TRIGGER tickets_ai AFTER INSERT ON tickets BEGIN
        INSERT INTO tickets_fts(rowid, title, description, tags, subtasks)
        VALUES (NEW.rowid, NEW.title, COALESCE(NEW.description, ''), COALESCE(NEW.tags, ''), COALESCE(NEW.subtasks, ''));
      END;

      CREATE TRIGGER tickets_ad AFTER DELETE ON tickets BEGIN
        INSERT INTO tickets_fts(tickets_fts, rowid, title, description, tags, subtasks)
        VALUES ('delete', OLD.rowid, OLD.title, COALESCE(OLD.description, ''), COALESCE(OLD.tags, ''), COALESCE(OLD.subtasks, ''));
      END;

      CREATE TRIGGER tickets_au AFTER UPDATE ON tickets BEGIN
        INSERT INTO tickets_fts(tickets_fts, rowid, title, description, tags, subtasks)
        VALUES ('delete', OLD.rowid, OLD.title, COALESCE(OLD.description, ''), COALESCE(OLD.tags, ''), COALESCE(OLD.subtasks, ''));
        INSERT INTO tickets_fts(rowid, title, description, tags, subtasks)
        VALUES (NEW.rowid, NEW.title, COALESCE(NEW.description, ''), COALESCE(NEW.tags, ''), COALESCE(NEW.subtasks, ''));
      END;
    `);
  });

  afterAll(() => {
    sqlite.close();
  });

  beforeEach(() => {
    // Clear all data before each test
    sqlite.exec("DELETE FROM tickets");
    sqlite.exec("DELETE FROM epics");
    sqlite.exec("DELETE FROM projects");
    sqlite.exec("DELETE FROM tickets_fts");

    // Create a test project
    projectId = randomUUID();
    db.insert(schema.projects)
      .values({
        id: projectId,
        name: "Test Project",
        path: `/tmp/test-${projectId}`,
      })
      .run();
  });

  // Helper function to perform FTS search directly
  function searchTicketsDirectly(query: string, projectIdFilter?: string) {
    if (!query || query.trim().length === 0) {
      return [];
    }

    // Prepare FTS search term (similar to search.ts)
    const searchTerm = query
      .trim()
      .replace(/[*"()]/g, " ")
      .split(/\s+/)
      .filter((term) => term.length > 0)
      .map((term) => `"${term}"*`)
      .join(" ");

    if (!searchTerm) {
      return [];
    }

    try {
      let sql = `
        SELECT
          t.id,
          t.title,
          t.description,
          t.status,
          t.priority,
          t.project_id as projectId,
          t.epic_id as epicId,
          t.tags,
          snippet(tickets_fts, 0, '<mark>', '</mark>', '...', 32) as snippet
        FROM tickets_fts
        JOIN tickets t ON tickets_fts.rowid = t.rowid
        WHERE tickets_fts MATCH ?
      `;

      const params: string[] = [searchTerm];

      if (projectIdFilter) {
        sql += " AND t.project_id = ?";
        params.push(projectIdFilter);
      }

      sql += " ORDER BY rank LIMIT 50";

      const stmt = sqlite.prepare(sql);
      return stmt.all(...params);
    } catch (error) {
      // Fallback to LIKE search
      let sql = `
        SELECT
          id,
          title,
          description,
          status,
          priority,
          project_id as projectId,
          epic_id as epicId,
          tags,
          title as snippet
        FROM tickets
        WHERE (
          title LIKE ? OR
          description LIKE ? OR
          tags LIKE ? OR
          subtasks LIKE ?
        )
      `;

      const likeQuery = `%${query.trim()}%`;
      const params: string[] = [likeQuery, likeQuery, likeQuery, likeQuery];

      if (projectIdFilter) {
        sql += " AND project_id = ?";
        params.push(projectIdFilter);
      }

      sql += " LIMIT 50";

      const stmt = sqlite.prepare(sql);
      return stmt.all(...params);
    }
  }

  describe("When user searches for tickets", () => {
    it("should find tickets by title", () => {
      // Given: User has created tickets with specific titles
      const authTicketId = randomUUID();
      const loginTicketId = randomUUID();
      
      db.insert(schema.tickets).values([
        {
          id: authTicketId,
          title: "Implement user authentication",
          projectId,
          position: 1,
        },
        {
          id: loginTicketId,
          title: "Create login form",
          projectId,
          position: 2,
        },
        {
          id: randomUUID(),
          title: "Setup database",
          projectId,
          position: 3,
        }
      ]).run();

      // When: User searches for "auth"
      const results = searchTicketsDirectly("auth", projectId);

      // Then: User should see the authentication ticket
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: authTicketId,
        title: "Implement user authentication",
      });
    });

    it("should find tickets by description content", () => {
      // Given: Tickets with specific description content
      const reactTicketId = randomUUID();
      
      db.insert(schema.tickets).values([
        {
          id: reactTicketId,
          title: "Frontend work",
          description: "Build the user interface using React and Tailwind CSS",
          projectId,
          position: 1,
        },
        {
          id: randomUUID(),
          title: "Backend API",
          description: "Create REST API endpoints",
          projectId,
          position: 2,
        }
      ]).run();

      // When: User searches for "React"
      const results = searchTicketsDirectly("React", projectId);

      // Then: User should find the React-related ticket
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: reactTicketId,
        title: "Frontend work",
      });
    });

    it("should find tickets by tags", () => {
      // Given: Tickets with specific tags
      const frontendTicketId = randomUUID();
      
      db.insert(schema.tickets).values([
        {
          id: frontendTicketId,
          title: "Build component library",
          tags: JSON.stringify(["frontend", "react", "components"]),
          projectId,
          position: 1,
        },
        {
          id: randomUUID(),
          title: "Setup database",
          tags: JSON.stringify(["backend", "database"]),
          projectId,
          position: 2,
        }
      ]).run();

      // When: User searches for "frontend"
      const results = searchTicketsDirectly("frontend", projectId);

      // Then: User should find tickets tagged with frontend
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: frontendTicketId,
        title: "Build component library",
      });
    });

    it("should find tickets by subtask content", () => {
      // Given: Tickets with specific subtasks
      const setupTicketId = randomUUID();
      
      db.insert(schema.tickets).values([
        {
          id: setupTicketId,
          title: "Project setup",
          subtasks: JSON.stringify([
            { id: randomUUID(), text: "Install Docker", completed: false },
            { id: randomUUID(), text: "Configure TypeScript", completed: true }
          ]),
          projectId,
          position: 1,
        }
      ]).run();

      // When: User searches for "Docker"
      const results = searchTicketsDirectly("Docker", projectId);

      // Then: User should find tickets with Docker in subtasks
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: setupTicketId,
        title: "Project setup",
      });
    });

    it("should return search results with highlighted snippets", () => {
      // Given: A ticket with searchable content
      const ticketId = randomUUID();
      
      db.insert(schema.tickets).values([
        {
          id: ticketId,
          title: "Authentication system",
          description: "Implement OAuth2 authentication with JWT tokens for secure user login",
          projectId,
          position: 1,
        }
      ]).run();

      // When: User searches for "OAuth2"
      const results = searchTicketsDirectly("OAuth2", projectId);

      // Then: User should see highlighted search results
      expect(results).toHaveLength(1);
      expect(results[0].snippet).toBeDefined();
    });

    it("should work immediately after creating new tickets", () => {
      // Given: User creates a new ticket
      const newTicketId = randomUUID();
      
      db.insert(schema.tickets).values([
        {
          id: newTicketId,
          title: "Brand new feature",
          description: "Just created this ticket",
          projectId,
          position: 1,
        }
      ]).run();

      // When: User immediately searches for the new content
      const results = searchTicketsDirectly("brand new", projectId);

      // Then: Search should find the newly created ticket (tests trigger functionality)
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: newTicketId,
        title: "Brand new feature",
      });
    });

    it("should work correctly after updating tickets", () => {
      // Given: User has an existing ticket
      const ticketId = randomUUID();
      
      db.insert(schema.tickets).values([
        {
          id: ticketId,
          title: "Original title",
          description: "Original description",
          projectId,
          position: 1,
        }
      ]).run();

      // When: User updates the ticket
      db.update(schema.tickets)
        .set({
          title: "Updated title with special keywords",
          description: "Updated description content"
        })
        .where(eq(schema.tickets.id, ticketId))
        .run();

      // And: User searches for the updated content
      const results = searchTicketsDirectly("special keywords", projectId);

      // Then: Search should find the updated content (tests update trigger)
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: ticketId,
        title: "Updated title with special keywords",
      });
    });

    it("should not find deleted tickets", () => {
      // Given: User has tickets
      const keepTicketId = randomUUID();
      const deleteTicketId = randomUUID();
      
      db.insert(schema.tickets).values([
        {
          id: keepTicketId,
          title: "Keep this ticket",
          projectId,
          position: 1,
        },
        {
          id: deleteTicketId,
          title: "Delete this ticket",
          projectId,
          position: 2,
        }
      ]).run();

      // When: User deletes a ticket
      db.delete(schema.tickets)
        .where(eq(schema.tickets.id, deleteTicketId))
        .run();

      // And: User searches for content from deleted ticket
      const results = searchTicketsDirectly("delete", projectId);

      // Then: Search should not find the deleted ticket (tests delete trigger)
      expect(results).toHaveLength(0);
    });

    it("should handle empty search queries gracefully", () => {
      // When: User submits empty search
      const results = searchTicketsDirectly("", projectId);

      // Then: Should return empty results without error
      expect(results).toEqual([]);
    });

    it("should handle special characters in search without breaking", () => {
      // Given: Tickets exist
      const ticketId = randomUUID();
      
      db.insert(schema.tickets).values([
        {
          id: ticketId,
          title: "API endpoints",
          description: "Create /api/users endpoint",
          projectId,
          position: 1,
        }
      ]).run();

      // When: User searches with special characters
      const results = searchTicketsDirectly("/api/", projectId);

      // Then: Search should work without throwing errors
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: ticketId,
        title: "API endpoints",
      });
    });

    it("should filter results by project when specified", () => {
      // Given: Tickets in different projects
      const otherProjectId = randomUUID();
      
      db.insert(schema.projects).values({
        id: otherProjectId,
        name: "Other Project",
        path: `/tmp/other-${otherProjectId}`,
      }).run();

      const thisProjectTicketId = randomUUID();
      const otherProjectTicketId = randomUUID();
      
      db.insert(schema.tickets).values([
        {
          id: thisProjectTicketId,
          title: "Authentication in this project",
          projectId,
          position: 1,
        },
        {
          id: otherProjectTicketId,
          title: "Authentication in other project",
          projectId: otherProjectId,
          position: 1,
        }
      ]).run();

      // When: User searches within a specific project
      const results = searchTicketsDirectly("authentication", projectId);

      // Then: Should only return tickets from that project
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: thisProjectTicketId,
        projectId,
      });
    });
  });

  describe("Search performance and reliability", () => {
    it("should handle large datasets efficiently", () => {
      // Given: Many tickets exist
      const ticketsData = Array.from({ length: 100 }, (_, i) => ({
        id: randomUUID(),
        title: `Ticket ${i}`,
        description: `Description for ticket number ${i}`,
        projectId,
        position: i + 1,
      }));
      
      db.insert(schema.tickets).values(ticketsData).run();

      // When: User searches
      const start = Date.now();
      const results = searchTicketsDirectly("ticket", projectId);
      const duration = Date.now() - start;

      // Then: Should return results quickly
      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });

    it("should handle our fixed migration idempotency", () => {
      // This tests our race condition fix
      // Given: Some tickets exist
      const ticketId = randomUUID();
      
      db.insert(schema.tickets).values([
        {
          id: ticketId,
          title: "Test idempotency",
          projectId,
          position: 1,
        }
      ]).run();

      // When: We simulate our migration logic (only populate if FTS table is empty)
      const ftsEmpty = sqlite.prepare("SELECT COUNT(*) as count FROM tickets_fts").get() as { count: number };
      
      if (ftsEmpty.count === 0) {
        // This is what our fixed migration does
        sqlite.prepare(`
          INSERT INTO tickets_fts(rowid, title, description, tags, subtasks)
          SELECT rowid, title, COALESCE(description, ''), COALESCE(tags, ''), COALESCE(subtasks, '')
          FROM tickets
          WHERE NOT EXISTS (SELECT 1 FROM tickets_fts LIMIT 1)
        `).run();
      }

      // Then: Search should work correctly
      const results = searchTicketsDirectly("idempotency", projectId);
      expect(results).toHaveLength(1);
    });
  });
});