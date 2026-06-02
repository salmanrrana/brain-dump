import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import { searchTickets } from "../search.ts";

/**
 * Search behaviour tests.
 *
 * These verify what a user experiences when typing in the search box: results
 * come back whether or not the FTS5 index is available. They also guard the
 * per-connection `hasFts5Table` cache — search must stay correct on both the
 * FTS5 path and the LIKE fallback.
 */
let db: Database.Database;

function seedProject(id = "proj-1", name = "Test Project", path = "/tmp/search-test") {
  db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    name,
    path,
    new Date().toISOString()
  );
  return id;
}

function seedTicket(id: string, projectId: string, title: string, description = "") {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tickets (id, title, description, status, priority, position, project_id, created_at, updated_at)
     VALUES (?, ?, ?, 'backlog', 'medium', 1, ?, ?, ?)`
  ).run(id, title, description, projectId, now, now);
}

function dropFts5() {
  db.exec("DROP TRIGGER IF EXISTS tickets_ai");
  db.exec("DROP TRIGGER IF EXISTS tickets_ad");
  db.exec("DROP TRIGGER IF EXISTS tickets_au");
  db.exec("DROP TABLE IF EXISTS tickets_fts");
}

describe("searchTickets", () => {
  beforeEach(() => {
    db = createTestDatabase().db;
  });

  it("finds a ticket by title using the FTS5 index", () => {
    const projectId = seedProject();
    seedTicket("t1", projectId, "Implement user authentication");
    seedTicket("t2", projectId, "Setup database");

    const results = searchTickets(db, { query: "authentication", projectId });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("t1");
  });

  it("finds a ticket by description using the FTS5 index", () => {
    const projectId = seedProject();
    seedTicket("t1", projectId, "Frontend work", "Build the UI with React and Tailwind");
    seedTicket("t2", projectId, "Backend API", "Create REST endpoints");

    const results = searchTickets(db, { query: "React", projectId });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("t1");
  });

  it("still finds a ticket by title when the FTS5 index is unavailable", () => {
    const projectId = seedProject();
    seedTicket("t1", projectId, "Implement user authentication");
    seedTicket("t2", projectId, "Setup database");

    // Remove FTS5 so search must use the LIKE fallback. A fresh handle means the
    // cache has no stale "FTS available" entry.
    dropFts5();

    const results = searchTickets(db, { query: "authentication", projectId });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("t1");
  });
});
