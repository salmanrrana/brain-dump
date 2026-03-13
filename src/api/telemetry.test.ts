import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { randomUUID } from "crypto";
import { join } from "path";
import { existsSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import * as schema from "../lib/schema";
import { loadLatestTelemetrySession, loadTelemetryStats } from "./telemetry";

const TEST_DB_DIR = join(tmpdir(), "brain-dump-telemetry-api-tests");

function ensureTestDbDir(): void {
  if (!existsSync(TEST_DB_DIR)) {
    mkdirSync(TEST_DB_DIR, { recursive: true });
  }
}

function createTestDatabase() {
  ensureTestDbDir();
  const dbPath = join(TEST_DB_DIR, `telemetry-api-${randomUUID()}.db`);
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");

  return {
    sqlite,
    db: drizzle(sqlite, { schema }),
    cleanup: () => {
      sqlite.close();
      rmSync(dbPath, { force: true });
    },
  };
}

function createTelemetrySessionsTable(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE telemetry_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      ticket_id TEXT,
      project_id TEXT,
      environment TEXT NOT NULL DEFAULT 'unknown',
      branch_name TEXT,
      claude_session_id TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      total_prompts INTEGER DEFAULT 0,
      total_tool_calls INTEGER DEFAULT 0,
      total_duration_ms INTEGER,
      total_tokens INTEGER,
      outcome TEXT
    )
  `);
}

function createTelemetryEventsTable(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE telemetry_events (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      ticket_id TEXT,
      event_type TEXT NOT NULL,
      tool_name TEXT,
      event_data TEXT,
      duration_ms INTEGER,
      token_count INTEGER,
      is_error INTEGER DEFAULT 0,
      correlation_id TEXT,
      created_at TEXT NOT NULL
    )
  `);
}

describe("telemetry API helpers", () => {
  const cleanupFns: Array<() => void> = [];

  beforeEach(() => {
    cleanupFns.length = 0;
  });

  afterEach(() => {
    for (const cleanup of cleanupFns) {
      cleanup();
    }
  });

  it("returns an unavailable result when the telemetry schema has not been created", () => {
    const testDb = createTestDatabase();
    cleanupFns.push(testDb.cleanup);

    const result = loadTelemetryStats(testDb.db, "ticket-1");

    expect(result).toEqual({
      status: "unavailable",
      reason: "missing_schema",
      message:
        "Telemetry is unavailable for this ticket because this Brain Dump install still needs the telemetry schema upgrade.",
    });
  });

  it("returns an unavailable result when only part of the telemetry schema exists", () => {
    const testDb = createTestDatabase();
    cleanupFns.push(testDb.cleanup);
    createTelemetrySessionsTable(testDb.sqlite);

    testDb.sqlite
      .prepare(
        `INSERT INTO telemetry_sessions
         (id, ticket_id, project_id, environment, started_at, total_prompts, total_tool_calls, total_duration_ms)
         VALUES (?, ?, ?, 'claude-code', ?, 1, 2, 3000)`
      )
      .run("session-1", "ticket-1", "project-1", "2026-03-08T00:00:00.000Z");

    const result = loadTelemetryStats(testDb.db, "ticket-1");

    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toBe("missing_schema");
    }
  });

  it("returns an unavailable result when telemetry event data is malformed", () => {
    const testDb = createTestDatabase();
    cleanupFns.push(testDb.cleanup);
    createTelemetrySessionsTable(testDb.sqlite);
    createTelemetryEventsTable(testDb.sqlite);

    testDb.sqlite
      .prepare(
        `INSERT INTO telemetry_sessions
         (id, ticket_id, project_id, environment, started_at, total_prompts, total_tool_calls, total_duration_ms)
         VALUES (?, ?, ?, 'claude-code', ?, 1, 1, 1200)`
      )
      .run("session-1", "ticket-1", "project-1", "2026-03-08T00:00:00.000Z");

    testDb.sqlite
      .prepare(
        `INSERT INTO telemetry_events
         (id, session_id, ticket_id, event_type, tool_name, event_data, created_at)
         VALUES (?, ?, ?, 'tool_end', 'Edit', ?, ?)`
      )
      .run("event-1", "session-1", "ticket-1", "{bad json", "2026-03-08T00:00:10.000Z");

    const result = loadLatestTelemetrySession(testDb.db, "ticket-1");

    expect(result).toEqual({
      status: "unavailable",
      reason: "invalid_event_data",
      message:
        "Telemetry timeline is unavailable because one or more stored event payloads are malformed.",
    });
  });

  it("returns an empty available result when no telemetry has been recorded yet", () => {
    const testDb = createTestDatabase();
    cleanupFns.push(testDb.cleanup);
    createTelemetrySessionsTable(testDb.sqlite);
    createTelemetryEventsTable(testDb.sqlite);

    const result = loadTelemetryStats(testDb.db, "ticket-1");

    expect(result).toEqual({
      status: "available",
      totalSessions: 0,
      totalPrompts: 0,
      totalToolCalls: 0,
      totalDurationMs: 0,
      avgSessionDurationMs: 0,
      mostUsedTools: [],
      successRate: 0,
      errorCount: 0,
      latestSession: null,
    });
  });
});
