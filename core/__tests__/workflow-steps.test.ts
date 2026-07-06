import { readdirSync, readFileSync, statSync } from "fs";
import { dirname, join, relative } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  getTicketStatusLabel,
  isTicketStatus,
  KANBAN_STATUSES,
  RALPH_PRD_TICKET_STATUSES,
  STATUS_ORDER,
  TICKET_STATUSES,
  WorkflowTransitionError,
} from "../workflow-steps.ts";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const AUDITED_DIRS = ["core", "mcp-server", "cli", "src", "hooks", "scripts"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const ARRAY_REDECLARATION =
  '"backlog", "ready", "in_progress", "ai_review", "ai_verification", "done"';
const UNION_REDECLARATION =
  '| "backlog" | "ready" | "in_progress" | "ai_review" | "ai_verification" | "done"';

describe("workflow status specification", () => {
  it("defines the ticket statuses and metadata in workflow order", () => {
    expect(TICKET_STATUSES).toEqual([
      "backlog",
      "ready",
      "in_progress",
      "ai_review",
      "ai_verification",
      "done",
    ]);
    expect(KANBAN_STATUSES).toEqual(TICKET_STATUSES);
    expect(STATUS_ORDER).toEqual({
      backlog: 0,
      ready: 1,
      in_progress: 2,
      ai_review: 3,
      ai_verification: 4,
      done: 5,
      human_review: 99,
    });
    expect(getTicketStatusLabel("ai_review")).toBe("AI Review");
    expect(isTicketStatus("done")).toBe(true);
    expect(isTicketStatus("blocked")).toBe(false);
  });

  it("keeps Ralph PRD generation scoped to every non-done and legacy-repairable ticket", () => {
    expect(RALPH_PRD_TICKET_STATUSES).toEqual([
      "backlog",
      "ready",
      "in_progress",
      "ai_review",
      "ai_verification",
      "human_review",
    ]);
  });

  it("captures the currently enforced workflow transitions", () => {
    expect(canTransition("backlog", "in_progress", "start-work")).toBe(true);
    expect(canTransition("ready", "in_progress", "start-work")).toBe(true);
    expect(canTransition("in_progress", "ai_review", "complete-work")).toBe(true);
    expect(canTransition("ai_review", "ai_verification", "generate-demo")).toBe(true);
    expect(canTransition("ai_verification", "done", "verify-pass")).toBe(true);
    expect(canTransition("ai_verification", "in_progress", "verify-fail")).toBe(true);
  });

  it("rejects implementation regressions from review or completed statuses", () => {
    expect(() => assertTransition("ai_review", "in_progress", "start-work")).toThrow(
      WorkflowTransitionError
    );
    expect(() => assertTransition("human_review", "in_progress", "start-work")).toThrow(
      WorkflowTransitionError
    );
    expect(() => assertTransition("done", "in_progress", "start-work")).toThrow(
      WorkflowTransitionError
    );
  });

  it("does not allow new production status arrays or unions outside the canonical module", () => {
    const offenders = listSourceFiles().filter((filePath) => {
      const normalized = relative(PROJECT_ROOT, filePath);
      if (normalized === "core/workflow-steps.ts") return false;
      if (normalized.includes("__tests__") || normalized.endsWith(".test.tsx")) return false;
      if (normalized.endsWith(".test.ts")) return false;
      return hasRedeclaredStatusSequence(readFileSync(filePath, "utf8"));
    });

    expect(offenders.map((filePath) => relative(PROJECT_ROOT, filePath))).toEqual([]);
  });
});

function listSourceFiles(): string[] {
  return AUDITED_DIRS.flatMap((dir) => walk(join(PROJECT_ROOT, dir)));
}

function hasRedeclaredStatusSequence(content: string): boolean {
  const normalized = content.replace(/\s+/g, " ");
  return normalized.includes(ARRAY_REDECLARATION) || normalized.includes(UNION_REDECLARATION);
}

function walk(dir: string): string[] {
  let entries: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      entries = entries.concat(walk(path));
      continue;
    }
    const extension = path.slice(path.lastIndexOf("."));
    if (SOURCE_EXTENSIONS.has(extension)) {
      entries.push(path);
    }
  }
  return entries;
}
