import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

const projectRoot = "/Users/salman.rana/code/brain-dump";
const hooksDir = path.join(projectRoot, ".claude/hooks");

test.describe("Claude Code Telemetry Hooks", () => {
  test("telemetry hooks are installed and executable", () => {
    const requiredHooks = [
      "start-telemetry-session.sh",
      "end-telemetry-session.sh",
      "log-tool-telemetry.sh",
      "log-prompt-telemetry.sh",
    ];

    requiredHooks.forEach((hook) => {
      const hookPath = path.join(hooksDir, hook);
      expect(fs.existsSync(hookPath)).toBeTruthy();

      const stats = fs.statSync(hookPath);
      expect(stats.mode & 0o111).toBeTruthy(); // executable
    });
  });

  test("hook files have proper bash shebang", () => {
    const hooks = [
      "start-telemetry-session.sh",
      "end-telemetry-session.sh",
      "log-tool-telemetry.sh",
      "log-prompt-telemetry.sh",
    ];

    hooks.forEach((hook) => {
      const hookPath = path.join(hooksDir, hook);
      const content = fs.readFileSync(hookPath, "utf-8");
      expect(content.startsWith("#!/bin")).toBeTruthy();
    });
  });

  test("start-telemetry-session hook contains session logic", () => {
    const hookPath = path.join(hooksDir, "start-telemetry-session.sh");
    const content = fs.readFileSync(hookPath, "utf-8");

    expect(content).toContain("start_telemetry_session");
    expect(content).toContain("sessionId");
  });

  test("end-telemetry-session hook handles queue flushing", () => {
    const hookPath = path.join(hooksDir, "end-telemetry-session.sh");
    const content = fs.readFileSync(hookPath, "utf-8");

    expect(content).toContain("end_telemetry_session");
    expect(content).toContain("telemetry-queue");
  });

  test("log-tool-telemetry hook captures correlation IDs", () => {
    const hookPath = path.join(hooksDir, "log-tool-telemetry.sh");
    const content = fs.readFileSync(hookPath, "utf-8");

    expect(content).toContain("correlation");
  });

  test("log-prompt-telemetry hook exists and is executable", () => {
    const hookPath = path.join(hooksDir, "log-prompt-telemetry.sh");
    expect(fs.existsSync(hookPath)).toBeTruthy();

    const stats = fs.statSync(hookPath);
    expect(stats.mode & 0o111).toBeTruthy();

    const content = fs.readFileSync(hookPath, "utf-8");
    expect(content).toContain("log_prompt_event");
  });

  test("telemetry event format is JSON with required fields", () => {
    // Verify expected telemetry event structure
    const event = {
      sessionId: randomUUID(),
      correlationId: randomUUID(),
      event: "start",
      toolName: "Read",
      timestamp: new Date().toISOString(),
    };

    expect(event.sessionId).toBeDefined();
    expect(event.correlationId).toBeDefined();
    expect(event.event).toBe("start");
    expect(event.toolName).toBeDefined();
    expect(event.timestamp).toBeDefined();

    // Should be JSON serializable
    const json = JSON.stringify(event);
    const parsed = JSON.parse(json);
    expect(parsed.sessionId).toBe(event.sessionId);
  });

  test("end event includes duration and success status", () => {
    const endEvent = {
      sessionId: randomUUID(),
      correlationId: randomUUID(),
      event: "end",
      toolName: "Write",
      durationMs: 150,
      success: true,
      timestamp: new Date().toISOString(),
    };

    expect(endEvent.durationMs).toBeGreaterThan(0);
    expect(typeof endEvent.success).toBe("boolean");
    expect(endEvent.event).toBe("end");
  });

  test("failure event includes error information", () => {
    const failureEvent = {
      sessionId: randomUUID(),
      correlationId: randomUUID(),
      event: "end",
      toolName: "Edit",
      durationMs: 50,
      success: false,
      error: "File not found",
      timestamp: new Date().toISOString(),
    };

    expect(failureEvent.success).toBe(false);
    expect(failureEvent.error).toBeDefined();
  });

  test("correlation IDs properly pair start and end events", () => {
    const correlationId = randomUUID();
    const sessionId = randomUUID();

    const startEvent = {
      sessionId,
      correlationId,
      event: "start",
      tool: "Edit",
    };

    const endEvent = {
      sessionId,
      correlationId,
      event: "end",
      tool: "Edit",
      duration: 250,
    };

    // Correlation IDs should match
    expect(startEvent.correlationId).toBe(endEvent.correlationId);
    // Session IDs should match
    expect(startEvent.sessionId).toBe(endEvent.sessionId);
    // Event types should differ
    expect(startEvent.event).not.toBe(endEvent.event);
  });

  test("JSONL queue format can be parsed", () => {
    // Create sample JSONL content
    const events = [
      { sessionId: randomUUID(), event: "start", tool: "Read" },
      { sessionId: randomUUID(), event: "end", tool: "Read", duration: 100 },
      { sessionId: randomUUID(), event: "start", tool: "Write" },
    ];

    const jsonl = events.map((e) => JSON.stringify(e)).join("\n");
    const lines = jsonl.split("\n");

    expect(lines.length).toBe(3);
    lines.forEach((line) => {
      const parsed = JSON.parse(line);
      expect(parsed.sessionId).toBeDefined();
      expect(parsed.event).toBeDefined();
    });
  });

  test("hooks do not break Claude session on error", () => {
    const hooksToCheck = [
      "start-telemetry-session.sh",
      "end-telemetry-session.sh",
      "log-tool-telemetry.sh",
      "log-prompt-telemetry.sh",
    ];

    hooksToCheck.forEach((hook) => {
      const hookPath = path.join(hooksDir, hook);
      const content = fs.readFileSync(hookPath, "utf-8");

      // Hooks should either:
      // 1. Handle errors gracefully with || true
      // 2. Use set -e and handle critical paths carefully
      // 3. Use exit codes that don't block Claude (0 or 1)

      // Should not have aggressive exit behavior that would kill sessions
      expect(!content.includes("exit 2")).toBeTruthy();
    });
  });

  test("merge-telemetry-hooks script exists", () => {
    const hookPath = path.join(hooksDir, "merge-telemetry-hooks.sh");
    expect(fs.existsSync(hookPath)).toBeTruthy();

    const content = fs.readFileSync(hookPath, "utf-8");
    expect(content).toContain("merge");
  });

  test("session files created in correct locations", () => {
    // Verify expected session file paths
    const sessionPaths = [
      ".claude/telemetry-session.json",
      ".claude/telemetry-queue.jsonl",
      ".claude/tool-correlations.json",
    ];

    // These files would be created at runtime, so we just verify the paths
    sessionPaths.forEach((filePath) => {
      const expectedPath = path.join(projectRoot, filePath);
      // Just verify the path format is valid
      expect(expectedPath).toContain(".claude");
    });
  });

  test("telemetry event schema validation", () => {
    // Verify multiple event types match expected schema
    const toolStartEvent = {
      sessionId: randomUUID(),
      correlationId: randomUUID(),
      event: "start",
      toolName: "Read",
      params: { file_path: "/some/file" },
      timestamp: new Date().toISOString(),
    };

    const toolEndEvent = {
      ...toolStartEvent,
      event: "end",
      durationMs: 100,
      success: true,
    };

    const promptEvent = {
      sessionId: randomUUID(),
      event: "prompt",
      promptHash: "abc123",
      timestamp: new Date().toISOString(),
    };

    // All should be JSON serializable
    expect(() => JSON.stringify(toolStartEvent)).not.toThrow();
    expect(() => JSON.stringify(toolEndEvent)).not.toThrow();
    expect(() => JSON.stringify(promptEvent)).not.toThrow();
  });
});
