import { afterEach, expect, it, vi } from "vitest";
import { createTestDatabase } from "../db.ts";
import { checkComplete, getReviewContext, markFixed } from "../review.ts";

const { db } = createTestDatabase();
afterEach(() => {
  vi.restoreAllMocks();
  db.close();
});

it("reads findings once for the review packet and still observes subsequent repairs", () => {
  db.prepare("INSERT INTO projects(id,name,path) VALUES('p','P','')").run();
  db.prepare(
    "INSERT INTO tickets(id,title,project_id,status) VALUES('t','T','p','ai_review')"
  ).run();
  db.prepare(
    "INSERT INTO review_findings(id,ticket_id,iteration,agent,severity,category,description,status) VALUES('f','t',1,'code-reviewer','major','correctness','Broken feature','open')"
  ).run();
  const prepare = vi.spyOn(db, "prepare");
  const before = getReviewContext(db, "t");
  expect(before.openFindings.map((f) => f.id)).toEqual(["f"]);
  expect(before.completion.canProceedToVerification).toBe(false);
  expect(prepare.mock.calls.filter(([sql]) => /FROM review_findings\b/.test(sql))).toHaveLength(1);
  markFixed(db, "f", "fixed");
  expect(checkComplete(db, "t").canProceedToVerification).toBe(true);
  const after = getReviewContext(db, "t");
  expect(after.openFindings).toEqual([]);
  expect(after.resolvedFindings.map((f) => f.id)).toEqual(["f"]);
  expect(after.completion).toEqual(checkComplete(db, "t"));
});
