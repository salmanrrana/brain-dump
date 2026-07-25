import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../../../core/db.ts";
import { seedProject, seedTicket } from "../../../core/__tests__/test-helpers.ts";
import { registerReviewTool } from "../review.ts";
import { WORKFLOW_SCHEMA_VERSION } from "../../../core/workflow-schema.ts";

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
  delete process.env.BRAIN_DUMP_REVIEWER_AUTHOR;
  delete process.env.BRAIN_DUMP_REVIEWER_MODEL_PROVIDER;
  delete process.env.BRAIN_DUMP_REVIEWER_MODEL;
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

function writePrd(
  projectPath: string,
  ticketId: string,
  passes: boolean,
  verificationFailures?: string
): void {
  mkdirSync(join(projectPath, "plans"), { recursive: true });
  writeFileSync(
    join(projectPath, "plans", "prd.json"),
    JSON.stringify(
      {
        userStories: [
          {
            id: ticketId,
            title: "Ticket ready for demo",
            passes,
            ...(verificationFailures ? { verificationFailures } : {}),
          },
        ],
      },
      null,
      2
    )
  );
}

function readPrdStory(projectPath: string): {
  passes: boolean;
  status?: string;
  verificationFailures?: string;
} {
  const prd = JSON.parse(readFileSync(join(projectPath, "plans", "prd.json"), "utf8")) as {
    userStories: Array<{
      passes: boolean;
      status?: string;
      verificationFailures?: string;
    }>;
  };
  const story = prd.userStories[0];
  if (!story) throw new Error("Expected PRD story");
  return story;
}

function writeMalformedPrd(projectPath: string): void {
  mkdirSync(join(projectPath, "plans"), { recursive: true });
  writeFileSync(join(projectPath, "plans", "prd.json"), "{bad json");
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

function automatedStep(order = 1) {
  return {
    order,
    description: "Check the status API",
    expectedOutcome: "The status endpoint returns OK.",
    type: "automated" as const,
    app: { start: ["node", "server.js", "--port", "{port}"] },
    automation: {
      kind: "api" as const,
      request: { method: "GET", path: "/api/status" },
      assert: [{ type: "status" as const, expected: 200 }],
    },
  };
}

function commandStep(order = 1) {
  return {
    order,
    description: "Run focused validation",
    expectedOutcome: "The focused test command passes.",
    type: "automated" as const,
    automation: {
      kind: "command" as const,
      command: {
        argv: ["pnpm", "test", "--", "core/__tests__/review.test.ts"],
        cwd: ".",
        timeoutMs: 120000,
        expectedExitCode: 0,
      },
      assert: [{ type: "stdoutContains" as const, expected: "review" }],
    },
  };
}

function fileStep(order = 1) {
  return {
    order,
    description: "Inspect workflow docs",
    expectedOutcome: "The workflow docs mention AI verification.",
    type: "automated" as const,
    automation: {
      kind: "file" as const,
      path: "docs/universal-workflow.md",
      assert: [
        { type: "exists" as const },
        { type: "contains" as const, expected: "ai_verification" },
      ],
    },
  };
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
  it("advertises the workflow schema version to MCP clients", () => {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    registerReviewTool(server, db);
    const tools = (
      server as unknown as { _registeredTools: Record<string, { description: string }> }
    )._registeredTools;

    expect(tools.review?.description).toContain(`Workflow schema: ${WORKFLOW_SCHEMA_VERSION}`);
  });

  it("passes reviewer provenance through the canonical core review operation", async () => {
    seedProject(db, { id: "proj-1", path: tempDir });
    seedTicket(db, { id: "ticket-1", projectId: "proj-1", status: "ai_review" });
    process.env.BRAIN_DUMP_REVIEWER_AUTHOR = "claude";
    process.env.BRAIN_DUMP_REVIEWER_MODEL_PROVIDER = "anthropic";
    process.env.BRAIN_DUMP_REVIEWER_MODEL = "claude-opus-4-6";

    const server = new McpServer({ name: "test", version: "1.0.0" });
    registerReviewTool(server, db);
    await getToolHandler(server, "review")(
      {
        action: "submit-finding",
        ticketId: "ticket-1",
        agent: "code-reviewer",
        severity: "major",
        category: "type-safety",
        description: "Missing null check",
      },
      {}
    );

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

  it("syncs demo steps into the linked PR body and reports the update", async () => {
    const { editedBodyPath } = installFakeGh(
      ["# Demo PR", "", "<!-- brain-dump:demo-steps -->", "_Placeholder_", "", "## Notes"].join(
        "\n"
      )
    );
    seedAiReviewTicketWithPr("ticket-1");
    writePrd(tempDir, "ticket-1", false, "Old verification failure from a superseded demo");

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
            automation: {
              kind: "ui",
              route: "/tickets/ticket-1",
              assert: [{ type: "visible", selector: "[data-testid='pr-badge']" }],
              screenshot: true,
            },
          },
          automatedStep(),
        ],
      },
      {}
    )) as { content: Array<{ text: string }> };

    expect(result.content[0]?.text).toContain(
      "Demo script generated! Ticket moved to ai_verification."
    );
    expect(result.content[0]?.text).toContain(
      "PRD updated: Ticket ready for demo marked as not yet passing"
    );
    expect(result.content[0]?.text).toContain("Updated PR #42 with 2 demo steps.");
    expect(readPrdPasses(tempDir)).toBe(false);
    expect(readPrdStory(tempDir)).toEqual(
      expect.objectContaining({
        passes: false,
        status: "ai_verification",
      })
    );
    expect(readPrdStory(tempDir).verificationFailures).toBeUndefined();
    const editedBody = readFileSync(editedBodyPath, "utf8");
    expect(editedBody).toContain("1. Check the status API");
    expect(editedBody).toContain("Expected: The status endpoint returns OK.");

    const ticket = db.prepare("SELECT status FROM tickets WHERE id = ?").get("ticket-1") as {
      status: string;
    };
    expect(ticket.status).toBe("ai_verification");
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
        steps: [automatedStep()],
      },
      {}
    )) as { content: Array<{ text: string }> };

    expect(result.content[0]?.text).toContain(
      "Demo script generated! Ticket moved to ai_verification."
    );
    expect(result.content[0]?.text).toContain(
      "PR checklist sync warning: Failed to update the PR body: edit failed"
    );

    const ticket = db.prepare("SELECT status FROM tickets WHERE id = ?").get("ticket-1") as {
      status: string;
    };
    expect(ticket.status).toBe("ai_verification");
  });

  it("blocks demo generation when an existing scoped PRD is malformed", async () => {
    seedAiReviewTicketWithPr("ticket-1");
    writeMalformedPrd(tempDir);

    const server = new McpServer({ name: "test", version: "1.0.0" });
    registerReviewTool(server, db);

    const handler = getToolHandler(server, "review");
    const result = (await handler(
      {
        action: "generate-demo",
        ticketId: "ticket-1",
        steps: [automatedStep()],
      },
      {}
    )) as { content: Array<{ text: string }>; isError?: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Cannot generate demo because PRD sync failed");

    const ticket = db.prepare("SELECT status FROM tickets WHERE id = ?").get("ticket-1") as {
      status: string;
    };
    expect(ticket.status).toBe("ai_review");
  });

  it("rejects API automation assertions with missing expected values", async () => {
    seedProject(db, { id: "proj-1", path: tempDir });
    seedTicket(db, { id: "ticket-1", projectId: "proj-1", status: "ai_review" });

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
            description: "Check the status API",
            expectedOutcome: "The status endpoint returns OK.",
            type: "automated",
            automation: {
              kind: "api",
              request: { method: "GET", path: "/api/status" },
              assert: [{ type: "status" }],
            },
          },
        ],
      },
      {}
    )) as { content: Array<{ text: string }>; isError?: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("API automation assertion at index 0 is invalid");
  });

  it("accepts command and file automation specs", async () => {
    seedProject(db, { id: "proj-1", path: tempDir });
    seedTicket(db, { id: "ticket-1", projectId: "proj-1", status: "ai_review" });
    // Content assertions now require the target file to exist in the project.
    mkdirSync(join(tempDir, "docs"), { recursive: true });
    writeFileSync(
      join(tempDir, "docs", "universal-workflow.md"),
      "Tickets move through ai_verification before done."
    );

    const server = new McpServer({ name: "test", version: "1.0.0" });
    registerReviewTool(server, db);

    const handler = getToolHandler(server, "review");
    const result = (await handler(
      {
        action: "generate-demo",
        ticketId: "ticket-1",
        steps: [commandStep(1), fileStep(2)],
      },
      {}
    )) as { content: Array<{ text: string }>; isError?: boolean };

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain(
      "Demo script generated! Ticket moved to ai_verification."
    );
    const row = db
      .prepare("SELECT steps FROM demo_scripts WHERE ticket_id = ?")
      .get("ticket-1") as {
      steps: string;
    };
    const steps = JSON.parse(row.steps) as Array<{ automation: { kind: string } }>;
    expect(steps.map((step) => step.automation.kind)).toEqual(["command", "file"]);
  });

  it("rejects unsafe command automation through the MCP schema and core validation", async () => {
    seedProject(db, { id: "proj-1", path: tempDir });
    seedTicket(db, { id: "ticket-1", projectId: "proj-1", status: "ai_review" });

    const server = new McpServer({ name: "test", version: "1.0.0" });
    registerReviewTool(server, db);

    const handler = getToolHandler(server, "review");
    const result = (await handler(
      {
        action: "generate-demo",
        ticketId: "ticket-1",
        steps: [
          {
            ...commandStep(),
            automation: {
              ...commandStep().automation,
              command: {
                argv: ["pnpm test -- core/__tests__/review.test.ts"],
                timeoutMs: 120000,
                expectedExitCode: 0,
              },
            },
          },
        ],
      },
      {}
    )) as { content: Array<{ text: string }>; isError?: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(
      "must be argv array data, not a shell command string"
    );
  });

  it("blocks legacy handoff repair before mutation when the scoped PRD is malformed", async () => {
    seedProject(db, { id: "proj-1", path: tempDir });
    seedTicket(db, { id: "ticket-1", projectId: "proj-1", status: "human_review" });
    writeMalformedPrd(tempDir);

    const server = new McpServer({ name: "test", version: "1.0.0" });
    registerReviewTool(server, db);

    const handler = getToolHandler(server, "review");
    const result = (await handler(
      {
        action: "repair-legacy-handoff",
        ticketId: "ticket-1",
      },
      {}
    )) as { content: Array<{ text: string }>; isError?: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(
      "Cannot repair legacy handoff because PRD sync failed"
    );
    const ticket = db.prepare("SELECT status FROM tickets WHERE id = ?").get("ticket-1") as {
      status: string;
    };
    expect(ticket.status).toBe("human_review");
  });

  it("blocks legacy handoff repair before PRD mutation when the ticket is not repairable", async () => {
    seedProject(db, { id: "proj-1", path: tempDir });
    seedTicket(db, { id: "ticket-1", projectId: "proj-1", status: "ai_review" });
    writePrd(tempDir, "ticket-1", true);

    const server = new McpServer({ name: "test", version: "1.0.0" });
    registerReviewTool(server, db);

    const handler = getToolHandler(server, "review");
    const result = (await handler(
      {
        action: "repair-legacy-handoff",
        ticketId: "ticket-1",
      },
      {}
    )) as { content: Array<{ text: string }>; isError?: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("must be 'human_review'");
    expect(readPrdPasses(tempDir)).toBe(true);
  });
});
