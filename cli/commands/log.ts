/**
 * Log command: chronological activity stream across tickets.
 *
 * Shows recent comments/activity joined with ticket titles,
 * filtered by project and/or ticket.
 */

import { getActivityLog } from "../../core/index.ts";
import type { ActivityLogEntry } from "../../core/index.ts";
import { parseFlags, optionalFlag, boolFlag, numericFlag } from "../lib/args.ts";
import { outputResult, outputError } from "../lib/output.ts";
import { getDb } from "../lib/db.ts";
import { resolveProjectId } from "../lib/context.ts";

// ── Pretty formatting ──────────────────────────────────────────

function formatLogPretty(entries: ActivityLogEntry[]): string {
  if (entries.length === 0) return "No activity found.";

  const lines: string[] = [];
  lines.push("Activity Log:");
  lines.push("");

  for (const entry of entries) {
    const preview = entry.content.length > 100 ? entry.content.slice(0, 97) + "..." : entry.content;
    lines.push(
      `  ${entry.createdAt.slice(0, 16)} [${entry.author}] (${entry.type}) ${entry.ticketTitle}`
    );
    lines.push(`    ${preview}`);
  }

  return lines.join("\n");
}

// ── Handler ────────────────────────────────────────────────────

export function handle(action: string, args: string[]): void {
  // "log" is a top-level command: action is first flag/arg
  const allArgs = action ? [action, ...args] : args;
  const flags = parseFlags(allArgs);
  const pretty = boolFlag(flags, "pretty");
  const limit = numericFlag(flags, "limit") ?? 20;

  try {
    const projectFlag = optionalFlag(flags, "project");
    const ticketId = optionalFlag(flags, "ticket");

    // Resolve project: explicit flag → cwd auto-detect → undefined (no filter)
    let projectId: string | undefined;
    if (projectFlag) {
      projectId = projectFlag;
    } else if (!ticketId) {
      // Auto-detect from cwd when no ticket filter specified
      try {
        projectId = resolveProjectId({ cwd: process.cwd() });
      } catch {
        // No project context — show all activity
      }
    }

    const { db } = getDb();
    const entries = getActivityLog(db, { projectId, ticketId, limit });

    if (pretty) {
      console.log(formatLogPretty(entries));
    } else {
      outputResult(entries, false);
    }
  } catch (e) {
    outputError(e);
  }
}
