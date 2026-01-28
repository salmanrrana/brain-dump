/**
 * Tests for tool usage analytics.
 * @module lib/tool-usage-analytics.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { ToolUsageAnalytics } from "./tool-usage-analytics.js";
import path from "path";
import os from "os";
import { mkdirSync, rmSync } from "fs";

describe("ToolUsageAnalytics", () => {
  let testDir;
  let dbPath;
  let analytics;

  beforeEach(() => {
    // Create temporary directory for test database
    testDir = path.join(os.tmpdir(), `tool-analytics-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    dbPath = path.join(testDir, "test.db");

    // Initialize test database with schema
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS tool_usage_events (
        id TEXT PRIMARY KEY,
        tool_name TEXT NOT NULL,
        session_id TEXT,
        ticket_id TEXT,
        project_id TEXT,
        context TEXT DEFAULT 'unknown',
        invocations INTEGER NOT NULL DEFAULT 1,
        success_count INTEGER NOT NULL DEFAULT 0,
        error_count INTEGER NOT NULL DEFAULT 0,
        total_duration INTEGER DEFAULT 0,
        last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_tool_usage_tool_name ON tool_usage_events(tool_name);
      CREATE INDEX IF NOT EXISTS idx_tool_usage_session ON tool_usage_events(session_id);
      CREATE INDEX IF NOT EXISTS idx_tool_usage_ticket ON tool_usage_events(ticket_id);
      CREATE INDEX IF NOT EXISTS idx_tool_usage_project ON tool_usage_events(project_id);
      CREATE INDEX IF NOT EXISTS idx_tool_usage_last_used ON tool_usage_events(last_used_at);
    `);
    db.close();

    // Create analytics instance
    analytics = new ToolUsageAnalytics(dbPath);
  });

  afterEach(async () => {
    await analytics.shutdown();
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("recordToolUsage", () => {
    it("should record a single tool invocation", async () => {
      analytics.recordToolUsage("test_tool", { context: "ticket_work" });

      // Flush to database
      await analytics.flushToDatabase();

      const stats = analytics.getToolStats("test_tool");
      expect(stats).toBeDefined();
      expect(stats.totalInvocations).toBe(1);
      expect(stats.totalSuccesses).toBe(1);
    });

    it("should track multiple invocations of the same tool", async () => {
      analytics.recordToolUsage("test_tool", { context: "ticket_work", success: true });
      analytics.recordToolUsage("test_tool", { context: "ticket_work", success: true });
      analytics.recordToolUsage("test_tool", { context: "ticket_work", success: false });

      await analytics.flushToDatabase();

      const stats = analytics.getToolStats("test_tool");
      expect(stats.totalInvocations).toBe(3);
      expect(stats.totalSuccesses).toBe(2);
      expect(stats.totalErrors).toBe(1);
    });

    it("should track execution duration", async () => {
      analytics.recordToolUsage("slow_tool", {
        context: "ticket_work",
        duration: 1500,
      });
      analytics.recordToolUsage("slow_tool", {
        context: "ticket_work",
        duration: 500,
      });

      await analytics.flushToDatabase();

      const stats = analytics.getToolStats("slow_tool");
      expect(stats.totalDuration).toBe(2000);
      expect(stats.averageDuration).toBe(1000);
    });

    it("should track context usage", async () => {
      analytics.recordToolUsage("context_tool", { context: "ticket_work" });
      analytics.recordToolUsage("context_tool", { context: "planning" });
      analytics.recordToolUsage("context_tool", { context: "review" });

      await analytics.flushToDatabase();

      const stats = analytics.getToolStats("context_tool");
      expect(stats.contexts).toContain("ticket_work");
      expect(stats.contexts).toContain("planning");
      expect(stats.contexts).toContain("review");
    });
  });

  describe("getToolStats", () => {
    beforeEach(async () => {
      analytics.recordToolUsage("popular_tool", { context: "ticket_work", success: true, duration: 100 });
      analytics.recordToolUsage("popular_tool", { context: "ticket_work", success: true, duration: 150 });
      analytics.recordToolUsage("failing_tool", { context: "planning", success: false });
      await analytics.flushToDatabase();
    });

    it("should return null for non-existent tools", () => {
      const stats = analytics.getToolStats("nonexistent");
      expect(stats).toBeNull();
    });

    it("should calculate success rate correctly", () => {
      const stats = analytics.getToolStats("popular_tool");
      expect(stats.successRate).toBe("100.0");
    });

    it("should include context information", () => {
      const stats = analytics.getToolStats("popular_tool");
      expect(stats.contexts).toBeDefined();
      expect(Array.isArray(stats.contexts)).toBe(true);
    });
  });

  describe("getAnalyticsSummary", () => {
    beforeEach(async () => {
      analytics.recordToolUsage("tool_a", { context: "ticket_work", success: true });
      analytics.recordToolUsage("tool_a", { context: "ticket_work", success: true });
      analytics.recordToolUsage("tool_b", { context: "planning", success: true });
      analytics.recordToolUsage("tool_b", { context: "planning", success: false });
      await analytics.flushToDatabase();
    });

    it("should return summary of all tools", () => {
      const summary = analytics.getAnalyticsSummary();
      expect(summary.totalTools).toBe(2);
      expect(summary.totalInvocations).toBe(4);
      expect(Array.isArray(summary.tools)).toBe(true);
    });

    it("should filter by minimum invocations", () => {
      const summary = analytics.getAnalyticsSummary({ minInvocations: 2 });
      expect(summary.tools.length).toBeGreaterThan(0);
      expect(summary.tools.every((t) => t.invocations >= 2)).toBe(true);
    });

    it("should filter by context", () => {
      const summary = analytics.getAnalyticsSummary({ context: "ticket_work" });
      expect(summary.tools.length).toBeGreaterThan(0);
    });

    it("should calculate average success rate", () => {
      const summary = analytics.getAnalyticsSummary();
      expect(typeof summary.averageSuccessRate).toBe("number");
      expect(summary.averageSuccessRate).toBeGreaterThanOrEqual(0);
      expect(summary.averageSuccessRate).toBeLessThanOrEqual(100);
    });
  });

  describe("getConsolidationCandidates", () => {
    beforeEach(async () => {
      // Rarely-used tools
      analytics.recordToolUsage("old_tool", { context: "ticket_work" });
      analytics.recordToolUsage("rarely_used", { context: "planning", success: false });

      // Frequently-used tools
      for (let i = 0; i < 20; i++) {
        analytics.recordToolUsage("popular_tool", { context: "ticket_work", success: true });
      }

      await analytics.flushToDatabase();
    });

    it("should identify rarely-used tools", () => {
      const candidates = analytics.getConsolidationCandidates({ maxInvocations: 5 });
      const toolNames = candidates.map((c) => c.name);

      expect(toolNames).toContain("old_tool");
      expect(toolNames).not.toContain("popular_tool");
    });

    it("should include reason for consolidation", () => {
      const candidates = analytics.getConsolidationCandidates({ maxInvocations: 5 });
      expect(candidates.every((c) => c.reason)).toBe(true);
    });

    it("should return empty array when no candidates match criteria", () => {
      const candidates = analytics.getConsolidationCandidates({ maxInvocations: 0 });
      // Should only return tools with 0 invocations or very old usage
      expect(Array.isArray(candidates)).toBe(true);
    });
  });

  describe("exportAnalytics", () => {
    beforeEach(async () => {
      analytics.recordToolUsage("export_test", { context: "ticket_work", success: true });
      await analytics.flushToDatabase();
    });

    it("should export as JSON", () => {
      const exported = analytics.exportAnalytics({ format: "json" });
      const data = JSON.parse(exported);

      expect(data.exportedAt).toBeDefined();
      expect(data.summary).toBeDefined();
      expect(data.consolidationCandidates).toBeDefined();
    });

    it("should export as CSV", () => {
      const exported = analytics.exportAnalytics({ format: "csv" });
      expect(typeof exported).toBe("string");
      expect(exported).toContain("Tool,");
    });
  });
});
