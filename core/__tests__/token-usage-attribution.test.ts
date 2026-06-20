import { describe, expect, it, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import { resolveTokenUsageAttribution } from "../cost.ts";
import { seedProject, seedTicket } from "./test-helpers.ts";

let db: Database.Database;

function seedTelemetrySession(options: {
  id: string;
  ticketId: string;
  projectId?: string;
  startedAt: string;
  endedAt?: string | null;
}): void {
  db.prepare(
    `INSERT INTO telemetry_sessions (id, ticket_id, project_id, environment, started_at, ended_at)
     VALUES (?, ?, ?, 'claude-code', ?, ?)`
  ).run(
    options.id,
    options.ticketId,
    options.projectId ?? "proj-1",
    options.startedAt,
    options.endedAt ?? null
  );
}

function seedTelemetryEvent(sessionId: string, ticketId: string, createdAt: string): void {
  db.prepare(
    `INSERT INTO telemetry_events (id, session_id, ticket_id, event_type, created_at)
     VALUES (?, ?, ?, 'prompt', ?)`
  ).run(`event-${sessionId}-${createdAt}`, sessionId, ticketId, createdAt);
}

beforeEach(() => {
  const result = createTestDatabase();
  db = result.db;
  seedProject(db, { id: "proj-1", path: "/work/project" });
  seedTicket(db, { id: "ticket-1", projectId: "proj-1" });
  seedTicket(db, { id: "ticket-2", projectId: "proj-1" });
});

describe("resolveTokenUsageAttribution", () => {
  it("prefers explicit session and ticket attribution", () => {
    const result = resolveTokenUsageAttribution(db, {
      telemetrySessionId: "session-explicit",
      ticketId: "ticket-explicit",
      projectPath: "/work/project",
      eventTime: "2026-01-01T10:00:00.000Z",
    });

    expect(result).toMatchObject({
      telemetrySessionId: "session-explicit",
      ticketId: "ticket-explicit",
      source: "explicit",
      skipped: false,
    });
  });

  it("uses explicit ticket as a constraint while still resolving the matching session", () => {
    seedTelemetrySession({
      id: "session-one",
      ticketId: "ticket-1",
      startedAt: "2026-01-01T10:00:00.000Z",
      endedAt: "2026-01-01T10:10:00.000Z",
    });
    seedTelemetryEvent("session-one", "ticket-1", "2026-01-01T10:02:00.000Z");
    seedTelemetryEvent("session-one", "ticket-1", "2026-01-01T10:08:00.000Z");

    const result = resolveTokenUsageAttribution(db, {
      ticketId: "ticket-1",
      projectPath: "/work/project",
      transcriptPath: "/logs/claude-one.jsonl",
      eventStart: "2026-01-01T10:03:00.000Z",
      eventEnd: "2026-01-01T10:04:00.000Z",
    });

    expect(result).toMatchObject({
      telemetrySessionId: "session-one",
      ticketId: "ticket-1",
      source: "project-event-window",
      skipped: false,
    });
  });

  it("resolves by project and transcript event window instead of newest active session", () => {
    seedTelemetrySession({
      id: "session-one",
      ticketId: "ticket-1",
      startedAt: "2026-01-01T10:00:00.000Z",
      endedAt: "2026-01-01T10:10:00.000Z",
    });
    seedTelemetryEvent("session-one", "ticket-1", "2026-01-01T10:02:00.000Z");
    seedTelemetryEvent("session-one", "ticket-1", "2026-01-01T10:08:00.000Z");

    seedTelemetrySession({
      id: "session-two",
      ticketId: "ticket-2",
      startedAt: "2026-01-01T10:20:00.000Z",
      endedAt: null,
    });

    const result = resolveTokenUsageAttribution(db, {
      projectPath: "/work/project",
      transcriptPath: "/logs/claude-one.jsonl",
      eventStart: "2026-01-01T10:03:00.000Z",
      eventEnd: "2026-01-01T10:04:00.000Z",
    });

    expect(result).toMatchObject({
      telemetrySessionId: "session-one",
      ticketId: "ticket-1",
      source: "project-event-window",
      skipped: false,
    });
  });

  it("skips ambiguous attribution when multiple active sessions match the same project window", () => {
    seedTelemetrySession({
      id: "session-one",
      ticketId: "ticket-1",
      startedAt: "2026-01-01T10:00:00.000Z",
      endedAt: null,
    });
    seedTelemetrySession({
      id: "session-two",
      ticketId: "ticket-2",
      startedAt: "2026-01-01T10:05:00.000Z",
      endedAt: null,
    });

    const result = resolveTokenUsageAttribution(db, {
      projectPath: "/work/project",
      transcriptPath: "/logs/ambiguous.jsonl",
      eventTime: "2026-01-01T10:06:00.000Z",
    });

    expect(result.skipped).toBe(true);
    expect(result.warning).toContain("2 active telemetry sessions");
  });

  it("keeps valid single-session project attribution working", () => {
    seedTelemetrySession({
      id: "session-one",
      ticketId: "ticket-1",
      startedAt: "2026-01-01T10:00:00.000Z",
      endedAt: null,
    });

    const result = resolveTokenUsageAttribution(db, {
      projectPath: "/work/project",
      transcriptPath: "/logs/single.jsonl",
      eventTime: "2026-01-01T10:06:00.000Z",
    });

    expect(result).toMatchObject({
      telemetrySessionId: "session-one",
      ticketId: "ticket-1",
      source: "project-active-session",
      skipped: false,
    });
  });

  it("skips instead of using an unrelated global active session when context is missing", () => {
    seedTelemetrySession({
      id: "session-one",
      ticketId: "ticket-1",
      startedAt: "2026-01-01T10:00:00.000Z",
      endedAt: null,
    });

    const result = resolveTokenUsageAttribution(db, {
      eventTime: "2026-01-01T10:06:00.000Z",
    });

    expect(result.skipped).toBe(true);
    expect(result.warning).toContain("provide --session/--ticket or --project-path");
  });
});
