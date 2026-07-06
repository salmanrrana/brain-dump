import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import {
  submitFinding,
  markFixed,
  getFindings,
  checkComplete,
  generateDemo,
  getDemo,
  repairLegacyHumanReviewHandoff,
  updateDemoStep,
  submitFeedback,
} from "../review.ts";
import { createEpicReviewRun, getEpicReviewRun } from "../epic-review-run.ts";
import {
  TicketNotFoundError,
  FindingNotFoundError,
  InvalidStateError,
  ValidationError,
} from "../errors.ts";
import type { DemoStep } from "../types.ts";

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

function seedTicket(id = "ticket-1", projectId = "proj-1", status = "backlog") {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tickets (id, title, status, priority, position, project_id, created_at, updated_at)
     VALUES (?, ?, ?, 'medium', 1, ?, ?, ?)`
  ).run(id, `Ticket ${id}`, status, projectId, now, now);
  return id;
}

function seedAiReviewTicket(id = "ticket-1", projectId = "proj-1") {
  return seedTicket(id, projectId, "ai_review");
}

function seedHumanReviewTicket(id = "ticket-1", projectId = "proj-1") {
  return seedTicket(id, projectId, "human_review");
}

function automatedStep(order = 1): DemoStep {
  return {
    order,
    description: "Check the status API",
    expectedOutcome: "The status endpoint returns OK",
    type: "automated",
    automation: {
      kind: "api",
      request: { method: "GET", path: "/api/status" },
      assert: [{ type: "status", expected: 200 }],
    },
  };
}

beforeEach(() => {
  const result = createTestDatabase();
  db = result.db;
});

// ============================================
// submitFinding
// ============================================

describe("submitFinding", () => {
  it("creates a finding with correct fields", () => {
    seedProject();
    seedAiReviewTicket();

    const finding = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "type-safety",
      description: "Missing null check",
    });

    expect(finding.id).toBeTruthy();
    expect(finding.ticketId).toBe("ticket-1");
    expect(finding.agent).toBe("code-reviewer");
    expect(finding.severity).toBe("major");
    expect(finding.category).toBe("type-safety");
    expect(finding.description).toBe("Missing null check");
    expect(finding.status).toBe("open");
    expect(finding.iteration).toBe(1);
  });

  it("includes optional filePath, lineNumber, suggestedFix when provided", () => {
    seedProject();
    seedAiReviewTicket();

    const finding = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "silent-failure-hunter",
      severity: "critical",
      category: "error-handling",
      description: "Swallowed error in catch",
      filePath: "src/api/user.ts",
      lineNumber: 42,
      suggestedFix: "Re-throw the error",
    });

    expect(finding.filePath).toBe("src/api/user.ts");
    expect(finding.lineNumber).toBe(42);
    expect(finding.suggestedFix).toBe("Re-throw the error");
  });

  it("auto-creates workflow state on first finding", () => {
    seedProject();
    seedAiReviewTicket();

    submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "minor",
      category: "style",
      description: "Inconsistent naming",
    });

    const state = db
      .prepare("SELECT * FROM ticket_workflow_state WHERE ticket_id = ?")
      .get("ticket-1") as { review_iteration: number; findings_count: number } | undefined;

    expect(state).toBeTruthy();
    expect(state!.review_iteration).toBe(1);
    expect(state!.findings_count).toBe(1);
  });

  it("increments findings_count on each submission", () => {
    seedProject();
    seedAiReviewTicket();

    submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "minor",
      category: "style",
      description: "First finding",
    });
    submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "type-safety",
      description: "Second finding",
    });

    const state = db
      .prepare("SELECT findings_count FROM ticket_workflow_state WHERE ticket_id = ?")
      .get("ticket-1") as { findings_count: number };

    expect(state.findings_count).toBe(2);
  });

  it("throws TicketNotFoundError for nonexistent ticket", () => {
    expect(() =>
      submitFinding(db, {
        ticketId: "nonexistent",
        agent: "code-reviewer",
        severity: "minor",
        category: "style",
        description: "Test",
      })
    ).toThrow(TicketNotFoundError);
  });

  it("throws InvalidStateError when ticket is not in ai_review", () => {
    seedProject();
    seedTicket("ticket-1", "proj-1", "in_progress");

    expect(() =>
      submitFinding(db, {
        ticketId: "ticket-1",
        agent: "code-reviewer",
        severity: "minor",
        category: "style",
        description: "Test",
      })
    ).toThrow(InvalidStateError);
  });

  it("links new findings to the active epic review run for the ticket", () => {
    seedProject();
    db.prepare("INSERT INTO epics (id, title, project_id, created_at) VALUES (?, ?, ?, ?)").run(
      "epic-1",
      "Epic 1",
      "proj-1",
      new Date().toISOString()
    );
    seedAiReviewTicket("ticket-1", "proj-1");
    db.prepare("UPDATE tickets SET epic_id = ? WHERE id = ?").run("epic-1", "ticket-1");

    const run = createEpicReviewRun(db, {
      epicId: "epic-1",
      selectedTicketIds: ["ticket-1"],
      launchMode: "focused-review",
      status: "running",
    });

    const finding = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "logic",
      description: "Finding linked to focused review",
    });

    expect(finding.epicReviewRunId).toBe(run.id);
  });
});

// ============================================
// markFixed
// ============================================

describe("markFixed", () => {
  it("marks a finding as fixed", () => {
    seedProject();
    seedAiReviewTicket();

    const finding = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "type-safety",
      description: "Missing null check",
    });

    const updated = markFixed(db, finding.id, "fixed");

    expect(updated.status).toBe("fixed");
  });

  it("marks a finding as wont_fix", () => {
    seedProject();
    seedAiReviewTicket();

    const finding = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "minor",
      category: "style",
      description: "Minor style issue",
    });

    const updated = markFixed(db, finding.id, "wont_fix");
    expect(updated.status).toBe("wont_fix");
  });

  it("increments findings_fixed when status is fixed", () => {
    seedProject();
    seedAiReviewTicket();

    const f1 = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "type-safety",
      description: "Issue 1",
    });
    submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "minor",
      category: "style",
      description: "Issue 2",
    });

    markFixed(db, f1.id, "fixed");

    const state = db
      .prepare("SELECT findings_fixed FROM ticket_workflow_state WHERE ticket_id = ?")
      .get("ticket-1") as { findings_fixed: number };

    expect(state.findings_fixed).toBe(1);
  });

  it("does not increment findings_fixed for wont_fix or duplicate", () => {
    seedProject();
    seedAiReviewTicket();

    const f1 = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "minor",
      category: "style",
      description: "Issue 1",
    });

    markFixed(db, f1.id, "wont_fix");

    const state = db
      .prepare("SELECT findings_fixed FROM ticket_workflow_state WHERE ticket_id = ?")
      .get("ticket-1") as { findings_fixed: number };

    expect(state.findings_fixed).toBe(0);
  });

  it("throws FindingNotFoundError for nonexistent finding", () => {
    expect(() => markFixed(db, "nonexistent", "fixed")).toThrow(FindingNotFoundError);
  });
});

// ============================================
// getFindings
// ============================================

describe("getFindings", () => {
  it("returns all findings for a ticket", () => {
    seedProject();
    seedAiReviewTicket();

    submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "type-safety",
      description: "Issue 1",
    });
    submitFinding(db, {
      ticketId: "ticket-1",
      agent: "silent-failure-hunter",
      severity: "minor",
      category: "error-handling",
      description: "Issue 2",
    });

    const findings = getFindings(db, "ticket-1");
    expect(findings.length).toBe(2);
  });

  it("filters by status", () => {
    seedProject();
    seedAiReviewTicket();

    const f1 = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "type-safety",
      description: "Will be fixed",
    });
    submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "minor",
      category: "style",
      description: "Stays open",
    });

    markFixed(db, f1.id, "fixed");

    const openFindings = getFindings(db, "ticket-1", { status: "open" });
    expect(openFindings.length).toBe(1);
    expect(openFindings[0]!.description).toBe("Stays open");

    const fixedFindings = getFindings(db, "ticket-1", { status: "fixed" });
    expect(fixedFindings.length).toBe(1);
    expect(fixedFindings[0]!.description).toBe("Will be fixed");
  });

  it("filters by severity", () => {
    seedProject();
    seedAiReviewTicket();

    submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "critical",
      category: "security",
      description: "Critical issue",
    });
    submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "minor",
      category: "style",
      description: "Minor issue",
    });

    const criticals = getFindings(db, "ticket-1", { severity: "critical" });
    expect(criticals.length).toBe(1);
    expect(criticals[0]!.severity).toBe("critical");
  });

  it("filters by agent", () => {
    seedProject();
    seedAiReviewTicket();

    submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "minor",
      category: "style",
      description: "From code-reviewer",
    });
    submitFinding(db, {
      ticketId: "ticket-1",
      agent: "silent-failure-hunter",
      severity: "major",
      category: "error-handling",
      description: "From silent-failure-hunter",
    });

    const sfhFindings = getFindings(db, "ticket-1", { agent: "silent-failure-hunter" });
    expect(sfhFindings.length).toBe(1);
    expect(sfhFindings[0]!.agent).toBe("silent-failure-hunter");
  });

  it("returns empty array when ticket has no findings", () => {
    seedProject();
    seedAiReviewTicket();

    const findings = getFindings(db, "ticket-1");
    expect(findings).toEqual([]);
  });

  it("throws TicketNotFoundError for nonexistent ticket", () => {
    expect(() => getFindings(db, "nonexistent")).toThrow(TicketNotFoundError);
  });
});

// ============================================
// checkComplete
// ============================================

describe("checkComplete", () => {
  it("returns complete when no findings exist", () => {
    seedProject();
    seedAiReviewTicket();

    const result = checkComplete(db, "ticket-1");
    expect(result.complete).toBe(true);
    expect(result.canProceedToVerification).toBe(true);
    expect(result.totalFindings).toBe(0);
  });

  it("returns incomplete when critical findings are open", () => {
    seedProject();
    seedAiReviewTicket();

    submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "critical",
      category: "security",
      description: "Critical issue",
    });

    const result = checkComplete(db, "ticket-1");
    expect(result.complete).toBe(false);
    expect(result.openCritical).toBe(1);
  });

  it("returns complete after all critical/major findings are fixed", () => {
    seedProject();
    seedAiReviewTicket();

    const critical = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "critical",
      category: "security",
      description: "Critical issue",
    });
    submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "minor",
      category: "style",
      description: "Minor issue stays open",
    });

    markFixed(db, critical.id, "fixed");

    const result = checkComplete(db, "ticket-1");
    expect(result.complete).toBe(true);
    expect(result.openMinor).toBe(1);
    expect(result.fixedFindings).toBe(1);
  });

  it("throws TicketNotFoundError for nonexistent ticket", () => {
    expect(() => checkComplete(db, "nonexistent")).toThrow(TicketNotFoundError);
  });
});

// ============================================
// generateDemo
// ============================================

describe("generateDemo", () => {
  it("creates a demo script and transitions ticket to ai_verification", () => {
    seedProject();
    seedAiReviewTicket();

    const demo = generateDemo(db, {
      ticketId: "ticket-1",
      steps: [
        {
          order: 1,
          description: "Check the status API",
          expectedOutcome: "The status endpoint returns OK",
          type: "automated",
          automation: {
            kind: "api",
            request: { method: "GET", path: "/api/status" },
            assert: [{ type: "status", expected: 200 }],
          },
        },
      ],
    });

    expect(demo.id).toBeTruthy();
    expect(demo.ticketId).toBe("ticket-1");
    expect(demo.steps.length).toBe(1);
    expect(demo.steps[0]!.description).toBe("Check the status API");

    // Verify ticket status changed
    const ticket = db.prepare("SELECT status FROM tickets WHERE id = ?").get("ticket-1") as {
      status: string;
    };
    expect(ticket.status).toBe("ai_verification");
    expect(demo.steps[0]!.automation).toMatchObject({ kind: "api" });
  });

  it("accepts and persists UI automation specs for visual steps", () => {
    seedProject();
    seedAiReviewTicket();

    const demo = generateDemo(db, {
      ticketId: "ticket-1",
      steps: [
        {
          order: 1,
          description: "Open the ticket detail page",
          expectedOutcome: "The ticket title is visible",
          type: "visual",
          automation: {
            kind: "ui",
            route: "/tickets/ticket-1",
            actions: [{ act: "waitFor", selector: "h1" }],
            assert: [{ type: "text", selector: "h1", expected: "Ticket ticket-1" }],
            screenshot: true,
          },
        },
      ],
    });

    expect(demo.steps[0]!.automation).toMatchObject({ kind: "ui", screenshot: true });
    const row = db
      .prepare("SELECT steps FROM demo_scripts WHERE ticket_id = ?")
      .get("ticket-1") as {
      steps: string;
    };
    expect(JSON.parse(row.steps)[0].automation.kind).toBe("ui");
  });

  it("rejects automated steps without automation", () => {
    seedProject();
    seedAiReviewTicket();

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [
          { order: 1, description: "Call API", expectedOutcome: "API succeeds", type: "automated" },
        ],
      })
    ).toThrow(/requires automation/);
  });

  it("rejects manual steps even when automation is present", () => {
    seedProject();
    seedAiReviewTicket();

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [
          {
            order: 1,
            description: "Manual smoke test",
            expectedOutcome: "Manual result is recorded",
            type: "manual",
            automation: {
              kind: "api",
              request: { method: "GET", path: "/api/status" },
              assert: [{ type: "status", expected: 200 }],
            },
          },
        ],
      })
    ).toThrow(/manual.*must be visual or automated/);
  });

  it("rejects manual-only demo scripts because manual steps cannot enter verification", () => {
    seedProject();
    seedAiReviewTicket();

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [
          { order: 1, description: "Manual smoke", expectedOutcome: "Looks good", type: "manual" },
        ],
      })
    ).toThrow(/manual.*must be visual or automated/);
  });

  it("rejects UI text and URL assertions without expected values", () => {
    seedProject();
    seedAiReviewTicket();

    const steps = [
      {
        order: 1,
        description: "Open the app",
        expectedOutcome: "The app URL is correct",
        type: "visual",
        automation: {
          kind: "ui",
          route: "/",
          assert: [{ type: "url" }],
          screenshot: true,
        },
      },
    ] as unknown as DemoStep[];

    expect(() => generateDemo(db, { ticketId: "ticket-1", steps })).toThrow(
      /url assertion at index 0 requires a non-empty expected value/
    );
  });

  it("rejects UI automation routes outside the local app", () => {
    seedProject();
    seedAiReviewTicket();

    const steps = [
      {
        order: 1,
        description: "Open an external page",
        expectedOutcome: "External page is visible",
        type: "visual",
        automation: {
          kind: "ui",
          route: "https://example.com/tickets/ticket-1",
          assert: [{ type: "visible", selector: "body" }],
          screenshot: true,
        },
      },
    ] as unknown as DemoStep[];

    expect(() => generateDemo(db, { ticketId: "ticket-1", steps })).toThrow(
      /UI automation route must be an app-relative path/
    );
  });

  it("rejects API automation paths outside the local app", () => {
    seedProject();
    seedAiReviewTicket();

    const steps = [
      {
        order: 1,
        description: "Call an external API",
        expectedOutcome: "External API responds",
        type: "automated",
        automation: {
          kind: "api",
          request: { method: "GET", path: "//example.com/api/status" },
          assert: [{ type: "status", expected: 200 }],
        },
      },
    ] as unknown as DemoStep[];

    expect(() => generateDemo(db, { ticketId: "ticket-1", steps })).toThrow(
      /API automation request path must be an app-relative path/
    );
  });

  it("rejects non-finite demo step order values", () => {
    seedProject();
    seedAiReviewTicket();

    const steps = [
      {
        ...automatedStep(),
        order: Number.POSITIVE_INFINITY,
      },
    ] as unknown as DemoStep[];

    expect(() => generateDemo(db, { ticketId: "ticket-1", steps })).toThrow(
      /Demo step at index 0 is invalid/
    );
  });

  it("rejects malformed automation specs with a helpful error", () => {
    seedProject();
    seedAiReviewTicket();

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [
          {
            order: 1,
            description: "Open the app",
            expectedOutcome: "App loads",
            type: "visual",
            automation: {
              kind: "ui",
              route: "/",
              assert: [],
              screenshot: true,
            },
          },
        ],
      })
    ).toThrow(/UI automation assert must contain at least one assertion/);
  });

  it("rejects API automation assertions without a defined expected value", () => {
    seedProject();
    seedAiReviewTicket();

    const steps = [
      {
        order: 1,
        description: "Check the status API",
        expectedOutcome: "The status endpoint returns OK",
        type: "automated",
        automation: {
          kind: "api",
          request: { method: "GET", path: "/api/status" },
          assert: [{ type: "status", expected: undefined }],
        },
      },
    ] as unknown as DemoStep[];

    expect(() => generateDemo(db, { ticketId: "ticket-1", steps })).toThrow(
      /API automation assertion at index 0 is invalid/
    );
  });

  it("rejects API automation values that cannot be stored as JSON", () => {
    seedProject();
    seedAiReviewTicket();

    const steps = [
      {
        order: 1,
        description: "Check the status API",
        expectedOutcome: "The status endpoint returns OK",
        type: "automated",
        automation: {
          kind: "api",
          request: { method: "POST", path: "/api/status", body: { value: Number.NaN } },
          assert: [{ type: "jsonPath", expected: { ok: true } }],
        },
      },
    ] as unknown as DemoStep[];

    expect(() => generateDemo(db, { ticketId: "ticket-1", steps })).toThrow(
      /API automation request body.value must be a finite JSON number/
    );
  });

  it("rejects non-plain API automation objects that would serialize differently", () => {
    seedProject();
    seedAiReviewTicket();

    const steps = [
      {
        order: 1,
        description: "Check the status API",
        expectedOutcome: "The status endpoint returns OK",
        type: "automated",
        automation: {
          kind: "api",
          request: { method: "POST", path: "/api/status", body: { value: new Date() } },
          assert: [{ type: "jsonPath", expected: { ok: true } }],
        },
      },
    ] as unknown as DemoStep[];

    expect(() => generateDemo(db, { ticketId: "ticket-1", steps })).toThrow(
      /API automation request body.value must be a plain JSON object/
    );
  });

  it("completes active Ralph sessions when handing the ticket to ai_verification", () => {
    seedProject();
    seedAiReviewTicket();
    const startedAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO ralph_sessions (id, ticket_id, project_id, current_state, state_history, started_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      "session-1",
      "ticket-1",
      "proj-1",
      "testing",
      JSON.stringify([{ state: "testing", timestamp: startedAt }]),
      startedAt
    );

    generateDemo(db, {
      ticketId: "ticket-1",
      steps: [automatedStep()],
    });

    const session = db.prepare("SELECT * FROM ralph_sessions WHERE id = ?").get("session-1") as {
      current_state: string;
      outcome: string | null;
      completed_at: string | null;
      state_history: string;
    };
    const events = db
      .prepare("SELECT * FROM ralph_events WHERE session_id = ? AND type = 'state_change'")
      .all("session-1");

    expect(session.current_state).toBe("done");
    expect(session.outcome).toBe("success");
    expect(session.completed_at).toBeTruthy();
    expect(JSON.parse(session.state_history).at(-1)).toMatchObject({ state: "done" });
    expect(events.length).toBeGreaterThan(0);
  });

  it("throws InvalidStateError when ticket is not in ai_review", () => {
    seedProject();
    seedTicket("ticket-1", "proj-1", "in_progress");

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [automatedStep()],
      })
    ).toThrow(InvalidStateError);
  });

  it("throws ValidationError when critical findings are still open", () => {
    seedProject();
    seedAiReviewTicket();

    submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "critical",
      category: "security",
      description: "Unresolved critical",
    });

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [automatedStep()],
      })
    ).toThrow(ValidationError);
  });

  it("succeeds when only minor findings remain open", () => {
    seedProject();
    seedAiReviewTicket();

    submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "minor",
      category: "style",
      description: "Minor issue",
    });

    const demo = generateDemo(db, {
      ticketId: "ticket-1",
      steps: [automatedStep()],
    });

    expect(demo.id).toBeTruthy();
  });

  it("refreshes an existing demo script for the same ticket instead of inserting a duplicate", () => {
    seedProject();
    seedAiReviewTicket();

    const originalGeneratedAt = "2026-03-07T12:00:00.000Z";
    db.prepare(
      `INSERT INTO demo_scripts (id, ticket_id, steps, generated_at, completed_at, feedback, passed)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "demo-1",
      "ticket-1",
      JSON.stringify([
        { order: 1, description: "Old step", expectedOutcome: "Old", type: "manual" },
      ]),
      originalGeneratedAt,
      "2026-03-07T12:05:00.000Z",
      "Old feedback",
      0
    );

    const demo = generateDemo(db, {
      ticketId: "ticket-1",
      steps: [
        automatedStep(1),
        {
          order: 2,
          description: "Confirm refresh",
          expectedOutcome: "Two steps exist",
          type: "automated",
          automation: {
            kind: "api",
            request: { method: "GET", path: "/api/demo" },
            assert: [{ type: "status", expected: 200 }],
          },
        },
      ],
    });

    expect(demo.id).toBe("demo-1");
    expect(demo.steps).toHaveLength(2);
    expect(demo.steps[0]!.description).toBe("Check the status API");
    expect(demo.generatedAt).not.toBe(originalGeneratedAt);
    expect(demo.executedAt).toBeNull();
    expect(demo.feedback).toBeNull();
    expect(demo.passed).toBeNull();

    const count = db
      .prepare("SELECT COUNT(*) AS count FROM demo_scripts WHERE ticket_id = ?")
      .get("ticket-1") as { count: number };
    expect(count.count).toBe(1);
  });

  it("throws TicketNotFoundError for nonexistent ticket", () => {
    expect(() =>
      generateDemo(db, {
        ticketId: "nonexistent",
        steps: [automatedStep()],
      })
    ).toThrow(TicketNotFoundError);
  });

  it("links the demo to the active epic review run and completes the run summary", () => {
    seedProject();
    db.prepare("INSERT INTO epics (id, title, project_id, created_at) VALUES (?, ?, ?, ?)").run(
      "epic-1",
      "Epic 1",
      "proj-1",
      new Date().toISOString()
    );
    seedAiReviewTicket("ticket-1", "proj-1");
    db.prepare("UPDATE tickets SET epic_id = ? WHERE id = ?").run("epic-1", "ticket-1");

    const run = createEpicReviewRun(db, {
      epicId: "epic-1",
      selectedTicketIds: ["ticket-1"],
      launchMode: "focused-review",
      status: "running",
      startedAt: "2026-03-09T05:00:00.000Z",
    });

    submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "minor",
      category: "ux",
      description: "Minor copy issue",
    });

    const demo = generateDemo(db, {
      ticketId: "ticket-1",
      steps: [automatedStep()],
    });

    expect(demo.epicReviewRunId).toBe(run.id);

    const updatedRun = getEpicReviewRun(db, run.id);
    expect(updatedRun.status).toBe("completed");
    expect(updatedRun.summary).toContain("Focused review completed.");
    expect(updatedRun.completedAt).toBeTruthy();
  });
});

describe("repairLegacyHumanReviewHandoff", () => {
  it("moves legacy human_review tickets with a demo script to ai_verification", () => {
    seedProject();
    seedHumanReviewTicket();
    db.prepare(
      `INSERT INTO demo_scripts (id, ticket_id, steps, generated_at)
       VALUES (?, ?, ?, ?)`
    ).run("demo-1", "ticket-1", JSON.stringify([automatedStep()]), new Date().toISOString());

    const result = repairLegacyHumanReviewHandoff(db, "ticket-1");

    expect(result.newStatus).toBe("ai_verification");
    const ticket = db.prepare("SELECT status FROM tickets WHERE id = ?").get("ticket-1") as {
      status: string;
    };
    expect(ticket.status).toBe("ai_verification");
    const comment = db
      .prepare("SELECT content FROM ticket_comments WHERE ticket_id = ?")
      .get("ticket-1") as { content: string };
    expect(comment.content).toContain("Legacy Workflow Repair");
  });

  it("moves legacy human_review tickets without a demo script back to ai_review", () => {
    seedProject();
    seedHumanReviewTicket();

    const result = repairLegacyHumanReviewHandoff(db, "ticket-1");

    expect(result.newStatus).toBe("ai_review");
    const ticket = db.prepare("SELECT status FROM tickets WHERE id = ?").get("ticket-1") as {
      status: string;
    };
    expect(ticket.status).toBe("ai_review");
  });

  it("moves legacy human_review tickets with invalid demo scripts back to ai_review", () => {
    seedProject();
    seedHumanReviewTicket();
    db.prepare(
      `INSERT INTO demo_scripts (id, ticket_id, steps, generated_at)
       VALUES (?, ?, ?, ?)`
    ).run(
      "demo-1",
      "ticket-1",
      JSON.stringify([
        { order: 1, description: "Manual only", expectedOutcome: "Looks good", type: "manual" },
      ]),
      new Date().toISOString()
    );

    const result = repairLegacyHumanReviewHandoff(db, "ticket-1");

    expect(result.newStatus).toBe("ai_review");
    expect(result.reason).toContain("invalid demo script");
    const ticket = db.prepare("SELECT status FROM tickets WHERE id = ?").get("ticket-1") as {
      status: string;
    };
    expect(ticket.status).toBe("ai_review");
  });

  it("rejects non-legacy statuses", () => {
    seedProject();
    seedAiReviewTicket();

    expect(() => repairLegacyHumanReviewHandoff(db, "ticket-1")).toThrow(InvalidStateError);
  });
});

// ============================================
// getDemo
// ============================================

describe("getDemo", () => {
  it("returns demo script when one exists", () => {
    seedProject();
    seedAiReviewTicket();

    generateDemo(db, {
      ticketId: "ticket-1",
      steps: [automatedStep()],
    });

    const demo = getDemo(db, "ticket-1");
    expect(demo).not.toBeNull();
    expect(demo!.ticketId).toBe("ticket-1");
    expect(demo!.steps.length).toBe(1);
  });

  it("returns null when no demo exists", () => {
    seedProject();
    seedAiReviewTicket();

    const demo = getDemo(db, "ticket-1");
    expect(demo).toBeNull();
  });

  it("loads legacy stored demo scripts without automation", () => {
    seedProject();
    seedAiReviewTicket();
    db.prepare(
      `INSERT INTO demo_scripts (id, ticket_id, steps, generated_at)
       VALUES (?, ?, ?, ?)`
    ).run(
      "demo-1",
      "ticket-1",
      JSON.stringify([
        {
          order: 1,
          description: "Legacy visual step",
          expectedOutcome: "A human can still inspect it",
          type: "visual",
        },
      ]),
      "2026-03-07T12:00:00.000Z"
    );

    const demo = getDemo(db, "ticket-1");

    expect(demo!.steps[0]).toMatchObject({ description: "Legacy visual step", type: "visual" });
  });

  it("throws TicketNotFoundError for nonexistent ticket", () => {
    expect(() => getDemo(db, "nonexistent")).toThrow(TicketNotFoundError);
  });
});

// ============================================
// updateDemoStep
// ============================================

describe("updateDemoStep", () => {
  it("updates a step status and notes", () => {
    seedProject();
    seedAiReviewTicket();

    const demo = generateDemo(db, {
      ticketId: "ticket-1",
      steps: [
        automatedStep(1),
        {
          order: 2,
          description: "Step 2",
          expectedOutcome: "OK",
          type: "visual",
          automation: {
            kind: "ui",
            route: "/",
            assert: [{ type: "visible", selector: "main" }],
            screenshot: true,
          },
        },
      ],
    });

    const updated = updateDemoStep(db, demo.id, 1, "passed", "Looks good");
    const step1 = updated.steps.find((s) => s.order === 1);

    expect(step1!.status).toBe("passed");
    expect(step1!.notes).toBe("Looks good");
  });

  it("throws ValidationError for nonexistent demo script", () => {
    expect(() => updateDemoStep(db, "nonexistent", 1, "passed")).toThrow(ValidationError);
  });

  it("throws ValidationError for nonexistent step order", () => {
    seedProject();
    seedAiReviewTicket();

    const demo = generateDemo(db, {
      ticketId: "ticket-1",
      steps: [automatedStep()],
    });

    expect(() => updateDemoStep(db, demo.id, 99, "passed")).toThrow(ValidationError);
  });
});

// ============================================
// submitFeedback (retired)
// ============================================

describe("submitFeedback", () => {
  it("throws ValidationError because manual demo feedback is retired", () => {
    seedProject();
    seedAiReviewTicket();

    generateDemo(db, {
      ticketId: "ticket-1",
      steps: [automatedStep()],
    });

    expect(() =>
      submitFeedback(db, {
        ticketId: "ticket-1",
        passed: true,
        feedback: "Test",
      })
    ).toThrow(ValidationError);
  });

  it("throws ValidationError when no demo script exists", () => {
    seedProject();
    seedHumanReviewTicket();

    expect(() =>
      submitFeedback(db, {
        ticketId: "ticket-1",
        passed: true,
        feedback: "Test",
      })
    ).toThrow(ValidationError);
  });

  it("throws TicketNotFoundError for nonexistent ticket", () => {
    expect(() =>
      submitFeedback(db, {
        ticketId: "nonexistent",
        passed: true,
        feedback: "Test",
      })
    ).toThrow(TicketNotFoundError);
  });
});
