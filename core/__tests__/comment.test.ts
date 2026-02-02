import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import { addComment, listComments } from "../comment.ts";
import { TicketNotFoundError } from "../errors.ts";

let db: Database.Database;

function seedProject(id = "proj-1") {
  db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    "Test Project",
    "/tmp/test-project",
    new Date().toISOString()
  );
  return id;
}

function seedTicket(id = "ticket-1", projectId = "proj-1") {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tickets (id, title, status, priority, position, project_id, created_at, updated_at)
     VALUES (?, ?, 'backlog', 'medium', 1, ?, ?, ?)`
  ).run(id, `Ticket ${id}`, projectId, now, now);
  return id;
}

beforeEach(() => {
  const result = createTestDatabase();
  db = result.db;
});

describe("addComment", () => {
  it("creates a comment with correct fields", () => {
    seedProject();
    seedTicket();

    const comment = addComment(db, {
      ticketId: "ticket-1",
      content: "This is a comment",
      author: "claude",
      type: "comment",
    });

    expect(comment.id).toBeTruthy();
    expect(comment.ticketId).toBe("ticket-1");
    expect(comment.content).toBe("This is a comment");
    expect(comment.author).toBe("claude");
    expect(comment.type).toBe("comment");
    expect(comment.createdAt).toBeTruthy();
  });

  it("defaults author to claude and type to comment", () => {
    seedProject();
    seedTicket();

    const comment = addComment(db, {
      ticketId: "ticket-1",
      content: "Minimal comment",
    });

    expect(comment.author).toBe("claude");
    expect(comment.type).toBe("comment");
  });

  it("trims whitespace from content", () => {
    seedProject();
    seedTicket();

    const comment = addComment(db, {
      ticketId: "ticket-1",
      content: "  Trimmed content  ",
    });

    expect(comment.content).toBe("Trimmed content");
  });

  it("throws TicketNotFoundError for nonexistent ticket", () => {
    expect(() => addComment(db, { ticketId: "nonexistent", content: "Test" })).toThrow(
      TicketNotFoundError
    );
  });

  it("supports work_summary type", () => {
    seedProject();
    seedTicket();

    const comment = addComment(db, {
      ticketId: "ticket-1",
      content: "## Work Summary\n- Fixed bug",
      author: "ralph",
      type: "work_summary",
    });

    expect(comment.type).toBe("work_summary");
    expect(comment.author).toBe("ralph");
  });
});

describe("listComments", () => {
  it("returns comments for a ticket sorted newest first", () => {
    seedProject();
    seedTicket();

    // Add comments with slight delay to ensure ordering
    addComment(db, { ticketId: "ticket-1", content: "First comment" });
    addComment(db, { ticketId: "ticket-1", content: "Second comment" });

    const comments = listComments(db, "ticket-1");
    expect(comments.length).toBe(2);
    // Newest first
    expect(comments[0]!.content).toBe("Second comment");
    expect(comments[1]!.content).toBe("First comment");
  });

  it("returns empty array when ticket has no comments", () => {
    seedProject();
    seedTicket();

    const comments = listComments(db, "ticket-1");
    expect(comments).toEqual([]);
  });

  it("throws TicketNotFoundError for nonexistent ticket", () => {
    expect(() => listComments(db, "nonexistent")).toThrow(TicketNotFoundError);
  });

  it("only returns comments for the specified ticket", () => {
    seedProject();
    seedTicket("t1");
    seedTicket("t2");

    addComment(db, { ticketId: "t1", content: "Comment on t1" });
    addComment(db, { ticketId: "t2", content: "Comment on t2" });

    const comments = listComments(db, "t1");
    expect(comments.length).toBe(1);
    expect(comments[0]!.content).toBe("Comment on t1");
  });
});
