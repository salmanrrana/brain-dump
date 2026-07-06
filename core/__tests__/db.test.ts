import { describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";

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
});
