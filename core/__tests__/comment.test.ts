import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import {
  addComment,
  addVerificationReportComment,
  getActivityLog,
  listComments,
  resolveCommentAuthor,
  resolveCommentIdentity,
} from "../comment.ts";
import { TicketNotFoundError, ValidationError } from "../errors.ts";

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

describe("resolveCommentIdentity", () => {
  it("uses the provider registry for Pi comment authors", () => {
    expect(resolveCommentAuthor("pi")).toBe("pi");
    expect(resolveCommentAuthor("pi", true)).toBe("ralph:pi");
  });

  it("keeps implementer and fresh-eyes reviewer models separate", () => {
    const env = {
      BRAIN_DUMP_LAUNCH_MODEL_PROVIDER: "openai",
      BRAIN_DUMP_LAUNCH_MODEL: "gpt-5.6",
      BRAIN_DUMP_REVIEWER_AUTHOR: "claude",
      BRAIN_DUMP_REVIEWER_MODEL_PROVIDER: "anthropic",
      BRAIN_DUMP_REVIEWER_MODEL: "claude-opus-4-6",
    };

    expect(
      resolveCommentIdentity({
        phase: "implementation",
        actorKind: "ai",
        role: "implementation",
        author: "ralph:codex",
        env,
      })
    ).toMatchObject({
      provider: "codex",
      modelProvider: "openai",
      modelName: "gpt-5.6",
    });
    expect(
      resolveCommentIdentity({
        phase: "ai_review",
        actorKind: "ai",
        role: "reviewer",
        env,
      })
    ).toMatchObject({
      author: "claude",
      provider: "claude-code",
      modelProvider: "anthropic",
      modelName: "claude-opus-4-6",
    });
  });

  it("records null model fields when no exact model was selected", () => {
    expect(
      resolveCommentIdentity({
        phase: "implementation",
        actorKind: "ai",
        role: "implementation",
        author: "codex",
        env: { BRAIN_DUMP_LAUNCH_MODEL_PROVIDER: "openai" },
      })
    ).toMatchObject({
      provider: "codex",
      modelProvider: null,
      modelName: null,
    });
  });

  it("never records model fields for verification system comments", () => {
    expect(
      resolveCommentIdentity({
        phase: "ai_verification",
        actorKind: "system",
        author: "brain-dump",
        provider: "codex",
        modelProvider: "openai",
        modelName: "gpt-5.6",
      })
    ).toMatchObject({
      actorKind: "system",
      provider: "codex",
      modelProvider: null,
      modelName: null,
    });
  });
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
    expect(comment).toMatchObject({
      phase: null,
      actorKind: null,
      provider: null,
      modelProvider: null,
      modelName: null,
    });
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

  it("preserves provider-prefixed Ralph authors", () => {
    seedProject();
    seedTicket();

    const comment = addComment(db, {
      ticketId: "ticket-1",
      content: "Automated pass completed",
      author: "ralph:codex",
      type: "progress",
    });

    expect(comment.author).toBe("ralph:codex");
    expect(comment.type).toBe("progress");
  });

  it("persists AI workflow and model provenance in comments and activity", () => {
    seedProject();
    seedTicket();

    const comment = addComment(db, {
      ticketId: "ticket-1",
      content: "Implemented the backend slice",
      author: "ralph:codex",
      type: "work_summary",
      phase: "implementation",
      actorKind: "ai",
      provider: "codex",
      modelProvider: "openai",
      modelName: "gpt-5.6",
    });

    expect(comment).toMatchObject({
      phase: "implementation",
      actorKind: "ai",
      provider: "codex",
      modelProvider: "openai",
      modelName: "gpt-5.6",
    });
    expect(listComments(db, "ticket-1")[0]).toMatchObject(comment);
    expect(getActivityLog(db, { ticketId: "ticket-1" })[0]).toMatchObject({
      phase: "implementation",
      actorKind: "ai",
      provider: "codex",
      modelProvider: "openai",
      modelName: "gpt-5.6",
    });
  });

  it("rejects model attribution for system provenance", () => {
    seedProject();
    seedTicket();

    expect(() =>
      addComment(db, {
        ticketId: "ticket-1",
        content: "Deterministic workflow update",
        actorKind: "system",
        modelName: "not-a-system-model",
      })
    ).toThrow(ValidationError);
  });
});

describe("verification report comments", () => {
  it("stores system provenance and refreshes it when updating a run report", () => {
    seedProject();
    seedTicket();

    const first = addVerificationReportComment(db, {
      ticketId: "ticket-1",
      provider: "codex",
      runId: "run-1",
      status: "running",
      steps: [],
    });
    expect(first).toMatchObject({
      phase: "ai_verification",
      actorKind: "system",
      provider: "codex",
      modelProvider: null,
      modelName: null,
    });

    db.prepare(
      "UPDATE ticket_comments SET phase = NULL, actor_kind = NULL, provider = NULL WHERE id = ?"
    ).run(first.id);

    const updated = addVerificationReportComment(db, {
      ticketId: "ticket-1",
      provider: "codex",
      runId: "run-1",
      status: "passed",
      steps: [],
    });

    expect(updated.id).toBe(first.id);
    expect(updated).toMatchObject({
      phase: "ai_verification",
      actorKind: "system",
      provider: "codex",
      modelProvider: null,
      modelName: null,
    });
    expect(listComments(db, "ticket-1")).toHaveLength(1);
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
