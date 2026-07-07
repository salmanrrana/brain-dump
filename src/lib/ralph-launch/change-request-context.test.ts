import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import {
  getHumanRequestedChangesByTicketId,
  getVerificationFailuresByTicketId,
} from "./change-request-context";

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

function insertVerificationRun(
  ticketId: string,
  id: string,
  round: number,
  status: "passed" | "failed" | "infra_error" | "uncertified",
  finishedAt: string
): void {
  sqlite
    .prepare(
      `INSERT INTO verification_runs
       (id, ticket_id, round, status, certified, manifest, git_sha, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`
    )
    .run(
      id,
      ticketId,
      round,
      status,
      status === "passed" ? 1 : 0,
      JSON.stringify({
        runId: id,
        status,
        stepVerdicts: [
          {
            order: 2,
            status: "failed",
            message: "Expected OK, got error",
            evidenceFiles: [{ path: "/tmp/evidence.json", hash: "abc123" }],
          },
        ],
      }),
      finishedAt,
      finishedAt
    );
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

      CREATE TABLE verification_runs (
        id TEXT PRIMARY KEY NOT NULL,
        ticket_id TEXT NOT NULL,
        round INTEGER NOT NULL,
        status TEXT NOT NULL,
        certified INTEGER NOT NULL DEFAULT 0,
        manifest TEXT NOT NULL,
        git_sha TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL
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

  it("returns latest unresolved verification failure context", () => {
    insertTicket("ticket-1", "in_progress");
    insertVerificationRun("ticket-1", "run-1", 1, "failed", "2026-04-25T10:00:00.000Z");
    insertVerificationRun("ticket-1", "run-2", 2, "failed", "2026-04-25T11:00:00.000Z");

    const result = getVerificationFailuresByTicketId(sqlite, ["ticket-1"]);

    expect(result["ticket-1"]).toContain("Verification run run-2 ended with failed");
    expect(result["ticket-1"]).toContain("Step 2: Expected OK, got error");
    expect(result["ticket-1"]).toContain("/tmp/evidence.json");
  });

  it("returns latest unresolved infra error context", () => {
    insertTicket("ticket-1", "in_progress");
    insertVerificationRun("ticket-1", "run-1", 1, "failed", "2026-04-25T10:00:00.000Z");
    insertVerificationRun("ticket-1", "run-2", 2, "infra_error", "2026-04-25T11:00:00.000Z");

    const result = getVerificationFailuresByTicketId(sqlite, ["ticket-1"]);

    expect(result["ticket-1"]).toContain("Verification run run-2 ended with infra_error");
    expect(result["ticket-1"]).toContain("Step 2: Expected OK, got error");
  });

  it("does not return stale verification failures after a newer certified pass", () => {
    insertTicket("ticket-1", "in_progress");
    insertVerificationRun("ticket-1", "run-1", 1, "failed", "2026-04-25T10:00:00.000Z");
    insertVerificationRun("ticket-1", "run-2", 2, "passed", "2026-04-25T11:00:00.000Z");

    const result = getVerificationFailuresByTicketId(sqlite, ["ticket-1"]);

    expect(result).toEqual({});
  });

  it("returns fallback verification failure context for malformed manifests", () => {
    insertTicket("ticket-1", "in_progress");
    insertVerificationRun("ticket-1", "run-1", 1, "failed", "2026-04-25T10:00:00.000Z");
    sqlite.prepare("UPDATE verification_runs SET manifest = '{bad json' WHERE id = 'run-1'").run();

    const result = getVerificationFailuresByTicketId(sqlite, ["ticket-1"]);

    expect(result["ticket-1"]).toContain("Verification run run-1 ended with failed");
    expect(result["ticket-1"]).toContain("Manifest could not be parsed");
  });
});
