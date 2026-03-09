import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import {
  createEpicReviewRun,
  getEpicReviewRun,
  listEpicReviewRunTicketLinks,
  listEpicReviewRuns,
  updateEpicReviewRun,
  updateEpicReviewRunTicketLink,
  findLatestActiveEpicReviewRunIdForTicket,
  getEpicReviewRunArtifactSummary,
  addEpicReviewRunAuditComments,
} from "../epic-review-run.ts";
import { EpicNotFoundError, ValidationError } from "../errors.ts";

let db: Database.Database;

function seedProject(id = "proj-1"): string {
  db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    "Test Project",
    "/tmp/test-project",
    new Date().toISOString()
  );
  return id;
}

function seedEpic(id = "epic-1", projectId = "proj-1"): string {
  db.prepare("INSERT INTO epics (id, title, project_id, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    `Epic ${id}`,
    projectId,
    new Date().toISOString()
  );
  return id;
}

function seedTicket(
  id: string,
  projectId = "proj-1",
  epicId: string | null = "epic-1",
  status = "backlog"
): string {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tickets (id, title, status, priority, position, project_id, epic_id, created_at, updated_at)
     VALUES (?, ?, ?, 'medium', 1, ?, ?, ?, ?)`
  ).run(id, `Ticket ${id}`, status, projectId, epicId, now, now);
  return id;
}

beforeEach(() => {
  const result = createTestDatabase();
  db = result.db;
});

describe("createEpicReviewRun", () => {
  it("creates an orchestration record with ordered selected tickets", () => {
    seedProject();
    seedEpic();
    seedTicket("ticket-1");
    seedTicket("ticket-2");

    const run = createEpicReviewRun(db, {
      epicId: "epic-1",
      selectedTicketIds: ["ticket-2", "ticket-1"],
      launchMode: "focused-review",
      provider: "codex",
      steeringPrompt: "focus on auth edge cases\nand silent failures",
    });

    expect(run.epicId).toBe("epic-1");
    expect(run.selectedTicketIds).toEqual(["ticket-2", "ticket-1"]);
    expect(run.launchMode).toBe("focused-review");
    expect(run.provider).toBe("codex");
    expect(run.status).toBe("queued");
    expect(run.steeringPrompt).toBe("focus on auth edge cases\nand silent failures");

    const links = listEpicReviewRunTicketLinks(db, run.id);
    expect(links.map((link) => [link.ticketId, link.position, link.status, link.summary])).toEqual([
      ["ticket-2", 0, "queued", null],
      ["ticket-1", 1, "queued", null],
    ]);
  });

  it("throws when the epic does not exist", () => {
    expect(() =>
      createEpicReviewRun(db, {
        epicId: "missing-epic",
        selectedTicketIds: ["ticket-1"],
        launchMode: "focused-review",
      })
    ).toThrow(EpicNotFoundError);
  });

  it("throws when no tickets are selected", () => {
    seedProject();
    seedEpic();

    expect(() =>
      createEpicReviewRun(db, {
        epicId: "epic-1",
        selectedTicketIds: [],
        launchMode: "focused-review",
      })
    ).toThrow(ValidationError);
  });

  it("throws when duplicate tickets are selected", () => {
    seedProject();
    seedEpic();
    seedTicket("ticket-1");

    expect(() =>
      createEpicReviewRun(db, {
        epicId: "epic-1",
        selectedTicketIds: ["ticket-1", "ticket-1"],
        launchMode: "focused-review",
      })
    ).toThrow(ValidationError);
  });

  it("throws when a selected ticket belongs to another epic", () => {
    seedProject();
    seedEpic("epic-1");
    seedEpic("epic-2");
    seedTicket("ticket-1", "proj-1", "epic-1");
    seedTicket("ticket-2", "proj-1", "epic-2");

    expect(() =>
      createEpicReviewRun(db, {
        epicId: "epic-1",
        selectedTicketIds: ["ticket-1", "ticket-2"],
        launchMode: "focused-review",
      })
    ).toThrow(ValidationError);
  });

  it("does not modify ticket-level review tables", () => {
    seedProject();
    seedEpic();
    seedTicket("ticket-1", "proj-1", "epic-1", "ai_review");

    db.prepare(
      `INSERT INTO ticket_workflow_state
       (id, ticket_id, current_phase, review_iteration, findings_count, findings_fixed, demo_generated, created_at, updated_at)
       VALUES (?, ?, 'ai_review', 2, 1, 0, 1, ?, ?)`
    ).run("workflow-1", "ticket-1", "2026-03-08T00:00:00.000Z", "2026-03-08T00:00:00.000Z");
    db.prepare(
      `INSERT INTO review_findings
       (id, ticket_id, iteration, agent, severity, category, description, status, created_at)
       VALUES (?, ?, 2, 'code-reviewer', 'major', 'logic', 'Existing finding', 'open', ?)`
    ).run("finding-1", "ticket-1", "2026-03-08T00:00:00.000Z");
    db.prepare(
      `INSERT INTO demo_scripts (id, ticket_id, steps, generated_at)
       VALUES (?, ?, ?, ?)`
    ).run(
      "demo-1",
      "ticket-1",
      JSON.stringify([
        {
          order: 1,
          description: "Open the ticket",
          expectedOutcome: "Ticket details render",
          type: "manual",
        },
      ]),
      "2026-03-08T00:00:00.000Z"
    );

    createEpicReviewRun(db, {
      epicId: "epic-1",
      selectedTicketIds: ["ticket-1"],
      launchMode: "focused-review",
      steeringPrompt: "preserve ticket history",
    });

    const workflowCount = db
      .prepare("SELECT COUNT(*) AS count FROM ticket_workflow_state")
      .get() as { count: number };
    const findingsCount = db.prepare("SELECT COUNT(*) AS count FROM review_findings").get() as {
      count: number;
    };
    const demoCount = db.prepare("SELECT COUNT(*) AS count FROM demo_scripts").get() as {
      count: number;
    };

    expect(workflowCount.count).toBe(1);
    expect(findingsCount.count).toBe(1);
    expect(demoCount.count).toBe(1);
  });

  it("writes ticket-visible audit comments when requested", () => {
    seedProject();
    seedEpic();
    seedTicket("ticket-1");

    const run = createEpicReviewRun(db, {
      epicId: "epic-1",
      selectedTicketIds: ["ticket-1"],
      launchMode: "focused-review",
      steeringPrompt: "focus on regressions",
      status: "running",
    });

    addEpicReviewRunAuditComments(db, run.id);

    const comments = db
      .prepare("SELECT content, author, type FROM ticket_comments WHERE ticket_id = ?")
      .all("ticket-1") as Array<{ content: string; author: string; type: string }>;

    expect(comments).toHaveLength(1);
    expect(comments[0]?.author).toBe("brain-dump");
    expect(comments[0]?.type).toBe("progress");
    expect(comments[0]?.content).toContain("Focused epic review launched.");
    expect(comments[0]?.content).toContain(`Run ID: ${run.id}`);
    expect(comments[0]?.content).toContain("focus on regressions");
  });

  it("preserves prior ticket comments and findings when audit comments are added", () => {
    seedProject();
    seedEpic();
    seedTicket("ticket-1", "proj-1", "epic-1", "ai_review");

    db.prepare(
      `INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      "comment-1",
      "ticket-1",
      "Existing discussion stays visible.",
      "user",
      "comment",
      "2026-03-08T00:00:00.000Z"
    );
    db.prepare(
      `INSERT INTO review_findings
       (id, ticket_id, iteration, agent, severity, category, description, status, created_at)
       VALUES (?, ?, 1, 'code-reviewer', 'major', 'logic', 'Existing finding stays linked to the ticket', 'open', ?)`
    ).run("finding-1", "ticket-1", "2026-03-08T00:00:00.000Z");

    const run = createEpicReviewRun(db, {
      epicId: "epic-1",
      selectedTicketIds: ["ticket-1"],
      launchMode: "focused-review",
      steeringPrompt: "preserve ticket history",
      status: "running",
    });

    addEpicReviewRunAuditComments(db, run.id);

    const comments = db
      .prepare(
        `SELECT content, author, type
         FROM ticket_comments
         WHERE ticket_id = ?
         ORDER BY created_at ASC, id ASC`
      )
      .all("ticket-1") as Array<{ content: string; author: string; type: string }>;
    const findingsCount = db.prepare("SELECT COUNT(*) AS count FROM review_findings").get() as {
      count: number;
    };

    expect(findingsCount.count).toBe(1);
    expect(comments).toHaveLength(2);
    expect(comments[0]).toMatchObject({
      content: "Existing discussion stays visible.",
      author: "user",
      type: "comment",
    });
    expect(comments[1]?.author).toBe("brain-dump");
    expect(comments[1]?.type).toBe("progress");
    expect(comments[1]?.content).toContain("Focused epic review launched.");
    expect(comments[1]?.content).toContain(`Run ID: ${run.id}`);
  });
});

describe("get/list/update epic review runs", () => {
  it("lists runs newest first and returns selected tickets", async () => {
    seedProject();
    seedEpic();
    seedTicket("ticket-1");
    seedTicket("ticket-2");

    const first = createEpicReviewRun(db, {
      epicId: "epic-1",
      selectedTicketIds: ["ticket-1"],
      launchMode: "focused-review",
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    const second = createEpicReviewRun(db, {
      epicId: "epic-1",
      selectedTicketIds: ["ticket-2"],
      launchMode: "focused-review",
      provider: "codex",
    });

    const runs = listEpicReviewRuns(db, "epic-1");

    expect(runs.map((run) => run.id)).toEqual([second.id, first.id]);
    expect(getEpicReviewRun(db, first.id).selectedTicketIds).toEqual(["ticket-1"]);
  });

  it("updates status and summary without changing selected tickets", () => {
    seedProject();
    seedEpic();
    seedTicket("ticket-1");

    const run = createEpicReviewRun(db, {
      epicId: "epic-1",
      selectedTicketIds: ["ticket-1"],
      launchMode: "focused-review",
    });

    const updated = updateEpicReviewRun(db, {
      epicReviewRunId: run.id,
      status: "completed",
      summary: "2 tickets reviewed; 1 major issue found",
      startedAt: "2026-03-08T10:00:00.000Z",
      completedAt: "2026-03-08T10:15:00.000Z",
    });

    expect(updated.status).toBe("completed");
    expect(updated.summary).toBe("2 tickets reviewed; 1 major issue found");
    expect(updated.startedAt).toBe("2026-03-08T10:00:00.000Z");
    expect(updated.completedAt).toBe("2026-03-08T10:15:00.000Z");
    expect(updated.selectedTicketIds).toEqual(["ticket-1"]);
  });

  it("updates per-ticket launch status independently", () => {
    seedProject();
    seedEpic();
    seedTicket("ticket-1");
    seedTicket("ticket-2");

    const run = createEpicReviewRun(db, {
      epicId: "epic-1",
      selectedTicketIds: ["ticket-1", "ticket-2"],
      launchMode: "focused-review",
    });

    const updatedLink = updateEpicReviewRunTicketLink(db, {
      epicReviewRunId: run.id,
      ticketId: "ticket-2",
      status: "failed",
      summary: "Terminal launch failed",
      completedAt: "2026-03-08T10:05:00.000Z",
    });

    expect(updatedLink.status).toBe("failed");
    expect(updatedLink.summary).toBe("Terminal launch failed");
    expect(updatedLink.completedAt).toBe("2026-03-08T10:05:00.000Z");

    const links = listEpicReviewRunTicketLinks(db, run.id);
    expect(links.find((link) => link.ticketId === "ticket-1")?.status).toBe("queued");
    expect(links.find((link) => link.ticketId === "ticket-2")?.status).toBe("failed");
  });

  it("finds the latest active run for a ticket and summarizes linked artifacts", () => {
    seedProject();
    seedEpic();
    seedTicket("ticket-1", "proj-1", "epic-1", "ai_review");

    const completedRun = createEpicReviewRun(db, {
      epicId: "epic-1",
      selectedTicketIds: ["ticket-1"],
      launchMode: "focused-review",
      status: "completed",
    });
    const activeRun = createEpicReviewRun(db, {
      epicId: "epic-1",
      selectedTicketIds: ["ticket-1"],
      launchMode: "focused-review",
      status: "running",
    });

    db.prepare(
      `INSERT INTO review_findings
       (id, ticket_id, iteration, agent, severity, category, description, epic_review_run_id, status, created_at)
       VALUES (?, ?, 1, 'code-reviewer', 'critical', 'logic', 'Broken state handling', ?, 'open', ?)`
    ).run("finding-open", "ticket-1", activeRun.id, "2026-03-09T05:05:00.000Z");
    db.prepare(
      `INSERT INTO review_findings
       (id, ticket_id, iteration, agent, severity, category, description, epic_review_run_id, status, fixed_at, created_at)
       VALUES (?, ?, 1, 'code-reviewer', 'minor', 'style', 'Cleanup copy', ?, 'fixed', ?, ?)`
    ).run(
      "finding-fixed",
      "ticket-1",
      activeRun.id,
      "2026-03-09T05:10:00.000Z",
      "2026-03-09T05:05:00.000Z"
    );
    db.prepare(
      `INSERT INTO demo_scripts (id, ticket_id, steps, epic_review_run_id, generated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      "demo-1",
      "ticket-1",
      JSON.stringify([
        {
          order: 1,
          description: "Open the ticket",
          expectedOutcome: "Ticket details render",
          type: "manual",
        },
      ]),
      activeRun.id,
      "2026-03-09T05:12:00.000Z"
    );

    expect(findLatestActiveEpicReviewRunIdForTicket(db, "ticket-1")).toBe(activeRun.id);
    expect(findLatestActiveEpicReviewRunIdForTicket(db, "missing-ticket")).toBeNull();

    const summary = getEpicReviewRunArtifactSummary(db, activeRun.id);
    expect(summary).toEqual({
      totalFindings: 2,
      fixedFindings: 1,
      openCritical: 1,
      openMajor: 0,
      openMinor: 0,
      openSuggestion: 0,
      demoGenerated: true,
    });
    expect(completedRun.id).not.toBe(activeRun.id);
  });
});
