import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import {
  computeEpicProgressPercent,
  computeEpicTicketCounts,
  refreshEpicWorkflowTicketCounts,
} from "../epic-progress.ts";
import { seedProject, seedEpic, seedTicket } from "./test-helpers.ts";

let db: Database.Database;

beforeEach(() => {
  const result = createTestDatabase();
  db = result.db;
});

describe("computeEpicProgressPercent", () => {
  it("caps progress at 100% when done count exceeds stale total", () => {
    expect(computeEpicProgressPercent(27, 14)).toBe(100);
  });

  it("reports live progress when counts are consistent", () => {
    expect(computeEpicProgressPercent(27, 28)).toBe(96);
  });

  it("returns 0 when there are no tickets", () => {
    expect(computeEpicProgressPercent(0, 0)).toBe(0);
  });
});

describe("computeEpicTicketCounts", () => {
  it("derives totals from live status buckets", () => {
    const counts = computeEpicTicketCounts({
      backlog: 2,
      ready: 3,
      in_progress: 1,
      done: 27,
    });

    expect(counts.ticketsTotal).toBe(33);
    expect(counts.ticketsDone).toBe(27);
    expect(counts.progressPercent).toBe(82);
  });
});

describe("refreshEpicWorkflowTicketCounts", () => {
  it("keeps stored totals in sync after tickets are added post-launch", () => {
    seedProject(db);
    seedEpic(db, { id: "epic-1" });
    seedTicket(db, { id: "t1", epicId: "epic-1", status: "done" });

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO epic_workflow_state (id, epic_id, tickets_total, tickets_done, learnings, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("ews-1", "epic-1", 1, 0, "[]", now, now);

    for (let i = 2; i <= 28; i++) {
      seedTicket(db, {
        id: `t${i}`,
        epicId: "epic-1",
        status: i <= 27 ? "done" : "in_progress",
      });
    }

    const refreshed = refreshEpicWorkflowTicketCounts(db, "epic-1");
    expect(refreshed.ticketsTotal).toBe(28);
    expect(refreshed.ticketsDone).toBe(27);

    const liveCounts = computeEpicTicketCounts({
      done: 27,
      in_progress: 1,
    });
    expect(liveCounts.progressPercent).toBeLessThanOrEqual(100);
    expect(liveCounts.progressPercent).toBe(96);
  });
});
