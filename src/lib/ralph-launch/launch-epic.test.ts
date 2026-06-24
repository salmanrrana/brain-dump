import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as schema from "../schema";
import { applyEpicLaunchStatusChanges } from "./launch-epic";
import type { TicketRecord } from "./types";

/**
 * These tests cover the board-display correctness contract for epic launch:
 * launching an epic must move ONLY the first runnable ticket to in_progress
 * (the bug was a loop that marked every backlog/ready ticket in_progress), and
 * a launch failure must roll every ticket back to its captured pre-launch
 * status. `startWork` (which also creates a git branch) is the injected
 * boundary; the test drives the DB status effect directly so it can run
 * without a real git repository.
 */
describe("applyEpicLaunchStatusChanges", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let projectId: string;
  let epicId: string;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    db = drizzle(sqlite, { schema });

    sqlite.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        color TEXT,
        working_method TEXT DEFAULT 'auto',
        position REAL NOT NULL DEFAULT 0,
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
        linked_files TEXT, branch_name TEXT, pr_number INTEGER, pr_url TEXT, pr_status TEXT,
        attachments TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      );
    `);

    projectId = randomUUID();
    epicId = randomUUID();
    db.insert(schema.projects)
      .values({ id: projectId, name: "Test", path: `/tmp/${projectId}` })
      .run();
    db.insert(schema.epics).values({ id: epicId, title: "Epic", projectId }).run();
  });

  /** Insert a ticket with the given status and return its id. */
  const seedTicket = (status: TicketRecord["status"], position: number): string => {
    const id = randomUUID();
    db.insert(schema.tickets)
      .values({ id, title: `t-${status}-${position}`, status, position, projectId, epicId })
      .run();
    return id;
  };

  const statusOf = (id: string): string =>
    db.select().from(schema.tickets).where(eq(schema.tickets.id, id)).get()!.status;

  // Promotion boundary: mirror startWork's DB effect (in_progress) without git.
  const promoteToInProgress = (ticket: TicketRecord) => {
    db.update(schema.tickets)
      .set({ status: "in_progress" })
      .where(eq(schema.tickets.id, ticket.id))
      .run();
  };

  it("moves only the first runnable ticket to in_progress and leaves the rest unchanged", () => {
    // Order matters: the first backlog/ready ticket encountered is the one that runs.
    const aiReview = seedTicket("ai_review", 1);
    const ready = seedTicket("ready", 2); // first runnable
    const backlog = seedTicket("backlog", 3);
    const humanReview = seedTicket("human_review", 4);
    const done = seedTicket("done", 5);
    const alreadyInProgress = seedTicket("in_progress", 6);

    const epicTickets = db.select().from(schema.tickets).all() as TicketRecord[];

    const { firstTicketId } = applyEpicLaunchStatusChanges(db, epicTickets, promoteToInProgress);

    expect(firstTicketId).toBe(ready);
    expect(statusOf(ready)).toBe("in_progress");
    // Everything else keeps its pre-launch status.
    expect(statusOf(backlog)).toBe("backlog");
    expect(statusOf(aiReview)).toBe("ai_review");
    expect(statusOf(humanReview)).toBe("human_review");
    expect(statusOf(done)).toBe("done");
    expect(statusOf(alreadyInProgress)).toBe("in_progress");
  });

  it("restores every ticket's pre-launch status when rollback runs after a failure", () => {
    const ready = seedTicket("ready", 1); // first runnable
    const backlog = seedTicket("backlog", 2);
    const aiReview = seedTicket("ai_review", 3);

    const epicTickets = db.select().from(schema.tickets).all() as TicketRecord[];

    const { rollback } = applyEpicLaunchStatusChanges(db, epicTickets, promoteToInProgress);
    // The promotion happened...
    expect(statusOf(ready)).toBe("in_progress");

    // ...then a later launch step fails and we roll back.
    rollback();

    expect(statusOf(ready)).toBe("ready");
    expect(statusOf(backlog)).toBe("backlog");
    expect(statusOf(aiReview)).toBe("ai_review");
  });

  it("makes no status changes when no ticket is runnable", () => {
    const aiReview = seedTicket("ai_review", 1);
    const humanReview = seedTicket("human_review", 2);

    const epicTickets = db.select().from(schema.tickets).all() as TicketRecord[];

    const { firstTicketId } = applyEpicLaunchStatusChanges(db, epicTickets, promoteToInProgress);

    expect(firstTicketId).toBeNull();
    expect(statusOf(aiReview)).toBe("ai_review");
    expect(statusOf(humanReview)).toBe("human_review");
  });
});
