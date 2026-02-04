import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import {
  startTelemetrySession,
  logPrompt,
  logTool,
  logContext,
  endTelemetrySession,
  getTelemetrySession,
  listTelemetrySessions,
  summarizeParams,
} from "../telemetry.ts";
import { SessionNotFoundError, ValidationError } from "../errors.ts";

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
     VALUES (?, ?, 'in_progress', 'medium', 1, ?, ?, ?)`
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
// startTelemetrySession
// ============================================

describe("startTelemetrySession", () => {
  it("creates a session with provided ticket ID", () => {
    const result = startTelemetrySession(db, { ticketId: "ticket-1" });

    expect(result.id).toBeTruthy();
    expect(result.ticketId).toBe("ticket-1");
    expect(result.ticketTitle).toBe("Ticket ticket-1");
    expect(result.detectionSource).toBe("provided");
    expect(result.startedAt).toBeTruthy();
  });

  it("creates a session without ticket ID", () => {
    const result = startTelemetrySession(db, {});

    expect(result.id).toBeTruthy();
    expect(result.ticketId).toBeNull();
    expect(result.detectionSource).toBe("none");
  });

  it("uses provided environment", () => {
    const result = startTelemetrySession(db, {
      ticketId: "ticket-1",
      environment: "claude-code",
    });

    expect(result.environment).toBe("claude-code");
  });

  it("falls back to detectEnvironment function", () => {
    const result = startTelemetrySession(db, { ticketId: "ticket-1" }, () => "test-env");

    expect(result.environment).toBe("test-env");
  });

  it("logs a session_start event", () => {
    const result = startTelemetrySession(db, { ticketId: "ticket-1" });
    const session = getTelemetrySession(db, { sessionId: result.id });

    expect(session.events.length).toBeGreaterThanOrEqual(1);
    expect(session.events[0]?.eventType).toBe("session_start");
  });
});

// ============================================
// logPrompt
// ============================================

describe("logPrompt", () => {
  it("logs a prompt event", () => {
    const session = startTelemetrySession(db, { ticketId: "ticket-1" });
    const result = logPrompt(db, {
      sessionId: session.id,
      prompt: "Help me fix the login bug",
    });

    expect(result.eventId).toBeTruthy();
    expect(result.promptLength).toBe("Help me fix the login bug".length);
    expect(result.redacted).toBe(false);
  });

  it("redacts prompt when requested", () => {
    const session = startTelemetrySession(db, { ticketId: "ticket-1" });
    const result = logPrompt(db, {
      sessionId: session.id,
      prompt: "My secret prompt",
      redact: true,
    });

    expect(result.redacted).toBe(true);

    // Verify the stored prompt is hashed (check via event data)
    const detail = getTelemetrySession(db, { sessionId: session.id });
    const promptEvent = detail.events.find((e) => e.eventType === "prompt");
    const eventData = promptEvent?.eventData as Record<string, unknown> | undefined;
    expect(eventData?.redacted).toBe(true);
    expect(typeof eventData?.prompt).toBe("string");
    // SHA-256 hash is 64 hex chars
    expect((eventData?.prompt as string).length).toBe(64);
  });

  it("increments session total_prompts counter", () => {
    const session = startTelemetrySession(db, { ticketId: "ticket-1" });
    logPrompt(db, { sessionId: session.id, prompt: "prompt 1" });
    logPrompt(db, { sessionId: session.id, prompt: "prompt 2" });

    const detail = getTelemetrySession(db, { sessionId: session.id });
    expect(detail.totalPrompts).toBe(2);
  });

  it("throws SessionNotFoundError for non-existent session", () => {
    expect(() => logPrompt(db, { sessionId: "nonexistent", prompt: "test" })).toThrow(
      SessionNotFoundError
    );
  });
});

// ============================================
// logTool
// ============================================

describe("logTool", () => {
  it("logs a tool start event with correlation ID", () => {
    const session = startTelemetrySession(db, { ticketId: "ticket-1" });
    const result = logTool(db, {
      sessionId: session.id,
      event: "start",
      toolName: "Edit",
    });

    expect(result.eventId).toBeTruthy();
    expect(result.correlationId).toBeTruthy();
    expect(result.eventType).toBe("tool_start");
  });

  it("logs a tool end event paired with start via correlation ID", () => {
    const session = startTelemetrySession(db, { ticketId: "ticket-1" });
    const startResult = logTool(db, {
      sessionId: session.id,
      event: "start",
      toolName: "Bash",
    });

    const endResult = logTool(db, {
      sessionId: session.id,
      event: "end",
      toolName: "Bash",
      correlationId: startResult.correlationId!,
      success: true,
      durationMs: 150,
    });

    expect(endResult.correlationId).toBe(startResult.correlationId);
    expect(endResult.eventType).toBe("tool_end");
  });

  it("increments session total_tool_calls on end events", () => {
    const session = startTelemetrySession(db, { ticketId: "ticket-1" });

    logTool(db, { sessionId: session.id, event: "start", toolName: "Read" });
    logTool(db, { sessionId: session.id, event: "end", toolName: "Read", success: true });
    logTool(db, { sessionId: session.id, event: "start", toolName: "Edit" });
    logTool(db, { sessionId: session.id, event: "end", toolName: "Edit", success: true });

    const detail = getTelemetrySession(db, { sessionId: session.id });
    expect(detail.totalToolCalls).toBe(2);
  });

  it("records error information on failed tool calls", () => {
    const session = startTelemetrySession(db, { ticketId: "ticket-1" });

    logTool(db, {
      sessionId: session.id,
      event: "end",
      toolName: "Bash",
      success: false,
      error: "Command not found",
    });

    const detail = getTelemetrySession(db, { sessionId: session.id });
    const toolEvent = detail.events.find((e) => e.eventType === "tool_end");
    expect(toolEvent?.isError).toBe(true);
  });

  it("throws SessionNotFoundError for non-existent session", () => {
    expect(() =>
      logTool(db, { sessionId: "nonexistent", event: "start", toolName: "Edit" })
    ).toThrow(SessionNotFoundError);
  });
});

// ============================================
// logContext
// ============================================

describe("logContext", () => {
  it("logs context loading information", () => {
    const session = startTelemetrySession(db, { ticketId: "ticket-1" });
    const eventId = logContext(db, {
      sessionId: session.id,
      hasDescription: true,
      hasAcceptanceCriteria: true,
      criteriaCount: 5,
      commentCount: 3,
    });

    expect(eventId).toBeTruthy();

    const detail = getTelemetrySession(db, { sessionId: session.id });
    const contextEvent = detail.events.find((e) => e.eventType === "context_loaded");
    expect(contextEvent).toBeTruthy();
    const data = contextEvent?.eventData as Record<string, unknown>;
    expect(data?.criteriaCount).toBe(5);
    expect(data?.commentCount).toBe(3);
  });

  it("throws SessionNotFoundError for non-existent session", () => {
    expect(() =>
      logContext(db, {
        sessionId: "nonexistent",
        hasDescription: true,
        hasAcceptanceCriteria: false,
      })
    ).toThrow(SessionNotFoundError);
  });
});

// ============================================
// endTelemetrySession
// ============================================

describe("endTelemetrySession", () => {
  it("ends a session with statistics", () => {
    const session = startTelemetrySession(db, { ticketId: "ticket-1" });
    logPrompt(db, { sessionId: session.id, prompt: "test prompt" });
    logTool(db, { sessionId: session.id, event: "end", toolName: "Edit", success: true });

    const result = endTelemetrySession(db, {
      sessionId: session.id,
      outcome: "success",
      totalTokens: 5000,
    });

    expect(result.sessionId).toBe(session.id);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.totalPrompts).toBe(1);
    expect(result.totalToolCalls).toBe(1);
    expect(result.totalTokens).toBe(5000);
    expect(result.outcome).toBe("success");
  });

  it("throws SessionNotFoundError for non-existent session", () => {
    expect(() => endTelemetrySession(db, { sessionId: "nonexistent" })).toThrow(
      SessionNotFoundError
    );
  });

  it("throws ValidationError when session already ended", () => {
    const session = startTelemetrySession(db, { ticketId: "ticket-1" });
    endTelemetrySession(db, { sessionId: session.id });

    expect(() => endTelemetrySession(db, { sessionId: session.id })).toThrow(ValidationError);
  });
});

// ============================================
// getTelemetrySession
// ============================================

describe("getTelemetrySession", () => {
  it("retrieves session by ID with events", () => {
    const session = startTelemetrySession(db, { ticketId: "ticket-1" });
    logPrompt(db, { sessionId: session.id, prompt: "test" });

    const detail = getTelemetrySession(db, { sessionId: session.id });

    expect(detail.id).toBe(session.id);
    expect(detail.ticketId).toBe("ticket-1");
    expect(detail.ticketTitle).toBe("Ticket ticket-1");
    expect(detail.events.length).toBeGreaterThanOrEqual(2); // session_start + prompt
  });

  it("retrieves most recent session by ticket ID", () => {
    const session1 = startTelemetrySession(db, { ticketId: "ticket-1" });
    endTelemetrySession(db, { sessionId: session1.id });
    const session2 = startTelemetrySession(db, { ticketId: "ticket-1" });

    const detail = getTelemetrySession(db, { ticketId: "ticket-1" });
    expect(detail.id).toBe(session2.id);
  });

  it("excludes events when includeEvents is false", () => {
    const session = startTelemetrySession(db, { ticketId: "ticket-1" });
    logPrompt(db, { sessionId: session.id, prompt: "test" });

    const detail = getTelemetrySession(db, {
      sessionId: session.id,
      includeEvents: false,
    });

    expect(detail.events).toHaveLength(0);
  });

  it("throws ValidationError when neither ID provided", () => {
    expect(() => getTelemetrySession(db, {})).toThrow(ValidationError);
  });

  it("throws SessionNotFoundError when no session exists", () => {
    expect(() => getTelemetrySession(db, { sessionId: "nonexistent" })).toThrow(
      SessionNotFoundError
    );
  });
});

// ============================================
// listTelemetrySessions
// ============================================

describe("listTelemetrySessions", () => {
  it("lists sessions with ticket titles", () => {
    startTelemetrySession(db, { ticketId: "ticket-1" });
    startTelemetrySession(db, { ticketId: "ticket-1" });

    const result = listTelemetrySessions(db, { ticketId: "ticket-1" });
    expect(result).toHaveLength(2);
    expect(result[0]?.ticketTitle).toBe("Ticket ticket-1");
  });

  it("filters by project ID", () => {
    startTelemetrySession(db, { ticketId: "ticket-1" });

    const result = listTelemetrySessions(db, { projectId: "proj-1" });
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("respects limit parameter", () => {
    for (let i = 0; i < 5; i++) {
      startTelemetrySession(db, { ticketId: "ticket-1" });
    }

    const result = listTelemetrySessions(db, { ticketId: "ticket-1", limit: 3 });
    expect(result).toHaveLength(3);
  });

  it("returns empty array when no sessions match", () => {
    const result = listTelemetrySessions(db, { ticketId: "nonexistent" });
    expect(result).toHaveLength(0);
  });
});

// ============================================
// summarizeParams
// ============================================

describe("summarizeParams", () => {
  it("truncates long strings", () => {
    const longString = "a".repeat(200);
    const result = JSON.parse(summarizeParams({ content: longString }));
    expect(result.content).toBe("[200 chars]");
  });

  it("preserves short strings", () => {
    const result = JSON.parse(summarizeParams({ name: "hello" }));
    expect(result.name).toBe("hello");
  });

  it("summarizes arrays", () => {
    const result = JSON.parse(summarizeParams({ items: [1, 2, 3] }));
    expect(result.items).toBe("[array, 3 items]");
  });

  it("summarizes objects", () => {
    const result = JSON.parse(summarizeParams({ config: { a: 1, b: 2 } }));
    expect(result.config).toBe("[object, 2 keys]");
  });

  it("passes through primitives", () => {
    const result = JSON.parse(summarizeParams({ count: 42, active: true }));
    expect(result.count).toBe(42);
    expect(result.active).toBe(true);
  });
});
