import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import { linkCommit, linkPr } from "../git.ts";
import { TicketNotFoundError } from "../errors.ts";
import { seedProject, seedTicket } from "./test-helpers.ts";

let db: Database.Database;

beforeEach(() => {
  const result = createTestDatabase();
  db = result.db;
});

describe("linkCommit", () => {
  it("links a commit to a ticket", () => {
    seedProject(db);
    seedTicket(db);

    const result = linkCommit(db, "ticket-1", "abc1234def", "feat: add feature");

    expect(result.ticketId).toBe("ticket-1");
    expect(result.commitHash).toBe("abc1234def");
    expect(result.commitMessage).toBe("feat: add feature");
    expect(result.alreadyLinked).toBe(false);
    expect(result.totalCommits).toBe(1);
    expect(result.linkedCommits).toHaveLength(1);
  });

  it("detects already-linked commits", () => {
    seedProject(db);
    seedTicket(db);

    linkCommit(db, "ticket-1", "abc1234def", "first commit");
    const result = linkCommit(db, "ticket-1", "abc1234def", "first commit");

    expect(result.alreadyLinked).toBe(true);
    expect(result.totalCommits).toBe(1);
  });

  it("detects prefix-matched commits as already linked", () => {
    seedProject(db);
    seedTicket(db);

    linkCommit(db, "ticket-1", "abc1234def5678", "commit");
    const result = linkCommit(db, "ticket-1", "abc1234def", "commit");

    expect(result.alreadyLinked).toBe(true);
  });

  it("links multiple different commits", () => {
    seedProject(db);
    seedTicket(db);

    linkCommit(db, "ticket-1", "aaa1111", "first");
    linkCommit(db, "ticket-1", "bbb2222", "second");
    const result = linkCommit(db, "ticket-1", "ccc3333", "third");

    expect(result.totalCommits).toBe(3);
  });

  it("throws TicketNotFoundError for nonexistent ticket", () => {
    expect(() => linkCommit(db, "nonexistent", "abc123", "msg")).toThrow(TicketNotFoundError);
  });
});

describe("linkPr", () => {
  it("links a PR to a ticket", () => {
    seedProject(db);
    seedTicket(db);

    const result = linkPr(db, "ticket-1", 42, "https://github.com/org/repo/pull/42", "open");

    expect(result.ticketId).toBe("ticket-1");
    expect(result.prNumber).toBe(42);
    expect(result.prUrl).toBe("https://github.com/org/repo/pull/42");
    expect(result.prStatus).toBe("open");
  });

  it("defaults to open status", () => {
    seedProject(db);
    seedTicket(db);

    const result = linkPr(db, "ticket-1", 99);

    expect(result.prStatus).toBe("open");
  });

  it("persists PR data in the database", () => {
    seedProject(db);
    seedTicket(db);

    linkPr(db, "ticket-1", 42, "https://github.com/org/repo/pull/42", "draft");

    const ticket = db
      .prepare("SELECT pr_number, pr_url, pr_status FROM tickets WHERE id = ?")
      .get("ticket-1") as { pr_number: number; pr_url: string; pr_status: string };

    expect(ticket.pr_number).toBe(42);
    expect(ticket.pr_url).toBe("https://github.com/org/repo/pull/42");
    expect(ticket.pr_status).toBe("draft");
  });

  it("throws TicketNotFoundError for nonexistent ticket", () => {
    expect(() => linkPr(db, "nonexistent", 1)).toThrow(TicketNotFoundError);
  });
});
