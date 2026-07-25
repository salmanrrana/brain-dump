import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { EpicNotFoundError, TicketNotFoundError } from "./errors.ts";
import { addComment } from "./comment.ts";
import { autoExtractLearnings, type AutoExtractLearningsResult } from "./learnings.ts";
import type {
  DbHandle,
  DemoStep,
  ExecFileNoThrowOptions,
  ExecFileNoThrowResult,
  GitStatusEntry,
  PullRequestRef,
  ResolvedEpicShipScope,
  ResolvedShipScope,
  ResolvedTicketShipScope,
  ShipScopeType,
} from "./types.ts";

export const DEMO_STEPS_SENTINEL = "<!-- brain-dump:demo-steps -->";

interface TicketShipScopeRow {
  id: string;
  title: string;
  description: string | null;
  project_id: string;
  project_name: string;
  project_path: string;
  branch_name: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_status: "draft" | "open" | "merged" | "closed" | null;
  epic_id: string | null;
}

interface EpicShipScopeRow {
  id: string;
  title: string;
  description: string | null;
  project_id: string;
  project_name: string;
  project_path: string;
  epic_branch_name: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_status: "draft" | "open" | "merged" | "closed" | null;
}

interface DemoScriptStepsRow {
  steps: string;
}

interface EpicCompletionTicketRow {
  id: string;
  title: string;
  status: string;
  branch_name: string | null;
  linked_commits: string | null;
  attachments: string | null;
  created_at: string;
}

interface EpicCompletionRow {
  id: string;
  title: string;
  description: string | null;
  project_path: string;
  epic_branch_name: string | null;
}

interface LatestVerificationRunRow {
  status: string;
  certified: number;
  manifest: string;
  git_sha: string | null;
  finished_at: string;
}

interface ExistingPullRequestRow {
  number?: number;
  url?: string;
  isDraft?: boolean;
  state?: string;
}

export interface SyncPrVerificationChecklistInput {
  ticketId: string;
}

export interface SyncPrVerificationChecklistDeps {
  db: DbHandle;
  execFileNoThrow: (
    command: string,
    args: string[],
    options?: ExecFileNoThrowOptions
  ) => Promise<ExecFileNoThrowResult>;
}

export interface HandleEpicCompletionAutoPrInput {
  completedTicketId: string;
}

export interface HandleEpicCompletionAutoPrDeps {
  db: DbHandle;
  execFileNoThrow?: (
    command: string,
    args: string[],
    options?: ExecFileNoThrowOptions
  ) => Promise<ExecFileNoThrowResult>;
}

export interface EpicAutoPrBranchResult {
  branchName: string;
  ticketIds: string[];
  success: boolean;
  action: "created" | "readied" | "updated" | "skipped" | "failed";
  prNumber?: number;
  prUrl?: string;
  message: string;
}

export interface HandleEpicCompletionAutoPrResult {
  epicId: string | null;
  completed: boolean;
  skipped: boolean;
  message: string;
  branchResults: EpicAutoPrBranchResult[];
}

export interface HandleEpicCompletionLearningsResult {
  epicId: string | null;
  completed: boolean;
  skipped: boolean;
  message: string;
  learnings?: AutoExtractLearningsResult;
}

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

function parseJsonArray(value: string | null): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getSettingsRow(db: DbHandle): {
  epic_auto_pr?: number | null;
  pr_target_branch?: string | null;
} {
  return (
    (db
      .prepare("SELECT epic_auto_pr, pr_target_branch FROM settings WHERE id = 'default'")
      .get() as { epic_auto_pr?: number | null; pr_target_branch?: string | null } | undefined) ??
    {}
  );
}

function getNewestTicketId(tickets: EpicCompletionTicketRow[]): string {
  const sorted = tickets
    .slice()
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
  return sorted[0]?.id ?? tickets[0]?.id ?? "";
}

function addEpicAutoPrComment(
  db: DbHandle,
  ticketId: string,
  content: string,
  type: "comment" | "progress" = "comment"
): void {
  if (!ticketId) return;
  addComment(db, {
    ticketId,
    author: "brain-dump",
    type,
    content,
    phase: "system_workflow",
    actorKind: "system",
    provider: "brain-dump",
  });
}

function addEpicAutoPrNeedsAttentionComment(
  db: DbHandle,
  ticketId: string,
  message: string,
  branchName?: string
): void {
  const branchSuffix = branchName ? `\n\nBranch: \`${branchName}\`` : "";
  addEpicAutoPrComment(
    db,
    ticketId,
    `## Epic Auto-PR Needs Attention\n\n${message}${branchSuffix}`
  );
}

function recordEpicPrSuccess(
  db: DbHandle,
  params: {
    epicId: string;
    branchName: string;
    branchCount: number;
    tickets: EpicCompletionTicketRow[];
    commentTicketId: string;
    action: "created" | "readied" | "updated";
    prNumber: number;
    prUrl: string;
    prStatus: "open" | "closed";
    comment: string;
    message: string;
  }
): EpicAutoPrBranchResult {
  updatePrLinksForTickets(db, {
    epicId: params.epicId,
    branchCount: params.branchCount,
    tickets: params.tickets,
    prNumber: params.prNumber,
    prUrl: params.prUrl,
    prStatus: params.prStatus,
  });
  addEpicAutoPrComment(db, params.commentTicketId, params.comment, "progress");
  return {
    branchName: params.branchName,
    ticketIds: params.tickets.map((ticket) => ticket.id),
    success: true,
    action: params.action,
    prNumber: params.prNumber,
    prUrl: params.prUrl,
    message: params.message,
  };
}

function normalizePrStatus(state: string | undefined): "open" | "closed" {
  if (state?.toUpperCase() === "CLOSED") return "closed";
  return "open";
}

function commandFailureMessage(
  action: string,
  result: ExecFileNoThrowResult,
  fallback: string
): string {
  const detail = result.stderr.trim() || result.error || result.stdout.trim() || fallback;
  return `${action}: ${detail}`;
}

function parseExistingPullRequest(output: string): ExistingPullRequestRow | null {
  if (!output.trim()) return null;
  const parsed = JSON.parse(output) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Expected gh pr list to return an array.");
  }
  if (parsed.length === 0) return null;

  const first = parsed[0] as ExistingPullRequestRow;
  if (typeof first.number !== "number" || typeof first.url !== "string") {
    throw new Error("Existing PR record is missing number or URL.");
  }
  return first;
}

function getLatestVerificationSummary(db: DbHandle, ticketId: string): string {
  const run = db
    .prepare(
      `SELECT status, certified, manifest, git_sha, finished_at
       FROM verification_runs
       WHERE ticket_id = ?
       ORDER BY round DESC
       LIMIT 1`
    )
    .get(ticketId) as LatestVerificationRunRow | undefined;

  if (!run) return "verification: no run recorded";

  let evidenceCount = 0;
  try {
    const manifest = JSON.parse(run.manifest) as {
      evidenceFiles?: unknown[];
      manifestHash?: string;
    };
    evidenceCount = Array.isArray(manifest.evidenceFiles) ? manifest.evidenceFiles.length : 0;
  } catch {
    evidenceCount = 0;
  }

  const status = run.certified === 1 ? `${run.status} certified` : run.status;
  return `${status}, git ${run.git_sha ?? "unknown"}, evidence files ${evidenceCount}`;
}

function validateLatestVerificationEvidence(
  db: DbHandle,
  tickets: EpicCompletionTicketRow[]
): string | null {
  for (const ticket of tickets) {
    const run = db
      .prepare(
        `SELECT status, certified, manifest, git_sha, finished_at
         FROM verification_runs
         WHERE ticket_id = ?
         ORDER BY round DESC
         LIMIT 1`
      )
      .get(ticket.id) as LatestVerificationRunRow | undefined;

    if (!run) return `${ticket.title} (${ticket.id}) has no verification run.`;
    if (run.status !== "passed" || run.certified !== 1) {
      return `${ticket.title} (${ticket.id}) does not have a certified passing verification run.`;
    }
    if (!run.git_sha) return `${ticket.title} (${ticket.id}) has no verification git SHA.`;

    let manifest: { manifestHash?: unknown; evidenceFiles?: unknown };
    try {
      manifest = JSON.parse(run.manifest) as { manifestHash?: unknown; evidenceFiles?: unknown };
    } catch {
      return `${ticket.title} (${ticket.id}) has an unparseable verification manifest.`;
    }

    if (typeof manifest.manifestHash !== "string" || manifest.manifestHash.length === 0) {
      return `${ticket.title} (${ticket.id}) has no sealed verification manifest hash.`;
    }
    if (!Array.isArray(manifest.evidenceFiles) || manifest.evidenceFiles.length === 0) {
      return `${ticket.title} (${ticket.id}) has no verification evidence files.`;
    }
  }

  return null;
}

function renderEpicCompletionPrBody(
  db: DbHandle,
  epic: EpicCompletionRow,
  tickets: EpicCompletionTicketRow[]
): string {
  const description = epic.description?.trim() || "No epic description provided.";
  const ticketLines = tickets.map((ticket) => {
    const commits = parseJsonArray(ticket.linked_commits)
      .map((commit) => {
        if (typeof commit !== "object" || commit === null) return null;
        const row = commit as { hash?: unknown; message?: unknown };
        if (typeof row.hash !== "string") return null;
        return `${row.hash.slice(0, 8)}${typeof row.message === "string" ? ` ${row.message}` : ""}`;
      })
      .filter((commit): commit is string => Boolean(commit));
    const attachments = parseJsonArray(ticket.attachments);
    return [
      `- ${ticket.title} (${ticket.id})`,
      `  - ${getLatestVerificationSummary(db, ticket.id)}`,
      `  - linked commits: ${commits.length > 0 ? commits.join(", ") : "none linked"}`,
      `  - evidence attachments: ${attachments.length}`,
    ].join("\n");
  });

  return [
    `# ${epic.title}`,
    "",
    description,
    "",
    "## AI Verification",
    "All tickets in this epic passed AI verification with sealed evidence before this PR was created or readied.",
    "",
    "## Tickets",
    ticketLines.join("\n"),
  ].join("\n");
}

function updatePrLinksForTickets(
  db: DbHandle,
  params: {
    epicId: string;
    branchCount: number;
    tickets: EpicCompletionTicketRow[];
    prNumber: number;
    prUrl: string;
    prStatus: "open" | "closed";
  }
): void {
  const now = new Date().toISOString();
  for (const ticket of params.tickets) {
    db.prepare(
      "UPDATE tickets SET pr_number = ?, pr_url = ?, pr_status = ?, updated_at = ? WHERE id = ?"
    ).run(params.prNumber, params.prUrl, params.prStatus, now, ticket.id);
  }

  if (params.branchCount === 1) {
    db.prepare(
      `INSERT OR IGNORE INTO epic_workflow_state (id, epic_id, created_at, updated_at)
       VALUES (?, ?, ?, ?)`
    ).run(randomUUID(), params.epicId, now, now);
    db.prepare(
      `UPDATE epic_workflow_state
       SET pr_number = ?, pr_url = ?, pr_status = ?, updated_at = ?
       WHERE epic_id = ?`
    ).run(params.prNumber, params.prUrl, params.prStatus, now, params.epicId);
  }
}

async function shipEpicBranch(
  db: DbHandle,
  params: {
    epic: EpicCompletionRow;
    branchName: string;
    branchCount: number;
    tickets: EpicCompletionTicketRow[];
    prTargetBranch: string;
    execFileNoThrow: NonNullable<HandleEpicCompletionAutoPrDeps["execFileNoThrow"]>;
  }
): Promise<EpicAutoPrBranchResult> {
  const commandOptions = { cwd: params.epic.project_path };
  const ticketIds = params.tickets.map((ticket) => ticket.id);
  const commentTicketId = getNewestTicketId(params.tickets);
  const fail = (message: string): EpicAutoPrBranchResult => {
    addEpicAutoPrNeedsAttentionComment(db, commentTicketId, message, params.branchName);
    return {
      branchName: params.branchName,
      ticketIds,
      success: false,
      action: "failed",
      message,
    };
  };

  if (["main", "master"].includes(params.branchName)) {
    return fail("Refusing to create or ready an epic PR directly from a protected base branch.");
  }
  if (params.branchName === params.prTargetBranch) {
    return fail(
      "Refusing to create an epic PR because the source branch equals the target branch."
    );
  }

  const body = renderEpicCompletionPrBody(db, params.epic, params.tickets);
  const existingResult = await params.execFileNoThrow(
    "gh",
    [
      "pr",
      "list",
      "--head",
      params.branchName,
      "--json",
      "number,url,isDraft,state",
      "--limit",
      "1",
    ],
    commandOptions
  );

  if (!existingResult.success) {
    return fail(
      commandFailureMessage(
        "Failed to check for an existing epic PR",
        existingResult,
        "gh pr list failed"
      )
    );
  }

  let existingPr: ExistingPullRequestRow | null;
  try {
    existingPr = parseExistingPullRequest(existingResult.stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(`Failed to parse existing epic PR lookup output: ${message}`);
  }
  if (existingPr?.number && existingPr.url) {
    const pushResult = await params.execFileNoThrow(
      "git",
      ["push", "-u", "origin", params.branchName],
      commandOptions
    );
    if (!pushResult.success) {
      return fail(
        commandFailureMessage("Failed to push the epic branch", pushResult, "git push failed")
      );
    }

    const editResult = await params.execFileNoThrow(
      "gh",
      ["pr", "edit", String(existingPr.number), "--body", body, "--base", params.prTargetBranch],
      commandOptions
    );
    if (!editResult.success) {
      return fail(
        commandFailureMessage(
          "Failed to update the existing epic PR",
          editResult,
          "gh pr edit failed"
        )
      );
    }

    if (existingPr.isDraft) {
      const readyResult = await params.execFileNoThrow(
        "gh",
        ["pr", "ready", String(existingPr.number)],
        commandOptions
      );
      if (!readyResult.success) {
        return fail(
          commandFailureMessage(
            "Failed to mark the existing epic PR ready",
            readyResult,
            "gh pr ready failed"
          )
        );
      }
      return recordEpicPrSuccess(db, {
        epicId: params.epic.id,
        branchName: params.branchName,
        branchCount: params.branchCount,
        tickets: params.tickets,
        commentTicketId,
        action: "readied",
        prNumber: existingPr.number,
        prUrl: existingPr.url,
        prStatus: "open",
        comment: `Epic completed. Draft PR #${existingPr.number} was marked ready for review: ${existingPr.url}`,
        message: `Draft PR #${existingPr.number} marked ready for review.`,
      });
    }

    return recordEpicPrSuccess(db, {
      epicId: params.epic.id,
      branchName: params.branchName,
      branchCount: params.branchCount,
      tickets: params.tickets,
      commentTicketId,
      action: "updated",
      prNumber: existingPr.number,
      prUrl: existingPr.url,
      prStatus: normalizePrStatus(existingPr.state),
      comment: `Epic completed. Existing PR #${existingPr.number} was updated: ${existingPr.url}`,
      message: `Existing PR #${existingPr.number} updated.`,
    });
  }

  const pushResult = await params.execFileNoThrow(
    "git",
    ["push", "-u", "origin", params.branchName],
    commandOptions
  );
  if (!pushResult.success) {
    return fail(
      commandFailureMessage("Failed to push the epic branch", pushResult, "git push failed")
    );
  }

  const createResult = await params.execFileNoThrow(
    "gh",
    [
      "pr",
      "create",
      "--title",
      `[Epic] ${params.epic.title}`,
      "--body",
      body,
      "--base",
      params.prTargetBranch,
      "--head",
      params.branchName,
    ],
    commandOptions
  );
  if (!createResult.success) {
    return fail(
      commandFailureMessage("Failed to create the epic PR", createResult, "gh pr create failed")
    );
  }

  const prRef = parsePullRequestRef(`${createResult.stdout}\n${createResult.stderr}`);
  if (!prRef) {
    return fail(
      `Epic PR was created but Brain Dump could not parse the PR URL from gh output: ${createResult.stdout}`
    );
  }

  return recordEpicPrSuccess(db, {
    epicId: params.epic.id,
    branchName: params.branchName,
    branchCount: params.branchCount,
    tickets: params.tickets,
    commentTicketId,
    action: "created",
    prNumber: prRef.number,
    prUrl: prRef.url,
    prStatus: "open",
    comment: `Epic completed. Ready PR #${prRef.number} was created automatically: ${prRef.url}`,
    message: `Ready PR #${prRef.number} created automatically.`,
  });
}

export async function handleEpicCompletionAutoPr(
  input: HandleEpicCompletionAutoPrInput,
  deps: HandleEpicCompletionAutoPrDeps
): Promise<HandleEpicCompletionAutoPrResult> {
  const ticket = deps.db
    .prepare("SELECT epic_id FROM tickets WHERE id = ?")
    .get(input.completedTicketId) as { epic_id: string | null } | undefined;

  if (!ticket?.epic_id) {
    return {
      epicId: null,
      completed: false,
      skipped: true,
      message: "Completed ticket is not part of an epic; skipped epic auto-PR.",
      branchResults: [],
    };
  }

  const epicId = ticket.epic_id;
  const tickets = deps.db
    .prepare(
      `SELECT id, title, status, branch_name, linked_commits, attachments, created_at
       FROM tickets
       WHERE epic_id = ?
       ORDER BY position ASC, created_at ASC`
    )
    .all(epicId) as EpicCompletionTicketRow[];
  const allDone = tickets.length > 0 && tickets.every((epicTicket) => epicTicket.status === "done");
  if (!allDone) {
    return {
      epicId,
      completed: false,
      skipped: true,
      message: "Epic still has incomplete tickets; skipped epic auto-PR.",
      branchResults: [],
    };
  }

  const invalidEvidence = validateLatestVerificationEvidence(deps.db, tickets);
  if (invalidEvidence) {
    const message = `Epic completed but Brain Dump will not create or ready an epic PR until every ticket has certified passing verification evidence. ${invalidEvidence}`;
    addEpicAutoPrNeedsAttentionComment(deps.db, getNewestTicketId(tickets), message);
    return {
      epicId,
      completed: true,
      skipped: false,
      message,
      branchResults: [
        {
          branchName: "verification-evidence",
          ticketIds: tickets.map((epicTicket) => epicTicket.id),
          success: false,
          action: "failed",
          message,
        },
      ],
    };
  }

  const settings = getSettingsRow(deps.db);
  if (settings.epic_auto_pr === 0) {
    return {
      epicId,
      completed: true,
      skipped: true,
      message: "Epic auto-PR is disabled in settings.",
      branchResults: [],
    };
  }

  const epic = deps.db
    .prepare(
      `SELECT e.id, e.title, e.description, p.path AS project_path, ews.epic_branch_name
       FROM epics e
       JOIN projects p ON p.id = e.project_id
       LEFT JOIN epic_workflow_state ews ON ews.epic_id = e.id
       WHERE e.id = ?`
    )
    .get(epicId) as EpicCompletionRow | undefined;
  if (!epic) {
    throw new EpicNotFoundError(epicId);
  }

  const commentTicketId = getNewestTicketId(tickets);
  if (!deps.execFileNoThrow) {
    const message =
      "Epic completed but no command executor was provided, so Brain Dump could not create or ready a PR.";
    addEpicAutoPrNeedsAttentionComment(deps.db, commentTicketId, message);
    return { epicId, completed: true, skipped: true, message, branchResults: [] };
  }

  const groups = new Map<string, EpicCompletionTicketRow[]>();
  const unresolvableTickets = tickets.filter(
    (epicTicket) => !epicTicket.branch_name && !epic.epic_branch_name
  );
  if (unresolvableTickets.length > 0) {
    const message = `Epic completed but ${unresolvableTickets.length} ticket(s) have no branch metadata; Brain Dump will not guess a PR source branch.`;
    addEpicAutoPrNeedsAttentionComment(deps.db, commentTicketId, message);
    return {
      epicId,
      completed: true,
      skipped: false,
      message,
      branchResults: [
        {
          branchName: "unknown",
          ticketIds: unresolvableTickets.map((epicTicket) => epicTicket.id),
          success: false,
          action: "failed",
          message,
        },
      ],
    };
  }

  for (const epicTicket of tickets) {
    const branchName = epicTicket.branch_name ?? epic.epic_branch_name;
    if (!branchName) continue;
    groups.set(branchName, [...(groups.get(branchName) ?? []), epicTicket]);
  }

  const prTargetBranch = settings.pr_target_branch?.trim() || "main";
  const branchResults: EpicAutoPrBranchResult[] = [];
  for (const [branchName, branchTickets] of groups) {
    branchResults.push(
      await shipEpicBranch(deps.db, {
        epic,
        branchName,
        branchCount: groups.size,
        tickets: branchTickets,
        prTargetBranch,
        execFileNoThrow: deps.execFileNoThrow,
      })
    );
  }

  const failedCount = branchResults.filter((result) => !result.success).length;
  return {
    epicId,
    completed: true,
    skipped: false,
    message:
      failedCount === 0
        ? `Epic completed and ${branchResults.length} PR branch(es) were created or readied.`
        : `Epic completed, but ${failedCount} PR branch(es) need attention.`,
    branchResults,
  };
}

export function handleEpicCompletionLearnings(
  input: HandleEpicCompletionAutoPrInput,
  deps: { db: DbHandle }
): HandleEpicCompletionLearningsResult {
  const ticket = deps.db
    .prepare("SELECT epic_id FROM tickets WHERE id = ?")
    .get(input.completedTicketId) as { epic_id: string | null } | undefined;

  if (!ticket?.epic_id) {
    return {
      epicId: null,
      completed: false,
      skipped: true,
      message: "Completed ticket is not part of an epic; skipped epic learnings.",
    };
  }

  const epicId = ticket.epic_id;
  const statuses = deps.db
    .prepare("SELECT status FROM tickets WHERE epic_id = ?")
    .all(epicId) as Array<{ status: string }>;
  if (statuses.length === 0 || statuses.some((row) => row.status !== "done")) {
    return {
      epicId,
      completed: false,
      skipped: true,
      message: "Epic still has incomplete tickets; skipped epic learnings.",
    };
  }

  try {
    return {
      epicId,
      completed: true,
      skipped: false,
      message: "Epic completed; extracted learnings from done tickets.",
      learnings: autoExtractLearnings(deps.db, epicId),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    addEpicAutoPrComment(
      deps.db,
      input.completedTicketId,
      `## Epic Learnings Need Attention\n\nEpic completion was detected, but Brain Dump could not auto-extract learnings: ${detail}`
    );
    return {
      epicId,
      completed: true,
      skipped: false,
      message: `Epic completed, but learnings extraction needs attention: ${detail}`,
    };
  }
}

function normalizeGitPath(rawPath: string): { path: string; originalPath?: string } {
  const trimmedPath = rawPath.trim();
  const renameParts = trimmedPath.split(" -> ");

  if (renameParts.length !== 2) {
    return { path: trimmedPath };
  }

  return {
    originalPath: renameParts[0]!.trim(),
    path: renameParts[1]!.trim(),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveTicketShipScope(db: DbHandle, scopeId: string): ResolvedTicketShipScope {
  const row = db
    .prepare(
      `SELECT
         t.id,
         t.title,
         t.description,
         t.project_id,
         p.name AS project_name,
         p.path AS project_path,
         t.branch_name,
         t.pr_number,
         t.pr_url,
         t.pr_status,
         t.epic_id
       FROM tickets t
       JOIN projects p ON p.id = t.project_id
       WHERE t.id = ?`
    )
    .get(scopeId) as TicketShipScopeRow | undefined;

  if (!row) {
    throw new TicketNotFoundError(scopeId);
  }

  return {
    scopeType: "ticket",
    scopeId: row.id,
    ticketId: row.id,
    title: row.title,
    description: row.description,
    projectId: row.project_id,
    projectName: row.project_name,
    projectPath: row.project_path,
    branchName: row.branch_name,
    prNumber: row.pr_number,
    prUrl: row.pr_url,
    prStatus: row.pr_status,
    epicId: row.epic_id,
  };
}

function resolveEpicShipScope(db: DbHandle, scopeId: string): ResolvedEpicShipScope {
  const row = db
    .prepare(
      `SELECT
         e.id,
         e.title,
         e.description,
         e.project_id,
         p.name AS project_name,
         p.path AS project_path,
         ews.epic_branch_name,
         ews.pr_number,
         ews.pr_url,
         ews.pr_status
       FROM epics e
       JOIN projects p ON p.id = e.project_id
       LEFT JOIN epic_workflow_state ews ON ews.epic_id = e.id
       WHERE e.id = ?`
    )
    .get(scopeId) as EpicShipScopeRow | undefined;

  if (!row) {
    throw new EpicNotFoundError(scopeId);
  }

  const ticketIds = db
    .prepare("SELECT id FROM tickets WHERE epic_id = ? ORDER BY position ASC, created_at ASC")
    .all(scopeId) as Array<{ id: string }>;

  return {
    scopeType: "epic",
    scopeId: row.id,
    epicId: row.id,
    title: row.title,
    description: row.description,
    projectId: row.project_id,
    projectName: row.project_name,
    projectPath: row.project_path,
    branchName: row.epic_branch_name,
    prNumber: row.pr_number,
    prUrl: row.pr_url,
    prStatus: row.pr_status,
    ticketIds: ticketIds.map((ticket) => ticket.id),
  };
}

export async function execFileNoThrow(
  command: string,
  args: string[],
  options: ExecFileNoThrowOptions = {}
): Promise<ExecFileNoThrowResult> {
  return await new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeoutMs,
        maxBuffer: options.maxBuffer,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({
            success: true,
            stdout,
            stderr,
            exitCode: 0,
          });
          return;
        }

        const execError = error as NodeJS.ErrnoException & {
          code?: number | string;
        };

        resolve({
          success: false,
          stdout,
          stderr,
          exitCode: typeof execError.code === "number" ? execError.code : null,
          error: execError.message,
        });
      }
    );
  });
}

export function resolveShipScope(
  db: DbHandle,
  params: { scopeType: ShipScopeType; scopeId: string }
): ResolvedShipScope {
  return params.scopeType === "ticket"
    ? resolveTicketShipScope(db, params.scopeId)
    : resolveEpicShipScope(db, params.scopeId);
}

export function parseGitStatusShortOutput(output: string): GitStatusEntry[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.replace(/\r$/, ""))
    .filter(Boolean)
    .map((line) => {
      const statusCode = line.slice(0, 2);
      const rawPath = line.slice(3);
      const normalizedPath = normalizeGitPath(rawPath);

      return {
        path: normalizedPath.path,
        status: statusCode === "??" ? "??" : statusCode.replace(/ /g, ""),
        indexStatus: statusCode[0] ?? " ",
        workingTreeStatus: statusCode[1] ?? " ",
        ...(normalizedPath.originalPath ? { originalPath: normalizedPath.originalPath } : {}),
      };
    });
}

export function parseCommitHashFromOutput(output: string): string | null {
  const bracketMatch = output.match(/\[[^\]]*?([0-9a-f]{7,40})\]/i);
  if (bracketMatch?.[1]) {
    return bracketMatch[1];
  }

  const fallbackMatch = output.match(/\b([0-9a-f]{7,40})\b/i);
  return fallbackMatch?.[1] ?? null;
}

export function parsePullRequestRef(output: string): PullRequestRef | null {
  const matches = [...output.matchAll(/(https?:\/\/\S+\/pull\/(\d+))/gi)];
  const lastMatch = matches[matches.length - 1];

  if (!lastMatch?.[1] || !lastMatch[2]) {
    return null;
  }

  return {
    url: lastMatch[1],
    number: Number(lastMatch[2]),
  };
}

export function replaceSentinelBlock(
  body: string,
  replacement: string,
  sentinel = DEMO_STEPS_SENTINEL
): string {
  if (!body.includes(sentinel)) {
    return body;
  }

  const normalizedReplacement = replacement.trim();
  const replacementBlock = normalizedReplacement
    ? `${sentinel}\n${normalizedReplacement}\n`
    : `${sentinel}\n`;
  const sentinelPattern = new RegExp(`${escapeRegExp(sentinel)}[\\s\\S]*?(?=\\n##\\s|$)`);

  return body.replace(sentinelPattern, replacementBlock);
}

export function renderDemoStepsMarkdown(steps: DemoStep[]): string {
  return steps
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((step) =>
      [
        `${step.order}. ${step.description}`,
        `   Expected: ${step.expectedOutcome}`,
        `   Automation: ${step.automation?.kind ?? "legacy/manual"}`,
      ].join("\n")
    )
    .join("\n");
}

function getDemoScriptSteps(db: DbHandle, ticketId: string): DemoStep[] {
  const row = db
    .prepare(
      `SELECT steps
       FROM demo_scripts
       WHERE ticket_id = ?
       ORDER BY generated_at DESC, rowid DESC
       LIMIT 1`
    )
    .get(ticketId) as DemoScriptStepsRow | undefined;

  if (!row) {
    throw new Error(`No demo script found for ticket ${ticketId}.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.steps);
  } catch {
    throw new Error(`Demo script steps for ticket ${ticketId} are not valid JSON.`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Demo script steps for ticket ${ticketId} must be an array.`);
  }

  return parsed as DemoStep[];
}

function getCommandFailure(
  description: string,
  result: ExecFileNoThrowResult,
  fallback: string
): SyncPrVerificationChecklistResult {
  return {
    success: false,
    error: `${description}: ${result.stderr.trim() || result.error || fallback}`,
  };
}

export async function syncPrVerificationChecklist(
  input: SyncPrVerificationChecklistInput,
  deps: SyncPrVerificationChecklistDeps
): Promise<SyncPrVerificationChecklistResult> {
  let scope: ResolvedTicketShipScope;

  try {
    const resolvedScope = resolveShipScope(deps.db, {
      scopeType: "ticket",
      scopeId: input.ticketId,
    });

    if (resolvedScope.scopeType !== "ticket") {
      throw new Error(`Expected ticket scope for ${input.ticketId}.`);
    }

    scope = resolvedScope;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (scope.prNumber === null || !scope.prUrl) {
    return {
      success: true,
      updated: false,
      skipped: true,
      message: `No linked PR found for ticket ${scope.ticketId}; skipped PR checklist sync.`,
    };
  }

  let steps: DemoStep[];
  try {
    steps = getDemoScriptSteps(deps.db, scope.ticketId);
  } catch (error) {
    return {
      success: false,
      prUrl: scope.prUrl,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const commandOptions = { cwd: scope.projectPath };
  const viewResult = await deps.execFileNoThrow(
    "gh",
    ["pr", "view", String(scope.prNumber), "--json", "body", "--jq", ".body"],
    commandOptions
  );

  if (!viewResult.success) {
    return {
      ...getCommandFailure("Failed to fetch the existing PR body", viewResult, "gh pr view failed"),
      prUrl: scope.prUrl,
    };
  }

  const currentBody = viewResult.stdout;
  if (!currentBody.includes(DEMO_STEPS_SENTINEL)) {
    return {
      success: false,
      prUrl: scope.prUrl,
      error: `PR body is missing the ${DEMO_STEPS_SENTINEL} sentinel block.`,
    };
  }

  const updatedBody = replaceSentinelBlock(currentBody, renderDemoStepsMarkdown(steps));
  if (updatedBody.trimEnd() === currentBody.trimEnd()) {
    return {
      success: true,
      updated: false,
      skipped: false,
      prUrl: scope.prUrl,
      message: `PR #${scope.prNumber} already contains the latest demo steps.`,
    };
  }

  const editResult = await deps.execFileNoThrow(
    "gh",
    ["pr", "edit", String(scope.prNumber), "--body", updatedBody],
    commandOptions
  );

  if (!editResult.success) {
    return {
      ...getCommandFailure("Failed to update the PR body", editResult, "gh pr edit failed"),
      prUrl: scope.prUrl,
    };
  }

  return {
    success: true,
    updated: true,
    skipped: false,
    prUrl: scope.prUrl,
    message: `Updated PR #${scope.prNumber} with ${steps.length} demo step${steps.length === 1 ? "" : "s"}.`,
  };
}
