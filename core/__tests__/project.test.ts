import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import { listProjects, findProjectByPath, createProject, deleteProject } from "../project.ts";
import { ProjectNotFoundError, PathNotFoundError, ValidationError } from "../errors.ts";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let db: Database.Database;
let tempDir: string;

function seedProject(
  id: string = "proj-1",
  name: string = "Test Project",
  path: string = "/tmp/test-project"
) {
  db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    name,
    path,
    new Date().toISOString()
  );
  return id;
}

function seedTicket(id: string, projectId: string) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tickets (id, title, status, priority, position, project_id, created_at, updated_at)
     VALUES (?, ?, 'backlog', 'medium', 1, ?, ?, ?)`
  ).run(id, `Ticket ${id}`, projectId, now, now);
}

function seedEpic(id: string, projectId: string) {
  db.prepare("INSERT INTO epics (id, title, project_id, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    `Epic ${id}`,
    projectId,
    new Date().toISOString()
  );
}

function seedComment(id: string, ticketId: string) {
  db.prepare(
    "INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, ticketId, "A comment", "claude", "comment", new Date().toISOString());
}

beforeEach(() => {
  const result = createTestDatabase();
  db = result.db;
  // Create a real temporary directory for createProject tests
  tempDir = mkdtempSync(join(tmpdir(), "brain-dump-test-"));
});

describe("listProjects", () => {
  it("returns all projects ordered by name", () => {
    seedProject("p1", "Zebra", "/tmp/zebra");
    seedProject("p2", "Alpha", "/tmp/alpha");

    const projects = listProjects(db);
    expect(projects.length).toBe(2);
    expect(projects[0]!.name).toBe("Alpha");
    expect(projects[1]!.name).toBe("Zebra");
  });

  it("returns empty array when no projects exist", () => {
    const projects = listProjects(db);
    expect(projects).toEqual([]);
  });

  it("returns correct project fields", () => {
    seedProject("p1", "Test", "/tmp/test");

    const projects = listProjects(db);
    expect(projects[0]).toMatchObject({
      id: "p1",
      name: "Test",
      path: "/tmp/test",
    });
    expect(projects[0]!.createdAt).toBeTruthy();
  });
});

describe("findProjectByPath", () => {
  it("finds project when path matches exactly", () => {
    seedProject("p1", "Test", "/tmp/my-project");

    const project = findProjectByPath(db, "/tmp/my-project");
    expect(project).not.toBeNull();
    expect(project!.id).toBe("p1");
  });

  it("finds project when search path is a subdirectory", () => {
    seedProject("p1", "Test", "/tmp/my-project");

    const project = findProjectByPath(db, "/tmp/my-project/src/lib");
    expect(project).not.toBeNull();
    expect(project!.id).toBe("p1");
  });

  it("finds project when search path is a parent directory", () => {
    seedProject("p1", "Test", "/tmp/my-project/subdir");

    const project = findProjectByPath(db, "/tmp/my-project");
    expect(project).not.toBeNull();
    expect(project!.id).toBe("p1");
  });

  it("returns null when no project matches", () => {
    seedProject("p1", "Test", "/tmp/my-project");

    const project = findProjectByPath(db, "/home/user/other");
    expect(project).toBeNull();
  });
});

describe("createProject", () => {
  it("creates a project with correct fields", () => {
    const project = createProject(db, {
      name: "New Project",
      path: tempDir,
      color: "#ff0000",
    });

    expect(project.id).toBeTruthy();
    expect(project.name).toBe("New Project");
    expect(project.path).toBe(tempDir);
    expect(project.color).toBe("#ff0000");
    expect(project.createdAt).toBeTruthy();
  });

  it("trims whitespace from name", () => {
    const project = createProject(db, {
      name: "  Trimmed Name  ",
      path: tempDir,
    });

    expect(project.name).toBe("Trimmed Name");
  });

  it("throws PathNotFoundError for nonexistent path", () => {
    expect(() =>
      createProject(db, { name: "Test", path: "/nonexistent/definitely/not/real" })
    ).toThrow(PathNotFoundError);
  });

  it("throws ValidationError if path is already registered", () => {
    // First create succeeds
    createProject(db, { name: "Existing", path: tempDir });

    // Second create at same path should fail
    expect(() => createProject(db, { name: "Duplicate", path: tempDir })).toThrow(ValidationError);
  });
});

describe("deleteProject", () => {
  it("returns dry-run preview when confirm is false", () => {
    seedProject();

    const result = deleteProject(db, "proj-1", false);
    expect(result.dryRun).toBe(true);
    if (result.dryRun) {
      expect(result.wouldDelete.entity).toBe("project");
      expect(result.wouldDelete.id).toBe("proj-1");
      expect(result.wouldDelete.title).toBe("Test Project");
    }
  });

  it("deletes project and all associated data when confirmed", () => {
    seedProject();
    seedEpic("e1", "proj-1");
    seedTicket("t1", "proj-1");
    seedComment("c1", "t1");

    const result = deleteProject(db, "proj-1", true);
    expect(result.dryRun).toBe(false);
    if (!result.dryRun) {
      expect(result.deleted.entity).toBe("project");
      expect(result.deleted.childrenDeleted).toBeGreaterThan(0);
    }

    // Verify project is gone
    const projects = listProjects(db);
    expect(projects.length).toBe(0);
  });

  it("throws ProjectNotFoundError for nonexistent project", () => {
    expect(() => deleteProject(db, "nonexistent")).toThrow(ProjectNotFoundError);
  });

  it("counts children correctly in dry-run preview", () => {
    seedProject();
    seedEpic("e1", "proj-1");
    seedTicket("t1", "proj-1");
    seedTicket("t2", "proj-1");
    seedComment("c1", "t1");
    seedComment("c2", "t1");
    seedComment("c3", "t2");

    const result = deleteProject(db, "proj-1", false);
    if (result.dryRun) {
      // 1 epic + 2 tickets + 3 comments = 6
      expect(result.wouldDelete.childCount).toBe(6);
    }
  });
});
