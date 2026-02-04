import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import { createEpic, listEpics, updateEpic, deleteEpic } from "../epic.ts";
import { EpicNotFoundError, ProjectNotFoundError, ValidationError } from "../errors.ts";

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

function seedEpic(
  id = "epic-1",
  projectId = "proj-1",
  opts: { title?: string; description?: string; color?: string } = {}
) {
  db.prepare(
    "INSERT INTO epics (id, title, description, project_id, color, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    opts.title || "Test Epic",
    opts.description || null,
    projectId,
    opts.color || null,
    new Date().toISOString()
  );
  return id;
}

function seedTicket(id: string, projectId: string, epicId?: string) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tickets (id, title, status, priority, position, project_id, epic_id, created_at, updated_at)
     VALUES (?, ?, 'backlog', 'medium', 1, ?, ?, ?, ?)`
  ).run(id, `Ticket ${id}`, projectId, epicId || null, now, now);
  return id;
}

beforeEach(() => {
  const result = createTestDatabase();
  db = result.db;
});

describe("createEpic", () => {
  it("creates an epic with correct fields", () => {
    seedProject();
    const epic = createEpic(db, {
      projectId: "proj-1",
      title: "New Epic",
      description: "Epic description",
      color: "#ff0000",
    });

    expect(epic.id).toBeTruthy();
    expect(epic.title).toBe("New Epic");
    expect(epic.description).toBe("Epic description");
    expect(epic.projectId).toBe("proj-1");
    expect(epic.color).toBe("#ff0000");
    expect(epic.createdAt).toBeTruthy();
  });

  it("throws ProjectNotFoundError for invalid project", () => {
    expect(() => createEpic(db, { projectId: "nonexistent", title: "Test" })).toThrow(
      ProjectNotFoundError
    );
  });

  it("trims whitespace from title and description", () => {
    seedProject();
    const epic = createEpic(db, {
      projectId: "proj-1",
      title: "  Trimmed  ",
      description: "  Trimmed desc  ",
    });

    expect(epic.title).toBe("Trimmed");
    expect(epic.description).toBe("Trimmed desc");
  });

  it("sets description to null when empty string provided", () => {
    seedProject();
    const epic = createEpic(db, {
      projectId: "proj-1",
      title: "No desc",
      description: "   ",
    });

    expect(epic.description).toBeNull();
  });
});

describe("listEpics", () => {
  it("returns epics for a project ordered by title", () => {
    seedProject();
    seedEpic("e1", "proj-1", { title: "Zebra Epic" });
    seedEpic("e2", "proj-1", { title: "Alpha Epic" });

    const epics = listEpics(db, "proj-1");
    expect(epics.length).toBe(2);
    expect(epics[0]!.title).toBe("Alpha Epic");
    expect(epics[1]!.title).toBe("Zebra Epic");
  });

  it("returns empty array when project has no epics", () => {
    seedProject();
    const epics = listEpics(db, "proj-1");
    expect(epics).toEqual([]);
  });

  it("throws ProjectNotFoundError for invalid project", () => {
    expect(() => listEpics(db, "nonexistent")).toThrow(ProjectNotFoundError);
  });

  it("only returns epics for the specified project", () => {
    seedProject("proj-1", "P1", "/tmp/p1");
    seedProject("proj-2", "P2", "/tmp/p2");
    seedEpic("e1", "proj-1", { title: "Epic 1" });
    seedEpic("e2", "proj-2", { title: "Epic 2" });

    const epics = listEpics(db, "proj-1");
    expect(epics.length).toBe(1);
    expect(epics[0]!.id).toBe("e1");
  });
});

describe("updateEpic", () => {
  it("updates title", () => {
    seedProject();
    seedEpic();

    const epic = updateEpic(db, "epic-1", { title: "Updated Title" });
    expect(epic.title).toBe("Updated Title");
  });

  it("updates description", () => {
    seedProject();
    seedEpic("epic-1", "proj-1", { description: "Old" });

    const epic = updateEpic(db, "epic-1", { description: "New desc" });
    expect(epic.description).toBe("New desc");
  });

  it("updates color", () => {
    seedProject();
    seedEpic();

    const epic = updateEpic(db, "epic-1", { color: "#00ff00" });
    expect(epic.color).toBe("#00ff00");
  });

  it("updates multiple fields at once", () => {
    seedProject();
    seedEpic();

    const epic = updateEpic(db, "epic-1", {
      title: "New Title",
      description: "New Description",
      color: "#0000ff",
    });

    expect(epic.title).toBe("New Title");
    expect(epic.description).toBe("New Description");
    expect(epic.color).toBe("#0000ff");
  });

  it("throws EpicNotFoundError for nonexistent epic", () => {
    expect(() => updateEpic(db, "nonexistent", { title: "X" })).toThrow(EpicNotFoundError);
  });

  it("throws ValidationError when no updates provided", () => {
    seedProject();
    seedEpic();

    expect(() => updateEpic(db, "epic-1", {})).toThrow(ValidationError);
  });

  it("clears description when set to empty string", () => {
    seedProject();
    seedEpic("epic-1", "proj-1", { description: "Has desc" });

    const epic = updateEpic(db, "epic-1", { description: "" });
    expect(epic.description).toBeNull();
  });
});

describe("deleteEpic", () => {
  it("returns dry-run preview when confirm is false", () => {
    seedProject();
    seedEpic();
    seedTicket("t1", "proj-1", "epic-1");

    const result = deleteEpic(db, "epic-1", false);
    expect(result.dryRun).toBe(true);
    if (result.dryRun) {
      expect(result.wouldDelete.entity).toBe("epic");
      expect(result.wouldDelete.id).toBe("epic-1");
      expect(result.wouldDelete.childCount).toBe(1);
    }
  });

  it("deletes epic and unlinks tickets when confirmed", () => {
    seedProject();
    seedEpic();
    seedTicket("t1", "proj-1", "epic-1");
    seedTicket("t2", "proj-1", "epic-1");

    const result = deleteEpic(db, "epic-1", true);
    expect(result.dryRun).toBe(false);
    if (!result.dryRun) {
      expect(result.deleted.childrenDeleted).toBe(2);
    }

    // Verify epic is gone
    expect(() => listEpics(db, "proj-1")).not.toThrow();
    const epics = listEpics(db, "proj-1");
    expect(epics.length).toBe(0);

    // Verify tickets still exist but are unlinked
    const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get("t1") as {
      epic_id: string | null;
    };
    expect(ticket.epic_id).toBeNull();
  });

  it("throws EpicNotFoundError for nonexistent epic", () => {
    expect(() => deleteEpic(db, "nonexistent")).toThrow(EpicNotFoundError);
  });

  it("handles delete with no tickets", () => {
    seedProject();
    seedEpic();

    const result = deleteEpic(db, "epic-1", true);
    expect(result.dryRun).toBe(false);
    if (!result.dryRun) {
      expect(result.deleted.childrenDeleted).toBe(0);
    }
  });
});
