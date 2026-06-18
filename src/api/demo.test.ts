import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedProject, seedTicket } from "../../core/__tests__/test-helpers.ts";
import { createTestDatabase } from "../../core/db.ts";
import { submitDemoFeedbackForDatabase } from "./demo-feedback";

let db: Database.Database;
let projectPath: string;

beforeEach(() => {
  const result = createTestDatabase();
  db = result.db;
  projectPath = mkdtempSync(join(tmpdir(), "brain-dump-demo-api-"));
});

afterEach(() => {
  db.close();
  rmSync(projectPath, { recursive: true, force: true });
});

function writePrd(ticketId: string, passes: boolean): void {
  mkdirSync(join(projectPath, "plans"), { recursive: true });
  writeFileSync(
    join(projectPath, "plans", "prd.json"),
    JSON.stringify(
      {
        userStories: [
          {
            id: ticketId,
            title: "Ticket in human review",
            passes,
          },
        ],
      },
      null,
      2
    )
  );
}

function writeMalformedPrd(): void {
  mkdirSync(join(projectPath, "plans"), { recursive: true });
  writeFileSync(join(projectPath, "plans", "prd.json"), "{bad json");
}

function readPrdPasses(): boolean {
  const prd = JSON.parse(readFileSync(join(projectPath, "plans", "prd.json"), "utf8")) as {
    userStories: Array<{ passes: boolean }>;
  };
  const story = prd.userStories[0];
  if (!story) {
    throw new Error("Expected PRD story");
  }
  return story.passes;
}

function seedHumanReviewTicket(ticketId: string): void {
  seedProject(db, { id: "proj-1", path: projectPath });
  seedTicket(db, {
    id: ticketId,
    projectId: "proj-1",
    status: "human_review",
  });
  db.prepare(
    "INSERT INTO demo_scripts (id, ticket_id, steps, generated_at) VALUES (?, ?, ?, ?)"
  ).run(
    "demo-1",
    ticketId,
    JSON.stringify([
      {
        order: 1,
        description: "Review the demo",
        expectedOutcome: "The reviewer can request changes.",
        type: "manual",
      },
    ]),
    new Date().toISOString()
  );
}

function readTicketStatus(ticketId: string): string {
  const ticket = db.prepare("SELECT status FROM tickets WHERE id = ?").get(ticketId) as
    | { status: string }
    | undefined;
  if (!ticket) {
    throw new Error(`Expected ticket ${ticketId}`);
  }
  return ticket.status;
}

describe("demo feedback API PRD sync", () => {
  it("resets the PRD pass marker when browser feedback rejects a demo", async () => {
    const ticketId = "ticket-1";
    seedHumanReviewTicket(ticketId);
    writePrd(ticketId, true);

    const result = await submitDemoFeedbackForDatabase(db, {
      ticketId,
      passed: false,
      feedback: "The public copy still needs one correction.",
    });

    expect(result.prdSync).toMatchObject({
      success: true,
      applied: true,
      required: true,
      message: "PRD updated: Ticket in human review marked as not yet passing",
    });
    expect(result.ticketStatus).toBe("ready");
    expect(readPrdPasses()).toBe(false);
  });

  it("allows rejected browser feedback when the current scoped PRD is absent", async () => {
    const ticketId = "ticket-1";
    seedHumanReviewTicket(ticketId);

    const result = await submitDemoFeedbackForDatabase(db, {
      ticketId,
      passed: false,
      feedback: "The public copy still needs one correction.",
    });

    expect(result.ticketStatus).toBe("ready");
    expect(result.prdSync).toMatchObject({
      success: true,
      applied: false,
      required: false,
    });
  });

  it("blocks rejected browser feedback when an owning PRD cannot be reset", async () => {
    const ticketId = "ticket-1";
    seedHumanReviewTicket(ticketId);
    writePrd(ticketId, true);
    chmodSync(join(projectPath, "plans", "prd.json"), 0o444);

    await expect(
      submitDemoFeedbackForDatabase(db, {
        ticketId,
        passed: false,
        feedback: "The public copy still needs one correction.",
      })
    ).rejects.toThrow("Cannot submit demo feedback because PRD sync failed");

    expect(readTicketStatus(ticketId)).toBe("human_review");
    expect(readPrdPasses()).toBe(true);
  });

  it("blocks rejected browser feedback when an existing scoped PRD is malformed", async () => {
    const ticketId = "ticket-1";
    seedHumanReviewTicket(ticketId);
    writeMalformedPrd();

    await expect(
      submitDemoFeedbackForDatabase(db, {
        ticketId,
        passed: false,
        feedback: "The public copy still needs one correction.",
      })
    ).rejects.toThrow("Cannot submit demo feedback because PRD sync failed");

    expect(readTicketStatus(ticketId)).toBe("human_review");
  });

  it("allows approved browser feedback when an existing scoped PRD is malformed", async () => {
    const ticketId = "ticket-1";
    seedHumanReviewTicket(ticketId);
    writeMalformedPrd();

    const result = await submitDemoFeedbackForDatabase(db, {
      ticketId,
      passed: true,
      feedback: "Looks good.",
    });

    expect(result.ticketStatus).toBe("done");
    expect(result.prdSync).toMatchObject({
      success: false,
      required: true,
    });
    expect(readTicketStatus(ticketId)).toBe("done");
  });

  it("does not mutate the PRD pass marker when core feedback validation fails", async () => {
    const ticketId = "ticket-1";
    seedHumanReviewTicket(ticketId);
    writePrd(ticketId, false);
    db.prepare("UPDATE demo_scripts SET steps = ? WHERE ticket_id = ?").run("{bad json", ticketId);

    await expect(
      submitDemoFeedbackForDatabase(db, {
        ticketId,
        passed: true,
        feedback: "Looks good.",
      })
    ).rejects.toThrow("corrupted step data");

    expect(readTicketStatus(ticketId)).toBe("human_review");
    expect(readPrdPasses()).toBe(false);
  });

  it("does not mutate the PRD pass marker when demo steps are not an array", async () => {
    const ticketId = "ticket-1";
    seedHumanReviewTicket(ticketId);
    writePrd(ticketId, false);
    db.prepare("UPDATE demo_scripts SET steps = ? WHERE ticket_id = ?").run("{}", ticketId);

    await expect(
      submitDemoFeedbackForDatabase(db, {
        ticketId,
        passed: true,
        feedback: "Looks good.",
      })
    ).rejects.toThrow("invalid step data");

    expect(readTicketStatus(ticketId)).toBe("human_review");
    expect(readPrdPasses()).toBe(false);
  });
});
