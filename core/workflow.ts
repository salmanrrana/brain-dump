/**
 * Workflow business logic for starting and completing ticket/epic work.
 *
 * Core functions that handle:
 * - Git branch creation/checkout (ticket-specific or epic branch)
 * - Ticket status transitions (backlog/ready → in_progress, in_progress → ai_review)
 * - Workflow state initialization/reset
 * - Audit trail comments
 * - Next ticket suggestion on completion
 *
 * These functions throw typed errors. Interface layers catch and format:
 * - MCP: { content: [{ type: "text", text: error.message }], isError: true }
 * - UI server fns: { success: false, error: error.message, warnings: [] }
 */

import { randomUUID } from "crypto";
import type Database from "better-sqlite3";
import type {
  GitOperations,
  TicketWithProject,
  StartWorkResult,
  CompleteWorkResult,
  StartEpicWorkResult,
} from "./types.ts";
import {
  TicketNotFoundError,
  EpicNotFoundError,
  GitError,
  InvalidStateError,
  ValidationError,
} from "./errors.ts";
import {
  addComment,
  resolveCommentIdentity,
  type CommentAuthor,
  type ResolveCommentIdentityParams,
} from "./comment.ts";
import { generateBranchName, generateEpicBranchName, findBaseBranch } from "./git-utils.ts";
import type { DbEpicWorkflowStateRow } from "./db-rows.ts";
import {
  assertTransition,
  isTicketStatus,
  WorkflowTransitionError,
  type TicketStatus,
  type WorkflowTransitionAction,
} from "./workflow-steps.ts";
import { normalizeAttachments } from "./attachment-types.ts";
import { updatePrdForDbTicketIfPresent } from "./prd-sync.ts";

// ============================================
// Internal row types (raw SQL results)
// ============================================

interface TicketRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  position: number;
  project_id: string;
  epic_id: string | null;
  tags: string | null;
  subtasks: string | null;
  is_blocked: number;
  blocked_reason: string | null;
  linked_files: string | null;
  attachments: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  linked_commits: string | null;
  branch_name: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_status: string | null;
  project_name: string;
  project_path: string;
}

interface EpicRow {
  id: string;
  title: string;
  description: string | null;
  project_id: string;
  color: string | null;
  created_at: string;
  project_name: string;
  project_path: string;
}

interface EpicTicketRow {
  id: string;
  title: string;
  status: string;
  priority: string | null;
}

// ============================================
// startWork
// ============================================

/**
 * Start work on a ticket: create/checkout branch, update status, init workflow state, post audit comment.
 *
 * Throws:
 * - `TicketNotFoundError` if ticket doesn't exist
 * - `PathNotFoundError` if project directory is missing
 * - `GitError` if not a git repo or branch creation fails
 */
export function startWork(
  db: Database.Database,
  ticketId: string,
  git: GitOperations
): StartWorkResult {
  // 1. Fetch ticket with project info
  const ticket = db
    .prepare(
      `SELECT t.*, p.name as project_name, p.path as project_path
       FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?`
    )
    .get(ticketId) as TicketRow | undefined;

  if (!ticket) {
    throw new TicketNotFoundError(ticketId);
  }

  const projectPath = ticket.project_path;

  // 2. If already in_progress with a branch, return early (idempotent)
  if (ticket.status === "in_progress" && ticket.branch_name) {
    const warnings = ["Ticket is already in progress."];
    const prdResult = updatePrdForDbTicketIfPresent(db, ticketId, false, "in_progress");
    if (!prdResult.success) warnings.push(`PRD sync failed: ${prdResult.message}`);
    return {
      branch: ticket.branch_name,
      branchCreated: false,
      usingEpicBranch: false,
      ticket: toTicketWithProject(ticket),
      warnings,
    };
  }

  // 2a. Refuse to regress a ticket already past implementation. Without this
  //     guard, calling start-work on a ticket in ai_review / ai_verification /
  //     done silently drops it back to in_progress AND wipes the review
  //     findings + demo flags in ticket_workflow_state (see step 7 below),
  //     which is a silent data loss bug. Observed in the wild with Ralph
  //     when an agent re-read plans/prd.json (which still had
  //     \`passes: false\` for a ticket that had since been demoed into
  //     post-review status) and naively called start-work.
  assertTicketTransition(ticket.status, "in_progress", "start-work", "start work");

  // 3. Verify git repo
  const gitCheck = git.run("git rev-parse --git-dir", projectPath);
  if (!gitCheck.success) {
    throw new GitError(`Not a git repository: ${projectPath}. Initialize git first.`);
  }

  // 4. Determine branch (epic vs ticket-specific)
  let branchName: string | undefined;
  let branchCreated = false;
  let usingEpicBranch = false;
  let epicBranch: string | undefined;
  const warnings: string[] = [];

  if (ticket.epic_id) {
    const result = resolveEpicBranch(db, git, ticket.epic_id, ticketId, projectPath);
    branchName = result.branchName;
    branchCreated = result.branchCreated;
    usingEpicBranch = result.usingEpicBranch;
    epicBranch = result.usingEpicBranch ? result.branchName : undefined;
    warnings.push(...result.warnings);
  }

  // 5. If not using epic branch, create ticket-specific branch
  if (!usingEpicBranch || !branchName) {
    branchName = generateBranchName(ticketId, ticket.title);
    usingEpicBranch = false;
    epicBranch = undefined;

    if (!git.branchExists(branchName, projectPath)) {
      const baseBranch = findBaseBranch(git, projectPath);
      const checkoutBase = git.checkout(baseBranch, projectPath);
      if (!checkoutBase.success) {
        const hasUncommitted =
          checkoutBase.error?.includes("local changes") ||
          checkoutBase.error?.includes("would be overwritten");
        const hint = hasUncommitted
          ? `Cannot switch to '${baseBranch}' — uncommitted changes would be lost. Please ensure your project is on the '${baseBranch}' branch with a clean working tree before launching, or commit/stash your changes first.`
          : `Failed to checkout '${baseBranch}': ${checkoutBase.error}. Please ensure your project is on the '${baseBranch}' branch before launching.`;
        throw new GitError(hint, `git checkout ${baseBranch}`);
      }
      const createResult = git.createBranch(branchName, projectPath);
      if (!createResult.success) {
        throw new GitError(
          `Failed to create branch ${branchName}: ${createResult.error}`,
          `git checkout -b ${branchName}`
        );
      }
      branchCreated = true;
    } else {
      const checkoutResult = git.checkout(branchName, projectPath);
      if (!checkoutResult.success) {
        warnings.push(`Failed to checkout branch ${branchName}: ${checkoutResult.error}`);
      }
    }
  }

  // 6. Update ticket status and branch name
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE tickets SET status = 'in_progress', branch_name = ?, updated_at = ? WHERE id = ?"
  ).run(branchName, now, ticketId);
  const prdResult = updatePrdForDbTicketIfPresent(db, ticketId, false, "in_progress");
  if (!prdResult.success) warnings.push(`PRD sync failed: ${prdResult.message}`);

  // 7. Create or reset workflow state
  try {
    const existingState = db
      .prepare("SELECT id FROM ticket_workflow_state WHERE ticket_id = ?")
      .get(ticketId) as { id: string } | undefined;

    if (!existingState) {
      db.prepare(
        `INSERT INTO ticket_workflow_state (id, ticket_id, current_phase, review_iteration, findings_count, findings_fixed, demo_generated, created_at, updated_at, implementation_started_at)
         VALUES (?, ?, 'implementation', 0, 0, 0, 0, ?, ?, ?)`
      ).run(randomUUID(), ticketId, now, now, now);
    } else {
      db.prepare(
        `UPDATE ticket_workflow_state SET current_phase = 'implementation', review_iteration = 0, findings_count = 0, findings_fixed = 0, demo_generated = 0, reviewed_through_commit = NULL, updated_at = ?, implementation_started_at = ? WHERE ticket_id = ?`
      ).run(now, now, ticketId);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    warnings.push(`Workflow state tracking failed: ${errMsg}`);
  }

  // 8. Post audit comment
  const commentContent = usingEpicBranch
    ? `Started work on ticket. Branch: \`${branchName}\` (epic branch)`
    : `Started work on ticket. Branch: \`${branchName}\``;
  try {
    addComment(db, {
      ticketId,
      content: commentContent,
      author: "brain-dump",
      type: "progress",
      phase: "system_workflow",
      actorKind: "system",
      provider: "brain-dump",
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    warnings.push(`Failed to post starting comment: ${errMsg}`);
  }

  // 9. Re-fetch updated ticket
  const updatedTicket = db
    .prepare(
      `SELECT t.*, p.name as project_name, p.path as project_path
       FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?`
    )
    .get(ticketId) as TicketRow;

  return {
    branch: branchName!,
    branchCreated,
    usingEpicBranch,
    ticket: toTicketWithProject(updatedTicket),
    warnings,
    ...(epicBranch ? { epicBranch } : {}),
  };
}

// ============================================
// completeWork
// ============================================

/**
 * Maximum implement → review → verify round-trips per ticket before Brain
 * Dump stops the loop for human attention. Matches the spirit of the
 * verification breakers (3 same-signature failures). The count lives in
 * ticket_workflow_state.review_iteration and is reset by human intervention
 * (resolve-verification-failure or unblocking the ticket).
 */
export const MAX_REVIEW_ROUNDS = 3;

function enforceReviewRoundLimit(db: Database.Database, ticketId: string): void {
  const workflowState = db
    .prepare("SELECT review_iteration FROM ticket_workflow_state WHERE ticket_id = ?")
    .get(ticketId) as { review_iteration: number } | undefined;
  const completedRounds = workflowState?.review_iteration ?? 0;
  if (completedRounds < MAX_REVIEW_ROUNDS) return;

  const now = new Date().toISOString();
  const reason = `Review loop limit: this ticket has been through ${completedRounds} implement → review rounds without reaching done. Automatic iteration stopped so a person can decide the remaining scope.`;
  db.prepare(
    "UPDATE tickets SET is_blocked = 1, blocked_reason = ?, updated_at = ? WHERE id = ?"
  ).run(reason, now, ticketId);
  const prdResult = updatePrdForDbTicketIfPresent(db, ticketId, false, "in_progress");

  const openBlocking = db
    .prepare(
      `SELECT severity, category, description FROM review_findings
       WHERE ticket_id = ? AND status = 'open' AND severity IN ('critical', 'major')
       ORDER BY created_at DESC LIMIT 5`
    )
    .all(ticketId) as Array<{ severity: string; category: string; description: string }>;
  const findingLines = openBlocking.map(
    (f) => `- [${f.severity}] ${f.category}: ${f.description.split("\n", 1)[0]?.slice(0, 200)}`
  );

  try {
    addComment(db, {
      ticketId,
      author: "brain-dump",
      type: "comment",
      content: [
        "## Needs Attention — review loop stopped",
        "",
        reason,
        ...(findingLines.length > 0 ? ["", "Open blocking findings:", ...findingLines] : []),
        "",
        "The ticket is blocked in `in_progress`. A person should review the remaining findings and either:",
        '1. Close disputed or hypothetical findings (`review` tool, `action: "mark-fixed"`, `fixStatus: "wont_fix"`), unblock the ticket, and let the loop finish, or',
        "2. Fix the real issues manually, then unblock the ticket and re-run `complete-work`.",
        "",
        "Unblocking the ticket resets the review-round budget.",
      ].join("\n"),
      phase: "ai_review",
      actorKind: "system",
      provider: "brain-dump",
    });
  } catch {
    // The block itself must not be undone by a failed comment; the thrown
    // ValidationError below still carries the full explanation.
  }

  throw new ValidationError(
    `${reason}${prdResult.success ? "" : ` (PRD sync warning: ${prdResult.message})`} The ticket is now blocked for human attention; unblocking it resets the review-round budget.`
  );
}

/**
 * Complete work on a ticket: move to ai_review, gather git info, post work summary, suggest next ticket.
 *
 * Throws:
 * - `TicketNotFoundError` if ticket doesn't exist
 * - `InvalidStateError` if ticket is already done, ai_review, or ai_verification
 */
type CompleteWorkCommentIdentity = Pick<
  ResolveCommentIdentityParams,
  "author" | "provider" | "modelProvider" | "modelName" | "env"
>;

export function completeWork(
  db: Database.Database,
  ticketId: string,
  git: GitOperations,
  summary?: string,
  commentIdentity: CommentAuthor | CompleteWorkCommentIdentity = "ralph"
): CompleteWorkResult {
  // 1. Fetch ticket
  const ticket = db
    .prepare(
      `SELECT t.*, p.name as project_name, p.path as project_path
       FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?`
    )
    .get(ticketId) as TicketRow | undefined;

  if (!ticket) {
    throw new TicketNotFoundError(ticketId);
  }

  assertTicketTransition(ticket.status, "ai_review", "complete-work", "complete work");

  // Commit/PR linking updates tickets.updated_at after the prescribed
  // validate → report → commit sequence. Those bookkeeping writes must not
  // invalidate the report, nor may marking a review finding fixed. Only entering
  // implementation (including a failed verification handback) advances the cutoff.
  const workflowPass = db
    .prepare("SELECT implementation_started_at FROM ticket_workflow_state WHERE ticket_id = ?")
    .get(ticketId) as { implementation_started_at: string | null } | undefined;
  const latestTestReport = db
    .prepare(
      `SELECT id FROM ticket_comments
       WHERE ticket_id = ? AND type = 'test_report' AND created_at >= ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(ticketId, workflowPass?.implementation_started_at ?? ticket.updated_at) as
    | { id: string }
    | undefined;

  if (!latestTestReport) {
    throw new ValidationError(
      "Cannot complete work: add a test_report comment for this implementation pass summarizing the project-specific validation commands you ran, their pass/fail/skipped results, and any manual smoke checks, then retry."
    );
  }

  // 1a. Review-round circuit breaker. review_iteration increments on every
  //     complete-work and survives verification bounces (start-work on an
  //     in_progress ticket returns early without resetting workflow state), so
  //     it counts implement → review → verify round-trips for this ticket.
  //     Reviewer/implementer pairs have been observed re-litigating the same
  //     ticket for hours — each fresh-context review pass minting new blocking
  //     findings on code a previous pass already accepted. Verification has
  //     3-strikes and non-convergence breakers; this is the review-side
  //     equivalent. A human resets the budget via resolve-verification-failure
  //     or by unblocking the ticket (both stamp verification_streak_reset_at).
  enforceReviewRoundLimit(db, ticketId);

  // 2. Gather git info
  let commitsInfo = "";
  const changedFiles: string[] = [];

  const gitCheck = git.run("git rev-parse --git-dir", ticket.project_path);
  if (gitCheck.success) {
    const baseBranch = findBaseBranch(git, ticket.project_path);
    const commitsResult = git.run(
      `git log ${baseBranch}..HEAD --oneline --no-decorate 2>/dev/null || git log -10 --oneline --no-decorate`,
      ticket.project_path
    );
    if (commitsResult.success && commitsResult.output) {
      commitsInfo = commitsResult.output;
    }

    const filesResult = git.run(
      `git diff ${baseBranch}..HEAD --name-only 2>/dev/null || git diff HEAD~5..HEAD --name-only 2>/dev/null`,
      ticket.project_path
    );
    if (filesResult.success && filesResult.output) {
      changedFiles.push(...filesResult.output.split("\n").filter((f) => f.trim()));
    }
  }

  // 3. Update ticket status to ai_review
  const now = new Date().toISOString();
  db.prepare("UPDATE tickets SET status = 'ai_review', updated_at = ? WHERE id = ?").run(
    now,
    ticketId
  );

  // 4. Update workflow state (increment review_iteration)
  const warnings: string[] = [];
  const prdResult = updatePrdForDbTicketIfPresent(db, ticketId, false, "ai_review");
  if (!prdResult.success) warnings.push(`PRD sync failed: ${prdResult.message}`);
  try {
    const workflowState = db
      .prepare("SELECT * FROM ticket_workflow_state WHERE ticket_id = ?")
      .get(ticketId) as { review_iteration: number } | undefined;

    if (!workflowState) {
      db.prepare(
        `INSERT INTO ticket_workflow_state (id, ticket_id, current_phase, review_iteration, findings_count, findings_fixed, demo_generated, created_at, updated_at)
         VALUES (?, ?, 'ai_review', 1, 0, 0, 0, ?, ?)`
      ).run(randomUUID(), ticketId, now, now);
    } else {
      const newIteration = (workflowState.review_iteration || 0) + 1;
      db.prepare(
        "UPDATE ticket_workflow_state SET current_phase = 'ai_review', review_iteration = ?, updated_at = ? WHERE ticket_id = ?"
      ).run(newIteration, now, ticketId);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    warnings.push(`Workflow state tracking failed: ${errMsg}`);
  }

  // 5. Post work summary comment
  const workSummaryContent = summary
    ? `## Work Summary\n\n${summary}\n\n${commitsInfo ? `### Commits\n\`\`\`\n${commitsInfo}\`\`\`` : ""}`
    : `Completed work on: ${ticket.title}${commitsInfo ? `\n\nCommits:\n${commitsInfo}` : ""}`;
  try {
    const identityInput =
      typeof commentIdentity === "string" ? { author: commentIdentity } : commentIdentity;
    const identity = resolveCommentIdentity({
      phase: "implementation",
      actorKind: "ai",
      role: "implementation",
      ...identityInput,
    });
    addComment(db, {
      ticketId,
      content: workSummaryContent,
      type: "work_summary",
      ...identity,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    warnings.push(`Work summary comment was not saved: ${errMsg}`);
  }

  // 6. Suggest next ticket (first ready or backlog ticket in same project)
  let suggestedNextTicket: { id: string; title: string } | null = null;
  try {
    const nextTicket = db
      .prepare(
        `SELECT id, title FROM tickets
         WHERE project_id = ? AND id != ? AND status IN ('ready', 'backlog')
         ORDER BY CASE status WHEN 'ready' THEN 0 ELSE 1 END, position
         LIMIT 1`
      )
      .get(ticket.project_id, ticketId) as { id: string; title: string } | undefined;
    if (nextTicket) {
      suggestedNextTicket = nextTicket;
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    warnings.push(`Failed to suggest next ticket: ${errMsg}`);
  }

  // 7. Build next steps
  const nextSteps = [
    "AI review is next. If this launch configured a separate fresh-eyes reviewer, stop now; that reviewer owns the review, targeted fixes, validation, and verification handoff in one invocation.",
    "Without a separate reviewer, run the ticket-scoped review workflow: inspect the changed implementation, submit concrete findings, and fix critical/major findings.",
    "After review completion is confirmed, generate the verification demo handoff.",
    "STOP — ticket requires AI verification; the runner owns completion.",
  ];

  return {
    ticketId,
    status: "ai_review",
    workSummary: workSummaryContent,
    nextSteps,
    suggestedNextTicket,
    commitsInfo,
    changedFiles,
    warnings,
  };
}

// ============================================
// startEpicWork
// ============================================

/**
 * Start work on an epic: create/checkout epic branch, init epic workflow state.
 *
 * Throws:
 * - `EpicNotFoundError` if epic doesn't exist
 * - `GitError` if not a git repo or branch creation fails
 */
export function startEpicWork(
  db: Database.Database,
  epicId: string,
  git: GitOperations
): StartEpicWorkResult {
  // 1. Fetch epic with project info
  const epic = db
    .prepare(
      `SELECT e.*, p.name as project_name, p.path as project_path
       FROM epics e JOIN projects p ON e.project_id = p.id WHERE e.id = ?`
    )
    .get(epicId) as EpicRow | undefined;

  if (!epic) {
    throw new EpicNotFoundError(epicId);
  }

  const projectPath = epic.project_path;

  // 2. Verify git repo
  const gitCheck = git.run("git rev-parse --git-dir", projectPath);
  if (!gitCheck.success) {
    throw new GitError(`Not a git repository: ${projectPath}. Initialize git first.`);
  }

  // 3. Check existing epic workflow state
  const epicState = db
    .prepare("SELECT * FROM epic_workflow_state WHERE epic_id = ?")
    .get(epicId) as DbEpicWorkflowStateRow | undefined;

  // 4. If branch already exists in workflow state and in git, just checkout
  if (epicState?.epic_branch_name) {
    if (git.branchExists(epicState.epic_branch_name, projectPath)) {
      const checkoutResult = git.checkout(epicState.epic_branch_name, projectPath);
      if (!checkoutResult.success) {
        const hasUncommitted =
          checkoutResult.error?.includes("local changes") ||
          checkoutResult.error?.includes("would be overwritten");
        const hint = hasUncommitted
          ? `Cannot switch to epic branch '${epicState.epic_branch_name}' — uncommitted changes would be lost. Please commit or stash your changes first, then retry.`
          : `Failed to checkout epic branch '${epicState.epic_branch_name}': ${checkoutResult.error}. Please ensure your project is on this branch or the base branch before launching.`;
        throw new GitError(hint, `git checkout ${epicState.epic_branch_name}`);
      }

      const epicTickets = db
        .prepare(
          "SELECT id, title, status, priority FROM tickets WHERE epic_id = ? ORDER BY position"
        )
        .all(epicId) as EpicTicketRow[];

      return {
        branch: epicState.epic_branch_name,
        branchCreated: false,
        epic: { id: epic.id, title: epic.title, projectName: epic.project_name },
        tickets: epicTickets.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
        })),
        warnings: [],
      };
    }
    // Branch was deleted externally — fall through to recreate
  }

  // 5. Generate branch name and create
  const branchName = generateEpicBranchName(epicId, epic.title);
  let branchCreated = false;

  if (!git.branchExists(branchName, projectPath)) {
    const baseBranch = findBaseBranch(git, projectPath);
    const checkoutBase = git.checkout(baseBranch, projectPath);
    if (!checkoutBase.success) {
      const hasUncommitted =
        checkoutBase.error?.includes("local changes") ||
        checkoutBase.error?.includes("would be overwritten");
      const hint = hasUncommitted
        ? `Cannot switch to '${baseBranch}' — uncommitted changes would be lost. Commit or stash before retrying. Common Ralph-managed files that may be dirty: plans/prd.json, plans/progress.txt. Do NOT work around this by creating a '${baseBranch}' branch manually; the repo already has a default branch and the MCP tool auto-detects 'main' or 'master'.`
        : `Failed to checkout '${baseBranch}': ${checkoutBase.error}. Ensure the repo has a '${baseBranch}' branch (or 'main' / 'master') before launching.`;
      throw new GitError(hint, `git checkout ${baseBranch}`);
    }
    const createResult = git.createBranch(branchName, projectPath);
    if (!createResult.success) {
      throw new GitError(
        `Failed to create epic branch ${branchName}: ${createResult.error}`,
        `git checkout -b ${branchName}`
      );
    }
    branchCreated = true;
  } else {
    const checkoutResult = git.checkout(branchName, projectPath);
    if (!checkoutResult.success) {
      const hasUncommitted =
        checkoutResult.error?.includes("local changes") ||
        checkoutResult.error?.includes("would be overwritten");
      const hint = hasUncommitted
        ? `Cannot switch to epic branch '${branchName}' — uncommitted changes would be lost. Please commit or stash your changes first, then retry.`
        : `Failed to checkout epic branch '${branchName}': ${checkoutResult.error}. Please ensure your project is on this branch or the base branch before launching.`;
      throw new GitError(hint, `git checkout ${branchName}`);
    }
  }

  // 6. Create or update epic workflow state
  const now = new Date().toISOString();
  if (!epicState) {
    db.prepare(
      `INSERT INTO epic_workflow_state (id, epic_id, epic_branch_name, epic_branch_created_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(randomUUID(), epicId, branchName, now, now, now);
  } else {
    db.prepare(
      `UPDATE epic_workflow_state SET epic_branch_name = ?, epic_branch_created_at = ?, updated_at = ? WHERE epic_id = ?`
    ).run(branchName, now, now, epicId);
  }

  // 7. Get tickets and update counts
  const epicTickets = db
    .prepare("SELECT id, title, status, priority FROM tickets WHERE epic_id = ? ORDER BY position")
    .all(epicId) as EpicTicketRow[];

  const ticketsTotal = epicTickets.length;
  const ticketsDone = epicTickets.filter((t) => t.status === "done").length;
  db.prepare(
    "UPDATE epic_workflow_state SET tickets_total = ?, tickets_done = ?, updated_at = ? WHERE epic_id = ?"
  ).run(ticketsTotal, ticketsDone, now, epicId);

  return {
    branch: branchName,
    branchCreated,
    epic: { id: epic.id, title: epic.title, projectName: epic.project_name },
    tickets: epicTickets.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
    })),
    warnings: [],
  };
}

// ============================================
// Internal helpers
// ============================================

/**
 * Try to resolve an epic branch for a ticket. Handles:
 * - Epic has existing branch in workflow state → use it
 * - Epic exists but no branch → auto-create epic branch
 * - Epic branch was deleted → fall through to ticket-specific
 */
function resolveEpicBranch(
  db: Database.Database,
  git: GitOperations,
  epicId: string,
  ticketId: string,
  projectPath: string
): { branchName?: string; branchCreated: boolean; usingEpicBranch: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Check for existing epic workflow state
  const epicState = db
    .prepare("SELECT * FROM epic_workflow_state WHERE epic_id = ?")
    .get(epicId) as DbEpicWorkflowStateRow | undefined;

  if (epicState?.epic_branch_name) {
    // Epic has a branch — check it still exists
    if (git.branchExists(epicState.epic_branch_name, projectPath)) {
      const checkoutResult = git.checkout(epicState.epic_branch_name, projectPath);
      if (!checkoutResult.success) {
        // Checkout failed — fall through to ticket-specific branch instead of lying about epic branch
        warnings.push(
          `Epic branch ${epicState.epic_branch_name} exists but checkout failed: ${checkoutResult.error}. Creating ticket-specific branch instead.`
        );
        return { branchCreated: false, usingEpicBranch: false, warnings };
      }

      // Update current ticket in epic workflow state
      const now = new Date().toISOString();
      db.prepare(
        "UPDATE epic_workflow_state SET current_ticket_id = ?, updated_at = ? WHERE epic_id = ?"
      ).run(ticketId, now, epicId);

      return {
        branchName: epicState.epic_branch_name,
        branchCreated: false,
        usingEpicBranch: true,
        warnings,
      };
    }
    // Branch was deleted — warn and fall through
    warnings.push(
      `Epic branch ${epicState.epic_branch_name} no longer exists. Creating ticket-specific branch instead.`
    );
    return { branchCreated: false, usingEpicBranch: false, warnings };
  }

  // Epic exists but no branch — auto-create one
  const epic = db.prepare("SELECT id, title FROM epics WHERE id = ?").get(epicId) as
    | { id: string; title: string }
    | undefined;

  if (!epic) {
    return { branchCreated: false, usingEpicBranch: false, warnings };
  }

  const branchName = generateEpicBranchName(epic.id, epic.title);

  if (!git.branchExists(branchName, projectPath)) {
    const baseBranch = findBaseBranch(git, projectPath);
    const checkoutBase = git.checkout(baseBranch, projectPath);
    if (!checkoutBase.success) {
      warnings.push(`Failed to checkout base branch '${baseBranch}': ${checkoutBase.error}`);
      return { branchCreated: false, usingEpicBranch: false, warnings };
    }
    const createResult = git.createBranch(branchName, projectPath);
    if (!createResult.success) {
      warnings.push(`Failed to create epic branch: ${createResult.error}`);
      return { branchCreated: false, usingEpicBranch: false, warnings };
    }
  } else {
    const checkoutResult = git.checkout(branchName, projectPath);
    if (!checkoutResult.success) {
      warnings.push(`Failed to checkout epic branch: ${checkoutResult.error}`);
    }
  }

  // Create/update epic workflow state
  const now = new Date().toISOString();
  if (epicState) {
    db.prepare(
      `UPDATE epic_workflow_state SET epic_branch_name = ?, epic_branch_created_at = ?, current_ticket_id = ?, updated_at = ? WHERE epic_id = ?`
    ).run(branchName, now, ticketId, now, epicId);
  } else {
    db.prepare(
      `INSERT INTO epic_workflow_state (id, epic_id, epic_branch_name, epic_branch_created_at, current_ticket_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(randomUUID(), epicId, branchName, now, ticketId, now, now);
  }

  return {
    branchName,
    branchCreated: true,
    usingEpicBranch: true,
    warnings,
  };
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

/** Convert a raw DB ticket row to the public `TicketWithProject` type. */
function toTicketWithProject(row: TicketRow): TicketWithProject {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as TicketWithProject["status"],
    priority: (row.priority ?? null) as TicketWithProject["priority"],
    position: row.position,
    projectId: row.project_id,
    epicId: row.epic_id,
    tags: row.tags ? safeParseJson(row.tags, [], "tags") : [],
    subtasks: row.subtasks ? safeParseJson(row.subtasks, [], "subtasks") : [],
    isBlocked: row.is_blocked === 1,
    blockedReason: row.blocked_reason,
    linkedFiles: row.linked_files ? safeParseJson(row.linked_files, [], "linked_files") : [],
    attachments: normalizeAttachments(row.attachments),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    linkedCommits: row.linked_commits
      ? safeParseJson(row.linked_commits, [], "linked_commits")
      : [],
    branchName: row.branch_name,
    prNumber: row.pr_number,
    prUrl: row.pr_url,
    prStatus: row.pr_status as TicketWithProject["prStatus"],
    project: {
      id: row.project_id,
      name: row.project_name,
      path: row.project_path,
    },
  };
}

function safeParseJson<T>(json: string, fallback: T, fieldName?: string): T {
  try {
    return JSON.parse(json) as T;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown parse error";
    console.warn(
      `[core/workflow] Corrupted JSON in field "${fieldName ?? "unknown"}": ${errMsg}. Returning fallback.`
    );
    return fallback;
  }
}
