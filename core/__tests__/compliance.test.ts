import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import {
  startConversation,
  logMessage,
  endConversation,
  listConversations,
  exportComplianceLogs,
  archiveOldSessions,
} from "../compliance.ts";
import type { ComplianceDependencies } from "../compliance.ts";
import { SessionNotFoundError, ValidationError } from "../errors.ts";
import { seedProject, seedTicket } from "./test-helpers.ts";

let db: Database.Database;

const mockDeps: ComplianceDependencies = {
  detectEnvironment: () => "claude-code",
  containsSecrets: () => false,
};

beforeEach(() => {
  const result = createTestDatabase();
  db = result.db;
});

describe("startConversation", () => {
  it("creates a new conversation session", () => {
    const result = startConversation(db, {}, mockDeps);

    expect(result.id).toBeTruthy();
    expect(result.environment).toBe("claude-code");
    expect(result.dataClassification).toBe("internal");
  });

  it("links to project and ticket when provided", () => {
    seedProject(db);
    seedTicket(db);

    const result = startConversation(db, { projectId: "proj-1", ticketId: "ticket-1" }, mockDeps);

    expect(result.id).toBeTruthy();
  });

  it("uses custom data classification", () => {
    const result = startConversation(db, { dataClassification: "confidential" }, mockDeps);

    expect(result.dataClassification).toBe("confidential");
  });
});

describe("logMessage", () => {
  it("logs a message to a session", () => {
    const session = startConversation(db, {}, mockDeps);

    const result = logMessage(
      db,
      {
        sessionId: session.id,
        role: "user",
        content: "Hello, world!",
      },
      mockDeps
    );

    expect(result.id).toBeTruthy();
    expect(result.sequenceNumber).toBe(1);
    expect(result.contentHash).toBeTruthy();
    expect(result.containsPotentialSecrets).toBe(false);
  });

  it("increments sequence numbers", () => {
    const session = startConversation(db, {}, mockDeps);

    const msg1 = logMessage(
      db,
      { sessionId: session.id, role: "user", content: "First" },
      mockDeps
    );
    const msg2 = logMessage(
      db,
      { sessionId: session.id, role: "assistant", content: "Second" },
      mockDeps
    );

    expect(msg1.sequenceNumber).toBe(1);
    expect(msg2.sequenceNumber).toBe(2);
  });

  it("detects potential secrets", () => {
    const session = startConversation(db, {}, mockDeps);

    const secretDeps: ComplianceDependencies = {
      detectEnvironment: () => "claude-code",
      containsSecrets: () => true,
    };

    const result = logMessage(
      db,
      { sessionId: session.id, role: "user", content: "password=secret123" },
      secretDeps
    );

    expect(result.containsPotentialSecrets).toBe(true);
  });

  it("throws SessionNotFoundError for nonexistent session", () => {
    expect(() =>
      logMessage(db, { sessionId: "nonexistent", role: "user", content: "Test" }, mockDeps)
    ).toThrow(SessionNotFoundError);
  });

  it("throws ValidationError when session already ended", () => {
    const session = startConversation(db, {}, mockDeps);
    endConversation(db, session.id);

    expect(() =>
      logMessage(db, { sessionId: session.id, role: "user", content: "Test" }, mockDeps)
    ).toThrow(ValidationError);
  });
});

describe("endConversation", () => {
  it("marks a session as ended", () => {
    const session = startConversation(db, {}, mockDeps);

    const result = endConversation(db, session.id);
    expect(result.sessionId).toBe(session.id);
    expect(result.endedAt).toBeTruthy();
    expect(result.messageCount).toBe(0);
  });

  it("returns already-ended session without error", () => {
    const session = startConversation(db, {}, mockDeps);
    endConversation(db, session.id);

    const result = endConversation(db, session.id);
    expect(result.alreadyEnded).toBe(true);
  });

  it("throws SessionNotFoundError for nonexistent session", () => {
    expect(() => endConversation(db, "nonexistent")).toThrow(SessionNotFoundError);
  });
});

describe("listConversations", () => {
  it("lists all sessions", () => {
    startConversation(db, {}, mockDeps);
    startConversation(db, {}, mockDeps);

    const result = listConversations(db);
    expect(result).toHaveLength(2);
  });

  it("filters by environment", () => {
    startConversation(db, {}, mockDeps);
    startConversation(
      db,
      {},
      {
        detectEnvironment: () => "vscode",
        containsSecrets: () => false,
      }
    );

    const result = listConversations(db, { environment: "claude-code" });
    expect(result).toHaveLength(1);
  });

  it("includes message count", () => {
    const session = startConversation(db, {}, mockDeps);
    logMessage(db, { sessionId: session.id, role: "user", content: "Hi" }, mockDeps);
    logMessage(db, { sessionId: session.id, role: "assistant", content: "Hello" }, mockDeps);

    const result = listConversations(db);
    expect(result[0]!.messageCount).toBe(2);
  });

  it("respects limit", () => {
    for (let i = 0; i < 5; i++) {
      startConversation(db, {}, mockDeps);
    }

    const result = listConversations(db, { limit: 2 });
    expect(result).toHaveLength(2);
  });
});

describe("exportComplianceLogs", () => {
  it("exports sessions and messages within date range", () => {
    const session = startConversation(db, {}, mockDeps);
    logMessage(db, { sessionId: session.id, role: "user", content: "Test message" }, mockDeps);

    const result = exportComplianceLogs(db, {
      startDate: "2020-01-01",
      endDate: "2099-12-31",
    });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]!.messages).toHaveLength(1);
    expect(result.exportMetadata.sessionCount).toBe(1);
  });

  it("includes integrity verification", () => {
    const session = startConversation(db, {}, mockDeps);
    logMessage(db, { sessionId: session.id, role: "user", content: "Verified" }, mockDeps);

    const result = exportComplianceLogs(db, {
      startDate: "2020-01-01",
      endDate: "2099-12-31",
      verifyIntegrity: true,
    });

    expect(result.integrityReport).toBeDefined();
    expect(result.integrityReport!.totalMessages).toBe(1);
    expect(result.integrityReport!.validMessages).toBe(1);
    expect(result.integrityReport!.invalidMessages).toBe(0);
  });
});

describe("archiveOldSessions", () => {
  it("performs dry run by default", () => {
    const session = startConversation(db, {}, mockDeps);
    endConversation(db, session.id);

    // Manually backdate the session
    db.prepare(
      "UPDATE conversation_sessions SET started_at = '2020-01-01T00:00:00Z' WHERE id = ?"
    ).run(session.id);

    const result = archiveOldSessions(db, { retentionDays: 1 });
    expect(result.dryRun).toBe(true);
    expect((result as { sessionsToDelete: number }).sessionsToDelete).toBeGreaterThanOrEqual(1);

    // Session should still exist (dry run)
    const sessions = listConversations(db);
    expect(sessions).toHaveLength(1);
  });

  it("deletes old sessions when confirmed", () => {
    const session = startConversation(db, {}, mockDeps);
    endConversation(db, session.id);

    db.prepare(
      "UPDATE conversation_sessions SET started_at = '2020-01-01T00:00:00Z' WHERE id = ?"
    ).run(session.id);

    const result = archiveOldSessions(db, { retentionDays: 1, confirm: true });
    expect(result.dryRun).toBe(false);

    const sessions = listConversations(db);
    expect(sessions).toHaveLength(0);
  });

  it("preserves sessions under legal hold", () => {
    const session = startConversation(db, {}, mockDeps);
    endConversation(db, session.id);

    db.prepare(
      "UPDATE conversation_sessions SET started_at = '2020-01-01T00:00:00Z', legal_hold = 1 WHERE id = ?"
    ).run(session.id);

    archiveOldSessions(db, { retentionDays: 1, confirm: true });

    const sessions = listConversations(db);
    expect(sessions).toHaveLength(1);
  });
});
