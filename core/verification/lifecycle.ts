import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { join } from "path";
import type { AttachmentType } from "../attachment-types.ts";
import { writeAttachmentFromFile } from "../attachments.ts";
import { addComment, addVerificationReportComment } from "../comment.ts";
import { getStateDir } from "../db.ts";
import type { DbTicketRow } from "../db-rows.ts";
import { InvalidStateError, TicketNotFoundError, ValidationError } from "../errors.ts";
import { updatePrdForDbTicketIfPresent } from "../prd-sync.ts";
import {
  execFileNoThrow as defaultExecFileNoThrow,
  handleEpicCompletionAutoPr,
  handleEpicCompletionLearnings,
  type HandleEpicCompletionAutoPrResult,
} from "../ship.ts";
import type { DbHandle, DemoStep, ExecFileNoThrowResult } from "../types.ts";
import { MANUAL_STEP_SKIP_MESSAGE, UNCERTIFIED_TRIPWIRE_MESSAGE } from "./messages.ts";
import { settleVerificationJob, settleVerificationJobForTicket } from "./queue.ts";
import {
  enqueueEpicContinuationForTicket,
  setAutonomousEpicLaunchActive,
} from "../epic-continuation.ts";
import { refreshEpicWorkflowTicketCounts } from "../epic-progress.ts";
import type { VerifierIdentity } from "../verifier-identity.ts";
import type {
  VerificationEvidenceFile,
  VerificationManifest,
  VerificationRun,
  VerificationStepVerdict,
} from "./types.ts";
import { assertTransition, isTicketStatus, WorkflowTransitionError } from "../workflow-steps.ts";

export interface VerificationJobLease {
  jobId: string;
  workerId: string;
  attemptCount: number;
}

export interface SettleVerificationLifecycleParams {
  run: VerificationRun;
  steps: DemoStep[];
  identity: VerifierIdentity;
  verificationJobLease?: VerificationJobLease | undefined;
  execFileNoThrow?: (
    command: string,
    args: string[],
    options?: { cwd?: string; timeoutMs?: number; maxBuffer?: number }
  ) => Promise<ExecFileNoThrowResult>;
}

export interface SettleVerificationLifecycleResult {
  epicAutoPr?: HandleEpicCompletionAutoPrResult;
}

function getTicketRow(db: DbHandle, ticketId: string): DbTicketRow {
  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as
    | DbTicketRow
    | undefined;
  if (!ticket) throw new TicketNotFoundError(ticketId);
  return ticket;
}

function stringifyEvidenceRefs(evidenceFiles: VerificationEvidenceFile[]): string {
  if (evidenceFiles.length === 0) return "none";
  return evidenceFiles.map((file) => `${file.path} (${file.hash})`).join(", ");
}

function severityForFailedStep(step: DemoStep | undefined): "critical" | "major" {
  const assertions = step?.automation?.assert ?? [];
  return assertions.some((assertion) => {
    const extra = assertion as Record<string, unknown>;
    return extra.severity === "critical" || extra.criticality === "critical";
  })
    ? "critical"
    : "major";
}

/**
 * Regenerated demos renumber and reshape their steps, so the same broken
 * assertion rarely keeps one step order across rounds. Normalize a failed
 * verdict's message (ids and numbers stripped) so "the same failure keeps
 * happening" survives demo rewrites.
 */
function failureFingerprints(verdict: VerificationStepVerdict): string[] {
  if (verdict.failureKeys && verdict.failureKeys.length > 0) {
    return verdict.failureKeys.map((key) => `assertion:${key}`);
  }
  const normalizedMessage = verdict.message
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<id>")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  return [`${verdict.automationKey ?? `legacy-step:${verdict.order}`}:${normalizedMessage}`];
}

function failedFingerprintsFromManifest(manifest: VerificationManifest): Map<string, number> {
  const fingerprints = new Map<string, number>();
  for (const step of manifest.stepVerdicts) {
    if (step.status === "failed") {
      for (const fingerprint of failureFingerprints(step)) {
        fingerprints.set(fingerprint, step.order);
      }
    }
  }
  return fingerprints;
}

function parseVerificationManifest(value: string): VerificationManifest | null {
  try {
    const manifest = JSON.parse(value) as Partial<VerificationManifest>;
    if (!Array.isArray(manifest.stepVerdicts)) return null;
    return manifest as VerificationManifest;
  } catch {
    return null;
  }
}

function ensureWorkflowState(db: DbHandle, ticketId: string, phase: string, now: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO ticket_workflow_state
     (id, ticket_id, current_phase, review_iteration, findings_count, findings_fixed, demo_generated, created_at, updated_at)
     VALUES (?, ?, ?, 0, 0, 0, 0, ?, ?)`
  ).run(randomUUID(), ticketId, phase, now, now);
}

interface RepeatedVerificationFailure {
  stepOrder: number;
}

function latestVerificationResolutionAt(db: DbHandle, ticketId: string): string | null {
  const row = db
    .prepare(
      `SELECT verification_streak_reset_at
       FROM ticket_workflow_state
       WHERE ticket_id = ?`
    )
    .get(ticketId) as { verification_streak_reset_at: string | null } | undefined;
  return row?.verification_streak_reset_at ?? null;
}

function latestThreeFailedRunsShareFailure(
  db: DbHandle,
  ticketId: string
): RepeatedVerificationFailure | null {
  const resolutionAt = latestVerificationResolutionAt(db, ticketId);
  const rows = db
    .prepare(
      `SELECT status, manifest
       FROM verification_runs
       WHERE ticket_id = ? AND (? IS NULL OR finished_at > ?)
       ORDER BY round DESC
       LIMIT 3`
    )
    .all(ticketId, resolutionAt, resolutionAt) as Array<{ status: string; manifest: string }>;
  if (rows.length < 3 || rows.some((row) => row.status !== "failed")) return null;

  const manifests = rows.map((row) => parseVerificationManifest(row.manifest));
  if (manifests.some((manifest) => manifest === null)) return null;

  const [latest, ...older] = manifests.map((manifest) => failedFingerprintsFromManifest(manifest!));
  for (const [fingerprint, order] of latest ?? []) {
    if (older.every((fingerprints) => fingerprints.has(fingerprint))) return { stepOrder: order };
  }
  return null;
}

/**
 * Alternating failed/uncertified rounds never trip the same-failure guard or
 * the consecutive-uncertified guard, so a ticket can bounce between
 * implementation and verification indefinitely. Infra errors are excluded:
 * the worker owns their retry budget and blocks them itself.
 */
const NON_CONVERGENCE_RUN_LIMIT = 5;

function countConsecutiveNonPassingRuns(db: DbHandle, ticketId: string): number {
  const resolutionAt = latestVerificationResolutionAt(db, ticketId);
  const rows = db
    .prepare(
      `SELECT status FROM verification_runs
       WHERE ticket_id = ? AND (? IS NULL OR finished_at > ?)
       ORDER BY round DESC
       LIMIT ?`
    )
    .all(ticketId, resolutionAt, resolutionAt, NON_CONVERGENCE_RUN_LIMIT) as Array<{
    status: string;
  }>;
  let count = 0;
  for (const row of rows) {
    if (row.status !== "failed" && row.status !== "uncertified") break;
    count += 1;
  }
  return count;
}

export type VerificationFailureKind = "connectivity" | "assertion";

export interface VerificationFailureClassification {
  kind: VerificationFailureKind;
  detail: string;
}

const CONNECTIVITY_ERROR_PATTERN =
  /err_connection_refused|econnrefused|econnreset|net::err_|cors|access-control-allow|connection refused|failed to fetch|networkerror|socket hang up/i;

export const CONNECTIVITY_FAILURE_GUIDANCE =
  "Verify the environment before changing product code: boot the app exactly as the runner does (random loopback {port}/{host}), confirm CORS allows any loopback origin, and read this run's boot log and screenshot evidence.";

/**
 * A run where every widget-level assertion fails at once is almost never one
 * broken feature — it is the app unreachable from the runner's randomized
 * loopback origin (port, CORS, boot readiness). Say so in the failure record,
 * so agents check the environment before "fixing" working product code.
 */
export function classifyVerificationRunFailure(
  run: VerificationRun
): VerificationFailureClassification | null {
  const failed = run.manifest.stepVerdicts.filter((verdict) => verdict.status === "failed");
  if (failed.length === 0) return null;
  if (failed.some((verdict) => CONNECTIVITY_ERROR_PATTERN.test(verdict.message))) {
    return {
      kind: "connectivity",
      detail:
        "A network-layer error (connection refused, CORS, failed fetch) appears in the failure output.",
    };
  }
  const wideUiFailure = failed.some(
    (verdict) =>
      verdict.automationKind === "ui" &&
      verdict.message
        .split("; ")
        .filter((part) => part.includes("expected") || part.includes("assertion failed")).length >=
        3
  );
  if (wideUiFailure) {
    return {
      kind: "connectivity",
      detail:
        "Several independent UI assertions failed in one step — typically the app was unreachable and every widget rendered its empty/error state.",
    };
  }
  return { kind: "assertion", detail: "A specific assertion failed while sibling checks passed." };
}

function classificationLines(run: VerificationRun): string[] {
  const classification = classifyVerificationRunFailure(run);
  if (!classification || classification.kind !== "connectivity") return [];
  return [
    `Likely cause: environment/connectivity — ${classification.detail}`,
    CONNECTIVITY_FAILURE_GUIDANCE,
  ];
}

function recordVerificationFindings(
  db: DbHandle,
  run: VerificationRun,
  steps: DemoStep[],
  now: string
): void {
  const workflowState = db
    .prepare("SELECT review_iteration FROM ticket_workflow_state WHERE ticket_id = ?")
    .get(run.ticketId) as { review_iteration: number } | undefined;
  ensureWorkflowState(db, run.ticketId, "implementation", now);
  const iteration = workflowState?.review_iteration ?? 0;
  const stepsByOrder = new Map(steps.map((step) => [step.order, step]));
  const failedVerdicts = run.manifest.stepVerdicts.filter((step) => step.status === "failed");
  const failureClassificationLines = classificationLines(run);

  for (const verdict of failedVerdicts) {
    const step = stepsByOrder.get(verdict.order);
    const description = [
      `Verification run ${run.id} failed step ${verdict.order}.`,
      step ? `Step: ${step.description}` : null,
      step ? `Expected: ${step.expectedOutcome}` : null,
      `Actual: ${verdict.message}`,
      ...failureClassificationLines,
      `Evidence: ${stringifyEvidenceRefs(verdict.evidenceFiles)}`,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");

    db.prepare(
      `INSERT INTO review_findings
       (id, ticket_id, iteration, agent, severity, category, description, status, created_at)
       VALUES (?, ?, ?, 'code-reviewer', ?, 'verification', ?, 'open', ?)`
    ).run(randomUUID(), run.ticketId, iteration, severityForFailedStep(step), description, now);
  }

  if (failedVerdicts.length > 0) {
    db.prepare(
      "UPDATE ticket_workflow_state SET findings_count = findings_count + ?, updated_at = ? WHERE ticket_id = ?"
    ).run(failedVerdicts.length, now, run.ticketId);
  }
}

function updateDemoStepStatusesForRun(db: DbHandle, run: VerificationRun, steps: DemoStep[]): void {
  const verdictsByOrder = new Map(
    run.manifest.stepVerdicts.map((verdict) => [verdict.order, verdict])
  );
  const updatedSteps = steps.map((step) => {
    const verdict = verdictsByOrder.get(step.order);
    if (!verdict) return step;
    return {
      ...step,
      status: verdict.status,
      notes: verdict.message,
    };
  });

  db.prepare(
    "UPDATE demo_scripts SET steps = ?, completed_at = NULL, passed = NULL WHERE ticket_id = ?"
  ).run(JSON.stringify(updatedSteps), run.ticketId);
}

function persistRun(db: DbHandle, run: VerificationRun): void {
  db.prepare(
    `INSERT INTO verification_runs
     (id, ticket_id, round, status, certified, manifest, git_sha, provider, actor,
      provider_source, execution_surface, worker_id, code_git_sha, started_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    run.id,
    run.ticketId,
    run.round,
    run.status,
    run.certified ? 1 : 0,
    JSON.stringify(run.manifest),
    run.gitSha,
    run.identity.provider,
    run.identity.actor,
    run.identity.providerSource,
    run.identity.executionSurface,
    run.identity.workerId,
    run.identity.codeGitSha,
    run.startedAt,
    run.finishedAt
  );
}

function evidenceAttachmentType(path: string): AttachmentType {
  if (path.endsWith("manifest.json")) return "verification-manifest";
  if (path.endsWith(".png")) return "verification-screenshot";
  return "api-evidence";
}

export function attachRunEvidenceAndReport(
  db: DbHandle,
  run: VerificationRun,
  steps: DemoStep[]
): void {
  const reportProvider = run.identity.provider;
  const stepsByOrder = new Map(steps.map((step) => [step.order, step]));
  const evidenceFiles = [
    ...run.manifest.evidenceFiles,
    {
      path: join(getStateDir(), "verification", run.id, "manifest.json"),
      hash: run.manifest.manifestHash,
    },
  ];
  const attachmentIdsByPath = new Map<string, string>();

  for (const evidence of evidenceFiles) {
    if (!existsSync(evidence.path)) {
      throw new ValidationError(
        `Verification evidence file is missing and cannot be reported: ${evidence.path}`
      );
    }
    const attachment = writeAttachmentFromFile(db, {
      ticketId: run.ticketId,
      filePath: evidence.path,
      metadata: {
        type: evidenceAttachmentType(evidence.path),
        priority: "primary",
        provider: reportProvider,
        description: `Verification run ${run.id} evidence (${evidence.hash})`,
      },
    });
    attachmentIdsByPath.set(evidence.path, attachment.id);
  }

  addVerificationReportComment(db, {
    ticketId: run.ticketId,
    provider: reportProvider,
    runId: run.id,
    status: run.status,
    integrityStatus: run.certified ? "valid" : "uncertified",
    manifestAttachmentId: attachmentIdsByPath.get(
      join(getStateDir(), "verification", run.id, "manifest.json")
    ),
    summary: `Verification run ${run.id} ${run.status}${run.certified ? " with certified evidence" : " without certification"}.`,
    steps: run.manifest.stepVerdicts.map((step) => ({
      order: step.order,
      status: step.status,
      coverage: stepsByOrder.get(step.order)?.covers,
      coverageRationale: stepsByOrder.get(step.order)?.coverageRationale,
      actual: step.message,
      evidenceAttachments: step.evidenceFiles
        .map((file) => attachmentIdsByPath.get(file.path))
        .filter((id): id is string => typeof id === "string"),
    })),
  });
}

function completeTicketIfCertified(db: DbHandle, ticketId: string, now: string): void {
  db.prepare(
    `UPDATE tickets
     SET status = 'done', completed_at = ?, updated_at = ?, is_blocked = 0, blocked_reason = NULL
     WHERE id = ?`
  ).run(now, now, ticketId);
  db.prepare(
    "UPDATE ticket_workflow_state SET current_phase = 'done', updated_at = ? WHERE ticket_id = ?"
  ).run(now, ticketId);
  db.prepare("UPDATE demo_scripts SET completed_at = ?, passed = 1 WHERE ticket_id = ?").run(
    now,
    ticketId
  );
  updatePrdForDbTicketIfPresent(db, ticketId, true);
  const epic = db.prepare("SELECT epic_id FROM tickets WHERE id = ?").get(ticketId) as
    | { epic_id: string | null }
    | undefined;
  if (epic?.epic_id) {
    // Keep the stored epic aggregate honest: certified completion is the only
    // path to done, so without this the epic_workflow_state counts drift to 0
    // while every ticket finishes.
    refreshEpicWorkflowTicketCounts(db, epic.epic_id);
    db.prepare(
      `UPDATE autonomous_epic_launches
       SET active = 0, updated_at = ?
       WHERE epic_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM tickets sibling
           WHERE sibling.epic_id = autonomous_epic_launches.epic_id
             AND sibling.status != 'done'
         )`
    ).run(now, epic.epic_id);
  }
}

function blockTicket(db: DbHandle, ticketId: string, reason: string, now: string): void {
  assertTicketStillInVerification(db, ticketId, "block verification ticket");
  db.prepare(
    "UPDATE tickets SET is_blocked = 1, blocked_reason = ?, updated_at = ? WHERE id = ?"
  ).run(reason, now, ticketId);
}

/**
 * End runner ownership when verification cannot make any more automatic
 * progress. A blocked ticket must not remain in ai_verification: that status
 * means a worker can still claim and settle it. Human-action tickets return to
 * the workable lane with their blocker and evidence preserved.
 */
export function returnVerificationTicketForHumanAction(
  db: DbHandle,
  ticketId: string,
  reason: string,
  now: string
): void {
  assertTicketStillInVerification(db, ticketId, "return verification ticket for human action");
  ensureWorkflowState(db, ticketId, "implementation", now);
  db.prepare(
    `UPDATE tickets
     SET status = 'in_progress', completed_at = NULL, is_blocked = 1,
         blocked_reason = ?, updated_at = ?
     WHERE id = ?`
  ).run(reason, now, ticketId);
  db.prepare(
    `UPDATE ticket_workflow_state
     SET current_phase = 'implementation', demo_generated = 0, updated_at = ?
     WHERE ticket_id = ?`
  ).run(now, ticketId);
  updatePrdForDbTicketIfPresent(db, ticketId, false, "in_progress");
}

function assertTicketStillInVerification(db: DbHandle, ticketId: string, action: string): void {
  const ticket = getTicketRow(db, ticketId);
  if (!isTicketStatus(ticket.status)) {
    throw new InvalidStateError("ticket", ticket.status, "known ticket status", action);
  }
  if (ticket.status !== "ai_verification") {
    throw new InvalidStateError("ticket", ticket.status, "ai_verification", action);
  }
}

function assertNoActiveExternalLease(db: DbHandle, ticketId: string): void {
  const job = db
    .prepare(
      `SELECT id, status, leased_by
       FROM verification_jobs
       WHERE ticket_id = ?`
    )
    .get(ticketId) as { id: string; status: string; leased_by: string | null } | undefined;
  if (job?.status === "running" && job.leased_by) {
    throw new ValidationError(
      `Cannot settle verification job ${job.id} without a trusted lease; it has an active verification lease owned by ${job.leased_by}.`
    );
  }
}

function blockTicketAfterRepeatedVerificationFailures(
  db: DbHandle,
  run: VerificationRun,
  repeatedFailure: RepeatedVerificationFailure | null,
  now: string
): void {
  ensureWorkflowState(db, run.ticketId, "ai_verification", now);
  const evidenceStepOrder =
    repeatedFailure?.stepOrder ??
    run.manifest.stepVerdicts.find((step) => step.status === "failed")?.order;
  const evidence = stringifyEvidenceRefs(
    run.manifest.stepVerdicts.find((step) => step.order === evidenceStepOrder)?.evidenceFiles ?? []
  );
  const reason = repeatedFailure
    ? `Verification failed 3 consecutive times on step ${repeatedFailure.stepOrder} (same failure signature each round). Latest run: ${run.id}. Evidence: ${evidence}`
    : `Verification has produced ${NON_CONVERGENCE_RUN_LIMIT} consecutive non-passing runs without converging on one failure. Latest run: ${run.id}. Evidence: ${evidence}`;
  returnVerificationTicketForHumanAction(db, run.ticketId, reason, now);
  addComment(db, {
    ticketId: run.ticketId,
    author: "brain-dump",
    type: "comment",
    content: [
      "## Needs Attention",
      "",
      reason,
      ...classificationLines(run).flatMap((line) => ["", line]),
      "",
      "Automatic verification has stopped. The ticket was returned to `in_progress` and blocked so a person can resolve it.",
      'After the cause is fixed and validated, resolve the blocker with the `review` tool, `action: "resolve-verification-failure"` (root cause, classification, fix commits, validation), then regenerate the demo to re-enter verification.',
    ].join("\n"),
    phase: "ai_verification",
    actorKind: "system",
    provider: run.identity.provider,
  });
}

/**
 * Human-readable causes for why a run was left uncertified. Skipped verdicts
 * are the only source of uncertification (manual steps, the verification-code
 * tripwire, and coverage rationales all record a skipped verdict), so their
 * messages are the reason — not stepVerdicts[0], which for an uncertified run
 * is usually a *passing* step's message.
 */
function uncertificationCauses(run: VerificationRun): string[] {
  const messages = run.manifest.stepVerdicts
    .filter((verdict) => verdict.status === "skipped")
    .map((verdict) => verdict.message);
  return [...new Set(messages)];
}

function previousRunWasUncertified(db: DbHandle, ticketId: string, currentRound: number): boolean {
  const resolutionAt = latestVerificationResolutionAt(db, ticketId);
  const row = db
    .prepare(
      `SELECT status FROM verification_runs
       WHERE ticket_id = ? AND round < ? AND (? IS NULL OR finished_at > ?)
       ORDER BY round DESC
       LIMIT 1`
    )
    .get(ticketId, currentRound, resolutionAt, resolutionAt) as { status: string } | undefined;
  return row?.status === "uncertified";
}

function describeNonCertifiableSteps(steps: DemoStep[]): string[] {
  const lines: string[] = [];
  for (const step of steps) {
    if (step.type === "manual") {
      lines.push(
        `- Step ${step.order} ("${step.description}") is manual. ${MANUAL_STEP_SKIP_MESSAGE}`
      );
    }
    if (step.coverageRationale?.trim()) {
      const covers = step.covers?.length ? step.covers.join(", ") : "no listed criteria";
      lines.push(
        `- Step ${step.order} claims coverage of ${covers} with a rationale instead of executable proof: "${step.coverageRationale.trim()}"`
      );
    }
  }
  return lines;
}

/**
 * Self-heal an uncertified run whose executed steps all behaved: instead of
 * blocking the ticket in ai_verification (stalling its epic), file an
 * actionable finding and send the ticket back to implementation so the agent
 * can regenerate a fully certifiable demo. Applies only once — a second
 * consecutive uncertified run blocks for human attention to avoid a
 * regenerate-forever loop.
 */
function returnUncertifiedRunToImplementation(
  db: DbHandle,
  run: VerificationRun,
  steps: DemoStep[],
  causes: string[],
  now: string
): void {
  const workflowState = db
    .prepare("SELECT review_iteration FROM ticket_workflow_state WHERE ticket_id = ?")
    .get(run.ticketId) as { review_iteration: number } | undefined;
  ensureWorkflowState(db, run.ticketId, "implementation", now);
  const nonCertifiableSteps = describeNonCertifiableSteps(steps);
  const causeBullets = causes.map((cause) => `- ${cause}`);
  const findingDescription = [
    `Verification run ${run.id} passed every executed step but could not be certified:`,
    ...causeBullets,
    ...(nonCertifiableSteps.length > 0
      ? ["Non-certifiable demo steps:", ...nonCertifiableSteps]
      : []),
    "Fix: regenerate the demo so every acceptance criterion is proven by executable automation (ui, api, command, or file steps). If a criterion genuinely cannot be automated, reword the criterion to match what automation can prove, or hand the ticket to a human verifier.",
  ].join("\n");

  db.prepare(
    `INSERT INTO review_findings
     (id, ticket_id, iteration, agent, severity, category, description, status, created_at)
     VALUES (?, ?, ?, 'code-reviewer', 'major', 'verification', ?, 'open', ?)`
  ).run(randomUUID(), run.ticketId, workflowState?.review_iteration ?? 0, findingDescription, now);
  db.prepare(
    "UPDATE ticket_workflow_state SET findings_count = findings_count + 1, updated_at = ? WHERE ticket_id = ?"
  ).run(now, run.ticketId);

  returnTicketToImplementationAfterVerificationFailure(db, run, now);

  addComment(db, {
    ticketId: run.ticketId,
    author: "brain-dump",
    type: "comment",
    content: [
      "## Verification could not certify — returned to implementation",
      "",
      `Every executed step in verification run ${run.id} **passed**. The run was left uncertified because the demo contains work the runner cannot prove on its own:`,
      "",
      ...causeBullets,
      ...(nonCertifiableSteps.length > 0 ? ["", ...nonCertifiableSteps] : []),
      "",
      "### What to do next",
      '1. Regenerate the demo (`review` tool, `action: "generate-demo"`) so every acceptance criterion is covered by executable automation — ui, api, command, or file steps. Do not use `coverageRationale` or manual steps.',
      "2. If a criterion genuinely cannot be automated, reword the acceptance criterion to match what automation can prove, or ask a human to verify and complete the ticket.",
      "3. Continue the normal workflow (complete-work → review → generate-demo) to re-enter verification.",
      "",
      "The ticket was automatically returned to `in_progress` so work can continue instead of stalling in verification. If the next run is also uncertified, the ticket will be blocked for human attention.",
    ].join("\n"),
    phase: "ai_verification",
    actorKind: "system",
    provider: run.identity.provider,
  });
}

function addVerificationAttentionComment(
  db: DbHandle,
  params: {
    ticketId: string;
    runId: string;
    reason: string;
    guidance: string;
    provider?: string | undefined;
  }
): void {
  addComment(db, {
    ticketId: params.ticketId,
    author: "brain-dump",
    type: "comment",
    content: `## Needs Attention — verification blocked\n\n${params.reason}\n\n${params.guidance}\n\nRun: ${params.runId}. Automatic verification has stopped; the ticket is now \`in_progress\` and blocked until a person resolves it.`,
    phase: "ai_verification",
    actorKind: "system",
    provider: params.provider ?? "brain-dump",
  });
}

/**
 * Blocked reason for an infra_error run. Safe to read stepVerdicts[0]: the
 * runner's catch path replaces the verdict list with a single entry holding
 * the real error. Shared with the worker so the two never drift.
 */
export function infraErrorBlockedReason(run: VerificationRun): string {
  return `Verification infra_error: ${run.manifest.stepVerdicts[0]?.message ?? "see manifest"}`;
}

export const INFRA_ERROR_GUIDANCE =
  "The verification runner could not execute the demo (app boot, environment, or step-spec problem) — this is not a product test failure. Check the boot log in the run manifest, fix the environment or the demo spec, and re-queue verification.";

/**
 * Loud final notice for an infra_error run that will not be retried. Called
 * from the lifecycle for direct (unleased) runs and from the worker when its
 * infra retries are exhausted, so retried attempts stay quiet.
 */
export function addInfraErrorAttentionComment(
  db: DbHandle,
  params: { ticketId: string; runId: string; reason: string; provider?: string | undefined }
): void {
  addVerificationAttentionComment(db, {
    ticketId: params.ticketId,
    runId: params.runId,
    reason: params.reason,
    guidance: INFRA_ERROR_GUIDANCE,
    provider: params.provider,
  });
}

function returnTicketToImplementationAfterVerificationFailure(
  db: DbHandle,
  run: VerificationRun,
  now: string
): void {
  const ticket = getTicketRow(db, run.ticketId);
  if (!isTicketStatus(ticket.status)) {
    throw new InvalidStateError("ticket", ticket.status, "known ticket status", "verify-fail");
  }
  try {
    assertTransition(ticket.status, "in_progress", "verify-fail");
  } catch (error) {
    if (error instanceof WorkflowTransitionError) {
      throw new InvalidStateError(
        "ticket",
        ticket.status,
        error.allowedFrom.join("|"),
        "verify-fail"
      );
    }
    throw error;
  }

  ensureWorkflowState(db, run.ticketId, "implementation", now);
  db.prepare(
    `UPDATE tickets
     SET status = 'in_progress', completed_at = NULL, is_blocked = 0, blocked_reason = NULL, updated_at = ?
     WHERE id = ?`
  ).run(now, run.ticketId);
  db.prepare(
    "UPDATE ticket_workflow_state SET current_phase = 'implementation', demo_generated = 0, updated_at = ? WHERE ticket_id = ?"
  ).run(now, run.ticketId);
  updatePrdForDbTicketIfPresent(db, run.ticketId, false, "in_progress");
  const continuation = enqueueEpicContinuationForTicket(db, run.ticketId, now);
  notifyWhenContinuationNotScheduled(db, run.ticketId, continuation, now);
}

/**
 * A verification failure hands the ticket back to implementation expecting an
 * autonomous resumer to pick it up. When an active epic launch exists but the
 * continuation could not be installed for this ticket (e.g. the epic's single
 * continuation row is held by a live run for a different ticket), that handoff
 * silently has no consumer — say so on the ticket instead of stalling quietly.
 * No comment is posted when the epic was never launched autonomously; a human
 * or interactive agent owns the loop in that mode.
 */
function notifyWhenContinuationNotScheduled(
  db: DbHandle,
  ticketId: string,
  continuation: { ticketId: string } | null,
  now: string
): void {
  if (continuation?.ticketId === ticketId) return;
  const activeLaunch = db
    .prepare(
      `SELECT l.epic_id
       FROM autonomous_epic_launches l
       JOIN tickets t ON t.epic_id = l.epic_id
       WHERE t.id = ? AND l.active = 1
         AND json_extract(l.profile_json, '$.expiresAt') > ?`
    )
    .get(ticketId, now) as { epic_id: string } | undefined;
  if (!activeLaunch) return;
  const detail = continuation
    ? `The epic's continuation slot is held by a run for ticket ${continuation.ticketId}.`
    : "No continuation could be enqueued for this epic.";
  addComment(db, {
    ticketId,
    author: "brain-dump",
    type: "comment",
    content: [
      "## Needs Attention — no autonomous resumer scheduled",
      "",
      `Verification returned this ticket to \`in_progress\`, but an automatic epic continuation was **not** scheduled for it. ${detail}`,
      "",
      "Resume it manually with `brain-dump verify worker --drain --pretty` (drains continuations after verification jobs) or relaunch the epic from the UI/CLI.",
    ].join("\n"),
    phase: "ai_verification",
    actorKind: "system",
    provider: "brain-dump",
  });
}

function settleJob(
  db: DbHandle,
  params: {
    ticketId: string;
    verificationJobLease?: VerificationJobLease | undefined;
    status: "succeeded" | "failed" | "blocked";
    error?: string | undefined;
    now: string;
    identity: VerifierIdentity;
  }
): void {
  if (params.verificationJobLease) {
    settleVerificationJob(db, {
      jobId: params.verificationJobLease.jobId,
      workerId: params.verificationJobLease.workerId,
      attemptCount: params.verificationJobLease.attemptCount,
      status: params.status,
      now: params.now,
      ...(params.error !== undefined ? { error: params.error } : {}),
      provider: params.identity.provider,
      actor: params.identity.actor,
      providerSource: params.identity.providerSource,
      executionSurface: params.identity.executionSurface,
      codeGitSha: params.identity.codeGitSha,
    });
    return;
  }
  assertNoActiveExternalLease(db, params.ticketId);
  settleVerificationJobForTicket(db, params.ticketId, params.status, {
    now: params.now,
    ...(params.error !== undefined ? { error: params.error } : {}),
    provider: params.identity.provider,
    actor: params.identity.actor,
    providerSource: params.identity.providerSource,
    executionSurface: params.identity.executionSurface,
    codeGitSha: params.identity.codeGitSha,
    ...(params.identity.workerId !== null ? { workerId: params.identity.workerId } : {}),
  });
}

export async function settleVerificationLifecycle(
  db: DbHandle,
  params: SettleVerificationLifecycleParams
): Promise<SettleVerificationLifecycleResult> {
  const { run, steps } = params;
  const identity = params.identity;
  const now = run.finishedAt;
  const shouldHandleEpicCompletion = run.status === "passed" && run.certified;

  db.transaction(() => {
    persistRun(db, run);
    attachRunEvidenceAndReport(db, run, steps);

    if (run.status === "passed" && run.certified) {
      assertTicketStillInVerification(db, run.ticketId, "complete verified ticket");
      completeTicketIfCertified(db, run.ticketId, now);
      settleJob(db, {
        ticketId: run.ticketId,
        verificationJobLease: params.verificationJobLease,
        status: "succeeded",
        now,
        identity,
      });
    } else if (run.status === "failed") {
      recordVerificationFindings(db, run, steps, now);
      updateDemoStepStatusesForRun(db, run, steps);
      const repeatedFailure = latestThreeFailedRunsShareFailure(db, run.ticketId);
      const nonConvergent =
        repeatedFailure === null &&
        countConsecutiveNonPassingRuns(db, run.ticketId) >= NON_CONVERGENCE_RUN_LIMIT;
      if (repeatedFailure === null && !nonConvergent) {
        returnTicketToImplementationAfterVerificationFailure(db, run, now);
        settleJob(db, {
          ticketId: run.ticketId,
          verificationJobLease: params.verificationJobLease,
          status: "failed",
          now,
          identity,
          error: "Verification assertions failed; ticket returned to implementation.",
        });
      } else {
        blockTicketAfterRepeatedVerificationFailures(db, run, repeatedFailure, now);
        settleJob(db, {
          ticketId: run.ticketId,
          verificationJobLease: params.verificationJobLease,
          status: "blocked",
          now,
          identity,
          error: repeatedFailure
            ? `Repeated verification failure on step ${repeatedFailure.stepOrder}.`
            : `Verification did not converge after ${NON_CONVERGENCE_RUN_LIMIT} consecutive non-passing runs.`,
        });
      }
    } else if (run.status === "uncertified") {
      updateDemoStepStatusesForRun(db, run, steps);
      const causes = uncertificationCauses(run);
      const blockedReason = `Verification uncertified: ${causes.join(" ") || "see manifest"}`;
      const tripwire = causes.includes(UNCERTIFIED_TRIPWIRE_MESSAGE);
      const nonConvergentUncertified =
        countConsecutiveNonPassingRuns(db, run.ticketId) >= NON_CONVERGENCE_RUN_LIMIT;
      if (
        !tripwire &&
        !previousRunWasUncertified(db, run.ticketId, run.round) &&
        !nonConvergentUncertified
      ) {
        returnUncertifiedRunToImplementation(db, run, steps, causes, now);
        settleJob(db, {
          ticketId: run.ticketId,
          verificationJobLease: params.verificationJobLease,
          status: "failed",
          now,
          identity,
          error:
            "Verification uncertified; ticket returned to implementation to produce a fully certifiable demo.",
        });
      } else {
        const guidance = tripwire
          ? "The diff touches verification/manifest code, so automated certification is disabled as a safety tripwire. A human must review the verification-code changes and complete the ticket manually."
          : previousRunWasUncertified(db, run.ticketId, run.round)
            ? "The regenerated demo is still not certifiable. A human should decide: make every demo step executable, reword the acceptance criteria to match what automation can prove, or verify the work manually and complete the ticket."
            : `Verification has alternated between failing and uncertified rounds for ${NON_CONVERGENCE_RUN_LIMIT} consecutive runs without converging. A human should review the run history and decide how to prove this ticket's criteria.`;
        returnVerificationTicketForHumanAction(db, run.ticketId, blockedReason, now);
        addVerificationAttentionComment(db, {
          ticketId: run.ticketId,
          runId: run.id,
          reason: blockedReason,
          guidance,
          provider: identity.provider,
        });
        settleJob(db, {
          ticketId: run.ticketId,
          verificationJobLease: params.verificationJobLease,
          status: "blocked",
          now,
          identity,
          error: blockedReason,
        });
      }
    } else if (run.status === "infra_error") {
      const blockedReason = infraErrorBlockedReason(run);
      if (params.verificationJobLease) {
        // The worker decides whether an infrastructure failure still has an
        // automatic retry. Keep runner ownership until that decision is made.
        blockTicket(db, run.ticketId, blockedReason, now);
      } else {
        returnVerificationTicketForHumanAction(db, run.ticketId, blockedReason, now);
      }
      if (!params.verificationJobLease) {
        // Leased (worker) runs may still be retried; the worker posts the
        // loud notice itself once its infra retries are exhausted.
        addInfraErrorAttentionComment(db, {
          ticketId: run.ticketId,
          runId: run.id,
          reason: blockedReason,
          provider: run.identity.provider,
        });
      }
      settleJob(db, {
        ticketId: run.ticketId,
        verificationJobLease: params.verificationJobLease,
        status: "blocked",
        now,
        identity,
        error: blockedReason,
      });
    }
  })();

  if (!shouldHandleEpicCompletion) return {};

  const epic = db.prepare("SELECT epic_id FROM tickets WHERE id = ?").get(run.ticketId) as
    | { epic_id: string | null }
    | undefined;
  if (epic?.epic_id) {
    const remaining = db
      .prepare("SELECT COUNT(*) AS count FROM tickets WHERE epic_id = ? AND status != 'done'")
      .get(epic.epic_id) as { count: number };
    if (remaining.count === 0) {
      setAutonomousEpicLaunchActive(db, epic.epic_id, false, run.finishedAt);
    }
  }

  handleEpicCompletionLearnings({ completedTicketId: run.ticketId }, { db });
  const epicAutoPr = await handleEpicCompletionAutoPr(
    { completedTicketId: run.ticketId },
    { db, execFileNoThrow: params.execFileNoThrow ?? defaultExecFileNoThrow }
  );
  return { epicAutoPr };
}
