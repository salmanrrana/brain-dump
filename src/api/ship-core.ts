import { randomUUID } from "crypto";
import { CoreError } from "../../core/errors.ts";
import { linkCommit, linkPr } from "../../core/git.ts";
import { safeJsonParse } from "../../core/json.ts";
import {
  execFileNoThrow,
  parseCommitHashFromOutput,
  parseGitStatusShortOutput,
  parsePullRequestRef,
  resolveShipScope,
} from "../../core/ship.ts";
import type {
  DbHandle,
  ExecFileNoThrowResult,
  PrStatus,
  ShipScopeType,
  Subtask,
} from "../../core/types.ts";
import { extractAcceptanceCriteria } from "../lib/prd-extraction";
import { sqlite } from "../lib/db";

const PROTECTED_BRANCHES = new Set(["main", "master", "develop"]);
const PR_CREATE_TIMEOUT_MS = 30_000;

export interface ShipPrepInput {
  ticketId?: string;
  epicId?: string;
}

export interface ShipPrepChangedFile {
  path: string;
  status: string;
}

export interface ShipPrepScopeRef {
  type: ShipScopeType;
  id: string;
  title: string;
}

export interface ShipPrepExistingPr {
  number: number;
  url: string | null;
  status: PrStatus | null;
}

export interface ShipPrepData {
  changedFiles: ShipPrepChangedFile[];
  currentBranch: string;
  isSafeToShip: boolean;
  ghAvailable: boolean;
  remoteConfigured: boolean;
  inferredScope: ShipPrepScopeRef | null;
  existingPr: ShipPrepExistingPr | null;
  headCommit: HeadCommitInfo | null;
}

export type ShipPrepResult = ({ success: true } & ShipPrepData) | { success: false; error: string };

export interface ShipPrepDeps {
  db: DbHandle;
  execFileNoThrow: (
    command: string,
    args: string[],
    options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; maxBuffer?: number }
  ) => Promise<ExecFileNoThrowResult>;
}

export interface CommitAndShipInput {
  scopeType: ShipScopeType;
  scopeId: string;
  message: string;
  selectedPaths: string[];
  prTitle: string;
  prBody: string;
  draft: boolean;
}

export type ShipMutationStep = "validate" | "stage" | "commit" | "push" | "pr" | "persist";

export type CommitAndShipResult =
  | {
      success: true;
      commitHash: string;
      prNumber: number;
      prUrl: string;
    }
  | {
      success: false;
      step: ShipMutationStep;
      error: string;
    };

export interface GeneratePrBodyInput {
  scopeType: ShipScopeType;
  scopeId: string;
}

export interface SyncPrVerificationChecklistInput {
  ticketId: string;
}

export interface PushBranchInput {
  scopeType: ShipScopeType;
  scopeId: string;
}

export type GeneratePrBodyResult =
  | {
      success: true;
      body: string;
    }
  | {
      success: false;
      error: string;
    };

export type PushBranchResult =
  | {
      success: true;
      branchName: string;
    }
  | {
      success: false;
      error: string;
    };

export type SyncPrVerificationChecklistResult =
  | {
      success: true;
      updated: boolean;
      skipped: boolean;
      prUrl?: string;
      message: string;
    }
  | {
      success: false;
      error: string;
      prUrl?: string;
    };

export interface CommitAndShipDeps {
  db: DbHandle;
  execFileNoThrow: (
    command: string,
    args: string[],
    options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; maxBuffer?: number }
  ) => Promise<ExecFileNoThrowResult>;
  now: () => string;
  createId: () => string;
}

export interface PushBranchDeps {
  db: DbHandle;
  execFileNoThrow: (
    command: string,
    args: string[],
    options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; maxBuffer?: number }
  ) => Promise<ExecFileNoThrowResult>;
}

interface ScopeTicketRow {
  id: string;
  title: string;
  description: string | null;
  subtasks: string | null;
}

interface WorkSummaryRow {
  ticket_id: string;
  title: string;
  content: string;
  created_at: string;
}

interface RenderedCriterion {
  text: string;
  checked: boolean;
}

export interface HeadCommitInfo {
  hash: string;
  message: string;
}

function resolveShipPrepScopeInput(input: ShipPrepInput): {
  scopeType: ShipScopeType;
  scopeId: string;
} {
  const hasTicketId = typeof input.ticketId === "string" && input.ticketId.length > 0;
  const hasEpicId = typeof input.epicId === "string" && input.epicId.length > 0;

  if (hasTicketId === hasEpicId) {
    throw new Error("Provide exactly one of ticketId or epicId");
  }

  if (hasTicketId) {
    return {
      scopeType: "ticket",
      scopeId: input.ticketId!,
    };
  }

  return {
    scopeType: "epic",
    scopeId: input.epicId!,
  };
}

function getCommandError(
  description: string,
  result: ExecFileNoThrowResult,
  fallback: string
): Error {
  const detail = result.stderr.trim() || result.error || fallback;
  return new Error(`${description}: ${detail}`);
}

function getStructuredCommandError(
  step: ShipMutationStep,
  description: string,
  result: ExecFileNoThrowResult,
  fallback: string
): CommitAndShipResult {
  const detail = result.stderr.trim() || result.error || fallback;
  return {
    success: false,
    step,
    error: `${description}: ${detail}`,
  };
}

function getPrCreateError(result: ExecFileNoThrowResult): CommitAndShipResult {
  const detail = `${result.stderr}\n${result.error}`.toLowerCase();
  const timedOut =
    detail.includes("timed out") || detail.includes("etimedout") || detail.includes("sigterm");

  if (timedOut) {
    return {
      success: false,
      step: "pr",
      error:
        "Failed to create pull request: GitHub CLI timed out waiting for a non-interactive result. Check gh auth and repository defaults, then retry.",
    };
  }

  return getStructuredCommandError(
    "pr",
    "Failed to create pull request",
    result,
    "gh pr create failed"
  );
}

export function getErrorMessage(error: unknown): string {
  return error instanceof CoreError
    ? error.message
    : `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
}

function normalizeSelectedPaths(selectedPaths: string[]): string[] {
  return [...new Set(selectedPaths.map((path) => path.trim()).filter(Boolean))];
}

function getScopeTicketIds(scope: ReturnType<typeof resolveShipScope>): string[] {
  return scope.scopeType === "ticket" ? [scope.ticketId] : scope.ticketIds;
}

function getScopeTickets(
  db: DbHandle,
  scope: ReturnType<typeof resolveShipScope>
): ScopeTicketRow[] {
  if (scope.scopeType === "ticket") {
    return db
      .prepare(
        `SELECT id, title, description, subtasks
         FROM tickets
         WHERE id = ?`
      )
      .all(scope.ticketId) as ScopeTicketRow[];
  }

  return db
    .prepare(
      `SELECT id, title, description, subtasks
       FROM tickets
       WHERE epic_id = ?
       ORDER BY position ASC, created_at ASC`
    )
    .all(scope.epicId) as ScopeTicketRow[];
}

function getWorkSummaryRows(db: DbHandle, ticketIds: string[]): WorkSummaryRow[] {
  if (ticketIds.length === 0) {
    return [];
  }

  const placeholders = ticketIds.map(() => "?").join(", ");
  return db
    .prepare(
      `SELECT tc.ticket_id, t.title, tc.content, tc.created_at
       FROM ticket_comments tc
       JOIN tickets t ON t.id = tc.ticket_id
       WHERE tc.type = 'work_summary' AND tc.ticket_id IN (${placeholders})
       ORDER BY tc.created_at ASC, tc.rowid ASC`
    )
    .all(...ticketIds) as WorkSummaryRow[];
}

function extractCriteria(ticket: ScopeTicketRow): RenderedCriterion[] {
  const subtasks = safeJsonParse<Array<Subtask | Record<string, unknown>>>(ticket.subtasks, []);
  if (subtasks.length > 0) {
    return subtasks
      .map((subtask) => {
        const text =
          typeof subtask === "object" && subtask !== null
            ? typeof (subtask as { criterion?: unknown }).criterion === "string"
              ? (subtask as { criterion: string }).criterion
              : typeof (subtask as { text?: unknown }).text === "string"
                ? (subtask as { text: string }).text
                : null
            : null;

        if (!text) {
          return null;
        }

        const checked =
          (typeof subtask === "object" &&
            subtask !== null &&
            (subtask as { status?: unknown }).status === "passed") ||
          (typeof subtask === "object" &&
            subtask !== null &&
            (subtask as { completed?: unknown }).completed === true);

        return {
          text,
          checked,
        };
      })
      .filter((criterion): criterion is RenderedCriterion => criterion !== null);
  }

  return extractAcceptanceCriteria(ticket.description).map((criterion) => ({
    text: criterion,
    checked: false,
  }));
}

function getDescriptionLead(description: string | null): string | null {
  if (!description) {
    return null;
  }

  const lines = description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  return lines[0] ?? null;
}

function parseHeadCommitInfo(output: string): HeadCommitInfo | null {
  const [hash, message] = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!hash || !message) {
    return null;
  }

  return { hash, message };
}

function toBlockQuote(content: string): string {
  return content
    .trim()
    .split(/\r?\n/)
    .map((line) => (line.length > 0 ? `> ${line}` : ">"))
    .join("\n");
}

function generatePrBodyContent(input: GeneratePrBodyInput, db: DbHandle): string {
  const scope = resolveShipScope(db, input);
  const tickets = getScopeTickets(db, scope);
  const workSummaries = getWorkSummaryRows(
    db,
    tickets.map((ticket) => ticket.id)
  );
  const workSummariesByTicket = new Map<string, WorkSummaryRow[]>();

  for (const summary of workSummaries) {
    const entries = workSummariesByTicket.get(summary.ticket_id) ?? [];
    entries.push(summary);
    workSummariesByTicket.set(summary.ticket_id, entries);
  }

  const scopeLabel = scope.scopeType === "epic" ? "Epic" : "Ticket";
  const bodyLines: string[] = [
    `# [${scopeLabel}] ${scope.title}`,
    "",
    "## Scope",
    `- Project: ${scope.projectName}`,
    `- Type: ${scopeLabel.toLowerCase()}`,
    `- ID: ${scope.scopeId}`,
  ];

  if (scope.branchName) {
    bodyLines.push(`- Branch: ${scope.branchName}`);
  }

  if (scope.description?.trim()) {
    bodyLines.push("", "## Summary", scope.description.trim());
  }

  bodyLines.push("", "## Included Tickets");

  if (tickets.length === 0) {
    bodyLines.push("_No tickets are currently assigned to this scope._");
  }

  for (const ticket of tickets) {
    const lead = getDescriptionLead(ticket.description);
    const criteria = extractCriteria(ticket);

    bodyLines.push("", `### ${ticket.title} (\`${ticket.id}\`)`);

    if (lead) {
      bodyLines.push(lead);
    }

    if (criteria.length > 0) {
      bodyLines.push("", "Acceptance Criteria");
      for (const criterion of criteria) {
        bodyLines.push(`- [${criterion.checked ? "x" : " "}] ${criterion.text}`);
      }
    }
  }

  bodyLines.push("", "## Implementation Notes");

  if (workSummaries.length === 0) {
    bodyLines.push("_No work summary comments are linked yet._");
  } else {
    for (const ticket of tickets) {
      const entries = workSummariesByTicket.get(ticket.id) ?? [];
      if (entries.length === 0) {
        continue;
      }

      bodyLines.push("", `### ${ticket.title} (\`${ticket.id}\`)`);
      for (const entry of entries) {
        bodyLines.push("", `#### ${entry.created_at}`, toBlockQuote(entry.content));
      }
    }
  }

  bodyLines.push(
    "",
    "## Demo Steps",
    "<!-- brain-dump:demo-steps -->",
    "_Demo steps will be synced here after AI review._"
  );

  return bodyLines.join("\n");
}

function upsertEpicWorkflowPrState(
  db: DbHandle,
  scope: Extract<ReturnType<typeof resolveShipScope>, { scopeType: "epic" }>,
  prNumber: number,
  prUrl: string,
  prStatus: PrStatus,
  now: string,
  createId: () => string
): void {
  const existingRow = db
    .prepare("SELECT id FROM epic_workflow_state WHERE epic_id = ?")
    .get(scope.epicId) as { id: string } | undefined;

  if (existingRow) {
    db.prepare(
      `UPDATE epic_workflow_state
       SET pr_number = ?, pr_url = ?, pr_status = ?, updated_at = ?
       WHERE epic_id = ?`
    ).run(prNumber, prUrl, prStatus, now, scope.epicId);
    return;
  }

  db.prepare(
    `INSERT INTO epic_workflow_state (
       id,
       epic_id,
       epic_branch_name,
       pr_number,
       pr_url,
       pr_status,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(createId(), scope.epicId, scope.branchName, prNumber, prUrl, prStatus, now, now);
}

export async function commitAndShip(
  input: CommitAndShipInput,
  deps: CommitAndShipDeps
): Promise<CommitAndShipResult> {
  let scope: ReturnType<typeof resolveShipScope>;

  try {
    scope = resolveShipScope(deps.db, {
      scopeType: input.scopeType,
      scopeId: input.scopeId,
    });
  } catch (error) {
    return {
      success: false,
      step: "validate",
      error: getErrorMessage(error),
    };
  }

  const selectedPaths = normalizeSelectedPaths(input.selectedPaths);

  if (selectedPaths.length > 0 && !input.message.trim()) {
    return {
      success: false,
      step: "validate",
      error: "Commit message is required.",
    };
  }

  if (!input.prTitle.trim()) {
    return {
      success: false,
      step: "validate",
      error: "PR title is required.",
    };
  }

  if (!scope.branchName) {
    return {
      success: false,
      step: "validate",
      error: `No branch is linked to this ${scope.scopeType}. Start workflow branch creation first.`,
    };
  }

  if (scope.prNumber !== null) {
    return {
      success: false,
      step: "validate",
      error: `This ${scope.scopeType} already has PR #${scope.prNumber} linked.`,
    };
  }

  const commandOptions = { cwd: scope.projectPath };
  let commitHash: string;
  let linkedCommitMessage: string;

  if (selectedPaths.length === 0) {
    const statusResult = await deps.execFileNoThrow("git", ["status", "--short"], commandOptions);
    if (!statusResult.success) {
      return getStructuredCommandError(
        "validate",
        "Failed to inspect repository state",
        statusResult,
        "git status failed"
      );
    }

    const hasChangedFiles = parseGitStatusShortOutput(statusResult.stdout).length > 0;
    if (hasChangedFiles) {
      return {
        success: false,
        step: "validate",
        error: "Select at least one file before shipping changes.",
      };
    }

    const headCommitResult = await deps.execFileNoThrow(
      "git",
      ["log", "-1", "--format=%H%n%s"],
      commandOptions
    );
    if (!headCommitResult.success) {
      return getStructuredCommandError(
        "commit",
        "Failed to read the current branch commit",
        headCommitResult,
        "git log failed"
      );
    }

    const headCommitInfo = parseHeadCommitInfo(
      `${headCommitResult.stdout}\n${headCommitResult.stderr}`
    );
    if (!headCommitInfo) {
      return {
        success: false,
        step: "commit",
        error:
          "No existing commit could be read from the current branch. Commit changes before creating a pull request.",
      };
    }

    commitHash = headCommitInfo.hash;
    linkedCommitMessage = headCommitInfo.message;
  } else {
    const addResult = await deps.execFileNoThrow(
      "git",
      ["add", "--", ...selectedPaths],
      commandOptions
    );
    if (!addResult.success) {
      return getStructuredCommandError(
        "stage",
        "Failed to stage selected files",
        addResult,
        "git add failed"
      );
    }

    const commitResult = await deps.execFileNoThrow(
      "git",
      ["commit", "-m", input.message.trim()],
      commandOptions
    );
    if (!commitResult.success) {
      return getStructuredCommandError(
        "commit",
        "Failed to create commit",
        commitResult,
        "git commit failed"
      );
    }

    const parsedCommitHash = parseCommitHashFromOutput(
      `${commitResult.stdout}\n${commitResult.stderr}`
    );
    if (!parsedCommitHash) {
      return {
        success: false,
        step: "commit",
        error: "Created the commit, but could not parse the commit hash from git output.",
      };
    }

    commitHash = parsedCommitHash;
    linkedCommitMessage = input.message.trim();
  }

  const targetTicketIds = getScopeTicketIds(scope);
  try {
    for (const ticketId of targetTicketIds) {
      linkCommit(deps.db, ticketId, commitHash, linkedCommitMessage);
    }
  } catch (error) {
    return {
      success: false,
      step: "persist",
      error: `Commit created, but ticket linkage failed: ${getErrorMessage(error)}`,
    };
  }

  const pushResult = await deps.execFileNoThrow(
    "git",
    ["push", "-u", "origin", scope.branchName],
    commandOptions
  );
  if (!pushResult.success) {
    return getStructuredCommandError(
      "push",
      "Failed to push branch",
      pushResult,
      "git push failed"
    );
  }

  const prArgs = [
    "pr",
    "create",
    "--head",
    scope.branchName,
    "--title",
    input.prTitle.trim(),
    "--body",
    input.prBody,
  ];
  if (input.draft) {
    prArgs.push("--draft");
  }

  const prCreateResult = await deps.execFileNoThrow("gh", prArgs, {
    ...commandOptions,
    env: {
      ...process.env,
      GH_PROMPT_DISABLED: "1",
      GIT_TERMINAL_PROMPT: "0",
    },
    timeoutMs: PR_CREATE_TIMEOUT_MS,
  });
  if (!prCreateResult.success) {
    return getPrCreateError(prCreateResult);
  }

  const prRef = parsePullRequestRef(`${prCreateResult.stdout}\n${prCreateResult.stderr}`);
  if (!prRef) {
    return {
      success: false,
      step: "pr",
      error: "Pull request was created, but the PR URL/number could not be parsed from gh output.",
    };
  }

  const prStatus: PrStatus = input.draft ? "draft" : "open";
  try {
    for (const ticketId of targetTicketIds) {
      linkPr(deps.db, ticketId, prRef.number, prRef.url, prStatus);
    }

    if (scope.scopeType === "epic") {
      upsertEpicWorkflowPrState(
        deps.db,
        scope,
        prRef.number,
        prRef.url,
        prStatus,
        deps.now(),
        deps.createId
      );
    }
  } catch (error) {
    return {
      success: false,
      step: "persist",
      error: `Pull request created, but linkage persistence failed: ${getErrorMessage(error)}`,
    };
  }

  return {
    success: true,
    commitHash,
    prNumber: prRef.number,
    prUrl: prRef.url,
  };
}

export function generatePrBody(input: GeneratePrBodyInput, db: DbHandle): GeneratePrBodyResult {
  try {
    return {
      success: true,
      body: generatePrBodyContent(input, db),
    };
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
}

export async function pushBranch(
  input: PushBranchInput,
  deps: PushBranchDeps
): Promise<PushBranchResult> {
  let scope: ReturnType<typeof resolveShipScope>;

  try {
    scope = resolveShipScope(deps.db, {
      scopeType: input.scopeType,
      scopeId: input.scopeId,
    });
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }

  if (!scope.branchName) {
    return {
      success: false,
      error: `No branch is linked to this ${scope.scopeType}. Start workflow branch creation first.`,
    };
  }

  const pushResult = await deps.execFileNoThrow("git", ["push", "origin", scope.branchName], {
    cwd: scope.projectPath,
  });

  if (!pushResult.success) {
    return {
      success: false,
      error: `Failed to push branch: ${pushResult.stderr.trim() || pushResult.error || "git push failed"}`,
    };
  }

  return {
    success: true,
    branchName: scope.branchName,
  };
}

export async function getShipPrepData(
  input: ShipPrepInput,
  deps: ShipPrepDeps
): Promise<ShipPrepData> {
  const scopeInput = resolveShipPrepScopeInput(input);
  const scope = resolveShipScope(deps.db, scopeInput);
  const commandOptions = { cwd: scope.projectPath };

  const [statusResult, branchResult, ghResult, remoteResult, headCommitResult] = await Promise.all([
    deps.execFileNoThrow("git", ["status", "--short"], commandOptions),
    deps.execFileNoThrow("git", ["branch", "--show-current"], commandOptions),
    deps.execFileNoThrow("which", ["gh"]),
    deps.execFileNoThrow("git", ["remote"], commandOptions),
    deps.execFileNoThrow("git", ["log", "-1", "--format=%H%n%s"], commandOptions),
  ]);

  if (!statusResult.success) {
    throw getCommandError("Unable to inspect changed files", statusResult, "git status failed");
  }

  if (!branchResult.success) {
    throw getCommandError("Unable to determine current branch", branchResult, "git branch failed");
  }

  if (!remoteResult.success) {
    throw getCommandError("Unable to inspect git remotes", remoteResult, "git remote failed");
  }

  const currentBranch = branchResult.stdout.trim();
  const headCommit = headCommitResult.success
    ? parseHeadCommitInfo(`${headCommitResult.stdout}\n${headCommitResult.stderr}`)
    : null;

  return {
    changedFiles: parseGitStatusShortOutput(statusResult.stdout).map((entry) => ({
      path: entry.path,
      status: entry.status,
    })),
    currentBranch,
    isSafeToShip: !PROTECTED_BRANCHES.has(currentBranch),
    ghAvailable: ghResult.success && ghResult.stdout.trim().length > 0,
    remoteConfigured: remoteResult.stdout.trim().length > 0,
    inferredScope: {
      type: scope.scopeType,
      id: scope.scopeId,
      title: scope.title,
    },
    existingPr:
      scope.prNumber !== null
        ? {
            number: scope.prNumber,
            url: scope.prUrl,
            status: scope.prStatus,
          }
        : null,
    headCommit,
  };
}

export const defaultShipPrepDeps: ShipPrepDeps = {
  db: sqlite,
  execFileNoThrow,
};

export const defaultCommitAndShipDeps: CommitAndShipDeps = {
  db: sqlite,
  execFileNoThrow,
  now: () => new Date().toISOString(),
  createId: () => randomUUID(),
};

export const defaultPushBranchDeps: PushBranchDeps = {
  db: sqlite,
  execFileNoThrow,
};
