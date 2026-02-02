import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import { reconcileLearnings, getEpicLearnings } from "../learnings.ts";
import { TicketNotFoundError, EpicNotFoundError, InvalidStateError } from "../errors.ts";
import type { Learning } from "../types.ts";
import { seedProject, seedTicket, seedEpic } from "./test-helpers.ts";

let db: Database.Database;

beforeEach(() => {
  const result = createTestDatabase();
  db = result.db;
});

describe("reconcileLearnings", () => {
  const sampleLearnings: Learning[] = [
    { type: "pattern", description: "Use dependency injection for testability" },
    { type: "anti-pattern", description: "Avoid raw SQL in business logic" },
  ];

  it("stores learnings in epic workflow state", () => {
    seedProject(db);
    seedEpic(db);
    seedTicket(db, { id: "t1", epicId: "epic-1", status: "done" });

    const result = reconcileLearnings(db, "t1", sampleLearnings);

    expect(result.ticketId).toBe("t1");
    expect(result.learningsStored).toBe(2);
    expect(result.docsUpdated).toEqual([]);
  });

  it("appends learnings from multiple tickets", () => {
    seedProject(db);
    seedEpic(db);
    seedTicket(db, { id: "t1", epicId: "epic-1", status: "done" });
    seedTicket(db, { id: "t2", epicId: "epic-1", status: "done" });

    reconcileLearnings(db, "t1", [{ type: "pattern", description: "Learning 1" }]);
    reconcileLearnings(db, "t2", [{ type: "pattern", description: "Learning 2" }]);

    const epicLearnings = getEpicLearnings(db, "epic-1");
    expect(epicLearnings.learnings).toHaveLength(2);
    expect(epicLearnings.learnings[0]!.ticketId).toBe("t1");
    expect(epicLearnings.learnings[1]!.ticketId).toBe("t2");
  });

  it("throws TicketNotFoundError for nonexistent ticket", () => {
    expect(() => reconcileLearnings(db, "nonexistent", sampleLearnings)).toThrow(
      TicketNotFoundError
    );
  });

  it("throws InvalidStateError when ticket is not done", () => {
    seedProject(db);
    seedEpic(db);
    seedTicket(db, { id: "t1", epicId: "epic-1", status: "in_progress" });

    expect(() => reconcileLearnings(db, "t1", sampleLearnings)).toThrow(InvalidStateError);
  });

  it("throws InvalidStateError when ticket has no epic", () => {
    seedProject(db);
    seedTicket(db, { id: "t1", status: "done" });

    expect(() => reconcileLearnings(db, "t1", sampleLearnings)).toThrow(InvalidStateError);
  });

  it("updates tickets_done count in epic workflow state", () => {
    seedProject(db);
    seedEpic(db);
    seedTicket(db, { id: "t1", epicId: "epic-1", status: "done" });
    seedTicket(db, { id: "t2", epicId: "epic-1", status: "in_progress" });

    reconcileLearnings(db, "t1", sampleLearnings);

    const state = db
      .prepare("SELECT tickets_done FROM epic_workflow_state WHERE epic_id = ?")
      .get("epic-1") as { tickets_done: number };
    expect(state.tickets_done).toBe(1);
  });
});

describe("getEpicLearnings", () => {
  it("returns learnings for an epic", () => {
    seedProject(db);
    seedEpic(db);
    seedTicket(db, { id: "t1", epicId: "epic-1", status: "done" });

    reconcileLearnings(db, "t1", [{ type: "pattern", description: "Always validate inputs" }]);

    const result = getEpicLearnings(db, "epic-1");
    expect(result.epicId).toBe("epic-1");
    expect(result.epicTitle).toBe("Epic epic-1");
    expect(result.ticketsCompleted).toBe(1);
    expect(result.learnings).toHaveLength(1);
    expect(result.learnings[0]!.learnings[0]!.description).toBe("Always validate inputs");
  });

  it("returns empty learnings when no learnings exist", () => {
    seedProject(db);
    seedEpic(db);

    const result = getEpicLearnings(db, "epic-1");
    expect(result.learnings).toEqual([]);
    expect(result.ticketsCompleted).toBe(0);
  });

  it("throws EpicNotFoundError for nonexistent epic", () => {
    expect(() => getEpicLearnings(db, "nonexistent")).toThrow(EpicNotFoundError);
  });
});
