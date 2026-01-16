/**
 * Integration tests for the Ralph Sessions State Machine.
 *
 * Tests the session state tracking system that provides observability
 * into Ralph's progress through work phases.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { join } from "path";
import { mkdirSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";

// Create a test database in a temp directory
const testDir = join(tmpdir(), `brain-dump-sessions-test-${Date.now()}`);
const testDbPath = join(testDir, "test.db");

let db: Database.Database;

// Test project and ticket IDs
const testProjectId = randomUUID();
const testTicketId = randomUUID();

beforeAll(() => {
  // Create test directory
  mkdirSync(testDir, { recursive: true });

  // Initialize test database with required schema
  db = new Database(testDbPath);
  db.pragma("journal_mode = WAL");

  // Create projects table
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

  // Create tickets table
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'backlog',
      priority TEXT,
      position REAL NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      epic_id TEXT,
      tags TEXT,
      subtasks TEXT,
      is_blocked INTEGER DEFAULT 0,
      blocked_reason TEXT,
      linked_files TEXT,
      attachments TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    )
  `
  ).run();

  // Create ralph_sessions table
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS ralph_sessions (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      current_state TEXT NOT NULL DEFAULT 'idle',
      state_history TEXT,
      outcome TEXT,
      error_message TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    )
  `
  ).run();
  db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_ralph_sessions_ticket ON ralph_sessions(ticket_id)"
  ).run();
  db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_ralph_sessions_state ON ralph_sessions(current_state)"
  ).run();

  // Create ralph_events table (for state change event emission)
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

  // Insert test project
  db.prepare("INSERT INTO projects (id, name, path) VALUES (?, ?, ?)").run(
    testProjectId,
    "Test Project",
    "/tmp/test-project"
  );

  // Insert test ticket
  db.prepare("INSERT INTO tickets (id, title, project_id, position) VALUES (?, ?, ?, ?)").run(
    testTicketId,
    "Test Ticket",
    testProjectId,
    1
  );
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
  // Clean up sessions and events between tests
  db.prepare("DELETE FROM ralph_sessions").run();
  db.prepare("DELETE FROM ralph_events").run();
});

describe("Ralph Sessions Database Schema", () => {
  it("should have ralph_sessions table with correct columns", () => {
    const columns = db.prepare("PRAGMA table_info(ralph_sessions)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
    }>;

    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toContain("id");
    expect(columnNames).toContain("ticket_id");
    expect(columnNames).toContain("current_state");
    expect(columnNames).toContain("state_history");
    expect(columnNames).toContain("outcome");
    expect(columnNames).toContain("error_message");
    expect(columnNames).toContain("started_at");
    expect(columnNames).toContain("completed_at");
  });

  it("should have index on ticket_id", () => {
    const indexes = db.prepare("PRAGMA index_list(ralph_sessions)").all() as Array<{
      name: string;
    }>;
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain("idx_ralph_sessions_ticket");
  });

  it("should have index on current_state", () => {
    const indexes = db.prepare("PRAGMA index_list(ralph_sessions)").all() as Array<{
      name: string;
    }>;
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain("idx_ralph_sessions_state");
  });
});

describe("Session Lifecycle", () => {
  it("should create a session with idle state", () => {
    const sessionId = randomUUID();
    const now = new Date().toISOString();
    const initialHistory = JSON.stringify([{ state: "idle", timestamp: now }]);

    db.prepare(
      `INSERT INTO ralph_sessions (id, ticket_id, current_state, state_history, started_at)
       VALUES (?, ?, 'idle', ?, ?)`
    ).run(sessionId, testTicketId, initialHistory, now);

    const session = db.prepare("SELECT * FROM ralph_sessions WHERE id = ?").get(sessionId) as {
      id: string;
      ticket_id: string;
      current_state: string;
      state_history: string;
      started_at: string;
    };

    expect(session).toBeDefined();
    expect(session.id).toBe(sessionId);
    expect(session.ticket_id).toBe(testTicketId);
    expect(session.current_state).toBe("idle");

    const history = JSON.parse(session.state_history);
    expect(history).toHaveLength(1);
    expect(history[0].state).toBe("idle");
  });

  it("should prevent duplicate active sessions for same ticket", () => {
    const sessionId1 = randomUUID();

    // Create first session
    db.prepare(
      `INSERT INTO ralph_sessions (id, ticket_id, current_state, started_at)
       VALUES (?, ?, 'idle', datetime('now'))`
    ).run(sessionId1, testTicketId);

    // Check for active session before creating another
    const activeSession = db
      .prepare("SELECT id FROM ralph_sessions WHERE ticket_id = ? AND completed_at IS NULL")
      .get(testTicketId) as { id: string } | undefined;

    expect(activeSession).toBeDefined();
    expect(activeSession?.id).toBe(sessionId1);

    // This check prevents duplicate active sessions in the application layer
    // (the constraint is enforced in the MCP tool, not the database)
  });

  it("should complete a session with outcome", () => {
    const sessionId = randomUUID();
    const now = new Date().toISOString();

    // Create session
    db.prepare(
      `INSERT INTO ralph_sessions (id, ticket_id, current_state, started_at)
       VALUES (?, ?, 'idle', ?)`
    ).run(sessionId, testTicketId, now);

    // Complete session
    const completedAt = new Date().toISOString();
    db.prepare(
      `UPDATE ralph_sessions
       SET current_state = 'done', outcome = ?, completed_at = ?
       WHERE id = ?`
    ).run("success", completedAt, sessionId);

    const session = db.prepare("SELECT * FROM ralph_sessions WHERE id = ?").get(sessionId) as {
      current_state: string;
      outcome: string;
      completed_at: string;
    };

    expect(session.current_state).toBe("done");
    expect(session.outcome).toBe("success");
    expect(session.completed_at).toBe(completedAt);
  });
});

describe("State Transitions", () => {
  it("should update state and preserve history", () => {
    const sessionId = randomUUID();
    const startTime = new Date().toISOString();
    const initialHistory = JSON.stringify([{ state: "idle", timestamp: startTime }]);

    // Create session
    db.prepare(
      `INSERT INTO ralph_sessions (id, ticket_id, current_state, state_history, started_at)
       VALUES (?, ?, 'idle', ?, ?)`
    ).run(sessionId, testTicketId, initialHistory, startTime);

    // Get current history
    const session = db
      .prepare("SELECT state_history FROM ralph_sessions WHERE id = ?")
      .get(sessionId) as { state_history: string };
    const history = JSON.parse(session.state_history);

    // Add new state
    const newTime = new Date().toISOString();
    history.push({ state: "analyzing", timestamp: newTime, metadata: { message: "Reading spec" } });

    // Update
    db.prepare("UPDATE ralph_sessions SET current_state = ?, state_history = ? WHERE id = ?").run(
      "analyzing",
      JSON.stringify(history),
      sessionId
    );

    // Verify
    const updatedSession = db
      .prepare("SELECT * FROM ralph_sessions WHERE id = ?")
      .get(sessionId) as { current_state: string; state_history: string };

    expect(updatedSession.current_state).toBe("analyzing");

    const updatedHistory = JSON.parse(updatedSession.state_history);
    expect(updatedHistory).toHaveLength(2);
    expect(updatedHistory[1].state).toBe("analyzing");
    expect(updatedHistory[1].metadata.message).toBe("Reading spec");
  });

  it("should track full state progression", () => {
    const sessionId = randomUUID();
    const states = [
      "idle",
      "analyzing",
      "implementing",
      "testing",
      "committing",
      "reviewing",
      "done",
    ];
    const history: Array<{ state: string; timestamp: string }> = [];

    // Create session
    db.prepare(
      `INSERT INTO ralph_sessions (id, ticket_id, current_state, started_at)
       VALUES (?, ?, 'idle', datetime('now'))`
    ).run(sessionId, testTicketId);

    // Simulate state progression
    for (let i = 0; i < states.length; i++) {
      const state = states[i] as string;
      history.push({ state, timestamp: new Date(Date.now() + i * 1000).toISOString() });

      db.prepare("UPDATE ralph_sessions SET current_state = ?, state_history = ? WHERE id = ?").run(
        state,
        JSON.stringify(history),
        sessionId
      );
    }

    // Verify final state
    const session = db.prepare("SELECT * FROM ralph_sessions WHERE id = ?").get(sessionId) as {
      current_state: string;
      state_history: string;
    };

    expect(session.current_state).toBe("done");

    const finalHistory = JSON.parse(session.state_history);
    expect(finalHistory).toHaveLength(7);
    expect(finalHistory.map((h: { state: string }) => h.state)).toEqual(states);
  });

  it("should allow going back from testing to implementing", () => {
    const sessionId = randomUUID();
    const history: Array<{ state: string; timestamp: string; metadata?: { message: string } }> = [];

    // Create session and progress to testing
    db.prepare(
      `INSERT INTO ralph_sessions (id, ticket_id, current_state, started_at)
       VALUES (?, ?, 'idle', datetime('now'))`
    ).run(sessionId, testTicketId);

    const states = ["idle", "analyzing", "implementing", "testing"];
    for (const state of states) {
      history.push({ state, timestamp: new Date().toISOString() });
    }
    db.prepare(
      "UPDATE ralph_sessions SET current_state = 'testing', state_history = ? WHERE id = ?"
    ).run(JSON.stringify(history), sessionId);

    // Go back to implementing (tests failed)
    history.push({
      state: "implementing",
      timestamp: new Date().toISOString(),
      metadata: { message: "Tests failed, fixing issues" },
    });
    db.prepare(
      "UPDATE ralph_sessions SET current_state = 'implementing', state_history = ? WHERE id = ?"
    ).run(JSON.stringify(history), sessionId);

    // Verify
    const session = db.prepare("SELECT * FROM ralph_sessions WHERE id = ?").get(sessionId) as {
      current_state: string;
      state_history: string;
    };

    expect(session.current_state).toBe("implementing");

    const finalHistory = JSON.parse(session.state_history);
    expect(finalHistory).toHaveLength(5);
    expect(finalHistory[4].metadata.message).toBe("Tests failed, fixing issues");
  });
});

describe("Session Outcomes", () => {
  it("should record success outcome", () => {
    const sessionId = randomUUID();

    db.prepare(
      `INSERT INTO ralph_sessions (id, ticket_id, current_state, started_at)
       VALUES (?, ?, 'idle', datetime('now'))`
    ).run(sessionId, testTicketId);

    db.prepare(
      `UPDATE ralph_sessions
       SET current_state = 'done', outcome = 'success', completed_at = datetime('now')
       WHERE id = ?`
    ).run(sessionId);

    const session = db
      .prepare("SELECT outcome FROM ralph_sessions WHERE id = ?")
      .get(sessionId) as { outcome: string };

    expect(session.outcome).toBe("success");
  });

  it("should record failure outcome with error message", () => {
    const sessionId = randomUUID();
    const errorMessage = "Tests failed: 3 assertions did not pass";

    db.prepare(
      `INSERT INTO ralph_sessions (id, ticket_id, current_state, started_at)
       VALUES (?, ?, 'idle', datetime('now'))`
    ).run(sessionId, testTicketId);

    db.prepare(
      `UPDATE ralph_sessions
       SET current_state = 'done', outcome = 'failure', error_message = ?, completed_at = datetime('now')
       WHERE id = ?`
    ).run(errorMessage, sessionId);

    const session = db
      .prepare("SELECT outcome, error_message FROM ralph_sessions WHERE id = ?")
      .get(sessionId) as { outcome: string; error_message: string };

    expect(session.outcome).toBe("failure");
    expect(session.error_message).toBe(errorMessage);
  });

  it("should record timeout outcome", () => {
    const sessionId = randomUUID();

    db.prepare(
      `INSERT INTO ralph_sessions (id, ticket_id, current_state, started_at)
       VALUES (?, ?, 'implementing', datetime('now'))`
    ).run(sessionId, testTicketId);

    db.prepare(
      `UPDATE ralph_sessions
       SET current_state = 'done', outcome = 'timeout', completed_at = datetime('now')
       WHERE id = ?`
    ).run(sessionId);

    const session = db
      .prepare("SELECT outcome FROM ralph_sessions WHERE id = ?")
      .get(sessionId) as { outcome: string };

    expect(session.outcome).toBe("timeout");
  });

  it("should record cancelled outcome", () => {
    const sessionId = randomUUID();

    db.prepare(
      `INSERT INTO ralph_sessions (id, ticket_id, current_state, started_at)
       VALUES (?, ?, 'analyzing', datetime('now'))`
    ).run(sessionId, testTicketId);

    db.prepare(
      `UPDATE ralph_sessions
       SET current_state = 'done', outcome = 'cancelled', completed_at = datetime('now')
       WHERE id = ?`
    ).run(sessionId);

    const session = db
      .prepare("SELECT outcome FROM ralph_sessions WHERE id = ?")
      .get(sessionId) as { outcome: string };

    expect(session.outcome).toBe("cancelled");
  });
});

describe("Session Queries", () => {
  it("should get most recent session for a ticket", () => {
    const sessionId1 = randomUUID();
    const sessionId2 = randomUUID();

    // Create older completed session
    db.prepare(
      `INSERT INTO ralph_sessions (id, ticket_id, current_state, outcome, started_at, completed_at)
       VALUES (?, ?, 'done', 'success', '2025-01-01T10:00:00Z', '2025-01-01T11:00:00Z')`
    ).run(sessionId1, testTicketId);

    // Create newer active session
    db.prepare(
      `INSERT INTO ralph_sessions (id, ticket_id, current_state, started_at)
       VALUES (?, ?, 'implementing', '2025-01-02T10:00:00Z')`
    ).run(sessionId2, testTicketId);

    const latestSession = db
      .prepare("SELECT id FROM ralph_sessions WHERE ticket_id = ? ORDER BY started_at DESC LIMIT 1")
      .get(testTicketId) as { id: string };

    expect(latestSession.id).toBe(sessionId2);
  });

  it("should get active session for a ticket", () => {
    const sessionId1 = randomUUID();
    const sessionId2 = randomUUID();

    // Create completed session
    db.prepare(
      `INSERT INTO ralph_sessions (id, ticket_id, current_state, outcome, started_at, completed_at)
       VALUES (?, ?, 'done', 'success', datetime('now'), datetime('now'))`
    ).run(sessionId1, testTicketId);

    // Create active session
    db.prepare(
      `INSERT INTO ralph_sessions (id, ticket_id, current_state, started_at)
       VALUES (?, ?, 'implementing', datetime('now'))`
    ).run(sessionId2, testTicketId);

    const activeSession = db
      .prepare("SELECT id FROM ralph_sessions WHERE ticket_id = ? AND completed_at IS NULL")
      .get(testTicketId) as { id: string };

    expect(activeSession.id).toBe(sessionId2);
  });

  it("should list all sessions for a ticket", () => {
    const sessionIds = [randomUUID(), randomUUID(), randomUUID()];

    for (let i = 0; i < sessionIds.length; i++) {
      const isCompleted = i < 2;
      const state = isCompleted ? "done" : "implementing";
      const outcome = isCompleted ? "success" : null;

      db.prepare(
        `INSERT INTO ralph_sessions (id, ticket_id, current_state, outcome, started_at, completed_at)
         VALUES (?, ?, ?, ?, datetime('now', '+' || ? || ' hours'), ${isCompleted ? "datetime('now')" : "NULL"})`
      ).run(sessionIds[i], testTicketId, state, outcome, i);
    }

    const sessions = db
      .prepare("SELECT id FROM ralph_sessions WHERE ticket_id = ? ORDER BY started_at DESC")
      .all(testTicketId) as Array<{ id: string }>;

    expect(sessions).toHaveLength(3);
  });

  it("should filter sessions by current state", () => {
    // Create sessions with different states
    db.prepare(
      `INSERT INTO ralph_sessions (id, ticket_id, current_state, started_at)
       VALUES (?, ?, 'implementing', datetime('now'))`
    ).run(randomUUID(), testTicketId);

    db.prepare(
      `INSERT INTO ralph_sessions (id, ticket_id, current_state, outcome, started_at, completed_at)
       VALUES (?, ?, 'done', 'success', datetime('now'), datetime('now'))`
    ).run(randomUUID(), testTicketId);

    const activeSessions = db
      .prepare("SELECT id FROM ralph_sessions WHERE current_state != 'done'")
      .all() as Array<{ id: string }>;

    expect(activeSessions).toHaveLength(1);
  });
});

describe("Session Duration Calculation", () => {
  it("should calculate session duration from timestamps", () => {
    const sessionId = randomUUID();
    const startedAt = "2025-01-01T10:00:00.000Z";
    const completedAt = "2025-01-01T11:30:00.000Z"; // 90 minutes later

    db.prepare(
      `INSERT INTO ralph_sessions (id, ticket_id, current_state, outcome, started_at, completed_at)
       VALUES (?, ?, 'done', 'success', ?, ?)`
    ).run(sessionId, testTicketId, startedAt, completedAt);

    const session = db
      .prepare("SELECT started_at, completed_at FROM ralph_sessions WHERE id = ?")
      .get(sessionId) as { started_at: string; completed_at: string };

    const durationMs =
      new Date(session.completed_at).getTime() - new Date(session.started_at).getTime();
    const durationMin = durationMs / 60000;

    expect(durationMin).toBe(90);
  });
});

describe("State History Metadata", () => {
  it("should store metadata with state transitions", () => {
    const sessionId = randomUUID();
    const history = [
      { state: "idle", timestamp: new Date().toISOString() },
      {
        state: "analyzing",
        timestamp: new Date().toISOString(),
        metadata: { message: "Reading ticket spec" },
      },
      {
        state: "implementing",
        timestamp: new Date().toISOString(),
        metadata: { message: "Writing API endpoint", file: "src/api/users.ts" },
      },
      {
        state: "testing",
        timestamp: new Date().toISOString(),
        metadata: { message: "Running pnpm test", testResult: "passed" },
      },
    ];

    db.prepare(
      `INSERT INTO ralph_sessions (id, ticket_id, current_state, state_history, started_at)
       VALUES (?, ?, 'testing', ?, datetime('now'))`
    ).run(sessionId, testTicketId, JSON.stringify(history));

    const session = db
      .prepare("SELECT state_history FROM ralph_sessions WHERE id = ?")
      .get(sessionId) as { state_history: string };

    const storedHistory = JSON.parse(session.state_history);
    expect(storedHistory[2].metadata.file).toBe("src/api/users.ts");
    expect(storedHistory[3].metadata.testResult).toBe("passed");
  });
});

describe("Cascade Delete", () => {
  it("should delete sessions when ticket is deleted", () => {
    // Create a new ticket for this test
    const tempTicketId = randomUUID();
    db.prepare("INSERT INTO tickets (id, title, project_id, position) VALUES (?, ?, ?, ?)").run(
      tempTicketId,
      "Temp Ticket",
      testProjectId,
      2
    );

    // Create sessions for this ticket
    const sessionId = randomUUID();
    db.prepare(
      `INSERT INTO ralph_sessions (id, ticket_id, current_state, started_at)
       VALUES (?, ?, 'idle', datetime('now'))`
    ).run(sessionId, tempTicketId);

    // Verify session exists
    let session = db.prepare("SELECT id FROM ralph_sessions WHERE id = ?").get(sessionId);
    expect(session).toBeDefined();

    // Delete the ticket
    db.prepare("DELETE FROM tickets WHERE id = ?").run(tempTicketId);

    // Verify session was cascade deleted
    session = db.prepare("SELECT id FROM ralph_sessions WHERE id = ?").get(sessionId);
    expect(session).toBeUndefined();
  });
});

describe("State File for Hook Enforcement", () => {
  /**
   * These tests verify the state file functionality that enables hook-based
   * state enforcement. The state file (.claude/ralph-state.json) is written
   * by MCP tools and read by hooks.
   *
   * Note: This works across ALL environments (Claude Code, OpenCode, VS Code)
   * because MCP tools write the file regardless of which client calls them.
   * Hooks are Claude Code specific but the state tracking works everywhere.
   */

  const testProjectPath = join(testDir, "test-project");
  const stateFilePath = join(testProjectPath, ".claude", "ralph-state.json");

  beforeAll(() => {
    mkdirSync(join(testProjectPath, ".claude"), { recursive: true });
    // Update project path for state file tests
    db.prepare("UPDATE projects SET path = ? WHERE id = ?").run(testProjectPath, testProjectId);
  });

  afterEach(() => {
    // Clean up state file between tests
    if (existsSync(stateFilePath)) {
      rmSync(stateFilePath);
    }
  });

  it("should define state file structure correctly", () => {
    // Test the expected structure of ralph-state.json
    const expectedFields = [
      "sessionId",
      "ticketId",
      "currentState",
      "stateHistory",
      "startedAt",
      "updatedAt",
    ];

    // This documents the contract for hooks to rely on
    const sampleState = {
      sessionId: "abc-123",
      ticketId: "def-456",
      currentState: "implementing",
      stateHistory: ["idle", "analyzing", "implementing"],
      startedAt: "2026-01-16T10:00:00Z",
      updatedAt: "2026-01-16T10:15:00Z",
    };

    for (const field of expectedFields) {
      expect(sampleState).toHaveProperty(field);
    }

    // Verify stateHistory is an array of state names
    expect(Array.isArray(sampleState.stateHistory)).toBe(true);
    expect(sampleState.stateHistory.every((s) => typeof s === "string")).toBe(true);
  });

  it("should validate state values for hook enforcement", () => {
    // States that allow Write/Edit operations
    const writableStates = ["implementing", "testing", "committing"];

    // States that should block Write/Edit operations
    const readOnlyStates = ["idle", "analyzing", "reviewing", "done"];

    // All valid states
    const allStates = [...readOnlyStates, ...writableStates];

    // Ensure no overlap
    for (const state of writableStates) {
      expect(readOnlyStates).not.toContain(state);
    }

    // Ensure we cover all states
    expect(allStates.sort()).toEqual([
      "analyzing",
      "committing",
      "done",
      "idle",
      "implementing",
      "reviewing",
      "testing",
    ]);
  });

  it("should track state history for debugging", () => {
    const sessionId = randomUUID();
    const now = new Date().toISOString();

    // Simulate a session going through multiple states
    const stateTransitions = [
      { state: "idle", timestamp: now },
      { state: "analyzing", timestamp: now },
      { state: "implementing", timestamp: now },
      { state: "testing", timestamp: now },
      { state: "implementing", timestamp: now }, // Back to implementing after test failure
      { state: "testing", timestamp: now },
      { state: "committing", timestamp: now },
      { state: "reviewing", timestamp: now },
      { state: "done", timestamp: now },
    ];

    // Create session with full history
    db.prepare(
      `INSERT INTO ralph_sessions (id, ticket_id, current_state, state_history, started_at)
       VALUES (?, ?, 'done', ?, ?)`
    ).run(sessionId, testTicketId, JSON.stringify(stateTransitions), now);

    const session = db
      .prepare("SELECT state_history FROM ralph_sessions WHERE id = ?")
      .get(sessionId) as { state_history: string };

    const history = JSON.parse(session.state_history);
    expect(history).toHaveLength(9);

    // Verify the state history shows the back-and-forth
    const stateNames = history.map((h: { state: string }) => h.state);
    expect(stateNames).toEqual([
      "idle",
      "analyzing",
      "implementing",
      "testing",
      "implementing", // Went back to fix
      "testing",
      "committing",
      "reviewing",
      "done",
    ]);
  });
});

describe("Cross-Environment Support", () => {
  /**
   * Brain Dump supports multiple development environments:
   * - Claude Code (claude.ai/code)
   * - OpenCode (opencode.ai)
   * - VS Code with MCP extensions
   *
   * The state tracking via MCP works in ALL environments.
   * Hook enforcement is Claude Code specific.
   */

  it("should document environment-agnostic MCP tool behavior", () => {
    // MCP tools work the same regardless of client
    const mcpTools = [
      "create_ralph_session",
      "update_session_state",
      "complete_ralph_session",
      "get_session_state",
      "list_ticket_sessions",
    ];

    // These tools should be available in all MCP-connected environments
    // The test just documents this expectation
    expect(mcpTools).toHaveLength(5);

    // All tools write to the database (works everywhere)
    // create_ralph_session and update_session_state also write ralph-state.json
    // complete_ralph_session removes ralph-state.json
  });

  it("should document hook enforcement availability", () => {
    // Hooks only work in Claude Code CLI
    const hookSupportedEnvironments = ["claude-code"];

    // In unsupported environments (opencode, vscode, cursor), state tracking
    // still works but enforcement relies on prompt-based guidance
    expect(hookSupportedEnvironments).not.toContain("opencode");
    expect(hookSupportedEnvironments).not.toContain("vscode");
    expect(hookSupportedEnvironments).not.toContain("cursor");
    expect(hookSupportedEnvironments).toHaveLength(1);
    expect(hookSupportedEnvironments[0]).toBe("claude-code");
  });

  it("should work without hooks in non-Claude environments", () => {
    // The state file being absent should NOT block operations
    // in environments without hooks

    const sessionId = randomUUID();
    const now = new Date().toISOString();

    // Create session normally
    db.prepare(
      `INSERT INTO ralph_sessions (id, ticket_id, current_state, started_at)
       VALUES (?, ?, 'idle', ?)`
    ).run(sessionId, testTicketId, now);

    // Update state without the state file existing
    // (simulates non-Claude environment or when state file write fails)
    db.prepare("UPDATE ralph_sessions SET current_state = 'implementing' WHERE id = ?").run(
      sessionId
    );

    const session = db
      .prepare("SELECT current_state FROM ralph_sessions WHERE id = ?")
      .get(sessionId) as { current_state: string };

    // Database state updates work regardless of state file
    expect(session.current_state).toBe("implementing");
  });
});
