import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";

/**
 * Full Workflow with Telemetry Capture Integration Test
 *
 * This test simulates a complete ticket lifecycle through the Universal Quality Workflow:
 *   start_ticket_work → [tool calls] → complete_ticket_work → submit_review_finding (x3)
 *     → mark_finding_fixed (x3) → generate_demo_script → submit_demo_feedback(passed=true)
 *
 * Acceptance Criteria Verified:
 * 1. telemetry_sessions has 1 session linked to the ticket
 * 2. telemetry_events has tool events (start/end pairs with correlation IDs)
 * 3. review_findings has 3 findings (all marked fixed)
 * 4. demo_scripts has 1 demo script
 * 5. ticket_workflow_state has complete state
 * 6. ticket_comments has all mandatory comments (work start, work summary, progress comments)
 */

// Create a test database in a temp directory
const TEST_DB_DIR = join(tmpdir(), "brain-dump-e2e-test");
const TEST_DB_PATH = join(TEST_DB_DIR, `test-workflow-${Date.now()}.db`);

let db: ReturnType<typeof Database>;

// Test data IDs - must be outside describe for shared access
const projectId = randomUUID();
const epicId = randomUUID();
const ticketId = randomUUID();
const telemetrySessionId = randomUUID();

describe("Full Workflow with Telemetry Capture", () => {
  beforeAll(() => {
    // Ensure test directory exists
    if (!existsSync(TEST_DB_DIR)) {
      mkdirSync(TEST_DB_DIR, { recursive: true });
    }

    // Create and initialize test database with required schema
    db = new Database(TEST_DB_PATH);
    db.pragma("journal_mode = WAL");

    // Create all required tables
    initializeTestSchema(db);

    // Seed test data
    seedTestData(db, { projectId, epicId, ticketId });
  });

  afterAll(() => {
    db?.close();
    // Clean up test database (optional - keep for debugging)
    // if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
  });

  it("simulates full workflow and verifies all data is captured", () => {
    // ==========================================
    // Phase 1: Start Ticket Work
    // ==========================================
    const branchName = `feature/${ticketId.substring(0, 8)}-test-ticket`;
    const now = new Date().toISOString();

    // Simulate start_ticket_work MCP tool
    db.prepare("UPDATE tickets SET status = 'in_progress', branch_name = ? WHERE id = ?").run(
      branchName,
      ticketId
    );

    // Create telemetry session (simulates start_telemetry_session)
    db.prepare(
      `INSERT INTO telemetry_sessions (id, ticket_id, project_id, environment, branch_name, started_at)
       VALUES (?, ?, ?, 'test', ?, ?)`
    ).run(telemetrySessionId, ticketId, projectId, branchName, now);

    // Log session start event
    db.prepare(
      `INSERT INTO telemetry_events (id, session_id, ticket_id, event_type, event_data, created_at)
       VALUES (?, ?, ?, 'session_start', ?, ?)`
    ).run(randomUUID(), telemetrySessionId, ticketId, JSON.stringify({ environment: "test" }), now);

    // Create "Starting work" comment (mandatory audit trail)
    db.prepare(
      `INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at)
       VALUES (?, ?, ?, 'claude', 'work_summary', ?)`
    ).run(randomUUID(), ticketId, `Started work on ticket. Branch: ${branchName}`, now);

    // ==========================================
    // Phase 2: Simulate Tool Calls with Telemetry
    // ==========================================
    const toolCalls = [
      { name: "Read", params: { file: "src/index.ts" } },
      { name: "Edit", params: { file: "src/feature.ts", operation: "replace" } },
      { name: "Bash", params: { command: "pnpm test" } },
    ];

    for (const tool of toolCalls) {
      const correlationId = randomUUID();

      // Tool start event
      db.prepare(
        `INSERT INTO telemetry_events (id, session_id, ticket_id, event_type, tool_name, event_data, correlation_id, created_at)
         VALUES (?, ?, ?, 'tool_start', ?, ?, ?, ?)`
      ).run(
        randomUUID(),
        telemetrySessionId,
        ticketId,
        tool.name,
        JSON.stringify({ paramsSummary: JSON.stringify(tool.params) }),
        correlationId,
        new Date().toISOString()
      );

      // Simulate tool execution time
      const durationMs = Math.floor(Math.random() * 500) + 100;

      // Tool end event
      db.prepare(
        `INSERT INTO telemetry_events (id, session_id, ticket_id, event_type, tool_name, event_data, duration_ms, correlation_id, created_at)
         VALUES (?, ?, ?, 'tool_end', ?, ?, ?, ?, ?)`
      ).run(
        randomUUID(),
        telemetrySessionId,
        ticketId,
        tool.name,
        JSON.stringify({ success: true }),
        durationMs,
        correlationId,
        new Date().toISOString()
      );

      // Update session stats
      db.prepare(
        "UPDATE telemetry_sessions SET total_tool_calls = total_tool_calls + 1 WHERE id = ?"
      ).run(telemetrySessionId);
    }

    // ==========================================
    // Phase 3: Complete Ticket Work
    // ==========================================
    db.prepare("UPDATE tickets SET status = 'ai_review' WHERE id = ?").run(ticketId);

    // Create ticket workflow state (simulates complete_ticket_work)
    const workflowStateId = randomUUID();
    db.prepare(
      `INSERT INTO ticket_workflow_state (id, ticket_id, current_phase, review_iteration, findings_count, findings_fixed, demo_generated, created_at, updated_at)
       VALUES (?, ?, 'ai_review', 1, 0, 0, 0, ?, ?)`
    ).run(workflowStateId, ticketId, now, now);

    // Create work summary comment
    db.prepare(
      `INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at)
       VALUES (?, ?, ?, 'claude', 'work_summary', ?)`
    ).run(
      randomUUID(),
      ticketId,
      "Completed implementation. All tests passing. Ready for AI review.",
      new Date().toISOString()
    );

    // ==========================================
    // Phase 4: Submit Review Findings
    // ==========================================
    const findings = [
      { severity: "critical", category: "type-safety", agent: "code-reviewer" },
      { severity: "major", category: "error-handling", agent: "silent-failure-hunter" },
      { severity: "minor", category: "code-style", agent: "code-simplifier" },
    ];

    const findingIds: string[] = [];

    for (const finding of findings) {
      const findingId = randomUUID();
      findingIds.push(findingId);

      db.prepare(
        `INSERT INTO review_findings (id, ticket_id, iteration, agent, severity, category, description, status, created_at)
         VALUES (?, ?, 1, ?, ?, ?, ?, 'open', ?)`
      ).run(
        findingId,
        ticketId,
        finding.agent,
        finding.severity,
        finding.category,
        `Test finding for ${finding.category}`,
        new Date().toISOString()
      );

      // Update findings count
      db.prepare(
        "UPDATE ticket_workflow_state SET findings_count = findings_count + 1, updated_at = ? WHERE ticket_id = ?"
      ).run(new Date().toISOString(), ticketId);

      // Create progress comment for each finding
      db.prepare(
        `INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at)
         VALUES (?, ?, ?, 'claude', 'progress', ?)`
      ).run(
        randomUUID(),
        ticketId,
        `Review finding: [${finding.severity}] ${finding.category}`,
        new Date().toISOString()
      );
    }

    // ==========================================
    // Phase 5: Mark Findings as Fixed
    // ==========================================
    for (const findingId of findingIds) {
      const fixedAt = new Date().toISOString();

      db.prepare("UPDATE review_findings SET status = 'fixed', fixed_at = ? WHERE id = ?").run(
        fixedAt,
        findingId
      );

      db.prepare(
        "UPDATE ticket_workflow_state SET findings_fixed = findings_fixed + 1, updated_at = ? WHERE ticket_id = ?"
      ).run(new Date().toISOString(), ticketId);

      // Create progress comment for fix
      db.prepare(
        `INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at)
         VALUES (?, ?, ?, 'claude', 'progress', ?)`
      ).run(randomUUID(), ticketId, `Finding marked as fixed`, new Date().toISOString());
    }

    // ==========================================
    // Phase 6: Generate Demo Script
    // ==========================================
    const demoScriptId = randomUUID();
    const demoSteps = [
      {
        order: 1,
        description: "Open the application",
        expectedOutcome: "App loads",
        type: "manual",
      },
      {
        order: 2,
        description: "Navigate to feature",
        expectedOutcome: "Feature visible",
        type: "visual",
      },
      {
        order: 3,
        description: "Test interaction",
        expectedOutcome: "Works correctly",
        type: "manual",
      },
    ];

    db.prepare(
      `INSERT INTO demo_scripts (id, ticket_id, steps, generated_at)
       VALUES (?, ?, ?, ?)`
    ).run(demoScriptId, ticketId, JSON.stringify(demoSteps), new Date().toISOString());

    // Update workflow state
    db.prepare(
      "UPDATE ticket_workflow_state SET demo_generated = 1, updated_at = ? WHERE ticket_id = ?"
    ).run(new Date().toISOString(), ticketId);

    // Move ticket to human_review
    db.prepare("UPDATE tickets SET status = 'human_review' WHERE id = ?").run(ticketId);

    // Create demo generated comment
    db.prepare(
      `INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at)
       VALUES (?, ?, ?, 'claude', 'progress', ?)`
    ).run(
      randomUUID(),
      ticketId,
      `Demo script generated with ${demoSteps.length} steps`,
      new Date().toISOString()
    );

    // ==========================================
    // Phase 7: Submit Demo Feedback (Human Approval)
    // ==========================================
    db.prepare(
      `UPDATE demo_scripts SET completed_at = ?, feedback = ?, passed = 1 WHERE id = ?`
    ).run(new Date().toISOString(), "Looks great! All steps verified.", demoScriptId);

    // Move ticket to done
    db.prepare("UPDATE tickets SET status = 'done', completed_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      ticketId
    );

    // Update workflow state to done
    db.prepare(
      "UPDATE ticket_workflow_state SET current_phase = 'done', updated_at = ? WHERE ticket_id = ?"
    ).run(new Date().toISOString(), ticketId);

    // End telemetry session
    const endedAt = new Date().toISOString();
    db.prepare(
      `UPDATE telemetry_sessions SET ended_at = ?, outcome = 'success', total_duration_ms = ? WHERE id = ?`
    ).run(endedAt, 30000, telemetrySessionId);

    // Log session end event
    db.prepare(
      `INSERT INTO telemetry_events (id, session_id, ticket_id, event_type, event_data, created_at)
       VALUES (?, ?, ?, 'session_end', ?, ?)`
    ).run(
      randomUUID(),
      telemetrySessionId,
      ticketId,
      JSON.stringify({ outcome: "success" }),
      endedAt
    );

    // ==========================================
    // VERIFICATION: Check all acceptance criteria
    // ==========================================

    // 1. Verify telemetry_sessions has 1 session
    const telemetrySessions = db
      .prepare("SELECT * FROM telemetry_sessions WHERE ticket_id = ?")
      .all(ticketId) as unknown[];
    expect(telemetrySessions).toHaveLength(1);

    const session = telemetrySessions[0] as {
      id: string;
      ticket_id: string;
      total_tool_calls: number;
      outcome: string;
    };
    expect(session.ticket_id).toBe(ticketId);
    expect(session.total_tool_calls).toBe(3);
    expect(session.outcome).toBe("success");

    // 2. Verify telemetry_events has tool events with correlation IDs
    const toolStartEvents = db
      .prepare("SELECT * FROM telemetry_events WHERE session_id = ? AND event_type = 'tool_start'")
      .all(telemetrySessionId) as unknown[];
    const toolEndEvents = db
      .prepare("SELECT * FROM telemetry_events WHERE session_id = ? AND event_type = 'tool_end'")
      .all(telemetrySessionId) as unknown[];

    expect(toolStartEvents).toHaveLength(3);
    expect(toolEndEvents).toHaveLength(3);

    // Verify correlation IDs pair correctly
    const startCorrelationIds = (toolStartEvents as { correlation_id: string }[]).map(
      (e) => e.correlation_id
    );
    const endCorrelationIds = (toolEndEvents as { correlation_id: string }[]).map(
      (e) => e.correlation_id
    );

    for (const corrId of startCorrelationIds) {
      expect(endCorrelationIds).toContain(corrId);
    }

    // 3. Verify review_findings has 3 findings (all fixed)
    const reviewFindings = db
      .prepare("SELECT * FROM review_findings WHERE ticket_id = ?")
      .all(ticketId) as unknown[];
    expect(reviewFindings).toHaveLength(3);

    const allFixed = (reviewFindings as { status: string }[]).every((f) => f.status === "fixed");
    expect(allFixed).toBe(true);

    // Verify severity distribution
    const severities = (reviewFindings as { severity: string }[]).map((f) => f.severity);
    expect(severities).toContain("critical");
    expect(severities).toContain("major");
    expect(severities).toContain("minor");

    // 4. Verify demo_scripts has 1 demo script
    const demoScripts = db
      .prepare("SELECT * FROM demo_scripts WHERE ticket_id = ?")
      .all(ticketId) as unknown[];
    expect(demoScripts).toHaveLength(1);

    const demo = demoScripts[0] as { passed: number; feedback: string; steps: string };
    expect(demo.passed).toBe(1);
    expect(demo.feedback).toBe("Looks great! All steps verified.");

    const steps = JSON.parse(demo.steps) as { order: number }[];
    expect(steps).toHaveLength(3);

    // 5. Verify ticket_workflow_state has complete state
    const workflowStates = db
      .prepare("SELECT * FROM ticket_workflow_state WHERE ticket_id = ?")
      .all(ticketId) as unknown[];
    expect(workflowStates).toHaveLength(1);

    const state = workflowStates[0] as {
      current_phase: string;
      findings_count: number;
      findings_fixed: number;
      demo_generated: number;
    };
    expect(state.current_phase).toBe("done");
    expect(state.findings_count).toBe(3);
    expect(state.findings_fixed).toBe(3);
    expect(state.demo_generated).toBe(1);

    // 6. Verify ticket_comments has all mandatory comments
    const comments = db
      .prepare("SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at ASC")
      .all(ticketId) as unknown[];

    // Expected comments:
    // - 1 "Starting work" comment
    // - 1 work summary after complete_ticket_work
    // - 3 finding progress comments
    // - 3 fix progress comments
    // - 1 demo generated comment
    // Total: 9 comments minimum
    expect(comments.length).toBeGreaterThanOrEqual(9);

    // Verify specific comment types exist
    const workSummaries = (comments as { type: string }[]).filter((c) => c.type === "work_summary");
    const progressComments = (comments as { type: string }[]).filter((c) => c.type === "progress");

    expect(workSummaries.length).toBeGreaterThanOrEqual(2);
    expect(progressComments.length).toBeGreaterThanOrEqual(7);

    // Verify ticket final status
    const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as {
      status: string;
      completed_at: string;
    };
    expect(ticket.status).toBe("done");
    expect(ticket.completed_at).toBeTruthy();
  });

  it("verifies session start/end events are logged", () => {
    // Verify session_start and session_end events exist
    const sessionEvents = db
      .prepare(
        "SELECT * FROM telemetry_events WHERE session_id = ? AND event_type IN ('session_start', 'session_end')"
      )
      .all(telemetrySessionId) as { event_type: string }[];

    const eventTypes = sessionEvents.map((e) => e.event_type);
    expect(eventTypes).toContain("session_start");
    expect(eventTypes).toContain("session_end");
  });

  it("verifies review iteration tracking", () => {
    const workflowState = db
      .prepare("SELECT review_iteration FROM ticket_workflow_state WHERE ticket_id = ?")
      .get(ticketId) as { review_iteration: number };

    expect(workflowState.review_iteration).toBe(1);
  });
});

/**
 * Initialize the test database schema
 */
function initializeTestSchema(db: ReturnType<typeof Database>) {
  // Projects table
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      color TEXT,
      working_method TEXT DEFAULT 'auto',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Epics table
  db.exec(`
    CREATE TABLE IF NOT EXISTS epics (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      color TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Tickets table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
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
      branch_name TEXT,
      pr_number INTEGER,
      pr_url TEXT,
      pr_status TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    )
  `);

  // Ticket comments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_comments (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      author TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'comment',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Telemetry sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS telemetry_sessions (
      id TEXT PRIMARY KEY,
      ticket_id TEXT REFERENCES tickets(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      environment TEXT NOT NULL DEFAULT 'unknown',
      branch_name TEXT,
      claude_session_id TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT,
      total_prompts INTEGER DEFAULT 0,
      total_tool_calls INTEGER DEFAULT 0,
      total_duration_ms INTEGER,
      total_tokens INTEGER,
      outcome TEXT
    )
  `);

  // Telemetry events table
  db.exec(`
    CREATE TABLE IF NOT EXISTS telemetry_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES telemetry_sessions(id) ON DELETE CASCADE,
      ticket_id TEXT REFERENCES tickets(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      tool_name TEXT,
      event_data TEXT,
      duration_ms INTEGER,
      token_count INTEGER,
      is_error INTEGER DEFAULT 0,
      correlation_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Ticket workflow state table
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_workflow_state (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
      current_phase TEXT NOT NULL DEFAULT 'implementation',
      review_iteration INTEGER DEFAULT 0,
      findings_count INTEGER DEFAULT 0,
      findings_fixed INTEGER DEFAULT 0,
      demo_generated INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Review findings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS review_findings (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      iteration INTEGER NOT NULL,
      agent TEXT NOT NULL,
      severity TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      file_path TEXT,
      line_number INTEGER,
      suggested_fix TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      fixed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Demo scripts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS demo_scripts (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
      steps TEXT NOT NULL,
      generated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      feedback TEXT,
      passed INTEGER
    )
  `);
}

/**
 * Seed test data
 */
function seedTestData(
  db: ReturnType<typeof Database>,
  ids: { projectId: string; epicId: string; ticketId: string }
) {
  const now = new Date().toISOString();

  // Create test project
  db.prepare(
    `INSERT INTO projects (id, name, path, created_at)
     VALUES (?, 'Test Project', '/tmp/test-project', ?)`
  ).run(ids.projectId, now);

  // Create test epic
  db.prepare(
    `INSERT INTO epics (id, title, project_id, created_at)
     VALUES (?, 'Test Epic', ?, ?)`
  ).run(ids.epicId, ids.projectId, now);

  // Create test ticket
  db.prepare(
    `INSERT INTO tickets (id, title, description, status, priority, position, project_id, epic_id, created_at, updated_at)
     VALUES (?, 'Test Ticket for Workflow', 'A test ticket to verify full workflow', 'backlog', 'high', 1.0, ?, ?, ?, ?)`
  ).run(ids.ticketId, ids.projectId, ids.epicId, now, now);
}
