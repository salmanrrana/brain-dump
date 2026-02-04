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
  updateDemoStep,
  submitFeedback,
} from "../review.ts";
import {
  TicketNotFoundError,
  FindingNotFoundError,
  InvalidStateError,
  ValidationError,
} from "../errors.ts";

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
    expect(result.canProceedToHumanReview).toBe(true);
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
  it("creates a demo script and transitions ticket to human_review", () => {
    seedProject();
    seedAiReviewTicket();

    const demo = generateDemo(db, {
      ticketId: "ticket-1",
      steps: [
        { order: 1, description: "Open the app", expectedOutcome: "App loads", type: "manual" },
        { order: 2, description: "Click button", expectedOutcome: "Action occurs", type: "visual" },
      ],
    });

    expect(demo.id).toBeTruthy();
    expect(demo.ticketId).toBe("ticket-1");
    expect(demo.steps.length).toBe(2);
    expect(demo.steps[0]!.description).toBe("Open the app");

    // Verify ticket status changed
    const ticket = db.prepare("SELECT status FROM tickets WHERE id = ?").get("ticket-1") as {
      status: string;
    };
    expect(ticket.status).toBe("human_review");
  });

  it("throws InvalidStateError when ticket is not in ai_review", () => {
    seedProject();
    seedTicket("ticket-1", "proj-1", "in_progress");

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [{ order: 1, description: "Test", expectedOutcome: "Pass", type: "manual" }],
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
        steps: [{ order: 1, description: "Test", expectedOutcome: "Pass", type: "manual" }],
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
      steps: [{ order: 1, description: "Test", expectedOutcome: "Pass", type: "manual" }],
    });

    expect(demo.id).toBeTruthy();
  });

  it("throws TicketNotFoundError for nonexistent ticket", () => {
    expect(() =>
      generateDemo(db, {
        ticketId: "nonexistent",
        steps: [{ order: 1, description: "Test", expectedOutcome: "Pass", type: "manual" }],
      })
    ).toThrow(TicketNotFoundError);
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
      steps: [{ order: 1, description: "Test", expectedOutcome: "Pass", type: "manual" }],
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
        { order: 1, description: "Step 1", expectedOutcome: "OK", type: "manual" },
        { order: 2, description: "Step 2", expectedOutcome: "OK", type: "visual" },
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
      steps: [{ order: 1, description: "Step 1", expectedOutcome: "OK", type: "manual" }],
    });

    expect(() => updateDemoStep(db, demo.id, 99, "passed")).toThrow(ValidationError);
  });
});

// ============================================
// submitFeedback
// ============================================

describe("submitFeedback", () => {
  it("transitions ticket to done when passed", () => {
    seedProject();
    seedAiReviewTicket();

    // Generate demo (transitions to human_review)
    generateDemo(db, {
      ticketId: "ticket-1",
      steps: [{ order: 1, description: "Test", expectedOutcome: "Pass", type: "manual" }],
    });

    const result = submitFeedback(db, {
      ticketId: "ticket-1",
      passed: true,
      feedback: "Everything works!",
    });

    expect(result.passed).toBe(true);
    expect(result.newStatus).toBe("done");

    // Verify ticket status
    const ticket = db
      .prepare("SELECT status, completed_at FROM tickets WHERE id = ?")
      .get("ticket-1") as { status: string; completed_at: string | null };
    expect(ticket.status).toBe("done");
    expect(ticket.completed_at).toBeTruthy();
  });

  it("keeps ticket in human_review when rejected", () => {
    seedProject();
    seedAiReviewTicket();

    generateDemo(db, {
      ticketId: "ticket-1",
      steps: [{ order: 1, description: "Test", expectedOutcome: "Pass", type: "manual" }],
    });

    const result = submitFeedback(db, {
      ticketId: "ticket-1",
      passed: false,
      feedback: "Button doesn't work",
    });

    expect(result.passed).toBe(false);
    expect(result.newStatus).toBe("human_review");

    // Verify demo_generated was reset
    const state = db
      .prepare("SELECT demo_generated FROM ticket_workflow_state WHERE ticket_id = ?")
      .get("ticket-1") as { demo_generated: number };
    expect(state.demo_generated).toBe(0);
  });

  it("applies step results when provided", () => {
    seedProject();
    seedAiReviewTicket();

    generateDemo(db, {
      ticketId: "ticket-1",
      steps: [
        { order: 1, description: "Step 1", expectedOutcome: "OK", type: "manual" },
        { order: 2, description: "Step 2", expectedOutcome: "OK", type: "visual" },
      ],
    });

    submitFeedback(db, {
      ticketId: "ticket-1",
      passed: true,
      feedback: "All good",
      stepResults: [
        { order: 1, passed: true },
        { order: 2, passed: true, notes: "Verified visually" },
      ],
    });

    const demo = getDemo(db, "ticket-1");
    expect(demo!.steps[0]!.status).toBe("passed");
    expect(demo!.steps[1]!.status).toBe("passed");
    expect(demo!.steps[1]!.notes).toBe("Verified visually");
  });

  it("throws InvalidStateError when ticket is not in human_review", () => {
    seedProject();
    seedAiReviewTicket();

    expect(() =>
      submitFeedback(db, {
        ticketId: "ticket-1",
        passed: true,
        feedback: "Test",
      })
    ).toThrow(InvalidStateError);
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
