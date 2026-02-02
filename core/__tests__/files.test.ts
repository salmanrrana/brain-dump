import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import { linkFiles, getTicketsForFile } from "../files.ts";
import { TicketNotFoundError, ValidationError } from "../errors.ts";
import { seedProject, seedTicket } from "./test-helpers.ts";

let db: Database.Database;

beforeEach(() => {
  const result = createTestDatabase();
  db = result.db;
});

describe("linkFiles", () => {
  it("links files to a ticket and returns the result", () => {
    seedProject(db);
    seedTicket(db);

    const result = linkFiles(db, "ticket-1", ["src/app.ts", "src/utils.ts"]);

    expect(result.ticketId).toBe("ticket-1");
    expect(result.ticketTitle).toBe("Ticket ticket-1");
    expect(result.linkedFiles).toHaveLength(2);
    expect(result.linkedFiles).toContain("src/app.ts");
    expect(result.linkedFiles).toContain("src/utils.ts");
  });

  it("appends to existing linked files without duplicates", () => {
    seedProject(db);
    seedTicket(db);

    linkFiles(db, "ticket-1", ["src/app.ts"]);
    const result = linkFiles(db, "ticket-1", ["src/app.ts", "src/new.ts"]);

    expect(result.linkedFiles).toHaveLength(2);
    expect(result.linkedFiles).toContain("src/app.ts");
    expect(result.linkedFiles).toContain("src/new.ts");
  });

  it("throws TicketNotFoundError for nonexistent ticket", () => {
    expect(() => linkFiles(db, "nonexistent", ["file.ts"])).toThrow(TicketNotFoundError);
  });

  it("throws ValidationError for empty file list", () => {
    seedProject(db);
    seedTicket(db);

    expect(() => linkFiles(db, "ticket-1", [])).toThrow(ValidationError);
  });
});

describe("getTicketsForFile", () => {
  it("finds tickets linked to a file", () => {
    seedProject(db);
    seedTicket(db, { id: "t1" });
    seedTicket(db, { id: "t2" });

    linkFiles(db, "t1", ["src/shared.ts"]);
    linkFiles(db, "t2", ["src/shared.ts"]);

    const tickets = getTicketsForFile(db, "src/shared.ts");
    expect(tickets).toHaveLength(2);
    expect(tickets.map((t) => t.id)).toContain("t1");
    expect(tickets.map((t) => t.id)).toContain("t2");
  });

  it("returns empty array when no tickets match", () => {
    seedProject(db);
    seedTicket(db);
    linkFiles(db, "ticket-1", ["src/app.ts"]);

    const tickets = getTicketsForFile(db, "src/nonexistent.ts");
    expect(tickets).toEqual([]);
  });

  it("supports partial path matching", () => {
    seedProject(db);
    seedTicket(db);
    linkFiles(db, "ticket-1", ["src/components/Button.tsx"]);

    const tickets = getTicketsForFile(db, "Button.tsx");
    expect(tickets).toHaveLength(1);
    expect(tickets[0]!.id).toBe("ticket-1");
  });

  it("filters by projectId when provided", () => {
    seedProject(db, { id: "p1", path: "/tmp/test-project-p1" });
    seedProject(db, { id: "p2", path: "/tmp/test-project-p2" });
    seedTicket(db, { id: "t1", projectId: "p1" });
    seedTicket(db, { id: "t2", projectId: "p2" });

    linkFiles(db, "t1", ["shared.ts"]);
    linkFiles(db, "t2", ["shared.ts"]);

    const tickets = getTicketsForFile(db, "shared.ts", "p1");
    expect(tickets).toHaveLength(1);
    expect(tickets[0]!.id).toBe("t1");
  });
});
