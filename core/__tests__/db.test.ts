import { describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";
import { createTestDatabase, runMigrations } from "../db.ts";

function columnNames(db: Database.Database, tableName: string): string[] {
  return (db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>).map(
    (column) => column.name
  );
}

describe("database schema", () => {
  it("includes reviewer defaults on projects and settings", () => {
    const { db } = createTestDatabase();

    expect(columnNames(db, "projects")).toEqual(
      expect.arrayContaining(["reviewer_provider", "reviewer_model"])
    );
    expect(columnNames(db, "settings")).toEqual(
      expect.arrayContaining(["default_reviewer_provider", "default_reviewer_model"])
    );
  });

  it("includes nullable ticket comment provenance columns", () => {
    const { db } = createTestDatabase();

    expect(columnNames(db, "ticket_comments")).toEqual(
      expect.arrayContaining(["phase", "actor_kind", "provider", "model_provider", "model_name"])
    );
  });

  it("generated migration only adds nullable ticket comment provenance columns", () => {
    const migration = readFileSync(
      join(process.cwd(), "drizzle", "0022_wakeful_mattie_franklin.sql"),
      "utf8"
    );
    const statements = migration
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);

    expect(statements).toEqual([
      "ALTER TABLE `ticket_comments` ADD `phase` text;",
      "ALTER TABLE `ticket_comments` ADD `actor_kind` text;",
      "ALTER TABLE `ticket_comments` ADD `provider` text;",
      "ALTER TABLE `ticket_comments` ADD `model_provider` text;",
      "ALTER TABLE `ticket_comments` ADD `model_name` text;",
    ]);
  });

  it("upgrades legacy ticket comments without changing existing rows and is idempotent", () => {
    const { db } = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
      "project-1",
      "Project",
      "/tmp/project",
      now
    );
    db.prepare(
      `INSERT INTO tickets (id, title, status, position, project_id, created_at, updated_at)
       VALUES (?, ?, 'backlog', 1, ?, ?, ?)`
    ).run("ticket-1", "Ticket", "project-1", now, now);

    db.exec("DROP TABLE ticket_comments");
    db.exec(`
      CREATE TABLE ticket_comments (
        id TEXT PRIMARY KEY NOT NULL,
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        author TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'comment',
        created_at TEXT NOT NULL
      )
    `);
    db.prepare(
      `INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run("comment-1", "ticket-1", "Legacy comment", "user", "comment", now);

    runMigrations(db);
    runMigrations(db);

    expect(columnNames(db, "ticket_comments")).toEqual(
      expect.arrayContaining(["phase", "actor_kind", "provider", "model_provider", "model_name"])
    );
    expect(db.prepare("SELECT * FROM ticket_comments WHERE id = ?").get("comment-1")).toMatchObject(
      {
        content: "Legacy comment",
        phase: null,
        actor_kind: null,
        provider: null,
        model_provider: null,
        model_name: null,
      }
    );
  });
});
