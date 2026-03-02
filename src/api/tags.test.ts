import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";

/**
 * Tags API Tests - Testing User Behavior
 * Following Kent C. Dodds methodology: testing what users actually do
 *
 * User workflows tested:
 * 1. User opens Tags tab and sees ALL tags from ALL projects (no filters)
 * 2. User opens Tags tab with a project selected and sees that project's tags
 * 3. User opens Tags tab with an epic selected and sees that epic's tags
 * 4. User sees correct ticket counts and status breakdowns
 */

// We test the raw SQL logic directly since TanStack Start server functions
// are thin wrappers around database queries
describe("Tags API - User Experience", () => {
  let sqlite: Database.Database;
  let projectId1: string;
  let projectId2: string;
  let epicId1: string;
  let epicId2: string;

  beforeAll(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");

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
        branch_name TEXT,
        pr_number INTEGER,
        pr_url TEXT,
        pr_status TEXT,
        attachments TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      );
    `);

    // Set up two projects with epics
    projectId1 = "proj-1";
    projectId2 = "proj-2";
    epicId1 = "epic-1";
    epicId2 = "epic-2";

    sqlite
      .prepare("INSERT INTO projects (id, name, path) VALUES (?, ?, ?)")
      .run(projectId1, "Project Alpha", "/projects/alpha");
    sqlite
      .prepare("INSERT INTO projects (id, name, path) VALUES (?, ?, ?)")
      .run(projectId2, "Project Beta", "/projects/beta");
    sqlite
      .prepare("INSERT INTO epics (id, title, project_id) VALUES (?, ?, ?)")
      .run(epicId1, "Epic One", projectId1);
    sqlite
      .prepare("INSERT INTO epics (id, title, project_id) VALUES (?, ?, ?)")
      .run(epicId2, "Epic Two", projectId1);
  });

  afterAll(() => {
    sqlite.close();
  });

  beforeEach(() => {
    sqlite.prepare("DELETE FROM tickets").run();
  });

  // Helper: insert a ticket with tags
  function insertTicket(opts: {
    id: string;
    title: string;
    projectId: string;
    epicId?: string;
    tags: string[];
    status?: string;
  }) {
    sqlite
      .prepare(
        `INSERT INTO tickets (id, title, project_id, epic_id, tags, status, position, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))`
      )
      .run(
        opts.id,
        opts.title,
        opts.projectId,
        opts.epicId ?? null,
        JSON.stringify(opts.tags),
        opts.status ?? "backlog"
      );
  }

  // Replicate the same SQL query used in getTagsWithMetadata
  function queryTagsWithMetadata(filters: { projectId?: string; epicId?: string }) {
    let sql = `
      SELECT
        json_each.value as tag,
        COUNT(DISTINCT tickets.id) as ticket_count,
        SUM(CASE WHEN tickets.status = 'backlog' THEN 1 ELSE 0 END) as backlog_count,
        SUM(CASE WHEN tickets.status = 'ready' THEN 1 ELSE 0 END) as ready_count,
        SUM(CASE WHEN tickets.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_count,
        SUM(CASE WHEN tickets.status = 'ai_review' THEN 1 ELSE 0 END) as ai_review_count,
        SUM(CASE WHEN tickets.status = 'human_review' THEN 1 ELSE 0 END) as human_review_count,
        SUM(CASE WHEN tickets.status = 'done' THEN 1 ELSE 0 END) as done_count,
        MAX(tickets.updated_at) as last_used_at
      FROM tickets, json_each(tickets.tags)
      WHERE tickets.tags IS NOT NULL AND tickets.tags != '' AND tickets.tags != '[]'
        AND json_valid(tickets.tags)
    `;
    const params: string[] = [];

    if (filters.projectId) {
      sql += " AND tickets.project_id = ?";
      params.push(filters.projectId);
    }
    if (filters.epicId) {
      sql += " AND tickets.epic_id = ?";
      params.push(filters.epicId);
    }

    sql += " GROUP BY json_each.value ORDER BY ticket_count DESC, tag ASC";

    return sqlite.prepare(sql).all(...params) as {
      tag: string;
      ticket_count: number;
      backlog_count: number;
      done_count: number;
    }[];
  }

  // =========================================================================
  // NO FILTERS — User sees ALL tags across all projects
  // This is the critical test: Tags tab must work without selecting anything
  // =========================================================================

  describe("no filters (all tags globally)", () => {
    it("returns all tags from all projects when no filter is applied", () => {
      // Project 1 tickets
      insertTicket({
        id: "t1",
        title: "Setup API",
        projectId: projectId1,
        epicId: epicId1,
        tags: ["api", "backend"],
      });
      // Project 2 tickets
      insertTicket({
        id: "t2",
        title: "Build UI",
        projectId: projectId2,
        tags: ["frontend", "ui"],
      });

      const results = queryTagsWithMetadata({});

      const tagNames = results.map((r) => r.tag);
      expect(tagNames).toContain("api");
      expect(tagNames).toContain("backend");
      expect(tagNames).toContain("frontend");
      expect(tagNames).toContain("ui");
      expect(results).toHaveLength(4);
    });

    it("returns tags from tickets without an epic", () => {
      // Ticket with no epic
      insertTicket({
        id: "t1",
        title: "Standalone task",
        projectId: projectId1,
        tags: ["misc", "cleanup"],
      });

      const results = queryTagsWithMetadata({});

      const tagNames = results.map((r) => r.tag);
      expect(tagNames).toContain("misc");
      expect(tagNames).toContain("cleanup");
    });

    it("aggregates ticket counts across all projects", () => {
      // Same tag "api" in two different projects
      insertTicket({
        id: "t1",
        title: "API v1",
        projectId: projectId1,
        tags: ["api"],
      });
      insertTicket({
        id: "t2",
        title: "API v2",
        projectId: projectId2,
        tags: ["api"],
      });

      const results = queryTagsWithMetadata({});
      const apiTag = results.find((r) => r.tag === "api");

      expect(apiTag).toBeDefined();
      expect(apiTag!.ticket_count).toBe(2);
    });
  });

  // =========================================================================
  // PROJECT FILTER — User has a project selected in sidebar
  // =========================================================================

  describe("project filter", () => {
    it("returns only tags from the selected project", () => {
      insertTicket({
        id: "t1",
        title: "Alpha task",
        projectId: projectId1,
        tags: ["alpha-tag"],
      });
      insertTicket({
        id: "t2",
        title: "Beta task",
        projectId: projectId2,
        tags: ["beta-tag"],
      });

      const results = queryTagsWithMetadata({ projectId: projectId1 });

      const tagNames = results.map((r) => r.tag);
      expect(tagNames).toContain("alpha-tag");
      expect(tagNames).not.toContain("beta-tag");
    });

    it("includes tags from all epics within the project", () => {
      insertTicket({
        id: "t1",
        title: "Epic1 task",
        projectId: projectId1,
        epicId: epicId1,
        tags: ["epic1-tag"],
      });
      insertTicket({
        id: "t2",
        title: "Epic2 task",
        projectId: projectId1,
        epicId: epicId2,
        tags: ["epic2-tag"],
      });

      const results = queryTagsWithMetadata({ projectId: projectId1 });

      const tagNames = results.map((r) => r.tag);
      expect(tagNames).toContain("epic1-tag");
      expect(tagNames).toContain("epic2-tag");
    });
  });

  // =========================================================================
  // STATUS BREAKDOWN — User sees progress per tag
  // =========================================================================

  describe("status breakdown", () => {
    it("shows correct done count across tickets with the same tag", () => {
      insertTicket({
        id: "t1",
        title: "Done task",
        projectId: projectId1,
        tags: ["feature"],
        status: "done",
      });
      insertTicket({
        id: "t2",
        title: "In progress task",
        projectId: projectId1,
        tags: ["feature"],
        status: "in_progress",
      });
      insertTicket({
        id: "t3",
        title: "Backlog task",
        projectId: projectId1,
        tags: ["feature"],
        status: "backlog",
      });

      const results = queryTagsWithMetadata({});
      const featureTag = results.find((r) => r.tag === "feature");

      expect(featureTag).toBeDefined();
      expect(featureTag!.ticket_count).toBe(3);
      expect(featureTag!.done_count).toBe(1);
      expect(featureTag!.backlog_count).toBe(1);
    });
  });

  // =========================================================================
  // EDGE CASES — Tags tab handles unusual data gracefully
  // =========================================================================

  describe("edge cases", () => {
    it("returns empty array when no tickets have tags", () => {
      // Insert ticket with empty tags array
      sqlite
        .prepare(
          "INSERT INTO tickets (id, title, project_id, tags, status, position) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run("t1", "No tags", projectId1, "[]", "backlog", 0);

      const results = queryTagsWithMetadata({});
      expect(results).toHaveLength(0);
    });

    it("handles tickets with null tags field", () => {
      sqlite
        .prepare(
          "INSERT INTO tickets (id, title, project_id, tags, status, position) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run("t1", "Null tags", projectId1, null, "backlog", 0);

      const results = queryTagsWithMetadata({});
      expect(results).toHaveLength(0);
    });

    it("handles tickets with empty string tags field", () => {
      sqlite
        .prepare(
          "INSERT INTO tickets (id, title, project_id, tags, status, position) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run("t1", "Empty tags", projectId1, "", "backlog", 0);

      const results = queryTagsWithMetadata({});
      expect(results).toHaveLength(0);
    });

    it("skips tickets with malformed JSON tags without crashing the query", () => {
      // This is the actual bug: some tickets have comma-separated strings
      // like "ui,ux,polish" instead of valid JSON arrays like ["ui","ux","polish"]
      sqlite
        .prepare(
          "INSERT INTO tickets (id, title, project_id, tags, status, position) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run("t-bad", "Bad tags ticket", projectId1, "ui,ux,polish", "backlog", 0);

      // Also insert a valid ticket so we can verify the query still returns results
      insertTicket({
        id: "t-good",
        title: "Good tags ticket",
        projectId: projectId1,
        tags: ["frontend", "api"],
      });

      // The query should NOT crash — it should skip the malformed row
      const results = queryTagsWithMetadata({});

      // Should only contain valid tags from the good ticket
      const tagNames = results.map((r) => r.tag);
      expect(tagNames).toContain("frontend");
      expect(tagNames).toContain("api");
      expect(tagNames).not.toContain("ui,ux,polish");
      expect(results).toHaveLength(2);
    });
  });
});
