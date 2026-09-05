/**
 * Review findings and demo script business logic for the core layer.
 *
 * Extracted from mcp-server/tools/review-findings.ts and mcp-server/tools/demo.ts.
 * All functions take a DbHandle and return typed results or throw CoreError subclasses.
 */

import { randomUUID } from "crypto";
import { resolveApiJsonAssertion } from "./verification/json-assertions.ts";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import type {
  DbHandle,
  ReviewFinding,
  ReviewCompletionStatus,
  DemoScript,
  DemoStep,
  DemoStepAutomationValue,
  FindingSeverity,
  FindingStatus,
  FindingAgent,
  TicketStatus,
} from "./types.ts";
import {
  CoreError,
  TicketNotFoundError,
  FindingNotFoundError,
  InvalidStateError,
  ValidationError,
} from "./errors.ts";
import type {
  DbTicketRow,
  DbReviewFindingRow,
  DbDemoScriptRow,
  DbTicketWorkflowStateRow,
} from "./db-rows.ts";
import {
  findLatestActiveEpicReviewRunIdForTicket,
  getEpicReviewRunArtifactSummary,
  listEpicReviewRunTicketLinks,
  updateEpicReviewRun,
  updateEpicReviewRunTicketLink,
} from "./epic-review-run.ts";
import { completeActiveSessionsForTicket } from "./session.ts";
import {
  addComment,
  resolveCommentIdentity,
  type ResolveCommentIdentityParams,
} from "./comment.ts";
import { enqueueVerificationJob } from "./verification/index.ts";
import {
  assertTransition,
  isTicketStatus,
  WorkflowTransitionError,
  type WorkflowTransitionAction,
} from "./workflow-steps.ts";
import { safeJsonParse } from "./json.ts";
import { runGitArgs } from "./git-utils.ts";
import { MAX_REVIEW_ROUNDS } from "./workflow.ts";

// ============================================
// Internal Helpers
// ============================================

function getTicketRow(db: DbHandle, ticketId: string): DbTicketRow {
  const row = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as
    | DbTicketRow
    | undefined;
  if (!row) throw new TicketNotFoundError(ticketId);
  return row;
}

function toReviewFinding(row: DbReviewFindingRow): ReviewFinding {
  const finding: ReviewFinding = {
    id: row.id,
    ticketId: row.ticket_id,
    iteration: row.iteration,
    agent: row.agent as FindingAgent,
    severity: row.severity as FindingSeverity,
    category: row.category,
    description: row.description,
    status: row.status as FindingStatus,
    createdAt: row.created_at,
  };
  if (row.epic_review_run_id !== null) finding.epicReviewRunId = row.epic_review_run_id;
  if (row.file_path !== null) finding.filePath = row.file_path;
  if (row.line_number !== null) finding.lineNumber = row.line_number;
  if (row.suggested_fix !== null) finding.suggestedFix = row.suggested_fix;
  return finding;
}

function toDemoScript(row: DbDemoScriptRow): DemoScript {
  let steps: DemoStep[];
  try {
    steps = JSON.parse(row.steps || "[]");
  } catch {
    throw new ValidationError(
      `Demo script ${row.id} has corrupted steps data. Regenerate with generate_demo_script.`
    );
  }

  return {
    id: row.id,
    ticketId: row.ticket_id,
    steps,
    ...(row.epic_review_run_id !== null ? { epicReviewRunId: row.epic_review_run_id } : {}),
    generatedAt: row.generated_at,
    executedAt: row.completed_at,
    feedback: row.feedback,
    passed: row.passed === null ? null : row.passed === 1,
  };
}

function buildEpicReviewRunCompletionSummary(
  summary: ReturnType<typeof getEpicReviewRunArtifactSummary>,
  ticketCounts?: { completedTickets: number; failedTickets: number }
): string {
  const ticketSection = ticketCounts
    ? ` Tickets completed: ${ticketCounts.completedTickets}, failed launches: ${ticketCounts.failedTickets}.`
    : "";
  return `Focused review completed. Findings: ${summary.totalFindings} total, ${summary.fixedFindings} fixed, ${summary.openCritical} open critical, ${summary.openMajor} open major.${ticketSection} Demo generated: ${summary.demoGenerated ? "yes" : "no"}.`;
}

function getOrCreateWorkflowState(db: DbHandle, ticketId: string): DbTicketWorkflowStateRow {
  let state = db
    .prepare("SELECT * FROM ticket_workflow_state WHERE ticket_id = ?")
    .get(ticketId) as DbTicketWorkflowStateRow | undefined;

  if (!state) {
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO ticket_workflow_state (id, ticket_id, current_phase, review_iteration, findings_count, findings_fixed, demo_generated, created_at, updated_at)
       VALUES (?, ?, 'ai_review', 1, 0, 0, 0, ?, ?)`
    ).run(id, ticketId, now, now);
    state = db.prepare("SELECT * FROM ticket_workflow_state WHERE ticket_id = ?").get(ticketId) as
      | DbTicketWorkflowStateRow
      | undefined;
    if (!state) {
      throw new CoreError(
        `Failed to create workflow state for ticket ${ticketId}.`,
        "WORKFLOW_STATE_CREATION_FAILED",
        { ticketId }
      );
    }
  }

  return state;
}

// ============================================
// Public API – Findings
// ============================================

type AiOperationCommentIdentity = Pick<
  ResolveCommentIdentityParams,
  "author" | "provider" | "modelProvider" | "modelName" | "env"
>;

const FINDING_SEVERITY_ICONS: Record<FindingSeverity, string> = {
  critical: "🔴",
  major: "🟠",
  minor: "🟡",
  suggestion: "💡",
};

export interface SubmitFindingParams {
  ticketId: string;
  agent: FindingAgent;
  severity: FindingSeverity;
  category: string;
  description: string;
  filePath?: string;
  lineNumber?: number;
  suggestedFix?: string;
  commentIdentity?: AiOperationCommentIdentity | undefined;
}

/**
 * Submit a review finding for a ticket.
 *
 * Validates that the ticket is in ai_review status.
 * Gets or creates workflow state and auto-sets the review iteration.
 *
 * @throws TicketNotFoundError if the ticket doesn't exist
 * @throws InvalidStateError if the ticket is not in ai_review status
 */
const FINDING_DEDUP_LINE_NEIGHBORHOOD = 10;
const FINDING_SEVERITY_RANK: Record<FindingSeverity, number> = {
  suggestion: 0,
  minor: 1,
  major: 2,
  critical: 3,
};

/**
 * Maximum simultaneously-open critical/major findings per ticket. Every open
 * blocker forces another implement → review round, so an unbounded batch is an
 * unbounded loop. Beyond the budget, new blocking findings are recorded as
 * minor (visible, nonblocking) — the reviewer must prioritize, not carpet-bomb.
 */
export const OPEN_BLOCKING_FINDINGS_BUDGET = 5;

/**
 * Repair-diff scope for re-review rounds.
 *
 * `reviewed_through_commit` is stamped when the reviewer hands the ticket to
 * verification (generate-demo). If the ticket bounces back (verification
 * failure repair) the next review pass runs with fresh context and would
 * otherwise re-litigate the whole ticket diff — the observed death-spiral
 * pattern: each pass minting new blocking findings on lines a previous pass
 * already accepted. Files changed since that commit are the only legitimate
 * anchors for NEW blocking findings; everything else was already reviewed.
 *
 * `changedFiles: null` means scope is unknown (first review round, no project
 * path, or the commit vanished after a rebase) — gating fails open so a git
 * hiccup can never suppress a real defect report.
 */
interface ReviewScopeContext {
  changedFiles: Set<string> | null;
  reviewedThroughCommit: string | null;
}

function getReviewScopeContext(db: DbHandle, ticketId: string): ReviewScopeContext {
  const state = db
    .prepare("SELECT reviewed_through_commit FROM ticket_workflow_state WHERE ticket_id = ?")
    .get(ticketId) as { reviewed_through_commit: string | null } | undefined;
  const reviewedThroughCommit = state?.reviewed_through_commit ?? null;
  if (!reviewedThroughCommit) return { changedFiles: null, reviewedThroughCommit: null };
  const projectPath = getTicketProjectPath(db, ticketId);
  if (!projectPath) return { changedFiles: null, reviewedThroughCommit };
  const diff = runGitArgs(["diff", "--name-only", `${reviewedThroughCommit}..HEAD`], projectPath);
  if (!diff.success) return { changedFiles: null, reviewedThroughCommit };
  return {
    changedFiles: new Set(diff.output.split("\n").filter(Boolean)),
    reviewedThroughCommit,
  };
}

function normalizeFindingPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function isPathInReviewScope(filePath: string, changedFiles: Set<string>): boolean {
  const normalized = normalizeFindingPath(filePath);
  if (changedFiles.has(normalized)) return true;
  // Findings sometimes carry absolute paths or paths from a subdirectory;
  // git emits repo-root-relative paths. Accept a suffix match either way.
  for (const changed of changedFiles) {
    if (normalized.endsWith(`/${changed}`) || changed.endsWith(`/${normalized}`)) return true;
  }
  return false;
}

function moreSevereFindingSeverity(
  existing: FindingSeverity,
  incoming: FindingSeverity
): FindingSeverity {
  return FINDING_SEVERITY_RANK[incoming] > FINDING_SEVERITY_RANK[existing] ? incoming : existing;
}

function normalizeFindingDescription(value: string): string {
  const withoutMergeSuffix = value.split("\n\n[duplicate report merged ", 1)[0] ?? value;
  const canonicalDescription =
    withoutMergeSuffix.split("\n\n[severity gate] ", 1)[0] ?? withoutMergeSuffix;
  return canonicalDescription
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<id>")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Reviewers re-report the same defect across passes (observed: duplicate
 * majors filed 30 seconds apart describing one refresh-state bug), and every
 * duplicate open major blocks check-complete again. Match on category + file +
 * line neighborhood + canonical description identity; merge instead of
 * inserting. Exact identity is deliberately conservative so similar but
 * independently resolvable defects never disappear behind one finding.
 */
function findDuplicateOpenFinding(
  db: DbHandle,
  params: {
    ticketId: string;
    category: string;
    description: string;
    filePath?: string | undefined;
    lineNumber?: number | undefined;
    /**
     * On re-review rounds (iteration >= 2), drop the description-identity
     * requirement: an open finding with the same category + file + line
     * neighborhood is the same defect. Fresh-context reviewers re-file the
     * same issue re-worded every round; exact-description matching lets those
     * resurrect as new blockers indefinitely. Only applies to findings with a
     * file anchor — findings without one would over-merge per category.
     */
    widened: boolean;
  }
): DbReviewFindingRow | null {
  const rows = db
    .prepare(
      "SELECT * FROM review_findings WHERE ticket_id = ? AND status = 'open' AND category = ?"
    )
    .all(params.ticketId, params.category) as DbReviewFindingRow[];
  const normalizedDescription = normalizeFindingDescription(params.description);
  for (const row of rows) {
    if ((row.file_path ?? null) !== (params.filePath ?? null)) continue;
    const bothLinesMissing = row.line_number == null && params.lineNumber == null;
    const bothLinesClose =
      row.line_number != null &&
      params.lineNumber != null &&
      Math.abs(row.line_number - params.lineNumber) <= FINDING_DEDUP_LINE_NEIGHBORHOOD;
    const lineClose = bothLinesMissing || bothLinesClose;
    if (!lineClose) continue;
    if (params.widened && row.file_path != null) {
      return row;
    }
    if (normalizeFindingDescription(row.description) === normalizedDescription) {
      return row;
    }
  }
  return null;
}

function submitFindingInTransaction(db: DbHandle, params: SubmitFindingParams): ReviewFinding {
  const {
    ticketId,
    agent,
    severity: requestedSeverity,
    category,
    description,
    filePath,
    lineNumber,
    suggestedFix,
    commentIdentity,
  } = params;

  const ticket = getTicketRow(db, ticketId);

  assertTicketTransition(ticket.status, "ai_review", "submit-finding", "submit review finding");

  const workflowStateForScope = db
    .prepare("SELECT review_iteration FROM ticket_workflow_state WHERE ticket_id = ?")
    .get(ticketId) as { review_iteration: number } | undefined;
  const isReReviewRound = (workflowStateForScope?.review_iteration ?? 0) >= 2;

  const duplicate = findDuplicateOpenFinding(db, {
    ticketId,
    category,
    description,
    filePath,
    lineNumber,
    widened: isReReviewRound,
  });
  if (duplicate) {
    const now = new Date().toISOString();
    const mergedSeverity = moreSevereFindingSeverity(
      duplicate.severity as FindingSeverity,
      requestedSeverity
    );
    db.prepare(
      `UPDATE review_findings
       SET description = description || ?, severity = ?,
           suggested_fix = COALESCE(suggested_fix, ?)
       WHERE id = ?`
    ).run(
      `\n\n[duplicate report merged ${now} from ${agent}] ${description.slice(0, 300)}`,
      mergedSeverity,
      suggestedFix ?? null,
      duplicate.id
    );
    const merged = db
      .prepare("SELECT * FROM review_findings WHERE id = ?")
      .get(duplicate.id) as DbReviewFindingRow;
    return { ...toReviewFinding(merged), deduplicated: true };
  }

  // Anti-spiral gates for NEW blocking findings. Both downgrade to minor
  // instead of rejecting: the observation stays visible and auditable, it just
  // stops forcing another implement → review round.
  let severity = requestedSeverity;
  const downgradeNotes: string[] = [];
  if (severity === "critical" || severity === "major") {
    if (isReReviewRound) {
      // Scope gate: on repair rounds, blocking findings must anchor to a file
      // changed since the last verification handoff. Unknown scope (no
      // stamped commit, no file anchor, git failure) fails open.
      const scope = getReviewScopeContext(db, ticketId);
      if (
        scope.changedFiles !== null &&
        filePath &&
        !isPathInReviewScope(filePath, scope.changedFiles)
      ) {
        severity = "minor";
        downgradeNotes.push(
          `Downgraded from ${requestedSeverity} to minor: ${filePath} has not changed since the last verification handoff (${scope.reviewedThroughCommit?.slice(0, 12)}). Re-review rounds are scoped to the repair diff; already-reviewed code is context, not a new blocker. If this is a genuine crash/data-loss defect, a human can re-raise it.`
        );
      }
    }
    if (severity === "critical" || severity === "major") {
      // Budget gate: every open blocker forces another fix round, so cap the
      // simultaneously-open blocking batch.
      const openBlockingCount = (
        db
          .prepare(
            `SELECT COUNT(*) as count FROM review_findings
             WHERE ticket_id = ? AND status = 'open' AND severity IN ('critical', 'major')`
          )
          .get(ticketId) as { count: number }
      ).count;
      if (openBlockingCount >= OPEN_BLOCKING_FINDINGS_BUDGET) {
        severity = "minor";
        downgradeNotes.push(
          `Downgraded from ${requestedSeverity} to minor: ${openBlockingCount} blocking findings are already open (budget: ${OPEN_BLOCKING_FINDINGS_BUDGET}). Fix the existing batch first; re-raise this if it is still blocking afterward.`
        );
      }
    }
  }

  const workflowState = getOrCreateWorkflowState(db, ticketId);
  const epicReviewRunId = findLatestActiveEpicReviewRunIdForTicket(db, ticketId);

  const findingId = randomUUID();
  const now = new Date().toISOString();

  const storedDescription =
    downgradeNotes.length > 0
      ? `${description}\n\n[severity gate] ${downgradeNotes.join("\n[severity gate] ")}`
      : description;

  db.prepare(
    `INSERT INTO review_findings (id, ticket_id, iteration, agent, severity, category, description, file_path, line_number, suggested_fix, epic_review_run_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`
  ).run(
    findingId,
    ticketId,
    workflowState.review_iteration,
    agent,
    severity,
    category,
    storedDescription,
    filePath ?? null,
    lineNumber ?? null,
    suggestedFix ?? null,
    epicReviewRunId,
    now
  );

  // Increment findings count
  db.prepare(
    "UPDATE ticket_workflow_state SET findings_count = findings_count + 1, updated_at = ? WHERE ticket_id = ?"
  ).run(now, ticketId);

  const identity = resolveCommentIdentity({
    phase: "ai_review",
    actorKind: "ai",
    role: "reviewer",
    ...commentIdentity,
  });
  const icon = FINDING_SEVERITY_ICONS[severity];
  const commentLines = [
    `Review finding: ${icon} [${severity}] ${category}`,
    "",
    storedDescription,
    ...(filePath ? ["", `File: ${filePath}${lineNumber ? `:${lineNumber}` : ""}`] : []),
    ...(suggestedFix ? ["", "Suggested fix:", suggestedFix] : []),
    ...(epicReviewRunId ? ["", `Epic review run: ${epicReviewRunId}`] : []),
  ];
  addComment(db, {
    ticketId,
    content: commentLines.join("\n"),
    type: "progress",
    ...identity,
  });

  const row = db
    .prepare("SELECT * FROM review_findings WHERE id = ?")
    .get(findingId) as DbReviewFindingRow;
  const finding = toReviewFinding(row);
  if (downgradeNotes.length > 0) {
    finding.severityDowngradedFrom = requestedSeverity;
  }
  return finding;
}

export function submitFinding(db: DbHandle, params: SubmitFindingParams): ReviewFinding {
  const submit = db.transaction(() => submitFindingInTransaction(db, params));
  // Finding identity is derived from existing open rows. Reserve the write
  // lock before that lookup so concurrent reviewers cannot both insert it.
  return submit.immediate();
}

export type MarkFixedStatus = "fixed" | "wont_fix" | "duplicate";

/**
 * Mark a review finding as fixed, won't fix, or duplicate.
 *
 * If marking as "fixed", increments findings_fixed count in workflow state.
 *
 * @throws FindingNotFoundError if the finding doesn't exist
 * @throws TicketNotFoundError if the associated ticket doesn't exist
 */
export interface MarkFixedCommentOptions {
  fixDescription?: string | undefined;
  commentIdentity?: AiOperationCommentIdentity | undefined;
}

export function markFixed(
  db: DbHandle,
  findingId: string,
  status: MarkFixedStatus,
  options: MarkFixedCommentOptions = {}
): ReviewFinding {
  const updateFinding = db.transaction(() => {
    const findingRow = db.prepare("SELECT * FROM review_findings WHERE id = ?").get(findingId) as
      | DbReviewFindingRow
      | undefined;
    if (!findingRow) throw new FindingNotFoundError(findingId);

    getTicketRow(db, findingRow.ticket_id);

    const now = new Date().toISOString();
    const fixedAt = status === "fixed" ? now : null;

    db.prepare("UPDATE review_findings SET status = ?, fixed_at = ? WHERE id = ?").run(
      status,
      fixedAt,
      findingId
    );

    if (status === "fixed" && findingRow.status !== "fixed") {
      db.prepare(
        "UPDATE ticket_workflow_state SET findings_fixed = findings_fixed + 1, updated_at = ? WHERE ticket_id = ?"
      ).run(now, findingRow.ticket_id);
    }

    const updated = db
      .prepare("SELECT * FROM review_findings WHERE id = ?")
      .get(findingId) as DbReviewFindingRow;
    const finding = toReviewFinding(updated);
    const statusLabel =
      status === "fixed"
        ? "✅ Finding marked as fixed"
        : status === "wont_fix"
          ? "⚠️ Finding marked as won't fix"
          : "↔️ Finding marked as duplicate";
    const identity = resolveCommentIdentity({
      phase: "ai_review",
      actorKind: "ai",
      role: "reviewer",
      ...options.commentIdentity,
    });
    addComment(db, {
      ticketId: finding.ticketId,
      content: [
        statusLabel,
        `Category: ${finding.category}`,
        `Severity: ${finding.severity}`,
        ...(options.fixDescription ? ["", "Fix description:", options.fixDescription] : []),
        ...(finding.epicReviewRunId ? ["", `Epic review run: ${finding.epicReviewRunId}`] : []),
      ].join("\n"),
      type: "progress",
      ...identity,
    });
    return finding;
  });

  return updateFinding.immediate();
}

export interface GetFindingsFilters {
  status?: FindingStatus;
  severity?: FindingSeverity;
  agent?: FindingAgent;
}

/**
 * Get review findings for a ticket with optional filters.
 *
 * @throws TicketNotFoundError if the ticket doesn't exist
 */
export function getFindings(
  db: DbHandle,
  ticketId: string,
  filters?: GetFindingsFilters
): ReviewFinding[] {
  getTicketRow(db, ticketId);

  let query = "SELECT * FROM review_findings WHERE ticket_id = ?";
  const queryParams: (string | number)[] = [ticketId];

  if (filters?.status) {
    query += " AND status = ?";
    queryParams.push(filters.status);
  }
  if (filters?.severity) {
    query += " AND severity = ?";
    queryParams.push(filters.severity);
  }
  if (filters?.agent) {
    query += " AND agent = ?";
    queryParams.push(filters.agent);
  }

  query += " ORDER BY created_at DESC";

  const rows = db.prepare(query).all(...queryParams) as DbReviewFindingRow[];
  return rows.map(toReviewFinding);
}

/**
 * Check if all critical/major findings have been resolved.
 *
 * @throws TicketNotFoundError if the ticket doesn't exist
 */
export function checkComplete(db: DbHandle, ticketId: string): ReviewCompletionStatus {
  getTicketRow(db, ticketId);

  const rows = db
    .prepare("SELECT * FROM review_findings WHERE ticket_id = ?")
    .all(ticketId) as DbReviewFindingRow[];

  const openCritical = rows.filter((f) => f.severity === "critical" && f.status === "open").length;
  const openMajor = rows.filter((f) => f.severity === "major" && f.status === "open").length;
  const openMinor = rows.filter((f) => f.severity === "minor" && f.status === "open").length;
  const openSuggestion = rows.filter(
    (f) => f.severity === "suggestion" && f.status === "open"
  ).length;
  const fixedFindings = rows.filter((f) => f.status === "fixed").length;

  const canProceed = openCritical === 0 && openMajor === 0;

  const message = canProceed
    ? `Review complete. All critical and major findings are resolved. Total: ${rows.length}, Fixed: ${fixedFindings}.`
    : `Cannot proceed. Open critical: ${openCritical}, Open major: ${openMajor}. Fix these first.`;

  return {
    complete: canProceed,
    canProceedToVerification: canProceed,
    canProceedToHumanReview: canProceed,
    openCritical,
    openMajor,
    openMinor,
    openSuggestion,
    totalFindings: rows.length,
    fixedFindings,
    message,
  };
}

// ============================================
// Public API – Review Context
// ============================================

export interface ReviewContextCriterion {
  id: string;
  text: string;
  status: string;
}

export interface ReviewContextFindingSummary {
  id: string;
  severity: FindingSeverity;
  category: string;
  description: string;
  filePath: string | null;
  lineNumber: number | null;
  agent: string;
}

export interface ReviewContextComment {
  type: string;
  author: string;
  createdAt: string;
  content: string;
}

export interface ReviewContext {
  ticket: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string | null;
  };
  acceptanceCriteria: ReviewContextCriterion[];
  /** Latest work_summary and test_report comments, oldest first. */
  workHistory: ReviewContextComment[];
  scope: {
    /**
     * "repair" when a reviewed-through commit is stamped (re-review round):
     * blocking findings must be caused by changedFiles. "initial" on the first
     * review: changedFiles comes from ticket-linked commits when available,
     * otherwise it is the branch diff vs. the base branch.
     * "unknown" when git could not produce a diff — review the ticket's
     * commits/linked files by hand.
     */
    kind: "repair" | "initial" | "unknown";
    reviewedThroughCommit: string | null;
    changedFiles: string[];
    baseRef: string | null;
    note: string;
  };
  reviewRules: {
    reviewIteration: number;
    isReReviewRound: boolean;
    openBlockingCount: number;
    blockingBudgetRemaining: number;
    maxReviewRounds: number;
    roundsRemaining: number;
  };
  openFindings: ReviewContextFindingSummary[];
  /** Closed findings (fixed / wont_fix / duplicate) — dedup context, not work. */
  resolvedFindings: ReviewContextFindingSummary[];
  completion: ReviewCompletionStatus;
}

function toContextFindingSummary(row: DbReviewFindingRow): ReviewContextFindingSummary {
  return {
    id: row.id,
    severity: row.severity as FindingSeverity,
    category: row.category,
    description: row.description,
    filePath: row.file_path,
    lineNumber: row.line_number,
    agent: row.agent,
  };
}

/**
 * One-call review packet for the fresh-eyes reviewer: what the ticket
 * requires, what was done, exactly which files are in review scope, the
 * finding history, and the anti-loop rules in effect. The reviewer prompt
 * makes this its mandatory first step so scope arrives as data up front
 * instead of being discovered through severity-gate downgrades.
 *
 * @throws TicketNotFoundError if the ticket doesn't exist
 */
export function getReviewContext(db: DbHandle, ticketId: string): ReviewContext {
  const ticket = getTicketRow(db, ticketId);

  const rawCriteria = safeJsonParse<
    Array<{ id?: string; criterion?: string; text?: string; status?: string; completed?: boolean }>
  >(ticket.subtasks, []);
  const acceptanceCriteria: ReviewContextCriterion[] = rawCriteria.map((criterion, index) => ({
    id: criterion.id ?? String(index + 1),
    text: criterion.criterion ?? criterion.text ?? "",
    status: criterion.status ?? (criterion.completed ? "passed" : "pending"),
  }));

  const workHistory = (
    db
      .prepare(
        `SELECT type, author, created_at, content FROM ticket_comments
         WHERE ticket_id = ? AND type IN ('work_summary', 'test_report')
         ORDER BY created_at DESC LIMIT 6`
      )
      .all(ticketId) as Array<{ type: string; author: string; created_at: string; content: string }>
  )
    .reverse()
    .map((row) => ({
      type: row.type,
      author: row.author,
      createdAt: row.created_at,
      content: row.content,
    }));

  const workflowState = db
    .prepare(
      "SELECT review_iteration, reviewed_through_commit FROM ticket_workflow_state WHERE ticket_id = ?"
    )
    .get(ticketId) as
    | { review_iteration: number; reviewed_through_commit: string | null }
    | undefined;
  const reviewIteration = workflowState?.review_iteration ?? 0;
  const isReReviewRound = reviewIteration >= 2;
  const reviewedThroughCommit = workflowState?.reviewed_through_commit ?? null;

  // Scope: repair diff when stamped, otherwise ticket diff vs. base branch.
  const projectPath = getTicketProjectPath(db, ticketId);
  let scope: ReviewContext["scope"] = {
    kind: "unknown",
    reviewedThroughCommit,
    changedFiles: [],
    baseRef: null,
    note: "Could not compute a diff for this ticket. Identify the ticket-owned changes from its linked commits and work summaries before reviewing.",
  };
  if (projectPath) {
    if (reviewedThroughCommit) {
      const diff = runGitArgs(
        ["diff", "--name-only", `${reviewedThroughCommit}..HEAD`],
        projectPath
      );
      if (diff.success) {
        scope = {
          kind: "repair",
          reviewedThroughCommit,
          changedFiles: diff.output.split("\n").filter(Boolean),
          baseRef: reviewedThroughCommit,
          note: "Re-review round: these are the files changed since the last verification handoff. Review their changed behavior and inspect unchanged callers, callees, schemas, state, and cleanup paths for side effects. Every new blocker must identify a causal change in this repair diff; the visible failure may manifest in unchanged code.",
        };
      }
    } else {
      const linkedCommits = safeJsonParse<Array<{ hash?: string }>>(ticket.linked_commits, [])
        .map((commit) => commit.hash?.trim())
        .filter((hash): hash is string => Boolean(hash));
      if (linkedCommits.length > 0) {
        const ticketFiles = new Set<string>();
        let allCommitsResolved = true;
        for (const hash of linkedCommits) {
          const diff = runGitArgs(
            ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", hash],
            projectPath
          );
          if (!diff.success) {
            allCommitsResolved = false;
            break;
          }
          for (const file of diff.output.split("\n").filter(Boolean)) ticketFiles.add(file);
        }
        if (allCommitsResolved) {
          scope = {
            kind: "initial",
            reviewedThroughCommit: null,
            changedFiles: [...ticketFiles].sort(),
            baseRef: `ticket-linked commits (${linkedCommits.length})`,
            note: "First review round: the primary diff is limited to this ticket's linked commits, even on a shared epic branch. Inspect adjacent unchanged code only to trace the impact of these changes. Report newly exposed defects only when a ticket change makes the failing path reachable or observably worse.",
          };
        }
      }

      if (scope.kind !== "unknown") {
        // Ticket-linked commits provide a narrower and more reliable boundary
        // than the shared branch diff.
      } else {
        const baseCandidates = ["main", "master"];
        for (const base of baseCandidates) {
          const merged = runGitArgs(["merge-base", base, "HEAD"], projectPath);
          if (!merged.success) continue;
          const diff = runGitArgs(["diff", "--name-only", `${merged.output}..HEAD`], projectPath);
          if (!diff.success) continue;
          scope = {
            kind: "initial",
            reviewedThroughCommit: null,
            changedFiles: diff.output.split("\n").filter(Boolean),
            baseRef: base,
            note: `First review round fallback: files changed on this branch since ${base}. No usable ticket-linked commits were available, so this may include sibling-ticket work. Establish ticket ownership from work history before filing findings, then inspect the impact cone of only those owned changes.`,
          };
          break;
        }
      }
    }
  }

  const findingRows = db
    .prepare("SELECT * FROM review_findings WHERE ticket_id = ? ORDER BY created_at ASC")
    .all(ticketId) as DbReviewFindingRow[];
  const openFindings = findingRows.filter((f) => f.status === "open").map(toContextFindingSummary);
  const resolvedFindings = findingRows
    .filter((f) => f.status !== "open")
    .map(toContextFindingSummary);

  const openBlockingCount = openFindings.filter(
    (f) => f.severity === "critical" || f.severity === "major"
  ).length;

  return {
    ticket: {
      id: ticket.id,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
    },
    acceptanceCriteria,
    workHistory,
    scope,
    reviewRules: {
      reviewIteration,
      isReReviewRound,
      openBlockingCount,
      blockingBudgetRemaining: Math.max(0, OPEN_BLOCKING_FINDINGS_BUDGET - openBlockingCount),
      maxReviewRounds: MAX_REVIEW_ROUNDS,
      roundsRemaining: Math.max(0, MAX_REVIEW_ROUNDS - reviewIteration),
    },
    openFindings,
    resolvedFindings,
    completion: checkComplete(db, ticketId),
  };
}

// ============================================
// Public API – Demo Scripts
// ============================================

export interface GenerateDemoParams {
  ticketId: string;
  steps: DemoStep[];
  commentIdentity?: AiOperationCommentIdentity | undefined;
}

export const DEMO_COMMAND_MAX_TIMEOUT_MS = 300_000;

const DEMO_COMMAND_SHELL_NAMES = new Set([
  "bash",
  "cmd",
  "cmd.exe",
  "fish",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe",
  "sh",
  "zsh",
]);

const DEMO_COMMAND_EVAL_FLAGS = new Set(["-c", "-lc", "/c"]);
const DEMO_COMMAND_ALLOWED_BINARIES = new Set([
  "brain-dump",
  "bun",
  "git",
  "node",
  "npm",
  "pnpm",
  "yarn",
]);
const DEMO_COMMAND_DENIED_TOKENS = new Set([
  "cat",
  "chmod",
  "chown",
  "cp",
  "curl",
  "dd",
  "mkfs",
  "mv",
  "nc",
  "netcat",
  "rm",
  "rsync",
  "scp",
  "sftp",
  "ssh",
  "sudo",
  "wget",
]);
const DEMO_COMMAND_PACKAGE_MANAGER_EXEC_SUBCOMMANDS = new Set(["create", "dlx", "exec", "x"]);
const DEMO_COMMAND_INTERPRETER_EVAL_FLAGS = new Set(["--eval", "--print", "-e", "-p"]);
const DEMO_COMMAND_INTERPRETERS = new Set(["bun", "node"]);

const SENSITIVE_AUTOMATION_FILE_BASENAMES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".npmrc",
  ".pypirc",
  "credentials",
  "credentials.json",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "id_rsa",
  "known_hosts",
]);
const SENSITIVE_AUTOMATION_FILE_EXTENSIONS = new Set([
  ".cer",
  ".crt",
  ".der",
  ".key",
  ".p12",
  ".pem",
  ".pfx",
]);
const SENSITIVE_AUTOMATION_FILE_NAME_PATTERN =
  /(secret|token|credential|password|private[-_]?key)/i;

function getCommandTokenName(value: string): string {
  return value.split(/[\\/]/).pop()?.toLowerCase() ?? value.toLowerCase();
}

function getPathBasename(value: string): string {
  return value.split("/").pop()?.toLowerCase() ?? value.toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface DemoCoverageCriterion {
  id: string;
  text: string;
}

function getSubtaskCriterionText(subtask: unknown): string {
  if (!isRecord(subtask)) return "";
  if (typeof subtask.text === "string") return subtask.text;
  if (typeof subtask.criterion === "string") return subtask.criterion;
  return "";
}

function getStepLabel(step: DemoStep, index: number): string {
  return `Demo step at index ${index}${typeof step.order === "number" ? ` (order ${step.order})` : ""}`;
}

function extractAcceptanceCriteria(description: string | null): string[] {
  if (!description) return [];

  const criteria: string[] = [];
  let inCriteriaSection = false;

  for (const line of description.split("\n")) {
    const trimmed = line.trim();
    if (/^##?\s*acceptance\s*criteria/i.test(trimmed)) {
      inCriteriaSection = true;
      continue;
    }
    if (inCriteriaSection && /^##/.test(trimmed)) {
      inCriteriaSection = false;
      continue;
    }

    const checkbox = trimmed.match(/^-\s*\[[ x]\]\s*(.+)/i);
    if (checkbox?.[1]) {
      criteria.push(checkbox[1].trim());
      continue;
    }

    if (inCriteriaSection) {
      const bullet = trimmed.match(/^[-*]\s+(.+)/);
      if (bullet?.[1]) criteria.push(bullet[1].trim());
    }
  }

  return criteria;
}

function getDemoCoverageCriteria(ticket: DbTicketRow): DemoCoverageCriterion[] {
  const descriptionCriteria = extractAcceptanceCriteria(ticket.description).map((text, index) => ({
    id: `criterion:${index + 1}`,
    text,
  }));
  const subtasks = safeJsonParse<unknown[]>(ticket.subtasks, []);
  const subtaskCriteria = subtasks.flatMap((subtask, index) => {
    const text = getSubtaskCriterionText(subtask);
    if (!isRecord(subtask) || text.trim().length === 0) {
      return [];
    }
    const id =
      typeof subtask.id === "string" && subtask.id.length > 0 ? subtask.id : String(index + 1);
    return [{ id: `subtask:${id}`, text: text.trim() }];
  });

  return [...descriptionCriteria, ...subtaskCriteria];
}

function validateAppRelativePath(value: string, path: string): void {
  if (!value.startsWith("/") || value.startsWith("//") || /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)) {
    throw new ValidationError(`${path} must be an app-relative path starting with "/".`);
  }
}

export function validateProjectRelativePath(value: string, path: string): void {
  if (value.length === 0) {
    throw new ValidationError(`${path} is required.`);
  }
  if (
    value.startsWith("/") ||
    value.startsWith("~") ||
    value.includes("\\") ||
    /^[a-zA-Z]:/.test(value) ||
    /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)
  ) {
    throw new ValidationError(`${path} must be a project-relative path.`);
  }
  if (value.split("/").some((segment) => segment === "..")) {
    throw new ValidationError(`${path} must not escape the project directory.`);
  }
}

const COVERAGE_STOP_WORDS = new Set([
  "able",
  "about",
  "after",
  "against",
  "also",
  "before",
  "cannot",
  "could",
  "every",
  "from",
  "have",
  "into",
  "must",
  "only",
  "should",
  "that",
  "their",
  "there",
  "this",
  "through",
  "when",
  "where",
  "with",
  "without",
]);

function normalizeCoverageText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getCoverageTokens(value: string): string[] {
  return normalizeCoverageText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !COVERAGE_STOP_WORDS.has(token));
}

function collectAutomationProofText(automation: DemoStep["automation"]): string[] {
  if (!automation) return [];
  if (automation.kind === "ui") {
    return [
      automation.route,
      ...(automation.actions ?? []).flatMap((action) => [action.selector, action.value]),
      ...automation.assert.flatMap((assertion) => [assertion.selector, assertion.expected]),
    ].filter((entry): entry is string => typeof entry === "string");
  }
  if (automation.kind === "api") {
    return [
      automation.request.method,
      automation.request.path,
      JSON.stringify(automation.request.body ?? ""),
      ...automation.assert.flatMap((assertion) => [
        assertion.path ?? "",
        JSON.stringify(assertion.expected),
      ]),
    ];
  }
  if (automation.kind === "command") {
    return [
      ...automation.command.argv,
      automation.command.cwd ?? "",
      ...automation.assert.map((assertion) => assertion.expected),
    ];
  }
  return [
    automation.path,
    ...automation.assert.flatMap((assertion) =>
      "expected" in assertion && typeof assertion.expected === "string" ? [assertion.expected] : []
    ),
  ];
}

function validateStepAppearsToCoverCriterion(
  step: DemoStep,
  criterion: DemoCoverageCriterion,
  index: number
): void {
  const criterionTokens = getCoverageTokens(criterion.text);
  if (criterionTokens.length === 0) return;

  const proofText = normalizeCoverageText(
    [step.description, step.expectedOutcome, ...collectAutomationProofText(step.automation)].join(
      " "
    )
  );
  const hasOverlap = criterionTokens.some((token) => proofText.includes(token));
  if (!hasOverlap) {
    throw new ValidationError(
      `${getStepLabel(step, index)} claims to cover ${criterion.id} (${criterion.text}) but the step description, expected outcome, and automation spec do not reference that criterion. Use a more specific step whose automation actually exercises the criterion.`
    );
  }
}

function validateSpawnSafeArgv(
  argv: unknown,
  path: string,
  allowedBinaries?: ReadonlySet<string>
): string[] {
  if (!Array.isArray(argv) || argv.length === 0) {
    throw new ValidationError(`${path} must be a non-empty argv array.`);
  }

  const shellMetacharacters = /[;&|<>`$]/;
  const executable = typeof argv[0] === "string" ? getCommandTokenName(argv[0]) : "";
  for (const [argIndex, arg] of argv.entries()) {
    if (typeof arg !== "string" || arg.length === 0) {
      throw new ValidationError(`${path}[${argIndex}] must be a non-empty string.`);
    }
    if (argIndex === 0 && /\s/.test(arg)) {
      throw new ValidationError(`${path} must be argv array data, not a shell command string.`);
    }
    if (DEMO_COMMAND_SHELL_NAMES.has(getCommandTokenName(arg))) {
      throw new ValidationError(`${path}[${argIndex}] must not invoke a shell interpreter.`);
    }
    if (DEMO_COMMAND_EVAL_FLAGS.has(arg.toLowerCase())) {
      throw new ValidationError(`${path}[${argIndex}] must not use shell evaluation flags.`);
    }
    if (shellMetacharacters.test(arg)) {
      throw new ValidationError(`${path}[${argIndex}] must not contain shell metacharacters.`);
    }
    if (arg.startsWith("/") || /^[a-zA-Z]:/.test(arg)) {
      throw new ValidationError(`${path}[${argIndex}] must not be an absolute path.`);
    }
    if (arg.split("/").some((segment) => segment === "..")) {
      throw new ValidationError(`${path}[${argIndex}] must not escape the project directory.`);
    }
    const tokenName = getCommandTokenName(arg);
    if (DEMO_COMMAND_DENIED_TOKENS.has(tokenName)) {
      throw new ValidationError(`${path}[${argIndex}] uses blocked command token "${tokenName}".`);
    }
  }

  if (allowedBinaries && !allowedBinaries.has(executable)) {
    throw new ValidationError(`${path}[0] uses unsupported command "${executable}".`);
  }
  if (DEMO_COMMAND_INTERPRETERS.has(executable)) {
    for (const arg of argv.slice(1) as string[]) {
      if (DEMO_COMMAND_INTERPRETER_EVAL_FLAGS.has(arg.toLowerCase())) {
        throw new ValidationError(`${path} must not use interpreter eval flags.`);
      }
    }
  }
  if (["bun", "npm", "pnpm", "yarn"].includes(executable)) {
    for (const arg of argv.slice(1) as string[]) {
      if (DEMO_COMMAND_PACKAGE_MANAGER_EXEC_SUBCOMMANDS.has(arg.toLowerCase())) {
        throw new ValidationError(`${path} must not use package-manager exec subcommands.`);
      }
    }
  }

  return argv;
}

function normalizeCommandTemplate(entry: unknown, source: string): string[] {
  const argv = Array.isArray(entry)
    ? entry
    : typeof entry === "string"
      ? entry.trim().split(/\s+/).filter(Boolean)
      : null;
  if (!argv || argv.length === 0 || !argv.every((part) => typeof part === "string")) {
    throw new ValidationError(
      `Invalid command template in ${source}. Provide argv arrays like ["make","lint"] or strings like "npx knip".`
    );
  }
  return argv as string[];
}

/**
 * Commands a project explicitly declares for verification, from
 * .brain-dump/verify.json `commands` or package.json `brainDump.verify.commands`.
 * The default demo-command allowlist only covers JS package managers; projects
 * whose acceptance criteria require other toolchains (make, go, npx linters)
 * declare exact argv templates here so demos can prove those criteria instead
 * of falling back to a never-certifiable coverage rationale. Templates come
 * from the reviewed project repo and are spawned without a shell; structural
 * safety checks (no shells, no metacharacters, no escaping the project) still
 * apply. A malformed declaration throws so a broken opt-in surfaces loudly.
 */
export function readProjectVerifyCommandTemplates(projectPath: string): string[][] {
  const configPath = join(projectPath, ".brain-dump", "verify.json");
  if (existsSync(configPath)) {
    let config: { commands?: unknown };
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8")) as { commands?: unknown };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ValidationError(`Could not parse ${configPath}: ${message}`);
    }
    if (config.commands !== undefined) {
      if (!Array.isArray(config.commands)) {
        throw new ValidationError(`${configPath} "commands" must be an array of argv templates.`);
      }
      return config.commands.map((entry) => normalizeCommandTemplate(entry, configPath));
    }
  }

  const packagePath = join(projectPath, "package.json");
  if (existsSync(packagePath)) {
    // Boot discovery only runs for demos with app steps, so a command-only
    // demo would otherwise turn a malformed package.json into a misleading
    // "unsupported command" rejection. Surface the parse failure here.
    let pkg: { brainDump?: { verify?: { commands?: unknown } } };
    try {
      pkg = JSON.parse(readFileSync(packagePath, "utf-8")) as {
        brainDump?: { verify?: { commands?: unknown } };
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ValidationError(
        `Could not parse ${packagePath} while reading brainDump.verify.commands: ${message}`
      );
    }
    const declared = pkg.brainDump?.verify?.commands;
    if (Array.isArray(declared)) {
      return declared.map((entry) =>
        normalizeCommandTemplate(entry, `${packagePath} (brainDump.verify.commands)`)
      );
    }
  }
  return [];
}

function matchesCommandTemplate(
  argv: unknown,
  templates: ReadonlyArray<readonly string[]> | undefined
): boolean {
  if (!templates?.length || !Array.isArray(argv)) return false;
  return templates.some(
    (template) =>
      template.length === argv.length && template.every((token, index) => token === argv[index])
  );
}

export function validateNonShellArgv(
  argv: unknown,
  path: string,
  projectCommandTemplates?: ReadonlyArray<readonly string[]>
): string[] {
  // An argv that exactly matches a project-declared template bypasses only the
  // binary allowlist; every structural safety check still runs.
  if (matchesCommandTemplate(argv, projectCommandTemplates)) {
    return validateSpawnSafeArgv(argv, path);
  }
  return validateSpawnSafeArgv(argv, path, DEMO_COMMAND_ALLOWED_BINARIES);
}

export function validateDemoAppBootArgv(argv: unknown, path: string): string[] {
  return validateSpawnSafeArgv(argv, path);
}

const HARDCODED_LOOPBACK_ORIGIN_PATTERN =
  /(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|\[::\]):\d{1,5}/i;
const APP_BIND_ORIGIN_FLAG_PATTERN =
  /^--?(?:[a-z0-9]+-)*(?:bind|host|hostname|listen|origin)(?:-[a-z0-9]+)*$/i;
const PORT_FLAG_WITH_VALUE_PATTERN =
  /^(?:(?:-p|-l)=?\d{1,5}|--?(?:[a-z0-9]+-)*(?:bind|listen|port)(?:-[a-z0-9]+)*=\d{1,5})$/i;
const PORT_VALUE_FLAG_PATTERN =
  /^(?:-p|-l|--?(?:bind|listen)|--?(?:[a-z0-9]+-)*port(?:-[a-z0-9]+)*)$/i;
const POSITIONAL_PORT_COMMAND_PATTERN = /^(?:serve|server|.*[-_.]server)$/i;
const POSITIONAL_BIND_COMMAND_PATTERN =
  /^(?:runserver|serve|server|server\.[a-z0-9]+|.*[-_.]server(?:\.[a-z0-9]+)?)$/i;
const POSITIONAL_PORT_INTERPRETER_PATTERN = /^(?:bun|deno|node|php|python\d*|ruby)$/i;
const PORT_ENV_ASSIGNMENT_PATTERN = /^(?:[A-Z0-9]+_)*PORT=\d{1,5}$/i;

/**
 * The runner boots the app on a random free loopback port and asserts against
 * that origin, so a start command pinned to a fixed port produces
 * ERR_CONNECTION_REFUSED rounds that look like product failures. Reject the
 * pin at authoring time; {port}/{host} tokens (and the exported PORT/HOST env
 * vars) are the supported contract.
 */
function validateAppStartUsesPortTokens(argv: string[], label: string): void {
  const executable = getPathBasename(argv[0] ?? "");
  for (const [index, part] of argv.entries()) {
    const previous = argv[index - 1] ?? "";
    const partFlag = part.includes("=") ? (part.split("=", 1)[0] ?? "") : "";
    const positionalBindAddress =
      index === argv.length - 1 &&
      !part.includes("://") &&
      argv
        .slice(0, index)
        .some((token) => POSITIONAL_BIND_COMMAND_PATTERN.test(getPathBasename(token)));
    const hardcodedLoopback =
      HARDCODED_LOOPBACK_ORIGIN_PATTERN.test(part) &&
      (APP_BIND_ORIGIN_FLAG_PATTERN.test(previous.replace(/=$/, "")) ||
        APP_BIND_ORIGIN_FLAG_PATTERN.test(partFlag) ||
        positionalBindAddress);
    const hardcoded =
      hardcodedLoopback ||
      PORT_FLAG_WITH_VALUE_PATTERN.test(part) ||
      PORT_ENV_ASSIGNMENT_PATTERN.test(part) ||
      (/^\d{1,5}$/.test(part) &&
        (PORT_VALUE_FLAG_PATTERN.test(previous.replace(/=$/, "")) ||
          previous.toLowerCase() === "http.server" ||
          previous === "--" ||
          (index === argv.length - 1 &&
            (POSITIONAL_PORT_COMMAND_PATTERN.test(executable) ||
              (POSITIONAL_PORT_INTERPRETER_PATTERN.test(executable) &&
                !previous.startsWith("-"))))));
    if (hardcoded) {
      throw new ValidationError(
        `${label} hardcodes a port or loopback origin ("${part}"). The verification runner boots the app on a random free port — use the {port} and {host} tokens instead (e.g. ["./start.sh", "--port", "{port}"]); the runner also exports PORT/HOST env vars.`
      );
    }
  }
}

interface DelegatedPackageScript {
  scriptName: string;
  packageDirectory: string | null;
}

function delegatedPackageScript(argv: string[], label: string): DelegatedPackageScript | null {
  const executable = getPathBasename(argv[0] ?? "").toLowerCase();
  if (!["bun", "npm", "pnpm", "yarn"].includes(executable)) return null;
  let index = 1;
  let packageDirectory: string | null = null;
  while (argv[index]?.startsWith("-")) {
    const option = argv[index] ?? "";
    const pathOption = /^(?:--prefix|--dir|--cwd)=(.+)$/.exec(option);
    if (pathOption?.[1]) {
      packageDirectory = pathOption[1];
      index += 1;
      continue;
    }
    if (["--prefix", "--dir", "--cwd", "-C"].includes(option)) {
      const value = argv[index + 1];
      if (!value) throw new ValidationError(`${label} ${option} requires a directory value.`);
      packageDirectory = value;
      index += 2;
      continue;
    }
    if (["--silent", "--if-present"].includes(option)) {
      index += 1;
      continue;
    }
    throw new ValidationError(
      `${label} uses package-manager option "${option}" that Brain Dump cannot safely resolve for fixed-port validation. Declare the app command directly with {port}, or use --prefix/--dir/--cwd with a project-relative directory.`
    );
  }
  const first = argv[index];
  if (!first) return null;
  const scriptName = first === "run" || first === "run-script" ? (argv[index + 1] ?? null) : first;
  if (!scriptName) return null;
  if (
    executable === "npm" &&
    !["run", "run-script", "start", "stop", "restart", "test"].includes(first)
  ) {
    return null;
  }
  return { scriptName, packageDirectory };
}

function tokenizePackageScript(script: string, label: string): string[] {
  const tokens: string[] = [];
  let token = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (const character of script.trim()) {
    if (escaped) {
      token += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      else token += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "&" || character === "|" || character === ";") break;
    if (/\s/.test(character)) {
      if (token) tokens.push(token);
      token = "";
      continue;
    }
    token += character;
  }
  if (quote || escaped) {
    throw new ValidationError(`${label} contains an unterminated quoted or escaped command.`);
  }
  if (token) tokens.push(token);
  return tokens;
}

function validateDelegatedPackageScriptUsesPortTokens(
  argv: string[],
  label: string,
  projectPath: string,
  cwd: string | undefined,
  visited = new Set<string>()
): void {
  const delegated = delegatedPackageScript(argv, label);
  if (!delegated) return;
  if (delegated.packageDirectory) {
    validateProjectRelativePath(delegated.packageDirectory, `${label} package directory`);
  }
  const packagePath = join(
    resolve(projectPath, cwd ?? ".", delegated.packageDirectory ?? "."),
    "package.json"
  );
  if (!existsSync(packagePath)) return;
  let pkg: { scripts?: Record<string, unknown> };
  try {
    pkg = JSON.parse(readFileSync(packagePath, "utf-8")) as {
      scripts?: Record<string, unknown>;
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ValidationError(
      `Could not parse ${packagePath} while resolving ${label}: ${message}`
    );
  }
  const script = pkg.scripts?.[delegated.scriptName];
  if (typeof script !== "string" || script.trim().length === 0) return;
  const scriptKey = `${packagePath}:${delegated.scriptName}`;
  if (visited.has(scriptKey)) {
    throw new ValidationError(
      `${label} contains a cyclic package-script delegation at ${scriptKey}.`
    );
  }
  visited.add(scriptKey);
  const scriptArgv = tokenizePackageScript(
    script,
    `${packagePath} scripts.${delegated.scriptName}`
  );
  validateAppStartUsesPortTokens(scriptArgv, `${packagePath} scripts.${delegated.scriptName}`);
  validateDelegatedPackageScriptUsesPortTokens(
    scriptArgv,
    `${packagePath} scripts.${delegated.scriptName}`,
    resolve(projectPath, cwd ?? ".", delegated.packageDirectory ?? "."),
    undefined,
    visited
  );
}

function validateDemoAppBoot(
  step: DemoStep,
  index: number,
  projectPath?: string | undefined
): void {
  if (step.app === undefined) return;
  const label = getStepLabel(step, index);
  if (!isRecord(step.app)) {
    throw new ValidationError(`${label} app boot must be an object.`);
  }
  const startArgv = validateDemoAppBootArgv(step.app.start, `${label} app.start`);
  validateAppStartUsesPortTokens(startArgv, `${label} app.start`);
  if (step.app.cwd !== undefined) {
    if (typeof step.app.cwd !== "string") {
      throw new ValidationError(`${label} app.cwd must be a string.`);
    }
    validateProjectRelativePath(step.app.cwd, `${label} app.cwd`);
  }
  if (projectPath) {
    validateDelegatedPackageScriptUsesPortTokens(
      startArgv,
      `${label} app.start`,
      projectPath,
      step.app.cwd
    );
  }
}

export function validateSafeAutomationFilePath(value: string, path: string): void {
  validateProjectRelativePath(value, path);
  const basename = getPathBasename(value);
  const extension = basename.includes(".") ? `.${basename.split(".").pop()}` : "";
  if (
    SENSITIVE_AUTOMATION_FILE_BASENAMES.has(basename) ||
    SENSITIVE_AUTOMATION_FILE_EXTENSIONS.has(extension) ||
    SENSITIVE_AUTOMATION_FILE_NAME_PATTERN.test(value)
  ) {
    throw new ValidationError(`${path} must not target sensitive credential or secret files.`);
  }
}

function validateStringRecord(value: unknown, path: string): void {
  if (!isRecord(value)) {
    throw new ValidationError(`${path} must be an object with string values.`);
  }
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") {
      throw new ValidationError(`${path}.${key} must be a string.`);
    }
  }
}

function validateAutomationValue(
  value: unknown,
  path: string,
  seen = new Set<object>()
): asserts value is DemoStepAutomationValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return;
    throw new ValidationError(`${path} must be a finite JSON number.`);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new ValidationError(`${path} must not contain circular data.`);
    seen.add(value);
    value.forEach((entry, index) => validateAutomationValue(entry, `${path}[${index}]`, seen));
    seen.delete(value);
    return;
  }
  if (isRecord(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new ValidationError(`${path} must be a plain JSON object.`);
    }
    if (Object.hasOwn(value, "toJSON")) {
      throw new ValidationError(`${path} must not define custom JSON serialization.`);
    }
    if (seen.has(value)) throw new ValidationError(`${path} must not contain circular data.`);
    seen.add(value);
    for (const [key, entry] of Object.entries(value)) {
      validateAutomationValue(entry, `${path}.${key}`, seen);
    }
    seen.delete(value);
    return;
  }
  throw new ValidationError(`${path} must be JSON-serializable data.`);
}

function validateUiAutomation(step: DemoStep, index: number): void {
  const label = getStepLabel(step, index);
  const automation = step.automation;
  if (!isRecord(automation) || automation.kind !== "ui") {
    throw new ValidationError(`${label} automation must be a UI automation spec.`);
  }
  if (typeof automation.route !== "string" || automation.route.length === 0) {
    throw new ValidationError(`${label} UI automation route is required.`);
  }
  validateAppRelativePath(automation.route, `${label} UI automation route`);
  if (automation.viewport !== undefined) {
    if (
      !isRecord(automation.viewport) ||
      ![automation.viewport.width, automation.viewport.height].every(
        (dimension) =>
          typeof dimension === "number" &&
          Number.isInteger(dimension) &&
          dimension >= 1 &&
          dimension <= 4096
      )
    ) {
      throw new ValidationError(
        `${label} UI automation viewport requires integer width and height from 1 to 4096 CSS pixels.`
      );
    }
  }
  if (automation.screenshot !== true) {
    throw new ValidationError(`${label} UI automation screenshot must be true.`);
  }
  if (automation.actions !== undefined) {
    if (!Array.isArray(automation.actions)) {
      throw new ValidationError(`${label} UI automation actions must be an array.`);
    }
    for (const [actionIndex, action] of automation.actions.entries()) {
      if (
        !isRecord(action) ||
        !["click", "fill", "press", "waitFor"].includes(String(action.act)) ||
        (action.selector !== undefined && typeof action.selector !== "string") ||
        (action.value !== undefined && typeof action.value !== "string")
      ) {
        throw new ValidationError(
          `${label} UI automation action at index ${actionIndex} is invalid.`
        );
      }
    }
  }
  if (!Array.isArray(automation.assert) || automation.assert.length === 0) {
    throw new ValidationError(`${label} UI automation assert must contain at least one assertion.`);
  }
  for (const [assertIndex, assertion] of automation.assert.entries()) {
    const assertionType = isRecord(assertion) ? String(assertion.type) : "";
    if (
      !isRecord(assertion) ||
      !["visible", "text", "url"].includes(assertionType) ||
      (assertion.selector !== undefined && typeof assertion.selector !== "string") ||
      (assertion.expected !== undefined && typeof assertion.expected !== "string")
    ) {
      throw new ValidationError(
        `${label} UI automation assertion at index ${assertIndex} is invalid.`
      );
    }
    if (
      (assertionType === "text" || assertionType === "url") &&
      (typeof assertion.expected !== "string" || assertion.expected.length === 0)
    ) {
      throw new ValidationError(
        `${label} UI automation ${assertionType} assertion at index ${assertIndex} requires a non-empty expected value.`
      );
    }
    if (assertionType === "text" && assertion.selector?.trim() === "body") {
      throw new ValidationError(
        `${label} UI automation text assertion at index ${assertIndex} must target a scoped selector instead of "body" so screenshot evidence frames the proving element.`
      );
    }
  }
  // "body is visible" passes on any page — including one showing only a
  // loading state — so it certifies nothing (observed: runs whose only UI
  // evidence was the splash spinner). Require at least one assertion with
  // real signal: text, url, or visibility of a specific element.
  const hasMeaningfulAssertion = automation.assert.some((assertion) => {
    if (!isRecord(assertion)) return false;
    if (assertion.type === "text" || assertion.type === "url") return true;
    const selector = typeof assertion.selector === "string" ? assertion.selector.trim() : "";
    return assertion.type === "visible" && selector !== "" && selector !== "body";
  });
  if (!hasMeaningfulAssertion) {
    throw new ValidationError(
      `${label} UI automation must include at least one meaningful assertion (a text or url assertion, or a visible assertion on a specific selector other than "body").`
    );
  }
}

function validateApiAutomation(step: DemoStep, index: number): void {
  const label = getStepLabel(step, index);
  const automation = step.automation;
  if (!isRecord(automation) || automation.kind !== "api") {
    throw new ValidationError(`${label} automation must be an API automation spec.`);
  }
  if (!isRecord(automation.request)) {
    throw new ValidationError(`${label} API automation request is required.`);
  }
  if (
    typeof automation.request.method !== "string" ||
    automation.request.method.length === 0 ||
    typeof automation.request.path !== "string" ||
    automation.request.path.length === 0
  ) {
    throw new ValidationError(`${label} API automation request method and path are required.`);
  }
  validateAppRelativePath(automation.request.path, `${label} API automation request path`);
  if (automation.request.headers !== undefined) {
    validateStringRecord(automation.request.headers, `${label} API automation request headers`);
  }
  if (automation.request.body !== undefined) {
    validateAutomationValue(automation.request.body, `${label} API automation request body`);
  }
  if (!Array.isArray(automation.assert) || automation.assert.length === 0) {
    throw new ValidationError(
      `${label} API automation assert must contain at least one assertion.`
    );
  }
  for (const [assertIndex, assertion] of automation.assert.entries()) {
    if (
      !isRecord(assertion) ||
      !["status", "jsonPath", "bodyContains"].includes(String(assertion.type)) ||
      !Object.hasOwn(assertion, "expected") ||
      assertion.expected === undefined
    ) {
      throw new ValidationError(
        `${label} API automation assertion at index ${assertIndex} is invalid.`
      );
    }
    validateAutomationValue(
      assertion.expected,
      `${label} API automation assertion at index ${assertIndex} expected`
    );
    if (assertion.type === "jsonPath") {
      resolveApiJsonAssertion({ path: assertion.path, expected: assertion.expected });
    }
  }
}

function validateCommandAutomation(
  step: DemoStep,
  index: number,
  projectCommandTemplates?: ReadonlyArray<readonly string[]>
): void {
  const label = getStepLabel(step, index);
  const automation = step.automation;
  if (!isRecord(automation) || automation.kind !== "command") {
    throw new ValidationError(`${label} automation must be a command automation spec.`);
  }
  if (!isRecord(automation.command)) {
    throw new ValidationError(`${label} command automation command is required.`);
  }

  validateNonShellArgv(
    automation.command.argv,
    `${label} command automation argv`,
    projectCommandTemplates
  );
  if (automation.command.cwd !== undefined) {
    if (typeof automation.command.cwd !== "string") {
      throw new ValidationError(`${label} command automation cwd must be a string.`);
    }
    validateProjectRelativePath(automation.command.cwd, `${label} command automation cwd`);
  }
  if (!Number.isSafeInteger(automation.command.timeoutMs) || automation.command.timeoutMs <= 0) {
    throw new ValidationError(`${label} command automation timeoutMs must be a positive integer.`);
  }
  if (automation.command.timeoutMs > DEMO_COMMAND_MAX_TIMEOUT_MS) {
    throw new ValidationError(
      `${label} command automation timeoutMs must be at most ${DEMO_COMMAND_MAX_TIMEOUT_MS}ms.`
    );
  }
  if (
    !Number.isSafeInteger(automation.command.expectedExitCode) ||
    automation.command.expectedExitCode < 0
  ) {
    throw new ValidationError(
      `${label} command automation expectedExitCode must be a non-negative integer.`
    );
  }
  if (!Array.isArray(automation.assert) || automation.assert.length === 0) {
    throw new ValidationError(
      `${label} command automation assert must contain at least one stdout/stderr assertion.`
    );
  }
  for (const [assertIndex, assertion] of automation.assert.entries()) {
    if (
      !isRecord(assertion) ||
      !["stdoutContains", "stdoutNotContains", "stderrContains", "stderrNotContains"].includes(
        String(assertion.type)
      ) ||
      typeof assertion.expected !== "string" ||
      assertion.expected.length === 0
    ) {
      throw new ValidationError(
        `${label} command automation assertion at index ${assertIndex} is invalid.`
      );
    }
  }
}

function validateFileAutomation(step: DemoStep, index: number): void {
  const label = getStepLabel(step, index);
  const automation = step.automation;
  if (!isRecord(automation) || automation.kind !== "file") {
    throw new ValidationError(`${label} automation must be a file automation spec.`);
  }
  if (typeof automation.path !== "string") {
    throw new ValidationError(`${label} file automation path is required.`);
  }
  validateSafeAutomationFilePath(automation.path, `${label} file automation path`);
  if (!Array.isArray(automation.assert) || automation.assert.length === 0) {
    throw new ValidationError(
      `${label} file automation assert must contain at least one assertion.`
    );
  }
  for (const [assertIndex, assertion] of automation.assert.entries()) {
    if (!isRecord(assertion)) {
      throw new ValidationError(
        `${label} file automation assertion at index ${assertIndex} is invalid.`
      );
    }
    const assertionType = assertion.type;
    if (assertionType === "exists" || assertionType === "notExists") continue;
    if (
      (assertionType === "contains" || assertionType === "notContains") &&
      typeof assertion.expected === "string" &&
      assertion.expected.length > 0
    ) {
      continue;
    }
    if (assertionType === "jsonPath") {
      if (typeof assertion.path !== "string" || assertion.path.length === 0) {
        throw new ValidationError(
          `${label} file automation jsonPath assertion at index ${assertIndex} requires a path.`
        );
      }
      if (!Object.hasOwn(assertion, "expected") || assertion.expected === undefined) {
        throw new ValidationError(
          `${label} file automation jsonPath assertion at index ${assertIndex} requires expected data.`
        );
      }
      validateAutomationValue(
        assertion.expected,
        `${label} file automation assertion at index ${assertIndex} expected`
      );
      continue;
    }
    throw new ValidationError(
      `${label} file automation assertion at index ${assertIndex} is invalid.`
    );
  }
}

function validateDemoStepAutomation(
  step: DemoStep,
  index: number,
  projectCommandTemplates?: ReadonlyArray<readonly string[]>
): void {
  const label = getStepLabel(step, index);
  if (step.type === "manual") {
    throw new ValidationError(
      `${label} is manual. AI verification handoff steps must be visual or automated with executable automation.`
    );
  }

  if (step.automation === undefined) {
    throw new ValidationError(`${label} with type ${step.type} requires automation.`);
  }
  if (step.automation.kind === "ui") {
    validateUiAutomation(step, index);
    return;
  }
  if (step.automation.kind === "api") {
    validateApiAutomation(step, index);
    return;
  }
  if (step.automation.kind === "command") {
    validateCommandAutomation(step, index, projectCommandTemplates);
    return;
  }
  if (step.automation.kind === "file") {
    validateFileAutomation(step, index);
    return;
  }
  throw new ValidationError(`${label} automation kind must be "ui", "api", "command", or "file".`);
}

function validateDemoStepCoverageMetadata(step: DemoStep, index: number): void {
  const label = getStepLabel(step, index);
  if (step.covers !== undefined) {
    if (!Array.isArray(step.covers)) {
      throw new ValidationError(`${label} covers must be an array of criterion references.`);
    }
    for (const [coverIndex, cover] of step.covers.entries()) {
      if (typeof cover !== "string" || cover.trim().length === 0) {
        throw new ValidationError(`${label} covers[${coverIndex}] must be a non-empty string.`);
      }
    }
  }
  if (step.coverageRationale !== undefined) {
    // A rationale used to be the sanctioned escape hatch for non-automatable
    // criteria, but the runner refuses to certify any run containing one — the
    // ticket would pass every executed step and still bounce back to
    // implementation. Fail here, in the same phase, with the same information,
    // instead of ambushing the agent at verification.
    throw new ValidationError(
      `${label} uses coverageRationale, which the verification runner can never certify — the run would be uncertified and returned to implementation. Cover every acceptance criterion with executable automation instead. If a required command is outside the default allowlist (make, go, npx, ...), declare its exact argv in the project's .brain-dump/verify.json, e.g. { "commands": [["make","lint"], ["npx","knip"]] }, and use a command step. If a criterion genuinely cannot be proven by automation, reword the criterion to match what automation can prove.`
    );
  }
}

function validateDemoCoverage(ticket: DbTicketRow, steps: DemoStep[]): void {
  const criteria = getDemoCoverageCriteria(ticket);
  if (criteria.length === 0) return;

  const criteriaById = new Map(criteria.map((criterion) => [criterion.id, criterion]));
  const coveredCriteria = new Set<string>();

  for (const [index, step] of steps.entries()) {
    for (const cover of step.covers ?? []) {
      const normalized = cover.trim();
      const criterion = criteriaById.get(normalized);
      if (!criterion) {
        throw new ValidationError(
          `${getStepLabel(step, index)} covers unknown criterion reference "${normalized}". Valid references: ${criteria.map((criterion) => `${criterion.id} (${criterion.text})`).join("; ")}.`
        );
      }
      validateStepAppearsToCoverCriterion(step, criterion, index);
      coveredCriteria.add(normalized);
    }
  }

  const missingCriteria = criteria.filter((criterion) => !coveredCriteria.has(criterion.id));
  if (missingCriteria.length === 0) return;

  throw new ValidationError(
    `Demo steps must cover every acceptance criterion with executable automation before AI verification. Add covers references backed by ui, api, command, or file steps. If a required command is outside the default allowlist, declare it in the project's .brain-dump/verify.json "commands"; if a criterion cannot be automated, reword it to match what automation can prove. Missing coverage: ${missingCriteria.map((criterion) => `${criterion.id} (${criterion.text})`).join("; ")}.`
  );
}

function validateDemoSteps(
  steps: GenerateDemoParams["steps"],
  projectCommandTemplates?: ReadonlyArray<readonly string[]>,
  projectPath?: string | undefined
): void {
  if (!Array.isArray(steps)) {
    throw new ValidationError("Demo steps must be an array.");
  }

  if (steps.length === 0) {
    throw new ValidationError(
      "Demo scripts for AI verification must include at least one visual or automated step with executable automation. Manual steps are legacy read-only data and cannot enter AI verification."
    );
  }

  for (const [index, step] of steps.entries()) {
    if (
      typeof step !== "object" ||
      step === null ||
      !Number.isSafeInteger(step.order) ||
      step.order <= 0 ||
      typeof step.description !== "string" ||
      typeof step.expectedOutcome !== "string" ||
      !["manual", "visual", "automated"].includes(step.type)
    ) {
      throw new ValidationError(`Demo step at index ${index} is invalid.`);
    }
    validateDemoStepCoverageMetadata(step, index);
    validateDemoAppBoot(step, index, projectPath);
    validateDemoStepAutomation(step, index, projectCommandTemplates);
  }

  const appBoots = steps.flatMap((step) => (step.app ? [step.app] : []));
  const uniqueAppBoots = new Set(appBoots.map((boot) => JSON.stringify(boot)));
  if (uniqueAppBoots.size > 1) {
    throw new ValidationError(
      "Demo steps declare conflicting app boot commands. Declare one project-specific app command and reuse it unchanged."
    );
  }
}

export interface RepairLegacyHumanReviewResult {
  ticketId: string;
  previousStatus: "human_review";
  newStatus: "ai_review" | "ai_verification";
  reason: string;
}

function getRepairableLegacyHumanReviewTicket(db: DbHandle, ticketId: string): void {
  const ticket = getTicketRow(db, ticketId);
  if (ticket.status !== "human_review") {
    throw new InvalidStateError("ticket", ticket.status, "human_review", "repair legacy handoff");
  }
}

export function validateRepairLegacyHumanReviewHandoff(db: DbHandle, ticketId: string): void {
  getRepairableLegacyHumanReviewTicket(db, ticketId);
}

export function repairLegacyHumanReviewHandoff(
  db: DbHandle,
  ticketId: string
): RepairLegacyHumanReviewResult {
  getRepairableLegacyHumanReviewTicket(db, ticketId);

  const now = new Date().toISOString();
  const demo = db.prepare("SELECT steps FROM demo_scripts WHERE ticket_id = ?").get(ticketId) as
    | { steps: string }
    | undefined;
  let newStatus: "ai_review" | "ai_verification" = "ai_review";
  let reason =
    "Legacy human_review ticket has no demo script; moved to AI review so a verification handoff can be regenerated.";

  if (demo) {
    try {
      const steps = JSON.parse(demo.steps) as GenerateDemoParams["steps"];
      const projectPath = getTicketProjectPath(db, ticketId);
      validateDemoSteps(
        steps,
        projectPath ? readProjectVerifyCommandTemplates(projectPath) : [],
        projectPath ?? undefined
      );
      newStatus = "ai_verification";
      reason =
        "Legacy human_review ticket has a valid executable demo script; moved to AI verification for runner certification.";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reason = `Legacy human_review ticket has an invalid demo script; moved to AI review so a verification handoff can be regenerated. Invalid demo: ${message}`;
    }
  }

  db.transaction(() => {
    getOrCreateWorkflowState(db, ticketId);
    db.prepare("UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?").run(
      newStatus,
      now,
      ticketId
    );
    db.prepare(
      "UPDATE ticket_workflow_state SET current_phase = ?, demo_generated = ?, updated_at = ? WHERE ticket_id = ?"
    ).run(newStatus, newStatus === "ai_verification" ? 1 : 0, now, ticketId);
    if (newStatus === "ai_verification") {
      enqueueVerificationJob(db, ticketId, { now });
    }
    addComment(db, {
      ticketId,
      author: "brain-dump",
      type: "comment",
      content: `## Legacy Workflow Repair\n\n${reason}\n\nManual approval has been retired; the verification runner owns completion.`,
      phase: "repair",
      actorKind: "system",
      provider: "brain-dump",
    });
  })();
  return { ticketId, previousStatus: "human_review", newStatus, reason };
}

function validateDeclaredLegacyBoot(start: unknown, source: string, projectPath: string): boolean {
  const argv = Array.isArray(start)
    ? start
    : typeof start === "string"
      ? start.trim().split(/\s+/).filter(Boolean)
      : null;
  if (
    !argv ||
    argv.length === 0 ||
    !argv.every((part) => typeof part === "string" && part.length > 0)
  ) {
    return false;
  }
  const validated = validateDemoAppBootArgv(argv, `${source} start`);
  validateAppStartUsesPortTokens(validated, `${source} start`);
  validateDelegatedPackageScriptUsesPortTokens(
    validated,
    `${source} start`,
    projectPath,
    undefined
  );
  return true;
}

function hasUsableLegacyBoot(projectPath: string): boolean {
  const verifyConfigPath = join(projectPath, ".brain-dump", "verify.json");
  if (existsSync(verifyConfigPath)) {
    let config: { start?: unknown };
    try {
      config = JSON.parse(readFileSync(verifyConfigPath, "utf-8")) as { start?: unknown };
    } catch {
      return false;
    }
    if (config.start !== undefined) {
      return validateDeclaredLegacyBoot(config.start, verifyConfigPath, projectPath);
    }
  }

  const packagePath = join(projectPath, "package.json");
  if (!existsSync(packagePath)) return false;
  let pkg: {
    brainDump?: { verify?: { start?: unknown } };
    scripts?: Record<string, unknown>;
    dependencies?: Record<string, unknown>;
    devDependencies?: Record<string, unknown>;
  };
  try {
    pkg = JSON.parse(readFileSync(packagePath, "utf-8")) as {
      brainDump?: { verify?: { start?: unknown } };
      scripts?: Record<string, unknown>;
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
  } catch {
    return false;
  }
  const declared = pkg.brainDump?.verify?.start;
  if (declared !== undefined) {
    return validateDeclaredLegacyBoot(
      declared,
      `${packagePath} brainDump.verify.start`,
      projectPath
    );
  }
  if (
    pkg.dependencies?.vite ||
    pkg.devDependencies?.vite ||
    pkg.dependencies?.["@tanstack/react-start"]
  ) {
    // The verifier bypasses package scripts for these stacks and launches the
    // framework directly with its selected host/port.
    return true;
  }
  const scriptName = pkg.scripts?.dev
    ? "dev"
    : pkg.scripts?.start
      ? "start"
      : pkg.scripts?.serve
        ? "serve"
        : null;
  if (scriptName) {
    const script = pkg.scripts?.[scriptName];
    if (typeof script !== "string" || script.trim().length === 0) return false;
    validateAppStartUsesPortTokens(
      script.trim().split(/\s+/),
      `${packagePath} scripts.${scriptName}`
    );
    return true;
  }
  return false;
}

function validateDemoGeneration(db: DbHandle, ticketId: string, steps: DemoStep[]): void {
  const ticket = getTicketRow(db, ticketId);

  assertTicketTransition(ticket.status, "ai_verification", "generate-demo", "generate demo script");
  validateDemoCoverage(ticket, steps);

  const project = ticket.project_id
    ? (db.prepare("SELECT path FROM projects WHERE id = ?").get(ticket.project_id) as
        | { path: string }
        | undefined)
    : undefined;
  const projectPath = project && existsSync(project.path) ? project.path : null;

  const needsApp = steps.some(
    (step) => step.automation?.kind === "api" || step.automation?.kind === "ui"
  );
  if (needsApp && !steps.some((step) => step.app !== undefined) && projectPath) {
    if (!hasUsableLegacyBoot(projectPath)) {
      throw new ValidationError(
        'API/UI demo steps for this project must declare app: { start: ["<command>", "...", "{port}"], cwd?: "<project-relative-dir>" }. Inspect the project\'s README, build files, and native runtime configuration; do not assume npm or pnpm.'
      );
    }
  }

  // Check that all critical/major findings are resolved
  const findings = db
    .prepare("SELECT * FROM review_findings WHERE ticket_id = ?")
    .all(ticketId) as DbReviewFindingRow[];

  const openCritical = findings.filter(
    (f) => f.severity === "critical" && f.status === "open"
  ).length;
  const openMajor = findings.filter((f) => f.severity === "major" && f.status === "open").length;

  if (openCritical > 0 || openMajor > 0) {
    throw new ValidationError(
      `Cannot generate demo: ${openCritical} critical and ${openMajor} major findings are still open.`,
      {
        openCritical: String(openCritical),
        openMajor: String(openMajor),
      }
    );
  }
}

/**
 * Command templates declared by the ticket's project for demo verification.
 * Empty when the ticket has no project, the project path is gone, or nothing
 * is declared.
 */
function getTicketProjectCommandTemplates(db: DbHandle, ticketId: string): string[][] {
  const projectPath = getTicketProjectPath(db, ticketId);
  return projectPath ? readProjectVerifyCommandTemplates(projectPath) : [];
}

function getTicketProjectPath(db: DbHandle, ticketId: string): string | null {
  const ticket = getTicketRow(db, ticketId);
  if (!ticket.project_id) return null;
  const project = db.prepare("SELECT path FROM projects WHERE id = ?").get(ticket.project_id) as
    | { path: string }
    | undefined;
  if (!project || !existsSync(project.path)) return null;
  return project.path;
}

/**
 * Validate demo generation without mutating database state.
 */
export function validateGenerateDemo(db: DbHandle, params: GenerateDemoParams): void {
  const projectPath = getTicketProjectPath(db, params.ticketId);
  validateDemoSteps(
    params.steps,
    getTicketProjectCommandTemplates(db, params.ticketId),
    projectPath ?? undefined
  );
  validateDemoGeneration(db, params.ticketId, params.steps);
}

/**
 * Generate a demo script for AI verification.
 *
 * Validates that:
 * 1. The ticket is in ai_review status
 * 2. All critical/major findings are fixed
 *
 * Transitions the ticket to ai_verification status.
 *
 * @throws TicketNotFoundError if the ticket doesn't exist
 * @throws InvalidStateError if the ticket is not in ai_review
 * @throws ValidationError if there are unresolved critical/major findings
 */
export function generateDemo(db: DbHandle, params: GenerateDemoParams): DemoScript {
  const { ticketId, steps, commentIdentity } = params;

  const projectPath = getTicketProjectPath(db, ticketId);
  validateDemoSteps(
    steps,
    getTicketProjectCommandTemplates(db, ticketId),
    projectPath ?? undefined
  );
  validateDemoGeneration(db, ticketId, steps);

  const now = new Date().toISOString();
  const epicReviewRunId = findLatestActiveEpicReviewRunIdForTicket(db, ticketId);
  const existingDemo = db
    .prepare("SELECT id, epic_review_run_id FROM demo_scripts WHERE ticket_id = ?")
    .get(ticketId) as { id: string; epic_review_run_id: string | null } | undefined;

  const demoId = existingDemo?.id ?? randomUUID();
  const linkedEpicReviewRunId = epicReviewRunId ?? existingDemo?.epic_review_run_id ?? null;

  return db.transaction(() => {
    if (existingDemo) {
      db.prepare(
        `UPDATE demo_scripts
         SET steps = ?, epic_review_run_id = ?, generated_at = ?, completed_at = NULL, feedback = NULL, passed = NULL
         WHERE ticket_id = ?`
      ).run(JSON.stringify(steps), linkedEpicReviewRunId, now, ticketId);
    } else {
      db.prepare(
        `INSERT INTO demo_scripts (id, ticket_id, steps, epic_review_run_id, generated_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(demoId, ticketId, JSON.stringify(steps), linkedEpicReviewRunId, now);
    }

    // Update workflow state (ensure it exists first). Stamp the repo HEAD as
    // the reviewed-through commit: everything up to here has passed a full
    // review, so if verification bounces the ticket back, the next review
    // round only gets blocking authority over the repair diff.
    getOrCreateWorkflowState(db, ticketId);
    const headCommit = projectPath
      ? runGitArgs(["rev-parse", "HEAD"], projectPath)
      : { success: false as const, output: "" };
    db.prepare(
      `UPDATE ticket_workflow_state
       SET demo_generated = 1, reviewed_through_commit = ?, updated_at = ?
       WHERE ticket_id = ?`
    ).run(headCommit.success ? headCommit.output : null, now, ticketId);

    // Transition ticket to AI verification.
    db.prepare("UPDATE tickets SET status = 'ai_verification', updated_at = ? WHERE id = ?").run(
      now,
      ticketId
    );
    db.prepare(
      "UPDATE ticket_workflow_state SET current_phase = 'ai_verification', updated_at = ? WHERE ticket_id = ?"
    ).run(now, ticketId);
    enqueueVerificationJob(db, ticketId, { now });

    const identity = resolveCommentIdentity({
      phase: "demo",
      actorKind: "ai",
      role: "reviewer",
      ...commentIdentity,
    });
    addComment(db, {
      ticketId,
      content: `Demo script generated with ${steps.length} steps. Ticket is now ready for AI verification.${linkedEpicReviewRunId ? `\n\nEpic review run: ${linkedEpicReviewRunId}` : ""}`,
      type: "progress",
      ...identity,
    });

    completeActiveSessionsForTicket(
      db,
      ticketId,
      "success",
      "Demo generated; ticket handed to AI verification."
    );

    if (linkedEpicReviewRunId) {
      updateEpicReviewRunTicketLink(db, {
        epicReviewRunId: linkedEpicReviewRunId,
        ticketId,
        status: "completed",
        completedAt: now,
        summary: "Review completed and demo generated.",
      });

      const ticketLinks = listEpicReviewRunTicketLinks(db, linkedEpicReviewRunId);
      const artifactSummary = getEpicReviewRunArtifactSummary(db, linkedEpicReviewRunId);
      const hasActiveTickets = ticketLinks.some(
        (link) => link.status === "queued" || link.status === "running"
      );
      const failedTickets = ticketLinks.filter((link) => link.status === "failed").length;
      const completedTickets = ticketLinks.filter((link) => link.status === "completed").length;

      updateEpicReviewRun(db, {
        epicReviewRunId: linkedEpicReviewRunId,
        status: hasActiveTickets ? "running" : "completed",
        summary: buildEpicReviewRunCompletionSummary(artifactSummary, {
          completedTickets,
          failedTickets,
        }),
        completedAt: hasActiveTickets ? null : now,
      });
    }

    const row = db
      .prepare("SELECT * FROM demo_scripts WHERE id = ?")
      .get(demoId) as DbDemoScriptRow;
    return toDemoScript(row);
  })();
}

/**
 * Get the demo script for a ticket.
 *
 * @throws TicketNotFoundError if the ticket doesn't exist
 * @returns DemoScript or null if no demo has been generated
 */
export function getDemo(db: DbHandle, ticketId: string): DemoScript | null {
  getTicketRow(db, ticketId);

  const row = db.prepare("SELECT * FROM demo_scripts WHERE ticket_id = ?").get(ticketId) as
    | DbDemoScriptRow
    | undefined;

  if (!row) return null;
  return toDemoScript(row);
}

export type DemoStepStatus = "pending" | "passed" | "failed" | "skipped";

/**
 * Update a single demo step's status during verification/debug review.
 *
 * @throws ValidationError if the demo script or step doesn't exist
 */
export function updateDemoStep(
  db: DbHandle,
  demoScriptId: string,
  stepOrder: number,
  status: DemoStepStatus,
  notes?: string
): DemoScript {
  const row = db.prepare("SELECT * FROM demo_scripts WHERE id = ?").get(demoScriptId) as
    | DbDemoScriptRow
    | undefined;
  if (!row) {
    throw new ValidationError(`Demo script not found: ${demoScriptId}`);
  }

  let steps: DemoStep[];
  try {
    steps = JSON.parse(row.steps || "[]");
  } catch {
    throw new ValidationError(`Demo script steps are corrupted for demo ${demoScriptId}.`);
  }

  const step = steps.find((s) => s.order === stepOrder);
  if (!step) {
    throw new ValidationError(`Step ${stepOrder} not found in demo script ${demoScriptId}.`);
  }

  step.status = status;
  if (notes) {
    step.notes = notes;
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE demo_scripts SET steps = ?, completed_at = ? WHERE id = ?").run(
    JSON.stringify(steps),
    now,
    demoScriptId
  );

  const updated = db
    .prepare("SELECT * FROM demo_scripts WHERE id = ?")
    .get(demoScriptId) as DbDemoScriptRow;
  return toDemoScript(updated);
}

export interface SubmitFeedbackParams {
  ticketId: string;
  passed: boolean;
  feedback: string;
  stepResults?: Array<{
    order: number;
    passed?: boolean;
    status?: DemoStepStatus;
    notes?: string | undefined;
  }>;
}

/**
 * Manual demo feedback has been retired. AI verification runner code owns the
 * ai_verification -> done / in_progress transitions.
 */
export function validateSubmitFeedback(db: DbHandle, params: SubmitFeedbackParams): void {
  getTicketRow(db, params.ticketId);
  throw new ValidationError(
    "Manual demo feedback has been retired. Run the verification runner for ai_verification tickets instead."
  );
}

/**
 * Deprecated manual demo feedback path. AI verification runner code owns ticket completion.
 *
 * @throws TicketNotFoundError if the ticket doesn't exist
 * @throws ValidationError always because manual feedback is retired
 */
export function submitFeedback(db: DbHandle, params: SubmitFeedbackParams): never {
  validateSubmitFeedback(db, params);
  throw new ValidationError("Manual demo feedback has been retired.");
}

function assertTicketTransition(
  from: string,
  to: TicketStatus,
  action: WorkflowTransitionAction,
  errorAction: string
): void {
  if (!isTicketStatus(from)) {
    throw new InvalidStateError("ticket", from, "known ticket status", errorAction);
  }

  try {
    assertTransition(from, to, action);
  } catch (err) {
    if (err instanceof WorkflowTransitionError) {
      throw new InvalidStateError("ticket", from, err.allowedFrom.join("|"), errorAction);
    }
    throw err;
  }
}
