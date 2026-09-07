import type Database from "better-sqlite3";

interface ChangeRequestRow {
  ticket_id: string;
  content: string;
}

interface VerificationFailureRow {
  ticket_id: string;
  id: string;
  round: number;
  status: string;
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

function isVerificationManifestStep(value: unknown): value is VerificationManifestStep {
  if (typeof value !== "object" || value === null) return false;
  const step = value as Partial<VerificationManifestStep>;
  return (
    typeof step.order === "number" &&
    typeof step.status === "string" &&
    typeof step.message === "string"
  );
}

function parseVerificationManifest(value: string): VerificationManifestContext | null {
  try {
    const parsed = JSON.parse(value) as VerificationManifestContext;
    if (parsed.stepVerdicts !== undefined && !Array.isArray(parsed.stepVerdicts)) return null;
    return parsed;
  } catch {
    return null;
  }
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
  const manifest = parseVerificationManifest(row.manifest);
  if (!manifest) {
    return `Verification run ${row.id} ended with ${row.status} at ${row.finished_at} (round ${row.round}).\n\n- Manifest could not be parsed; inspect stored verification evidence for this run.`;
  }

  const unresolvedSteps = (manifest.stepVerdicts ?? []).filter(
    (step): step is VerificationManifestStep =>
      isVerificationManifestStep(step) && step.status !== "passed"
  );
  const stepLines = unresolvedSteps.map((step) => {
    const evidenceFiles = Array.isArray(step.evidenceFiles) ? step.evidenceFiles : [];
    const evidence = evidenceFiles.length
      ? evidenceFiles.map((file) => `${file.path} (${file.hash})`).join(", ")
      : "none";
    return `- Step ${step.order}: ${step.message}\n  Evidence: ${evidence}`;
  });

  return [
    `Verification run ${manifest.runId ?? row.id} ended with ${row.status} at ${row.finished_at} (round ${row.round}).`,
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
      `SELECT vr.ticket_id, vr.id, vr.round, vr.status, vr.manifest, vr.finished_at
       FROM verification_runs vr
       JOIN tickets t ON t.id = vr.ticket_id
       WHERE vr.ticket_id IN (${placeholders})
          AND vr.status IN ('failed', 'infra_error', 'uncertified')
          AND t.status != 'done'
          AND vr.round = (
            SELECT MAX(latest.round)
            FROM verification_runs latest
            WHERE latest.ticket_id = vr.ticket_id
              AND latest.status IN ('failed', 'infra_error', 'uncertified')
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
