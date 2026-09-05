/**
 * Ticket briefing: the structured context packet every launch surface needs.
 *
 * One module assembles what an AI (or human) should know about a ticket —
 * ticket fields, epic, related completed work, unaddressed change requests,
 * and the latest failed verification. Adapters (UI server functions, MCP
 * tools) render the packet; they do not re-query these tables themselves.
 */
import { getTicket } from "./ticket.ts";
import { listVerificationRunSummaries } from "./verification/index.ts";
import type { DbHandle, TicketWithProject } from "./types.ts";
import type { VerificationEvidenceFile } from "./verification/types.ts";

export interface BriefingEpic {
  id: string;
  title: string;
  description: string | null;
}

export interface RelatedDoneTicket {
  id: string;
  title: string;
  description: string | null;
}

export interface FailedVerificationSummary {
  runId: string;
  round: number;
  finishedAt: string;
  failedSteps: Array<{
    order: number;
    message: string;
    evidenceFiles: VerificationEvidenceFile[];
  }>;
}

export interface TicketBriefing {
  ticket: TicketWithProject;
  /** Present when the ticket belongs to an epic; carries the epic description. */
  epic: BriefingEpic | null;
  /** Done siblings in the same epic, oldest completion first. */
  relatedDoneTickets: RelatedDoneTicket[];
  /**
   * Latest human change request that no later certified demo has addressed,
   * so the implementer fixes it before anything else. Null when clear.
   */
  unaddressedChangeRequest: string | null;
  failedVerification: FailedVerificationSummary | null;
  verificationWarning: string | null;
}

export function getTicketBriefing(db: DbHandle, ticketId: string): TicketBriefing {
  const ticket = getTicket(db, ticketId);

  const relatedDoneTickets = ticket.epicId
    ? (
        db
          .prepare(
            `SELECT id, title, description FROM tickets
             WHERE epic_id = ? AND status = 'done' AND id != ?
             ORDER BY completed_at ASC LIMIT 5`
          )
          .all(ticket.epicId, ticket.id) as RelatedDoneTicket[]
      ).map((row) => ({
        ...row,
        description: row.description ?? null,
      }))
    : [];

  const unaddressedChangeRequest = findUnaddressedChangeRequest(db, ticket);

  const epicRow = ticket.epicId
    ? (db.prepare("SELECT id, title, description FROM epics WHERE id = ?").get(ticket.epicId) as
        | { id: string; title: string; description: string | null }
        | undefined)
    : undefined;

  return {
    ticket,
    epic: epicRow ? { ...epicRow, description: epicRow.description ?? null } : null,
    relatedDoneTickets,
    unaddressedChangeRequest,
    ...findLatestVerificationContext(db, ticketId),
  };
}

function findUnaddressedChangeRequest(db: DbHandle, ticket: TicketWithProject): string | null {
  if (ticket.status === "done") return null;

  const latestChangeRequest = db
    .prepare(
      `SELECT content, created_at FROM ticket_comments
       WHERE ticket_id = ? AND type = 'change_request'
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(ticket.id) as { content: string; created_at: string } | undefined;
  if (!latestChangeRequest) return null;

  const newerApproval = db
    .prepare(
      `SELECT id FROM demo_scripts
       WHERE ticket_id = ? AND passed = 1 AND completed_at > ?
       LIMIT 1`
    )
    .get(ticket.id, latestChangeRequest.created_at);
  if (newerApproval) return null;

  return latestChangeRequest.content;
}

function findLatestVerificationContext(
  db: DbHandle,
  ticketId: string
): Pick<TicketBriefing, "failedVerification" | "verificationWarning"> {
  const empty = { failedVerification: null, verificationWarning: null };
  // Old databases may not have verification yet. Other database errors must surface.
  if (
    !db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'verification_runs'")
      .get()
  ) {
    return empty;
  }
  const latestRun = listVerificationRunSummaries(db, ticketId, 1)[0];
  if (!latestRun) return empty;
  if (!latestRun.manifest || latestRun.integrityStatus === "tampered") {
    return {
      failedVerification: null,
      verificationWarning: `Verification run ${latestRun.id} has damaged or inconsistent evidence. Inspect verification history before relying on its verdict.`,
    };
  }
  if (latestRun.status !== "failed") return empty;

  return {
    verificationWarning: null,
    failedVerification: {
      runId: latestRun.id,
      round: latestRun.round,
      finishedAt: latestRun.finishedAt,
      failedSteps: latestRun.manifest.stepVerdicts
        .filter((step) => step.status === "failed")
        .map((step) => ({
          order: step.order,
          message: step.message,
          evidenceFiles: step.evidenceFiles,
        })),
    },
  };
}
