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
  FeedbackResult,
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
    generatedAt: row.generated_at,
    executedAt: row.completed_at,
    feedback: row.feedback,
    passed: row.passed === null ? null : row.passed === 1,
  };
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

  if (ticket.status !== "ai_review") {
    throw new InvalidStateError("ticket", ticket.status, "ai_review", "submit review finding");
  }

  const workflowState = getOrCreateWorkflowState(db, ticketId);

  const findingId = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO review_findings (id, ticket_id, iteration, agent, severity, category, description, file_path, line_number, suggested_fix, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`
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
  steps: Array<{
    order: number;
    description: string;
    expectedOutcome: string;
    type: DemoStep["type"];
  }>;
}

/**
 * Generate a demo script for human review.
 *
 * Validates that:
 * 1. The ticket is in ai_review status
 * 2. All critical/major findings are fixed
 *
 * Transitions the ticket to human_review status.
 *
 * @throws TicketNotFoundError if the ticket doesn't exist
 * @throws InvalidStateError if the ticket is not in ai_review
 * @throws ValidationError if there are unresolved critical/major findings
 */
export function generateDemo(db: DbHandle, params: GenerateDemoParams): DemoScript {
  const { ticketId, steps } = params;

  const ticket = getTicketRow(db, ticketId);

  if (ticket.status !== "ai_review") {
    throw new InvalidStateError("ticket", ticket.status, "ai_review", "generate demo script");
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

  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO demo_scripts (id, ticket_id, steps, generated_at)
     VALUES (?, ?, ?, ?)`
  ).run(id, ticketId, JSON.stringify(steps), now);

  // Update workflow state (ensure it exists first)
  getOrCreateWorkflowState(db, ticketId);
  db.prepare(
    `UPDATE ticket_workflow_state SET demo_generated = 1, updated_at = ? WHERE ticket_id = ?`
  ).run(now, ticketId);

  // Transition ticket to human_review
  db.prepare("UPDATE tickets SET status = 'human_review', updated_at = ? WHERE id = ?").run(
    now,
    ticketId
  );

  const row = db.prepare("SELECT * FROM demo_scripts WHERE id = ?").get(id) as DbDemoScriptRow;
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
 * Update a single demo step's status during human review.
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
    passed: boolean;
    notes?: string;
  }>;
}

/**
 * Submit final demo feedback from human reviewer.
 *
 * If passed: transitions ticket to "done".
 * If rejected: keeps in "human_review", resets demo_generated flag.
 *
 * @throws TicketNotFoundError if the ticket doesn't exist
 * @throws InvalidStateError if the ticket is not in human_review
 * @throws ValidationError if no demo script exists for the ticket
 */
export function submitFeedback(db: DbHandle, params: SubmitFeedbackParams): FeedbackResult {
  const { ticketId, passed, feedback, stepResults } = params;

  const ticket = getTicketRow(db, ticketId);

  if (ticket.status !== "human_review") {
    throw new InvalidStateError("ticket", ticket.status, "human_review", "submit demo feedback");
  }

  const demo = db.prepare("SELECT * FROM demo_scripts WHERE ticket_id = ?").get(ticketId) as
    | DbDemoScriptRow
    | undefined;
  if (!demo) {
    throw new ValidationError(`No demo script found for ticket ${ticketId}.`);
  }

  const now = new Date().toISOString();

  // Update demo script
  db.prepare(
    `UPDATE demo_scripts SET feedback = ?, passed = ?, completed_at = ? WHERE ticket_id = ?`
  ).run(feedback, passed ? 1 : 0, now, ticketId);

  // Update individual step results if provided
  if (stepResults && stepResults.length > 0) {
    let steps: DemoStep[];
    try {
      steps = JSON.parse(demo.steps || "[]");
    } catch {
      throw new ValidationError(
        `Demo script for ticket ${ticketId} has corrupted step data. Cannot apply step results.`
      );
    }
    for (const result of stepResults) {
      const step = steps.find((s) => s.order === result.order);
      if (step) {
        step.status = result.passed ? "passed" : "failed";
        if (result.notes) {
          step.notes = result.notes;
        }
      }
    }
    db.prepare("UPDATE demo_scripts SET steps = ? WHERE ticket_id = ?").run(
      JSON.stringify(steps),
      ticketId
    );
  }

  let newStatus: TicketStatus;

  if (passed) {
    newStatus = "done";
    db.prepare(
      "UPDATE tickets SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?"
    ).run(now, now, ticketId);

    // Update workflow state to done phase
    db.prepare(
      "UPDATE ticket_workflow_state SET current_phase = 'done', updated_at = ? WHERE ticket_id = ?"
    ).run(now, ticketId);
  } else {
    newStatus = "human_review";
    // Reset demo_generated flag so demo can be regenerated
    db.prepare(
      "UPDATE ticket_workflow_state SET demo_generated = 0, updated_at = ? WHERE ticket_id = ?"
    ).run(now, ticketId);
  }

  return {
    ticketId,
    passed,
    newStatus,
    feedback,
  };
}
