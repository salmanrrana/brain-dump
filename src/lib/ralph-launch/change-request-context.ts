import type Database from "better-sqlite3";

interface ChangeRequestRow {
  ticket_id: string;
  content: string;
}

interface VerificationFailureRow {
  ticket_id: string;
  id: string;
  round: number;
  manifest: string;
  finished_at: string;
}

interface VerificationManifestStep {
  order: number;
  status: string;
  message: string;
  evidenceFiles?: Array<{ path: string; hash: string }>;
}

interface VerificationManifestContext {
  runId?: string;
  status?: string;
  stepVerdicts?: VerificationManifestStep[];
}

export function getHumanRequestedChangesByTicketId(
  sqlite: Database.Database,
  ticketIds: string[]
): Record<string, string | undefined> {
  if (ticketIds.length === 0) {
    return {};
  }

  const placeholders = ticketIds.map(() => "?").join(", ");
  const rows = sqlite
    .prepare(
      `SELECT tc.ticket_id, tc.content, tc.created_at
       FROM ticket_comments tc
       JOIN tickets t ON t.id = tc.ticket_id
       WHERE tc.ticket_id IN (${placeholders})
         AND tc.type = 'change_request'
         AND t.status != 'done'
         AND tc.created_at = (
           SELECT MAX(latest.created_at)
           FROM ticket_comments latest
           WHERE latest.ticket_id = tc.ticket_id
             AND latest.type = 'change_request'
         )
         AND NOT EXISTS (
           SELECT 1
           FROM demo_scripts approved_demo
           WHERE approved_demo.ticket_id = tc.ticket_id
             AND approved_demo.passed = 1
             AND approved_demo.completed_at IS NOT NULL
             AND approved_demo.completed_at > tc.created_at
         )`
    )
    .all(...ticketIds) as ChangeRequestRow[];

  return Object.fromEntries(rows.map((row) => [row.ticket_id, row.content]));
}

function formatVerificationFailure(row: VerificationFailureRow): string {
  const manifest = JSON.parse(row.manifest) as VerificationManifestContext;
  const failedSteps = (manifest.stepVerdicts ?? []).filter((step) => step.status === "failed");
  const stepLines = failedSteps.map((step) => {
    const evidence = step.evidenceFiles?.length
      ? step.evidenceFiles.map((file) => `${file.path} (${file.hash})`).join(", ")
      : "none";
    return `- Step ${step.order}: ${step.message}\n  Evidence: ${evidence}`;
  });

  return [
    `Verification run ${manifest.runId ?? row.id} failed at ${row.finished_at} (round ${row.round}).`,
    "",
    ...stepLines,
  ].join("\n");
}

export function getVerificationFailuresByTicketId(
  sqlite: Database.Database,
  ticketIds: string[]
): Record<string, string | undefined> {
  if (ticketIds.length === 0) {
    return {};
  }

  const placeholders = ticketIds.map(() => "?").join(", ");
  const rows = sqlite
    .prepare(
      `SELECT vr.ticket_id, vr.id, vr.round, vr.manifest, vr.finished_at
       FROM verification_runs vr
       JOIN tickets t ON t.id = vr.ticket_id
       WHERE vr.ticket_id IN (${placeholders})
         AND vr.status = 'failed'
         AND t.status != 'done'
         AND vr.round = (
           SELECT MAX(latest.round)
           FROM verification_runs latest
           WHERE latest.ticket_id = vr.ticket_id
             AND latest.status = 'failed'
         )
         AND NOT EXISTS (
           SELECT 1
           FROM verification_runs passing
           WHERE passing.ticket_id = vr.ticket_id
             AND passing.status = 'passed'
             AND passing.certified = 1
             AND passing.round > vr.round
         )`
    )
    .all(...ticketIds) as VerificationFailureRow[];

  return Object.fromEntries(rows.map((row) => [row.ticket_id, formatVerificationFailure(row)]));
}
