/**
 * Status command: project dashboard view.
 *
 * Shows ticket status summary, active tickets, active Ralph sessions,
 * and recent activity for a project.
 */

import { listTickets } from "../../core/index.ts";
import type { DbHandle } from "../../core/types.ts";
import { parseFlags, optionalFlag, boolFlag, numericFlag } from "../lib/args.ts";
import { outputResult, outputError } from "../lib/output.ts";
import { getDb } from "../lib/db.ts";
import { resolveProjectId } from "../lib/context.ts";

// ── Types ──────────────────────────────────────────────────────

interface StatusCounts {
  backlog: number;
  ready: number;
  in_progress: number;
  ai_review: number;
  human_review: number;
  done: number;
  total: number;
}

interface ActiveTicket {
  id: string;
  title: string;
  status: string;
  priority: string | null;
}

interface ActiveSession {
  id: string;
  ticketId: string;
  ticketTitle: string;
  currentState: string;
  startedAt: string;
}

interface RecentComment {
  ticketId: string;
  ticketTitle: string;
  author: string;
  type: string;
  content: string;
  createdAt: string;
}

interface StatusPayload {
  projectId: string;
  projectName: string;
  statusCounts: StatusCounts;
  activeTickets: ActiveTicket[];
  activeSessions: ActiveSession[];
  recentActivity: RecentComment[];
}

// ── Queries ────────────────────────────────────────────────────

function getStatusCounts(db: DbHandle, projectId: string): StatusCounts {
  const rows = db
    .prepare(`SELECT status, COUNT(*) as count FROM tickets WHERE project_id = ? GROUP BY status`)
    .all(projectId) as Array<{ status: string; count: number }>;

  const counts: StatusCounts = {
    backlog: 0,
    ready: 0,
    in_progress: 0,
    ai_review: 0,
    human_review: 0,
    done: 0,
    total: 0,
  };

  for (const row of rows) {
    if (row.status in counts) {
      (counts as unknown as Record<string, number>)[row.status] = row.count;
    }
    counts.total += row.count;
  }

  return counts;
}

function getActiveSessions(db: DbHandle, projectId: string): ActiveSession[] {
  const rows = db
    .prepare(
      `SELECT rs.id, rs.ticket_id, t.title as ticket_title,
              rs.current_state, rs.started_at
       FROM ralph_sessions rs
       JOIN tickets t ON rs.ticket_id = t.id
       WHERE t.project_id = ? AND rs.completed_at IS NULL
       ORDER BY rs.started_at DESC`
    )
    .all(projectId) as Array<{
    id: string;
    ticket_id: string;
    ticket_title: string;
    current_state: string;
    started_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    ticketId: r.ticket_id,
    ticketTitle: r.ticket_title,
    currentState: r.current_state,
    startedAt: r.started_at,
  }));
}

function getRecentActivity(db: DbHandle, projectId: string, limit: number): RecentComment[] {
  const rows = db
    .prepare(
      `SELECT tc.ticket_id, t.title as ticket_title,
              tc.author, tc.type, tc.content, tc.created_at
       FROM ticket_comments tc
       JOIN tickets t ON tc.ticket_id = t.id
       WHERE t.project_id = ?
       ORDER BY tc.created_at DESC
       LIMIT ?`
    )
    .all(projectId, limit) as Array<{
    ticket_id: string;
    ticket_title: string;
    author: string;
    type: string;
    content: string;
    created_at: string;
  }>;

  return rows.map((r) => ({
    ticketId: r.ticket_id,
    ticketTitle: r.ticket_title,
    author: r.author,
    type: r.type,
    content: r.content,
    createdAt: r.created_at,
  }));
}

function getProjectName(db: DbHandle, projectId: string): string {
  const row = db.prepare("SELECT name FROM projects WHERE id = ?").get(projectId) as
    | { name: string }
    | undefined;
  return row?.name ?? "Unknown";
}

// ── Pretty formatting ──────────────────────────────────────────

function formatStatusPretty(data: StatusPayload): string {
  const lines: string[] = [];
  const { statusCounts: c, activeTickets, activeSessions, recentActivity } = data;

  lines.push(`Project: ${data.projectName}`);
  lines.push("");

  // Status summary
  lines.push("Ticket Summary:");
  lines.push(
    `  backlog: ${c.backlog}  ready: ${c.ready}  in_progress: ${c.in_progress}  ai_review: ${c.ai_review}  human_review: ${c.human_review}  done: ${c.done}`
  );
  lines.push(`  total: ${c.total}`);
  lines.push("");

  // Active tickets
  lines.push("Active Tickets:");
  if (activeTickets.length === 0) {
    lines.push("  (none)");
  } else {
    for (const t of activeTickets) {
      const prio = t.priority ? ` [${t.priority}]` : "";
      lines.push(`  [${t.status}] ${t.id.slice(0, 8)} ${t.title}${prio}`);
    }
  }
  lines.push("");

  // Active sessions
  lines.push("Active Ralph Sessions:");
  if (activeSessions.length === 0) {
    lines.push("  (none)");
  } else {
    for (const s of activeSessions) {
      lines.push(
        `  ${s.id.slice(0, 8)} [${s.currentState}] ${s.ticketTitle} (started: ${s.startedAt})`
      );
    }
  }
  lines.push("");

  // Recent activity
  lines.push("Recent Activity:");
  if (recentActivity.length === 0) {
    lines.push("  (none)");
  } else {
    for (const a of recentActivity) {
      const preview = a.content.length > 80 ? a.content.slice(0, 77) + "..." : a.content;
      lines.push(`  ${a.createdAt.slice(0, 16)} [${a.author}] ${a.ticketTitle}`);
      lines.push(`    ${preview}`);
    }
  }

  return lines.join("\n");
}

// ── Handler ────────────────────────────────────────────────────

export function handle(action: string, args: string[]): void {
  // "status" is a top-level command, so action is really the first flag/arg
  const allArgs = action ? [action, ...args] : args;
  const flags = parseFlags(allArgs);
  const pretty = boolFlag(flags, "pretty");
  const limit = numericFlag(flags, "limit") ?? 10;

  try {
    const projectFlag = optionalFlag(flags, "project");
    const projectId = resolveProjectId({
      ...(projectFlag !== undefined && { projectFlag }),
      cwd: process.cwd(),
    });

    const { db } = getDb();
    const projectName = getProjectName(db, projectId);
    const statusCounts = getStatusCounts(db, projectId);

    // Active tickets: in_progress, ai_review, human_review
    const allTickets = listTickets(db, { projectId, limit: 100 });
    const activeStatuses = new Set(["in_progress", "ai_review", "human_review"]);
    const activeTickets: ActiveTicket[] = allTickets
      .filter((t) => activeStatuses.has(t.status))
      .map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
      }));

    const activeSessions = getActiveSessions(db, projectId);
    const recentActivity = getRecentActivity(db, projectId, limit);

    const payload: StatusPayload = {
      projectId,
      projectName,
      statusCounts,
      activeTickets,
      activeSessions,
      recentActivity,
    };

    if (pretty) {
      console.log(formatStatusPretty(payload));
    } else {
      outputResult(payload, false);
    }
  } catch (e) {
    outputError(e);
  }
}
