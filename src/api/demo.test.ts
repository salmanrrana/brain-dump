import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
            title: "Ticket in AI verification",
            passes,
          },
        ],
      },
      null,
      2
    )
  );
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

function seedVerificationTicket(ticketId: string): void {
  seedProject(db, { id: "proj-1", path: projectPath });
  seedTicket(db, {
    id: ticketId,
    projectId: "proj-1",
    status: "ai_verification",
  });
  db.prepare(
    "INSERT INTO demo_scripts (id, ticket_id, steps, generated_at) VALUES (?, ?, ?, ?)"
  ).run(
    "demo-1",
    ticketId,
    JSON.stringify([
      {
        order: 1,
        description: "Run verification",
        expectedOutcome: "The runner records evidence.",
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

describe("demo feedback API", () => {
  it("rejects retired manual feedback without mutating PRD or ticket status", async () => {
    const ticketId = "ticket-1";
    seedVerificationTicket(ticketId);
    writePrd(ticketId, false);

    await expect(
      submitDemoFeedbackForDatabase(db, {
        ticketId,
        passed: true,
        feedback: "Looks good.",
      })
    ).rejects.toThrow("Manual demo feedback has been retired");

    expect(readTicketStatus(ticketId)).toBe("ai_verification");
    expect(readPrdPasses()).toBe(false);
  });
});
