/**
 * Workflow tools for Brain Dump MCP server.
 * Handles starting and completing ticket work (includes git branch creation).
 * Smart workflow automation - handles comments, PRD updates, next ticket suggestions,
 * and automatic conversation session management for compliance logging.
 * @module tools/workflow
 */
import { z } from "zod";
import { existsSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { log } from "../lib/logging.js";
import { runGitCommandSafe, runGhCommandSafe, shortId, generateBranchName, generateEpicBranchName } from "../lib/git-utils.js";
import { getEffectiveIsolationMode } from "../lib/worktree-flags.js";
import {
  generateWorktreePath,
  createWorktree,
  validateWorktree,
  removeWorktree,
} from "../lib/worktree-utils.js";
import { getActiveTelemetrySession, logMcpCallEvent } from "../lib/telemetry-self-log.js";
import {
  loadTicketAttachments,
  buildAttachmentContextSection,
} from "../lib/attachment-loader.js";
import {
  addComment,
  fetchTicketComments,
  buildCommentsSection,
} from "../lib/comment-utils.js";
import { updatePrdForTicket } from "../lib/prd-utils.js";
import {
  createConversationSession,
  endConversationSessions,
} from "../lib/conversation-session.js";
import {
  buildTicketContextContent,
  buildWarningsSection,
  buildAttachmentsSection,
} from "../lib/ticket-context-builder.js";


/**
 * Register workflow tools with the MCP server.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {import("better-sqlite3").Database} db
 * @param {Function} detectEnvironment - Environment detection function
 */
export function registerWorkflowTools(server, db, detectEnvironment) {
  // Start ticket work
  server.tool(
    "start_ticket_work",
    `Start working on a ticket.

This tool handles all workflow automatically:
1. Creates a git branch: feature/{ticket-short-id}-{slug}
2. Sets the ticket status to in_progress
3. Auto-posts a "Starting work" comment for tracking
4. Returns ticket context including description and acceptance criteria

If the ticket belongs to an epic with worktree isolation mode:
- Uses the epic's worktree directory instead of the main project
- Creates the worktree if it doesn't exist yet
- Updates ralph-state.json in the worktree's .claude directory

Use this when picking up a ticket to work on.
The project must have a git repository initialized.

Args:
  ticketId: The ticket ID to start working on

Returns:
  Branch name, ticket details with description/acceptance criteria, and project path (worktree path if using worktree isolation).`,
    { ticketId: z.string().describe("Ticket ID to start working on") },
    async ({ ticketId }) => {
      // Self-logging for telemetry in non-hook environments
      const telemetrySession = getActiveTelemetrySession(db, ticketId);
      let correlationId = null;
      const startTime = Date.now();
      if (telemetrySession) {
        correlationId = logMcpCallEvent(db, {
          sessionId: telemetrySession.id,
          ticketId: telemetrySession.ticket_id,
          event: "start",
          toolName: "start_ticket_work",
          params: { ticketId },
        });
      }

      const ticket = db.prepare(`
        SELECT t.*, p.name as project_name, p.path as project_path
        FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
      `).get(ticketId);

      if (!ticket) {
        if (telemetrySession && correlationId) {
          logMcpCallEvent(db, {
            sessionId: telemetrySession.id,
            ticketId: telemetrySession.ticket_id,
            event: "end",
            toolName: "start_ticket_work",
            correlationId,
            success: false,
            durationMs: Date.now() - startTime,
            error: "Ticket not found",
          });
        }
        return { content: [{ type: "text", text: `Ticket not found: ${ticketId}` }], isError: true };
      }

      if (ticket.status === "in_progress") {
        if (telemetrySession && correlationId) {
          logMcpCallEvent(db, {
            sessionId: telemetrySession.id,
            ticketId: telemetrySession.ticket_id,
            event: "end",
            toolName: "start_ticket_work",
            correlationId,
            success: true,
            durationMs: Date.now() - startTime,
          });
        }
        return { content: [{ type: "text", text: `Ticket is already in progress.\n\n${JSON.stringify(ticket, null, 2)}` }] };
      }

      if (!existsSync(ticket.project_path)) {
        return { content: [{ type: "text", text: `Project path does not exist: ${ticket.project_path}` }], isError: true };
      }

      const gitCheck = runGitCommandSafe(["rev-parse", "--git-dir"], ticket.project_path);
      if (!gitCheck.success) {
        return { content: [{ type: "text", text: `Not a git repository: ${ticket.project_path}\n\nInitialize git first: git init` }], isError: true };
      }

      // ===============================================
      // WORKTREE MODE: Check if ticket's epic uses worktree isolation
      // ===============================================
      let workingDirectory = ticket.project_path; // Default to main project path
      let worktreeContext = null; // Holds worktree-specific info if using worktree mode

      if (ticket.epic_id) {
        const epicState = db.prepare(`SELECT * FROM epic_workflow_state WHERE epic_id = ?`).get(ticket.epic_id);
        const { mode: effectiveMode, source: modeSource } = getEffectiveIsolationMode(db, ticket.epic_id, null);

        if (effectiveMode === "worktree") {
          // Epic uses worktree isolation mode
          const epic = db.prepare(`
            SELECT e.*, p.name as project_name, p.worktree_location, p.worktree_base_path, p.max_worktrees
            FROM epics e JOIN projects p ON e.project_id = p.id WHERE e.id = ?
          `).get(ticket.epic_id);

          if (epicState?.worktree_path) {
            // Worktree already exists - validate and use it
            const validation = validateWorktree(
              epicState.worktree_path,
              ticket.project_path,
              epicState.epic_branch_name
            );

            if (validation.status === "valid") {
              // Use existing worktree
              workingDirectory = epicState.worktree_path;
              worktreeContext = {
                worktreePath: epicState.worktree_path,
                mainRepoPath: ticket.project_path,
                branchName: epicState.epic_branch_name,
                epicTitle: epic?.title || "Unknown Epic",
                isolationMode: "worktree",
                modeSource,
                hasUncommittedChanges: validation.hasUncommittedChanges,
                prUrl: epicState.pr_url,
              };

              // Update epic workflow state to track current ticket
              const now = new Date().toISOString();
              db.prepare(`UPDATE epic_workflow_state SET current_ticket_id = ?, updated_at = ? WHERE epic_id = ?`).run(ticketId, now, ticket.epic_id);

              log.info(`Ticket ${ticketId} using epic worktree at ${workingDirectory}`);
            } else if (validation.status === "missing_directory" || validation.status === "corrupted") {
              // Worktree is invalid - need to recreate it
              log.warn(`Epic worktree at ${epicState.worktree_path} is ${validation.status}: ${validation.error || "not found"}`);

              // Clean up invalid worktree if it exists
              if (validation.status === "corrupted") {
                const cleanupResult = removeWorktree(epicState.worktree_path, ticket.project_path, { force: true });
                if (!cleanupResult.success) {
                  log.warn(`Failed to cleanup corrupted worktree: ${cleanupResult.error}`);
                }
              }

              // Clear invalid reference from database
              const clearNow = new Date().toISOString();
              db.prepare(`
                UPDATE epic_workflow_state
                SET worktree_path = NULL, worktree_status = NULL, worktree_created_at = NULL, updated_at = ?
                WHERE epic_id = ?
              `).run(clearNow, ticket.epic_id);

              // Now create a new worktree
              const branchName = generateEpicBranchName(epic.id, epic.title);
              const worktreeLocation = epic?.worktree_location || "sibling";
              const worktreePathResult = generateWorktreePath(
                ticket.project_path,
                epic.id,
                epic.title,
                {
                  location: worktreeLocation,
                  basePath: worktreeLocation === "custom" ? epic?.worktree_base_path : null,
                }
              );

              if (!worktreePathResult.success) {
                return {
                  content: [{
                    type: "text",
                    text: `Failed to generate worktree path: ${worktreePathResult.error}`,
                  }],
                  isError: true,
                };
              }

              const worktreePath = worktreePathResult.path;

              // Create the worktree
              const createResult = createWorktree(
                ticket.project_path,
                worktreePath,
                branchName,
                { maxWorktrees: epic?.max_worktrees || 5 }
              );

              if (!createResult.success) {
                return {
                  content: [{
                    type: "text",
                    text: `Failed to create worktree: ${createResult.error}`,
                  }],
                  isError: true,
                };
              }

              // Initialize ralph-state.json in the worktree
              const ralphState = {
                sessionId: null,
                ticketId: ticketId,
                currentState: "idle",
                stateHistory: ["idle"],
                worktreePath,
                mainRepoPath: ticket.project_path,
                isolationMode: "worktree",
                startedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };

              const ralphStatePath = path.join(worktreePath, ".claude", "ralph-state.json");
              try {
                writeFileSync(ralphStatePath, JSON.stringify(ralphState, null, 2), { mode: 0o600 });
                log.debug(`Initialized ralph-state.json at ${ralphStatePath}`);
              } catch (err) {
                // Rollback
                log.error(`Failed to write ralph-state.json: ${err.message}`);
                removeWorktree(worktreePath, ticket.project_path, { force: true });
                return {
                  content: [{
                    type: "text",
                    text: `Failed to initialize worktree state: ${err.message}\n\nThe worktree was cleaned up. Please try again.`,
                  }],
                  isError: true,
                };
              }

              // Update database
              const updateNow = new Date().toISOString();
              if (!epicState) {
                const stateId = randomUUID();
                db.prepare(`
                  INSERT INTO epic_workflow_state (id, epic_id, epic_branch_name, epic_branch_created_at, worktree_path, worktree_created_at, worktree_status, current_ticket_id, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(stateId, epic.id, branchName, updateNow, worktreePath, updateNow, "active", ticketId, updateNow, updateNow);
              } else {
                db.prepare(`
                  UPDATE epic_workflow_state
                  SET epic_branch_name = ?, epic_branch_created_at = ?, worktree_path = ?, worktree_created_at = ?, worktree_status = ?, current_ticket_id = ?, updated_at = ?
                  WHERE epic_id = ?
                `).run(branchName, updateNow, worktreePath, updateNow, "active", ticketId, updateNow, epic.id);
              }

              workingDirectory = worktreePath;
              worktreeContext = {
                worktreePath,
                mainRepoPath: ticket.project_path,
                branchName,
                epicTitle: epic?.title || "Unknown Epic",
                isolationMode: "worktree",
                modeSource,
                hasUncommittedChanges: false,
                wasCreated: true, // Flag to indicate this was just created
              };

              log.info(`Created epic worktree for ticket ${ticketId} at ${worktreePath}`);
            } else if (validation.status === "wrong_branch") {
              // Worktree exists but on wrong branch - this is unusual, warn but continue
              log.warn(`Worktree at ${epicState.worktree_path} is on branch ${validation.branch}, expected ${epicState.epic_branch_name}`);
              workingDirectory = epicState.worktree_path;
              worktreeContext = {
                worktreePath: epicState.worktree_path,
                mainRepoPath: ticket.project_path,
                branchName: validation.branch,
                expectedBranch: epicState.epic_branch_name,
                epicTitle: epic?.title || "Unknown Epic",
                isolationMode: "worktree",
                modeSource,
                hasUncommittedChanges: validation.hasUncommittedChanges,
                branchMismatch: true,
              };
            }
          } else if (epic) {
            // Epic uses worktree mode but no worktree exists yet - create it
            const branchName = generateEpicBranchName(epic.id, epic.title);
            const worktreeLocation = epic.worktree_location || "sibling";
            const worktreePathResult = generateWorktreePath(
              ticket.project_path,
              epic.id,
              epic.title,
              {
                location: worktreeLocation,
                basePath: worktreeLocation === "custom" ? epic.worktree_base_path : null,
              }
            );

            if (!worktreePathResult.success) {
              return {
                content: [{
                  type: "text",
                  text: `Failed to generate worktree path: ${worktreePathResult.error}`,
                }],
                isError: true,
              };
            }

            const worktreePath = worktreePathResult.path;

            // Create the worktree
            const createResult = createWorktree(
              ticket.project_path,
              worktreePath,
              branchName,
              { maxWorktrees: epic.max_worktrees || 5 }
            );

            if (!createResult.success) {
              return {
                content: [{
                  type: "text",
                  text: `Failed to create worktree: ${createResult.error}`,
                }],
                isError: true,
              };
            }

            // Initialize ralph-state.json in the worktree
            const ralphState = {
              sessionId: null,
              ticketId: ticketId,
              currentState: "idle",
              stateHistory: ["idle"],
              worktreePath,
              mainRepoPath: ticket.project_path,
              isolationMode: "worktree",
              startedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            const ralphStatePath = path.join(worktreePath, ".claude", "ralph-state.json");
            try {
              writeFileSync(ralphStatePath, JSON.stringify(ralphState, null, 2), { mode: 0o600 });
              log.debug(`Initialized ralph-state.json at ${ralphStatePath}`);
            } catch (err) {
              // Rollback
              log.error(`Failed to write ralph-state.json: ${err.message}`);
              removeWorktree(worktreePath, ticket.project_path, { force: true });
              return {
                content: [{
                  type: "text",
                  text: `Failed to initialize worktree state: ${err.message}\n\nThe worktree was cleaned up. Please try again.`,
                }],
                isError: true,
              };
            }

            // Create or update epic workflow state
            const updateNow = new Date().toISOString();
            if (!epicState) {
              const stateId = randomUUID();
              db.prepare(`
                INSERT INTO epic_workflow_state (id, epic_id, epic_branch_name, epic_branch_created_at, worktree_path, worktree_created_at, worktree_status, current_ticket_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(stateId, epic.id, branchName, updateNow, worktreePath, updateNow, "active", ticketId, updateNow, updateNow);
            } else {
              db.prepare(`
                UPDATE epic_workflow_state
                SET epic_branch_name = ?, epic_branch_created_at = ?, worktree_path = ?, worktree_created_at = ?, worktree_status = ?, current_ticket_id = ?, updated_at = ?
                WHERE epic_id = ?
              `).run(branchName, updateNow, worktreePath, updateNow, "active", ticketId, updateNow, epic.id);
            }

            workingDirectory = worktreePath;
            worktreeContext = {
              worktreePath,
              mainRepoPath: ticket.project_path,
              branchName,
              epicTitle: epic.title,
              isolationMode: "worktree",
              modeSource,
              hasUncommittedChanges: false,
              wasCreated: true,
            };

            log.info(`Created epic worktree for ticket ${ticketId} at ${worktreePath}`);
          }
        }
      }

      // ===============================================
      // If using worktree mode, skip branch handling and use worktree directly
      // ===============================================
      if (worktreeContext) {
        // We're using worktree mode - the worktree already has the correct branch checked out
        const branchName = worktreeContext.branchName;
        const usingEpicBranch = true;
        const epicInfo = {
          title: worktreeContext.epicTitle,
          branchName: branchName,
          prUrl: worktreeContext.prUrl,
          worktreePath: worktreeContext.worktreePath,
          isolationMode: "worktree",
        };

        const now = new Date().toISOString();
        try {
          db.prepare("UPDATE tickets SET status = 'in_progress', branch_name = ?, updated_at = ? WHERE id = ?").run(branchName, now, ticketId);
        } catch (dbErr) {
          log.error(`Failed to update ticket status: ${dbErr.message}`, { ticketId });
          return { content: [{ type: "text", text: `Failed to update ticket status: ${dbErr.message}` }], isError: true };
        }

        // Create or update workflow state for this ticket
        let workflowStateWarning = "";
        try {
          const existingState = db.prepare("SELECT id FROM ticket_workflow_state WHERE ticket_id = ?").get(ticketId);
          if (!existingState) {
            const stateId = randomUUID();
            db.prepare(
              `INSERT INTO ticket_workflow_state (id, ticket_id, current_phase, review_iteration, findings_count, findings_fixed, demo_generated, created_at, updated_at)
               VALUES (?, ?, 'implementation', 0, 0, 0, 0, ?, ?)`
            ).run(stateId, ticketId, now, now);
          } else {
            db.prepare(
              `UPDATE ticket_workflow_state SET current_phase = 'implementation', review_iteration = 0, findings_count = 0, findings_fixed = 0, demo_generated = 0, updated_at = ? WHERE ticket_id = ?`
            ).run(now, ticketId);
          }
        } catch (stateErr) {
          log.error(`Failed to create/update workflow state for ticket ${ticketId}: ${stateErr.message}`, { ticketId });
          workflowStateWarning = `\n\n**Warning:** Workflow state tracking failed: ${stateErr.message}.`;
        }

        // Auto-post progress comment
        const startCommentContent = `Started work on ticket. Branch: \`${branchName}\` (worktree: ${worktreeContext.worktreePath})`;
        const commentResult = addComment(db, ticketId, startCommentContent, "ralph", "progress");
        if (!commentResult.success) {
          log.warn(`Comment not saved for ticket ${ticketId}: ${commentResult.error}`);
        }

        // Auto-create conversation session
        const environment = detectEnvironment();
        const sessionResult = createConversationSession(db, ticketId, ticket.project_id, environment);
        const sessionInfo = sessionResult.success
          ? `**Conversation Session:** \`${sessionResult.sessionId}\` (auto-created for compliance logging)`
          : `**Warning:** Compliance logging failed: ${sessionResult.error}.`;

        const updatedTicket = db.prepare(`
          SELECT t.*, p.name as project_name, p.path as project_path
          FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
        `).get(ticketId);

        // Parse acceptance criteria
        let acceptanceCriteria = ["Complete the implementation as described"];
        const parseWarnings = [];
        if (updatedTicket.subtasks) {
          try {
            const subtasks = JSON.parse(updatedTicket.subtasks);
            if (subtasks.length > 0) {
              acceptanceCriteria = subtasks.map(s => s.title || s);
            }
          } catch (parseErr) {
            log.warn(`Failed to parse subtasks for ticket ${ticketId}:`, parseErr);
            parseWarnings.push(`Failed to parse acceptance criteria: ${parseErr.message}.`);
          }
        }

        const description = updatedTicket.description || "No description provided";
        const priority = updatedTicket.priority || "medium";

        // Fetch comments
        const { comments, totalCount, truncated } = fetchTicketComments(db, ticketId);
        const commentsSection = buildCommentsSection(comments, totalCount, truncated);

        // Load attachments
        let attachmentsList = null;
        if (updatedTicket.attachments) {
          try {
            attachmentsList = JSON.parse(updatedTicket.attachments);
          } catch (parseErr) {
            parseWarnings.push(`Failed to parse attachments list: ${parseErr.message}.`);
          }
        }

        const { contentBlocks: attachmentBlocks, warnings: attachmentWarnings, telemetry: attachmentTelemetry } = loadTicketAttachments(ticketId, attachmentsList);
        const attachmentContext = buildAttachmentContextSection(attachmentTelemetry);
        const attachmentsSection = buildAttachmentsSection(attachmentBlocks);

        // Combine warnings
        const allWarnings = [...parseWarnings, ...attachmentWarnings];
        if (workflowStateWarning) {
          allWarnings.push(workflowStateWarning.trim());
        }
        if (worktreeContext.hasUncommittedChanges) {
          allWarnings.push("Worktree has uncommitted changes from previous session.");
        }
        if (worktreeContext.branchMismatch) {
          allWarnings.push(`Worktree is on branch '${worktreeContext.branchName}' but expected '${worktreeContext.expectedBranch}'.`);
        }
        const warningsSection = buildWarningsSection(allWarnings);

        // Build worktree-specific context
        const worktreeSection = `### Worktree Context

**Working Directory:** \`${worktreeContext.worktreePath}\`
**Main Repository:** \`${worktreeContext.mainRepoPath}\`
**Isolation Mode:** worktree (source: ${worktreeContext.modeSource})
${worktreeContext.wasCreated ? "**Note:** Worktree was just created for this epic." : ""}

> **Important:** All file operations should happen in the worktree directory.
> \`\`\`bash
> cd ${worktreeContext.worktreePath}
> \`\`\``;

        // Build the complete response for worktree mode
        const content = buildTicketContextContent(
          {
            ticket: updatedTicket,
            branchName,
            branchCreated: worktreeContext.wasCreated || false,
            epicInfo,
            usingEpicBranch,
            sessionInfo,
            attachmentContext,
            description,
            priority,
            acceptanceCriteria,
            commentsSection,
            attachmentsSection,
            warningsSection,
            worktreeSection, // Add the worktree section
          },
          attachmentBlocks
        );

        // Log successful completion to telemetry
        if (telemetrySession && correlationId) {
          logMcpCallEvent(db, {
            sessionId: telemetrySession.id,
            ticketId: telemetrySession.ticket_id,
            event: "end",
            toolName: "start_ticket_work",
            correlationId,
            success: true,
            durationMs: Date.now() - startTime,
          });
        }

        return { content };
      }

      // ===============================================
      // BRANCH MODE: Original branch-based workflow (below)
      // ===============================================

      // Check if ticket belongs to an epic with an existing branch
      let branchName;
      let branchCreated = false;
      let usingEpicBranch = false;
      let epicInfo = null;

      if (ticket.epic_id) {
        // Check for existing epic branch
        const epicState = db.prepare(`SELECT * FROM epic_workflow_state WHERE epic_id = ?`).get(ticket.epic_id);

        if (epicState?.epic_branch_name) {
          // Epic has a branch - use it
          const epicBranchExists = runGitCommandSafe(["show-ref", "--verify", "--quiet", `refs/heads/${epicState.epic_branch_name}`], ticket.project_path);
          if (epicBranchExists.success) {
            branchName = epicState.epic_branch_name;
            usingEpicBranch = true;

            // Get epic info for context
            const epic = db.prepare(`SELECT title FROM epics WHERE id = ?`).get(ticket.epic_id);
            epicInfo = {
              title: epic?.title || "Unknown Epic",
              branchName: branchName,
              prUrl: epicState.pr_url,
            };

            // Checkout the epic branch
            const checkoutBranch = runGitCommandSafe(["checkout", branchName], ticket.project_path);
            if (!checkoutBranch.success) {
              return { content: [{ type: "text", text: `Failed to checkout epic branch ${branchName}: ${checkoutBranch.error}` }], isError: true };
            }

            // Update epic workflow state to track current ticket
            const now = new Date().toISOString();
            db.prepare(`UPDATE epic_workflow_state SET current_ticket_id = ?, updated_at = ? WHERE epic_id = ?`).run(ticketId, now, ticket.epic_id);

            log.info(`Ticket ${ticketId} using epic branch ${branchName}`);
          } else {
            // Epic branch was deleted - suggest recreating it
            log.warn(`Epic branch ${epicState.epic_branch_name} no longer exists for ticket ${ticketId}`);
            return {
              content: [{
                type: "text",
                text: `Epic branch \`${epicState.epic_branch_name}\` no longer exists.

This ticket belongs to an epic that previously had a branch, but it was deleted.

**To fix:** Run \`start_epic_work("${ticket.epic_id}")\` to recreate the epic branch, then try again.`,
              }],
              isError: true,
            };
          }
        } else {
          // Ticket belongs to epic but no branch exists yet
          // Get epic info to generate branch name
          const epic = db.prepare(`SELECT id, title FROM epics WHERE id = ?`).get(ticket.epic_id);
          if (epic) {
            // Auto-create the epic branch for convenience
            branchName = generateEpicBranchName(epic.id, epic.title);
            usingEpicBranch = true;
            epicInfo = { title: epic.title, branchName: branchName };

            const epicBranchExists = runGitCommandSafe(["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], ticket.project_path);
            if (!epicBranchExists.success) {
              // Create the epic branch
              let baseBranch = "main";
              const mainExists = runGitCommandSafe(["show-ref", "--verify", "--quiet", "refs/heads/main"], ticket.project_path);
              if (!mainExists.success) {
                const masterExists = runGitCommandSafe(["show-ref", "--verify", "--quiet", "refs/heads/master"], ticket.project_path);
                if (masterExists.success) baseBranch = "master";
              }

              runGitCommandSafe(["checkout", baseBranch], ticket.project_path);
              const createBranch = runGitCommandSafe(["checkout", "-b", branchName], ticket.project_path);
              if (!createBranch.success) {
                return { content: [{ type: "text", text: `Failed to create epic branch ${branchName}: ${createBranch.error}` }], isError: true };
              }
              branchCreated = true;
            } else {
              const checkoutBranch = runGitCommandSafe(["checkout", branchName], ticket.project_path);
              if (!checkoutBranch.success) {
                return { content: [{ type: "text", text: `Failed to checkout epic branch ${branchName}: ${checkoutBranch.error}` }], isError: true };
              }
            }

            // Create/update epic workflow state with the branch
            const now = new Date().toISOString();
            const existingState = db.prepare(`SELECT id FROM epic_workflow_state WHERE epic_id = ?`).get(epic.id);
            if (existingState) {
              db.prepare(`
                UPDATE epic_workflow_state SET epic_branch_name = ?, epic_branch_created_at = ?, current_ticket_id = ?, updated_at = ?
                WHERE epic_id = ?
              `).run(branchName, now, ticketId, now, epic.id);
            } else {
              const stateId = randomUUID();
              db.prepare(`
                INSERT INTO epic_workflow_state (id, epic_id, epic_branch_name, epic_branch_created_at, current_ticket_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `).run(stateId, epic.id, branchName, now, ticketId, now, now);
            }

            log.info(`Auto-created epic branch ${branchName} for ticket ${ticketId}`);
          }
        }
      }

      // If not using epic branch, create ticket-specific branch (original behavior)
      if (!usingEpicBranch) {
        branchName = generateBranchName(ticketId, ticket.title);
        const branchExists = runGitCommandSafe(["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], ticket.project_path);

        if (!branchExists.success) {
          const createBranch = runGitCommandSafe(["checkout", "-b", branchName], ticket.project_path);
          if (!createBranch.success) {
            return { content: [{ type: "text", text: `Failed to create branch ${branchName}: ${createBranch.error}` }], isError: true };
          }
          branchCreated = true;
        } else {
          const checkoutBranch = runGitCommandSafe(["checkout", branchName], ticket.project_path);
          if (!checkoutBranch.success) {
            return { content: [{ type: "text", text: `Failed to checkout branch ${branchName}: ${checkoutBranch.error}` }], isError: true };
          }
        }
      }

      const now = new Date().toISOString();
      try {
        db.prepare("UPDATE tickets SET status = 'in_progress', branch_name = ?, updated_at = ? WHERE id = ?").run(branchName, now, ticketId);
      } catch (dbErr) {
        log.error(`Failed to update ticket status: ${dbErr.message}`, { ticketId });
        // Attempt to clean up the branch we just created - use two separate commands
        runGitCommandSafe(["checkout", "-"], ticket.project_path);
        runGitCommandSafe(["branch", "-d", branchName], ticket.project_path);
        return { content: [{ type: "text", text: `Failed to update ticket status: ${dbErr.message}\n\nThe git branch was cleaned up. Please try again.` }], isError: true };
      }

      // Create or update workflow state for this ticket (per spec: track workflow progress)
      // Wrapped in try-catch: workflow state is for tracking, not critical to ticket operation
      let workflowStateWarning = "";
      try {
        const existingState = db.prepare("SELECT id FROM ticket_workflow_state WHERE ticket_id = ?").get(ticketId);
        if (!existingState) {
          const stateId = randomUUID();
          db.prepare(
            `INSERT INTO ticket_workflow_state (id, ticket_id, current_phase, review_iteration, findings_count, findings_fixed, demo_generated, created_at, updated_at)
             VALUES (?, ?, 'implementation', 0, 0, 0, 0, ?, ?)`
          ).run(stateId, ticketId, now, now);
          log.info(`Created workflow state for ticket ${ticketId}`);
        } else {
          // Reset workflow state if ticket is being restarted
          db.prepare(
            `UPDATE ticket_workflow_state SET current_phase = 'implementation', review_iteration = 0, findings_count = 0, findings_fixed = 0, demo_generated = 0, updated_at = ? WHERE ticket_id = ?`
          ).run(now, ticketId);
          log.info(`Reset workflow state for ticket ${ticketId}`);
        }
      } catch (stateErr) {
        log.error(`Failed to create/update workflow state for ticket ${ticketId}: ${stateErr.message}`, { ticketId });
        workflowStateWarning = `\n\n**Warning:** Workflow state tracking failed: ${stateErr.message}. Ticket is in_progress but workflow tracking may be incomplete.`;
      }

      // Auto-post "Starting work" progress comment (per spec: mandatory audit trail)
      const startCommentContent = usingEpicBranch
        ? `Started work on ticket. Branch: \`${branchName}\` (epic branch)`
        : `Started work on ticket. Branch: \`${branchName}\``;
      const commentResult = addComment(db, ticketId, startCommentContent, "ralph", "progress");
      if (!commentResult.success) {
        log.warn(`Comment not saved for ticket ${ticketId}: ${commentResult.error}`);
      }

      // Auto-create conversation session for compliance logging
      const environment = detectEnvironment();
      const sessionResult = createConversationSession(db, ticketId, ticket.project_id, environment);
      const sessionInfo = sessionResult.success
        ? `**Conversation Session:** \`${sessionResult.sessionId}\` (auto-created for compliance logging)`
        : `**Warning:** Compliance logging failed: ${sessionResult.error}. Work may not be logged for audit.`;

      const updatedTicket = db.prepare(`
        SELECT t.*, p.name as project_name, p.path as project_path
        FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
      `).get(ticketId);

      log.info(`Started work on ticket ${ticketId}: branch ${branchName}`);

      // Parse acceptance criteria from subtasks JSON
      let acceptanceCriteria = ["Complete the implementation as described"];
      const parseWarnings = [];
      if (updatedTicket.subtasks) {
        try {
          const subtasks = JSON.parse(updatedTicket.subtasks);
          if (subtasks.length > 0) {
            acceptanceCriteria = subtasks.map(s => s.title || s);
          }
        } catch (parseErr) {
          log.warn(`Failed to parse subtasks for ticket ${ticketId}:`, parseErr);
          parseWarnings.push(`Failed to parse acceptance criteria: ${parseErr.message}. Using defaults.`);
        }
      }

      const description = updatedTicket.description || "No description provided";
      const priority = updatedTicket.priority || "medium";

      // Fetch previous comments for context
      const { comments, totalCount, truncated } = fetchTicketComments(db, ticketId);
      const commentsSection = buildCommentsSection(comments, totalCount, truncated);
      log.info(`Loaded ${comments.length} of ${totalCount} comments for ticket ${ticketId}`);

      // Load ticket attachments for LLM context
      let attachmentsList = null;
      if (updatedTicket.attachments) {
        try {
          attachmentsList = JSON.parse(updatedTicket.attachments);
        } catch (parseErr) {
          log.warn(`Failed to parse attachments for ticket ${ticketId}:`, parseErr);
          parseWarnings.push(`Failed to parse attachments list: ${parseErr.message}. Attachments will not be loaded.`);
        }
      }

      const { contentBlocks: attachmentBlocks, warnings: attachmentWarnings, telemetry: attachmentTelemetry } = loadTicketAttachments(ticketId, attachmentsList);

      // Log attachment telemetry for observability
      if (attachmentTelemetry.totalCount > 0) {
        log.info(`Attachment telemetry for ticket ${ticketId}:`, {
          total: attachmentTelemetry.totalCount,
          loaded: attachmentTelemetry.loadedCount,
          failed: attachmentTelemetry.failedCount,
          images: attachmentTelemetry.imageCount,
          totalSizeKB: Math.round(attachmentTelemetry.totalSizeBytes / 1024),
          filenames: attachmentTelemetry.filenames,
          failedFiles: attachmentTelemetry.failedFiles,
        });
      }

      // Build attachment context section with type-aware instructions
      const attachmentContext = buildAttachmentContextSection(attachmentTelemetry);

      // Build sections using extracted helper functions
      const attachmentsSection = buildAttachmentsSection(attachmentBlocks);

      // Combine all warnings (parse warnings, attachment warnings, workflow state warning)
      const allWarnings = [...parseWarnings, ...attachmentWarnings];
      if (workflowStateWarning) {
        allWarnings.push(workflowStateWarning.trim());
      }
      const warningsSection = buildWarningsSection(allWarnings);

      // Build the complete content array using the context builder
      const content = buildTicketContextContent(
        {
          ticket: updatedTicket,
          branchName,
          branchCreated,
          epicInfo,
          usingEpicBranch,
          sessionInfo,
          attachmentContext,
          description,
          priority,
          acceptanceCriteria,
          commentsSection,
          attachmentsSection,
          warningsSection,
        },
        attachmentBlocks
      );

      // Log successful completion to telemetry
      if (telemetrySession && correlationId) {
        logMcpCallEvent(db, {
          sessionId: telemetrySession.id,
          ticketId: telemetrySession.ticket_id,
          event: "end",
          toolName: "start_ticket_work",
          correlationId,
          success: true,
          durationMs: Date.now() - startTime,
        });
      }

      return { content };
    }
  );

  // Start epic work
  server.tool(
    "start_epic_work",
    `Start working on an epic. Creates an epic-level git branch that all tickets in the epic will share.

This tool handles epic-level workflow:
1. Creates an epic branch: feature/epic-{epic-short-id}-{slug}
2. Stores the branch name in epic_workflow_state for ticket reuse
3. Optionally creates a draft PR for the epic
4. Returns epic context including all tickets

Use this BEFORE starting work on any ticket in the epic.
All subsequent ticket work will use this epic branch instead of creating per-ticket branches.

Args:
  epicId: The epic ID to start working on
  createPr: Whether to create a draft PR immediately (default: false)
  isolationMode: Override isolation mode ('branch' or 'worktree'). If not provided, uses epic/project settings. Worktree mode requires feature flag to be enabled.

Returns:
  Branch name, epic details, and list of tickets in the epic.`,
    {
      epicId: z.string().describe("Epic ID to start working on"),
      createPr: z.boolean().optional().default(false).describe("Create a draft PR immediately"),
      isolationMode: z.enum(["branch", "worktree"]).optional().describe("Isolation mode: 'branch' (default) or 'worktree' (requires feature flag)"),
    },
    async ({ epicId, createPr, isolationMode: requestedIsolationMode }) => {
      // Check feature flag and get effective isolation mode
      const { mode: effectiveMode, source: modeSource } = getEffectiveIsolationMode(
        db,
        epicId,
        requestedIsolationMode || null
      );

      // Log if worktree was requested but not available
      if (requestedIsolationMode === "worktree" && effectiveMode === "branch") {
        log.info(`Worktree mode requested for epic ${epicId} but feature is disabled, using branch mode`);
      }

      // Get epic with project info
      const epic = db.prepare(`
        SELECT e.*, p.name as project_name, p.path as project_path,
               p.worktree_location, p.worktree_base_path, p.max_worktrees
        FROM epics e JOIN projects p ON e.project_id = p.id WHERE e.id = ?
      `).get(epicId);

      if (!epic) {
        return { content: [{ type: "text", text: `Epic not found: ${epicId}` }], isError: true };
      }

      if (!existsSync(epic.project_path)) {
        return { content: [{ type: "text", text: `Project path does not exist: ${epic.project_path}` }], isError: true };
      }

      const gitCheck = runGitCommandSafe(["rev-parse", "--git-dir"], epic.project_path);
      if (!gitCheck.success) {
        return { content: [{ type: "text", text: `Not a git repository: ${epic.project_path}\n\nInitialize git first: git init` }], isError: true };
      }

      // Check if epic workflow state already exists
      let epicState = db.prepare(`SELECT * FROM epic_workflow_state WHERE epic_id = ?`).get(epicId);

      // ===============================================
      // WORKTREE MODE: Handle worktree resumption or creation
      // ===============================================
      if (effectiveMode === "worktree") {
        // Check for existing worktree to resume
        if (epicState?.worktree_path) {
          const validation = validateWorktree(
            epicState.worktree_path,
            epic.project_path,
            epicState.epic_branch_name
          );

          if (validation.status === "valid") {
            // Resume existing worktree
            const epicTickets = db.prepare(`
              SELECT id, title, status, priority FROM tickets WHERE epic_id = ? ORDER BY position
            `).all(epicId);

            const uncommittedWarning = validation.hasUncommittedChanges
              ? "\n\n**Note:** Worktree has uncommitted changes from previous session."
              : "";

            log.info(`Resumed worktree for epic ${epicId} at ${epicState.worktree_path}`);

            return {
              content: [{
                type: "text",
                text: `## Epic Worktree Resumed

**Worktree Path:** \`${epicState.worktree_path}\`
**Branch:** \`${epicState.epic_branch_name}\`
**Epic:** ${epic.title}
**Project:** ${epic.project_name}
**Isolation Mode:** worktree (source: ${modeSource})${uncommittedWarning}
${epicState.pr_url ? `**PR:** ${epicState.pr_url}` : ""}

### Tickets in Epic (${epicTickets.length})
${epicTickets.map(t => `- [${t.status}] ${t.title} (${t.priority || "medium"})`).join("\n")}

---

All tickets in this epic will use the worktree at \`${epicState.worktree_path}\`.
Use \`start_ticket_work\` to begin work on any ticket.`,
              }],
            };
          }

          // Invalid worktree - log and clean up
          log.warn(`Existing worktree for epic ${epicId} is invalid: ${validation.status}. Cleaning up and recreating.`);
          if (validation.status !== "missing_directory") {
            // Try to remove the corrupted/wrong_branch worktree
            const removeResult = removeWorktree(epicState.worktree_path, epic.project_path, { force: true });
            if (!removeResult.success) {
              log.warn(`Failed to remove invalid worktree: ${removeResult.error}`);
            }
          }

          // Clear invalid worktree reference from database to prevent infinite loop
          const clearNow = new Date().toISOString();
          db.prepare(`
            UPDATE epic_workflow_state
            SET worktree_path = NULL, worktree_status = NULL, worktree_created_at = NULL, updated_at = ?
            WHERE epic_id = ?
          `).run(clearNow, epicId);
          log.info(`Cleared invalid worktree reference from epic workflow state for ${epicId}`);
        }

        // Generate branch name and worktree path
        const branchName = generateEpicBranchName(epicId, epic.title);
        const worktreeLocation = epic.worktree_location || "sibling";
        const worktreePathResult = generateWorktreePath(
          epic.project_path,
          epicId,
          epic.title,
          {
            location: worktreeLocation,
            basePath: worktreeLocation === "custom" ? epic.worktree_base_path : null,
          }
        );

        if (!worktreePathResult.success) {
          return {
            content: [{
              type: "text",
              text: `Failed to generate worktree path: ${worktreePathResult.error}`,
            }],
            isError: true,
          };
        }

        const worktreePath = worktreePathResult.path;

        // Create the worktree with security checks
        const createResult = createWorktree(
          epic.project_path,
          worktreePath,
          branchName,
          { maxWorktrees: epic.max_worktrees || 5 }
        );

        if (!createResult.success) {
          return {
            content: [{
              type: "text",
              text: `Failed to create worktree: ${createResult.error}`,
            }],
            isError: true,
          };
        }

        const now = new Date().toISOString();

        // Initialize ralph-state.json in the worktree's .claude directory
        const ralphState = {
          sessionId: null, // Will be set when create_ralph_session is called
          ticketId: null,  // Will be set when ticket work starts
          currentState: "idle",
          stateHistory: ["idle"],
          worktreePath,
          mainRepoPath: epic.project_path,
          isolationMode: "worktree",
          startedAt: now,
          updatedAt: now,
        };

        const ralphStatePath = path.join(worktreePath, ".claude", "ralph-state.json");
        try {
          writeFileSync(ralphStatePath, JSON.stringify(ralphState, null, 2), { mode: 0o600 });
          log.debug(`Initialized ralph-state.json at ${ralphStatePath}`);
        } catch (err) {
          // Rollback: remove the worktree we just created
          log.error(`Failed to write ralph-state.json: ${err.message}`);
          const rollbackResult = removeWorktree(worktreePath, epic.project_path, { force: true });
          const rollbackNote = rollbackResult.success
            ? "The worktree was cleaned up."
            : `WARNING: Failed to clean up worktree at ${worktreePath}: ${rollbackResult.error}\nYou may need to manually remove it.`;
          if (!rollbackResult.success) {
            log.error(`Rollback failed: ${rollbackResult.error}`);
          }
          return {
            content: [{
              type: "text",
              text: `Failed to initialize worktree state: ${err.message}\n\n${rollbackNote} Please try again.`,
            }],
            isError: true,
          };
        }

        // Save to database atomically (with rollback on failure)
        let epicTickets;
        try {
          // Use transaction to ensure all database operations succeed or none do
          const saveWorkflowState = db.transaction(() => {
            if (!epicState) {
              const stateId = randomUUID();
              db.prepare(`
                INSERT INTO epic_workflow_state (id, epic_id, epic_branch_name, epic_branch_created_at, worktree_path, worktree_created_at, worktree_status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(stateId, epicId, branchName, now, worktreePath, now, "active", now, now);
            } else {
              db.prepare(`
                UPDATE epic_workflow_state
                SET epic_branch_name = ?, epic_branch_created_at = ?, worktree_path = ?, worktree_created_at = ?, worktree_status = ?, updated_at = ?
                WHERE epic_id = ?
              `).run(branchName, now, worktreePath, now, "active", now, epicId);
            }

            epicTickets = db.prepare(`
              SELECT id, title, status, priority FROM tickets WHERE epic_id = ? ORDER BY position
            `).all(epicId);

            const ticketsTotal = epicTickets.length;
            const ticketsDone = epicTickets.filter(t => t.status === "done").length;
            db.prepare(`
              UPDATE epic_workflow_state SET tickets_total = ?, tickets_done = ?, updated_at = ? WHERE epic_id = ?
            `).run(ticketsTotal, ticketsDone, now, epicId);
          });

          saveWorkflowState();
        } catch (dbErr) {
          log.error(`Failed to save epic workflow state for ${epicId}`, { error: dbErr.message });
          // Rollback: remove the worktree we just created
          const rollbackResult = removeWorktree(worktreePath, epic.project_path, { force: true });
          const rollbackNote = rollbackResult.success
            ? "The worktree was cleaned up."
            : `WARNING: Failed to clean up worktree at ${worktreePath}: ${rollbackResult.error}\nYou may need to manually remove it.`;
          if (!rollbackResult.success) {
            log.error(`Rollback failed: ${rollbackResult.error}`);
          }
          return {
            content: [{
              type: "text",
              text: `Failed to save epic workflow state.\n\nError: ${dbErr.message}\n\n${rollbackNote} Please try again or check database health with get_database_health.`,
            }],
            isError: true,
          };
        }

        log.info(`Created worktree for epic ${epicId} at ${worktreePath}`);

        // Optionally create draft PR
        let prInfo = "";
        if (createPr) {
          // Push branch to remote first (from the worktree)
          const pushResult = runGitCommandSafe(["push", "-u", "origin", branchName], worktreePath);
          if (!pushResult.success) {
            prInfo = `\n\n**Warning:** Could not push branch to remote: ${pushResult.error}\nCreate PR manually when ready.`;
          } else {
            // Create draft PR using gh CLI (using runGhCommandSafe for security)
            const prResult = runGhCommandSafe(
              ["pr", "create", "--draft", "--title", `[Epic] ${epic.title}`, "--body", `Epic work for: ${epic.title}\n\nThis PR contains all tickets from the epic.`],
              worktreePath
            );
            if (prResult.success && prResult.output) {
              const prUrl = prResult.output.trim();
              // Extract PR number using regex to handle trailing slashes and edge cases
              const prMatch = prUrl.match(/\/(\d+)\/?$/);
              const prNumber = prMatch ? parseInt(prMatch[1], 10) : null;

              if (prNumber) {
                db.prepare(`
                  UPDATE epic_workflow_state SET pr_number = ?, pr_url = ?, pr_status = 'draft', updated_at = ? WHERE epic_id = ?
                `).run(prNumber, prUrl, now, epicId);
              } else {
                log.warn(`Failed to parse PR number from URL: ${prUrl}`);
                db.prepare(`
                  UPDATE epic_workflow_state SET pr_url = ?, pr_status = 'draft', updated_at = ? WHERE epic_id = ?
                `).run(prUrl, now, epicId);
              }

              prInfo = `\n\n**Draft PR Created:** ${prUrl}`;
              log.info(`Created draft PR for epic ${epicId}: ${prUrl}`);
            } else {
              prInfo = `\n\n**Warning:** Could not create PR: ${prResult.error}\nCreate PR manually when ready.`;
            }
          }
        }

        return {
          content: [{
            type: "text",
            text: `## Started Epic Work (Worktree Mode)

**Worktree Path:** \`${worktreePath}\`
**Branch:** \`${branchName}\` (created)
**Epic:** ${epic.title}
**Project:** ${epic.project_name}
**Main Repo:** ${epic.project_path}
**Isolation Mode:** worktree (source: ${modeSource})${prInfo}

### Tickets in Epic (${epicTickets.length})
${epicTickets.map(t => `- [${t.status}] ${t.title} (${t.priority || "medium"})`).join("\n")}

---

**Important:** Work in the worktree directory:
\`\`\`bash
cd ${worktreePath}
\`\`\`

All tickets in this epic will use this isolated worktree.
Use \`start_ticket_work\` to begin work on any ticket.`,
          }],
        };
      }

      // ===============================================
      // BRANCH MODE: Original branch-based workflow
      // ===============================================
      if (epicState?.epic_branch_name) {
        // Epic branch already exists - check it out and return info
        const branchExists = runGitCommandSafe(["show-ref", "--verify", "--quiet", `refs/heads/${epicState.epic_branch_name}`], epic.project_path);
        if (branchExists.success) {
          const checkoutBranch = runGitCommandSafe(["checkout", epicState.epic_branch_name], epic.project_path);
          if (!checkoutBranch.success) {
            return { content: [{ type: "text", text: `Failed to checkout existing epic branch ${epicState.epic_branch_name}: ${checkoutBranch.error}` }], isError: true };
          }

          // Get tickets in epic
          const epicTickets = db.prepare(`
            SELECT id, title, status, priority FROM tickets WHERE epic_id = ? ORDER BY position
          `).all(epicId);

          return {
            content: [{
              type: "text",
              text: `## Epic Already Started

**Branch:** \`${epicState.epic_branch_name}\` (checked out)
**Epic:** ${epic.title}
**Project:** ${epic.project_name}
**Isolation Mode:** branch (source: ${modeSource})
${epicState.pr_url ? `**PR:** ${epicState.pr_url}` : ""}

### Tickets in Epic (${epicTickets.length})
${epicTickets.map(t => `- [${t.status}] ${t.title} (${t.priority || "medium"})`).join("\n")}

Use \`start_ticket_work\` to begin work on any ticket. All tickets will use this branch.`,
            }],
          };
        }
        // Branch was deleted externally - we'll recreate it below
        log.warn(`Epic branch ${epicState.epic_branch_name} no longer exists, will recreate`);
      }

      // Generate epic branch name
      const branchName = generateEpicBranchName(epicId, epic.title);

      // Check if branch already exists in git (might have been created outside our tracking)
      const branchExists = runGitCommandSafe(["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], epic.project_path);

      let branchCreated = false;
      if (!branchExists.success) {
        // Create the branch from main/dev
        let baseBranch = "main";
        const mainExists = runGitCommandSafe(["show-ref", "--verify", "--quiet", "refs/heads/main"], epic.project_path);
        if (!mainExists.success) {
          const masterExists = runGitCommandSafe(["show-ref", "--verify", "--quiet", "refs/heads/master"], epic.project_path);
          if (masterExists.success) baseBranch = "master";
        }

        // Make sure we're on the base branch first, then create new branch
        const checkoutBase = runGitCommandSafe(["checkout", baseBranch], epic.project_path);
        if (!checkoutBase.success) {
          return {
            content: [{
              type: "text",
              text: `Failed to checkout base branch '${baseBranch}' before creating epic branch.\n\nError: ${checkoutBase.error}\n\nPossible causes:\n- You have uncommitted changes. Commit or stash them first.\n- The base branch does not exist locally. Try: git fetch origin ${baseBranch}`,
            }],
            isError: true,
          };
        }
        const createBranch = runGitCommandSafe(["checkout", "-b", branchName], epic.project_path);
        if (!createBranch.success) {
          return { content: [{ type: "text", text: `Failed to create branch ${branchName}: ${createBranch.error}` }], isError: true };
        }
        branchCreated = true;
      } else {
        const checkoutBranch = runGitCommandSafe(["checkout", branchName], epic.project_path);
        if (!checkoutBranch.success) {
          return { content: [{ type: "text", text: `Failed to checkout branch ${branchName}: ${checkoutBranch.error}` }], isError: true };
        }
      }

      const now = new Date().toISOString();

      // Create or update epic workflow state (wrapped in try-catch for database error handling)
      let epicTickets;
      try {
        if (!epicState) {
          // Create new epic workflow state
          const stateId = randomUUID();
          db.prepare(`
            INSERT INTO epic_workflow_state (id, epic_id, epic_branch_name, epic_branch_created_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(stateId, epicId, branchName, now, now, now);
        } else {
          // Update existing state with branch info
          db.prepare(`
            UPDATE epic_workflow_state SET epic_branch_name = ?, epic_branch_created_at = ?, updated_at = ? WHERE epic_id = ?
          `).run(branchName, now, now, epicId);
        }

        // Get tickets in epic
        epicTickets = db.prepare(`
          SELECT id, title, status, priority FROM tickets WHERE epic_id = ? ORDER BY position
        `).all(epicId);

        // Update ticket counts
        const ticketsTotal = epicTickets.length;
        const ticketsDone = epicTickets.filter(t => t.status === "done").length;
        db.prepare(`
          UPDATE epic_workflow_state SET tickets_total = ?, tickets_done = ?, updated_at = ? WHERE epic_id = ?
        `).run(ticketsTotal, ticketsDone, now, epicId);
      } catch (dbErr) {
        log.error(`Failed to save epic workflow state for ${epicId}`, { error: dbErr.message });
        // Clean up: try to delete the branch we just created
        if (branchCreated) {
          const baseBranch = runGitCommandSafe(["show-ref", "--verify", "--quiet", "refs/heads/main"], epic.project_path).success ? "main" : "master";
          runGitCommandSafe(["checkout", baseBranch], epic.project_path);
          runGitCommandSafe(["branch", "-D", branchName], epic.project_path);
        }
        return {
          content: [{
            type: "text",
            text: `Failed to save epic workflow state.\n\nError: ${dbErr.message}\n\nThe branch was cleaned up. Please try again or check database health with get_database_health.`,
          }],
          isError: true,
        };
      }

      log.info(`Started epic work on ${epicId}: branch ${branchName}`);

      // Optionally create draft PR
      let prInfo = "";
      if (createPr) {
        // Push branch to remote first
        const pushResult = runGitCommandSafe(["push", "-u", "origin", branchName], epic.project_path);
        if (!pushResult.success) {
          prInfo = `\n\n**Warning:** Could not push branch to remote: ${pushResult.error}\nCreate PR manually when ready.`;
        } else {
          // Create draft PR using gh CLI (using runGhCommandSafe for security)
          const prResult = runGhCommandSafe(
            ["pr", "create", "--draft", "--title", `[Epic] ${epic.title}`, "--body", `Epic work for: ${epic.title}\n\nThis PR contains all tickets from the epic.`],
            epic.project_path
          );
          if (prResult.success && prResult.output) {
            const prUrl = prResult.output.trim();
            // Extract PR number using regex to handle trailing slashes and edge cases
            const prMatch = prUrl.match(/\/(\d+)\/?$/);
            const prNumber = prMatch ? parseInt(prMatch[1], 10) : null;

            if (prNumber) {
              db.prepare(`
                UPDATE epic_workflow_state SET pr_number = ?, pr_url = ?, pr_status = 'draft', updated_at = ? WHERE epic_id = ?
              `).run(prNumber, prUrl, now, epicId);
            } else {
              log.warn(`Failed to parse PR number from URL: ${prUrl}`);
              db.prepare(`
                UPDATE epic_workflow_state SET pr_url = ?, pr_status = 'draft', updated_at = ? WHERE epic_id = ?
              `).run(prUrl, now, epicId);
            }

            prInfo = `\n\n**Draft PR Created:** ${prUrl}`;
            log.info(`Created draft PR for epic ${epicId}: ${prUrl}`);
          } else {
            prInfo = `\n\n**Warning:** Could not create PR: ${prResult.error}\nCreate PR manually when ready.`;
          }
        }
      }

      return {
        content: [{
          type: "text",
          text: `## Started Epic Work

**Branch:** \`${branchName}\` ${branchCreated ? "(created)" : "(checked out)"}
**Epic:** ${epic.title}
**Project:** ${epic.project_name}
**Path:** ${epic.project_path}
**Isolation Mode:** branch (source: ${modeSource})${prInfo}

### Tickets in Epic (${epicTickets.length})
${epicTickets.map(t => `- [${t.status}] ${t.title} (${t.priority || "medium"})`).join("\n")}

---

All tickets in this epic will now use the epic branch \`${branchName}\`.
Use \`start_ticket_work\` to begin work on any ticket.`,
        }],
      };
    }
  );

  // Complete ticket work
  server.tool(
    "complete_ticket_work",
    `Complete implementation work on a ticket and move it to AI review.

This tool handles all completion workflow automatically:
1. Sets the ticket status to ai_review (NOT done - human approval required)
2. Creates/updates ticket workflow state for review tracking
3. Auto-posts a formatted work summary comment
4. Updates the PRD file (sets passes: true for this ticket)
5. Returns AI review instructions and code review guidance

IMPORTANT: After calling this tool, you MUST:
1. Run all 3 review agents (code-reviewer, silent-failure-hunter, code-simplifier)
2. Call submit_review_finding for each issue found
3. Fix critical/major findings and call mark_finding_fixed
4. Call check_review_complete to verify all critical/major findings resolved
5. Call generate_demo_script to create manual test steps
6. STOP - ticket moves to human_review for human approval

The ticket cannot be marked 'done' until a human approves via submit_demo_feedback.

Args:
  ticketId: The ticket ID to complete
  summary: Work summary describing what was done (recommended)

Returns:
  Updated ticket in ai_review status with instructions for next steps.`,
    {
      ticketId: z.string().describe("Ticket ID to complete"),
      summary: z.string().optional().describe("Work summary describing what was done - will be auto-posted as a comment"),
    },
    async ({ ticketId, summary }) => {
      // Self-logging for telemetry in non-hook environments
      const telemetrySession = getActiveTelemetrySession(db, ticketId);
      let correlationId = null;
      const startTime = Date.now();
      if (telemetrySession) {
        correlationId = logMcpCallEvent(db, {
          sessionId: telemetrySession.id,
          ticketId: telemetrySession.ticket_id,
          event: "start",
          toolName: "complete_ticket_work",
          params: { ticketId, summary: summary ? "[provided]" : undefined },
        });
      }

      const ticket = db.prepare(`
        SELECT t.*, p.name as project_name, p.path as project_path
        FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
      `).get(ticketId);

      if (!ticket) {
        if (telemetrySession && correlationId) {
          logMcpCallEvent(db, {
            sessionId: telemetrySession.id,
            ticketId: telemetrySession.ticket_id,
            event: "end",
            toolName: "complete_ticket_work",
            correlationId,
            success: false,
            durationMs: Date.now() - startTime,
            error: "Ticket not found",
          });
        }
        return { content: [{ type: "text", text: `Ticket not found: ${ticketId}` }], isError: true };
      }

      if (ticket.status === "done") {
        if (telemetrySession && correlationId) {
          logMcpCallEvent(db, {
            sessionId: telemetrySession.id,
            ticketId: telemetrySession.ticket_id,
            event: "end",
            toolName: "complete_ticket_work",
            correlationId,
            success: true,
            durationMs: Date.now() - startTime,
          });
        }
        return { content: [{ type: "text", text: `Ticket is already done.\n\n${JSON.stringify(ticket, null, 2)}` }] };
      }

      if (ticket.status === "ai_review" || ticket.status === "human_review") {
        if (telemetrySession && correlationId) {
          logMcpCallEvent(db, {
            sessionId: telemetrySession.id,
            ticketId: telemetrySession.ticket_id,
            event: "end",
            toolName: "complete_ticket_work",
            correlationId,
            success: true,
            durationMs: Date.now() - startTime,
          });
        }
        return { content: [{ type: "text", text: `Ticket is already in ${ticket.status}.\n\nTo proceed:\n- In ai_review: Run review agents, fix findings, then generate demo\n- In human_review: Wait for human feedback via submit_demo_feedback\n\n${JSON.stringify(ticket, null, 2)}` }] };
      }

      let commitsInfo = "", prDescription = "";
      let changedFiles = [];

      if (existsSync(ticket.project_path)) {
        const gitCheck = runGitCommandSafe(["rev-parse", "--git-dir"], ticket.project_path);
        if (gitCheck.success) {
          let baseBranch = "main";
          const mainExists = runGitCommandSafe(["show-ref", "--verify", "--quiet", "refs/heads/main"], ticket.project_path);
          if (!mainExists.success) {
            const masterExists = runGitCommandSafe(["show-ref", "--verify", "--quiet", "refs/heads/master"], ticket.project_path);
            if (masterExists.success) baseBranch = "master";
          }

          // Try to get commits since base branch, fall back to recent commits
          let commitsResult = runGitCommandSafe(
            ["log", `${baseBranch}..HEAD`, "--oneline", "--no-decorate"],
            ticket.project_path
          );
          if (!commitsResult.success) {
            commitsResult = runGitCommandSafe(
              ["log", "-10", "--oneline", "--no-decorate"],
              ticket.project_path
            );
          }

          if (commitsResult.success && commitsResult.output) {
            commitsInfo = commitsResult.output;
            const commitLines = commitsInfo.split("\n").filter(l => l.trim());
            prDescription = `## Summary\n${summary || ticket.title}\n\n## Changes\n${commitLines.map(c => `- ${c.substring(c.indexOf(" ") + 1)}`).join("\n")}\n\n## Ticket\n- ID: ${shortId(ticketId)}\n- Title: ${ticket.title}\n`;
          }

          // Get list of changed files for code review guidance
          // Try diff since base branch, fall back to recent commits
          let filesResult = runGitCommandSafe(
            ["diff", `${baseBranch}..HEAD`, "--name-only"],
            ticket.project_path
          );
          if (!filesResult.success) {
            filesResult = runGitCommandSafe(
              ["diff", "HEAD~5..HEAD", "--name-only"],
              ticket.project_path
            );
          }
          if (filesResult.success && filesResult.output) {
            changedFiles = filesResult.output.split("\n").filter(f => f.trim());
          } else if (!filesResult.success) {
            log.warn(`Failed to get changed files for ticket ${ticketId}: ${filesResult.error || 'unknown error'}`);
          }
        }
      }

      const now = new Date().toISOString();
      try {
        // Per Universal Quality Workflow: complete_ticket_work moves to ai_review, not done
        // The ai_review phase requires running review agents and fixing findings before human_review
        db.prepare("UPDATE tickets SET status = 'ai_review', updated_at = ? WHERE id = ?").run(now, ticketId);
      } catch (dbErr) {
        log.error(`Failed to update ticket status to ai_review: ${dbErr.message}`, { ticketId });
        return { content: [{ type: "text", text: `Failed to update ticket status: ${dbErr.message}` }], isError: true };
      }

      // Create or update workflow state for this ticket
      // Per spec: increment review_iteration each time ticket enters ai_review
      // Wrapped in try-catch: workflow state is for tracking, not critical to ticket operation
      let workflowStateWarning = "";
      try {
        let workflowState = db.prepare("SELECT * FROM ticket_workflow_state WHERE ticket_id = ?").get(ticketId);
        if (!workflowState) {
          const stateId = randomUUID();
          db.prepare(
            `INSERT INTO ticket_workflow_state (id, ticket_id, current_phase, review_iteration, findings_count, findings_fixed, demo_generated, created_at, updated_at)
             VALUES (?, ?, 'ai_review', 1, 0, 0, 0, ?, ?)`
          ).run(stateId, ticketId, now, now);
          log.info(`Created workflow state for ticket ${ticketId} (iteration 1)`);
        } else {
          // Increment review_iteration when entering ai_review from implementation
          const newIteration = (workflowState.review_iteration || 0) + 1;
          db.prepare(
            "UPDATE ticket_workflow_state SET current_phase = 'ai_review', review_iteration = ?, updated_at = ? WHERE ticket_id = ?"
          ).run(newIteration, now, ticketId);
          log.info(`Updated workflow state for ticket ${ticketId} (iteration ${newIteration})`);
        }
      } catch (stateErr) {
        log.error(`Failed to update workflow state for ticket ${ticketId}: ${stateErr.message}`, { ticketId });
        workflowStateWarning = `\n\n**Warning:** Workflow state tracking failed: ${stateErr.message}. Review iteration may not be accurate.`;
      }

      // Auto-post work summary comment
      const workSummaryContent = summary
        ? `## Work Summary\n\n${summary}\n\n${commitsInfo ? `### Commits\n\`\`\`\n${commitsInfo}\`\`\`` : ""}`
        : `Completed work on: ${ticket.title}${commitsInfo ? `\n\nCommits:\n${commitsInfo}` : ""}`;
      const summaryResult = addComment(db, ticketId, workSummaryContent, "ralph", "work_summary");
      const summaryWarning = summaryResult.success ? "" : `\n\n**Warning:** Work summary comment was not saved: ${summaryResult.error}`;

      // Update PRD file
      const prdResult = updatePrdForTicket(ticket.project_path, ticketId);
      if (!prdResult.success) {
        log.error(`PRD update failed for ticket ${ticketId}: ${prdResult.message}`);
      }

      // End any active conversation sessions for this ticket
      const sessionEndResult = endConversationSessions(db, ticketId);
      let sessionEndInfo = "";
      if (!sessionEndResult.success) {
        sessionEndInfo = `### Conversation Sessions\n**Warning:** Failed to end sessions: ${sessionEndResult.error}`;
      } else if (sessionEndResult.sessionsEnded > 0) {
        sessionEndInfo = `### Conversation Sessions\n${sessionEndResult.sessionsEnded} session(s) ended (${sessionEndResult.messageCount || 0} messages logged)`;
      }

      // Note: We no longer suggest next ticket here since AI review is required first
      // The next ticket will be suggested after human_review completes

      const updatedTicket = db.prepare(`
        SELECT t.*, p.name as project_name, p.path as project_path
        FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
      `).get(ticketId);

      log.info(`Completed implementation on ticket ${ticketId}, moved to ai_review`);

      const environment = detectEnvironment();

      // Build response sections - focused on AI review workflow, not context reset
      // If PRD update failed, put warning at TOP so it's not missed
      const prdWarning = !prdResult.success
        ? `## ⚠️ CRITICAL WARNING: PRD Update Failed

**The PRD file was NOT updated.** This will cause Ralph's iteration loop to malfunction.

**Problem:** \`${prdResult.message}\`

**Action Required:** Manually update \`plans/prd.json\`:
1. Find the ticket with ID containing \`${ticketId.substring(0, 8)}\`
2. Set \`"passes": true\` for that ticket
3. Save the file

Without this fix, Ralph will repeatedly pick this ticket in subsequent iterations.

---

`
        : "";

      const sections = [
        prdWarning + `## Implementation Complete - Now in AI Review

**Ticket:** ${updatedTicket.title}
**Status:** ${updatedTicket.status}
**Project:** ${updatedTicket.project_name}`,

        `### Work Summary ${summaryResult.success ? "Posted" : "NOT SAVED"}
${summary || "Auto-generated summary from commits"}${summaryWarning}`,

        prdResult.success
          ? `### PRD Update\n${prdResult.message}`
          : "", // Already shown at top
      ].filter(Boolean);

      // Add workflow state warning if there was an error
      if (workflowStateWarning) {
        sections.push(`### Workflow State Warning${workflowStateWarning}`);
      }

      // Add conversation session summary if sessions were ended
      if (sessionEndInfo) {
        sections.push(sessionEndInfo);
      }

      // AI Review Instructions - this is the critical next step
      sections.push(`## REQUIRED: AI Review Phase

The ticket is now in **ai_review** status. You MUST complete the following before this ticket can be approved:

### Step 1: Run Review Agents
Run all 3 review agents in parallel to identify issues:
- **code-reviewer** - Checks code quality and project guidelines
- **silent-failure-hunter** - Identifies error handling issues
- **code-simplifier** - Suggests simplifications

### Step 2: Submit Findings
For each issue found, call:
\`\`\`
submit_review_finding({
  ticketId: "${ticketId}",
  agent: "code-reviewer",
  severity: "critical" | "major" | "minor" | "suggestion",
  category: "type-safety" | "error-handling" | etc.,
  description: "What the issue is",
  filePath: "optional/file/path.ts",
  suggestedFix: "optional suggested fix"
})
\`\`\`

### Step 3: Fix and Mark Fixed
Fix critical/major findings, then:
\`\`\`
mark_finding_fixed({ findingId: "...", status: "fixed", fixDescription: "How it was fixed" })
\`\`\`

### Step 4: Verify Review Complete
\`\`\`
check_review_complete({ ticketId: "${ticketId}" })
\`\`\`
Must return \`canProceedToHumanReview: true\` (all critical/major fixed)

### Step 5: Generate Demo Script
\`\`\`
generate_demo_script({
  ticketId: "${ticketId}",
  steps: [
    { order: 1, description: "What to test", expectedOutcome: "What should happen", type: "manual" }
  ]
})
\`\`\`
This moves ticket to **human_review**.

### Step 6: STOP
**DO NOT proceed further.** The ticket requires human approval via \`submit_demo_feedback\`.`);

      // Changed files for reference
      if (changedFiles.length > 0) {
        sections.push(`### Files Changed
${changedFiles.slice(0, 15).map(f => `- ${f}`).join("\n")}${changedFiles.length > 15 ? `\n- ... and ${changedFiles.length - 15} more` : ""}`);
      }

      if (prDescription) {
        sections.push(`### Suggested PR Description (for later)
\`\`\`markdown
${prDescription}
\`\`\``);
      }

      sections.push(`---\nstatus: ai_review\nenvironment: ${environment}`);

      const responseText = sections.join("\n\n---\n\n");

      // Log successful completion to telemetry
      if (telemetrySession && correlationId) {
        logMcpCallEvent(db, {
          sessionId: telemetrySession.id,
          ticketId: telemetrySession.ticket_id,
          event: "end",
          toolName: "complete_ticket_work",
          correlationId,
          success: true,
          durationMs: Date.now() - startTime,
        });
      }

      return {
        content: [{
          type: "text",
          text: responseText,
        }],
      };
    }
  );
}

// Note: _getContextResetGuidance and _getCodeReviewGuidance were removed in bc92b026 review
// The AI review instructions are now embedded directly in complete_ticket_work response (lines 1494-1542)
// Context reset guidance will be added to submit_demo_feedback when that's implemented
