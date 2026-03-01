/**
 * Context command: deep-dive into a ticket's full context.
 *
 * Aggregates ticket details, comments, review findings,
 * and acceptance criteria into a single payload.
 */

import { getTicket, listComments, getFindings } from "../../core/index.ts";
import type { TicketWithProject, Comment, ReviewFinding } from "../../core/types.ts";
import { parseFlags, requireFlag, boolFlag } from "../lib/args.ts";
import { outputResult, outputError } from "../lib/output.ts";
import { getDb } from "../lib/db.ts";

// ── Types ──────────────────────────────────────────────────────

interface ContextPayload {
  ticket: TicketWithProject;
  comments: Comment[];
  findings: ReviewFinding[];
}

// ── Pretty formatting ──────────────────────────────────────────

function formatContextPretty(data: ContextPayload): string {
  const lines: string[] = [];
  const { ticket, comments, findings } = data;

  // Header
  lines.push(`Ticket: ${ticket.title}`);
  lines.push(`  ID:       ${ticket.id}`);
  lines.push(`  Status:   ${ticket.status}`);
  if (ticket.priority) lines.push(`  Priority: ${ticket.priority}`);
  if (ticket.epicTitle) lines.push(`  Epic:     ${ticket.epicTitle}`);
  lines.push(`  Project:  ${ticket.project.name}`);
  if (ticket.tags.length > 0) lines.push(`  Tags:     ${ticket.tags.join(", ")}`);
  if (ticket.branchName) lines.push(`  Branch:   ${ticket.branchName}`);
  if (ticket.prUrl) lines.push(`  PR:       ${ticket.prUrl}`);
  lines.push("");

  // Description
  if (ticket.description) {
    lines.push("Description:");
    for (const line of ticket.description.split("\n")) {
      lines.push(`  ${line}`);
    }
    lines.push("");
  }

  // Acceptance criteria / subtasks
  if (ticket.subtasks.length > 0) {
    lines.push("Acceptance Criteria:");
    for (const sub of ticket.subtasks) {
      const check = sub.completed ? "[x]" : "[ ]";
      lines.push(`  ${check} ${sub.text}`);
    }
    lines.push("");
  }

  // Linked files
  if (ticket.linkedFiles.length > 0) {
    lines.push("Linked Files:");
    for (const f of ticket.linkedFiles) {
      lines.push(`  ${f}`);
    }
    lines.push("");
  }

  // Linked commits
  if (ticket.linkedCommits.length > 0) {
    lines.push("Linked Commits:");
    for (const c of ticket.linkedCommits) {
      const msg = c.message ? ` ${c.message}` : "";
      lines.push(`  ${c.hash.slice(0, 7)}${msg}`);
    }
    lines.push("");
  }

  // Comments
  lines.push(`Comments (${comments.length}):`);
  if (comments.length === 0) {
    lines.push("  (none)");
  } else {
    for (const c of comments) {
      const preview = c.content.length > 120 ? c.content.slice(0, 117) + "..." : c.content;
      lines.push(`  ${c.createdAt.slice(0, 16)} [${c.author}] (${c.type})`);
      lines.push(`    ${preview}`);
    }
  }
  lines.push("");

  // Findings
  lines.push(`Review Findings (${findings.length}):`);
  if (findings.length === 0) {
    lines.push("  (none)");
  } else {
    for (const f of findings) {
      const loc = f.filePath ? ` ${f.filePath}${f.lineNumber ? `:${f.lineNumber}` : ""}` : "";
      lines.push(`  [${f.severity}] [${f.status}] ${f.category}${loc}`);
      lines.push(`    ${f.description}`);
      if (f.suggestedFix) {
        lines.push(`    Fix: ${f.suggestedFix}`);
      }
    }
  }

  return lines.join("\n");
}

// ── Handler ────────────────────────────────────────────────────

export function handle(action: string, args: string[]): void {
  // "context" is a top-level command: action is first flag/arg
  const allArgs = action ? [action, ...args] : args;
  const flags = parseFlags(allArgs);
  const pretty = boolFlag(flags, "pretty");

  try {
    const ticketId = requireFlag(flags, "ticket");

    const { db } = getDb();
    const ticket = getTicket(db, ticketId);
    const comments = listComments(db, ticketId);
    const findings = getFindings(db, ticketId);

    const payload: ContextPayload = {
      ticket,
      comments,
      findings,
    };

    if (pretty) {
      console.log(formatContextPretty(payload));
    } else {
      outputResult(payload, false);
    }
  } catch (e) {
    outputError(e);
  }
}
