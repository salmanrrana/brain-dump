import { afterEach, expect, it, vi } from "vitest";
import { handle } from "../commands/telemetry.ts";
import { getDb } from "../lib/db.ts";
import { seedProject, seedTicket } from "../../core/__tests__/test-helpers.ts";

vi.mock("../lib/db.ts", async () => {
  const { createTestDatabase } = await import("../../core/db.ts");
  const database = createTestDatabase();
  return { getDb: () => database };
});
vi.mock("../../core/index.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../core/index.ts")>()),
  detectActiveTicket: () => ({ ticketId: "ticket-2", source: "ralph-state" }),
}));
afterEach(() => {
  getDb().db.prepare("DELETE FROM projects").run();
  vi.restoreAllMocks();
});

it("uses the active ticket when only a project path is supplied", async () => {
  const { db } = getDb();
  seedProject(db, { id: "proj-1", path: "/work/project" });
  seedTicket(db, { id: "ticket-2", projectId: "proj-1" });
  vi.spyOn(console, "log").mockImplementation(() => {});
  await handle("record-usage", [
    "--model",
    "claude-sonnet-4-6",
    "--input",
    "3",
    "--output",
    "10",
    "--project-path",
    "/work/project",
  ]);
  expect(db.prepare("SELECT ticket_id FROM token_usage").all()).toEqual([
    { ticket_id: "ticket-2" },
  ]);
});

it("attributes a completed transcript by its window even when another ticket is active", async () => {
  const { db } = getDb();
  seedProject(db, { id: "proj-1", path: "/work/project" });
  seedTicket(db, { id: "ticket-1", projectId: "proj-1" });
  seedTicket(db, { id: "ticket-2", projectId: "proj-1" });
  db.prepare(
    `INSERT INTO ralph_sessions (id, ticket_id, project_id, started_at, completed_at)
    VALUES ('ralph-1', 'ticket-1', 'proj-1', ?, ?)`
  ).run("2026-09-05T06:00:00.000Z", "2026-09-05T06:10:00.000Z");
  vi.spyOn(console, "log").mockImplementation(() => {});
  await handle("record-usage", [
    "--model",
    "claude-sonnet-4-6",
    "--input",
    "3",
    "--output",
    "10",
    "--project-path",
    "/work/project",
    "--transcript",
    "/tmp/finished-transcript.jsonl",
    "--event-start",
    "2026-09-05T05:59:00.000Z",
    "--event-end",
    "2026-09-05T06:11:00.000Z",
  ]);
  expect(db.prepare("SELECT ticket_id, telemetry_session_id FROM token_usage").all()).toEqual([
    { ticket_id: "ticket-1", telemetry_session_id: null },
  ]);
});
