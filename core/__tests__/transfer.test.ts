import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import { gatherEpicExportData, gatherProjectExportData, importData } from "../transfer.ts";
import { EpicNotFoundError, ProjectNotFoundError } from "../errors.ts";
import type { BrainDumpManifest } from "../transfer-types.ts";
import { MANIFEST_VERSION } from "../transfer-types.ts";

let db: Database.Database;

function seedProject(id = "proj-1", name = "Test Project") {
  db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    name,
    `/tmp/${id}`,
    new Date().toISOString()
  );
  return id;
}

function seedEpic(id = "epic-1", projectId = "proj-1", title = "Test Epic") {
  db.prepare(
    "INSERT INTO epics (id, title, description, project_id, color, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, title, "Epic description", projectId, "#ff0000", new Date().toISOString());
  return id;
}

function seedTicket(
  id: string,
  projectId: string,
  epicId: string | null,
  opts: { status?: string; tags?: string[]; position?: number; title?: string } = {}
) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tickets (id, title, description, status, priority, position, project_id, epic_id,
     tags, subtasks, is_blocked, blocked_reason, attachments, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'medium', ?, ?, ?, ?, '[]', 0, NULL, '[]', ?, ?)`
  ).run(
    id,
    opts.title ?? `Ticket ${id}`,
    "Description for " + id,
    opts.status ?? "backlog",
    opts.position ?? 1,
    projectId,
    epicId,
    JSON.stringify(opts.tags ?? []),
    now,
    now
  );
  return id;
}

function seedComment(id: string, ticketId: string) {
  db.prepare(
    "INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, ticketId, `Comment ${id}`, "claude", "comment", new Date().toISOString());
  return id;
}

function seedFinding(id: string, ticketId: string) {
  db.prepare(
    `INSERT INTO review_findings (id, ticket_id, iteration, agent, severity, category, description, status, created_at)
     VALUES (?, ?, 1, 'code-reviewer', 'minor', 'style', 'Test finding', 'open', ?)`
  ).run(id, ticketId, new Date().toISOString());
  return id;
}

function seedDemoScript(id: string, ticketId: string) {
  db.prepare(
    `INSERT INTO demo_scripts (id, ticket_id, steps, generated_at)
     VALUES (?, ?, ?, ?)`
  ).run(id, ticketId, JSON.stringify([{ order: 1, description: "Test", expectedOutcome: "Pass", type: "manual" }]), new Date().toISOString());
  return id;
}

function buildMinimalManifest(overrides: Partial<BrainDumpManifest> = {}): BrainDumpManifest {
  return {
    version: MANIFEST_VERSION,
    exportType: "epic",
    exportedAt: new Date().toISOString(),
    exportedBy: "testuser",
    appVersion: "1.0.0",
    sourceProject: { name: "Source Project" },
    epics: [
      {
        id: "exp-epic-1",
        title: "Exported Epic",
        description: "Desc",
        color: "#00ff00",
        createdAt: new Date().toISOString(),
      },
    ],
    tickets: [
      {
        id: "exp-ticket-1",
        title: "Exported Ticket",
        description: "Ticket desc",
        status: "in_progress",
        priority: "high",
        position: 1,
        epicId: "exp-epic-1",
        tags: ["original-tag"],
        subtasks: [],
        isBlocked: false,
        blockedReason: null,
        attachments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
      },
    ],
    comments: [
      {
        id: "exp-comment-1",
        ticketId: "exp-ticket-1",
        content: "A comment",
        author: "claude",
        type: "comment",
        createdAt: new Date().toISOString(),
      },
    ],
    reviewFindings: [],
    demoScripts: [],
    workflowStates: [],
    epicWorkflowStates: [],
    attachmentFiles: [],
    ...overrides,
  };
}

function doImport(
  manifest: BrainDumpManifest,
  targetProjectId = "proj-target",
  opts: { resetStatuses?: boolean; conflictResolution?: "create-new" | "replace" | "merge" } = {}
): ReturnType<typeof importData> {
  return importData({
    db,
    manifest,
    attachmentBuffers: new Map(),
    targetProjectId,
    resetStatuses: opts.resetStatuses ?? false,
    conflictResolution: opts.conflictResolution ?? "create-new",
  });
}

beforeEach(() => {
  const result = createTestDatabase();
  db = result.db;
});

// ============================================
// Export: gatherEpicExportData
// ============================================

describe("gatherEpicExportData", () => {
  it("exports epic with tickets, comments, and findings", () => {
    seedProject();
    seedEpic("epic-1", "proj-1", "My Epic");
    seedTicket("t-1", "proj-1", "epic-1");
    seedTicket("t-2", "proj-1", "epic-1");
    seedComment("c-1", "t-1");
    seedFinding("f-1", "t-2");
    seedDemoScript("d-1", "t-1");

    const result = gatherEpicExportData(db, "epic-1");

    expect(result.manifest.exportType).toBe("epic");
    expect(result.manifest.sourceProject.name).toBe("Test Project");
    expect(result.manifest.epics).toHaveLength(1);
    expect(result.manifest.epics[0]!.title).toBe("My Epic");
    expect(result.manifest.tickets).toHaveLength(2);
    expect(result.manifest.comments).toHaveLength(1);
    expect(result.manifest.reviewFindings).toHaveLength(1);
    expect(result.manifest.demoScripts).toHaveLength(1);
  });

  it("throws EpicNotFoundError for non-existent epic", () => {
    expect(() => gatherEpicExportData(db, "nonexistent")).toThrow(EpicNotFoundError);
  });

  it("exports empty epic with no tickets", () => {
    seedProject();
    seedEpic("epic-empty", "proj-1", "Empty Epic");

    const result = gatherEpicExportData(db, "epic-empty");

    expect(result.manifest.tickets).toHaveLength(0);
    expect(result.manifest.comments).toHaveLength(0);
    expect(result.manifest.epics).toHaveLength(1);
  });

  it("excludes git/PR fields from exported tickets", () => {
    seedProject();
    seedEpic();
    // Insert ticket with git fields directly
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tickets (id, title, status, priority, position, project_id, epic_id,
       tags, subtasks, is_blocked, attachments, branch_name, pr_number, pr_url, pr_status,
       created_at, updated_at)
       VALUES (?, ?, 'backlog', 'medium', 1, 'proj-1', 'epic-1',
       '[]', '[]', 0, '[]', 'feature/test', 42, 'https://github.com/pr/42', 'open', ?, ?)`
    ).run("t-git", "Git Ticket", now, now);

    const result = gatherEpicExportData(db, "epic-1");
    const ticket = result.manifest.tickets[0]!;

    // These fields should NOT be in the exported ticket
    expect(ticket).not.toHaveProperty("branchName");
    expect(ticket).not.toHaveProperty("prNumber");
    expect(ticket).not.toHaveProperty("prUrl");
    expect(ticket).not.toHaveProperty("prStatus");
  });
});

// ============================================
// Export: gatherProjectExportData
// ============================================

describe("gatherProjectExportData", () => {
  it("exports project with multiple epics and orphan tickets", () => {
    seedProject("proj-1", "Multi Epic Project");
    seedEpic("epic-1", "proj-1", "Epic A");
    seedEpic("epic-2", "proj-1", "Epic B");
    seedTicket("t-1", "proj-1", "epic-1");
    seedTicket("t-2", "proj-1", "epic-2");
    seedTicket("t-orphan", "proj-1", null); // orphan ticket

    const result = gatherProjectExportData(db, "proj-1");

    expect(result.manifest.exportType).toBe("project");
    expect(result.manifest.epics).toHaveLength(2);
    expect(result.manifest.tickets).toHaveLength(3);
  });

  it("throws ProjectNotFoundError for non-existent project", () => {
    expect(() => gatherProjectExportData(db, "nonexistent")).toThrow(ProjectNotFoundError);
  });
});

// ============================================
// Import: basic
// ============================================

describe("importData - basic", () => {
  it("creates all entities with new IDs in the target project", () => {
    seedProject("proj-target", "Target Project");
    const manifest = buildMinimalManifest();

    const result = doImport(manifest);

    expect(result.epicCount).toBe(1);
    expect(result.ticketCount).toBe(1);
    // 1 original comment + 1 provenance comment
    expect(result.commentCount).toBe(2);

    // Verify IDs are remapped (not the same as source)
    expect(result.idMap["exp-epic-1"]).toBeDefined();
    expect(result.idMap["exp-epic-1"]).not.toBe("exp-epic-1");
    expect(result.idMap["exp-ticket-1"]).toBeDefined();
    expect(result.idMap["exp-ticket-1"]).not.toBe("exp-ticket-1");
  });

  it("throws ProjectNotFoundError for invalid target project", () => {
    const manifest = buildMinimalManifest();
    expect(() => doImport(manifest, "nonexistent")).toThrow(ProjectNotFoundError);
  });

  it("adds shared-by tag to every imported ticket", () => {
    seedProject("proj-target", "Target");
    const manifest = buildMinimalManifest();

    const result = doImport(manifest);
    const newTicketId = result.idMap["exp-ticket-1"]!;

    const row = db.prepare("SELECT tags FROM tickets WHERE id = ?").get(newTicketId) as {
      tags: string;
    };
    const tags = JSON.parse(row.tags) as string[];
    expect(tags).toContain("shared-by:testuser");
    expect(tags).toContain("original-tag");
  });

  it("adds provenance comment to every imported ticket", () => {
    seedProject("proj-target", "Target");
    const manifest = buildMinimalManifest();

    const result = doImport(manifest);
    const newTicketId = result.idMap["exp-ticket-1"]!;

    const comments = db
      .prepare("SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at")
      .all(newTicketId) as Array<{ content: string; author: string }>;

    const provenance = comments.find((c) => c.author === "brain-dump");
    expect(provenance).toBeDefined();
    expect(provenance!.content).toContain("Source Project");
    expect(provenance!.content).toContain("testuser");
  });

  it("resets all ticket statuses to backlog when resetStatuses is true", () => {
    seedProject("proj-target", "Target");
    const manifest = buildMinimalManifest({
      tickets: [
        {
          id: "t-done",
          title: "Done Ticket",
          description: null,
          status: "done",
          priority: "high",
          position: 1,
          epicId: "exp-epic-1",
          tags: [],
          subtasks: [],
          isBlocked: false,
          blockedReason: null,
          attachments: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      ],
    });

    const result = doImport(manifest, "proj-target", { resetStatuses: true });
    const newTicketId = result.idMap["t-done"]!;

    const row = db.prepare("SELECT status FROM tickets WHERE id = ?").get(newTicketId) as {
      status: string;
    };
    expect(row.status).toBe("backlog");
  });

  it("preserves original status when resetStatuses is false", () => {
    seedProject("proj-target", "Target");
    const manifest = buildMinimalManifest();

    const result = doImport(manifest, "proj-target", { resetStatuses: false });
    const newTicketId = result.idMap["exp-ticket-1"]!;

    const row = db.prepare("SELECT status FROM tickets WHERE id = ?").get(newTicketId) as {
      status: string;
    };
    expect(row.status).toBe("in_progress");
  });

  it("positions imported tickets after existing ones", () => {
    seedProject("proj-target", "Target");
    seedEpic("existing-epic", "proj-target", "Existing");
    seedTicket("existing-t", "proj-target", "existing-epic", { position: 100 });

    const manifest = buildMinimalManifest();
    const result = doImport(manifest);
    const newTicketId = result.idMap["exp-ticket-1"]!;

    const row = db.prepare("SELECT position FROM tickets WHERE id = ?").get(newTicketId) as {
      position: number;
    };
    expect(row.position).toBeGreaterThan(100);
  });
});

// ============================================
// Import: conflict resolution
// ============================================

describe("importData - conflict resolution", () => {
  it("create-new: creates a separate epic when name conflicts", () => {
    seedProject("proj-target", "Target");
    seedEpic("existing-epic", "proj-target", "Exported Epic"); // same title as manifest

    const manifest = buildMinimalManifest();
    doImport(manifest, "proj-target", { conflictResolution: "create-new" });

    // Should have 2 epics now
    const epics = db
      .prepare("SELECT * FROM epics WHERE project_id = ?")
      .all("proj-target") as Array<{ id: string; title: string }>;
    expect(epics).toHaveLength(2);

    // New epic should have "(from testuser)" suffix
    const newEpic = epics.find((e) => e.id !== "existing-epic");
    expect(newEpic!.title).toContain("(from testuser)");
  });

  it("replace: removes old tickets and inserts new ones", () => {
    seedProject("proj-target", "Target");
    seedEpic("existing-epic", "proj-target", "Exported Epic");
    seedTicket("old-ticket", "proj-target", "existing-epic", { title: "Old Ticket" });

    const manifest = buildMinimalManifest();
    const result = doImport(manifest, "proj-target", { conflictResolution: "replace" });

    // Old ticket should be gone
    const oldTicket = db.prepare("SELECT id FROM tickets WHERE id = 'old-ticket'").get();
    expect(oldTicket).toBeUndefined();

    // New ticket should exist
    expect(result.ticketCount).toBe(1);
    const newTicketId = result.idMap["exp-ticket-1"]!;
    const newTicket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(newTicketId);
    expect(newTicket).toBeDefined();
  });

  it("merge: updates existing ticket with same title, creates new ones", () => {
    seedProject("proj-target", "Target");
    seedEpic("existing-epic", "proj-target", "Exported Epic");
    seedTicket("existing-t", "proj-target", "existing-epic", { title: "Exported Ticket" });

    const manifest = buildMinimalManifest();
    const result = doImport(manifest, "proj-target", { conflictResolution: "merge" });

    // The existing ticket should have been updated (reused ID)
    expect(result.idMap["exp-ticket-1"]).toBe("existing-t");

    // Verify the ticket was updated with import data
    const row = db.prepare("SELECT description, tags FROM tickets WHERE id = 'existing-t'").get() as {
      description: string;
      tags: string;
    };
    expect(row.description).toBe("Ticket desc");
    const tags = JSON.parse(row.tags) as string[];
    expect(tags).toContain("shared-by:testuser");
  });

  it("merge: creates new tickets when no title match exists", () => {
    seedProject("proj-target", "Target");
    seedEpic("existing-epic", "proj-target", "Exported Epic");
    seedTicket("existing-t", "proj-target", "existing-epic", { title: "Different Title" });

    const manifest = buildMinimalManifest();
    const result = doImport(manifest, "proj-target", { conflictResolution: "merge" });

    // exp-ticket-1 should get a new ID (not reuse "existing-t")
    expect(result.idMap["exp-ticket-1"]).not.toBe("existing-t");

    // Should now have 2 tickets
    const tickets = db
      .prepare("SELECT id FROM tickets WHERE project_id = 'proj-target'")
      .all();
    expect(tickets).toHaveLength(2);
  });
});

// ============================================
// Import: review findings and demo scripts
// ============================================

describe("importData - review findings and demo scripts", () => {
  it("imports review findings with remapped ticket IDs", () => {
    seedProject("proj-target", "Target");
    const manifest = buildMinimalManifest({
      reviewFindings: [
        {
          id: "exp-finding-1",
          ticketId: "exp-ticket-1",
          iteration: 1,
          agent: "code-reviewer",
          severity: "major",
          category: "bug",
          description: "Found a bug",
          filePath: "src/foo.ts",
          lineNumber: 42,
          suggestedFix: "Fix it",
          status: "open",
          fixedAt: null,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const result = doImport(manifest);
    expect(result.findingCount).toBe(1);

    const newFindingId = result.idMap["exp-finding-1"]!;
    const finding = db.prepare("SELECT * FROM review_findings WHERE id = ?").get(newFindingId) as {
      ticket_id: string;
      description: string;
    };
    expect(finding.ticket_id).toBe(result.idMap["exp-ticket-1"]);
    expect(finding.description).toBe("Found a bug");
  });

  it("imports demo scripts with remapped ticket IDs", () => {
    seedProject("proj-target", "Target");
    const manifest = buildMinimalManifest({
      demoScripts: [
        {
          id: "exp-demo-1",
          ticketId: "exp-ticket-1",
          steps: [{ order: 1, description: "Step 1", expectedOutcome: "OK", type: "manual" as const }],
          generatedAt: new Date().toISOString(),
          completedAt: null,
          feedback: null,
          passed: null,
        },
      ],
    });

    const result = doImport(manifest);
    expect(result.demoScriptCount).toBe(1);

    const newDemoId = result.idMap["exp-demo-1"]!;
    const demo = db.prepare("SELECT * FROM demo_scripts WHERE id = ?").get(newDemoId) as {
      ticket_id: string;
      steps: string;
    };
    expect(demo.ticket_id).toBe(result.idMap["exp-ticket-1"]);
    expect(JSON.parse(demo.steps)).toHaveLength(1);
  });
});

// ============================================
// Round-trip: export then import
// ============================================

describe("export → import round-trip", () => {
  it("exports an epic and imports into a different project with all data intact", () => {
    // Set up source project
    seedProject("proj-source", "Source");
    seedEpic("epic-src", "proj-source", "Round Trip Epic");
    seedTicket("t-src-1", "proj-source", "epic-src", { tags: ["feature"], status: "done" });
    seedTicket("t-src-2", "proj-source", "epic-src", { tags: ["bug"], status: "in_progress" });
    seedComment("c-src-1", "t-src-1");
    seedComment("c-src-2", "t-src-2");
    seedFinding("f-src-1", "t-src-1");
    seedDemoScript("d-src-1", "t-src-2");

    // Export
    const exportResult = gatherEpicExportData(db, "epic-src");

    // Set up target project
    seedProject("proj-target", "Target");

    // Import
    const importResult = importData({
      db,
      manifest: exportResult.manifest,
      attachmentBuffers: exportResult.attachmentBuffers,
      targetProjectId: "proj-target",
      resetStatuses: false,
      conflictResolution: "create-new",
    });

    expect(importResult.epicCount).toBe(1);
    expect(importResult.ticketCount).toBe(2);
    // 2 original comments + 2 provenance comments
    expect(importResult.commentCount).toBe(4);
    expect(importResult.findingCount).toBe(1);
    expect(importResult.demoScriptCount).toBe(1);

    // Verify tickets are in the target project
    const targetTickets = db
      .prepare("SELECT * FROM tickets WHERE project_id = 'proj-target'")
      .all() as Array<{ id: string; status: string; tags: string }>;
    expect(targetTickets).toHaveLength(2);

    // Status preserved
    const doneTicket = targetTickets.find((t) => t.id === importResult.idMap["t-src-1"]);
    expect(doneTicket!.status).toBe("done");

    // shared-by tag added
    for (const t of targetTickets) {
      const tags = JSON.parse(t.tags) as string[];
      expect(tags.some((tag) => tag.startsWith("shared-by:"))).toBe(true);
    }
  });

  it("round-trips a project export with multiple epics", () => {
    seedProject("proj-source", "Source");
    seedEpic("e-1", "proj-source", "Epic One");
    seedEpic("e-2", "proj-source", "Epic Two");
    seedTicket("t-1", "proj-source", "e-1");
    seedTicket("t-2", "proj-source", "e-2");
    seedTicket("t-3", "proj-source", null); // orphan

    const exportResult = gatherProjectExportData(db, "proj-source");
    seedProject("proj-target", "Target");

    const importResult = importData({
      db,
      manifest: exportResult.manifest,
      attachmentBuffers: exportResult.attachmentBuffers,
      targetProjectId: "proj-target",
      resetStatuses: false,
      conflictResolution: "create-new",
    });

    expect(importResult.epicCount).toBe(2);
    expect(importResult.ticketCount).toBe(3);
  });
});
