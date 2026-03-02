import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { initDatabase } from "../lib/database.ts";
import { checkUnlinkedItems } from "../../core/git.ts";
import type Database from "better-sqlite3";

let db: Database.Database;
let tempDir: string;
let projectPath: string;
let originalHome: string;

function git(...args: string[]) {
  return execFileSync("git", args, { cwd: projectPath, encoding: "utf-8", stdio: "pipe" });
}

function createProjectAndTicket(): { projectId: string; ticketId: string } {
  const projectId = randomUUID();
  const ticketId = randomUUID();
  const now = new Date().toISOString();

  db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
    projectId,
    "Test Project",
    projectPath,
    now
  );

  db.prepare(
    `INSERT INTO tickets (id, title, status, position, project_id, created_at, updated_at)
     VALUES (?, ?, 'in_progress', 1, ?, ?, ?)`
  ).run(ticketId, "Test Ticket", projectId, now, now);

  return { projectId, ticketId };
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "brain-dump-unlinked-"));
  originalHome = process.env.HOME!;
  process.env.HOME = tempDir;

  projectPath = join(tempDir, "project");
  mkdirSync(projectPath, { recursive: true });

  git("init");
  git("config", "user.email", "test@test.com");
  git("config", "user.name", "Test");
  git("commit", "--allow-empty", "-m", "initial commit");
  git("branch", "-M", "main");
  git("checkout", "-b", "feature/test-branch");

  const dbPath = join(tempDir, "brain-dump.db");
  const result = initDatabase(dbPath);
  db = result.db;
});

afterEach(() => {
  db?.close();
  process.env.HOME = originalHome;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("checkUnlinkedItems", () => {
  it("reports unlinked commits on the branch", () => {
    const { ticketId } = createProjectAndTicket();

    git("commit", "--allow-empty", "-m", "feat: first change");
    git("commit", "--allow-empty", "-m", "feat: second change");

    const result = checkUnlinkedItems(db, ticketId, projectPath);

    expect(result.hasUnlinkedItems).toBe(true);
    expect(result.unlinkedCommits.length).toBe(2);
    // git log returns newest-first
    expect(result.unlinkedCommits[0]!.message).toBe("feat: second change");
    expect(result.unlinkedCommits[1]!.message).toBe("feat: first change");
    expect(result.unlinkedPr).toBeNull();
  });

  it("returns empty when no commits on branch", () => {
    const { ticketId } = createProjectAndTicket();

    const result = checkUnlinkedItems(db, ticketId, projectPath);

    expect(result.hasUnlinkedItems).toBe(false);
    expect(result.unlinkedCommits).toEqual([]);
    expect(result.unlinkedPr).toBeNull();
  });

  it("skips already-linked commits", () => {
    const { ticketId } = createProjectAndTicket();

    git("commit", "--allow-empty", "-m", "feat: linked change");
    const hash = git("rev-parse", "HEAD").trim();
    git("commit", "--allow-empty", "-m", "feat: unlinked change");

    // Link the first commit to the ticket
    const now = new Date().toISOString();
    db.prepare("UPDATE tickets SET linked_commits = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify([{ hash, message: "feat: linked change", linkedAt: now }]),
      now,
      ticketId
    );

    const result = checkUnlinkedItems(db, ticketId, projectPath);

    expect(result.hasUnlinkedItems).toBe(true);
    expect(result.unlinkedCommits.length).toBe(1);
    expect(result.unlinkedCommits[0]!.message).toBe("feat: unlinked change");
  });

  it("reports all linked when all commits already tracked", () => {
    const { ticketId } = createProjectAndTicket();

    git("commit", "--allow-empty", "-m", "feat: only change");
    const hash = git("rev-parse", "HEAD").trim();

    const now = new Date().toISOString();
    db.prepare("UPDATE tickets SET linked_commits = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify([{ hash, message: "feat: only change", linkedAt: now }]),
      now,
      ticketId
    );

    const result = checkUnlinkedItems(db, ticketId, projectPath);

    expect(result.hasUnlinkedItems).toBe(false);
    expect(result.unlinkedCommits).toEqual([]);
  });
});
