import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../../../core/db.ts";
import { seedProject, seedTicket } from "../../../core/__tests__/test-helpers.ts";
import { registerWorkflowTool } from "../workflow.ts";

function getToolHandler(
  server: McpServer,
  name: string
): (params: unknown, extra: unknown) => Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = (server as any)._registeredTools as Record<
    string,
    { handler: (...args: unknown[]) => Promise<unknown> }
  >;
  const tool = tools[name];
  if (!tool) {
    throw new Error(`Tool "${name}" not found`);
  }
  return tool.handler;
}

function writePrd(projectPath: string, ticketId: string, passes: boolean): void {
  mkdirSync(join(projectPath, "plans"), { recursive: true });
  writeFileSync(
    join(projectPath, "plans", "prd.json"),
    JSON.stringify(
      {
        userStories: [
          {
            id: ticketId,
            title: "Ticket under review",
            passes,
          },
        ],
      },
      null,
      2
    )
  );
}

function readPrdPasses(projectPath: string): boolean {
  const prd = JSON.parse(readFileSync(join(projectPath, "plans", "prd.json"), "utf8")) as {
    userStories: Array<{ passes: boolean }>;
  };
  const story = prd.userStories[0];
  if (!story) {
    throw new Error("Expected PRD story");
  }
  return story.passes;
}

let db: Database.Database;
let tempDir: string;

beforeEach(() => {
  const result = createTestDatabase();
  db = result.db;
  tempDir = mkdtempSync(join(tmpdir(), "brain-dump-workflow-prd-"));
});

afterEach(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("workflow complete-work PRD sync", () => {
  it("keeps the scoped PRD item incomplete while the ticket is in ai_review", async () => {
    const ticketId = "ticket-1";
    seedProject(db, { id: "proj-1", path: tempDir });
    seedTicket(db, { id: ticketId, projectId: "proj-1", status: "in_progress" });
    writePrd(tempDir, ticketId, true);

    db.prepare(
      "INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      randomUUID(),
      ticketId,
      "Validation: pnpm check passed.",
      "codex",
      "test_report",
      new Date(Date.now() + 1000).toISOString()
    );

    const server = new McpServer({ name: "test", version: "1.0.0" });
    registerWorkflowTool(server, db, () => "codex");

    const handler = getToolHandler(server, "workflow");
    const result = (await handler(
      {
        action: "complete-work",
        ticketId,
        summary: "Implemented the scoped change.",
      },
      {}
    )) as { content: Array<{ text: string }> };

    expect(result.content[0]?.text).toContain("Status:** ai_review");
    expect(readPrdPasses(tempDir)).toBe(false);
  });
});
