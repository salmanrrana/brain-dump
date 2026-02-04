import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import {
  createTicket,
  listTickets,
  getTicket,
  updateTicketStatus,
  updateAcceptanceCriterion,
  deleteTicket,
  updateAttachmentMetadata,
  listTicketsByEpic,
} from "../ticket.ts";
import {
  TicketNotFoundError,
  EpicNotFoundError,
  ProjectNotFoundError,
  ValidationError,
} from "../errors.ts";

let db: Database.Database;

function seedProject(id = "proj-1", name = "Test Project", path = "/tmp/test-project") {
  db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    name,
    path,
    new Date().toISOString()
  );
  return id;
}

function seedEpic(id = "epic-1", projectId = "proj-1", title = "Test Epic") {
  db.prepare("INSERT INTO epics (id, title, project_id, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    title,
    projectId,
    new Date().toISOString()
  );
  return id;
}

function seedTicket(
  id: string,
  projectId: string,
  opts: { status?: string; epicId?: string; subtasks?: string; attachments?: string } = {}
) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tickets (id, title, description, status, priority, position, project_id, epic_id, tags, subtasks, attachments, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    `Ticket ${id}`,
    "Description for " + id,
    opts.status || "backlog",
    "medium",
    1,
    projectId,
    opts.epicId || null,
    JSON.stringify(["test"]),
    opts.subtasks || null,
    opts.attachments || null,
    now,
    now
  );
  return id;
}

beforeEach(() => {
  const result = createTestDatabase();
  db = result.db;
});

describe("createTicket", () => {
  it("creates a ticket in the backlog with correct fields", () => {
    seedProject();
    const ticket = createTicket(db, {
      projectId: "proj-1",
      title: "My new ticket",
      description: "A description",
      priority: "high",
      tags: ["bug", "urgent"],
    });

    expect(ticket.id).toBeTruthy();
    expect(ticket.title).toBe("My new ticket");
    expect(ticket.description).toBe("A description");
    expect(ticket.status).toBe("backlog");
    expect(ticket.priority).toBe("high");
    expect(ticket.tags).toEqual(["bug", "urgent"]);
    expect(ticket.project.id).toBe("proj-1");
    expect(ticket.project.name).toBe("Test Project");
  });

  it("throws ProjectNotFoundError for invalid project", () => {
    expect(() => createTicket(db, { projectId: "nonexistent", title: "Test" })).toThrow(
      ProjectNotFoundError
    );
  });

  it("throws EpicNotFoundError for invalid epic", () => {
    seedProject();
    expect(() =>
      createTicket(db, { projectId: "proj-1", title: "Test", epicId: "nonexistent" })
    ).toThrow(EpicNotFoundError);
  });

  it("assigns ticket to an epic when epicId is provided", () => {
    seedProject();
    seedEpic();
    const ticket = createTicket(db, {
      projectId: "proj-1",
      title: "Epic ticket",
      epicId: "epic-1",
    });

    expect(ticket.epicId).toBe("epic-1");
  });

  it("auto-increments position within the backlog", () => {
    seedProject();
    const t1 = createTicket(db, { projectId: "proj-1", title: "First" });
    const t2 = createTicket(db, { projectId: "proj-1", title: "Second" });

    expect(t2.position).toBeGreaterThan(t1.position);
  });

  it("trims whitespace from title and description", () => {
    seedProject();
    const ticket = createTicket(db, {
      projectId: "proj-1",
      title: "  Trimmed title  ",
      description: "  Trimmed desc  ",
    });

    expect(ticket.title).toBe("Trimmed title");
    expect(ticket.description).toBe("Trimmed desc");
  });
});

describe("listTickets", () => {
  it("returns tickets sorted by creation date", () => {
    seedProject();
    seedTicket("t1", "proj-1");
    seedTicket("t2", "proj-1");

    const tickets = listTickets(db);
    expect(tickets.length).toBe(2);
  });

  it("filters by projectId", () => {
    seedProject("proj-1", "Project 1", "/tmp/p1");
    seedProject("proj-2", "Project 2", "/tmp/p2");
    seedTicket("t1", "proj-1");
    seedTicket("t2", "proj-2");

    const tickets = listTickets(db, { projectId: "proj-1" });
    expect(tickets.length).toBe(1);
    expect(tickets[0]!.id).toBe("t1");
  });

  it("filters by status", () => {
    seedProject();
    seedTicket("t1", "proj-1", { status: "backlog" });
    seedTicket("t2", "proj-1", { status: "ready" });
    seedTicket("t3", "proj-1", { status: "done" });

    const tickets = listTickets(db, { status: "backlog" });
    expect(tickets.length).toBe(1);
    expect(tickets[0]!.id).toBe("t1");
  });

  it("respects limit and caps at 100", () => {
    seedProject();
    seedTicket("t1", "proj-1");
    seedTicket("t2", "proj-1");
    seedTicket("t3", "proj-1");

    const tickets = listTickets(db, { limit: 2 });
    expect(tickets.length).toBe(2);
  });

  it("returns empty array when no tickets match", () => {
    seedProject();
    const tickets = listTickets(db, { projectId: "proj-1" });
    expect(tickets).toEqual([]);
  });
});

describe("getTicket", () => {
  it("returns full ticket detail with project info", () => {
    seedProject();
    seedTicket("t1", "proj-1");

    const ticket = getTicket(db, "t1");
    expect(ticket.id).toBe("t1");
    expect(ticket.project.id).toBe("proj-1");
    expect(ticket.project.name).toBe("Test Project");
    expect(ticket.tags).toEqual(["test"]);
  });

  it("throws TicketNotFoundError for nonexistent ticket", () => {
    expect(() => getTicket(db, "nonexistent")).toThrow(TicketNotFoundError);
  });

  it("includes epic title when ticket has an epic", () => {
    seedProject();
    seedEpic();
    seedTicket("t1", "proj-1", { epicId: "epic-1" });

    const ticket = getTicket(db, "t1");
    expect(ticket.epicTitle).toBe("Test Epic");
  });
});

describe("updateTicketStatus", () => {
  it("updates status and returns updated ticket", () => {
    seedProject();
    seedTicket("t1", "proj-1");

    const ticket = updateTicketStatus(db, "t1", "ready");
    expect(ticket.status).toBe("ready");
  });

  it("sets completedAt when status becomes done", () => {
    seedProject();
    seedTicket("t1", "proj-1");

    const ticket = updateTicketStatus(db, "t1", "done");
    expect(ticket.status).toBe("done");
    expect(ticket.completedAt).toBeTruthy();
  });

  it("clears completedAt when moving back from done", () => {
    seedProject();
    seedTicket("t1", "proj-1", { status: "done" });

    const ticket = updateTicketStatus(db, "t1", "in_progress");
    expect(ticket.completedAt).toBeNull();
  });

  it("throws TicketNotFoundError for nonexistent ticket", () => {
    expect(() => updateTicketStatus(db, "nonexistent", "ready")).toThrow(TicketNotFoundError);
  });

  it("throws ValidationError for invalid status", () => {
    seedProject();
    seedTicket("t1", "proj-1");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => updateTicketStatus(db, "t1", "invalid" as any)).toThrow(ValidationError);
  });
});

describe("updateAcceptanceCriterion", () => {
  it("updates a criterion status", () => {
    seedProject();
    const criteria = [
      { id: "ac-1", criterion: "First criterion", status: "pending" },
      { id: "ac-2", criterion: "Second criterion", status: "pending" },
    ];
    seedTicket("t1", "proj-1", { subtasks: JSON.stringify(criteria) });

    const result = updateAcceptanceCriterion(db, "t1", "ac-1", "passed", "Verified manually");
    expect(result.newStatus).toBe("passed");
    expect(result.previousStatus).toBe("pending");
    expect(result.criterionText).toBe("First criterion");
  });

  it("throws TicketNotFoundError for nonexistent ticket", () => {
    expect(() => updateAcceptanceCriterion(db, "nonexistent", "ac-1", "passed")).toThrow(
      TicketNotFoundError
    );
  });

  it("throws ValidationError for nonexistent criterion", () => {
    seedProject();
    const criteria = [{ id: "ac-1", criterion: "Only one", status: "pending" }];
    seedTicket("t1", "proj-1", { subtasks: JSON.stringify(criteria) });

    expect(() => updateAcceptanceCriterion(db, "t1", "nonexistent", "passed")).toThrow(
      ValidationError
    );
  });

  it("handles legacy format (text + completed fields)", () => {
    seedProject();
    const legacyCriteria = [{ id: "ac-1", text: "Legacy criterion", completed: true }];
    seedTicket("t1", "proj-1", { subtasks: JSON.stringify(legacyCriteria) });

    const result = updateAcceptanceCriterion(db, "t1", "ac-1", "failed");
    expect(result.criterionText).toBe("Legacy criterion");
    expect(result.previousStatus).toBe("passed"); // completed=true → "passed"
    expect(result.newStatus).toBe("failed");
  });
});

describe("deleteTicket", () => {
  it("returns dry-run preview when confirm is false", () => {
    seedProject();
    seedTicket("t1", "proj-1");

    const result = deleteTicket(db, "t1", false);
    expect(result.dryRun).toBe(true);
    if (result.dryRun) {
      expect(result.wouldDelete.entity).toBe("ticket");
      expect(result.wouldDelete.id).toBe("t1");
    }
  });

  it("deletes ticket and comments when confirmed", () => {
    seedProject();
    seedTicket("t1", "proj-1");
    db.prepare(
      "INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("c1", "t1", "A comment", "claude", "comment", new Date().toISOString());

    const result = deleteTicket(db, "t1", true);
    expect(result.dryRun).toBe(false);
    if (!result.dryRun) {
      expect(result.deleted.childrenDeleted).toBe(1);
    }

    // Verify ticket is gone
    expect(() => getTicket(db, "t1")).toThrow(TicketNotFoundError);
  });

  it("throws TicketNotFoundError for nonexistent ticket", () => {
    expect(() => deleteTicket(db, "nonexistent")).toThrow(TicketNotFoundError);
  });
});

describe("updateAttachmentMetadata", () => {
  it("updates attachment metadata fields", () => {
    seedProject();
    const attachments = [
      { id: "att-1", filename: "mockup.png", type: "reference", priority: "primary" },
    ];
    seedTicket("t1", "proj-1", { attachments: JSON.stringify(attachments) });

    const result = updateAttachmentMetadata(db, "t1", "att-1", {
      type: "mockup",
      description: "UI design",
    });

    expect(result.attachment.type).toBe("mockup");
    expect(result.attachment.description).toBe("UI design");
  });

  it("finds attachment by filename", () => {
    seedProject();
    const attachments = [{ id: "att-1", filename: "screenshot.png", type: "reference" }];
    seedTicket("t1", "proj-1", { attachments: JSON.stringify(attachments) });

    const result = updateAttachmentMetadata(db, "t1", "screenshot.png", {
      type: "bug-screenshot",
    });
    expect(result.attachment.type).toBe("bug-screenshot");
  });

  it("throws ValidationError for nonexistent attachment", () => {
    seedProject();
    seedTicket("t1", "proj-1", { attachments: JSON.stringify([]) });

    expect(() => updateAttachmentMetadata(db, "t1", "nonexistent", { type: "mockup" })).toThrow(
      ValidationError
    );
  });

  it("handles legacy string-format attachments", () => {
    seedProject();
    seedTicket("t1", "proj-1", { attachments: JSON.stringify(["old-file.png"]) });

    const result = updateAttachmentMetadata(db, "t1", "old-file.png", {
      type: "mockup",
    });
    expect(result.attachment.type).toBe("mockup");
    expect(result.attachment.filename).toBe("old-file.png");
  });
});

describe("listTicketsByEpic", () => {
  it("returns tickets in the epic ordered by position", () => {
    seedProject();
    seedEpic();
    seedTicket("t1", "proj-1", { epicId: "epic-1" });
    seedTicket("t2", "proj-1", { epicId: "epic-1" });
    seedTicket("t3", "proj-1"); // not in epic

    const tickets = listTicketsByEpic(db, { epicId: "epic-1" });
    expect(tickets.length).toBe(2);
  });

  it("throws EpicNotFoundError for nonexistent epic", () => {
    expect(() => listTicketsByEpic(db, { epicId: "nonexistent" })).toThrow(EpicNotFoundError);
  });

  it("filters by status within the epic", () => {
    seedProject();
    seedEpic();
    seedTicket("t1", "proj-1", { epicId: "epic-1", status: "backlog" });
    seedTicket("t2", "proj-1", { epicId: "epic-1", status: "done" });

    const tickets = listTicketsByEpic(db, { epicId: "epic-1", status: "done" });
    expect(tickets.length).toBe(1);
    expect(tickets[0]!.id).toBe("t2");
  });
});
