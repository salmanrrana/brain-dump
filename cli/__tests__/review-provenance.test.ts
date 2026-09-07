import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { handle } from "../commands/review.ts";
import { getDb } from "../lib/db.ts";

vi.mock("../lib/db.ts", async () => {
  const { createTestDatabase } = await import("../../core/db.ts");
  const database = createTestDatabase();
  return { getDb: () => database };
});

it("attributes verification repairs to the calling implementer", () => {
  const { db } = getDb();
  db.prepare(
    "UPDATE tickets SET is_blocked = 1, blocked_reason = 'Boot failed' WHERE id = 'ticket-1'"
  ).run();
  db.prepare(
    "INSERT INTO demo_scripts (id, ticket_id, steps) VALUES ('demo-1', 'ticket-1', '[]')"
  ).run();
  db.prepare(
    `INSERT INTO verification_jobs (id, ticket_id, demo_script_id, status, next_run_at, last_error)
    VALUES ('job-1', 'ticket-1', 'demo-1', 'blocked', '2026-09-05T06:00:00.000Z', 'Boot failed')`
  ).run();
  vi.stubEnv("BRAIN_DUMP_REVIEWER_AUTHOR", "codex");
  handle("resolve-verification-failure", [
    "--ticket",
    "ticket-1",
    "--root-cause",
    "The boot command timed out.",
    "--classification",
    "environment",
    "--validation",
    "The isolated boot check now passes.",
  ]);
  expect(db.prepare("SELECT author, provider, phase FROM ticket_comments").get()).toEqual({
    author: "ralph:claude",
    provider: "claude-code",
    phase: "repair",
  });
});

beforeEach(() => {
  const { db } = getDb();
  db.prepare("DELETE FROM projects").run();
  db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
    "project-1",
    "Review fixture",
    "/tmp/review-fixture",
    new Date().toISOString()
  );
  db.prepare(
    `INSERT INTO tickets (id, title, status, priority, position, project_id, created_at, updated_at)
    VALUES ('ticket-1', 'Review fixture', 'ai_review', 'medium', 1, 'project-1', ?, ?)`
  ).run(new Date().toISOString(), new Date().toISOString());
  vi.stubEnv("BRAIN_DUMP_PROVIDER", "claude-code");
  vi.stubEnv("RALPH_SESSION", "1");
  vi.stubEnv("BRAIN_DUMP_REVIEWER_AUTHOR", "");
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it.each([
  { override: "", author: "ralph:claude", provider: "claude-code" },
  { override: "codex", author: "codex", provider: "codex" },
])("preserves $author on submitted and resolved CLI findings", ({ override, author, provider }) => {
  vi.stubEnv("BRAIN_DUMP_REVIEWER_AUTHOR", override);
  handle("submit-finding", [
    "--ticket",
    "ticket-1",
    "--agent",
    "code-reviewer",
    "--severity",
    "major",
    "--category",
    "correctness",
    "--description",
    "The saved routine is lost after reloading.",
  ]);
  const { db } = getDb();
  const finding = db.prepare("SELECT id FROM review_findings").get() as { id: string };
  handle("mark-fixed", ["--finding", finding.id, "--status", "fixed"]);
  expect(
    db.prepare("SELECT author, provider, phase FROM ticket_comments ORDER BY rowid").all()
  ).toEqual([
    { author, provider, phase: "ai_review" },
    { author, provider, phase: "ai_review" },
  ]);
});
