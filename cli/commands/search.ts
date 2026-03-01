/**
 * Search command: full-text ticket search.
 *
 * Uses FTS5 when available, falls back to LIKE.
 * Supports project, status, and limit filters.
 */

import { searchTickets } from "../../core/index.ts";
import type { TicketStatus } from "../../core/types.ts";
import { parseFlags, optionalFlag, optionalEnumFlag, boolFlag, numericFlag } from "../lib/args.ts";
import { outputResult, outputError } from "../lib/output.ts";
import { getDb } from "../lib/db.ts";
import { ValidationError } from "../../core/index.ts";

const VALID_STATUSES = [
  "backlog",
  "ready",
  "in_progress",
  "ai_review",
  "human_review",
  "done",
] as const;

// ── Pretty formatting ──────────────────────────────────────────

interface SearchResultItem {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  projectName: string;
  tags: string | null;
}

function formatSearchPretty(results: SearchResultItem[], query: string): string {
  const lines: string[] = [];

  lines.push(`Search: "${query}"`);
  lines.push(`Found ${results.length} result${results.length === 1 ? "" : "s"}`);
  lines.push("");

  if (results.length === 0) {
    lines.push("No matching tickets.");
    return lines.join("\n");
  }

  for (const r of results) {
    const prio = r.priority ? ` [${r.priority}]` : "";
    const tags = r.tags ? ` (${r.tags})` : "";
    lines.push(`  ${r.id.slice(0, 8)} [${r.status}]${prio} ${r.title}${tags}`);
    lines.push(`           project: ${r.projectName}`);
  }

  return lines.join("\n");
}

// ── Handler ────────────────────────────────────────────────────

export function handle(action: string, args: string[]): void {
  // "search" is a top-level command: brain-dump search "query" [--flags]
  // action = first positional arg (the query), args = rest
  const allArgs = action ? [action, ...args] : args;

  // Extract the query: first non-flag argument
  const query = allArgs.find((a) => !a.startsWith("--"));

  if (!query) {
    throw new ValidationError(
      'Missing search query.\nUsage: brain-dump search "<query>" [--project <id>] [--status <status>] [--limit <n>] [--pretty]'
    );
  }

  // Re-parse flags from the full args minus the query
  const flags = parseFlags(allArgs);
  const pretty = boolFlag(flags, "pretty");
  const projectId = optionalFlag(flags, "project");
  const status = optionalEnumFlag(flags, "status", VALID_STATUSES) as TicketStatus | undefined;
  const limit = numericFlag(flags, "limit");

  try {
    const { db } = getDb();
    const results = searchTickets(db, {
      query,
      projectId,
      status,
      limit,
    });

    if (pretty) {
      console.log(formatSearchPretty(results, query));
    } else {
      outputResult(results, false);
    }
  } catch (e) {
    outputError(e);
  }
}
