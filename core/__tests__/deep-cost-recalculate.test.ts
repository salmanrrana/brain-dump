import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import { claudeProjectDir, seedTelemetrySessionsFromRalph } from "../deep-cost-recalculate.ts";
import { seedProject, seedTicket } from "./test-helpers.ts";

let db: Database.Database;

function seedRalphSession(options: {
  id: string;
  ticketId: string;
  projectId?: string;
  startedAt: string;
  completedAt?: string | null;
  outcome?: string | null;
}): void {
  db.prepare(
    `INSERT INTO ralph_sessions
       (id, ticket_id, project_id, current_state, state_history, outcome, started_at, completed_at)
     VALUES (?, ?, ?, 'done', ?, ?, ?, ?)`
  ).run(
    options.id,
    options.ticketId,
    options.projectId ?? "proj-1",
    JSON.stringify([{ state: "idle", timestamp: options.startedAt }]),
    options.outcome ?? "success",
    options.startedAt,
    options.completedAt ?? null
  );
}

beforeEach(() => {
  const result = createTestDatabase();
  db = result.db;
  seedProject(db, { id: "proj-1", path: "/work/project" });
});

describe("seedTelemetrySessionsFromRalph", () => {
  it("creates a telemetry session window for a completed Ralph session without telemetry", () => {
    seedTicket(db, {
      id: "ticket-1",
      projectId: "proj-1",
      branchName: "feature/epic-cost-attribution",
    });
    seedRalphSession({
      id: "ralph-1",
      ticketId: "ticket-1",
      startedAt: "2026-06-20T15:10:38.292Z",
      completedAt: "2026-06-20T15:21:42.088Z",
    });

    const result = seedTelemetrySessionsFromRalph(db);

    expect(result).toMatchObject({
      source: "ralph-telemetry-sessions",
      checked: true,
      insertedRows: 1,
      matchedSessions: 1,
    });

    const telemetry = db
      .prepare("SELECT * FROM telemetry_sessions WHERE ticket_id = ?")
      .get("ticket-1") as
      | {
          project_id: string;
          environment: string;
          branch_name: string | null;
          started_at: string;
          ended_at: string | null;
          outcome: string | null;
        }
      | undefined;

    expect(telemetry).toMatchObject({
      project_id: "proj-1",
      environment: "claude-code",
      branch_name: "feature/epic-cost-attribution",
      started_at: "2026-06-20T15:10:38.292Z",
      ended_at: "2026-06-20T15:21:42.088Z",
      outcome: "success",
    });
  });

  it("does not duplicate tickets that already have telemetry coverage", () => {
    seedTicket(db, { id: "ticket-1", projectId: "proj-1" });
    seedRalphSession({
      id: "ralph-1",
      ticketId: "ticket-1",
      startedAt: "2026-06-20T15:10:38.292Z",
      completedAt: "2026-06-20T15:21:42.088Z",
    });
    db.prepare(
      `INSERT INTO telemetry_sessions (id, ticket_id, project_id, environment, started_at, ended_at)
       VALUES ('telemetry-existing', 'ticket-1', 'proj-1', 'claude-code', ?, ?)`
    ).run("2026-06-20T15:10:00.000Z", "2026-06-20T15:22:00.000Z");

    const result = seedTelemetrySessionsFromRalph(db);

    const count = db
      .prepare("SELECT COUNT(*) as count FROM telemetry_sessions WHERE ticket_id = ?")
      .get("ticket-1") as { count: number };

    expect(result).toMatchObject({
      insertedRows: 0,
      matchedSessions: 0,
      message: "No Ralph sessions need telemetry session backfill.",
    });
    expect(count.count).toBe(1);
  });
});

describe("claudeProjectDir", () => {
  it("matches Claude's project directory sanitizer for paths with underscores", () => {
    expect(claudeProjectDir("/home/xtra/code/personal_projects/brain-dump")).toMatch(
      /\/\.claude\/projects\/-home-xtra-code-personal-projects-brain-dump$/
    );
  });
});
