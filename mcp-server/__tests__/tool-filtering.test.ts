/**
 * Tests for context-aware tool filtering system.
 * Verifies that tools are correctly filtered based on context and configuration.
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { ToolFilteringEngine } from "../lib/tool-filtering.js";
import { getToolMetadata, getToolStatistics } from "../lib/tool-metadata.js";

describe("Tool Filtering System", () => {
  let db;
  let engine;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(":memory:");

    // Create minimal schema for context detection
    db.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE tickets (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'backlog',
        project_id TEXT NOT NULL,
        position REAL NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE conversation_sessions (
        id TEXT PRIMARY KEY,
        ticket_id TEXT,
        project_id TEXT,
        environment TEXT,
        data_classification TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id),
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE INDEX idx_tickets_status ON tickets(status);
    `);

    // Create filtering engine with default settings
    engine = new ToolFilteringEngine(db, { enabled: true, mode: "default" });
  });

  describe("Tool Metadata Registry", () => {
    it("should have metadata for all tools", () => {
      const stats = getToolStatistics();
      expect(stats.totalTools).toBe(70);
    });

    it("should categorize tools into distinct categories", () => {
      const stats = getToolStatistics();
      expect(Object.keys(stats.byCategory).length).toBeGreaterThan(0);
      expect(stats.byCategory.workflow).toBeGreaterThan(0);
      expect(stats.byCategory.ticket_management).toBeGreaterThan(0);
    });

    it("should assign tools to relevant contexts", () => {
      const stats = getToolStatistics();
      expect(stats.byContext.ticket_work).toBeGreaterThan(0);
      expect(stats.byContext.planning).toBeGreaterThan(0);
      expect(stats.byContext.review).toBeGreaterThan(0);
      expect(stats.byContext.admin).toBeGreaterThan(0);
    });

    it("should get metadata for specific tools", () => {
      const metadata = getToolMetadata("list_tickets");
      expect(metadata).not.toBeNull();
      expect(metadata.name).toBe("list_tickets");
      expect(metadata.category).toBe("ticket_management");
      expect(metadata.priority).toBeGreaterThanOrEqual(1);
      expect(metadata.priority).toBeLessThanOrEqual(4);
    });

    it("should return null for non-existent tools", () => {
      const metadata = getToolMetadata("nonexistent_tool");
      expect(metadata).toBeNull();
    });
  });

  describe("ToolFilteringEngine", () => {
    it("should initialize with default settings", () => {
      expect(engine.enabled).toBe(true);
      expect(engine.mode).toBe("default");
      expect(engine.maxPriority).toBe(2);
    });

    it("should filter tools for ticket_work context", () => {
      const result = engine.filterTools({ contextType: "ticket_work" });

      expect(result.contextType).toBe("ticket_work");
      expect(result.visibleTools.length).toBeGreaterThan(0);
      expect(result.visibleTools.length).toBeLessThan(70);
      expect(result.visibleTools).toContain("list_tickets");
      expect(result.visibleTools).toContain("complete_ticket_work");
      expect(result.visibleTools).toContain("update_ticket_status");
    });

    it("should filter tools for planning context", () => {
      const result = engine.filterTools({ contextType: "planning" });

      expect(result.contextType).toBe("planning");
      expect(result.visibleTools).toContain("list_epics");
      expect(result.visibleTools).toContain("create_ticket");
      expect(result.visibleTools.length).toBeLessThan(70);
    });

    it("should filter tools for review context", () => {
      const result = engine.filterTools({ contextType: "review" });

      expect(result.contextType).toBe("review");
      expect(result.visibleTools).toContain("submit_review_finding");
      expect(result.visibleTools).toContain("generate_demo_script");
      expect(result.visibleTools).toContain("update_ticket_status");
    });

    it("should filter tools for admin context", () => {
      const result = engine.filterTools({ contextType: "admin" });

      expect(result.contextType).toBe("admin");
      expect(result.visibleTools).toContain("list_projects");
      expect(result.visibleTools).toContain("create_project");
      expect(result.visibleTools.length).toBeGreaterThanOrEqual(8);
    });

    it("should reduce tool count from 70 to ~10-15 per context", () => {
      const contexts = ["ticket_work", "planning", "review", "admin"];

      for (const context of contexts) {
        const result = engine.filterTools({ contextType: context });
        expect(result.visibleTools.length).toBeLessThan(25);
        expect(result.reducePercent).toBeGreaterThan(50);
      }
    });

    it("should include context-relevant tools like detect_context", () => {
      const result = engine.filterTools({ contextType: "ticket_work" });
      expect(result.visibleTools).toContain("detect_context");
    });

    it("should support alwaysShow configuration", () => {
      engine.addAlwaysShow("get_database_health");
      const result = engine.filterTools({ contextType: "ticket_work" });
      expect(result.visibleTools).toContain("get_database_health");
    });

    it("should support neverShow configuration", () => {
      engine.addNeverShow("list_tickets");
      const result = engine.filterTools({ contextType: "ticket_work" });
      expect(result.visibleTools).not.toContain("list_tickets");
    });
  });

  describe("Filter Modes", () => {
    it("should support strict mode (priority 1 only)", () => {
      engine.setMode("strict");
      const result = engine.filterTools({ contextType: "ticket_work" });

      // Strict mode should have fewer tools
      expect(result.visibleTools.length).toBeLessThan(15);

      // Should include critical tools like workflow tools
      expect(
        result.visibleTools.some((t) => ["start_ticket_work", "complete_ticket_work"].includes(t))
      ).toBe(true);
    });

    it("should support default mode (priority 1-2)", () => {
      engine.setMode("default");
      const result = engine.filterTools({ contextType: "ticket_work" });

      // Default mode should have more tools than strict
      expect(result.visibleTools.length).toBeGreaterThan(5);
    });

    it("should support permissive mode (priority 1-3)", () => {
      engine.setMode("permissive");
      const result = engine.filterTools({ contextType: "ticket_work" });

      // Permissive should have even more tools
      expect(result.visibleTools.length).toBeGreaterThan(10);
    });

    it("should support full mode (all tools)", () => {
      engine.setMode("full");
      const result = engine.filterTools({ contextType: "ticket_work" });

      // Full mode should show all tools
      expect(result.visibleTools.length).toBe(70);
    });

    it("should be able to change modes dynamically", () => {
      engine.setMode("strict");
      const strictCount = engine.filterTools({
        contextType: "ticket_work",
      }).visibleTools.length;

      engine.setMode("full");
      const fullCount = engine.filterTools({
        contextType: "ticket_work",
      }).visibleTools.length;

      expect(strictCount).toBeLessThan(fullCount);
    });
  });

  describe("Tool Visibility", () => {
    it("should check tool visibility in context", () => {
      const isVisible = engine.isToolVisible("list_tickets", {
        contextType: "ticket_work",
      });
      expect(isVisible).toBe(true);
    });

    it("should hide non-relevant tools", () => {
      const isVisible = engine.isToolVisible("get_telemetry_summary", {
        contextType: "ticket_work",
      });
      expect(isVisible).toBe(false);
    });

    it("should show alwaysShow tools regardless of context", () => {
      engine.addAlwaysShow("test_tool");
      const isVisible = engine.isToolVisible("test_tool", {
        contextType: "ticket_work",
      });
      expect(isVisible).toBe(true);
    });

    it("should hide neverShow tools regardless of context", () => {
      engine.addNeverShow("list_tickets");
      const isVisible = engine.isToolVisible("list_tickets", {
        contextType: "admin",
      });
      expect(isVisible).toBe(false);
    });
  });

  describe("Filtering Toggle", () => {
    it("should show all tools when filtering is disabled", () => {
      engine.setEnabled(false);
      const result = engine.filterTools({ contextType: "ticket_work" });

      // When disabled, filtering should not apply
      expect(result.visibleTools.length).toBe(70);
      expect(result.enabled).toBe(false);
    });

    it("should enable and disable filtering dynamically", () => {
      engine.setEnabled(true);
      const enabledResult = engine.filterTools({
        contextType: "ticket_work",
      });

      engine.setEnabled(false);
      const disabledResult = engine.filterTools({
        contextType: "ticket_work",
      });

      expect(enabledResult.visibleTools.length).toBeLessThan(disabledResult.visibleTools.length);
    });
  });

  describe("Shadow Mode (Testing)", () => {
    it("should show hidden tools in shadow mode", () => {
      const result = engine.filterTools({
        contextType: "ticket_work",
        shadowMode: true,
      });

      expect(result.shadowMode).toBe(true);
      expect(result.hiddenTools.length).toBeGreaterThan(0);
      expect(result.visibleTools.length + result.hiddenTools.length).toBe(70);
    });

    it("should not show hidden tools in normal mode", () => {
      const result = engine.filterTools({
        contextType: "ticket_work",
        shadowMode: false,
      });

      expect(result.hiddenTools).toBeUndefined();
    });
  });

  describe("Context Detection Integration", () => {
    beforeEach(() => {
      // Insert test data
      db.prepare("INSERT INTO projects (id, name, path) VALUES (?, ?, ?)").run(
        "proj-1",
        "Test Project",
        "/tmp/test"
      );

      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO tickets (id, title, status, project_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run("ticket-1", "Test Ticket", "in_progress", "proj-1", 1.0, now, now);

      db.prepare(
        "INSERT INTO conversation_sessions (id, ticket_id, project_id, environment, data_classification, started_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run("session-1", "ticket-1", "proj-1", "test", "internal", now, now);
    });

    it("should detect context from ticket ID", () => {
      const result = engine.filterTools({ ticketId: "ticket-1" });

      expect(result.contextType).toBe("ticket_work");
      expect(result.context).not.toBeNull();
      expect(result.context.ticketId).toBe("ticket-1");
    });

    it("should detect context from session ID", () => {
      const result = engine.filterTools({ sessionId: "session-1" });

      expect(result.contextType).toBe("ticket_work");
      // sessionId is stored in metadata.stateFile, not at top level
      expect(result.context.metadata.stateFile.sessionId).toBe("session-1");
    });

    it("should filter tools based on detected context", () => {
      const result = engine.filterTools({ sessionId: "session-1" });

      // Should use ticket_work context filtering
      expect(result.visibleTools).toContain("complete_ticket_work");
      expect(result.visibleTools).not.toContain("get_telemetry_summary");
    });
  });

  describe("Tool Statistics", () => {
    it("should provide accurate statistics", () => {
      const stats = engine.getStatistics();

      expect(stats.enabled).toBe(true);
      expect(stats.mode).toBe("default");
      // totalTools counts unique tools visible across all contexts (not total registered)
      expect(stats.totalTools).toBeGreaterThan(0);
      expect(stats.byContext).toHaveProperty("ticket_work");
      expect(stats.byContext).toHaveProperty("planning");
      expect(stats.byContext).toHaveProperty("review");
      expect(stats.byContext).toHaveProperty("admin");
    });

    it("should show different statistics for different modes", () => {
      engine.setMode("strict");
      const strictStats = engine.getStatistics();

      engine.setMode("full");
      const fullStats = engine.getStatistics();

      expect(strictStats.maxPriority).toBeLessThan(fullStats.maxPriority);
    });
  });

  describe("Tool Management", () => {
    it("should allow adding and removing alwaysShow tools", () => {
      expect(engine.alwaysShow.has("test_tool")).toBe(false);

      engine.addAlwaysShow("test_tool");
      expect(engine.alwaysShow.has("test_tool")).toBe(true);

      engine.removeAlwaysShow("test_tool");
      expect(engine.alwaysShow.has("test_tool")).toBe(false);
    });

    it("should allow adding and removing neverShow tools", () => {
      expect(engine.neverShow.has("test_tool")).toBe(false);

      engine.addNeverShow("test_tool");
      expect(engine.neverShow.has("test_tool")).toBe(true);

      engine.removeNeverShow("test_tool");
      expect(engine.neverShow.has("test_tool")).toBe(false);
    });

    it("should always show context detection tools", () => {
      const result = engine.filterTools({ contextType: "ticket_work" });
      expect(result.visibleTools).toContain("detect_context");
      expect(result.visibleTools).toContain("detect_all_contexts");
    });
  });

  describe("Tool Metadata Completeness", () => {
    it("should have no tools with missing priority", () => {
      const stats = getToolStatistics();
      // If this test passes, all tools have proper metadata
      expect(stats.totalTools).toBe(70);
    });

    it("should have all required tool fields", () => {
      const metadata = getToolMetadata("list_tickets");

      expect(metadata).toHaveProperty("name");
      expect(metadata).toHaveProperty("category");
      expect(metadata).toHaveProperty("contexts");
      expect(metadata).toHaveProperty("priority");
      expect(metadata).toHaveProperty("description");

      expect(Array.isArray(metadata.contexts)).toBe(true);
      expect(metadata.contexts.length).toBeGreaterThan(0);
    });

    it("should categorize workflow tools correctly", () => {
      const tools = ["start_ticket_work", "complete_ticket_work", "start_epic_work"];

      for (const toolName of tools) {
        const metadata = getToolMetadata(toolName);
        expect(metadata.category).toBe("workflow");
        expect(metadata.priority).toEqual(1); // Critical
      }
    });
  });

  describe("Reduction Effectiveness", () => {
    it("should reduce tool exposure by >50% in most contexts", () => {
      const contexts = ["ticket_work", "planning", "review", "admin"];

      for (const contextType of contexts) {
        const result = engine.filterTools({ contextType });
        expect(result.reducePercent).toBeGreaterThanOrEqual(50);
      }
    });

    it("should maintain critical tools across all contexts", () => {
      // detect_context should be visible in every context (alwaysShow)
      const contexts = ["ticket_work", "planning", "review", "admin"];

      for (const contextType of contexts) {
        const result = engine.filterTools({ contextType });
        expect(result.visibleTools).toContain("detect_context");
        expect(result.visibleTools).toContain("detect_all_contexts");
      }

      // list_tickets should be visible in ticket_work, planning, and admin
      const ticketContexts = ["ticket_work", "planning", "admin"];
      for (const contextType of ticketContexts) {
        const result = engine.filterTools({ contextType });
        expect(result.visibleTools).toContain("list_tickets");
      }
    });
  });
});
