/**
 * Review findings and demo script business logic for the core layer.
 *
 * Extracted from mcp-server/tools/review-findings.ts and mcp-server/tools/demo.ts.
 * All functions take a DbHandle and return typed results or throw CoreError subclasses.
 */

import { randomUUID } from "crypto";
import type {
  DbHandle,
  ReviewFinding,
  ReviewCompletionStatus,
  DemoScript,
  DemoStep,
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
  assertTransition,
  isTicketStatus,
  WorkflowTransitionError,
  type WorkflowTransitionAction,
} from "./workflow-steps.ts";

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

export interface SubmitFindingParams {
  ticketId: string;
  agent: FindingAgent;
  severity: FindingSeverity;
  category: string;
  description: string;
  filePath?: string;
  lineNumber?: number;
  suggestedFix?: string;
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
export function submitFinding(db: DbHandle, params: SubmitFindingParams): ReviewFinding {
  const { ticketId, agent, severity, category, description, filePath, lineNumber, suggestedFix } =
    params;

  const ticket = getTicketRow(db, ticketId);

  assertTicketTransition(ticket.status, "ai_review", "submit-finding", "submit review finding");

  const workflowState = getOrCreateWorkflowState(db, ticketId);
  const epicReviewRunId = findLatestActiveEpicReviewRunIdForTicket(db, ticketId);

  const findingId = randomUUID();
  const now = new Date().toISOString();

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
    description,
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

  const row = db
    .prepare("SELECT * FROM review_findings WHERE id = ?")
    .get(findingId) as DbReviewFindingRow;
  return toReviewFinding(row);
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
export function markFixed(db: DbHandle, findingId: string, status: MarkFixedStatus): ReviewFinding {
  const findingRow = db.prepare("SELECT * FROM review_findings WHERE id = ?").get(findingId) as
    | DbReviewFindingRow
    | undefined;
  if (!findingRow) throw new FindingNotFoundError(findingId);

  // Verify ticket still exists
  getTicketRow(db, findingRow.ticket_id);

  const now = new Date().toISOString();
  const fixedAt = status === "fixed" ? now : null;

  db.prepare("UPDATE review_findings SET status = ?, fixed_at = ? WHERE id = ?").run(
    status,
    fixedAt,
    findingId
  );

  if (status === "fixed") {
    db.prepare(
      "UPDATE ticket_workflow_state SET findings_fixed = findings_fixed + 1, updated_at = ? WHERE ticket_id = ?"
    ).run(now, findingRow.ticket_id);
  }

  const updated = db
    .prepare("SELECT * FROM review_findings WHERE id = ?")
    .get(findingId) as DbReviewFindingRow;
  return toReviewFinding(updated);
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
// Public API – Demo Scripts
// ============================================

export interface GenerateDemoParams {
  ticketId: string;
  steps: DemoStep[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStepLabel(step: DemoStep, index: number): string {
  return `Demo step at index ${index}${typeof step.order === "number" ? ` (order ${step.order})` : ""}`;
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

function validateUiAutomation(step: DemoStep, index: number): void {
  const label = getStepLabel(step, index);
  const automation = step.automation;
  if (!isRecord(automation) || automation.kind !== "ui") {
    throw new ValidationError(`${label} automation must be a UI automation spec.`);
  }
  if (typeof automation.route !== "string" || automation.route.length === 0) {
    throw new ValidationError(`${label} UI automation route is required.`);
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
    if (
      !isRecord(assertion) ||
      !["visible", "text", "url"].includes(String(assertion.type)) ||
      (assertion.selector !== undefined && typeof assertion.selector !== "string") ||
      (assertion.expected !== undefined && typeof assertion.expected !== "string")
    ) {
      throw new ValidationError(
        `${label} UI automation assertion at index ${assertIndex} is invalid.`
      );
    }
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
  if (automation.request.headers !== undefined) {
    validateStringRecord(automation.request.headers, `${label} API automation request headers`);
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
      !Object.hasOwn(assertion, "expected")
    ) {
      throw new ValidationError(
        `${label} API automation assertion at index ${assertIndex} is invalid.`
      );
    }
  }
}

function validateDemoStepAutomation(step: DemoStep, index: number): void {
  const label = getStepLabel(step, index);
  if (step.type === "manual") {
    if (step.automation !== undefined) {
      throw new ValidationError(`${label} is manual and must not include automation.`);
    }
    return;
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
  throw new ValidationError(`${label} automation kind must be "ui" or "api".`);
}

function validateDemoSteps(steps: GenerateDemoParams["steps"]): void {
  if (!Array.isArray(steps)) {
    throw new ValidationError("Demo steps must be an array.");
  }

  for (const [index, step] of steps.entries()) {
    if (
      typeof step !== "object" ||
      step === null ||
      typeof step.order !== "number" ||
      typeof step.description !== "string" ||
      typeof step.expectedOutcome !== "string" ||
      !["manual", "visual", "automated"].includes(step.type)
    ) {
      throw new ValidationError(`Demo step at index ${index} is invalid.`);
    }
    validateDemoStepAutomation(step, index);
  }
}

function validateDemoGeneration(db: DbHandle, ticketId: string): void {
  const ticket = getTicketRow(db, ticketId);

  assertTicketTransition(ticket.status, "ai_verification", "generate-demo", "generate demo script");

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
 * Validate demo generation without mutating database state.
 */
export function validateGenerateDemo(db: DbHandle, params: GenerateDemoParams): void {
  validateDemoSteps(params.steps);
  validateDemoGeneration(db, params.ticketId);
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
  const { ticketId, steps } = params;

  validateDemoSteps(steps);
  validateDemoGeneration(db, ticketId);

  const now = new Date().toISOString();
  const epicReviewRunId = findLatestActiveEpicReviewRunIdForTicket(db, ticketId);
  const existingDemo = db
    .prepare("SELECT id, epic_review_run_id FROM demo_scripts WHERE ticket_id = ?")
    .get(ticketId) as { id: string; epic_review_run_id: string | null } | undefined;

  const demoId = existingDemo?.id ?? randomUUID();
  const linkedEpicReviewRunId = epicReviewRunId ?? existingDemo?.epic_review_run_id ?? null;

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

  // Update workflow state (ensure it exists first)
  getOrCreateWorkflowState(db, ticketId);
  db.prepare(
    `UPDATE ticket_workflow_state SET demo_generated = 1, updated_at = ? WHERE ticket_id = ?`
  ).run(now, ticketId);

  // Transition ticket to AI verification.
  db.prepare("UPDATE tickets SET status = 'ai_verification', updated_at = ? WHERE id = ?").run(
    now,
    ticketId
  );
  db.prepare(
    "UPDATE ticket_workflow_state SET current_phase = 'ai_verification', updated_at = ? WHERE ticket_id = ?"
  ).run(now, ticketId);

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

  const row = db.prepare("SELECT * FROM demo_scripts WHERE id = ?").get(demoId) as DbDemoScriptRow;
  return toDemoScript(row);
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
