import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.ts", async () => {
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE tickets (id TEXT PRIMARY KEY);
    CREATE TABLE ticket_comments (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      content TEXT NOT NULL,
      author TEXT NOT NULL,
      type TEXT NOT NULL,
      phase TEXT,
      actor_kind TEXT,
      provider TEXT,
      model_provider TEXT,
      model_name TEXT,
      created_at TEXT NOT NULL
    );
    INSERT INTO tickets (id) VALUES ('ticket-1');
  `);
  return { getDb: () => ({ db, dbPath: ":memory:" }) };
});

beforeEach(async () => {
  const { getDb } = await import("../lib/db.ts");
  getDb().db.prepare("DELETE FROM ticket_comments").run();
  process.env.BRAIN_DUMP_LAUNCH_MODEL_PROVIDER = "openai";
  process.env.BRAIN_DUMP_LAUNCH_MODEL = "gpt-5.6";
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.BRAIN_DUMP_LAUNCH_MODEL_PROVIDER;
  delete process.env.BRAIN_DUMP_LAUNCH_MODEL;
  delete process.env.BRAIN_DUMP_PROVIDER;
  delete process.env.RALPH_SESSION;
  vi.restoreAllMocks();
});

describe("comment CLI provenance", () => {
  it.each(["progress", "comment"])(
    "attributes %s comments to the active Pi launch",
    async (type) => {
      process.env.BRAIN_DUMP_PROVIDER = "pi";
      process.env.RALPH_SESSION = "1";
      const { handle } = await import("../commands/comment.ts");
      const { getDb } = await import("../lib/db.ts");

      handle("add", ["--ticket", "ticket-1", "--content", "Reviewing the page", "--type", type]);

      expect(getDb().db.prepare("SELECT author FROM ticket_comments").get()).toEqual({
        author: "ralph:pi",
      });
    }
  );

  it("passes the same implementation model provenance to the canonical writer", async () => {
    const { handle } = await import("../commands/comment.ts");
    const { getDb } = await import("../lib/db.ts");

    handle("add", [
      "--ticket",
      "ticket-1",
      "--content",
      "Focused tests passed",
      "--type",
      "test_report",
      "--author",
      "pi",
    ]);

    const comment = getDb()
      .db.prepare(
        "SELECT author, phase, actor_kind, provider, model_provider, model_name FROM ticket_comments WHERE ticket_id = ?"
      )
      .get("ticket-1");
    expect(comment).toEqual({
      author: "pi",
      phase: "implementation",
      actor_kind: "ai",
      provider: "pi",
      model_provider: "openai",
      model_name: "gpt-5.6",
    });
  });

  it("uses the launch provider when the author flag is omitted", async () => {
    process.env.BRAIN_DUMP_PROVIDER = "pi";
    const { handle } = await import("../commands/comment.ts");
    const { getDb } = await import("../lib/db.ts");

    handle("add", [
      "--ticket",
      "ticket-1",
      "--content",
      "Focused tests passed",
      "--type",
      "test_report",
    ]);

    const comment = getDb()
      .db.prepare(
        "SELECT author, phase, actor_kind, provider, model_provider, model_name FROM ticket_comments WHERE ticket_id = ?"
      )
      .get("ticket-1");
    expect(comment).toEqual({
      author: "pi",
      phase: "implementation",
      actor_kind: "ai",
      provider: "pi",
      model_provider: "openai",
      model_name: "gpt-5.6",
    });
  });
});
