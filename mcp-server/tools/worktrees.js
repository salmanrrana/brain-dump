/**
 * Worktree management tools for Brain Dump MCP server.
 * @module tools/worktrees
 */
import { z } from "zod";
import { log } from "../lib/logging.js";
import {
  validateWorktree,
  removeWorktree,
} from "../lib/worktree-utils.js";
import { runGhCommandSafe } from "../lib/git-utils.js";
import { existsSync } from "fs";

/**
 * Check if a PR is merged by querying GitHub.
 * @param {string} prNumber - PR number
 * @param {string} projectPath - Path to the project (for gh cli)
 * @returns {{ isMerged: boolean, state: string | null, error: string | null }}
 */
function checkPRMerged(prNumber, projectPath) {
  if (!prNumber) {
    return { isMerged: false, state: null, error: "No PR number" };
  }

  const ghResult = runGhCommandSafe(
    ["pr", "view", String(prNumber), "--json", "state,mergedAt"],
    projectPath
  );

  if (!ghResult.success) {
    return { isMerged: false, state: null, error: "gh command failed" };
  }

  try {
    const prData = JSON.parse(ghResult.output);
    const isMerged = prData.state === "MERGED" || !!prData.mergedAt;
    return { isMerged, state: prData.state, error: null };
  } catch (parseError) {
    return { isMerged: false, state: null, error: `Failed to parse PR data: ${parseError.message}` };
  }
}

/**
 * Information about a worktree eligible for cleanup.
 * @typedef {Object} WorktreeCleanupInfo
 * @property {string} worktreePath - Absolute path to the worktree
 * @property {string} epicId - Epic ID
 * @property {string} epicTitle - Epic title
 * @property {string} projectPath - Main project path
 * @property {string} projectName - Project name
 * @property {string} epicStatus - Epic status (e.g., "done")
 * @property {number | null} prNumber - PR number if linked
 * @property {string | null} prStatus - PR status (e.g., "merged")
 * @property {boolean} hasUncommittedChanges - Whether worktree has uncommitted changes
 * @property {boolean} canRemove - Whether the worktree can be safely removed
 * @property {string} reason - Reason for canRemove status
 */

/**
 * Register worktree management tools with the MCP server.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {import("better-sqlite3").Database} db
 */
export function registerWorktreeTools(server, db) {
  // Cleanup worktrees
  server.tool(
    "cleanup_worktrees",
    `Remove stale worktrees for completed/merged epics.

This tool helps clean up git worktrees that are no longer needed:
1. Lists all worktrees across project(s)
2. Checks if safe to remove based on:
   - Epic status = done
   - PR status = merged
   - No uncommitted changes (unless force=true)
3. Removes worktrees and updates database

**Safety features:**
- Default dryRun=true - shows what would be removed without actually deleting
- Never removes worktrees with uncommitted changes unless force=true
- Only removes if epic is done AND PR is merged
- Logs all operations for audit

Args:
  projectId: Optional project ID to limit cleanup to one project
  force: Force removal even with uncommitted changes (default: false)
  dryRun: Preview what would be removed without deleting (default: true)

Returns:
  Detailed results with removed/skipped worktrees and reasons.`,
    {
      projectId: z.string().optional().describe("Filter by project ID"),
      force: z.boolean().optional().default(false).describe("Force removal even with uncommitted changes"),
      dryRun: z.boolean().optional().default(true).describe("Preview without deleting (default: true)"),
    },
    async ({ projectId, force, dryRun }) => {
      const results = {
        removed: [],
        skipped: [],
        errors: [],
        dryRun,
      };

      // Get all epics with worktree paths (optionally filtered by project)
      let epicsQuery = `
        SELECT
          e.id as epic_id,
          e.title as epic_title,
          p.id as project_id,
          p.name as project_name,
          p.path as project_path,
          ews.worktree_path,
          ews.worktree_status,
          ews.pr_number,
          ews.pr_status
        FROM epic_workflow_state ews
        JOIN epics e ON ews.epic_id = e.id
        JOIN projects p ON e.project_id = p.id
        WHERE ews.worktree_path IS NOT NULL
      `;

      const params = [];
      if (projectId) {
        epicsQuery += " AND p.id = ?";
        params.push(projectId);
      }

      const epicsWithWorktrees = db.prepare(epicsQuery).all(...params);

      if (epicsWithWorktrees.length === 0) {
        return {
          content: [{
            type: "text",
            text: `## Worktree Cleanup${dryRun ? " (Dry Run)" : ""}\n\nNo worktrees found to clean up.${projectId ? `\n\nFiltered by project: ${projectId}` : ""}`,
          }],
        };
      }

      log.info(`Found ${epicsWithWorktrees.length} worktrees to evaluate for cleanup`);

      for (const epic of epicsWithWorktrees) {
        const cleanupInfo = {
          worktreePath: epic.worktree_path,
          epicId: epic.epic_id,
          epicTitle: epic.epic_title,
          projectPath: epic.project_path,
          projectName: epic.project_name,
          prNumber: epic.pr_number,
          prStatus: epic.pr_status,
          hasUncommittedChanges: false,
          canRemove: false,
          reason: "",
        };

        // Check if project path exists
        if (!existsSync(epic.project_path)) {
          cleanupInfo.reason = "Project path does not exist";
          results.skipped.push(cleanupInfo);
          continue;
        }

        // Check if worktree directory exists
        if (!existsSync(epic.worktree_path)) {
          // Worktree directory doesn't exist - clean up database reference
          cleanupInfo.reason = "Worktree directory no longer exists (cleaning up DB reference)";
          cleanupInfo.canRemove = true;

          if (!dryRun) {
            try {
              const now = new Date().toISOString();
              db.prepare(`
                UPDATE epic_workflow_state
                SET worktree_path = NULL, worktree_status = NULL, worktree_created_at = NULL, updated_at = ?
                WHERE epic_id = ?
              `).run(now, epic.epic_id);
              log.info(`Cleaned up orphaned worktree reference for epic ${epic.epic_id}`);
            } catch (dbErr) {
              results.errors.push({
                worktreePath: epic.worktree_path,
                error: `Database update failed: ${dbErr.message}`,
              });
              continue;
            }
          }

          results.removed.push(cleanupInfo);
          continue;
        }

        // Validate the worktree
        const validation = validateWorktree(epic.worktree_path, epic.project_path);

        if (validation.status === "corrupted") {
          cleanupInfo.reason = `Worktree is corrupted: ${validation.error}`;
          cleanupInfo.canRemove = true;
          // Corrupted worktrees can be force-removed
        } else if (validation.status === "missing_directory") {
          // Already handled above
          cleanupInfo.reason = "Worktree directory missing";
          cleanupInfo.canRemove = true;
        } else {
          cleanupInfo.hasUncommittedChanges = validation.hasUncommittedChanges || false;
        }

        // Check if all tickets in the epic are done
        const ticketStats = db.prepare(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done
          FROM tickets WHERE epic_id = ?
        `).get(epic.epic_id);

        const allTicketsDone = ticketStats.total > 0 && ticketStats.done === ticketStats.total;

        // Check PR status (refresh from GitHub if needed)
        let prMerged = epic.pr_status === "merged";
        if (!prMerged && epic.pr_number) {
          const prCheck = checkPRMerged(epic.pr_number, epic.project_path);
          if (prCheck.isMerged) {
            prMerged = true;
            // Update database with fresh PR status
            try {
              const now = new Date().toISOString();
              db.prepare(`
                UPDATE epic_workflow_state SET pr_status = 'merged', updated_at = ? WHERE epic_id = ?
              `).run(now, epic.epic_id);
              log.info(`Updated PR #${epic.pr_number} status to merged for epic ${epic.epic_id}`);
            } catch (dbUpdateError) {
              log.error(`Failed to update PR status in database: ${dbUpdateError.message}`);
              // Continue with cleanup - the PR is still merged even if we couldn't update the DB
            }
          }
          cleanupInfo.prStatus = prCheck.state || epic.pr_status;
        }

        // Determine if we can remove this worktree
        if (validation.status === "corrupted") {
          // Corrupted worktrees can always be cleaned up
          cleanupInfo.canRemove = true;
          cleanupInfo.reason = "Worktree is corrupted and can be safely removed";
        } else if (!allTicketsDone) {
          cleanupInfo.canRemove = false;
          cleanupInfo.reason = `Not all tickets are done (${ticketStats.done}/${ticketStats.total} complete)`;
        } else if (!prMerged && epic.pr_number) {
          cleanupInfo.canRemove = false;
          cleanupInfo.reason = `PR #${epic.pr_number} is not merged (status: ${cleanupInfo.prStatus || "unknown"})`;
        } else if (!epic.pr_number) {
          // No PR linked - just check tickets
          cleanupInfo.canRemove = allTicketsDone;
          cleanupInfo.reason = allTicketsDone
            ? "All tickets done, no PR linked - safe to remove"
            : "Tickets not complete";
        } else if (cleanupInfo.hasUncommittedChanges && !force) {
          cleanupInfo.canRemove = false;
          cleanupInfo.reason = "Has uncommitted changes (use force=true to override)";
        } else {
          cleanupInfo.canRemove = true;
          cleanupInfo.reason = prMerged
            ? "Epic complete and PR merged"
            : "Epic complete";
        }

        // Perform removal or skip
        if (!cleanupInfo.canRemove) {
          results.skipped.push(cleanupInfo);
        } else if (dryRun) {
          // Dry run - just report
          results.removed.push(cleanupInfo);
        } else {
          // Actually remove the worktree
          try {
            const removeResult = removeWorktree(
              epic.worktree_path,
              epic.project_path,
              { force: force || cleanupInfo.hasUncommittedChanges }
            );

            if (removeResult.success) {
              // Update database
              const now = new Date().toISOString();
              db.prepare(`
                UPDATE epic_workflow_state
                SET worktree_path = NULL, worktree_status = 'removed', updated_at = ?
                WHERE epic_id = ?
              `).run(now, epic.epic_id);

              log.info(`Removed worktree for epic ${epic.epic_id}: ${epic.worktree_path}`);
              results.removed.push(cleanupInfo);
            } else {
              results.errors.push({
                worktreePath: epic.worktree_path,
                error: removeResult.error || "Unknown error during removal",
              });
            }
          } catch (err) {
            results.errors.push({
              worktreePath: epic.worktree_path,
              error: err.message,
            });
          }
        }
      }

      // Build response
      let response = `## Worktree Cleanup${dryRun ? " (Dry Run)" : ""}\n\n`;

      if (projectId) {
        const project = db.prepare("SELECT name FROM projects WHERE id = ?").get(projectId);
        response += `**Project:** ${project?.name || projectId}\n\n`;
      }

      response += `**Summary:**\n`;
      response += `- Worktrees evaluated: ${epicsWithWorktrees.length}\n`;
      response += `- ${dryRun ? "Would remove" : "Removed"}: ${results.removed.length}\n`;
      response += `- Skipped: ${results.skipped.length}\n`;
      if (results.errors.length > 0) {
        response += `- Errors: ${results.errors.length}\n`;
      }
      response += "\n";

      if (results.removed.length > 0) {
        response += `### ${dryRun ? "Would Remove" : "Removed"} (${results.removed.length})\n\n`;
        for (const item of results.removed) {
          response += `**Epic:** ${item.epicTitle}\n`;
          response += `- Path: \`${item.worktreePath}\`\n`;
          response += `- Reason: ${item.reason}\n`;
          if (item.prNumber) {
            response += `- PR: #${item.prNumber} (${item.prStatus || "unknown"})\n`;
          }
          response += "\n";
        }
      }

      if (results.skipped.length > 0) {
        response += `### Skipped (${results.skipped.length})\n\n`;
        for (const item of results.skipped) {
          response += `**Epic:** ${item.epicTitle}\n`;
          response += `- Path: \`${item.worktreePath}\`\n`;
          response += `- Reason: ${item.reason}\n`;
          if (item.hasUncommittedChanges) {
            response += `- ⚠️ Has uncommitted changes\n`;
          }
          response += "\n";
        }
      }

      if (results.errors.length > 0) {
        response += `### Errors (${results.errors.length})\n\n`;
        for (const item of results.errors) {
          response += `- \`${item.worktreePath}\`: ${item.error}\n`;
        }
        response += "\n";
      }

      if (dryRun && results.removed.length > 0) {
        response += `---\n\n`;
        response += `**To actually remove these worktrees, run:**\n`;
        response += `\`\`\`\n`;
        response += `cleanup_worktrees({ dryRun: false${projectId ? `, projectId: "${projectId}"` : ""}${force ? ", force: true" : ""} })\n`;
        response += `\`\`\`\n`;
      }

      return {
        content: [{ type: "text", text: response }],
      };
    }
  );
}
