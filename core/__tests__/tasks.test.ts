import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import { saveTasks, getTasks, clearTasks, getTaskSnapshots } from "../tasks.ts";
import { TicketNotFoundError, ValidationError } from "../errors.ts";
import { seedProject, seedTicket } from "./test-helpers.ts";

let db: Database.Database;

beforeEach(() => {
  const result = createTestDatabase();
  db = result.db;
});

describe("saveTasks", () => {
  it("saves tasks for a ticket and returns them", () => {
    seedProject(db);
    seedTicket(db);

    const result = saveTasks(
      db,
      [
        { subject: "Task A", status: "pending", activeForm: "Working on A" },
        { subject: "Task B", status: "in_progress" },
      ],
      "ticket-1"
    );

    expect(result.ticketId).toBe("ticket-1");
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0]!.subject).toBe("Task A");
    expect(result.tasks[0]!.position).toBe(1);
    expect(result.tasks[1]!.subject).toBe("Task B");
    expect(result.tasks[1]!.position).toBe(2);
  });

  it("replaces existing tasks on re-save", () => {
    seedProject(db);
    seedTicket(db);

    saveTasks(db, [{ subject: "Old task", status: "pending" }], "ticket-1");
    const result = saveTasks(db, [{ subject: "New task", status: "completed" }], "ticket-1");

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]!.subject).toBe("New task");
    expect(result.tasks[0]!.status).toBe("completed");
  });

  it("preserves status history when task IDs match", () => {
    seedProject(db);
    seedTicket(db);

    const first = saveTasks(db, [{ id: "task-1", subject: "Task", status: "pending" }], "ticket-1");
    expect(first.tasks[0]!.id).toBe("task-1");

    saveTasks(db, [{ id: "task-1", subject: "Task", status: "in_progress" }], "ticket-1");

    const tasks = getTasks(db, "ticket-1", true);
    expect(tasks.tasks[0]!.statusHistory).toHaveLength(2);
    expect(tasks.tasks[0]!.statusHistory![0]!.status).toBe("pending");
    expect(tasks.tasks[0]!.statusHistory![1]!.status).toBe("in_progress");
  });

  it("creates snapshot when requested", () => {
    seedProject(db);
    seedTicket(db);

    const result = saveTasks(
      db,
      [{ subject: "Snapshot task", status: "pending" }],
      "ticket-1",
      true
    );

    expect(result.snapshotCreated).toBe(true);

    const snapshots = getTaskSnapshots(db, "ticket-1");
    expect(snapshots.snapshots).toHaveLength(1);
    expect(snapshots.snapshots[0]!.tasks).toHaveLength(1);
  });

  it("throws ValidationError for empty tasks array", () => {
    seedProject(db);
    seedTicket(db);

    expect(() => saveTasks(db, [], "ticket-1")).toThrow(ValidationError);
  });

  it("throws TicketNotFoundError for nonexistent ticket", () => {
    expect(() => saveTasks(db, [{ subject: "Task", status: "pending" }], "nonexistent")).toThrow(
      TicketNotFoundError
    );
  });
});

describe("getTasks", () => {
  it("returns tasks ordered by position", () => {
    seedProject(db);
    seedTicket(db);

    saveTasks(
      db,
      [
        { subject: "First", status: "pending" },
        { subject: "Second", status: "pending" },
        { subject: "Third", status: "pending" },
      ],
      "ticket-1"
    );

    const result = getTasks(db, "ticket-1");
    expect(result.tasks).toHaveLength(3);
    expect(result.tasks[0]!.subject).toBe("First");
    expect(result.tasks[2]!.subject).toBe("Third");
  });

  it("excludes status history by default", () => {
    seedProject(db);
    seedTicket(db);

    saveTasks(db, [{ subject: "Task", status: "pending" }], "ticket-1");

    const result = getTasks(db, "ticket-1");
    expect(result.tasks[0]!.statusHistory).toBeUndefined();
  });

  it("includes status history when requested", () => {
    seedProject(db);
    seedTicket(db);

    saveTasks(db, [{ subject: "Task", status: "pending" }], "ticket-1");

    const result = getTasks(db, "ticket-1", true);
    expect(result.tasks[0]!.statusHistory).toBeDefined();
    expect(result.tasks[0]!.statusHistory).toHaveLength(1);
  });
});

describe("clearTasks", () => {
  it("clears all tasks and creates a snapshot", () => {
    seedProject(db);
    seedTicket(db);

    saveTasks(
      db,
      [
        { subject: "A", status: "pending" },
        { subject: "B", status: "completed" },
      ],
      "ticket-1"
    );

    const result = clearTasks(db, "ticket-1");
    expect(result.cleared).toBe(2);
    expect(result.snapshotId).toBeTruthy();

    // Tasks are gone
    const tasks = getTasks(db, "ticket-1");
    expect(tasks.tasks).toHaveLength(0);

    // Snapshot exists
    const snapshots = getTaskSnapshots(db, "ticket-1");
    expect(snapshots.snapshots).toHaveLength(1);
    expect(snapshots.snapshots[0]!.reason).toBe("cleared");
  });

  it("throws ValidationError when no tasks to clear", () => {
    seedProject(db);
    seedTicket(db);

    expect(() => clearTasks(db, "ticket-1")).toThrow(ValidationError);
  });
});

describe("getTaskSnapshots", () => {
  it("returns multiple snapshots when tasks are cleared multiple times", () => {
    seedProject(db);
    seedTicket(db);

    saveTasks(db, [{ subject: "First batch", status: "pending" }], "ticket-1");
    clearTasks(db, "ticket-1");

    saveTasks(db, [{ subject: "Second batch", status: "pending" }], "ticket-1");
    clearTasks(db, "ticket-1");

    const snapshots = getTaskSnapshots(db, "ticket-1");
    expect(snapshots.snapshots).toHaveLength(2);
    // Both snapshots have tasks
    const subjects = snapshots.snapshots.map((s) => s.tasks[0]!.subject);
    expect(subjects).toContain("First batch");
    expect(subjects).toContain("Second batch");
  });

  it("respects limit parameter", () => {
    seedProject(db);
    seedTicket(db);

    for (let i = 0; i < 5; i++) {
      saveTasks(db, [{ subject: `Batch ${i}`, status: "pending" }], "ticket-1");
      clearTasks(db, "ticket-1");
    }

    const snapshots = getTaskSnapshots(db, "ticket-1", 2);
    expect(snapshots.snapshots).toHaveLength(2);
  });

  it("throws TicketNotFoundError for nonexistent ticket", () => {
    expect(() => getTaskSnapshots(db, "nonexistent")).toThrow(TicketNotFoundError);
  });
});
