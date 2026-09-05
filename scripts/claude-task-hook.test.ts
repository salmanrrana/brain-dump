import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { initDatabase } from "../core/db.ts";

let root: string;
let db: Database.Database;
const helper = resolve(".claude/hooks/save-tasks-to-db.cjs");
function save(ticketId: string, payload: unknown, mode: string, session = "session-a") {
  return spawnSync(process.execPath, [helper, ticketId, JSON.stringify(payload), mode], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: root,
      USERPROFILE: root,
      APPDATA: root,
      XDG_DATA_HOME: root,
      PROJECT_DIR: root,
      BRAIN_DUMP_TASK_SESSION_ID: session,
    },
  });
}
function tasks(ticketId: string) {
  return db
    .prepare(
      "SELECT subject, status, status_history, created_at, completed_at, position FROM claude_tasks WHERE ticket_id = ? ORDER BY position"
    )
    .all(ticketId);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "claude-task-hook-"));
  const dataDir =
    process.platform === "darwin"
      ? join(root, "Library", "Application Support", "brain-dump")
      : join(root, "brain-dump");
  mkdirSync(dataDir, { recursive: true });
  db = initDatabase({ dbPath: join(dataDir, "brain-dump.db"), skipMigration: true }).db;
  db.prepare("INSERT INTO projects (id, name, path) VALUES ('p', 'Fixture', ?)").run(root);
  for (const id of ["a", "b"])
    db.prepare("INSERT INTO tickets (id, title, project_id) VALUES (?, ?, 'p')").run(id, id);
});
afterEach(() => {
  db.close();
  rmSync(root, { recursive: true, force: true });
});

describe("Claude task hook delivery", () => {
  it("keeps equal harness IDs separate across tickets and sessions", () => {
    expect(save("a", { id: "1", subject: "first" }, "create").status).toBe(0);
    expect(save("b", { id: "1", subject: "other ticket" }, "create").status).toBe(0);
    expect(save("a", { id: "1", subject: "new session" }, "create", "session-b").status).toBe(0);
    expect(save("a", { id: "1", status: "completed" }, "update", "session-b").status).toBe(0);
    expect(tasks("a")).toMatchObject([
      { subject: "first", status: "pending" },
      { subject: "new session", status: "completed" },
    ]);
    expect(tasks("b")).toMatchObject([{ subject: "other ticket", status: "pending" }]);
  });

  it("preserves task history on create replay and clears completion when reopened", () => {
    save("a", { id: "1", subject: "task" }, "create");
    save("a", { id: "1", status: "completed" }, "update");
    const completed = tasks("a");
    expect(save("a", { id: "1", subject: "task" }, "create").status).toBe(0);
    expect(tasks("a")).toEqual(completed);
    save("a", { id: "1", description: "extra context" }, "update");
    expect(tasks("a")).toEqual(completed);
    save("a", { id: "1", status: "in_progress" }, "update");
    expect(tasks("a")).toMatchObject([{ status: "in_progress", completed_at: null }]);
  });

  it.each(["create", "update", "replace", "delete"])(
    "adopts legacy IDs without losing history during %s",
    (mode) => {
      const timestamp = "2026-01-01T00:00:00.000Z";
      db.prepare(
        `INSERT INTO claude_tasks (id, ticket_id, subject, status, position, status_history, created_at, completed_at)
      VALUES ('1', 'a', 'legacy task', 'completed', 1, ?, ?, ?)`
      ).run(JSON.stringify([{ status: "completed", timestamp }]), timestamp, timestamp);
      const before = tasks("a");
      expect(save("b", { id: "1", subject: "another ticket" }, "create").status).toBe(0);
      expect(tasks("a")).toEqual(before);
      const task = {
        id: "1",
        subject: "legacy task",
        status: mode === "delete" ? "deleted" : "completed",
      };
      expect(
        save("a", mode === "replace" ? [task] : task, mode === "delete" ? "update" : mode).status
      ).toBe(0);
      expect(tasks("a")).toEqual(mode === "delete" ? [] : before);
      expect(db.prepare("SELECT id FROM claude_tasks WHERE id = '1'").get()).toBeUndefined();
      expect(tasks("b")).toMatchObject([{ subject: "another ticket", status: "pending" }]);
    }
  );

  it("rolls back a replacement when a later task is invalid", () => {
    save("a", { id: "1", subject: "keep me" }, "create");
    const before = tasks("a");
    const result = save(
      "a",
      [
        { id: "2", subject: "new", status: "pending" },
        { id: "3", status: "pending" },
      ],
      "replace"
    );
    expect(result.status).not.toBe(0);
    expect(tasks("a")).toEqual(before);
  });

  it("captures the current PostToolUse response and applies later updates to that task", () => {
    mkdirSync(join(root, ".claude"));
    writeFileSync(join(root, ".claude", "ralph-state.json"), JSON.stringify({ ticketId: "a" }));
    const runHook = (input: object) =>
      spawnSync("bash", [resolve(".claude/hooks/capture-claude-tasks.sh")], {
        input: JSON.stringify({ session_id: "claude-session", ...input }),
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: root,
          USERPROFILE: root,
          APPDATA: root,
          XDG_DATA_HOME: root,
          CLAUDE_PROJECT_DIR: root,
        },
      });
    expect(
      runHook({
        tool_name: "TaskCreate",
        tool_input: { subject: "Tracked task" },
        tool_response: { task: { id: "1" } },
      }).status
    ).toBe(0);
    expect(
      runHook({ tool_name: "TaskUpdate", tool_input: { taskId: "1", status: "completed" } }).status
    ).toBe(0);
    expect(tasks("a")).toMatchObject([{ subject: "Tracked task", status: "completed" }]);
  });
});
