/**
 * Epic progress calculations shared by UI adapters and workflow state refresh.
 */

import type { DbHandle } from "./types.ts";

export function sumTicketsByStatus(ticketsByStatus: Record<string, number>): number {
  return Object.values(ticketsByStatus).reduce((sum, count) => sum + count, 0);
}

export function getDoneTicketCount(ticketsByStatus: Record<string, number>): number {
  return ticketsByStatus["done"] ?? 0;
}

/** Progress percentage capped at 100 — never exceeds even if counts drift. */
export function computeEpicProgressPercent(ticketsDone: number, ticketsTotal: number): number {
  if (ticketsTotal <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((ticketsDone / ticketsTotal) * 100));
}

export function computeEpicTicketCounts(ticketsByStatus: Record<string, number>): {
  ticketsTotal: number;
  ticketsDone: number;
  progressPercent: number;
} {
  const ticketsTotal = sumTicketsByStatus(ticketsByStatus);
  const ticketsDone = getDoneTicketCount(ticketsByStatus);
  return {
    ticketsTotal,
    ticketsDone,
    progressPercent: computeEpicProgressPercent(ticketsDone, ticketsTotal),
  };
}

interface CountResult {
  count: number;
}

/** Refresh stored epic_workflow_state ticket counts from live ticket rows. */
export function refreshEpicWorkflowTicketCounts(
  db: DbHandle,
  epicId: string
): { ticketsTotal: number; ticketsDone: number } {
  const ticketsTotal = (
    db.prepare("SELECT COUNT(*) as count FROM tickets WHERE epic_id = ?").get(epicId) as CountResult
  ).count;
  const ticketsDone = (
    db
      .prepare("SELECT COUNT(*) as count FROM tickets WHERE epic_id = ? AND status = 'done'")
      .get(epicId) as CountResult
  ).count;
  const now = new Date().toISOString();

  db.prepare(
    "UPDATE epic_workflow_state SET tickets_total = ?, tickets_done = ?, updated_at = ? WHERE epic_id = ?"
  ).run(ticketsTotal, ticketsDone, now, epicId);

  return { ticketsTotal, ticketsDone };
}
