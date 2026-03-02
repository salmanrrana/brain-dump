import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initDatabase } from "../lib/database.ts";
import {
  instrumentServer,
  endActiveSession,
  resetSessionCache,
} from "../lib/telemetry-self-log.ts";
import type Database from "better-sqlite3";

let db: Database.Database;
let tempDir: string;
let originalHome: string;

/** Helper to get the handler for a registered tool by name. */
function getToolHandler(
  server: McpServer,
  name: string
): (params: unknown, extra: unknown) => Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = (server as any)._registeredTools as Record<
    string,
    { handler: (...args: unknown[]) => Promise<unknown> }
  >;
  const tool = tools[name];
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool.handler;
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "brain-dump-telemetry-"));
  originalHome = process.env.HOME!;
  process.env.HOME = tempDir;

  const dbPath = join(tempDir, "brain-dump.db");
  const result = initDatabase(dbPath);
  db = result.db;

  resetSessionCache();
});

afterEach(() => {
  db?.close();
  process.env.HOME = originalHome;
  rmSync(tempDir, { recursive: true, force: true });
});

/** Create a project and ticket in the DB for testing. */
function createTestTicket(): { projectId: string; ticketId: string } {
  const projectId = randomUUID();
  const ticketId = randomUUID();
  const now = new Date().toISOString();

  db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
    projectId,
    "Test Project",
    tempDir,
    now
  );

  db.prepare(
    "INSERT INTO tickets (id, title, status, priority, position, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(ticketId, "Test Ticket", "in_progress", "medium", 1000, projectId, now, now);

  return { projectId, ticketId };
}

/** Create a telemetry session for a ticket. */
function createTelemetrySession(ticketId: string): string {
  const sessionId = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO telemetry_sessions
     (id, ticket_id, project_id, environment, started_at, total_prompts, total_tool_calls)
     VALUES (?, ?, NULL, 'test', ?, 0, 0)`
  ).run(sessionId, ticketId, now);

  return sessionId;
}

/** Get all telemetry events for a session. */
function getEvents(sessionId: string) {
  return db
    .prepare("SELECT * FROM telemetry_events WHERE session_id = ? ORDER BY created_at ASC")
    .all(sessionId) as Array<{
    id: string;
    session_id: string;
    ticket_id: string;
    event_type: string;
    tool_name: string | null;
    event_data: string | null;
    duration_ms: number | null;
    is_error: number;
    correlation_id: string | null;
    created_at: string;
  }>;
}

describe("Telemetry self-instrumentation", () => {
  it("logs start and end events when an instrumented tool is called", async () => {
    const { ticketId } = createTestTicket();
    const sessionId = createTelemetrySession(ticketId);

    const server = new McpServer({ name: "test", version: "1.0.0" });
    instrumentServer(server, db, () => "test");

    server.tool("test-tool", "A test tool", {}, async () => ({
      content: [{ type: "text" as const, text: "ok" }],
    }));

    const handler = getToolHandler(server, "test-tool");
    await handler({ ticketId }, {});

    const events = getEvents(sessionId);
    const mcpCallEvents = events.filter((e) => e.event_type === "mcp_call");
    expect(mcpCallEvents.length).toBe(2);

    const startEvent = mcpCallEvents.find((e) => {
      const data = JSON.parse(e.event_data!);
      return data.phase === "start";
    });
    const endEvent = mcpCallEvents.find((e) => {
      const data = JSON.parse(e.event_data!);
      return data.phase === "end";
    });

    expect(startEvent).toBeDefined();
    expect(endEvent).toBeDefined();
    expect(startEvent!.tool_name).toBe("test-tool");
    expect(endEvent!.tool_name).toBe("test-tool");

    // Correlation IDs should match
    expect(startEvent!.correlation_id).toBeTruthy();
    expect(startEvent!.correlation_id).toBe(endEvent!.correlation_id);

    // End event should have duration
    expect(endEvent!.duration_ms).toBeGreaterThanOrEqual(0);

    // End event data should indicate success
    const endData = JSON.parse(endEvent!.event_data!);
    expect(endData.success).toBe(true);
  });

  it("logs error info when an instrumented tool throws", async () => {
    const { ticketId } = createTestTicket();
    const sessionId = createTelemetrySession(ticketId);

    const server = new McpServer({ name: "test", version: "1.0.0" });
    instrumentServer(server, db, () => "test");

    server.tool("failing-tool", "A tool that fails", {}, async () => {
      throw new Error("Something went wrong");
    });

    const handler = getToolHandler(server, "failing-tool");
    await expect(handler({ ticketId }, {})).rejects.toThrow("Something went wrong");

    const events = getEvents(sessionId);
    const mcpCallEvents = events.filter((e) => e.event_type === "mcp_call");
    expect(mcpCallEvents.length).toBe(2);

    const endEvent = mcpCallEvents.find((e) => {
      const data = JSON.parse(e.event_data!);
      return data.phase === "end";
    });

    expect(endEvent!.is_error).toBe(1);
    const endData = JSON.parse(endEvent!.event_data!);
    expect(endData.success).toBe(false);
    expect(endData.error).toBe("Something went wrong");
  });

  it("does not instrument excluded tools (telemetry)", async () => {
    const { ticketId } = createTestTicket();
    const sessionId = createTelemetrySession(ticketId);

    const server = new McpServer({ name: "test", version: "1.0.0" });
    instrumentServer(server, db, () => "test");

    server.tool("telemetry", "The telemetry tool", {}, async () => ({
      content: [{ type: "text" as const, text: "ok" }],
    }));

    const handler = getToolHandler(server, "telemetry");
    await handler({ ticketId }, {});

    const events = getEvents(sessionId);
    const mcpCallEvents = events.filter((e) => e.event_type === "mcp_call");
    expect(mcpCallEvents.length).toBe(0);
  });

  it("auto-creates telemetry session when ticket is active but no session exists", async () => {
    const { ticketId } = createTestTicket();

    const server = new McpServer({ name: "test", version: "1.0.0" });
    instrumentServer(server, db, () => "test");

    server.tool("auto-session-tool", "A tool", {}, async () => ({
      content: [{ type: "text" as const, text: "ok" }],
    }));

    const handler = getToolHandler(server, "auto-session-tool");
    await handler({ ticketId }, {});

    // Check that a telemetry session was auto-created
    const sessions = db
      .prepare("SELECT * FROM telemetry_sessions WHERE ticket_id = ?")
      .all(ticketId) as Array<{ id: string; ended_at: string | null }>;
    expect(sessions.length).toBe(1);

    // And events were logged (session_start + mcp_call start + mcp_call end)
    const events = getEvents(sessions[0]!.id);
    const mcpCallEvents = events.filter((e) => e.event_type === "mcp_call");
    expect(mcpCallEvents.length).toBe(2);
  });

  it("auto-ends session on shutdown", async () => {
    const { ticketId } = createTestTicket();

    const server = new McpServer({ name: "test", version: "1.0.0" });
    instrumentServer(server, db, () => "test");

    server.tool("shutdown-tool", "A tool", {}, async () => ({
      content: [{ type: "text" as const, text: "ok" }],
    }));

    const handler = getToolHandler(server, "shutdown-tool");
    await handler({ ticketId }, {});

    // Session should be active (auto-created, not ended)
    const sessions = db
      .prepare("SELECT * FROM telemetry_sessions WHERE ticket_id = ?")
      .all(ticketId) as Array<{ id: string; ended_at: string | null }>;
    expect(sessions.length).toBe(1);
    expect(sessions[0]!.ended_at).toBeNull();

    // Simulate shutdown
    endActiveSession(db);

    // Session should now be ended
    const updatedSession = db
      .prepare("SELECT * FROM telemetry_sessions WHERE id = ?")
      .get(sessions[0]!.id) as { ended_at: string | null; outcome: string | null };
    expect(updatedSession.ended_at).toBeTruthy();
    expect(updatedSession.outcome).toBe("success");
  });

  it("skips telemetry when no ticket is active", async () => {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    instrumentServer(server, db, () => "test");

    server.tool("no-ticket-tool", "A tool called without ticketId", {}, async () => ({
      content: [{ type: "text" as const, text: "ok" }],
    }));

    const handler = getToolHandler(server, "no-ticket-tool");
    const result = await handler({}, {});
    expect(result).toEqual({ content: [{ type: "text", text: "ok" }] });

    // No sessions should be created
    const sessions = db.prepare("SELECT * FROM telemetry_sessions").all() as Array<{ id: string }>;
    expect(sessions.length).toBe(0);
  });
});
