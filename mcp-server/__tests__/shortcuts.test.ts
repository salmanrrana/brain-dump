/**
 * Tests for shortcut tools (composite workflow tools)
 * @module __tests__/shortcuts.test
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { unlinkSync, existsSync } from "fs";
import { registerShortcutTools } from "../tools/shortcuts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "test-shortcuts.db");

// Mock McpServer for testing
const createMockServer = () => {
  const tools = {};
  return {
    tool: (name, description, schema, handler) => {
      tools[name] = { description, schema, handler };
    },
    getTools: () => tools,
  };
};

describe("Shortcut Tools", () => {
  let db;
  let server;

  beforeEach(() => {
    // Clean up any existing test database
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }

    // Create test database with minimal schema
    db = new Database(dbPath);

    // Create tables
    db.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT,
        path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE epics (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        title TEXT,
        status TEXT DEFAULT 'backlog',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE tickets (
        id TEXT PRIMARY KEY,
        epic_id TEXT,
        project_id TEXT,
        title TEXT,
        status TEXT DEFAULT 'backlog',
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE comments (
        id TEXT PRIMARY KEY,
        ticket_id TEXT,
        message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert test data
    db.prepare("INSERT INTO projects (id, name, path) VALUES (?, ?, ?)").run(
      "proj-1",
      "Test Project",
      "/test/path"
    );

    db.prepare(
      "INSERT INTO tickets (id, epic_id, project_id, title, status) VALUES (?, ?, ?, ?, ?)"
    ).run("ticket-1", null, "proj-1", "Test Ticket", "backlog");

    db.prepare(
      "INSERT INTO tickets (id, epic_id, project_id, title, status) VALUES (?, ?, ?, ?, ?)"
    ).run("ticket-2", null, "proj-1", "In Progress Ticket", "in_progress");

    server = createMockServer();
    registerShortcutTools(server, db);
  });

  afterEach(() => {
    db.close();
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  it("should register all shortcut tools", () => {
    const tools = server.getTools();
    expect(tools).toHaveProperty("quick_start_ticket");
    expect(tools).toHaveProperty("quick_complete_work");
    expect(tools).toHaveProperty("quick_submit_finding");
    expect(tools).toHaveProperty("workflow_status");
  });

  describe("quick_start_ticket", () => {
    it("should start work on a ticket", async () => {
      const tools = server.getTools();
      const handler = tools.quick_start_ticket.handler;

      const result = await handler({ ticketId: "ticket-1" });

      expect(result).toHaveProperty("content");
      expect(result.content[0].text).toContain("Started work on ticket ticket-1");
      expect(result.content[0].text).toContain("Test Ticket");
    });

    it("should reject non-existent tickets", async () => {
      const tools = server.getTools();
      const handler = tools.quick_start_ticket.handler;

      const result = await handler({ ticketId: "nonexistent" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });

    it("should reject starting already in_progress tickets", async () => {
      const tools = server.getTools();
      const handler = tools.quick_start_ticket.handler;

      const result = await handler({ ticketId: "ticket-2" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("already in_progress");
    });

    it("should accept optional session name", async () => {
      const tools = server.getTools();
      const handler = tools.quick_start_ticket.handler;

      const result = await handler({
        ticketId: "ticket-1",
        sessionName: "My Custom Session",
      });

      expect(result.content[0].text).toContain("My Custom Session");
    });
  });

  describe("quick_complete_work", () => {
    it("should complete work on a ticket", async () => {
      const tools = server.getTools();
      const handler = tools.quick_complete_work.handler;

      const result = await handler({
        ticketId: "ticket-2",
        summary: "Implemented feature XYZ",
      });

      expect(result).toHaveProperty("content");
      expect(result.content[0].text).toContain("Completed work on ticket ticket-2");
      expect(result.content[0].text).toContain("Implemented feature XYZ");
    });

    it("should reject non-existent tickets", async () => {
      const tools = server.getTools();
      const handler = tools.quick_complete_work.handler;

      const result = await handler({
        ticketId: "nonexistent",
        summary: "Test",
      });

      expect(result.isError).toBe(true);
    });

    it("should reject completing tickets not in_progress", async () => {
      const tools = server.getTools();
      const handler = tools.quick_complete_work.handler;

      const result = await handler({
        ticketId: "ticket-1",
        summary: "Test",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("must be in_progress");
    });

    it("should enforce summary length limit", async () => {
      const tools = server.getTools();
      const schema = tools.quick_complete_work.schema;

      // The schema should have summary with max 500 chars
      expect(schema.summary.maxLength).toBe(500);
    });
  });

  describe("quick_submit_finding", () => {
    it("should submit a code review finding", async () => {
      const tools = server.getTools();
      const handler = tools.quick_submit_finding.handler;

      const result = await handler({
        ticketId: "ticket-1",
        agent: "code-reviewer",
        severity: "Major",
        category: "type-safety",
        description: "Missing type annotation on parameter",
      });

      expect(result).toHaveProperty("content");
      expect(result.content[0].text).toContain("Major");
      expect(result.content[0].text).toContain("code-reviewer");
    });

    it("should support marking findings as fixed", async () => {
      const tools = server.getTools();
      const handler = tools.quick_submit_finding.handler;

      const result = await handler({
        ticketId: "ticket-1",
        agent: "silent-failure-hunter",
        severity: "Minor",
        category: "error-handling",
        description: "Unhandled exception case",
        fixed: true,
      });

      expect(result.content[0].text).toContain("fixed");
    });

    it("should reject non-existent tickets", async () => {
      const tools = server.getTools();
      const handler = tools.quick_submit_finding.handler;

      const result = await handler({
        ticketId: "nonexistent",
        agent: "code-reviewer",
        severity: "Critical",
        category: "security",
        description: "Test",
      });

      expect(result.isError).toBe(true);
    });

    it("should accept all severity levels", async () => {
      const tools = server.getTools();
      const schema = tools.quick_submit_finding.schema;

      // Verify schema allows all severities
      const severityValues = schema.severity._def.values;
      expect(severityValues).toContain("Critical");
      expect(severityValues).toContain("Major");
      expect(severityValues).toContain("Minor");
      expect(severityValues).toContain("Suggestion");
    });
  });

  describe("workflow_status", () => {
    it("should provide workflow status", async () => {
      const tools = server.getTools();
      const handler = tools.workflow_status.handler;

      const result = await handler();

      expect(result).toHaveProperty("content");
      expect(result.content[0]).toHaveProperty("type", "text");
      // Should return some workflow status information
      expect(result.content[0].text).toMatch(/workflow|Workflow|ticket|status/i);
    });
  });

  describe("Tool Integration", () => {
    it("should have proper Zod schemas for input validation", () => {
      const tools = server.getTools();

      // Check quick_start_ticket schema
      expect(tools.quick_start_ticket.schema).toBeDefined();
      expect(tools.quick_start_ticket.schema.ticketId).toBeDefined();

      // Check quick_complete_work schema
      expect(tools.quick_complete_work.schema).toBeDefined();
      expect(tools.quick_complete_work.schema.summary).toBeDefined();

      // Check quick_submit_finding schema
      expect(tools.quick_submit_finding.schema).toBeDefined();
      expect(tools.quick_submit_finding.schema.agent).toBeDefined();
    });

    it("should have meaningful descriptions for all tools", () => {
      const tools = server.getTools();

      Object.entries(tools).forEach(([_name, tool]) => {
        expect(tool.description).toBeDefined();
        expect(tool.description.length).toBeGreaterThan(20);
      });
    });
  });
});
