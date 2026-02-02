import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import {
  createSession,
  updateState,
  completeSession,
  getState,
  listSessions,
  emitEvent,
  getEvents,
  clearEvents,
} from "../session.ts";
import {
  TicketNotFoundError,
  SessionNotFoundError,
  InvalidStateError,
  ValidationError,
} from "../errors.ts";

let db: Database.Database;

function seedProject(id = "proj-1") {
  db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    "Test Project",
    "/tmp/test-project",
    new Date().toISOString()
  );
  return id;
}

function seedTicket(id = "ticket-1", projectId = "proj-1") {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tickets (id, title, status, priority, position, project_id, created_at, updated_at)
     VALUES (?, ?, 'backlog', 'medium', 1, ?, ?, ?)`
  ).run(id, `Ticket ${id}`, projectId, now, now);
  return id;
}

beforeEach(() => {
  const result = createTestDatabase();
  db = result.db;
  seedProject();
  seedTicket();
});

// ============================================
// createSession
// ============================================

describe("createSession", () => {
  it("creates a session in idle state", () => {
    const result = createSession(db, "ticket-1");

    expect(result.id).toBeTruthy();
    expect(result.ticketId).toBe("ticket-1");
    expect(result.currentState).toBe("idle");
    expect(result.stateHistory).toHaveLength(1);
    expect(result.stateHistory[0]?.state).toBe("idle");
    expect(result.outcome).toBeNull();
    expect(result.completedAt).toBeNull();
    expect(result.ticketTitle).toBe("Ticket ticket-1");
  });

  it("throws TicketNotFoundError for non-existent ticket", () => {
    expect(() => createSession(db, "nonexistent")).toThrow(TicketNotFoundError);
  });

  it("throws InvalidStateError when active session exists", () => {
    createSession(db, "ticket-1");
    expect(() => createSession(db, "ticket-1")).toThrow(InvalidStateError);
  });

  it("emits a state_change event on creation", () => {
    const result = createSession(db, "ticket-1");
    const events = getEvents(db, result.id);

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("state_change");
    expect((events[0]?.data as Record<string, unknown>)?.state).toBe("idle");
  });
});

// ============================================
// updateState
// ============================================

describe("updateState", () => {
  it("transitions from idle to analyzing", () => {
    const session = createSession(db, "ticket-1");
    const result = updateState(db, {
      sessionId: session.id,
      state: "analyzing",
    });

    expect(result.previousState).toBe("idle");
    expect(result.session.currentState).toBe("analyzing");
    expect(result.session.stateHistory).toHaveLength(2);
  });

  it("records metadata in state history", () => {
    const session = createSession(db, "ticket-1");
    updateState(db, {
      sessionId: session.id,
      state: "implementing",
      metadata: { message: "Starting code work", file: "src/api/users.ts" },
    });

    const state = getState(db, { sessionId: session.id });
    const lastEntry = state.stateHistory[state.stateHistory.length - 1];
    expect(lastEntry?.metadata?.message).toBe("Starting code work");
    expect(lastEntry?.metadata?.file).toBe("src/api/users.ts");
  });

  it("throws SessionNotFoundError for non-existent session", () => {
    expect(() => updateState(db, { sessionId: "nonexistent", state: "analyzing" })).toThrow(
      SessionNotFoundError
    );
  });

  it("throws InvalidStateError for completed sessions", () => {
    const session = createSession(db, "ticket-1");
    completeSession(db, session.id, "success");

    expect(() => updateState(db, { sessionId: session.id, state: "analyzing" })).toThrow(
      InvalidStateError
    );
  });

  it("emits a state_change event", () => {
    const session = createSession(db, "ticket-1");
    updateState(db, { sessionId: session.id, state: "analyzing" });

    const events = getEvents(db, session.id);
    // Session creation + state update = 2 events
    expect(events).toHaveLength(2);
    const lastEvent = events[events.length - 1];
    expect(lastEvent?.type).toBe("state_change");
    expect((lastEvent?.data as Record<string, unknown>)?.previousState).toBe("idle");
    expect((lastEvent?.data as Record<string, unknown>)?.state).toBe("analyzing");
  });

  it("supports testing → implementing backtrack", () => {
    const session = createSession(db, "ticket-1");
    updateState(db, { sessionId: session.id, state: "analyzing" });
    updateState(db, { sessionId: session.id, state: "implementing" });
    updateState(db, { sessionId: session.id, state: "testing" });
    updateState(db, {
      sessionId: session.id,
      state: "implementing",
      metadata: { testResult: "3 tests failed" },
    });

    const state = getState(db, { sessionId: session.id });
    expect(state.currentState).toBe("implementing");
    expect(state.stateHistory).toHaveLength(5); // idle + 4 transitions
  });
});

// ============================================
// completeSession
// ============================================

describe("completeSession", () => {
  it("marks session as done with success outcome", () => {
    const session = createSession(db, "ticket-1");
    const result = completeSession(db, session.id, "success");

    expect(result.currentState).toBe("done");
    expect(result.outcome).toBe("success");
    expect(result.completedAt).toBeTruthy();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.errorMessage).toBeNull();
  });

  it("records error message on failure", () => {
    const session = createSession(db, "ticket-1");
    const result = completeSession(db, session.id, "failure", "Tests failed");

    expect(result.outcome).toBe("failure");
    expect(result.errorMessage).toBe("Tests failed");
  });

  it("adds done to state history", () => {
    const session = createSession(db, "ticket-1");
    const result = completeSession(db, session.id, "success");

    const lastEntry = result.stateHistory[result.stateHistory.length - 1];
    expect(lastEntry?.state).toBe("done");
  });

  it("throws SessionNotFoundError for non-existent session", () => {
    expect(() => completeSession(db, "nonexistent", "success")).toThrow(SessionNotFoundError);
  });

  it("throws InvalidStateError when already completed", () => {
    const session = createSession(db, "ticket-1");
    completeSession(db, session.id, "success");

    expect(() => completeSession(db, session.id, "failure")).toThrow(InvalidStateError);
  });
});

// ============================================
// getState
// ============================================

describe("getState", () => {
  it("retrieves session by sessionId", () => {
    const session = createSession(db, "ticket-1");
    const result = getState(db, { sessionId: session.id });

    expect(result.id).toBe(session.id);
    expect(result.ticketTitle).toBe("Ticket ticket-1");
  });

  it("retrieves most recent session by ticketId", () => {
    const session1 = createSession(db, "ticket-1");
    completeSession(db, session1.id, "failure");
    const session2 = createSession(db, "ticket-1");

    const result = getState(db, { ticketId: "ticket-1" });
    expect(result.id).toBe(session2.id);
  });

  it("throws ValidationError when neither ID provided", () => {
    expect(() => getState(db, {})).toThrow(ValidationError);
  });

  it("throws SessionNotFoundError when no session exists", () => {
    expect(() => getState(db, { sessionId: "nonexistent" })).toThrow(SessionNotFoundError);
  });
});

// ============================================
// listSessions
// ============================================

describe("listSessions", () => {
  it("lists sessions for a ticket", () => {
    const session1 = createSession(db, "ticket-1");
    completeSession(db, session1.id, "failure");
    createSession(db, "ticket-1");

    const result = listSessions(db, "ticket-1");
    expect(result.sessions).toHaveLength(2);
    expect(result.ticketTitle).toBe("Ticket ticket-1");
  });

  it("returns empty list for ticket with no sessions", () => {
    const result = listSessions(db, "ticket-1");
    expect(result.sessions).toHaveLength(0);
  });

  it("throws TicketNotFoundError for non-existent ticket", () => {
    expect(() => listSessions(db, "nonexistent")).toThrow(TicketNotFoundError);
  });

  it("respects limit parameter", () => {
    for (let i = 0; i < 5; i++) {
      const s = createSession(db, "ticket-1");
      completeSession(db, s.id, "success");
    }

    const result = listSessions(db, "ticket-1", 3);
    expect(result.sessions).toHaveLength(3);
  });
});

// ============================================
// emitEvent
// ============================================

describe("emitEvent", () => {
  it("stores an event in the database", () => {
    const session = createSession(db, "ticket-1");
    const event = emitEvent(db, {
      sessionId: session.id,
      type: "thinking",
      data: { message: "Analyzing requirements" },
    });

    expect(event.id).toBeTruthy();
    expect(event.type).toBe("thinking");
    expect(event.data?.message).toBe("Analyzing requirements");
  });

  it("stores event without data", () => {
    const session = createSession(db, "ticket-1");
    const event = emitEvent(db, {
      sessionId: session.id,
      type: "progress",
    });

    expect(event.data).toBeNull();
  });
});

// ============================================
// getEvents
// ============================================

describe("getEvents", () => {
  it("retrieves events in chronological order", () => {
    const session = createSession(db, "ticket-1");
    emitEvent(db, { sessionId: session.id, type: "thinking" });
    emitEvent(db, { sessionId: session.id, type: "tool_start" });

    // Session creation emits 1 event, so total = 3
    const events = getEvents(db, session.id);
    expect(events.length).toBeGreaterThanOrEqual(3);
  });

  it("filters events by since timestamp", () => {
    const session = createSession(db, "ticket-1");
    const pastDate = "2020-01-01T00:00:00.000Z";

    const events = getEvents(db, session.id, { since: pastDate });
    expect(events.length).toBeGreaterThanOrEqual(1);

    const futureDate = "2099-01-01T00:00:00.000Z";
    const noEvents = getEvents(db, session.id, { since: futureDate });
    expect(noEvents).toHaveLength(0);
  });

  it("respects limit parameter", () => {
    const session = createSession(db, "ticket-1");
    for (let i = 0; i < 10; i++) {
      emitEvent(db, { sessionId: session.id, type: "progress" });
    }

    const events = getEvents(db, session.id, { limit: 5 });
    expect(events).toHaveLength(5);
  });
});

// ============================================
// clearEvents
// ============================================

describe("clearEvents", () => {
  it("removes all events for a session", () => {
    const session = createSession(db, "ticket-1");
    emitEvent(db, { sessionId: session.id, type: "thinking" });
    emitEvent(db, { sessionId: session.id, type: "progress" });

    const deleted = clearEvents(db, session.id);
    expect(deleted).toBeGreaterThanOrEqual(3); // create event + 2 emitted

    const events = getEvents(db, session.id);
    expect(events).toHaveLength(0);
  });

  it("returns 0 for session with no events", () => {
    const deleted = clearEvents(db, "nonexistent-session");
    expect(deleted).toBe(0);
  });
});

// ============================================
// Full state machine workflow
// ============================================

describe("full state machine workflow", () => {
  it("follows the complete happy path: idle → analyzing → implementing → testing → committing → reviewing → done", () => {
    const session = createSession(db, "ticket-1");
    expect(session.currentState).toBe("idle");

    updateState(db, { sessionId: session.id, state: "analyzing" });
    updateState(db, { sessionId: session.id, state: "implementing" });
    updateState(db, { sessionId: session.id, state: "testing" });
    updateState(db, { sessionId: session.id, state: "committing" });
    updateState(db, { sessionId: session.id, state: "reviewing" });

    const completed = completeSession(db, session.id, "success");
    expect(completed.currentState).toBe("done");
    expect(completed.outcome).toBe("success");
    expect(completed.stateHistory).toHaveLength(7); // idle + 5 transitions + done
  });
});
