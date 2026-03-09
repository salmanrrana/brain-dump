import { randomUUID } from "crypto";
import type {
  DbHandle,
  EpicReviewRun,
  EpicReviewRunStatus,
  EpicReviewRunTicket,
  EpicReviewRunTicketStatus,
} from "./types.ts";
import { EpicNotFoundError, ValidationError } from "./errors.ts";
import type { DbEpicReviewRunRow, DbEpicReviewRunTicketRow, DbTicketRow } from "./db-rows.ts";
import { addComment } from "./comment.ts";

export interface CreateEpicReviewRunParams {
  epicId: string;
  selectedTicketIds: string[];
  launchMode: string;
  provider?: string | null;
  steeringPrompt?: string | null;
  status?: EpicReviewRunStatus;
  summary?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface UpdateEpicReviewRunParams {
  epicReviewRunId: string;
  launchMode?: string;
  provider?: string | null;
  steeringPrompt?: string | null;
  status?: EpicReviewRunStatus;
  summary?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface UpdateEpicReviewRunTicketLinkParams {
  epicReviewRunId: string;
  ticketId: string;
  status?: EpicReviewRunTicketStatus;
  summary?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

function assertEpicExists(db: DbHandle, epicId: string): void {
  const row = db.prepare("SELECT id FROM epics WHERE id = ?").get(epicId) as
    | { id: string }
    | undefined;
  if (!row) {
    throw new EpicNotFoundError(epicId);
  }
}

function validateLaunchMode(launchMode: string): string {
  if (launchMode.trim().length === 0) {
    throw new ValidationError("Epic review run launchMode is required.");
  }

  return launchMode;
}

function validateSelectedTicketIds(selectedTicketIds: string[]): string[] {
  if (selectedTicketIds.length === 0) {
    throw new ValidationError("Epic review run requires at least one selected ticket.");
  }

  const uniqueIds = new Set(selectedTicketIds);
  if (uniqueIds.size !== selectedTicketIds.length) {
    throw new ValidationError("Epic review run selectedTicketIds must be unique.");
  }

  return selectedTicketIds;
}

function getEpicTickets(db: DbHandle, epicId: string, ticketIds: string[]): DbTicketRow[] {
  const placeholders = ticketIds.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT * FROM tickets WHERE id IN (${placeholders})`)
    .all(...ticketIds) as DbTicketRow[];

  if (rows.length !== ticketIds.length) {
    const foundIds = new Set(rows.map((row) => row.id));
    const missingIds = ticketIds.filter((ticketId) => !foundIds.has(ticketId));
    throw new ValidationError(`Epic review run tickets not found: ${missingIds.join(", ")}.`, {
      missingTicketIds: missingIds.join(","),
    });
  }

  const outsideEpicIds = rows.filter((row) => row.epic_id !== epicId).map((row) => row.id);
  if (outsideEpicIds.length > 0) {
    throw new ValidationError(
      `Epic review run tickets must belong to epic ${epicId}: ${outsideEpicIds.join(", ")}.`,
      { invalidTicketIds: outsideEpicIds.join(",") }
    );
  }

  return rows;
}

function readSelectedTicketIds(db: DbHandle, epicReviewRunId: string): string[] {
  const rows = db
    .prepare(
      `SELECT ticket_id
       FROM epic_review_run_tickets
       WHERE epic_review_run_id = ?
       ORDER BY position ASC, created_at ASC`
    )
    .all(epicReviewRunId) as Array<{ ticket_id: string }>;

  return rows.map((row) => row.ticket_id);
}

function toEpicReviewRun(db: DbHandle, row: DbEpicReviewRunRow): EpicReviewRun {
  return {
    id: row.id,
    epicId: row.epic_id,
    selectedTicketIds: readSelectedTicketIds(db, row.id),
    steeringPrompt: row.steering_prompt,
    launchMode: row.launch_mode,
    provider: row.provider,
    status: row.status as EpicReviewRunStatus,
    summary: row.summary,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getEpicReviewRunRow(db: DbHandle, epicReviewRunId: string): DbEpicReviewRunRow {
  const row = db.prepare("SELECT * FROM epic_review_runs WHERE id = ?").get(epicReviewRunId) as
    | DbEpicReviewRunRow
    | undefined;

  if (!row) {
    throw new ValidationError(`Epic review run not found: ${epicReviewRunId}`);
  }

  return row;
}

function getEpicReviewRunTicketLinkRow(
  db: DbHandle,
  epicReviewRunId: string,
  ticketId: string
): DbEpicReviewRunTicketRow {
  const row = db
    .prepare(
      `SELECT *
       FROM epic_review_run_tickets
       WHERE epic_review_run_id = ? AND ticket_id = ?`
    )
    .get(epicReviewRunId, ticketId) as DbEpicReviewRunTicketRow | undefined;

  if (!row) {
    throw new ValidationError(
      `Epic review run ticket link not found for run ${epicReviewRunId} and ticket ${ticketId}.`
    );
  }

  return row;
}

function getEpicTitle(db: DbHandle, epicId: string): string {
  const row = db.prepare("SELECT title FROM epics WHERE id = ?").get(epicId) as
    | { title: string }
    | undefined;

  if (!row) {
    throw new EpicNotFoundError(epicId);
  }

  return row.title;
}

function buildEpicReviewRunLaunchComment(
  run: EpicReviewRun,
  epicTitle: string,
  ticketTitle: string,
  selectedTicketCount: number
): string {
  const scopeLabel =
    selectedTicketCount === 1
      ? `Ticket scope: ${ticketTitle}`
      : `Ticket scope: ${ticketTitle} (${selectedTicketCount} tickets in this run)`;
  const steeringSection = run.steeringPrompt ? `\n\nSteering prompt:\n${run.steeringPrompt}` : "";

  return `Focused epic review launched.\n\nRun ID: ${run.id}\nEpic: ${epicTitle}\nLaunch mode: ${run.launchMode}\n${scopeLabel}\nNew findings and demo artifacts from this review will link back to this run.${steeringSection}`;
}

export function createEpicReviewRun(
  db: DbHandle,
  params: CreateEpicReviewRunParams
): EpicReviewRun {
  const {
    epicId,
    selectedTicketIds,
    launchMode,
    provider,
    steeringPrompt,
    status = "queued",
    summary,
    startedAt,
    completedAt,
  } = params;

  assertEpicExists(db, epicId);
  validateLaunchMode(launchMode);
  validateSelectedTicketIds(selectedTicketIds);
  getEpicTickets(db, epicId, selectedTicketIds);

  const epicReviewRunId = randomUUID();
  const now = new Date().toISOString();

  const createRun = db.transaction(() => {
    db.prepare(
      `INSERT INTO epic_review_runs
       (id, epic_id, steering_prompt, launch_mode, provider, status, summary, started_at, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      epicReviewRunId,
      epicId,
      steeringPrompt ?? null,
      launchMode,
      provider ?? null,
      status,
      summary ?? null,
      startedAt ?? null,
      completedAt ?? null,
      now,
      now
    );

    const insertLink = db.prepare(
      `INSERT INTO epic_review_run_tickets
       (id, epic_review_run_id, ticket_id, position, status, summary, started_at, completed_at, created_at)
       VALUES (?, ?, ?, ?, 'queued', NULL, NULL, NULL, ?)`
    );

    selectedTicketIds.forEach((ticketId, index) => {
      insertLink.run(randomUUID(), epicReviewRunId, ticketId, index, now);
    });
  });

  createRun();

  return getEpicReviewRun(db, epicReviewRunId);
}

export function getEpicReviewRun(db: DbHandle, epicReviewRunId: string): EpicReviewRun {
  const row = getEpicReviewRunRow(db, epicReviewRunId);
  return toEpicReviewRun(db, row);
}

export function listEpicReviewRuns(db: DbHandle, epicId: string): EpicReviewRun[] {
  assertEpicExists(db, epicId);

  const rows = db
    .prepare("SELECT * FROM epic_review_runs WHERE epic_id = ? ORDER BY created_at DESC")
    .all(epicId) as DbEpicReviewRunRow[];

  return rows.map((row) => toEpicReviewRun(db, row));
}

export function updateEpicReviewRun(
  db: DbHandle,
  params: UpdateEpicReviewRunParams
): EpicReviewRun {
  const {
    epicReviewRunId,
    launchMode,
    provider,
    steeringPrompt,
    status,
    summary,
    startedAt,
    completedAt,
  } = params;

  const existing = getEpicReviewRunRow(db, epicReviewRunId);
  const nextLaunchMode = launchMode ?? existing.launch_mode;
  validateLaunchMode(nextLaunchMode);

  const nextProvider = provider === undefined ? existing.provider : provider;
  const nextSteeringPrompt =
    steeringPrompt === undefined ? existing.steering_prompt : steeringPrompt;
  const nextStatus = status ?? (existing.status as EpicReviewRunStatus);
  const nextSummary = summary === undefined ? existing.summary : summary;
  const nextStartedAt = startedAt === undefined ? existing.started_at : startedAt;
  const nextCompletedAt = completedAt === undefined ? existing.completed_at : completedAt;
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE epic_review_runs
     SET steering_prompt = ?, launch_mode = ?, provider = ?, status = ?, summary = ?, started_at = ?, completed_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    nextSteeringPrompt ?? null,
    nextLaunchMode,
    nextProvider ?? null,
    nextStatus,
    nextSummary ?? null,
    nextStartedAt ?? null,
    nextCompletedAt ?? null,
    now,
    epicReviewRunId
  );

  return getEpicReviewRun(db, epicReviewRunId);
}

export function findLatestActiveEpicReviewRunIdForTicket(
  db: DbHandle,
  ticketId: string
): string | null {
  const row = db
    .prepare(
      `SELECT err.id
       FROM epic_review_runs err
       INNER JOIN epic_review_run_tickets errt ON errt.epic_review_run_id = err.id
       WHERE errt.ticket_id = ?
         AND err.status IN ('queued', 'running')
         AND errt.status IN ('queued', 'running')
       ORDER BY err.created_at DESC
       LIMIT 1`
    )
    .get(ticketId) as { id: string } | undefined;

  return row?.id ?? null;
}

export interface EpicReviewRunArtifactSummary {
  totalFindings: number;
  fixedFindings: number;
  openCritical: number;
  openMajor: number;
  openMinor: number;
  openSuggestion: number;
  demoGenerated: boolean;
}

export function getEpicReviewRunArtifactSummary(
  db: DbHandle,
  epicReviewRunId: string
): EpicReviewRunArtifactSummary {
  getEpicReviewRunRow(db, epicReviewRunId);

  const findingRows = db
    .prepare(
      `SELECT severity, status, COUNT(*) AS count
       FROM review_findings
       WHERE epic_review_run_id = ?
       GROUP BY severity, status`
    )
    .all(epicReviewRunId) as Array<{ severity: string; status: string; count: number }>;

  const demoRow = db
    .prepare("SELECT COUNT(*) AS count FROM demo_scripts WHERE epic_review_run_id = ?")
    .get(epicReviewRunId) as { count: number };

  const summary: EpicReviewRunArtifactSummary = {
    totalFindings: 0,
    fixedFindings: 0,
    openCritical: 0,
    openMajor: 0,
    openMinor: 0,
    openSuggestion: 0,
    demoGenerated: demoRow.count > 0,
  };

  for (const row of findingRows) {
    summary.totalFindings += row.count;

    if (row.status === "fixed") {
      summary.fixedFindings += row.count;
      continue;
    }

    if (row.status !== "open") {
      continue;
    }

    if (row.severity === "critical") summary.openCritical += row.count;
    if (row.severity === "major") summary.openMajor += row.count;
    if (row.severity === "minor") summary.openMinor += row.count;
    if (row.severity === "suggestion") summary.openSuggestion += row.count;
  }

  return summary;
}

export function addEpicReviewRunAuditComments(db: DbHandle, epicReviewRunId: string): void {
  const run = getEpicReviewRun(db, epicReviewRunId);
  const epicTitle = getEpicTitle(db, run.epicId);
  const ticketRows = getEpicTickets(db, run.epicId, run.selectedTicketIds);

  for (const ticket of ticketRows) {
    addComment(db, {
      ticketId: ticket.id,
      author: "brain-dump",
      type: "progress",
      content: buildEpicReviewRunLaunchComment(run, epicTitle, ticket.title, ticketRows.length),
    });
  }
}

export interface EpicReviewRunTicketLink {
  id: string;
  epicReviewRunId: string;
  ticketId: string;
  position: number;
  status: EpicReviewRunTicketStatus;
  summary: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

function toEpicReviewRunTicketLink(row: DbEpicReviewRunTicketRow): EpicReviewRunTicket {
  return {
    id: row.id,
    epicReviewRunId: row.epic_review_run_id,
    ticketId: row.ticket_id,
    position: row.position,
    status: row.status as EpicReviewRunTicketStatus,
    summary: row.summary,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export function listEpicReviewRunTicketLinks(
  db: DbHandle,
  epicReviewRunId: string
): EpicReviewRunTicketLink[] {
  getEpicReviewRunRow(db, epicReviewRunId);

  const rows = db
    .prepare(
      `SELECT *
       FROM epic_review_run_tickets
       WHERE epic_review_run_id = ?
       ORDER BY position ASC, created_at ASC`
    )
    .all(epicReviewRunId) as DbEpicReviewRunTicketRow[];

  return rows.map((row) => toEpicReviewRunTicketLink(row));
}

export function updateEpicReviewRunTicketLink(
  db: DbHandle,
  params: UpdateEpicReviewRunTicketLinkParams
): EpicReviewRunTicketLink {
  const { epicReviewRunId, ticketId, status, summary, startedAt, completedAt } = params;
  const existing = getEpicReviewRunTicketLinkRow(db, epicReviewRunId, ticketId);

  db.prepare(
    `UPDATE epic_review_run_tickets
     SET status = ?, summary = ?, started_at = ?, completed_at = ?
     WHERE epic_review_run_id = ? AND ticket_id = ?`
  ).run(
    status ?? (existing.status as EpicReviewRunTicketStatus),
    summary === undefined ? existing.summary : (summary ?? null),
    startedAt === undefined ? existing.started_at : (startedAt ?? null),
    completedAt === undefined ? existing.completed_at : (completedAt ?? null),
    epicReviewRunId,
    ticketId
  );

  return toEpicReviewRunTicketLink(getEpicReviewRunTicketLinkRow(db, epicReviewRunId, ticketId));
}
