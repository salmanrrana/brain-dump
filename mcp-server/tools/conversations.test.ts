import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";

// Mock types for the conversation tools
interface ConversationSession {
  id: string;
  project_id: string | null;
  ticket_id: string | null;
  user_id: string | null;
  environment: string;
  session_metadata: string | null;
  data_classification: string;
  legal_hold: number;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

interface ConversationMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  content_hash: string;
  tool_calls: string | null;
  token_count: number | null;
  model_id: string | null;
  sequence_number: number;
  contains_potential_secrets: number;
  created_at: string;
}

interface MockServer {
  tool: ReturnType<typeof vi.fn>;
  tools: Map<
    string,
    {
      handler: (
        args: Record<string, unknown>
      ) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;
    }
  >;
}

// Import the module we're testing
// eslint-disable-next-line @typescript-eslint/no-require-imports
const conversations = require("./conversations.js") as {
  registerConversationTools: (
    server: MockServer,
    db: Database.Database,
    detectEnvironment: () => string
  ) => void;
};

const { registerConversationTools } = conversations;

describe("conversation tools", () => {
  let db: Database.Database;
  let server: MockServer;
  let detectEnvironment: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(":memory:");

    // Create required tables
    db.prepare(
      `
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        color TEXT,
        working_method TEXT DEFAULT 'auto',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `
    ).run();

    db.prepare(
      `
      CREATE TABLE epics (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        color TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `
    ).run();

    db.prepare(
      `
      CREATE TABLE tickets (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'backlog',
        priority TEXT,
        position REAL NOT NULL,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        epic_id TEXT REFERENCES epics(id) ON DELETE SET NULL,
        tags TEXT,
        subtasks TEXT,
        is_blocked INTEGER DEFAULT 0,
        blocked_reason TEXT,
        linked_files TEXT,
        attachments TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        branch_name TEXT,
        pr_number INTEGER,
        pr_url TEXT,
        pr_status TEXT
      )
    `
    ).run();

    db.prepare(
      `
      CREATE TABLE conversation_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        ticket_id TEXT REFERENCES tickets(id) ON DELETE SET NULL,
        user_id TEXT,
        environment TEXT NOT NULL DEFAULT 'unknown',
        session_metadata TEXT,
        data_classification TEXT DEFAULT 'internal',
        legal_hold INTEGER DEFAULT 0,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `
    ).run();

    db.prepare(
      `
      CREATE TABLE conversation_messages (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        tool_calls TEXT,
        token_count INTEGER,
        model_id TEXT,
        sequence_number INTEGER NOT NULL,
        contains_potential_secrets INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `
    ).run();

    db.prepare(
      `
      CREATE TABLE audit_log_access (
        id TEXT PRIMARY KEY NOT NULL,
        accessor_id TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        action TEXT NOT NULL,
        result TEXT NOT NULL,
        accessed_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `
    ).run();

    db.prepare(
      `
      CREATE TABLE settings (
        id INTEGER PRIMARY KEY,
        conversation_retention_days INTEGER DEFAULT 90,
        conversation_logging_enabled INTEGER DEFAULT 1
      )
    `
    ).run();

    // Insert default settings
    db.prepare("INSERT INTO settings (id) VALUES (1)").run();

    // Mock server with tool registration
    server = {
      tool: vi.fn((name, _description, _schema, handler) => {
        server.tools.set(name, { handler });
      }),
      tools: new Map(),
    };

    // Mock environment detection
    detectEnvironment = vi.fn().mockReturnValue("claude-code");

    // Register the tools
    registerConversationTools(server, db, detectEnvironment);
  });

  afterEach(() => {
    db.close();
  });

  describe("start_conversation_session", () => {
    it("should register the start_conversation_session tool", () => {
      expect(server.tool).toHaveBeenCalledWith(
        "start_conversation_session",
        expect.any(String),
        expect.any(Object),
        expect.any(Function)
      );
    });

    it("should create a session with no links", async () => {
      const handler = server.tools.get("start_conversation_session")!.handler;
      const result = await handler({});

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain("Conversation Session Started");
      expect(result.content[0]?.text).toContain("claude-code");

      // Verify database entry
      const sessions = db
        .prepare("SELECT * FROM conversation_sessions")
        .all() as ConversationSession[];
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.environment).toBe("claude-code");
      expect(sessions[0]?.data_classification).toBe("internal");
    });

    it("should create a session linked to a project", async () => {
      // Create a project first
      const projectId = randomUUID();
      db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
        projectId,
        "Test Project",
        "/test/path",
        new Date().toISOString()
      );

      const handler = server.tools.get("start_conversation_session")!.handler;
      const result = await handler({ projectId });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain(projectId);

      const sessions = db
        .prepare("SELECT * FROM conversation_sessions")
        .all() as ConversationSession[];
      expect(sessions[0]?.project_id).toBe(projectId);
    });

    it("should create a session linked to a ticket", async () => {
      // Create project and ticket
      const projectId = randomUUID();
      const ticketId = randomUUID();
      db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
        projectId,
        "Test Project",
        "/test/path",
        new Date().toISOString()
      );
      db.prepare(
        "INSERT INTO tickets (id, title, position, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(
        ticketId,
        "Test Ticket",
        1,
        projectId,
        new Date().toISOString(),
        new Date().toISOString()
      );

      const handler = server.tools.get("start_conversation_session")!.handler;
      const result = await handler({ ticketId });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain(ticketId);

      const sessions = db
        .prepare("SELECT * FROM conversation_sessions")
        .all() as ConversationSession[];
      expect(sessions[0]?.ticket_id).toBe(ticketId);
    });

    it("should return error for non-existent project", async () => {
      const handler = server.tools.get("start_conversation_session")!.handler;
      const result = await handler({ projectId: "non-existent-id" });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("Project not found");
    });

    it("should return error for non-existent ticket", async () => {
      const handler = server.tools.get("start_conversation_session")!.handler;
      const result = await handler({ ticketId: "non-existent-id" });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("Ticket not found");
    });

    it("should store metadata as JSON", async () => {
      const handler = server.tools.get("start_conversation_session")!.handler;
      const metadata = { purpose: "testing", version: "1.0" };
      const result = await handler({ metadata });

      expect(result.isError).toBeUndefined();

      const sessions = db
        .prepare("SELECT * FROM conversation_sessions")
        .all() as ConversationSession[];
      expect(sessions[0]?.session_metadata).toBe(JSON.stringify(metadata));
    });

    it("should respect data classification parameter", async () => {
      const handler = server.tools.get("start_conversation_session")!.handler;
      const result = await handler({ dataClassification: "confidential" });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain("confidential");

      const sessions = db
        .prepare("SELECT * FROM conversation_sessions")
        .all() as ConversationSession[];
      expect(sessions[0]?.data_classification).toBe("confidential");
    });

    it("should store user ID when provided", async () => {
      const handler = server.tools.get("start_conversation_session")!.handler;
      const result = await handler({ userId: "user-123" });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain("user-123");

      const sessions = db
        .prepare("SELECT * FROM conversation_sessions")
        .all() as ConversationSession[];
      expect(sessions[0]?.user_id).toBe("user-123");
    });

    it("should use detected environment", async () => {
      detectEnvironment.mockReturnValue("vscode");

      const handler = server.tools.get("start_conversation_session")!.handler;
      const result = await handler({});

      expect(result.content[0]?.text).toContain("vscode");

      const sessions = db
        .prepare("SELECT * FROM conversation_sessions")
        .all() as ConversationSession[];
      expect(sessions[0]?.environment).toBe("vscode");
    });

    it("should create multiple independent sessions", async () => {
      const handler = server.tools.get("start_conversation_session")!.handler;

      await handler({});
      await handler({ dataClassification: "restricted" });
      await handler({ userId: "another-user" });

      const sessions = db
        .prepare("SELECT * FROM conversation_sessions")
        .all() as ConversationSession[];
      expect(sessions).toHaveLength(3);

      // Each should have a unique ID
      const ids = new Set(sessions.map((s) => s.id));
      expect(ids.size).toBe(3);
    });
  });

  describe("log_conversation_message", () => {
    let sessionId: string;

    beforeEach(async () => {
      // Create a session to log messages to
      const startHandler = server.tools.get("start_conversation_session")!.handler;
      await startHandler({});
      const sessions = db.prepare("SELECT id FROM conversation_sessions").all() as { id: string }[];
      sessionId = sessions[0]!.id;
    });

    it("should register the log_conversation_message tool", () => {
      expect(server.tool).toHaveBeenCalledWith(
        "log_conversation_message",
        expect.any(String),
        expect.any(Object),
        expect.any(Function)
      );
    });

    it("should log a basic user message", async () => {
      const handler = server.tools.get("log_conversation_message")!.handler;
      const result = await handler({
        sessionId,
        role: "user",
        content: "Hello, how are you?",
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain("Message Logged");
      expect(result.content[0]?.text).toContain("user");
      expect(result.content[0]?.text).toContain("Sequence:** 1");

      const messages = db
        .prepare("SELECT * FROM conversation_messages WHERE session_id = ?")
        .all(sessionId) as ConversationMessage[];
      expect(messages).toHaveLength(1);
      expect(messages[0]?.role).toBe("user");
      expect(messages[0]?.content).toBe("Hello, how are you?");
      expect(messages[0]?.sequence_number).toBe(1);
    });

    it("should log an assistant message with model info", async () => {
      const handler = server.tools.get("log_conversation_message")!.handler;
      const result = await handler({
        sessionId,
        role: "assistant",
        content: "I'm doing well, thank you!",
        modelId: "claude-3-opus",
        tokenCount: 150,
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain("claude-3-opus");
      expect(result.content[0]?.text).toContain("150");

      const messages = db
        .prepare("SELECT * FROM conversation_messages WHERE session_id = ?")
        .all(sessionId) as ConversationMessage[];
      expect(messages[0]?.model_id).toBe("claude-3-opus");
      expect(messages[0]?.token_count).toBe(150);
    });

    it("should compute content hash for tamper detection", async () => {
      const handler = server.tools.get("log_conversation_message")!.handler;
      const content = "Test message content";
      const result = await handler({
        sessionId,
        role: "user",
        content,
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain("Content Hash:**");

      const messages = db
        .prepare("SELECT * FROM conversation_messages WHERE session_id = ?")
        .all(sessionId) as ConversationMessage[];
      expect(messages[0]?.content_hash).toBeDefined();
      expect(messages[0]?.content_hash.length).toBe(64); // SHA-256 hex is 64 chars
    });

    it("should detect potential secrets in content", async () => {
      const handler = server.tools.get("log_conversation_message")!.handler;
      const result = await handler({
        sessionId,
        role: "user",
        content: "My API key is sk-abc123def456ghi789jkl012mno345pqr",
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain("Potential Secrets Detected");

      const messages = db
        .prepare("SELECT * FROM conversation_messages WHERE session_id = ?")
        .all(sessionId) as ConversationMessage[];
      expect(messages[0]?.contains_potential_secrets).toBe(1);
    });

    it("should not flag content without secrets", async () => {
      const handler = server.tools.get("log_conversation_message")!.handler;
      await handler({
        sessionId,
        role: "user",
        content: "Just a normal message without any secrets.",
      });

      const messages = db
        .prepare("SELECT * FROM conversation_messages WHERE session_id = ?")
        .all(sessionId) as ConversationMessage[];
      expect(messages[0]?.contains_potential_secrets).toBe(0);
    });

    it("should auto-increment sequence numbers", async () => {
      const handler = server.tools.get("log_conversation_message")!.handler;

      await handler({ sessionId, role: "user", content: "First message" });
      await handler({ sessionId, role: "assistant", content: "Second message" });
      await handler({ sessionId, role: "user", content: "Third message" });

      const messages = db
        .prepare(
          "SELECT * FROM conversation_messages WHERE session_id = ? ORDER BY sequence_number"
        )
        .all(sessionId) as ConversationMessage[];
      expect(messages).toHaveLength(3);
      expect(messages[0]?.sequence_number).toBe(1);
      expect(messages[1]?.sequence_number).toBe(2);
      expect(messages[2]?.sequence_number).toBe(3);
    });

    it("should store tool calls as JSON", async () => {
      const handler = server.tools.get("log_conversation_message")!.handler;
      const toolCalls = [
        { name: "read_file", parameters: { path: "/test.txt" }, result: "content" },
        { name: "write_file", parameters: { path: "/out.txt", content: "data" } },
      ];

      await handler({
        sessionId,
        role: "assistant",
        content: "Let me read that file for you.",
        toolCalls,
      });

      const messages = db
        .prepare("SELECT * FROM conversation_messages WHERE session_id = ?")
        .all(sessionId) as ConversationMessage[];
      expect(messages[0]?.tool_calls).toBe(JSON.stringify(toolCalls));
    });

    it("should return error for non-existent session", async () => {
      const handler = server.tools.get("log_conversation_message")!.handler;
      const result = await handler({
        sessionId: "non-existent-session",
        role: "user",
        content: "Test message",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("Session not found");
    });

    it("should return error for ended session", async () => {
      // End the session
      db.prepare("UPDATE conversation_sessions SET ended_at = ? WHERE id = ?").run(
        new Date().toISOString(),
        sessionId
      );

      const handler = server.tools.get("log_conversation_message")!.handler;
      const result = await handler({
        sessionId,
        role: "user",
        content: "Test message",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("has already ended");
    });

    it("should handle all valid roles", async () => {
      const handler = server.tools.get("log_conversation_message")!.handler;
      const roles = ["user", "assistant", "system", "tool"];

      for (const role of roles) {
        await handler({ sessionId, role, content: `Message from ${role}` });
      }

      const messages = db
        .prepare(
          "SELECT * FROM conversation_messages WHERE session_id = ? ORDER BY sequence_number"
        )
        .all(sessionId) as ConversationMessage[];
      expect(messages).toHaveLength(4);
      expect(messages.map((m) => m.role)).toEqual(roles);
    });

    it("should produce consistent hashes for same content", async () => {
      const handler = server.tools.get("log_conversation_message")!.handler;
      const content = "Identical content for hash test";

      await handler({ sessionId, role: "user", content });
      await handler({ sessionId, role: "user", content });

      const messages = db
        .prepare(
          "SELECT * FROM conversation_messages WHERE session_id = ? ORDER BY sequence_number"
        )
        .all(sessionId) as ConversationMessage[];
      expect(messages[0]?.content_hash).toBe(messages[1]?.content_hash);
    });
  });

  describe("end_conversation_session", () => {
    let sessionId: string;

    beforeEach(async () => {
      // Create a session to end
      const startHandler = server.tools.get("start_conversation_session")!.handler;
      await startHandler({});
      const sessions = db.prepare("SELECT id FROM conversation_sessions").all() as { id: string }[];
      sessionId = sessions[0]!.id;
    });

    it("should register the end_conversation_session tool", () => {
      expect(server.tool).toHaveBeenCalledWith(
        "end_conversation_session",
        expect.any(String),
        expect.any(Object),
        expect.any(Function)
      );
    });

    it("should end an active session", async () => {
      const handler = server.tools.get("end_conversation_session")!.handler;
      const result = await handler({ sessionId });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain("Session Ended");
      expect(result.content[0]?.text).toContain("Total Messages:** 0");

      const session = db
        .prepare("SELECT * FROM conversation_sessions WHERE id = ?")
        .get(sessionId) as ConversationSession;
      expect(session.ended_at).toBeDefined();
      expect(session.ended_at).not.toBeNull();
    });

    it("should include message count in summary", async () => {
      // Log some messages first
      const logHandler = server.tools.get("log_conversation_message")!.handler;
      await logHandler({ sessionId, role: "user", content: "First message" });
      await logHandler({ sessionId, role: "assistant", content: "Second message" });
      await logHandler({ sessionId, role: "user", content: "Third message" });

      const handler = server.tools.get("end_conversation_session")!.handler;
      const result = await handler({ sessionId });

      expect(result.content[0]?.text).toContain("Total Messages:** 3");
    });

    it("should return current state for already ended session", async () => {
      const handler = server.tools.get("end_conversation_session")!.handler;

      // End the session
      await handler({ sessionId });

      // Try to end again
      const result = await handler({ sessionId });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain("Session Already Ended");
      expect(result.content[0]?.text).toContain("No changes made");
    });

    it("should return error for non-existent session", async () => {
      const handler = server.tools.get("end_conversation_session")!.handler;
      const result = await handler({ sessionId: "non-existent-session" });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("Session not found");
    });

    it("should prevent further message logging after ending", async () => {
      // End the session
      const endHandler = server.tools.get("end_conversation_session")!.handler;
      await endHandler({ sessionId });

      // Try to log a message
      const logHandler = server.tools.get("log_conversation_message")!.handler;
      const result = await logHandler({
        sessionId,
        role: "user",
        content: "This should fail",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("has already ended");
    });

    it("should include session metadata in response", async () => {
      const handler = server.tools.get("end_conversation_session")!.handler;
      const result = await handler({ sessionId });

      expect(result.content[0]?.text).toContain("Environment:** claude-code");
      expect(result.content[0]?.text).toContain("Classification:** internal");
    });
  });

  describe("list_conversation_sessions", () => {
    let projectId: string;
    let ticketId: string;

    beforeEach(async () => {
      // Create project and ticket for filtering tests
      projectId = randomUUID();
      ticketId = randomUUID();
      db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
        projectId,
        "Test Project",
        "/test/path",
        new Date().toISOString()
      );
      db.prepare(
        "INSERT INTO tickets (id, title, position, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(
        ticketId,
        "Test Ticket",
        1,
        projectId,
        new Date().toISOString(),
        new Date().toISOString()
      );
    });

    it("should register the list_conversation_sessions tool", () => {
      expect(server.tool).toHaveBeenCalledWith(
        "list_conversation_sessions",
        expect.any(String),
        expect.any(Object),
        expect.any(Function)
      );
    });

    it("should list all sessions with no filters", async () => {
      // Create some sessions
      const startHandler = server.tools.get("start_conversation_session")!.handler;
      await startHandler({});
      await startHandler({ projectId });
      await startHandler({ ticketId });

      const handler = server.tools.get("list_conversation_sessions")!.handler;
      const result = await handler({});

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain("Found:** 3 sessions");
    });

    it("should filter by projectId", async () => {
      const startHandler = server.tools.get("start_conversation_session")!.handler;
      await startHandler({});
      await startHandler({ projectId });
      await startHandler({ projectId });

      const handler = server.tools.get("list_conversation_sessions")!.handler;
      const result = await handler({ projectId });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain("Found:** 2 sessions");
      expect(result.content[0]?.text).toContain(`Project Filter:** ${projectId}`);
    });

    it("should filter by ticketId", async () => {
      const startHandler = server.tools.get("start_conversation_session")!.handler;
      await startHandler({});
      await startHandler({ ticketId });

      const handler = server.tools.get("list_conversation_sessions")!.handler;
      const result = await handler({ ticketId });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain("Found:** 1 session");
      expect(result.content[0]?.text).toContain(`Ticket Filter:** ${ticketId}`);
    });

    it("should filter by environment", async () => {
      const startHandler = server.tools.get("start_conversation_session")!.handler;
      await startHandler({});

      // Create a session with different environment
      detectEnvironment.mockReturnValue("vscode");
      await startHandler({});
      detectEnvironment.mockReturnValue("claude-code");

      const handler = server.tools.get("list_conversation_sessions")!.handler;
      const result = await handler({ environment: "vscode" });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain("Found:** 1 session");
      expect(result.content[0]?.text).toContain("Environment Filter:** vscode");
    });

    it("should filter by date range", async () => {
      const startHandler = server.tools.get("start_conversation_session")!.handler;
      await startHandler({});

      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

      const handler = server.tools.get("list_conversation_sessions")!.handler;
      const result = await handler({ startDate: yesterday, endDate: tomorrow });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain("Found:** 1 session");
    });

    it("should exclude active sessions when includeActive is false", async () => {
      const startHandler = server.tools.get("start_conversation_session")!.handler;
      await startHandler({});
      await startHandler({});

      // End one session
      const sessions = db.prepare("SELECT id FROM conversation_sessions").all() as { id: string }[];
      db.prepare("UPDATE conversation_sessions SET ended_at = ? WHERE id = ?").run(
        new Date().toISOString(),
        sessions[0]!.id
      );

      const handler = server.tools.get("list_conversation_sessions")!.handler;
      const result = await handler({ includeActive: false });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain("Found:** 1 session");
    });

    it("should respect limit parameter", async () => {
      const startHandler = server.tools.get("start_conversation_session")!.handler;
      for (let i = 0; i < 5; i++) {
        await startHandler({});
      }

      const handler = server.tools.get("list_conversation_sessions")!.handler;
      const result = await handler({ limit: 3 });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain("Found:** 3 sessions");
    });

    it("should include message count for each session", async () => {
      const startHandler = server.tools.get("start_conversation_session")!.handler;
      await startHandler({});

      const sessions = db.prepare("SELECT id FROM conversation_sessions").all() as { id: string }[];
      const sessionId = sessions[0]!.id;

      // Log some messages
      const logHandler = server.tools.get("log_conversation_message")!.handler;
      await logHandler({ sessionId, role: "user", content: "Message 1" });
      await logHandler({ sessionId, role: "assistant", content: "Message 2" });

      const handler = server.tools.get("list_conversation_sessions")!.handler;
      const result = await handler({});

      expect(result.isError).toBeUndefined();
      // Parse the JSON from the response
      const jsonMatch = result.content[0]?.text.match(/```json\n([\s\S]*?)\n```/);
      expect(jsonMatch).toBeTruthy();
      const sessionList = JSON.parse(jsonMatch?.[1] ?? "[]");
      expect(sessionList[0].messageCount).toBe(2);
    });

    it("should include project and ticket names in response", async () => {
      const startHandler = server.tools.get("start_conversation_session")!.handler;
      await startHandler({ projectId, ticketId });

      const handler = server.tools.get("list_conversation_sessions")!.handler;
      const result = await handler({});

      // Parse the JSON from the response
      const jsonMatch = result.content[0]?.text.match(/```json\n([\s\S]*?)\n```/);
      const sessionList = JSON.parse(jsonMatch?.[1] ?? "[]");
      expect(sessionList[0].projectName).toBe("Test Project");
      expect(sessionList[0].ticketTitle).toBe("Test Ticket");
    });

    it("should sort by started_at descending", async () => {
      const startHandler = server.tools.get("start_conversation_session")!.handler;
      await startHandler({});
      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay
      await startHandler({});

      const handler = server.tools.get("list_conversation_sessions")!.handler;
      const result = await handler({});

      const jsonMatch = result.content[0]?.text.match(/```json\n([\s\S]*?)\n```/);
      const sessionList = JSON.parse(jsonMatch?.[1] ?? "[]");
      expect(new Date(sessionList[0].startedAt).getTime()).toBeGreaterThan(
        new Date(sessionList[1].startedAt).getTime()
      );
    });

    it("should return empty array when no sessions match filters", async () => {
      const handler = server.tools.get("list_conversation_sessions")!.handler;
      const result = await handler({ projectId: "non-existent-project" });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain("Found:** 0 sessions");
    });

    it("should combine multiple filters", async () => {
      const startHandler = server.tools.get("start_conversation_session")!.handler;
      await startHandler({ projectId });
      await startHandler({ projectId, ticketId });
      await startHandler({ ticketId });

      const handler = server.tools.get("list_conversation_sessions")!.handler;
      const result = await handler({ projectId, ticketId });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain("Found:** 1 session");
    });
  });

  describe("export_compliance_logs", () => {
    let projectId: string;
    let sessionId: string;
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    beforeEach(async () => {
      // Create project for testing
      projectId = randomUUID();
      db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
        projectId,
        "Test Project",
        "/test/path",
        new Date().toISOString()
      );

      // Create a session with messages
      const startHandler = server.tools.get("start_conversation_session")!.handler;
      await startHandler({ projectId });
      const sessions = db.prepare("SELECT id FROM conversation_sessions").all() as { id: string }[];
      sessionId = sessions[0]!.id;

      // Log some messages
      const logHandler = server.tools.get("log_conversation_message")!.handler;
      await logHandler({ sessionId, role: "user", content: "Hello, how are you?" });
      await logHandler({ sessionId, role: "assistant", content: "I'm doing well!" });
    });

    it("should register the export_compliance_logs tool", () => {
      expect(server.tool).toHaveBeenCalledWith(
        "export_compliance_logs",
        expect.any(String),
        expect.any(Object),
        expect.any(Function)
      );
    });

    it("should export sessions within date range", async () => {
      const handler = server.tools.get("export_compliance_logs")!.handler;
      const result = await handler({ startDate: yesterday, endDate: tomorrow });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain("Compliance Export Complete");
      expect(result.content[0]?.text).toContain("Sessions:** 1");
      expect(result.content[0]?.text).toContain("Messages:** 2");
    });

    it("should verify message integrity by default", async () => {
      const handler = server.tools.get("export_compliance_logs")!.handler;
      const result = await handler({ startDate: yesterday, endDate: tomorrow });

      expect(result.content[0]?.text).toContain("Integrity Check:** ✅ PASSED");
      expect(result.content[0]?.text).toContain("Valid Messages:** 2/2");
    });

    it("should detect tampered messages", async () => {
      // Tamper with a message hash
      db.prepare(
        "UPDATE conversation_messages SET content_hash = 'tampered_hash' WHERE session_id = ?"
      ).run(sessionId);

      const handler = server.tools.get("export_compliance_logs")!.handler;
      const result = await handler({ startDate: yesterday, endDate: tomorrow });

      expect(result.content[0]?.text).toContain("Integrity Check:** ⚠️ FAILED");
      expect(result.content[0]?.text).toContain("Invalid Message IDs:");
    });

    it("should skip integrity verification when disabled", async () => {
      const handler = server.tools.get("export_compliance_logs")!.handler;
      const result = await handler({
        startDate: yesterday,
        endDate: tomorrow,
        verifyIntegrity: false,
      });

      expect(result.content[0]?.text).toContain("Integrity Check:** Skipped");
    });

    it("should redact content when includeContent is false", async () => {
      const handler = server.tools.get("export_compliance_logs")!.handler;
      const result = await handler({
        startDate: yesterday,
        endDate: tomorrow,
        includeContent: false,
      });

      expect(result.content[0]?.text).toContain("[REDACTED]");
      expect(result.content[0]?.text).not.toContain("Hello, how are you?");
    });

    it("should filter by sessionId", async () => {
      // Create another session
      const startHandler = server.tools.get("start_conversation_session")!.handler;
      await startHandler({});

      const handler = server.tools.get("export_compliance_logs")!.handler;
      const result = await handler({
        sessionId,
        startDate: yesterday,
        endDate: tomorrow,
      });

      expect(result.content[0]?.text).toContain("Sessions:** 1");
    });

    it("should filter by projectId", async () => {
      // Create session without project
      const startHandler = server.tools.get("start_conversation_session")!.handler;
      await startHandler({});

      const handler = server.tools.get("export_compliance_logs")!.handler;
      const result = await handler({
        projectId,
        startDate: yesterday,
        endDate: tomorrow,
      });

      expect(result.content[0]?.text).toContain("Sessions:** 1");
    });

    it("should return empty result for non-matching date range", async () => {
      const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const pastDateEnd = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();

      const handler = server.tools.get("export_compliance_logs")!.handler;
      const result = await handler({ startDate: pastDate, endDate: pastDateEnd });

      expect(result.content[0]?.text).toContain("Sessions Found:** 0");
    });

    it("should log export access to audit table", async () => {
      const handler = server.tools.get("export_compliance_logs")!.handler;
      await handler({ startDate: yesterday, endDate: tomorrow });

      const auditLogs = db.prepare("SELECT * FROM audit_log_access").all() as {
        id: string;
        action: string;
        target_type: string;
      }[];
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0]?.action).toBe("export");
      expect(auditLogs[0]?.target_type).toBe("compliance_export");
    });

    it("should include export metadata in response", async () => {
      const handler = server.tools.get("export_compliance_logs")!.handler;
      const result = await handler({ startDate: yesterday, endDate: tomorrow });

      // Parse the JSON from the response
      const jsonMatch = result.content[0]?.text.match(/```json\n([\s\S]*?)\n```/);
      const exportData = JSON.parse(jsonMatch?.[1] ?? "{}");

      expect(exportData.exportMetadata).toBeDefined();
      expect(exportData.exportMetadata.exportId).toBeDefined();
      expect(exportData.exportMetadata.sessionCount).toBe(1);
      expect(exportData.exportMetadata.messageCount).toBe(2);
    });

    it("should include integrity report when verifying", async () => {
      const handler = server.tools.get("export_compliance_logs")!.handler;
      const result = await handler({ startDate: yesterday, endDate: tomorrow });

      const jsonMatch = result.content[0]?.text.match(/```json\n([\s\S]*?)\n```/);
      const exportData = JSON.parse(jsonMatch?.[1] ?? "{}");

      expect(exportData.integrityReport).toBeDefined();
      expect(exportData.integrityReport.totalMessages).toBe(2);
      expect(exportData.integrityReport.validMessages).toBe(2);
      expect(exportData.integrityReport.integrityPassed).toBe(true);
    });

    it("should include nested messages in session export", async () => {
      const handler = server.tools.get("export_compliance_logs")!.handler;
      const result = await handler({ startDate: yesterday, endDate: tomorrow });

      const jsonMatch = result.content[0]?.text.match(/```json\n([\s\S]*?)\n```/);
      const exportData = JSON.parse(jsonMatch?.[1] ?? "{}");

      expect(exportData.sessions).toHaveLength(1);
      expect(exportData.sessions[0].messages).toHaveLength(2);
      expect(exportData.sessions[0].messages[0].role).toBe("user");
      expect(exportData.sessions[0].messages[1].role).toBe("assistant");
    });

    it("should export multiple sessions", async () => {
      // Create more sessions
      const startHandler = server.tools.get("start_conversation_session")!.handler;
      await startHandler({});
      await startHandler({ projectId });

      const handler = server.tools.get("export_compliance_logs")!.handler;
      const result = await handler({ startDate: yesterday, endDate: tomorrow });

      expect(result.content[0]?.text).toContain("Sessions:** 3");
    });
  });

  describe("archive_old_sessions", () => {
    // Helper to create an old session (older than retention)
    function createOldSession(daysOld: number, legalHold = false): string {
      const id = randomUUID();
      const oldDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
      db.prepare(
        `
        INSERT INTO conversation_sessions (id, environment, data_classification, legal_hold, started_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(id, "claude-code", "internal", legalHold ? 1 : 0, oldDate, oldDate);
      return id;
    }

    function addMessageToSession(sessionId: string): void {
      const id = randomUUID();
      db.prepare(
        `
        INSERT INTO conversation_messages (id, session_id, role, content, content_hash, sequence_number, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      ).run(id, sessionId, "user", "Test message", "test_hash", 1, new Date().toISOString());
    }

    it("should register the archive_old_sessions tool", () => {
      expect(server.tool).toHaveBeenCalledWith(
        "archive_old_sessions",
        expect.any(String),
        expect.any(Object),
        expect.any(Function)
      );
    });

    it("should show dry-run preview by default", async () => {
      // Create an old session (100 days old, default retention is 90)
      const oldSessionId = createOldSession(100);
      addMessageToSession(oldSessionId);

      const handler = server.tools.get("archive_old_sessions")!.handler;
      const result = await handler({});

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain("DRY RUN");
      expect(result.content[0]?.text).toContain("Sessions to Delete:** 1");
      expect(result.content[0]?.text).toContain("Messages to Delete:** 1");
      expect(result.content[0]?.text).toContain("No data has been deleted");

      // Verify session still exists
      const session = db
        .prepare("SELECT * FROM conversation_sessions WHERE id = ?")
        .get(oldSessionId);
      expect(session).toBeDefined();
    });

    it("should delete sessions when confirm is true", async () => {
      const oldSessionId = createOldSession(100);
      addMessageToSession(oldSessionId);

      const handler = server.tools.get("archive_old_sessions")!.handler;
      const result = await handler({ confirm: true });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain("Retention Cleanup Complete");
      expect(result.content[0]?.text).toContain("Sessions Deleted:** 1");
      expect(result.content[0]?.text).toContain("Messages Deleted:** 1");

      // Verify session is deleted
      const session = db
        .prepare("SELECT * FROM conversation_sessions WHERE id = ?")
        .get(oldSessionId);
      expect(session).toBeUndefined();
    });

    it("should never delete sessions with legal_hold", async () => {
      const oldSessionId = createOldSession(100);
      const legalHoldSessionId = createOldSession(100, true);
      addMessageToSession(oldSessionId);
      addMessageToSession(legalHoldSessionId);

      const handler = server.tools.get("archive_old_sessions")!.handler;
      const result = await handler({ confirm: true });

      expect(result.content[0]?.text).toContain("Sessions Deleted:** 1");
      expect(result.content[0]?.text).toContain("Sessions Under Legal Hold:** 1 (preserved)");

      // Verify legal hold session still exists
      const legalSession = db
        .prepare("SELECT * FROM conversation_sessions WHERE id = ?")
        .get(legalHoldSessionId);
      expect(legalSession).toBeDefined();
    });

    it("should respect custom retention days", async () => {
      // Create sessions at different ages
      createOldSession(50); // Should be kept with 60 day retention
      createOldSession(70); // Should be deleted with 60 day retention

      const handler = server.tools.get("archive_old_sessions")!.handler;
      const result = await handler({ retentionDays: 60 });

      expect(result.content[0]?.text).toContain("Retention Period:** 60 days");
      expect(result.content[0]?.text).toContain("Sessions to Delete:** 1");
    });

    it("should use retention from settings when not specified", async () => {
      // Update settings to 30 days
      db.prepare("UPDATE settings SET conversation_retention_days = 30").run();

      createOldSession(40); // Should be deleted with 30 day retention

      const handler = server.tools.get("archive_old_sessions")!.handler;
      const result = await handler({});

      expect(result.content[0]?.text).toContain("Retention Period:** 30 days");
      expect(result.content[0]?.text).toContain("Sessions to Delete:** 1");
    });

    it("should return no sessions eligible when none match", async () => {
      // Create recent sessions only
      const startHandler = server.tools.get("start_conversation_session")!.handler;
      await startHandler({});

      const handler = server.tools.get("archive_old_sessions")!.handler;
      const result = await handler({});

      expect(result.content[0]?.text).toContain("Eligible Sessions:** 0");
      expect(result.content[0]?.text).toContain("No sessions eligible for archival");
    });

    it("should log archive action to audit table", async () => {
      createOldSession(100);

      const handler = server.tools.get("archive_old_sessions")!.handler;
      await handler({ confirm: true });

      const auditLogs = db
        .prepare("SELECT * FROM audit_log_access WHERE target_type = ?")
        .all("retention_cleanup") as { action: string; result: string }[];
      expect(auditLogs.length).toBeGreaterThan(0);
      expect(auditLogs.some((log) => log.action === "delete")).toBe(true);
    });

    it("should delete multiple sessions atomically", async () => {
      const session1 = createOldSession(100);
      const session2 = createOldSession(110);
      const session3 = createOldSession(120);
      addMessageToSession(session1);
      addMessageToSession(session2);
      addMessageToSession(session3);

      const handler = server.tools.get("archive_old_sessions")!.handler;
      const result = await handler({ confirm: true });

      expect(result.content[0]?.text).toContain("Sessions Deleted:** 3");
      expect(result.content[0]?.text).toContain("Messages Deleted:** 3");

      // Verify all sessions are deleted
      const remainingSessions = db
        .prepare("SELECT COUNT(*) as count FROM conversation_sessions")
        .get() as { count: number };
      expect(remainingSessions.count).toBe(0);
    });

    it("should include session preview in dry-run response", async () => {
      const oldSessionId = createOldSession(100);

      const handler = server.tools.get("archive_old_sessions")!.handler;
      const result = await handler({});

      expect(result.content[0]?.text).toContain("Sessions Eligible for Deletion");
      expect(result.content[0]?.text).toContain(oldSessionId);
    });

    it("should report legal hold sessions even when nothing to delete", async () => {
      // Only create a legal hold session
      createOldSession(100, true);

      const handler = server.tools.get("archive_old_sessions")!.handler;
      const result = await handler({});

      expect(result.content[0]?.text).toContain("Eligible Sessions:** 0");
      expect(result.content[0]?.text).toContain("Sessions Under Legal Hold:** 1");
      expect(result.content[0]?.text).toContain("protected by legal hold");
    });
  });
});
