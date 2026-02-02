/**
 * Git linking business logic for the core layer.
 *
 * Extracted from mcp-server/tools/git.ts.
 * All functions take a DbHandle and return typed results or throw CoreError subclasses.
 *
 * Note: core/git-utils.ts contains low-level git command helpers (runGitCommand, slugify, etc.).
 * This module contains the higher-level business logic for linking commits and PRs to tickets.
 */

import { existsSync, readFileSync } from "fs";
import type { DbHandle, PrStatus, Commit } from "./types.ts";
import { TicketNotFoundError, ValidationError, PathNotFoundError } from "./errors.ts";
import { runGitCommand, shortId } from "./git-utils.ts";
import { safeJsonParse } from "./json.ts";

// ============================================
// Internal DB Row Types
// ============================================

interface TicketWithProjectRow {
  id: string;
  title: string;
  status: string;
  project_id: string;
  project_path: string;
  project_name: string;
  linked_commits: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_status: string | null;
}

interface TicketWithPRRow {
  id: string;
  title: string;
  pr_number: number;
  pr_status: string | null;
}

// ============================================
// Result Types
// ============================================

export interface LinkCommitResult {
  ticketId: string;
  ticketTitle: string;
  commitHash: string;
  commitMessage: string;
  alreadyLinked: boolean;
  totalCommits: number;
  linkedCommits: Commit[];
}

export interface LinkPrResult {
  ticketId: string;
  ticketTitle: string;
  prNumber: number;
  prUrl: string | null;
  prStatus: PrStatus;
  syncedPrs: SyncedPR[];
}

export interface SyncedPR {
  ticketId: string;
  title: string;
  prNumber: number;
  oldStatus: string | null;
  newStatus: string;
}

export interface SyncResult {
  ticketId: string;
  ticketTitle: string;
  source: string;
  commitsLinked: Array<{ hash: string; message: string }>;
  commitsSkipped: Array<{ hash: string; message: string }>;
  prLinked: { number: number; url?: string | undefined; status: string } | null;
  prSkipped: { number: number; reason: string } | null;
}

// ============================================
// Internal Helpers
// ============================================

function getTicketWithProject(db: DbHandle, ticketId: string): TicketWithProjectRow {
  const ticket = db
    .prepare(
      `SELECT t.*, p.name as project_name, p.path as project_path
       FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?`
    )
    .get(ticketId) as TicketWithProjectRow | undefined;

  if (!ticket) {
    throw new TicketNotFoundError(ticketId);
  }
  return ticket;
}

/**
 * Find the active ticket ID from Ralph state or branch name.
 */
function findActiveTicket(
  db: DbHandle,
  projectPath: string
): { ticketId: string | null; source: string } {
  // First try Ralph state file
  const ralphStatePath = `${projectPath}/.claude/ralph-state.json`;
  if (existsSync(ralphStatePath)) {
    try {
      const stateContent = readFileSync(ralphStatePath, "utf8");
      const state = JSON.parse(stateContent) as { ticketId?: string };
      if (state.ticketId) {
        return { ticketId: state.ticketId, source: "ralph-state" };
      }
    } catch {
      // Fall through to branch detection
    }
  }

  // Try to extract ticket ID from branch name
  const branchResult = runGitCommand("git branch --show-current", projectPath);
  if (!branchResult.success || !branchResult.output) {
    return { ticketId: null, source: "none" };
  }

  const branch = branchResult.output.trim();
  // Branch format: feature/{short-id}-{slug}
  const match = branch.match(/^feature\/([a-f0-9]{8})-/);
  if (!match) {
    return { ticketId: null, source: "none" };
  }

  const shortTicketId = match[1];
  const ticket = db
    .prepare("SELECT id FROM tickets WHERE id LIKE ? LIMIT 1")
    .get(`${shortTicketId}%`) as { id: string } | undefined;

  if (ticket) {
    return { ticketId: ticket.id, source: "branch" };
  }

  return { ticketId: null, source: "none" };
}

/**
 * Get commits on the current branch since it diverged from main/master.
 */
function getRecentCommits(projectPath: string): Array<{ hash: string; message: string }> {
  let baseBranch = "main";
  const checkMain = runGitCommand("git rev-parse --verify main 2>/dev/null", projectPath);
  if (!checkMain.success) {
    const checkMaster = runGitCommand("git rev-parse --verify master 2>/dev/null", projectPath);
    if (checkMaster.success) {
      baseBranch = "master";
    } else {
      const result = runGitCommand('git log --oneline -20 --format="%H|%s"', projectPath);
      if (!result.success || !result.output) return [];
      return result.output
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [hash, ...msgParts] = line.split("|");
          return { hash: hash!, message: msgParts.join("|") };
        });
    }
  }

  const mergeBaseResult = runGitCommand(`git merge-base ${baseBranch} HEAD`, projectPath);
  if (!mergeBaseResult.success || !mergeBaseResult.output) {
    return [];
  }

  const mergeBase = mergeBaseResult.output.trim();
  const result = runGitCommand(
    `git log --oneline ${mergeBase}..HEAD --format="%H|%s"`,
    projectPath
  );
  if (!result.success || !result.output) return [];

  return result.output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, ...msgParts] = line.split("|");
      return { hash: hash!, message: msgParts.join("|") };
    });
}

/**
 * Sync PR statuses for all tickets in a project by querying GitHub.
 */
function syncProjectPRStatuses(
  db: DbHandle,
  projectId: string,
  projectPath: string
): { synced: SyncedPR[]; errors: string[] } {
  const synced: SyncedPR[] = [];
  const errors: string[] = [];

  const ticketsWithPRs = db
    .prepare(
      `SELECT id, title, pr_number, pr_status
       FROM tickets
       WHERE project_id = ? AND pr_number IS NOT NULL`
    )
    .all(projectId) as TicketWithPRRow[];

  if (ticketsWithPRs.length === 0) {
    return { synced: [], errors: [] };
  }

  for (const ticket of ticketsWithPRs) {
    try {
      const ghResult = runGitCommand(
        `gh pr view ${ticket.pr_number} --json state,mergedAt 2>/dev/null`,
        projectPath
      );

      if (!ghResult.success) continue;

      let prData: { state?: string; mergedAt?: string | null };
      try {
        prData = JSON.parse(ghResult.output) as { state?: string; mergedAt?: string | null };
      } catch {
        continue;
      }

      let newStatus = ticket.pr_status;
      if (prData.state === "MERGED" || prData.mergedAt) {
        newStatus = "merged";
      } else if (prData.state === "CLOSED") {
        newStatus = "closed";
      } else if (prData.state === "OPEN") {
        newStatus = "open";
      }

      if (newStatus !== ticket.pr_status) {
        const now = new Date().toISOString();
        db.prepare("UPDATE tickets SET pr_status = ?, updated_at = ? WHERE id = ?").run(
          newStatus,
          now,
          ticket.id
        );
        synced.push({
          ticketId: ticket.id,
          title: ticket.title,
          prNumber: ticket.pr_number,
          oldStatus: ticket.pr_status,
          newStatus: newStatus || "open",
        });
      }
    } catch (err) {
      errors.push(`PR #${ticket.pr_number}: ${(err as Error).message}`);
    }
  }

  return { synced, errors };
}

// ============================================
// Public API
// ============================================

/**
 * Link a git commit to a ticket.
 * Returns information about the link, including whether it was already linked.
 */
export function linkCommit(
  db: DbHandle,
  ticketId: string,
  commitHash: string,
  message?: string
): LinkCommitResult {
  const ticket = getTicketWithProject(db, ticketId);

  let commitMessage = message || "";
  if (!commitMessage && existsSync(ticket.project_path)) {
    const gitCheck = runGitCommand("git rev-parse --git-dir", ticket.project_path);
    if (gitCheck.success) {
      const msgResult = runGitCommand(
        `git log -1 --format=%s ${commitHash} 2>/dev/null`,
        ticket.project_path
      );
      if (msgResult.success && msgResult.output) commitMessage = msgResult.output;
    }
  }

  const linkedCommits: Commit[] = safeJsonParse(ticket.linked_commits, []);

  const alreadyLinked = linkedCommits.some(
    (c) => c.hash === commitHash || c.hash.startsWith(commitHash) || commitHash.startsWith(c.hash)
  );

  if (alreadyLinked) {
    return {
      ticketId,
      ticketTitle: ticket.title,
      commitHash,
      commitMessage,
      alreadyLinked: true,
      totalCommits: linkedCommits.length,
      linkedCommits,
    };
  }

  linkedCommits.push({
    hash: commitHash,
    message: commitMessage,
    linkedAt: new Date().toISOString(),
  });

  const now = new Date().toISOString();
  db.prepare("UPDATE tickets SET linked_commits = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify(linkedCommits),
    now,
    ticketId
  );

  return {
    ticketId,
    ticketTitle: ticket.title,
    commitHash,
    commitMessage,
    alreadyLinked: false,
    totalCommits: linkedCommits.length,
    linkedCommits,
  };
}

/**
 * Link a GitHub PR to a ticket.
 * Also triggers a PR status sync for all tickets in the project.
 */
export function linkPr(
  db: DbHandle,
  ticketId: string,
  prNumber: number,
  prUrl?: string,
  prStatus?: PrStatus
): LinkPrResult {
  const ticket = getTicketWithProject(db, ticketId);

  // Try to auto-detect PR URL if not provided
  let finalPrUrl = prUrl || null;
  if (!finalPrUrl && existsSync(ticket.project_path)) {
    const remoteResult = runGitCommand(
      "git remote get-url origin 2>/dev/null",
      ticket.project_path
    );
    if (remoteResult.success && remoteResult.output) {
      const remote = remoteResult.output.trim();
      const match = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
      if (match) {
        const repoPath = match[1]!.replace(/\.git$/, "");
        finalPrUrl = `https://github.com/${repoPath}/pull/${prNumber}`;
      }
    }
  }

  const finalStatus: PrStatus = prStatus || "open";
  const now = new Date().toISOString();

  db.prepare(
    "UPDATE tickets SET pr_number = ?, pr_url = ?, pr_status = ?, updated_at = ? WHERE id = ?"
  ).run(prNumber, finalPrUrl, finalStatus, now, ticketId);

  // Sync PR statuses for all tickets in this project
  let syncedPrs: SyncedPR[] = [];
  if (existsSync(ticket.project_path)) {
    try {
      const syncResult = syncProjectPRStatuses(db, ticket.project_id, ticket.project_path);
      syncedPrs = syncResult.synced;
    } catch {
      // Sync failures are non-fatal
    }
  }

  return {
    ticketId,
    ticketTitle: ticket.title,
    prNumber,
    prUrl: finalPrUrl,
    prStatus: finalStatus,
    syncedPrs,
  };
}

/**
 * Automatically discover and link commits and PRs to the active ticket.
 * Finds the active ticket from Ralph state or branch name, then syncs.
 */
export function syncTicketLinks(db: DbHandle, projectPath?: string): SyncResult {
  const resolvedPath = projectPath || process.env.CLAUDE_PROJECT_DIR || process.cwd();

  if (!existsSync(resolvedPath)) {
    throw new PathNotFoundError(resolvedPath);
  }

  const { ticketId, source } = findActiveTicket(db, resolvedPath);
  if (!ticketId) {
    throw new ValidationError(
      "No active ticket found. Start ticket work or be on a feature branch (feature/{short-id}-{slug})."
    );
  }

  const ticket = getTicketWithProject(db, ticketId);

  const result: SyncResult = {
    ticketId,
    ticketTitle: ticket.title,
    source,
    commitsLinked: [],
    commitsSkipped: [],
    prLinked: null,
    prSkipped: null,
  };

  // Sync commits
  const existingCommits: Commit[] = safeJsonParse(ticket.linked_commits, []);
  const commits = getRecentCommits(resolvedPath);
  const now = new Date().toISOString();

  for (const commit of commits) {
    const alreadyLinked = existingCommits.some(
      (c) =>
        c.hash === commit.hash || c.hash.startsWith(commit.hash) || commit.hash.startsWith(c.hash)
    );

    if (alreadyLinked) {
      result.commitsSkipped.push({ hash: shortId(commit.hash), message: commit.message });
    } else {
      existingCommits.push({
        hash: commit.hash,
        message: commit.message,
        linkedAt: now,
      });
      result.commitsLinked.push({ hash: shortId(commit.hash), message: commit.message });
    }
  }

  if (result.commitsLinked.length > 0) {
    db.prepare("UPDATE tickets SET linked_commits = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify(existingCommits),
      now,
      ticketId
    );
  }

  // Sync PR
  const branchResult = runGitCommand("git branch --show-current", resolvedPath);
  if (branchResult.success && branchResult.output) {
    const branch = branchResult.output.trim();
    const prResult = runGitCommand(
      `gh pr view "${branch}" --json number,url,state 2>/dev/null`,
      resolvedPath
    );

    if (prResult.success && prResult.output) {
      try {
        const prData = JSON.parse(prResult.output) as {
          number?: number;
          url?: string;
          state?: string;
        };
        if (prData.number) {
          if (ticket.pr_number === prData.number) {
            result.prSkipped = { number: prData.number, reason: "already linked" };
          } else {
            let prStatus = "open";
            if (prData.state === "MERGED") prStatus = "merged";
            else if (prData.state === "CLOSED") prStatus = "closed";

            db.prepare(
              "UPDATE tickets SET pr_number = ?, pr_url = ?, pr_status = ?, updated_at = ? WHERE id = ?"
            ).run(prData.number, prData.url || null, prStatus, now, ticketId);

            result.prLinked = {
              number: prData.number,
              url: prData.url,
              status: prStatus,
            };
          }
        }
      } catch {
        // PR query parse failed, non-fatal
      }
    }
  }

  return result;
}
