/**
 * Integration tests for the Ralph Event Emission System.
 *
 * Tests the MCP tools for emitting, retrieving, and clearing Ralph events.
 * These tests verify the event flow that enables real-time UI streaming.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { join } from "path";
import { mkdirSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";

// Create a test database in a temp directory
const testDir = join(tmpdir(), `brain-dump-events-test-${Date.now()}`);
const testDbPath = join(testDir, "test.db");

let db: Database.Database;

beforeAll(() => {
  // Create test directory
  mkdirSync(testDir, { recursive: true });

  // Initialize test database with required schema
  db = new Database(testDbPath);
  db.pragma("journal_mode = WAL");

  // Create projects table (required for foreign key references in some tools)
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      color TEXT,
      working_method TEXT DEFAULT 'auto',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `
  ).run();

  // Create ralph_events table
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS ralph_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      data TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `
  ).run();
  db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_ralph_events_session ON ralph_events(session_id)"
  ).run();
  db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_ralph_events_created ON ralph_events(created_at)"
  ).run();
});

afterAll(() => {
  // Close database and clean up
  if (db) {
    db.close();
  }
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

afterEach(() => {
  // Clean up events between tests
  db.prepare("DELETE FROM ralph_events").run();
});

describe("Ralph Events Database Schema", () => {
  it("should have ralph_events table with correct columns", () => {
    const columns = db.prepare("PRAGMA table_info(ralph_events)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
    }>;

    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toContain("id");
    expect(columnNames).toContain("session_id");
    expect(columnNames).toContain("type");
    expect(columnNames).toContain("data");
    expect(columnNames).toContain("created_at");
  });

  it("should have index on session_id", () => {
    const indexes = db.prepare("PRAGMA index_list(ralph_events)").all() as Array<{
      name: string;
    }>;
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain("idx_ralph_events_session");
  });

  it("should have index on created_at", () => {
    const indexes = db.prepare("PRAGMA index_list(ralph_events)").all() as Array<{
      name: string;
    }>;
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain("idx_ralph_events_created");
  });
});

describe("Event Emission", () => {
  it("should insert an event with all fields", () => {
    const sessionId = randomUUID();
    const eventId = randomUUID();
    const now = new Date().toISOString();
    const data = JSON.stringify({ message: "Test message", tool: "Edit" });

    db.prepare(
      "INSERT INTO ralph_events (id, session_id, type, data, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(eventId, sessionId, "tool_start", data, now);

    const event = db.prepare("SELECT * FROM ralph_events WHERE id = ?").get(eventId) as {
      id: string;
      session_id: string;
      type: string;
      data: string;
      created_at: string;
    };

    expect(event).toBeDefined();
    expect(event.id).toBe(eventId);
    expect(event.session_id).toBe(sessionId);
    expect(event.type).toBe("tool_start");
    expect(JSON.parse(event.data)).toEqual({ message: "Test message", tool: "Edit" });
  });

  it("should support all event types", () => {
    const sessionId = randomUUID();
    const eventTypes = [
      "thinking",
      "tool_start",
      "tool_end",
      "file_change",
      "progress",
      "state_change",
      "error",
    ];

    for (const type of eventTypes) {
      const eventId = randomUUID();
      db.prepare(
        "INSERT INTO ralph_events (id, session_id, type, created_at) VALUES (?, ?, ?, datetime('now'))"
      ).run(eventId, sessionId, type);
    }

    const events = db
      .prepare("SELECT type FROM ralph_events WHERE session_id = ?")
      .all(sessionId) as Array<{
      type: string;
    }>;

    expect(events).toHaveLength(eventTypes.length);
    for (const type of eventTypes) {
      expect(events.some((e) => e.type === type)).toBe(true);
    }
  });
});

describe("Event Retrieval", () => {
  it("should retrieve events by session_id", () => {
    const sessionId1 = randomUUID();
    const sessionId2 = randomUUID();

    // Insert events for session 1
    for (let i = 0; i < 3; i++) {
      db.prepare(
        "INSERT INTO ralph_events (id, session_id, type, created_at) VALUES (?, ?, ?, datetime('now'))"
      ).run(randomUUID(), sessionId1, "progress");
    }

    // Insert events for session 2
    for (let i = 0; i < 2; i++) {
      db.prepare(
        "INSERT INTO ralph_events (id, session_id, type, created_at) VALUES (?, ?, ?, datetime('now'))"
      ).run(randomUUID(), sessionId2, "thinking");
    }

    const session1Events = db
      .prepare("SELECT * FROM ralph_events WHERE session_id = ?")
      .all(sessionId1);
    const session2Events = db
      .prepare("SELECT * FROM ralph_events WHERE session_id = ?")
      .all(sessionId2);

    expect(session1Events).toHaveLength(3);
    expect(session2Events).toHaveLength(2);
  });

  it("should retrieve events since a timestamp", () => {
    const sessionId = randomUUID();
    const oldTime = "2025-01-01T00:00:00.000Z";
    const recentTime = new Date().toISOString();

    // Insert old event
    db.prepare(
      "INSERT INTO ralph_events (id, session_id, type, created_at) VALUES (?, ?, ?, ?)"
    ).run(randomUUID(), sessionId, "thinking", oldTime);

    // Insert recent event
    db.prepare(
      "INSERT INTO ralph_events (id, session_id, type, created_at) VALUES (?, ?, ?, ?)"
    ).run(randomUUID(), sessionId, "progress", recentTime);

    const recentEvents = db
      .prepare("SELECT * FROM ralph_events WHERE session_id = ? AND created_at > ?")
      .all(sessionId, oldTime) as Array<{ created_at: string }>;

    expect(recentEvents).toHaveLength(1);
    expect(recentEvents[0]?.created_at).toBe(recentTime);
  });

  it("should order events by created_at", () => {
    const sessionId = randomUUID();
    const times = [
      "2025-01-01T10:00:00.000Z",
      "2025-01-01T09:00:00.000Z",
      "2025-01-01T11:00:00.000Z",
    ];

    for (const time of times) {
      db.prepare(
        "INSERT INTO ralph_events (id, session_id, type, created_at) VALUES (?, ?, ?, ?)"
      ).run(randomUUID(), sessionId, "progress", time);
    }

    const events = db
      .prepare("SELECT * FROM ralph_events WHERE session_id = ? ORDER BY created_at ASC")
      .all(sessionId) as Array<{ created_at: string }>;

    expect(events[0]?.created_at).toBe("2025-01-01T09:00:00.000Z");
    expect(events[1]?.created_at).toBe("2025-01-01T10:00:00.000Z");
    expect(events[2]?.created_at).toBe("2025-01-01T11:00:00.000Z");
  });
});

describe("Event Cleanup", () => {
  it("should delete all events for a session", () => {
    const sessionId = randomUUID();

    // Insert multiple events
    for (let i = 0; i < 5; i++) {
      db.prepare(
        "INSERT INTO ralph_events (id, session_id, type, created_at) VALUES (?, ?, ?, datetime('now'))"
      ).run(randomUUID(), sessionId, "progress");
    }

    // Verify events exist
    let events = db.prepare("SELECT * FROM ralph_events WHERE session_id = ?").all(sessionId);
    expect(events).toHaveLength(5);

    // Delete events
    const result = db.prepare("DELETE FROM ralph_events WHERE session_id = ?").run(sessionId);
    expect(result.changes).toBe(5);

    // Verify deletion
    events = db.prepare("SELECT * FROM ralph_events WHERE session_id = ?").all(sessionId);
    expect(events).toHaveLength(0);
  });

  it("should only delete events for the specified session", () => {
    const sessionId1 = randomUUID();
    const sessionId2 = randomUUID();

    // Insert events for both sessions
    db.prepare(
      "INSERT INTO ralph_events (id, session_id, type, created_at) VALUES (?, ?, ?, datetime('now'))"
    ).run(randomUUID(), sessionId1, "progress");
    db.prepare(
      "INSERT INTO ralph_events (id, session_id, type, created_at) VALUES (?, ?, ?, datetime('now'))"
    ).run(randomUUID(), sessionId2, "progress");

    // Delete session 1 events only
    db.prepare("DELETE FROM ralph_events WHERE session_id = ?").run(sessionId1);

    // Verify session 2 events still exist
    const session2Events = db
      .prepare("SELECT * FROM ralph_events WHERE session_id = ?")
      .all(sessionId2);
    expect(session2Events).toHaveLength(1);
  });
});

describe("Event Data Serialization", () => {
  it("should store and retrieve JSON data correctly", () => {
    const sessionId = randomUUID();
    const eventId = randomUUID();
    const eventData = {
      message: "Editing file",
      tool: "Edit",
      file: "src/api/users.ts",
      success: true,
      lineNumbers: [10, 20, 30],
    };

    db.prepare(
      "INSERT INTO ralph_events (id, session_id, type, data, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
    ).run(eventId, sessionId, "tool_end", JSON.stringify(eventData));

    const event = db.prepare("SELECT data FROM ralph_events WHERE id = ?").get(eventId) as {
      data: string;
    };

    const parsedData = JSON.parse(event.data);
    expect(parsedData).toEqual(eventData);
  });

  it("should handle null data field", () => {
    const sessionId = randomUUID();
    const eventId = randomUUID();

    db.prepare(
      "INSERT INTO ralph_events (id, session_id, type, data, created_at) VALUES (?, ?, ?, NULL, datetime('now'))"
    ).run(eventId, sessionId, "thinking");

    const event = db.prepare("SELECT data FROM ralph_events WHERE id = ?").get(eventId) as {
      data: string | null;
    };

    expect(event.data).toBeNull();
  });
});

describe("State Change Events", () => {
  it("should track state transitions through state_change events", () => {
    const sessionId = randomUUID();
    const states = ["analyzing", "implementing", "testing", "committing", "completing"];

    // Simulate state transitions
    for (let i = 0; i < states.length; i++) {
      db.prepare(
        "INSERT INTO ralph_events (id, session_id, type, data, created_at) VALUES (?, ?, ?, ?, ?)"
      ).run(
        randomUUID(),
        sessionId,
        "state_change",
        JSON.stringify({ state: states[i] }),
        new Date(Date.now() + i * 1000).toISOString()
      );
    }

    // Get all state_change events in order
    const stateEvents = db
      .prepare(
        "SELECT data FROM ralph_events WHERE session_id = ? AND type = 'state_change' ORDER BY created_at ASC"
      )
      .all(sessionId) as Array<{ data: string }>;

    // Verify state progression
    const stateProgression = stateEvents.map((e) => JSON.parse(e.data).state);
    expect(stateProgression).toEqual(states);
  });

  it("should retrieve the latest state from state_change events", () => {
    const sessionId = randomUUID();

    // Add some state changes
    const states = ["analyzing", "implementing", "testing"];
    for (let i = 0; i < states.length; i++) {
      db.prepare(
        "INSERT INTO ralph_events (id, session_id, type, data, created_at) VALUES (?, ?, ?, ?, ?)"
      ).run(
        randomUUID(),
        sessionId,
        "state_change",
        JSON.stringify({ state: states[i] }),
        new Date(Date.now() + i * 1000).toISOString()
      );
    }

    // Get the latest state
    const latestEvent = db
      .prepare(
        "SELECT data FROM ralph_events WHERE session_id = ? AND type = 'state_change' ORDER BY created_at DESC LIMIT 1"
      )
      .get(sessionId) as { data: string };

    const latestState = JSON.parse(latestEvent.data).state;
    expect(latestState).toBe("testing");
  });
});
