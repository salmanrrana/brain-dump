import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../../../core/db.ts";
import { seedProject, seedTicket } from "../../../core/__tests__/test-helpers.ts";
import { registerReviewTool } from "../review.ts";

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

let db: Database.Database;
let tempDir: string;
let originalPath: string | undefined;
let originalHome: string | undefined;

beforeEach(() => {
  const result = createTestDatabase();
  db = result.db;
  tempDir = mkdtempSync(join(tmpdir(), "brain-dump-review-"));
  originalPath = process.env.PATH;
  originalHome = process.env.HOME;
  process.env.HOME = tempDir;
});

afterEach(() => {
  db.close();
  process.env.PATH = originalPath;
  process.env.HOME = originalHome;
  delete process.env.BRAIN_DUMP_FAKE_GH_BODY;
  delete process.env.BRAIN_DUMP_FAKE_GH_EDIT_BODY;
  delete process.env.BRAIN_DUMP_FAKE_GH_FAIL;
  rmSync(tempDir, { recursive: true, force: true });
});

function installFakeGh(initialBody: string): { editedBodyPath: string } {
  const binDir = join(tempDir, "bin");
  const ghPath = join(binDir, "gh");
  const bodyPath = join(tempDir, "pr-body.md");
  const editedBodyPath = join(tempDir, "edited-pr-body.md");

  mkdirSync(binDir, { recursive: true });

  writeFileSync(
    ghPath,
    [
      "#!/bin/sh",
      'if [ "$1" != "pr" ]; then',
      '  echo "unexpected command: $*" >&2',
      "  exit 1",
      "fi",
      'if [ "$2" = "view" ]; then',
      '  cat "$BRAIN_DUMP_FAKE_GH_BODY"',
      "  exit 0",
      "fi",
      'if [ "$2" = "edit" ]; then',
      '  if [ "$BRAIN_DUMP_FAKE_GH_FAIL" = "edit" ]; then',
      '    echo "edit failed" >&2',
      "    exit 1",
      "  fi",
      '  printf \'%s\' "$5" > "$BRAIN_DUMP_FAKE_GH_EDIT_BODY"',
      "  exit 0",
      "fi",
      'echo "unexpected subcommand: $*" >&2',
      "exit 1",
      "",
    ].join("\n"),
    "utf8"
  );
  chmodSync(ghPath, 0o755);
  writeFileSync(bodyPath, initialBody, "utf8");

  process.env.PATH = `${binDir}:${originalPath ?? ""}`;
  process.env.BRAIN_DUMP_FAKE_GH_BODY = bodyPath;
  process.env.BRAIN_DUMP_FAKE_GH_EDIT_BODY = editedBodyPath;

  return { editedBodyPath };
}

function seedAiReviewTicketWithPr(ticketId: string): void {
  seedProject(db, { id: "proj-1", path: tempDir });
  seedTicket(db, {
    id: ticketId,
    projectId: "proj-1",
    status: "ai_review",
    branchName: "feature/ticket-review-sync",
  });
  db.prepare("UPDATE tickets SET pr_number = ?, pr_url = ?, pr_status = ? WHERE id = ?").run(
    42,
    "https://github.com/openai/brain-dump/pull/42",
    "draft",
    ticketId
  );
}

describe("review tool generate-demo PR sync", () => {
  it("syncs demo steps into the linked PR body and reports the update", async () => {
    const { editedBodyPath } = installFakeGh(
      ["# Demo PR", "", "<!-- brain-dump:demo-steps -->", "_Placeholder_", "", "## Notes"].join(
        "\n"
      )
    );
    seedAiReviewTicketWithPr("ticket-1");

    const server = new McpServer({ name: "test", version: "1.0.0" });
    registerReviewTool(server, db);

    const handler = getToolHandler(server, "review");
    const result = (await handler(
      {
        action: "generate-demo",
        ticketId: "ticket-1",
        steps: [
          {
            order: 2,
            description: "Confirm the PR badge updates",
            expectedOutcome: "The linked PR badge is visible.",
            type: "visual",
          },
          {
            order: 1,
            description: "Generate the demo script",
            expectedOutcome: "The ticket moves to human_review.",
            type: "manual",
          },
        ],
      },
      {}
    )) as { content: Array<{ text: string }> };

    expect(result.content[0]?.text).toContain(
      "Demo script generated! Ticket moved to human_review."
    );
    expect(result.content[0]?.text).toContain("Updated PR #42 with 2 demo steps.");
    expect(readFileSync(editedBodyPath, "utf8")).toContain("1. Generate the demo script");
    expect(readFileSync(editedBodyPath, "utf8")).toContain(
      "Expected: The ticket moves to human_review."
    );

    const ticket = db.prepare("SELECT status FROM tickets WHERE id = ?").get("ticket-1") as {
      status: string;
    };
    expect(ticket.status).toBe("human_review");
  });

  it("keeps demo generation successful when PR sync fails and reports a warning", async () => {
    installFakeGh("# Demo PR\n\n<!-- brain-dump:demo-steps -->\n_Placeholder_");
    process.env.BRAIN_DUMP_FAKE_GH_FAIL = "edit";
    seedAiReviewTicketWithPr("ticket-1");

    const server = new McpServer({ name: "test", version: "1.0.0" });
    registerReviewTool(server, db);

    const handler = getToolHandler(server, "review");
    const result = (await handler(
      {
        action: "generate-demo",
        ticketId: "ticket-1",
        steps: [
          {
            order: 1,
            description: "Generate the demo script",
            expectedOutcome: "The ticket moves to human_review.",
            type: "manual",
          },
        ],
      },
      {}
    )) as { content: Array<{ text: string }> };

    expect(result.content[0]?.text).toContain(
      "Demo script generated! Ticket moved to human_review."
    );
    expect(result.content[0]?.text).toContain(
      "PR checklist sync warning: Failed to update the PR body: edit failed"
    );

    const ticket = db.prepare("SELECT status FROM tickets WHERE id = ?").get("ticket-1") as {
      status: string;
    };
    expect(ticket.status).toBe("human_review");
  });
});
