import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { getHumanRequestedChangesByTicketId } from "./change-request-context";

let sqlite: Database.Database;

function insertTicket(id: string, status: string): void {
  sqlite
    .prepare(
      "INSERT INTO tickets (id, title, status, position, project_id, created_at, updated_at) VALUES (?, ?, ?, 0, 'project-1', ?, ?)"
    )
    .run(id, `Ticket ${id}`, status, "2026-04-25T00:00:00.000Z", "2026-04-25T00:00:00.000Z");
}

function insertChangeRequest(ticketId: string, content: string, createdAt: string): void {
  sqlite
    .prepare(
      "INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at) VALUES (?, ?, ?, 'brain-dump', 'change_request', ?)"
    )
    .run(`${ticketId}-${createdAt}`, ticketId, content, createdAt);
}

describe("change request launch context", () => {
  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE tickets (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        position REAL NOT NULL,
        project_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE ticket_comments (
        id TEXT PRIMARY KEY NOT NULL,
        ticket_id TEXT NOT NULL,
        content TEXT NOT NULL,
        author TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'comment',
        created_at TEXT NOT NULL
      );

      CREATE TABLE demo_scripts (
        id TEXT PRIMARY KEY NOT NULL,
        ticket_id TEXT NOT NULL,
        steps TEXT NOT NULL,
        completed_at TEXT,
        feedback TEXT,
        passed INTEGER
      );
    `);
  });

  afterEach(() => {
    sqlite.close();
  });

  it("returns the latest unresolved change request for active tickets", () => {
    insertTicket("ticket-1", "ready");
    insertChangeRequest("ticket-1", "Older request", "2026-04-25T10:00:00.000Z");
    insertChangeRequest("ticket-1", "Latest request", "2026-04-25T11:00:00.000Z");

    const result = getHumanRequestedChangesByTicketId(sqlite, ["ticket-1"]);

    expect(result).toEqual({ "ticket-1": "Latest request" });
  });

  it("does not return old requests after a newer successful approval", () => {
    insertTicket("ticket-1", "ready");
    insertChangeRequest("ticket-1", "Rejected demo notes", "2026-04-25T10:00:00.000Z");
    sqlite
      .prepare(
        "INSERT INTO demo_scripts (id, ticket_id, steps, completed_at, passed) VALUES ('demo-1', 'ticket-1', '[]', '2026-04-25T11:00:00.000Z', 1)"
      )
      .run();

    const result = getHumanRequestedChangesByTicketId(sqlite, ["ticket-1"]);

    expect(result).toEqual({});
  });

  it("does not return requests for completed tickets", () => {
    insertTicket("ticket-1", "done");
    insertChangeRequest("ticket-1", "Completed ticket request", "2026-04-25T10:00:00.000Z");

    const result = getHumanRequestedChangesByTicketId(sqlite, ["ticket-1"]);

    expect(result).toEqual({});
  });
});
