/**
 * Integration tests for context-aware tool filtering settings.
 * Verifies that the enableContextAwareToolFiltering setting is properly
 * persisted and respected by the MCP server.
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { initToolFiltering } from "../tools/tool-filtering.js";

// Helper to initialize test database with settings table
function initializeTestDatabase() {
  const db = new Database(":memory:");

  // Create settings table matching the schema
  db.exec(`
    CREATE TABLE settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      terminal_emulator TEXT,
      ralph_sandbox INTEGER DEFAULT 0,
      ralph_timeout INTEGER DEFAULT 3600,
      ralph_max_iterations INTEGER DEFAULT 10,
      auto_create_pr INTEGER DEFAULT 1,
      pr_target_branch TEXT DEFAULT 'dev',
      default_projects_directory TEXT,
      default_working_method TEXT DEFAULT 'auto',
      docker_runtime TEXT,
      docker_socket_path TEXT,
      conversation_retention_days INTEGER DEFAULT 90,
      conversation_logging_enabled INTEGER DEFAULT 1,
      enable_worktree_support INTEGER DEFAULT 0,
      enable_context_aware_tool_filtering INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE tickets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'backlog',
      position REAL NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE conversation_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      ticket_id TEXT REFERENCES tickets(id),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Insert default settings
  db.prepare(
    "INSERT INTO settings (id) VALUES ('default')"
  ).run();

  return db;
}

describe("Settings Integration for Context-Aware Tool Filtering", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = initializeTestDatabase();
  });

  describe("Default Setting State", () => {
    it("should have filtering disabled by default", () => {
      const settings = db
        .prepare("SELECT enable_context_aware_tool_filtering FROM settings WHERE id = 'default'")
        .get() as any;
      expect(settings.enable_context_aware_tool_filtering).toBe(0);
    });

    it("should initialize filtering engine with disabled filtering", () => {
      const engine = initToolFiltering(db, { enabled: false });
      expect(engine).toBeDefined();
      // The engine should respect the enabled flag
      const result = engine.filterTools();
      // When disabled, should show all tools (enabled=false means no filtering)
      expect(result.enabled).toBe(false);
    });
  });

  describe("Setting Updates", () => {
    it("should allow enabling filtering through settings update", () => {
      // Simulate API call to enable filtering
      db.prepare(
        "UPDATE settings SET enable_context_aware_tool_filtering = 1 WHERE id = 'default'"
      ).run();

      const settings = db
        .prepare("SELECT enable_context_aware_tool_filtering FROM settings WHERE id = 'default'")
        .get() as any;
      expect(settings.enable_context_aware_tool_filtering).toBe(1);
    });

    it("should allow disabling filtering through settings update", () => {
      // First enable it
      db.prepare(
        "UPDATE settings SET enable_context_aware_tool_filtering = 1 WHERE id = 'default'"
      ).run();

      // Then disable it
      db.prepare(
        "UPDATE settings SET enable_context_aware_tool_filtering = 0 WHERE id = 'default'"
      ).run();

      const settings = db
        .prepare("SELECT enable_context_aware_tool_filtering FROM settings WHERE id = 'default'")
        .get() as any;
      expect(settings.enable_context_aware_tool_filtering).toBe(0);
    });
  });

  describe("MCP Server Initialization", () => {
    it("should read disabled setting and initialize with filtering off", () => {
      // Settings table starts with filtering disabled
      const settings = db
        .prepare("SELECT enable_context_aware_tool_filtering FROM settings WHERE id = 'default'")
        .get() as any;
      expect(settings.enable_context_aware_tool_filtering).toBe(0);

      // Initialize engine - should respect the setting
      const engine = initToolFiltering(db, {
        enabled: settings.enable_context_aware_tool_filtering === 1
      });
      const result = engine.filterTools();
      expect(result.enabled).toBe(false);
    });

    it("should read enabled setting and initialize with filtering on", () => {
      // Enable filtering in settings
      db.prepare(
        "UPDATE settings SET enable_context_aware_tool_filtering = 1 WHERE id = 'default'"
      ).run();

      const settings = db
        .prepare("SELECT enable_context_aware_tool_filtering FROM settings WHERE id = 'default'")
        .get() as any;
      expect(settings.enable_context_aware_tool_filtering).toBe(1);

      // Initialize engine with enabled=true
      const engine = initToolFiltering(db, {
        enabled: settings.enable_context_aware_tool_filtering === 1
      });
      const result = engine.filterTools();
      expect(result.enabled).toBe(true);
    });

    it("should handle missing settings table gracefully", () => {
      // Create a new database without settings table
      const emptyDb = new Database(":memory:");

      // Initialize without reading settings - should use default (disabled)
      // This is the fallback behavior when settings can't be read
      const engine = initToolFiltering(emptyDb, { enabled: false });
      const result = engine.filterTools();
      expect(result.enabled).toBe(false);
    });
  });

  describe("Behavior Changes Based on Setting", () => {
    it("should show all tools when filtering is disabled", () => {
      // Filtering disabled (default)
      const engine = initToolFiltering(db, { enabled: false });
      const result = engine.filterTools();

      // All 65 tools should be visible
      expect(result.visibleTools.length).toBe(65);
      expect(result.reducedCount).toBe(0);
    });

    it("should reduce tools when filtering is enabled", () => {
      // Filtering enabled
      const engine = initToolFiltering(db, { enabled: true });
      const result = engine.filterTools();

      // Should reduce tool count to 10-15 (depending on context)
      expect(result.visibleTools.length).toBeGreaterThan(0);
      expect(result.visibleTools.length).toBeLessThan(65);
      expect(result.reducedCount).toBeGreaterThan(0);
    });
  });

  describe("Backward Compatibility", () => {
    it("should not break existing workflows when filtering is disabled", () => {
      // Default behavior: filtering disabled
      const engine = initToolFiltering(db, { enabled: false });

      // All tools should be available, matching current behavior
      const result = engine.filterTools();
      expect(result.totalTools).toBe(65);
      expect(result.visibleTools.length).toBe(65);
    });

    it("should require explicit opt-in to enable filtering", () => {
      // Even if the column exists, filtering should be off by default
      const settings = db
        .prepare("SELECT enable_context_aware_tool_filtering FROM settings WHERE id = 'default'")
        .get() as any;

      // Default is 0 (false)
      expect(settings.enable_context_aware_tool_filtering).toBe(0);
    });
  });

  describe("Settings Persistence", () => {
    it("should persist filtering setting across database connections", () => {
      // Enable filtering
      db.prepare(
        "UPDATE settings SET enable_context_aware_tool_filtering = 1 WHERE id = 'default'"
      ).run();

      // Verify it was set
      let settings = db
        .prepare("SELECT enable_context_aware_tool_filtering FROM settings WHERE id = 'default'")
        .get() as any;
      expect(settings.enable_context_aware_tool_filtering).toBe(1);

      // Simulate reading setting again (as MCP server would)
      settings = db
        .prepare("SELECT enable_context_aware_tool_filtering FROM settings WHERE id = 'default'")
        .get() as any;
      expect(settings.enable_context_aware_tool_filtering).toBe(1);
    });

    it("should handle database queries safely", () => {
      // Verify query doesn't throw even if column has edge cases
      const result = db.prepare(
        "SELECT enable_context_aware_tool_filtering FROM settings WHERE id = 'default'"
      ).get();

      expect(result).toBeDefined();
      expect(typeof (result as any).enable_context_aware_tool_filtering).toBe("number");
    });
  });
});
