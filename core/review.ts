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
import { addComment } from "./comment.ts";
import { enqueueVerificationJob } from "./verification-queue.ts";
import {
  assertTransition,
  isTicketStatus,
  WorkflowTransitionError,
  type WorkflowTransitionAction,
} from "./workflow-steps.ts";
import { safeJsonParse } from "./json.ts";

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

function getCommandTokenName(value: string): string {
  return value.split(/[\\/]/).pop()?.toLowerCase() ?? value.toLowerCase();
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
      ...automation.assert.map((assertion) => JSON.stringify(assertion.expected)),
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
      `${getStepLabel(step, index)} claims to cover ${criterion.id} (${criterion.text}) but the step description, expected outcome, and automation spec do not reference that criterion. Use a more specific step or add a non-certifiable coverageRationale.`
    );
  }
}

export function validateNonShellArgv(argv: unknown, path: string): string[] {
  if (!Array.isArray(argv) || argv.length === 0) {
    throw new ValidationError(`${path} must be a non-empty argv array.`);
  }

  const shellMetacharacters = /[;&|<>`$]/;
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
  }

  return argv;
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
  }
}

function validateCommandAutomation(step: DemoStep, index: number): void {
  const label = getStepLabel(step, index);
  const automation = step.automation;
  if (!isRecord(automation) || automation.kind !== "command") {
    throw new ValidationError(`${label} automation must be a command automation spec.`);
  }
  if (!isRecord(automation.command)) {
    throw new ValidationError(`${label} command automation command is required.`);
  }

  validateNonShellArgv(automation.command.argv, `${label} command automation argv`);
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
  validateProjectRelativePath(automation.path, `${label} file automation path`);
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

function validateDemoStepAutomation(step: DemoStep, index: number): void {
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
    validateCommandAutomation(step, index);
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
    if (typeof step.coverageRationale !== "string" || step.coverageRationale.trim().length === 0) {
      throw new ValidationError(`${label} coverageRationale must be a non-empty string.`);
    }
  }
}

function validateDemoCoverage(ticket: DbTicketRow, steps: DemoStep[]): void {
  const criteria = getDemoCoverageCriteria(ticket);
  if (criteria.length === 0) return;

  const criteriaById = new Map(criteria.map((criterion) => [criterion.id, criterion]));
  const coveredCriteria = new Set<string>();
  const rationaleText = steps.map((step) => step.coverageRationale ?? "").join("\n");

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

  const rationalizedMissing = missingCriteria.filter((criterion) =>
    rationaleText.includes(criterion.id)
  );
  if (rationalizedMissing.length === missingCriteria.length) return;

  throw new ValidationError(
    `Demo steps must cover every acceptance criterion before AI verification. Add covers references or an explicit coverageRationale that names each non-certifiable criterion id. Missing coverage: ${missingCriteria.map((criterion) => `${criterion.id} (${criterion.text})`).join("; ")}.`
  );
}

function validateDemoSteps(steps: GenerateDemoParams["steps"]): void {
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
    validateDemoStepAutomation(step, index);
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
      validateDemoSteps(steps);
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
    });
  })();
  return { ticketId, previousStatus: "human_review", newStatus, reason };
}

function validateDemoGeneration(db: DbHandle, ticketId: string, steps: DemoStep[]): void {
  const ticket = getTicketRow(db, ticketId);

  assertTicketTransition(ticket.status, "ai_verification", "generate-demo", "generate demo script");
  validateDemoCoverage(ticket, steps);

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
  const { ticketId, steps } = params;

  validateDemoSteps(steps);
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
    enqueueVerificationJob(db, ticketId, { now });

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
