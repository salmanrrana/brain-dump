import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createTestDatabase } from "../db.ts";
import {
  submitFinding,
  markFixed,
  getFindings,
  checkComplete,
  getReviewContext,
  generateDemo,
  getDemo,
  repairLegacyHumanReviewHandoff,
  updateDemoStep,
  submitFeedback,
} from "../review.ts";
import { createEpicReviewRun, getEpicReviewRun } from "../epic-review-run.ts";
import { getVerificationJob } from "../verification/queue.ts";
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
    process.cwd(),
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

function setTicketDescription(id: string, description: string): void {
  db.prepare("UPDATE tickets SET description = ? WHERE id = ?").run(description, id);
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

  it("attributes finding audit comments to the fresh-eyes reviewer model", () => {
    seedProject();
    seedAiReviewTicket();

    submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "type-safety",
      description: "Missing null check",
      commentIdentity: {
        env: {
          BRAIN_DUMP_LAUNCH_MODEL_PROVIDER: "openai",
          BRAIN_DUMP_LAUNCH_MODEL: "gpt-5.6",
          BRAIN_DUMP_REVIEWER_AUTHOR: "claude",
          BRAIN_DUMP_REVIEWER_MODEL_PROVIDER: "anthropic",
          BRAIN_DUMP_REVIEWER_MODEL: "claude-opus-4-6",
        },
      },
    });

    const comment = db
      .prepare(
        "SELECT phase, actor_kind, provider, model_provider, model_name FROM ticket_comments WHERE ticket_id = ?"
      )
      .get("ticket-1");
    expect(comment).toEqual({
      phase: "ai_review",
      actor_kind: "ai",
      provider: "claude-code",
      model_provider: "anthropic",
      model_name: "claude-opus-4-6",
    });
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

  it("does not double-count an already fixed finding", () => {
    seedProject();
    seedAiReviewTicket();

    const finding = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "correctness",
      description: "Issue 1",
    });

    markFixed(db, finding.id, "fixed");
    markFixed(db, finding.id, "fixed");

    const state = db
      .prepare("SELECT findings_fixed FROM ticket_workflow_state WHERE ticket_id = ?")
      .get("ticket-1") as { findings_fixed: number };
    expect(state.findings_fixed).toBe(1);
  });

  it("rolls back the resolution when its audit comment cannot be written", () => {
    seedProject();
    seedAiReviewTicket();

    const finding = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "correctness",
      description: "Issue 1",
    });
    db.exec(`
      CREATE TRIGGER reject_finding_resolution_comment
      BEFORE INSERT ON ticket_comments
      WHEN NEW.content LIKE '%Finding marked as fixed%'
      BEGIN
        SELECT RAISE(ABORT, 'simulated comment write failure');
      END;
    `);

    expect(() => markFixed(db, finding.id, "fixed")).toThrow("simulated comment write failure");

    const persistedFinding = db
      .prepare("SELECT status, fixed_at FROM review_findings WHERE id = ?")
      .get(finding.id);
    const state = db
      .prepare("SELECT findings_fixed FROM ticket_workflow_state WHERE ticket_id = ?")
      .get("ticket-1") as { findings_fixed: number };
    expect(persistedFinding).toEqual({ status: "open", fixed_at: null });
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
  it("requires an AI-authored app command for API handoffs in non-legacy projects", () => {
    const projectPath = mkdtempSync(join(tmpdir(), "brain-dump-native-demo-"));
    try {
      db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
        "native-proj",
        "Native Project",
        projectPath,
        new Date().toISOString()
      );
      seedAiReviewTicket("ticket-1", "native-proj");

      expect(() => generateDemo(db, { ticketId: "ticket-1", steps: [automatedStep()] })).toThrow(
        /must declare app.*Inspect the project's README/s
      );

      writeFileSync(
        join(projectPath, "package.json"),
        JSON.stringify({ scripts: { lint: "eslint ." } })
      );
      expect(() => generateDemo(db, { ticketId: "ticket-1", steps: [automatedStep()] })).toThrow(
        /must declare app/
      );

      const step = {
        ...automatedStep(),
        app: { start: ["go", "run", "./cmd/server", "--port", "{port}"] },
      } satisfies DemoStep;
      const demo = generateDemo(db, { ticketId: "ticket-1", steps: [step] });
      expect(demo.steps[0]?.app).toEqual(step.app);
    } finally {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it("rejects conflicting app commands across demo steps", () => {
    seedProject();
    seedAiReviewTicket();
    const first = { ...automatedStep(1), app: { start: ["go", "run", "./cmd/server"] } };
    const second = { ...automatedStep(2), app: { start: ["make", "web"] } };

    expect(() => generateDemo(db, { ticketId: "ticket-1", steps: [first, second] })).toThrow(
      /conflicting app boot commands/
    );
  });

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
    expect(getVerificationJob(db, "ticket-1")).toMatchObject({
      ticketId: "ticket-1",
      demoScriptId: demo.id,
      status: "queued",
      attemptCount: 0,
    });
  });

  it("refreshes one pending verification job on duplicate demo handoff", () => {
    seedProject();
    seedAiReviewTicket();

    generateDemo(db, { ticketId: "ticket-1", steps: [automatedStep()] });
    const firstJob = getVerificationJob(db, "ticket-1");
    db.prepare("UPDATE tickets SET status = 'ai_review' WHERE id = ?").run("ticket-1");

    generateDemo(db, { ticketId: "ticket-1", steps: [automatedStep(2)] });
    const jobs = db.prepare("SELECT * FROM verification_jobs WHERE ticket_id = ?").all("ticket-1");
    const refreshedJob = getVerificationJob(db, "ticket-1");

    expect(jobs).toHaveLength(1);
    expect(refreshedJob?.id).toBe(firstJob?.id);
    expect(refreshedJob).toMatchObject({ status: "queued", attemptCount: 0 });
  });

  it("rolls back the ai_verification handoff when enqueue fails", () => {
    seedProject();
    seedAiReviewTicket();
    const originalStep = automatedStep();
    db.prepare(
      "INSERT INTO demo_scripts (id, ticket_id, steps, generated_at) VALUES (?, ?, ?, ?)"
    ).run("demo-1", "ticket-1", JSON.stringify([originalStep]), "2026-03-08T01:00:00.000Z");
    db.prepare(
      `INSERT INTO verification_jobs (
        id, ticket_id, demo_script_id, status, attempt_count, next_run_at,
        leased_by, lease_expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'running', 1, ?, ?, ?, ?, ?)`
    ).run(
      "job-1",
      "ticket-1",
      "demo-1",
      "2026-03-08T01:00:00.000Z",
      "worker-1",
      "2999-01-01T00:00:00.000Z",
      "2026-03-08T01:00:00.000Z",
      "2026-03-08T01:00:00.000Z"
    );

    expect(() => generateDemo(db, { ticketId: "ticket-1", steps: [automatedStep(2)] })).toThrow(
      /active verification lease/
    );

    expect(db.prepare("SELECT status FROM tickets WHERE id = ?").get("ticket-1")).toMatchObject({
      status: "ai_review",
    });
    const demo = getDemo(db, "ticket-1");
    expect(demo?.steps).toEqual([originalStep]);
    expect(getVerificationJob(db, "ticket-1")).toMatchObject({
      status: "running",
      leasedBy: "worker-1",
      attemptCount: 1,
    });
  });

  it("does not execute automation while generating the demo handoff", () => {
    seedProject();
    seedAiReviewTicket();

    const demo = generateDemo(db, {
      ticketId: "ticket-1",
      steps: [
        {
          order: 1,
          description: "Queue verification without running the command yet",
          expectedOutcome:
            "The command automation is persisted for the runner instead of executed inline",
          type: "automated",
          automation: {
            kind: "command",
            command: {
              argv: ["node", "scripts/nonexistent-verification-step.js"],
              timeoutMs: 1_000,
              expectedExitCode: 0,
            },
            assert: [{ type: "stdoutContains", expected: "runner-only output" }],
          },
        },
      ],
    });

    expect(demo.steps[0]!.automation).toMatchObject({ kind: "command" });
    expect(getVerificationJob(db, "ticket-1")).toMatchObject({
      demoScriptId: demo.id,
      status: "queued",
      attemptCount: 0,
    });
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

  it("accepts and persists command automation specs", () => {
    seedProject();
    seedAiReviewTicket();

    const demo = generateDemo(db, {
      ticketId: "ticket-1",
      steps: [
        {
          order: 1,
          description: "Run focused validation",
          expectedOutcome: "The focused test command passes",
          type: "automated",
          automation: {
            kind: "command",
            command: {
              argv: ["pnpm", "test", "--", "core/__tests__/review.test.ts"],
              cwd: ".",
              timeoutMs: 120000,
              expectedExitCode: 0,
            },
            assert: [{ type: "stdoutContains", expected: "review" }],
          },
        },
      ],
    });

    expect(demo.steps[0]!.automation).toMatchObject({ kind: "command" });
    const row = db
      .prepare("SELECT steps FROM demo_scripts WHERE ticket_id = ?")
      .get("ticket-1") as {
      steps: string;
    };
    expect(JSON.parse(row.steps)[0].automation.command.argv).toEqual([
      "pnpm",
      "test",
      "--",
      "core/__tests__/review.test.ts",
    ]);
  });

  it("accepts and persists file automation specs", () => {
    seedProject();
    seedAiReviewTicket();

    const demo = generateDemo(db, {
      ticketId: "ticket-1",
      steps: [
        {
          order: 1,
          description: "Inspect workflow docs",
          expectedOutcome: "The docs mention AI verification",
          type: "automated",
          automation: {
            kind: "file",
            path: "docs/universal-workflow.md",
            assert: [{ type: "exists" }, { type: "contains", expected: "ai_verification" }],
          },
        },
      ],
    });

    expect(demo.steps[0]!.automation).toMatchObject({ kind: "file" });
    const row = db
      .prepare("SELECT steps FROM demo_scripts WHERE ticket_id = ?")
      .get("ticket-1") as {
      steps: string;
    };
    expect(JSON.parse(row.steps)[0].automation.path).toBe("docs/universal-workflow.md");
  });

  it("rejects command automation shell strings", () => {
    seedProject();
    seedAiReviewTicket();

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [
          {
            order: 1,
            description: "Run a shell command",
            expectedOutcome: "The command passes",
            type: "automated",
            automation: {
              kind: "command",
              command: {
                argv: ["pnpm test -- core/__tests__/review.test.ts"],
                expectedExitCode: 0,
              },
              assert: [{ type: "stdoutContains", expected: "review" }],
            },
          },
        ],
      } as never)
    ).toThrow(/argv must be argv array data, not a shell command string/);
  });

  it("rejects command automation shell interpreters and eval flags", () => {
    seedProject();
    seedAiReviewTicket();

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [
          {
            order: 1,
            description: "Run through a shell",
            expectedOutcome: "The command is rejected",
            type: "automated",
            automation: {
              kind: "command",
              command: {
                argv: ["bash", "-lc", "pnpm test"],
                timeoutMs: 1000,
                expectedExitCode: 0,
              },
              assert: [{ type: "stdoutContains", expected: "PASS" }],
            },
          },
        ],
      })
    ).toThrow(/must not invoke a shell interpreter/);

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [
          {
            order: 1,
            description: "Use shell eval syntax",
            expectedOutcome: "The command is rejected",
            type: "automated",
            automation: {
              kind: "command",
              command: {
                argv: ["pnpm", "-c", "test"],
                timeoutMs: 1000,
                expectedExitCode: 0,
              },
              assert: [{ type: "stdoutContains", expected: "PASS" }],
            },
          },
        ],
      })
    ).toThrow(/must not use shell evaluation flags/);
  });

  it("rejects unsupported, destructive, and package-manager exec command automation", () => {
    seedProject();
    seedAiReviewTicket();

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [
          {
            order: 1,
            description: "Remove files",
            expectedOutcome: "The command is rejected",
            type: "automated",
            automation: {
              kind: "command",
              command: {
                argv: ["rm", "-rf", "tmp"],
                timeoutMs: 1000,
                expectedExitCode: 0,
              },
              assert: [{ type: "stdoutContains", expected: "removed" }],
            },
          },
        ],
      })
    ).toThrow(/uses blocked command token "rm"/);

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [
          {
            order: 1,
            description: "Run arbitrary package binary",
            expectedOutcome: "The command is rejected",
            type: "automated",
            automation: {
              kind: "command",
              command: {
                argv: ["pnpm", "exec", "vite", "--version"],
                timeoutMs: 1000,
                expectedExitCode: 0,
              },
              assert: [{ type: "stdoutContains", expected: "vite" }],
            },
          },
        ],
      })
    ).toThrow(/must not use package-manager exec subcommands/);

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [
          {
            order: 1,
            description: "Use node eval",
            expectedOutcome: "The command is rejected",
            type: "automated",
            automation: {
              kind: "command",
              command: {
                argv: ["node", "-e", "console.log('unsafe')"],
                timeoutMs: 1000,
                expectedExitCode: 0,
              },
              assert: [{ type: "stdoutContains", expected: "unsafe" }],
            },
          },
        ],
      })
    ).toThrow(/must not use interpreter eval flags/);

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [
          {
            order: 1,
            description: "Use unsupported command",
            expectedOutcome: "The command is rejected",
            type: "automated",
            automation: {
              kind: "command",
              command: {
                argv: ["python", "--version"],
                timeoutMs: 1000,
                expectedExitCode: 0,
              },
              assert: [{ type: "stdoutContains", expected: "Python" }],
            },
          },
        ],
      })
    ).toThrow(/uses unsupported command "python"/);
  });

  it("rejects command automation without a timeout", () => {
    seedProject();
    seedAiReviewTicket();

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [
          {
            order: 1,
            description: "Run focused validation",
            expectedOutcome: "The command passes",
            type: "automated",
            automation: {
              kind: "command",
              command: {
                argv: ["pnpm", "test"],
                expectedExitCode: 0,
              },
              assert: [{ type: "stdoutContains", expected: "PASS" }],
            },
          },
        ],
      } as never)
    ).toThrow(/command automation timeoutMs must be a positive integer/);
  });

  it("rejects command automation with an excessive timeout", () => {
    seedProject();
    seedAiReviewTicket();

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [
          {
            order: 1,
            description: "Run an unbounded command",
            expectedOutcome: "The command is rejected",
            type: "automated",
            automation: {
              kind: "command",
              command: {
                argv: ["pnpm", "test"],
                timeoutMs: 300_001,
                expectedExitCode: 0,
              },
              assert: [{ type: "stdoutContains", expected: "PASS" }],
            },
          },
        ],
      })
    ).toThrow(/command automation timeoutMs must be at most 300000ms/);
  });

  it("rejects command automation path escapes", () => {
    seedProject();
    seedAiReviewTicket();

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [
          {
            order: 1,
            description: "Read outside the project",
            expectedOutcome: "The command is rejected",
            type: "automated",
            automation: {
              kind: "command",
              command: {
                argv: ["node", "../outside.js"],
                timeoutMs: 1000,
                expectedExitCode: 0,
              },
              assert: [],
            },
          },
        ],
      } as never)
    ).toThrow(/must not escape the project directory/);
  });

  it("rejects command automation without stdout or stderr assertions", () => {
    seedProject();
    seedAiReviewTicket();

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [
          {
            order: 1,
            description: "Run focused validation",
            expectedOutcome: "The command passes",
            type: "automated",
            automation: {
              kind: "command",
              command: {
                argv: ["pnpm", "test"],
                timeoutMs: 1000,
                expectedExitCode: 0,
              },
              assert: [],
            },
          },
        ],
      })
    ).toThrow(/command automation assert must contain at least one stdout\/stderr assertion/);
  });

  it("rejects file automation absolute paths and parent-directory escapes", () => {
    seedProject();
    seedAiReviewTicket();

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [
          {
            order: 1,
            description: "Read an absolute path",
            expectedOutcome: "The file check is rejected",
            type: "automated",
            automation: {
              kind: "file",
              path: "/etc/passwd",
              assert: [{ type: "contains", expected: "root" }],
            },
          },
        ],
      })
    ).toThrow(/file automation path must be a project-relative path/);

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [
          {
            order: 1,
            description: "Read outside the project",
            expectedOutcome: "The file check is rejected",
            type: "automated",
            automation: {
              kind: "file",
              path: "../secrets.txt",
              assert: [{ type: "contains", expected: "token" }],
            },
          },
        ],
      })
    ).toThrow(/file automation path must not escape the project directory/);
  });

  it("rejects file automation targeting sensitive credential files", () => {
    seedProject();
    seedAiReviewTicket();

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [
          {
            order: 1,
            description: "Inspect env file",
            expectedOutcome: "The file check is rejected",
            type: "automated",
            automation: {
              kind: "file",
              path: ".env",
              assert: [{ type: "exists" }],
            },
          },
        ],
      })
    ).toThrow(/must not target sensitive credential or secret files/);

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [
          {
            order: 1,
            description: "Inspect private key",
            expectedOutcome: "The file check is rejected",
            type: "automated",
            automation: {
              kind: "file",
              path: "certs/private.pem",
              assert: [{ type: "exists" }],
            },
          },
        ],
      })
    ).toThrow(/must not target sensitive credential or secret files/);
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

  it("rejects UI automation whose only assertion is body visibility", () => {
    seedProject();
    seedAiReviewTicket();

    // "body is visible" passes on a page showing only a loading spinner, so a
    // demo built from it certifies nothing (observed: splash-only evidence).
    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [
          {
            order: 1,
            description: "Open the list route",
            expectedOutcome: "The list route renders",
            type: "visual",
            automation: {
              kind: "ui",
              route: "/list",
              assert: [{ type: "visible", selector: "body" }],
              screenshot: true,
            },
          },
        ],
      })
    ).toThrow(/must include at least one meaningful assertion/);
  });

  it("rejects UI text assertions scoped to body so evidence frames the proving element", () => {
    seedProject();
    seedAiReviewTicket();

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [
          {
            order: 1,
            description: "Open the ticket detail page",
            expectedOutcome: "The comment text is visible",
            type: "visual",
            automation: {
              kind: "ui",
              route: "/tickets/ticket-1",
              assert: [{ type: "text", selector: "body", expected: "Important comment" }],
              screenshot: true,
            },
          },
        ],
      })
    ).toThrow(/must target a scoped selector instead of "body"/);
  });

  it("rejects demo handoff when acceptance criteria have no step coverage", () => {
    seedProject();
    seedAiReviewTicket();
    setTicketDescription(
      "ticket-1",
      "## Acceptance Criteria\n- API status is checked\n- UI shows the ticket title"
    );

    expect(() => generateDemo(db, { ticketId: "ticket-1", steps: [automatedStep()] })).toThrow(
      /Missing coverage: criterion:1 \(API status is checked\); criterion:2 \(UI shows the ticket title\)/
    );
  });

  it("persists criterion coverage references for verification reports", () => {
    seedProject();
    seedAiReviewTicket();
    setTicketDescription("ticket-1", "## Acceptance Criteria\n- API status is checked");

    const demo = generateDemo(db, {
      ticketId: "ticket-1",
      steps: [{ ...automatedStep(), covers: ["criterion:1"] }],
    });

    expect(demo.steps[0]!.covers).toEqual(["criterion:1"]);
    const row = db
      .prepare("SELECT steps FROM demo_scripts WHERE ticket_id = ?")
      .get("ticket-1") as {
      steps: string;
    };
    expect(JSON.parse(row.steps)[0].covers).toEqual(["criterion:1"]);
  });

  it("rejects claimed coverage when the step does not reference the criterion", () => {
    seedProject();
    seedAiReviewTicket();
    setTicketDescription("ticket-1", "## Acceptance Criteria\n- UI shows the ticket title");

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [{ ...automatedStep(), covers: ["criterion:1"] }],
      })
    ).toThrow(/claims to cover criterion:1/);
  });

  it("rejects any coverage rationale so uncertifiable demos fail fast in ai_review", () => {
    seedProject();
    seedAiReviewTicket();
    setTicketDescription(
      "ticket-1",
      "## Acceptance Criteria\n- External OAuth provider is manually enabled"
    );

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [
          {
            ...automatedStep(),
            coverageRationale:
              "criterion:1 requires an external provider account; automation verifies the local fallback only.",
          },
        ],
      })
    ).toThrow(/uses coverageRationale, which the verification runner can never certify/);
  });

  it("accepts a project-declared command outside the default allowlist", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "brain-dump-verify-"));
    try {
      mkdirSync(join(projectDir, ".brain-dump"));
      writeFileSync(
        join(projectDir, ".brain-dump", "verify.json"),
        JSON.stringify({ commands: [["make", "lint"]] })
      );
      db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
        "proj-make",
        "Make Project",
        projectDir,
        new Date().toISOString()
      );
      seedAiReviewTicket("ticket-1", "proj-make");
      const makeStep: DemoStep = {
        order: 1,
        description: "Run the project's lint gate",
        expectedOutcome: "make lint exits cleanly",
        type: "automated",
        automation: {
          kind: "command",
          command: { argv: ["make", "lint"], timeoutMs: 60_000, expectedExitCode: 0 },
          assert: [{ type: "stderrNotContains", expected: "error" }],
        },
      };

      const demo = generateDemo(db, { ticketId: "ticket-1", steps: [makeStep] });
      expect(demo.steps[0]!.automation).toMatchObject({ kind: "command" });
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("still rejects undeclared commands outside the default allowlist", () => {
    seedProject();
    seedAiReviewTicket();
    const makeStep: DemoStep = {
      order: 1,
      description: "Run the project's lint gate",
      expectedOutcome: "make lint exits cleanly",
      type: "automated",
      automation: {
        kind: "command",
        command: { argv: ["make", "lint"], timeoutMs: 60_000, expectedExitCode: 0 },
        assert: [{ type: "stderrNotContains", expected: "error" }],
      },
    };

    expect(() => generateDemo(db, { ticketId: "ticket-1", steps: [makeStep] })).toThrow(
      /unsupported command "make"/
    );
  });

  it("enforces coverage for criterion-shaped subtasks", () => {
    seedProject();
    seedAiReviewTicket();
    db.prepare("UPDATE tickets SET subtasks = ? WHERE id = ?").run(
      JSON.stringify([{ id: "api-status", criterion: "API status is checked", status: "pending" }]),
      "ticket-1"
    );

    expect(() => generateDemo(db, { ticketId: "ticket-1", steps: [automatedStep()] })).toThrow(
      /Missing coverage: subtask:api-status \(API status is checked\)/
    );
  });

  it("rejects unknown criterion coverage references", () => {
    seedProject();
    seedAiReviewTicket();
    setTicketDescription("ticket-1", "## Acceptance Criteria\n- API status is checked");

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [{ ...automatedStep(), covers: ["criterion:2"] }],
      })
    ).toThrow(/covers unknown criterion reference "criterion:2"/);
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

  it("rejects API automation objects with custom JSON serialization", () => {
    seedProject();
    seedAiReviewTicket();

    const payload = { value: "stored" } as { value: string; toJSON?: () => { value: string } };
    Object.defineProperty(payload, "toJSON", {
      value: () => ({ value: "different" }),
      enumerable: false,
    });

    const steps = [
      {
        order: 1,
        description: "Check the status API",
        expectedOutcome: "The status endpoint returns OK",
        type: "automated",
        automation: {
          kind: "api",
          request: { method: "POST", path: "/api/status", body: payload },
          assert: [{ type: "jsonPath", expected: { ok: true } }],
        },
      },
    ] as unknown as DemoStep[];

    expect(() => generateDemo(db, { ticketId: "ticket-1", steps })).toThrow(
      /API automation request body must not define custom JSON serialization/
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
    expect(getVerificationJob(db, "ticket-1")).toMatchObject({
      ticketId: "ticket-1",
      status: "queued",
    });
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

// ============================================
// Demo authoring lint (generate-demo)
// ============================================

describe("generate-demo authoring lint", () => {
  function uiStepWithActions(actions: Array<Record<string, string>>): DemoStep {
    return {
      order: 1,
      description: "Open the dashboard",
      expectedOutcome: "Dashboard renders with data",
      type: "visual",
      automation: {
        kind: "ui",
        route: "/",
        actions: actions as never,
        assert: [{ type: "text", selector: "#heading", expected: "Dashboard" }],
        screenshot: true,
      },
    };
  }

  it("rejects app.start argv that hardcodes a port", () => {
    seedProject();
    seedAiReviewTicket();

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [
          {
            ...automatedStep(1),
            app: { start: ["./start.sh", "--port", "3000"] },
          },
        ],
      })
    ).toThrow(/hardcodes a port/);
  });

  it("rejects app.start argv that hardcodes a loopback origin", () => {
    seedProject();
    seedAiReviewTicket();

    expect(() =>
      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [
          {
            ...automatedStep(1),
            app: { start: ["node", "server.js", "--origin", "localhost:5173"] },
          },
        ],
      })
    ).toThrow(/hardcodes a port/);
  });

  it("accepts fixed ports for local dependency URLs", () => {
    seedProject();
    seedAiReviewTicket();

    const demo = generateDemo(db, {
      ticketId: "ticket-1",
      steps: [
        {
          ...automatedStep(1),
          app: {
            start: ["node", "server.js", "--redis-url", "redis://127.0.0.1:6379"],
          },
        },
      ],
    });

    expect(demo.steps).toHaveLength(1);
  });

  it("rejects positional and short-flag hardcoded ports", () => {
    seedProject();
    seedAiReviewTicket();

    for (const start of [
      ["python", "-m", "http.server", "0"],
      ["python", "-m", "http.server", "9"],
      ["python", "-m", "http.server", "65535"],
      ["python", "-m", "http.server", "3000"],
      ["ruby", "-run", "-e", "httpd", ".", "-p", "3000"],
      ["serve", "-l", "3000"],
      ["./server", "3000"],
      ["cargo", "run", "--", "3000"],
      ["node", "server.js", "3000"],
      ["python", "app.py", "8000"],
      ["env", "PORT=3000", "node", "server.js"],
      ["env", "APP_PORT=3000", "node", "server.js"],
      ["server", "--listen=3000"],
      ["server", "-p=3000"],
      ["server", "-p3000"],
      ["server", "-l3000"],
      ["python", "manage.py", "runserver", "127.0.0.1:8000"],
      ["gunicorn", "app:app", "--bind", "[::1]:3000"],
      ["gunicorn", "app:app", "--bind", "[::]:3000"],
    ]) {
      expect(() =>
        generateDemo(db, {
          ticketId: "ticket-1",
          steps: [{ ...automatedStep(1), app: { start } }],
        })
      ).toThrow(/hardcodes a port/);
    }
  });

  it("rejects hardcoded ports hidden behind a package script", () => {
    const projectPath = mkdtempSync(join(tmpdir(), "brain-dump-package-boot-"));
    try {
      writeFileSync(
        join(projectPath, "package.json"),
        JSON.stringify({ scripts: { dev: "pnpm run serve", serve: "vite --port 3000" } })
      );
      seedProject();
      db.prepare("UPDATE projects SET path = ? WHERE id = 'proj-1'").run(projectPath);
      seedAiReviewTicket();

      expect(() =>
        generateDemo(db, {
          ticketId: "ticket-1",
          steps: [{ ...automatedStep(1), app: { start: ["pnpm", "dev"] } }],
        })
      ).toThrow(/hardcodes a port/);
    } finally {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it("resolves package-manager directory options before checking delegated scripts", () => {
    const projectPath = mkdtempSync(join(tmpdir(), "brain-dump-nested-package-boot-"));
    try {
      mkdirSync(join(projectPath, "web"));
      writeFileSync(
        join(projectPath, "web", "package.json"),
        JSON.stringify({ scripts: { dev: "vite --port 3000" } })
      );
      seedProject();
      db.prepare("UPDATE projects SET path = ? WHERE id = 'proj-1'").run(projectPath);
      seedAiReviewTicket();

      expect(() =>
        generateDemo(db, {
          ticketId: "ticket-1",
          steps: [{ ...automatedStep(1), app: { start: ["pnpm", "--dir", "web", "dev"] } }],
        })
      ).toThrow(/hardcodes a port/);
    } finally {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it("accepts app.start argv that uses {port} and {host} tokens", () => {
    seedProject();
    seedAiReviewTicket();

    const demo = generateDemo(db, {
      ticketId: "ticket-1",
      steps: [
        {
          ...automatedStep(1),
          app: { start: ["./start.sh", "--frontend-host", "{host}", "--frontend-port", "{port}"] },
        },
      ],
    });
    expect(demo.steps).toHaveLength(1);
  });

  it("accepts unrelated trailing numeric app options", () => {
    seedProject();
    seedAiReviewTicket();

    const demo = generateDemo(db, {
      ticketId: "ticket-1",
      steps: [
        {
          ...automatedStep(1),
          app: { start: ["gunicorn", "app:app", "--workers", "10"] },
        },
      ],
    });

    expect(demo.steps).toHaveLength(1);
  });

  it("accepts unrelated trailing numeric interpreter options", () => {
    seedProject();
    seedAiReviewTicket();

    for (const start of [
      ["node", "server.js", "--workers", "10"],
      ["python", "app.py", "--timeout", "5000"],
    ]) {
      const demo = generateDemo(db, {
        ticketId: "ticket-1",
        steps: [{ ...automatedStep(1), app: { start } }],
      });
      expect(demo.steps).toHaveLength(1);
      db.prepare("UPDATE tickets SET status = 'ai_review' WHERE id = 'ticket-1'").run();
    }
  });

  it("accepts flags whose names merely contain the letters port", () => {
    seedProject();
    seedAiReviewTicket();

    for (const start of [
      ["./start.sh", "--report-interval=3000"],
      ["./start.sh", "--support=3000"],
    ]) {
      const demo = generateDemo(db, {
        ticketId: "ticket-1",
        steps: [{ ...automatedStep(1), app: { start } }],
      });
      expect(demo.steps).toHaveLength(1);
      db.prepare("UPDATE tickets SET status = 'ai_review' WHERE id = 'ticket-1'").run();
    }
  });

  it("rejects hardcoded ports in project-declared boot commands", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "brain-dump-boot-port-"));
    try {
      mkdirSync(join(projectDir, ".brain-dump"));
      writeFileSync(
        join(projectDir, ".brain-dump", "verify.json"),
        JSON.stringify({ start: ["python", "-m", "http.server", "3000"] })
      );
      db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
        "proj-hardcoded-port",
        "Hardcoded Port Project",
        projectDir,
        new Date().toISOString()
      );
      seedAiReviewTicket("ticket-1", "proj-hardcoded-port");

      expect(() => generateDemo(db, { ticketId: "ticket-1", steps: [automatedStep()] })).toThrow(
        /hardcodes a port/
      );
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("rejects a legacy boot declaration delegated to a fixed-port package script", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "brain-dump-delegated-legacy-port-"));
    try {
      mkdirSync(join(projectDir, ".brain-dump"));
      writeFileSync(
        join(projectDir, ".brain-dump", "verify.json"),
        JSON.stringify({ start: ["pnpm", "dev"] })
      );
      writeFileSync(
        join(projectDir, "package.json"),
        JSON.stringify({ scripts: { dev: "vite --port 3000" } })
      );
      db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
        "proj-delegated-port",
        "Delegated Port Project",
        projectDir,
        new Date().toISOString()
      );
      seedAiReviewTicket("ticket-1", "proj-delegated-port");

      expect(() => generateDemo(db, { ticketId: "ticket-1", steps: [automatedStep()] })).toThrow(
        /hardcodes a port/
      );
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("rejects hardcoded ports in selected package boot scripts", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "brain-dump-package-port-"));
    try {
      writeFileSync(
        join(projectDir, "package.json"),
        JSON.stringify({ scripts: { start: "node server.js 3000" } })
      );
      db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
        "proj-package-port",
        "Package Port Project",
        projectDir,
        new Date().toISOString()
      );
      seedAiReviewTicket("ticket-1", "proj-package-port");

      expect(() => generateDemo(db, { ticketId: "ticket-1", steps: [automatedStep()] })).toThrow(
        /hardcodes a port/
      );
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("accepts UI steps that interact with immediately available controls", () => {
    seedProject();
    seedAiReviewTicket();

    const demo = generateDemo(db, {
      ticketId: "ticket-1",
      steps: [uiStepWithActions([{ act: "click", selector: "button[aria-label='Refresh']" }])],
    });

    expect(demo.steps).toHaveLength(1);
  });

  it("accepts UI steps that waitFor before interacting", () => {
    seedProject();
    seedAiReviewTicket();

    const demo = generateDemo(db, {
      ticketId: "ticket-1",
      steps: [
        uiStepWithActions([
          { act: "waitFor", selector: "[data-testid^='row-']" },
          { act: "click", selector: "button[aria-label='Refresh']" },
        ]),
      ],
    });
    expect(demo.steps).toHaveLength(1);
  });

  it("accepts file content assertions for artifacts created during earlier demo steps", () => {
    seedProject();
    seedAiReviewTicket();

    const demo = generateDemo(db, {
      ticketId: "ticket-1",
      steps: [
        {
          order: 1,
          description: "Generate the report",
          expectedOutcome: "The report command succeeds",
          type: "automated",
          automation: {
            kind: "command",
            command: {
              argv: ["node", "scripts/generate-report.mjs"],
              timeoutMs: 10_000,
              expectedExitCode: 0,
            },
            assert: [{ type: "stdoutContains", expected: "report generated" }],
          },
        },
        {
          order: 2,
          description: "Inspect the generated report",
          expectedOutcome: "No SaaS references remain",
          type: "automated",
          automation: {
            kind: "file",
            path: "generated/report.json",
            assert: [{ type: "notContains", expected: "isPro" }],
          },
        },
      ],
    });

    expect(demo.steps).toHaveLength(2);
  });

  it("accepts notExists assertions against deleted files", () => {
    seedProject();
    seedAiReviewTicket();

    const demo = generateDemo(db, {
      ticketId: "ticket-1",
      steps: [
        {
          order: 1,
          description: "Prove old module was removed",
          expectedOutcome: "The file is gone",
          type: "automated",
          automation: {
            kind: "file",
            path: "src/deleted-module-that-never-existed.ts",
            assert: [{ type: "notExists" }],
          },
        },
      ],
    });
    expect(demo.steps).toHaveLength(1);
  });
});

// ============================================
// submitFinding deduplication
// ============================================

describe("submitFinding deduplication", () => {
  it("merges a canonically identical open finding instead of inserting a new row", () => {
    seedProject();
    seedAiReviewTicket();

    const first = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "state-management",
      description:
        "Shared refresh state leaks between the header and the FRED grid, so a header refresh clobbers grid results",
      filePath: "web/src/components/dashboard/FREDChartsGrid.tsx",
      lineNumber: 73,
    });
    const second = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "silent-failure-hunter",
      severity: "major",
      category: "state-management",
      description:
        "Shared refresh state leaks between the header and the FRED grid, so a header refresh clobbers grid results",
      filePath: "web/src/components/dashboard/FREDChartsGrid.tsx",
      lineNumber: 75,
    });

    expect(second.deduplicated).toBe(true);
    expect(second.id).toBe(first.id);
    const rows = db
      .prepare("SELECT COUNT(*) as count FROM review_findings WHERE ticket_id = 'ticket-1'")
      .get() as { count: number };
    expect(rows.count).toBe(1);
    const state = db
      .prepare("SELECT findings_count FROM ticket_workflow_state WHERE ticket_id = 'ticket-1'")
      .get() as { findings_count: number };
    expect(state.findings_count).toBe(1);
    expect(second.description).toContain("duplicate report merged");

    const third = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "state-management",
      description:
        "Shared refresh state leaks between the header and the FRED grid, so a header refresh clobbers grid results",
      filePath: "web/src/components/dashboard/FREDChartsGrid.tsx",
      lineNumber: 74,
    });
    expect(third.deduplicated).toBe(true);
    expect(third.id).toBe(first.id);
  });

  it("upgrades a duplicate to the highest reported severity and preserves fix guidance", () => {
    seedProject();
    seedAiReviewTicket();

    submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "minor",
      category: "state-management",
      description: "Shared refresh state leaks between the header and the FRED grid",
      filePath: "web/src/components/dashboard/FREDChartsGrid.tsx",
      lineNumber: 73,
    });
    const duplicate = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "silent-failure-hunter",
      severity: "critical",
      category: "state-management",
      description: "Shared refresh state leaks between the header and the FRED grid",
      filePath: "web/src/components/dashboard/FREDChartsGrid.tsx",
      lineNumber: 75,
      suggestedFix: "Give each refresh surface independent state.",
    });

    expect(duplicate.deduplicated).toBe(true);
    expect(duplicate.severity).toBe("critical");
    expect(duplicate.suggestedFix).toBe("Give each refresh surface independent state.");
    expect(checkComplete(db, "ticket-1").canProceedToVerification).toBe(false);
  });

  it("keeps genuinely different findings separate", () => {
    seedProject();
    seedAiReviewTicket();

    submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "state-management",
      description: "Shared refresh state leaks between the header and the FRED grid",
      filePath: "web/src/components/dashboard/FREDChartsGrid.tsx",
    });
    const other = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "minor",
      category: "state-management",
      description: "Watchlist rows drop their category when the API omits the field",
      filePath: "web/src/lib/api.ts",
    });

    expect(other.deduplicated).toBeUndefined();
    const rows = db
      .prepare("SELECT COUNT(*) as count FROM review_findings WHERE ticket_id = 'ticket-1'")
      .get() as { count: number };
    expect(rows.count).toBe(2);
  });

  it("keeps a shorter related finding separate from a more specific defect", () => {
    seedProject();
    seedAiReviewTicket();

    submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "verification",
      description: "Verification state update fails after the worker loses its lease",
      filePath: "core/verification.ts",
      lineNumber: 100,
    });
    const distinct = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "silent-failure-hunter",
      severity: "major",
      category: "verification",
      description:
        "Verification state update fails after the worker loses its lease and also clears the unrelated human blocker before retry scheduling completes",
      filePath: "core/verification.ts",
      lineNumber: 105,
    });

    expect(distinct.deduplicated).toBeUndefined();
    const rows = db
      .prepare("SELECT COUNT(*) as count FROM review_findings WHERE ticket_id = 'ticket-1'")
      .get() as { count: number };
    expect(rows.count).toBe(2);
  });

  it("keeps semantically opposite findings independently resolvable", () => {
    seedProject();
    seedAiReviewTicket();

    submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "authorization",
      description: "Save handler accepts requests without authorization",
      filePath: "core/save.ts",
      lineNumber: 40,
    });
    const opposite = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "silent-failure-hunter",
      severity: "major",
      category: "authorization",
      description: "Save handler rejects requests without authorization",
      filePath: "core/save.ts",
      lineNumber: 40,
    });

    expect(opposite.deduplicated).toBeUndefined();
  });

  it("preserves code operators when comparing finding identity", () => {
    seedProject();
    seedAiReviewTicket();

    submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "authorization",
      description: "Authorization uses role == requiredRole",
      filePath: "core/auth.ts",
      lineNumber: 20,
    });
    const opposite = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "silent-failure-hunter",
      severity: "major",
      category: "authorization",
      description: "Authorization uses role != requiredRole",
      filePath: "core/auth.ts",
      lineNumber: 20,
    });

    expect(opposite.deduplicated).toBeUndefined();
  });

  it("does not merge a located finding with one missing its line number", () => {
    seedProject();
    seedAiReviewTicket();

    submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "verification",
      description: "The verification worker clears the active lease before settlement",
      filePath: "core/verification.ts",
      lineNumber: 100,
    });
    const unlocated = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "silent-failure-hunter",
      severity: "major",
      category: "verification",
      description: "The verification worker clears the active lease before settlement",
      filePath: "core/verification.ts",
    });

    expect(unlocated.deduplicated).toBeUndefined();
  });
});

describe("submitFinding anti-spiral gates", () => {
  function setReviewIteration(iteration: number, ticketId = "ticket-1"): void {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO ticket_workflow_state (id, ticket_id, current_phase, review_iteration, findings_count, findings_fixed, demo_generated, created_at, updated_at)
       VALUES (?, ?, 'ai_review', ?, 0, 0, 0, ?, ?)
       ON CONFLICT(ticket_id) DO UPDATE SET review_iteration = excluded.review_iteration`
    ).run(`ws-${ticketId}`, ticketId, iteration, now, now);
  }

  it("downgrades blocking findings beyond the open-blocking budget to minor", () => {
    seedProject();
    seedAiReviewTicket();

    for (let i = 0; i < 5; i++) {
      const finding = submitFinding(db, {
        ticketId: "ticket-1",
        agent: "code-reviewer",
        severity: "major",
        category: `distinct-category-${i}`,
        description: `Blocking defect number ${i} with its own reproduction`,
        filePath: `src/file-${i}.ts`,
        lineNumber: 10,
      });
      expect(finding.severity).toBe("major");
    }

    const overflow = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "critical",
      category: "distinct-category-overflow",
      description: "A sixth blocking defect that exceeds the budget",
      filePath: "src/file-overflow.ts",
      lineNumber: 10,
    });

    expect(overflow.severity).toBe("minor");
    expect(overflow.severityDowngradedFrom).toBe("critical");
    expect(overflow.description).toContain("[severity gate]");
    // The budgeted batch still blocks; the overflow does not add to it.
    const completion = checkComplete(db, "ticket-1");
    expect(completion.openMajor).toBe(5);
    expect(completion.openCritical).toBe(0);
  });

  it("frees budget when findings are fixed so later blockers are accepted", () => {
    seedProject();
    seedAiReviewTicket();

    const first = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "cat-0",
      description: "First blocking defect",
      filePath: "src/a.ts",
      lineNumber: 1,
    });
    for (let i = 1; i < 5; i++) {
      submitFinding(db, {
        ticketId: "ticket-1",
        agent: "code-reviewer",
        severity: "major",
        category: `cat-${i}`,
        description: `Blocking defect ${i}`,
        filePath: `src/f${i}.ts`,
        lineNumber: 1,
      });
    }
    markFixed(db, first.id, "fixed");

    const afterFix = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "cat-later",
      description: "New blocking defect after one was fixed",
      filePath: "src/later.ts",
      lineNumber: 1,
    });
    expect(afterFix.severity).toBe("major");
    expect(afterFix.severityDowngradedFrom).toBeUndefined();
  });

  it("widens dedup on re-review rounds to same category/file/line regardless of wording", () => {
    seedProject();
    seedAiReviewTicket();
    setReviewIteration(2);

    const first = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "state-management",
      description: "Refresh state leaks between header and grid",
      filePath: "src/components/Grid.tsx",
      lineNumber: 73,
    });
    const reworded = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "state-management",
      description:
        "The grid re-renders with stale results because the header shares its refresh flag",
      filePath: "src/components/Grid.tsx",
      lineNumber: 78,
    });

    expect(reworded.deduplicated).toBe(true);
    expect(reworded.id).toBe(first.id);
  });

  it("keeps exact-description dedup semantics on the first review round", () => {
    seedProject();
    seedAiReviewTicket();

    submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "state-management",
      description: "Refresh state leaks between header and grid",
      filePath: "src/components/Grid.tsx",
      lineNumber: 73,
    });
    const differentDefect = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "state-management",
      description: "Grid drops its sort order when the API omits the field",
      filePath: "src/components/Grid.tsx",
      lineNumber: 75,
    });

    expect(differentDefect.deduplicated).toBeUndefined();
  });
});

describe("submitFinding repair-diff scope gate", () => {
  let repoDir: string;

  function gitIn(args: string[]): void {
    const result = spawnSync("git", args, { cwd: repoDir, encoding: "utf-8" });
    if (result.status !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
    }
  }

  function initRepoWithReviewedCommit(): string {
    repoDir = mkdtempSync(join(tmpdir(), "bd-scope-gate-"));
    gitIn(["init"]);
    gitIn(["config", "user.email", "test@example.com"]);
    gitIn(["config", "user.name", "Test"]);
    writeFileSync(join(repoDir, "reviewed.ts"), "export const reviewed = 1;\n");
    writeFileSync(join(repoDir, "repaired.ts"), "export const repaired = 1;\n");
    gitIn(["add", "."]);
    gitIn(["commit", "-m", "reviewed implementation"]);
    const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf-8" });
    // Repair commit touches only repaired.ts.
    writeFileSync(join(repoDir, "repaired.ts"), "export const repaired = 2;\n");
    gitIn(["add", "."]);
    gitIn(["commit", "-m", "verification repair"]);
    return head.stdout.trim();
  }

  function seedScopedTicket(reviewedCommit: string): void {
    db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
      "proj-1",
      "Scope Project",
      repoDir,
      new Date().toISOString()
    );
    seedAiReviewTicket();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO ticket_workflow_state (id, ticket_id, current_phase, review_iteration, findings_count, findings_fixed, demo_generated, reviewed_through_commit, created_at, updated_at)
       VALUES ('ws-1', 'ticket-1', 'ai_review', 2, 0, 0, 0, ?, ?, ?)`
    ).run(reviewedCommit, now, now);
  }

  afterEach(() => {
    if (repoDir) rmSync(repoDir, { recursive: true, force: true });
  });

  it("downgrades re-review blockers outside the repair diff to minor", () => {
    const reviewedCommit = initRepoWithReviewedCommit();
    seedScopedTicket(reviewedCommit);

    const outOfScope = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "correctness",
      description: "Already-reviewed module has a subtle state bug",
      filePath: "reviewed.ts",
      lineNumber: 1,
    });

    expect(outOfScope.severity).toBe("minor");
    expect(outOfScope.severityDowngradedFrom).toBe("major");
    expect(outOfScope.description).toContain("has not changed since the last verification handoff");
    expect(checkComplete(db, "ticket-1").canProceedToVerification).toBe(true);
  });

  it("accepts re-review blockers anchored to the repair diff", () => {
    const reviewedCommit = initRepoWithReviewedCommit();
    seedScopedTicket(reviewedCommit);

    const inScope = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "correctness",
      description: "The repair breaks the exported constant contract",
      filePath: "repaired.ts",
      lineNumber: 1,
    });

    expect(inScope.severity).toBe("major");
    expect(inScope.severityDowngradedFrom).toBeUndefined();
  });

  it("fails open when no reviewed-through commit is stamped", () => {
    initRepoWithReviewedCommit();
    db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
      "proj-1",
      "Scope Project",
      repoDir,
      new Date().toISOString()
    );
    seedAiReviewTicket();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO ticket_workflow_state (id, ticket_id, current_phase, review_iteration, findings_count, findings_fixed, demo_generated, created_at, updated_at)
       VALUES ('ws-1', 'ticket-1', 'ai_review', 2, 0, 0, 0, ?, ?)`
    ).run(now, now);

    const finding = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "correctness",
      description: "Blocking defect with unknown review scope",
      filePath: "reviewed.ts",
      lineNumber: 1,
    });

    expect(finding.severity).toBe("major");
  });
});

describe("generateDemo reviewed-through stamp", () => {
  it("stamps repo HEAD as reviewed_through_commit at verification handoff", () => {
    const repoDir = mkdtempSync(join(tmpdir(), "bd-stamp-"));
    try {
      const git = (args: string[]) => {
        const result = spawnSync("git", args, { cwd: repoDir, encoding: "utf-8" });
        if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
        return result.stdout.trim();
      };
      git(["init"]);
      git(["config", "user.email", "test@example.com"]);
      git(["config", "user.name", "Test"]);
      writeFileSync(join(repoDir, "impl.ts"), "export const x = 1;\n");
      git(["add", "."]);
      git(["commit", "-m", "implementation"]);
      const head = git(["rev-parse", "HEAD"]);

      db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
        "proj-1",
        "Stamp Project",
        repoDir,
        new Date().toISOString()
      );
      seedAiReviewTicket();

      generateDemo(db, {
        ticketId: "ticket-1",
        steps: [
          {
            order: 1,
            description: "Check the constant",
            expectedOutcome: "impl.ts exists",
            type: "automated",
            automation: {
              kind: "file",
              path: "impl.ts",
              assert: [{ type: "exists" }],
            },
          },
        ],
      });

      const state = db
        .prepare(
          "SELECT reviewed_through_commit FROM ticket_workflow_state WHERE ticket_id = 'ticket-1'"
        )
        .get() as { reviewed_through_commit: string | null };
      expect(state.reviewed_through_commit).toBe(head);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});

describe("getReviewContext", () => {
  it("returns requirements, work history, findings, and rules in one packet", () => {
    seedProject();
    seedAiReviewTicket();
    setTicketDescription("ticket-1", "Implement the widget toggle");
    db.prepare("UPDATE tickets SET subtasks = ? WHERE id = 'ticket-1'").run(
      JSON.stringify([
        { id: "c1", criterion: "Toggle persists across reloads", status: "pending" },
        { id: "c2", text: "Toggle is keyboard accessible", completed: true },
      ])
    );
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at)
       VALUES ('c-ws', 'ticket-1', 'Implemented toggle with localStorage', 'ralph:claude', 'work_summary', ?)`
    ).run(now);
    db.prepare(
      `INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at)
       VALUES ('c-tr', 'ticket-1', 'pnpm check: pass', 'ralph:claude', 'test_report', ?)`
    ).run(now);
    const open = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "major",
      category: "correctness",
      description: "Toggle loses state when storage is unavailable",
      filePath: "src/toggle.ts",
      lineNumber: 12,
    });
    const closed = submitFinding(db, {
      ticketId: "ticket-1",
      agent: "code-reviewer",
      severity: "minor",
      category: "style",
      description: "Prefer the shared button component",
      filePath: "src/toggle.ts",
      lineNumber: 30,
    });
    markFixed(db, closed.id, "wont_fix");

    const context = getReviewContext(db, "ticket-1");

    expect(context.ticket.title).toBe("Ticket ticket-1");
    expect(context.ticket.description).toBe("Implement the widget toggle");
    expect(context.acceptanceCriteria).toEqual([
      { id: "c1", text: "Toggle persists across reloads", status: "pending" },
      { id: "c2", text: "Toggle is keyboard accessible", status: "passed" },
    ]);
    expect(context.workHistory.map((c) => c.type)).toContain("work_summary");
    expect(context.workHistory.map((c) => c.type)).toContain("test_report");
    expect(context.openFindings.map((f) => f.id)).toEqual([open.id]);
    expect(context.resolvedFindings.map((f) => f.id)).toEqual([closed.id]);
    expect(context.reviewRules.openBlockingCount).toBe(1);
    expect(context.reviewRules.blockingBudgetRemaining).toBe(4);
    expect(context.completion.canProceedToVerification).toBe(false);
  });

  it("reports repair scope with the changed-file list when a reviewed-through commit is stamped", () => {
    const repoDir = mkdtempSync(join(tmpdir(), "bd-ctx-scope-"));
    try {
      const git = (args: string[]) => {
        const result = spawnSync("git", args, { cwd: repoDir, encoding: "utf-8" });
        if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
        return result.stdout.trim();
      };
      git(["init"]);
      git(["config", "user.email", "test@example.com"]);
      git(["config", "user.name", "Test"]);
      writeFileSync(join(repoDir, "reviewed.ts"), "export const a = 1;\n");
      git(["add", "."]);
      git(["commit", "-m", "reviewed"]);
      const reviewedCommit = git(["rev-parse", "HEAD"]);
      writeFileSync(join(repoDir, "repaired.ts"), "export const b = 1;\n");
      git(["add", "."]);
      git(["commit", "-m", "repair"]);

      db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
        "proj-1",
        "Ctx Project",
        repoDir,
        new Date().toISOString()
      );
      seedAiReviewTicket();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO ticket_workflow_state (id, ticket_id, current_phase, review_iteration, findings_count, findings_fixed, demo_generated, reviewed_through_commit, created_at, updated_at)
         VALUES ('ws-1', 'ticket-1', 'ai_review', 2, 0, 0, 0, ?, ?, ?)`
      ).run(reviewedCommit, now, now);

      const context = getReviewContext(db, "ticket-1");

      expect(context.scope.kind).toBe("repair");
      expect(context.scope.changedFiles).toEqual(["repaired.ts"]);
      expect(context.scope.reviewedThroughCommit).toBe(reviewedCommit);
      expect(context.reviewRules.isReReviewRound).toBe(true);
      expect(context.reviewRules.roundsRemaining).toBe(1);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("limits an initial review to ticket-linked commits on a shared branch", () => {
    const repoDir = mkdtempSync(join(tmpdir(), "bd-ctx-linked-scope-"));
    try {
      const git = (args: string[]) => {
        const result = spawnSync("git", args, { cwd: repoDir, encoding: "utf-8" });
        if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
        return result.stdout.trim();
      };
      git(["init"]);
      git(["config", "user.email", "test@example.com"]);
      git(["config", "user.name", "Test"]);
      writeFileSync(join(repoDir, "base.ts"), "export const base = 1;\n");
      git(["add", "."]);
      git(["commit", "-m", "base"]);
      git(["branch", "-M", "main"]);
      writeFileSync(join(repoDir, "ticket-a.ts"), "export const a = 1;\n");
      git(["add", "."]);
      git(["commit", "-m", "ticket a"]);
      const ticketCommit = git(["rev-parse", "HEAD"]);
      writeFileSync(join(repoDir, "sibling.ts"), "export const sibling = 1;\n");
      git(["add", "."]);
      git(["commit", "-m", "sibling ticket"]);

      db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
        "proj-1",
        "Linked Scope Project",
        repoDir,
        new Date().toISOString()
      );
      seedAiReviewTicket();
      db.prepare("UPDATE tickets SET linked_commits = ? WHERE id = 'ticket-1'").run(
        JSON.stringify([{ hash: ticketCommit, message: "ticket a" }])
      );

      const context = getReviewContext(db, "ticket-1");

      expect(context.scope.kind).toBe("initial");
      expect(context.scope.changedFiles).toEqual(["ticket-a.ts"]);
      expect(context.scope.changedFiles).not.toContain("sibling.ts");
      expect(context.scope.baseRef).toBe("ticket-linked commits (1)");
      expect(context.scope.note).toContain("impact");
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("reports unknown scope when the project has no usable git diff", () => {
    seedProject(); // project path = process.cwd() which is a repo, but no
    // reviewed commit and merge-base of main..HEAD exists here — so instead
    // point the ticket at a project path that does not exist.
    db.prepare(
      "UPDATE projects SET path = '/nonexistent/brain-dump-test' WHERE id = 'proj-1'"
    ).run();
    seedAiReviewTicket();

    const context = getReviewContext(db, "ticket-1");

    expect(context.scope.kind).toBe("unknown");
    expect(context.scope.changedFiles).toEqual([]);
    expect(context.scope.note).toContain("linked commits");
  });

  it("throws TicketNotFoundError for a nonexistent ticket", () => {
    expect(() => getReviewContext(db, "nope")).toThrow(TicketNotFoundError);
  });
});
