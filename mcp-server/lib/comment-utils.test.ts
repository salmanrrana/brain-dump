import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { fetchTicketComments, formatComment } from "./comment-utils.ts";

function createCommentsDatabase(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE ticket_comments (
      id TEXT PRIMARY KEY NOT NULL,
      ticket_id TEXT NOT NULL,
      content TEXT NOT NULL,
      author TEXT NOT NULL,
      type TEXT NOT NULL,
      phase TEXT,
      actor_kind TEXT,
      provider TEXT,
      model_provider TEXT,
      model_name TEXT,
      created_at TEXT NOT NULL
    )
  `);
  return db;
}

describe("ticket context comment attribution", () => {
  it("formats concise recorded provenance from the explicit context query", () => {
    const db = createCommentsDatabase();
    db.prepare(
      `INSERT INTO ticket_comments (
        id, ticket_id, content, author, type,
        phase, actor_kind, provider, model_provider, model_name, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "comment-1",
      "ticket-1",
      "Review completed",
      "ralph:claude-code",
      "work_summary",
      "ai_review",
      "ai",
      "claude-code",
      "anthropic",
      "claude-sonnet-4-6",
      "2026-07-25T12:00:00.000Z"
    );

    const result = fetchTicketComments(db, "ticket-1");

    expect(result.error).toBeUndefined();
    expect(result.comments).toHaveLength(1);
    expect(formatComment(result.comments[0]!)).toContain(
      "[AI Review · AI · claude-code · anthropic/claude-sonnet-4-6]"
    );
    db.close();
  });

  it("omits unknown stored labels instead of rendering undefined attribution", () => {
    const db = createCommentsDatabase();
    db.prepare(
      `INSERT INTO ticket_comments (
        id, ticket_id, content, author, type, phase, actor_kind, provider, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "comment-unknown",
      "ticket-1",
      "Imported future provenance",
      "ai",
      "comment",
      "future_phase",
      "robot",
      "future-provider",
      "2026-07-25T12:00:00.000Z"
    );

    const result = fetchTicketComments(db, "ticket-1");
    const formatted = formatComment(result.comments[0]!);

    expect(formatted).toContain("[future-provider]");
    expect(formatted).not.toContain("undefined");
    db.close();
  });

  it("keeps historical comments free of empty attribution placeholders", () => {
    const db = createCommentsDatabase();
    db.prepare(
      `INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      "comment-legacy",
      "ticket-1",
      "Historical comment",
      "user",
      "comment",
      "2026-07-25T12:00:00.000Z"
    );

    const result = fetchTicketComments(db, "ticket-1");
    const formatted = formatComment(result.comments[0]!);

    expect(formatted).toContain("**user**");
    expect(formatted).not.toContain("[]");
    expect(formatted).not.toContain("undefined");
    expect(formatted).not.toContain("null");
    db.close();
  });
});
