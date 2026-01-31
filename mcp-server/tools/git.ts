/**
 * Git integration tools for Brain Dump MCP server.
 * @module tools/git
 */
import { z } from "zod";
import { existsSync, readFileSync } from "fs";
import { log } from "../lib/logging.js";
import { runGitCommand, shortId } from "../lib/git-utils.js";
import type Database from "better-sqlite3";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Database row for a ticket joined with its project.
 * Uses snake_case to match SQLite column names.
 */
interface TicketRow {
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

/** Row for tickets with PR data (for sync) */
interface TicketWithPRRow {
  id: string;
  title: string;
  pr_number: number;
  pr_status: string | null;
}

/** Commit record stored in linked_commits JSON */
interface LinkedCommit {
  hash: string;
  message: string;
  linkedAt: string;
}

/** Result from syncProjectPRStatuses */
interface SyncedPR {
  ticketId: string;
  title: string;
  prNumber: number;
  oldStatus: string | null;
  newStatus: string;
}

/**
 * Sync PR statuses for all tickets in a project by querying GitHub.
 * Updates any PRs that have been merged or closed.
 */
async function syncProjectPRStatuses(
  db: Database.Database,
  projectId: string,
  projectPath: string
): Promise<{ synced: SyncedPR[]; errors: string[] }> {
  const synced: SyncedPR[] = [];
  const errors: string[] = [];

  // Get all tickets in this project that have a PR linked
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

  log.info(`Syncing PR statuses for ${ticketsWithPRs.length} tickets in project ${projectId}`);

  for (const ticket of ticketsWithPRs) {
    try {
      // Query GitHub for current PR state
      const ghResult = runGitCommand(
        `gh pr view ${ticket.pr_number} --json state,mergedAt 2>/dev/null`,
        projectPath
      );

      if (!ghResult.success) {
        // PR might not exist or gh cli not available
        continue;
      }

      let prData: { state?: string; mergedAt?: string | null };
      try {
        prData = JSON.parse(ghResult.output) as { state?: string; mergedAt?: string | null };
      } catch {
        continue;
      }

      // Map GitHub state to our status
      // GitHub returns: state = "MERGED" | "CLOSED" | "OPEN"
      // mergedAt = ISO timestamp if merged, null otherwise
      let newStatus = ticket.pr_status;
      if (prData.state === "MERGED" || prData.mergedAt) {
        newStatus = "merged";
      } else if (prData.state === "CLOSED") {
        newStatus = "closed";
      } else if (prData.state === "OPEN") {
        newStatus = "open";
      }

      // Update if status changed
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
        log.info(`Updated PR #${ticket.pr_number} status: ${ticket.pr_status} -> ${newStatus}`);
      }
    } catch (err) {
      errors.push(`PR #${ticket.pr_number}: ${(err as Error).message}`);
    }
  }

  return { synced, errors };
}

/**
 * Find the active ticket ID from Ralph state or branch name.
 */
function findActiveTicket(
  db: Database.Database,
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
  // Look up the full ticket ID from the database
  const ticket = db
    .prepare(`SELECT id FROM tickets WHERE id LIKE ? LIMIT 1`)
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
  // Find the base branch (main or master)
  let baseBranch = "main";
  const checkMain = runGitCommand("git rev-parse --verify main 2>/dev/null", projectPath);
  if (!checkMain.success) {
    const checkMaster = runGitCommand("git rev-parse --verify master 2>/dev/null", projectPath);
    if (checkMaster.success) {
      baseBranch = "master";
    } else {
      // No main or master, just get recent commits
      const result = runGitCommand(`git log --oneline -20 --format="%H|%s"`, projectPath);
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

  // Get commits since diverging from base branch
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
 * Register git integration tools with the MCP server.
 */
export function registerGitTools(server: McpServer, db: Database.Database): void {
  // Link commit to ticket
  server.tool(
    "link_commit_to_ticket",
    `Link a git commit to a ticket.

Stores the commit reference in the ticket's metadata.
Multiple commits can be linked to a single ticket.

Use this to track which commits are related to a ticket.
The commit can be queried later to see all work done.

Args:
  ticketId: The ticket ID to link the commit to
  commitHash: The git commit hash (full or short)
  message: Optional commit message (auto-fetched if not provided)

Returns:
  Updated list of linked commits for the ticket.`,
    {
      ticketId: z.string().describe("Ticket ID to link the commit to"),
      commitHash: z.string().describe("Git commit hash (full or abbreviated)"),
      message: z
        .string()
        .optional()
        .describe("Optional commit message (auto-fetched if in git repo)"),
    },
    async ({
      ticketId,
      commitHash,
      message,
    }: {
      ticketId: string;
      commitHash: string;
      message?: string | undefined;
    }) => {
      const ticket = db
        .prepare(
          `
        SELECT t.*, p.name as project_name, p.path as project_path
        FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
      `
        )
        .get(ticketId) as TicketRow | undefined;

      if (!ticket) {
        return {
          content: [{ type: "text" as const, text: `Ticket not found: ${ticketId}` }],
          isError: true,
        };
      }

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

      let linkedCommits: LinkedCommit[] = [];
      if (ticket.linked_commits) {
        try {
          linkedCommits = JSON.parse(ticket.linked_commits) as LinkedCommit[];
        } catch (parseErr) {
          log.warn(
            `Failed to parse linked_commits for ticket ${ticketId}: ${(parseErr as Error).message}`
          );
          linkedCommits = [];
        }
      }

      const alreadyLinked = linkedCommits.some(
        (c) =>
          c.hash === commitHash || c.hash.startsWith(commitHash) || commitHash.startsWith(c.hash)
      );
      if (alreadyLinked) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Commit ${commitHash} is already linked to this ticket.\n\nLinked commits:\n${JSON.stringify(linkedCommits, null, 2)}`,
            },
          ],
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

      log.info(`Linked commit ${commitHash} to ticket ${ticketId}`);

      return {
        content: [
          {
            type: "text" as const,
            text: `Commit linked to ticket "${ticket.title}"!\n\nCommit: ${commitHash}\nMessage: ${commitMessage || "(no message)"}\n\nAll linked commits (${linkedCommits.length}):\n${linkedCommits.map((c) => `- ${shortId(c.hash)}: ${c.message || "(no message)"}`).join("\n")}`,
          },
        ],
      };
    }
  );

  // Link PR to ticket
  server.tool(
    "link_pr_to_ticket",
    `Link a GitHub PR to a ticket for status tracking.

Associates a pull request with a ticket so the UI can display PR status.
Call this after creating a PR with 'gh pr create'.

Args:
  ticketId: The ticket ID to link the PR to
  prNumber: The GitHub PR number
  prUrl: Optional full PR URL (auto-generated if not provided)
  prStatus: Optional status ('draft', 'open', 'merged', 'closed') - defaults to 'open'

Returns:
  Updated ticket with PR information.`,
    {
      ticketId: z.string().describe("Ticket ID to link the PR to"),
      prNumber: z.number().int().describe("GitHub PR number"),
      prUrl: z
        .string()
        .optional()
        .describe("Full PR URL (optional, will be auto-generated if in git repo)"),
      prStatus: z
        .enum(["draft", "open", "merged", "closed"])
        .optional()
        .describe("PR status (default: 'open')"),
    },
    async ({
      ticketId,
      prNumber,
      prUrl,
      prStatus,
    }: {
      ticketId: string;
      prNumber: number;
      prUrl?: string | undefined;
      prStatus?: "draft" | "open" | "merged" | "closed" | undefined;
    }) => {
      const ticket = db
        .prepare(
          `
        SELECT t.*, p.name as project_name, p.path as project_path
        FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
      `
        )
        .get(ticketId) as TicketRow | undefined;

      if (!ticket) {
        return {
          content: [{ type: "text" as const, text: `Ticket not found: ${ticketId}` }],
          isError: true,
        };
      }

      // Try to auto-detect PR URL if not provided
      let finalPrUrl = prUrl;
      if (!finalPrUrl && existsSync(ticket.project_path)) {
        const remoteResult = runGitCommand(
          "git remote get-url origin 2>/dev/null",
          ticket.project_path
        );
        if (remoteResult.success && remoteResult.output) {
          const remote = remoteResult.output.trim();
          // Parse GitHub URL (supports both SSH and HTTPS formats)
          const match = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
          if (match) {
            const repoPath = match[1]!.replace(/\.git$/, "");
            finalPrUrl = `https://github.com/${repoPath}/pull/${prNumber}`;
          }
        }
      }

      const finalStatus = prStatus || "open";
      const now = new Date().toISOString();

      try {
        db.prepare(
          "UPDATE tickets SET pr_number = ?, pr_url = ?, pr_status = ?, updated_at = ? WHERE id = ?"
        ).run(prNumber, finalPrUrl || null, finalStatus, now, ticketId);
      } catch (dbErr) {
        log.error(
          `Failed to update ticket with PR info for ${ticketId}: ${(dbErr as Error).message}`
        );
        return {
          content: [
            { type: "text" as const, text: `Failed to link PR: ${(dbErr as Error).message}` },
          ],
          isError: true,
        };
      }

      log.info(`Linked PR #${prNumber} (${finalStatus}) to ticket ${ticketId}`);

      // Sync PR statuses for all tickets in this project
      let syncSummary = "";
      if (existsSync(ticket.project_path)) {
        try {
          const syncResult = await syncProjectPRStatuses(
            db,
            ticket.project_id,
            ticket.project_path
          );
          if (syncResult.synced.length > 0) {
            syncSummary = `\n\n**PR Status Sync:**\nUpdated ${syncResult.synced.length} PR status(es):\n${syncResult.synced
              .map((s) => `- PR #${s.prNumber}: ${s.oldStatus} → ${s.newStatus} ("${s.title}")`)
              .join("\n")}`;
          }
          if (syncResult.errors.length > 0) {
            log.warn(`PR sync errors: ${syncResult.errors.join(", ")}`);
          }
        } catch (syncErr) {
          log.warn(`Failed to sync PR statuses: ${(syncErr as Error).message}`);
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `PR linked to ticket "${ticket.title}"!

**PR #${prNumber}** - ${finalStatus}
${finalPrUrl ? `**URL:** ${finalPrUrl}` : "(URL not available)"}

The PR status will be displayed on the ticket in the Brain Dump UI.${syncSummary}`,
          },
        ],
      };
    }
  );

  // Sync ticket links - auto-discover and link commits/PRs
  server.tool(
    "sync_ticket_links",
    `Automatically discover and link commits and PRs to the active ticket.

This tool finds the active ticket from Ralph state or branch name, then:
1. Queries git log for commits on the current branch
2. Links any commits that aren't already linked to the ticket
3. Queries GitHub for PRs on the current branch
4. Links any PR that isn't already linked to the ticket

Use this tool:
- After making commits to ensure they're tracked
- At the start of a session to catch up on any missed links
- Before completing work to ensure all commits/PRs are recorded

Args:
  projectPath: The project path (defaults to current working directory from env)

Returns:
  Summary of newly linked commits and PRs.`,
    {
      projectPath: z.string().optional().describe("Project path (auto-detected if not provided)"),
    },
    async ({ projectPath: inputPath }: { projectPath?: string | undefined }) => {
      // Determine project path - try input, then env, then cwd
      const projectPath = inputPath || process.env.CLAUDE_PROJECT_DIR || process.cwd();

      if (!existsSync(projectPath)) {
        return {
          content: [{ type: "text" as const, text: `Project path not found: ${projectPath}` }],
          isError: true,
        };
      }

      // Find the active ticket
      const { ticketId, source } = findActiveTicket(db, projectPath);
      if (!ticketId) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No active ticket found.

To link commits/PRs, either:
1. Start ticket work: start_ticket_work({ ticketId: "..." })
2. Or be on a feature branch: feature/{short-id}-{slug}

Current detection methods tried:
- Ralph state file (.claude/ralph-state.json): not found
- Branch name pattern (feature/{id}-...): no match`,
            },
          ],
          isError: true,
        };
      }

      // Get ticket info
      const ticket = db
        .prepare(
          `SELECT t.*, p.name as project_name, p.path as project_path
           FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?`
        )
        .get(ticketId) as TicketRow | undefined;

      if (!ticket) {
        return {
          content: [{ type: "text" as const, text: `Ticket not found in database: ${ticketId}` }],
          isError: true,
        };
      }

      const results: {
        ticketId: string;
        ticketTitle: string;
        source: string;
        commitsLinked: Array<{ hash: string; message: string }>;
        commitsSkipped: Array<{ hash: string; message: string }>;
        prLinked: { number: number; url?: string | undefined; status: string } | null;
        prSkipped: { number: number; reason: string } | null;
      } = {
        ticketId,
        ticketTitle: ticket.title,
        source,
        commitsLinked: [],
        commitsSkipped: [],
        prLinked: null,
        prSkipped: null,
      };

      // Get existing linked commits for comparison
      let existingCommits: LinkedCommit[] = [];
      if (ticket.linked_commits) {
        try {
          existingCommits = JSON.parse(ticket.linked_commits) as LinkedCommit[];
        } catch {
          existingCommits = [];
        }
      }

      // Get recent commits on this branch
      const commits = getRecentCommits(projectPath);
      const now = new Date().toISOString();

      for (const commit of commits) {
        // Check if already linked (match by hash prefix)
        const alreadyLinked = existingCommits.some(
          (c) =>
            c.hash === commit.hash ||
            c.hash.startsWith(commit.hash) ||
            commit.hash.startsWith(c.hash)
        );

        if (alreadyLinked) {
          results.commitsSkipped.push({ hash: shortId(commit.hash), message: commit.message });
        } else {
          existingCommits.push({
            hash: commit.hash,
            message: commit.message,
            linkedAt: now,
          });
          results.commitsLinked.push({ hash: shortId(commit.hash), message: commit.message });
        }
      }

      // Update ticket with new commits if any were linked
      if (results.commitsLinked.length > 0) {
        db.prepare("UPDATE tickets SET linked_commits = ?, updated_at = ? WHERE id = ?").run(
          JSON.stringify(existingCommits),
          now,
          ticketId
        );
        log.info(`Linked ${results.commitsLinked.length} commits to ticket ${ticketId}`);
      }

      // Check for PR on current branch
      const branchResult = runGitCommand("git branch --show-current", projectPath);
      if (branchResult.success && branchResult.output) {
        const branch = branchResult.output.trim();
        const prResult = runGitCommand(
          `gh pr view "${branch}" --json number,url,state 2>/dev/null`,
          projectPath
        );

        if (prResult.success && prResult.output) {
          try {
            const prData = JSON.parse(prResult.output) as {
              number?: number;
              url?: string;
              state?: string;
            };
            if (prData.number) {
              // Check if PR is already linked
              if (ticket.pr_number === prData.number) {
                results.prSkipped = { number: prData.number, reason: "already linked" };
              } else {
                // Map GitHub state to our status
                let prStatus = "open";
                if (prData.state === "MERGED") prStatus = "merged";
                else if (prData.state === "CLOSED") prStatus = "closed";

                // Link the PR
                db.prepare(
                  "UPDATE tickets SET pr_number = ?, pr_url = ?, pr_status = ?, updated_at = ? WHERE id = ?"
                ).run(prData.number, prData.url || null, prStatus, now, ticketId);

                results.prLinked = {
                  number: prData.number,
                  url: prData.url,
                  status: prStatus,
                };
                log.info(`Linked PR #${prData.number} to ticket ${ticketId}`);
              }
            }
          } catch {
            // PR query failed, that's OK
          }
        }
      }

      // Build summary
      let summary = `## Sync Complete for "${ticket.title}"\n\n`;
      summary += `**Ticket:** ${shortId(ticketId)}\n`;
      summary += `**Detection:** ${source}\n\n`;

      if (results.commitsLinked.length > 0) {
        summary += `### Commits Linked (${results.commitsLinked.length})\n`;
        for (const c of results.commitsLinked) {
          summary += `- \`${c.hash}\`: ${c.message}\n`;
        }
        summary += "\n";
      } else {
        summary += `### Commits\nNo new commits to link.\n\n`;
      }

      if (results.commitsSkipped.length > 0) {
        summary += `### Already Linked (${results.commitsSkipped.length})\n`;
        for (const c of results.commitsSkipped) {
          summary += `- \`${c.hash}\`: ${c.message}\n`;
        }
        summary += "\n";
      }

      if (results.prLinked) {
        summary += `### PR Linked\n`;
        summary += `- PR #${results.prLinked.number} (${results.prLinked.status})\n`;
        if (results.prLinked.url) {
          summary += `- URL: ${results.prLinked.url}\n`;
        }
      } else if (results.prSkipped) {
        summary += `### PR\nPR #${results.prSkipped.number} already linked.\n`;
      } else {
        summary += `### PR\nNo PR found for current branch.\n`;
      }

      return {
        content: [{ type: "text" as const, text: summary }],
      };
    }
  );
}
