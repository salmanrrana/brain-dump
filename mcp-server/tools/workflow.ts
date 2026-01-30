/**
 * Workflow tools for Brain Dump MCP server.
 * Handles starting and completing ticket work (includes git branch creation).
 * Smart workflow automation - handles comments, PRD updates, next ticket suggestions,
 * and automatic conversation session management for compliance logging.
 * @module tools/workflow
 */
import { z } from "zod";
import { existsSync } from "fs";
import { randomUUID } from "crypto";
import { log } from "../lib/logging.js";
import {
  runGitCommand,
  shortId,
  generateBranchName,
  generateEpicBranchName,
} from "../lib/git-utils.js";
import { getActiveTelemetrySession, logMcpCallEvent } from "../lib/telemetry-self-log.js";
import { loadTicketAttachments, buildAttachmentContextSection } from "../lib/attachment-loader.js";
import { addComment, fetchTicketComments, buildCommentsSection } from "../lib/comment-utils.js";
import { updatePrdForTicket } from "../lib/prd-utils.js";
import { createConversationSession, endConversationSessions } from "../lib/conversation-session.js";
import {
  buildTicketContextContent,
  buildWarningsSection,
  buildAttachmentsSection,
} from "../lib/ticket-context-builder.js";
import type Database from "better-sqlite3";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// Note: We don't import ContentBlock from types.ts here because
// ticket-context-builder.ts defines its own local ContentBlock with `type: string`
// which isn't assignable to the MCP SDK's `type: "text"` literal.
// Instead we cast the result to the SDK-compatible shape below.

/**
 * Database row for a ticket joined with its project.
 * Uses snake_case to match SQLite column names.
 */
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

/** Database row for epic joined with project */
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

/** Epic workflow state from DB */
interface EpicWorkflowStateRow {
  id: string;
  epic_id: string;
  epic_branch_name: string | null;
  epic_branch_created_at: string | null;
  current_ticket_id: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_status: string | null;
  tickets_total: number | null;
  tickets_done: number | null;
  created_at: string;
  updated_at: string;
}

/** Ticket workflow state from DB */
interface TicketWorkflowStateRow {
  id: string;
  ticket_id: string;
  current_phase: string;
  review_iteration: number;
  findings_count: number;
  findings_fixed: number;
  demo_generated: number;
  created_at: string;
  updated_at: string;
}

/** Simple epic row (id + title only) */
interface EpicBasicRow {
  id: string;
  title: string;
}

/** Epic ticket summary row */
interface EpicTicketRow {
  id: string;
  title: string;
  status: string;
  priority: string | null;
}

/** Epic info passed to context builder */
interface EpicInfo {
  title: string;
  branchName: string;
  prUrl?: string | undefined;
}

/**
 * Register workflow tools with the MCP server.
 */
export function registerWorkflowTools(
  server: McpServer,
  db: Database.Database,
  detectEnvironment: () => string
): void {
  // Start ticket work
  server.tool(
    "start_ticket_work",
    `Start working on a ticket.

This tool handles all workflow automatically:
1. Creates a git branch: feature/{ticket-short-id}-{slug}
2. Sets the ticket status to in_progress
3. Auto-posts a "Starting work" comment for tracking
4. Returns ticket context including description and acceptance criteria

Use this when picking up a ticket to work on.
The project must have a git repository initialized.

Args:
  ticketId: The ticket ID to start working on

Returns:
  Branch name, ticket details with description/acceptance criteria, and project path.`,
    { ticketId: z.string().describe("Ticket ID to start working on") },
    async ({ ticketId }: { ticketId: string }) => {
      // Self-logging for telemetry in non-hook environments
      const telemetrySession = getActiveTelemetrySession(db, ticketId);
      let correlationId: string | null = null;
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

      const ticket = db
        .prepare(
          `
        SELECT t.*, p.name as project_name, p.path as project_path
        FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
      `
        )
        .get(ticketId) as TicketRow | undefined;

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
        return {
          content: [{ type: "text" as const, text: `Ticket not found: ${ticketId}` }],
          isError: true,
        };
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
        return {
          content: [
            {
              type: "text" as const,
              text: `Ticket is already in progress.\n\n${JSON.stringify(ticket, null, 2)}`,
            },
          ],
        };
      }

      if (!existsSync(ticket.project_path)) {
        return {
          content: [
            { type: "text" as const, text: `Project path does not exist: ${ticket.project_path}` },
          ],
          isError: true,
        };
      }

      const gitCheck = runGitCommand("git rev-parse --git-dir", ticket.project_path);
      if (!gitCheck.success) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Not a git repository: ${ticket.project_path}\n\nInitialize git first: git init`,
            },
          ],
          isError: true,
        };
      }

      // Check if ticket belongs to an epic with an existing branch
      let branchName: string | undefined;
      let branchCreated = false;
      let usingEpicBranch = false;
      let epicInfo: EpicInfo | null = null;

      if (ticket.epic_id) {
        // Check for existing epic branch
        const epicState = db
          .prepare(`SELECT * FROM epic_workflow_state WHERE epic_id = ?`)
          .get(ticket.epic_id) as EpicWorkflowStateRow | undefined;

        if (epicState?.epic_branch_name) {
          // Epic has a branch - use it
          const epicBranchExists = runGitCommand(
            `git show-ref --verify --quiet refs/heads/${epicState.epic_branch_name}`,
            ticket.project_path
          );
          if (epicBranchExists.success) {
            branchName = epicState.epic_branch_name;
            usingEpicBranch = true;

            // Get epic info for context
            const epic = db.prepare(`SELECT title FROM epics WHERE id = ?`).get(ticket.epic_id) as
              | { title: string }
              | undefined;
            epicInfo = {
              title: epic?.title || "Unknown Epic",
              branchName: branchName,
              prUrl: epicState.pr_url ?? undefined,
            };

            // Checkout the epic branch
            const checkoutBranch = runGitCommand(`git checkout ${branchName}`, ticket.project_path);
            if (!checkoutBranch.success) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: `Failed to checkout epic branch ${branchName}: ${checkoutBranch.error}`,
                  },
                ],
                isError: true,
              };
            }

            // Update epic workflow state to track current ticket
            const now = new Date().toISOString();
            db.prepare(
              `UPDATE epic_workflow_state SET current_ticket_id = ?, updated_at = ? WHERE epic_id = ?`
            ).run(ticketId, now, ticket.epic_id);

            log.info(`Ticket ${ticketId} using epic branch ${branchName}`);
          } else {
            // Epic branch was deleted - suggest recreating it
            log.warn(
              `Epic branch ${epicState.epic_branch_name} no longer exists for ticket ${ticketId}`
            );
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Epic branch \`${epicState.epic_branch_name}\` no longer exists.

This ticket belongs to an epic that previously had a branch, but it was deleted.

**To fix:** Run \`start_epic_work("${ticket.epic_id}")\` to recreate the epic branch, then try again.`,
                },
              ],
              isError: true,
            };
          }
        } else {
          // Ticket belongs to epic but no branch exists yet
          // Get epic info to generate branch name
          const epic = db
            .prepare(`SELECT id, title FROM epics WHERE id = ?`)
            .get(ticket.epic_id) as EpicBasicRow | undefined;
          if (epic) {
            // Auto-create the epic branch for convenience
            branchName = generateEpicBranchName(epic.id, epic.title);
            usingEpicBranch = true;
            epicInfo = { title: epic.title, branchName: branchName };

            const epicBranchExists = runGitCommand(
              `git show-ref --verify --quiet refs/heads/${branchName}`,
              ticket.project_path
            );
            if (!epicBranchExists.success) {
              // Create the epic branch
              let baseBranch = "main";
              const mainExists = runGitCommand(
                "git show-ref --verify --quiet refs/heads/main",
                ticket.project_path
              );
              if (!mainExists.success) {
                const masterExists = runGitCommand(
                  "git show-ref --verify --quiet refs/heads/master",
                  ticket.project_path
                );
                if (masterExists.success) baseBranch = "master";
              }

              runGitCommand(`git checkout ${baseBranch}`, ticket.project_path);
              const createBranch = runGitCommand(
                `git checkout -b ${branchName}`,
                ticket.project_path
              );
              if (!createBranch.success) {
                return {
                  content: [
                    {
                      type: "text" as const,
                      text: `Failed to create epic branch ${branchName}: ${createBranch.error}`,
                    },
                  ],
                  isError: true,
                };
              }
              branchCreated = true;
            } else {
              const checkoutBranch = runGitCommand(
                `git checkout ${branchName}`,
                ticket.project_path
              );
              if (!checkoutBranch.success) {
                return {
                  content: [
                    {
                      type: "text" as const,
                      text: `Failed to checkout epic branch ${branchName}: ${checkoutBranch.error}`,
                    },
                  ],
                  isError: true,
                };
              }
            }

            // Create/update epic workflow state with the branch
            const now = new Date().toISOString();
            const existingState = db
              .prepare(`SELECT id FROM epic_workflow_state WHERE epic_id = ?`)
              .get(epic.id) as { id: string } | undefined;
            if (existingState) {
              db.prepare(
                `
                UPDATE epic_workflow_state SET epic_branch_name = ?, epic_branch_created_at = ?, current_ticket_id = ?, updated_at = ?
                WHERE epic_id = ?
              `
              ).run(branchName, now, ticketId, now, epic.id);
            } else {
              const stateId = randomUUID();
              db.prepare(
                `
                INSERT INTO epic_workflow_state (id, epic_id, epic_branch_name, epic_branch_created_at, current_ticket_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `
              ).run(stateId, epic.id, branchName, now, ticketId, now, now);
            }

            log.info(`Auto-created epic branch ${branchName} for ticket ${ticketId}`);
          }
        }
      }

      // If not using epic branch, create ticket-specific branch (original behavior)
      if (!usingEpicBranch) {
        branchName = generateBranchName(ticketId, ticket.title);
        const branchExists = runGitCommand(
          `git show-ref --verify --quiet refs/heads/${branchName}`,
          ticket.project_path
        );

        if (!branchExists.success) {
          const createBranch = runGitCommand(`git checkout -b ${branchName}`, ticket.project_path);
          if (!createBranch.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Failed to create branch ${branchName}: ${createBranch.error}`,
                },
              ],
              isError: true,
            };
          }
          branchCreated = true;
        } else {
          const checkoutBranch = runGitCommand(`git checkout ${branchName}`, ticket.project_path);
          if (!checkoutBranch.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Failed to checkout branch ${branchName}: ${checkoutBranch.error}`,
                },
              ],
              isError: true,
            };
          }
        }
      }

      // branchName is guaranteed to be set at this point
      const finalBranchName = branchName as string;

      const now = new Date().toISOString();
      try {
        db.prepare(
          "UPDATE tickets SET status = 'in_progress', branch_name = ?, updated_at = ? WHERE id = ?"
        ).run(finalBranchName, now, ticketId);
      } catch (dbErr) {
        const errMsg = (dbErr as Error).message;
        log.error(`Failed to update ticket status: ${errMsg}`);
        // Attempt to clean up the branch we just created
        runGitCommand(`git checkout - && git branch -d ${finalBranchName}`, ticket.project_path);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to update ticket status: ${errMsg}\n\nThe git branch was cleaned up. Please try again.`,
            },
          ],
          isError: true,
        };
      }

      // Create or update workflow state for this ticket (per spec: track workflow progress)
      // Wrapped in try-catch: workflow state is for tracking, not critical to ticket operation
      let workflowStateWarning = "";
      try {
        const existingState = db
          .prepare("SELECT id FROM ticket_workflow_state WHERE ticket_id = ?")
          .get(ticketId) as { id: string } | undefined;
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
        const errMsg = (stateErr as Error).message;
        log.error(`Failed to create/update workflow state for ticket ${ticketId}: ${errMsg}`);
        workflowStateWarning = `\n\n**Warning:** Workflow state tracking failed: ${errMsg}. Ticket is in_progress but workflow tracking may be incomplete.`;
      }

      // Auto-post "Starting work" progress comment (per spec: mandatory audit trail)
      const startCommentContent = usingEpicBranch
        ? `Started work on ticket. Branch: \`${finalBranchName}\` (epic branch)`
        : `Started work on ticket. Branch: \`${finalBranchName}\``;
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

      const updatedTicket = db
        .prepare(
          `
        SELECT t.*, p.name as project_name, p.path as project_path
        FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
      `
        )
        .get(ticketId) as TicketRow;

      log.info(`Started work on ticket ${ticketId}: branch ${finalBranchName}`);

      // Parse acceptance criteria from subtasks JSON
      let acceptanceCriteria: string[] = ["Complete the implementation as described"];
      const parseWarnings: string[] = [];
      if (updatedTicket.subtasks) {
        try {
          const subtasks = JSON.parse(updatedTicket.subtasks) as Array<{ title?: string } | string>;
          if (subtasks.length > 0) {
            acceptanceCriteria = subtasks.map((s) => {
              if (typeof s === "string") return s;
              return s.title || String(s);
            });
          }
        } catch (parseErr) {
          const errMsg = (parseErr as Error).message;
          log.warn(`Failed to parse subtasks for ticket ${ticketId}: ${errMsg}`);
          parseWarnings.push(`Failed to parse acceptance criteria: ${errMsg}. Using defaults.`);
        }
      }

      const description = updatedTicket.description || "No description provided";
      const priority = updatedTicket.priority || "medium";

      // Fetch previous comments for context
      const { comments, totalCount, truncated } = fetchTicketComments(db, ticketId);
      const commentsSection = buildCommentsSection(comments, totalCount, truncated);
      log.info(`Loaded ${comments.length} of ${totalCount} comments for ticket ${ticketId}`);

      // Load ticket attachments for LLM context
      let attachmentsList: unknown[] | null = null;
      if (updatedTicket.attachments) {
        try {
          attachmentsList = JSON.parse(updatedTicket.attachments) as unknown[];
        } catch (parseErr) {
          const errMsg = (parseErr as Error).message;
          log.warn(`Failed to parse attachments for ticket ${ticketId}: ${errMsg}`);
          parseWarnings.push(
            `Failed to parse attachments list: ${errMsg}. Attachments will not be loaded.`
          );
        }
      }

      const {
        contentBlocks: attachmentBlocks,
        warnings: attachmentWarnings,
        telemetry: attachmentTelemetry,
      } = loadTicketAttachments(ticketId, attachmentsList);

      // Log attachment telemetry for observability
      if (attachmentTelemetry.totalCount > 0) {
        log.info(
          `Attachment telemetry for ticket ${ticketId}: total=${attachmentTelemetry.totalCount}, loaded=${attachmentTelemetry.loadedCount}, failed=${attachmentTelemetry.failedCount}`
        );
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
      const contextParams = {
        ticket: updatedTicket,
        branchName: finalBranchName,
        branchCreated,
        usingEpicBranch,
        sessionInfo,
        attachmentContext,
        description,
        priority,
        acceptanceCriteria,
        commentsSection,
        attachmentsSection,
        warningsSection,
        // Only include epicInfo when non-null (avoids exactOptionalPropertyTypes issue)
        ...(epicInfo ? { epicInfo } : {}),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- buildTicketContextContent returns local ContentBlock[] with type:string, but MCP SDK expects literal type:"text"
      const content = buildTicketContextContent(contextParams, attachmentBlocks) as any;

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

Returns:
  Branch name, epic details, and list of tickets in the epic.`,
    {
      epicId: z.string().describe("Epic ID to start working on"),
      createPr: z.boolean().optional().default(false).describe("Create a draft PR immediately"),
    },
    async ({ epicId, createPr }: { epicId: string; createPr: boolean }) => {
      // Get epic with project info
      const epic = db
        .prepare(
          `
        SELECT e.*, p.name as project_name, p.path as project_path
        FROM epics e JOIN projects p ON e.project_id = p.id WHERE e.id = ?
      `
        )
        .get(epicId) as EpicRow | undefined;

      if (!epic) {
        return {
          content: [{ type: "text" as const, text: `Epic not found: ${epicId}` }],
          isError: true,
        };
      }

      if (!existsSync(epic.project_path)) {
        return {
          content: [
            { type: "text" as const, text: `Project path does not exist: ${epic.project_path}` },
          ],
          isError: true,
        };
      }

      const gitCheck = runGitCommand("git rev-parse --git-dir", epic.project_path);
      if (!gitCheck.success) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Not a git repository: ${epic.project_path}\n\nInitialize git first: git init`,
            },
          ],
          isError: true,
        };
      }

      // Check if epic workflow state already exists with a branch
      const epicState = db
        .prepare(`SELECT * FROM epic_workflow_state WHERE epic_id = ?`)
        .get(epicId) as EpicWorkflowStateRow | undefined;

      if (epicState?.epic_branch_name) {
        // Epic branch already exists - check it out and return info
        const branchExists = runGitCommand(
          `git show-ref --verify --quiet refs/heads/${epicState.epic_branch_name}`,
          epic.project_path
        );
        if (branchExists.success) {
          const checkoutBranch = runGitCommand(
            `git checkout ${epicState.epic_branch_name}`,
            epic.project_path
          );
          if (!checkoutBranch.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Failed to checkout existing epic branch ${epicState.epic_branch_name}: ${checkoutBranch.error}`,
                },
              ],
              isError: true,
            };
          }

          // Get tickets in epic
          const epicTickets = db
            .prepare(
              `
            SELECT id, title, status, priority FROM tickets WHERE epic_id = ? ORDER BY position
          `
            )
            .all(epicId) as EpicTicketRow[];

          return {
            content: [
              {
                type: "text" as const,
                text: `## Epic Already Started

**Branch:** \`${epicState.epic_branch_name}\` (checked out)
**Epic:** ${epic.title}
**Project:** ${epic.project_name}
${epicState.pr_url ? `**PR:** ${epicState.pr_url}` : ""}

### Tickets in Epic (${epicTickets.length})
${epicTickets.map((t) => `- [${t.status}] ${t.title} (${t.priority || "medium"})`).join("\n")}

Use \`start_ticket_work\` to begin work on any ticket. All tickets will use this branch.`,
              },
            ],
          };
        }
        // Branch was deleted externally - we'll recreate it below
        log.warn(`Epic branch ${epicState.epic_branch_name} no longer exists, will recreate`);
      }

      // Generate epic branch name
      const branchName = generateEpicBranchName(epicId, epic.title);

      // Check if branch already exists in git (might have been created outside our tracking)
      const branchExists = runGitCommand(
        `git show-ref --verify --quiet refs/heads/${branchName}`,
        epic.project_path
      );

      let branchCreated = false;
      if (!branchExists.success) {
        // Create the branch from main/dev
        let baseBranch = "main";
        const mainExists = runGitCommand(
          "git show-ref --verify --quiet refs/heads/main",
          epic.project_path
        );
        if (!mainExists.success) {
          const masterExists = runGitCommand(
            "git show-ref --verify --quiet refs/heads/master",
            epic.project_path
          );
          if (masterExists.success) baseBranch = "master";
        }

        // Make sure we're on the base branch first, then create new branch
        const checkoutBase = runGitCommand(`git checkout ${baseBranch}`, epic.project_path);
        if (!checkoutBase.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to checkout base branch '${baseBranch}' before creating epic branch.\n\nError: ${checkoutBase.error}\n\nPossible causes:\n- You have uncommitted changes. Commit or stash them first.\n- The base branch does not exist locally. Try: git fetch origin ${baseBranch}`,
              },
            ],
            isError: true,
          };
        }
        const createBranch = runGitCommand(`git checkout -b ${branchName}`, epic.project_path);
        if (!createBranch.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to create branch ${branchName}: ${createBranch.error}`,
              },
            ],
            isError: true,
          };
        }
        branchCreated = true;
      } else {
        const checkoutBranch = runGitCommand(`git checkout ${branchName}`, epic.project_path);
        if (!checkoutBranch.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to checkout branch ${branchName}: ${checkoutBranch.error}`,
              },
            ],
            isError: true,
          };
        }
      }

      const now = new Date().toISOString();

      // Create or update epic workflow state (wrapped in try-catch for database error handling)
      let epicTickets: EpicTicketRow[];
      try {
        if (!epicState) {
          // Create new epic workflow state
          const stateId = randomUUID();
          db.prepare(
            `
            INSERT INTO epic_workflow_state (id, epic_id, epic_branch_name, epic_branch_created_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `
          ).run(stateId, epicId, branchName, now, now, now);
        } else {
          // Update existing state with branch info
          db.prepare(
            `
            UPDATE epic_workflow_state SET epic_branch_name = ?, epic_branch_created_at = ?, updated_at = ? WHERE epic_id = ?
          `
          ).run(branchName, now, now, epicId);
        }

        // Get tickets in epic
        epicTickets = db
          .prepare(
            `
          SELECT id, title, status, priority FROM tickets WHERE epic_id = ? ORDER BY position
        `
          )
          .all(epicId) as EpicTicketRow[];

        // Update ticket counts
        const ticketsTotal = epicTickets.length;
        const ticketsDone = epicTickets.filter((t) => t.status === "done").length;
        db.prepare(
          `
          UPDATE epic_workflow_state SET tickets_total = ?, tickets_done = ?, updated_at = ? WHERE epic_id = ?
        `
        ).run(ticketsTotal, ticketsDone, now, epicId);
      } catch (dbErr) {
        const errMsg = (dbErr as Error).message;
        log.error(`Failed to save epic workflow state for ${epicId}: ${errMsg}`);
        // Clean up: try to delete the branch we just created
        if (branchCreated) {
          const baseBranch = runGitCommand(
            "git show-ref --verify --quiet refs/heads/main",
            epic.project_path
          ).success
            ? "main"
            : "master";
          runGitCommand(`git checkout ${baseBranch}`, epic.project_path);
          runGitCommand(`git branch -D ${branchName}`, epic.project_path);
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to save epic workflow state.\n\nError: ${errMsg}\n\nThe branch was cleaned up. Please try again or check database health with get_database_health.`,
            },
          ],
          isError: true,
        };
      }

      log.info(`Started epic work on ${epicId}: branch ${branchName}`);

      // Optionally create draft PR
      let prInfo = "";
      if (createPr) {
        // Push branch to remote first
        const pushResult = runGitCommand(`git push -u origin ${branchName}`, epic.project_path);
        if (!pushResult.success) {
          prInfo = `\n\n**Warning:** Could not push branch to remote: ${pushResult.error}\nCreate PR manually when ready.`;
        } else {
          // Create draft PR using gh CLI
          const prResult = runGitCommand(
            `gh pr create --draft --title "[Epic] ${epic.title}" --body "Epic work for: ${epic.title}\n\nThis PR contains all tickets from the epic."`,
            epic.project_path
          );
          if (prResult.success && prResult.output) {
            // Extract PR URL from output
            const prUrl = prResult.output.trim();
            // Extract PR number from URL (last segment)
            const prNumber = parseInt(prUrl.split("/").pop() || "0", 10);

            // Update epic workflow state with PR info
            db.prepare(
              `
              UPDATE epic_workflow_state SET pr_number = ?, pr_url = ?, pr_status = 'draft', updated_at = ? WHERE epic_id = ?
            `
            ).run(prNumber, prUrl, now, epicId);

            prInfo = `\n\n**Draft PR Created:** ${prUrl}`;
            log.info(`Created draft PR for epic ${epicId}: ${prUrl}`);
          } else {
            prInfo = `\n\n**Warning:** Could not create PR: ${prResult.error}\nCreate PR manually when ready.`;
          }
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `## Started Epic Work

**Branch:** \`${branchName}\` ${branchCreated ? "(created)" : "(checked out)"}
**Epic:** ${epic.title}
**Project:** ${epic.project_name}
**Path:** ${epic.project_path}${prInfo}

### Tickets in Epic (${epicTickets.length})
${epicTickets.map((t) => `- [${t.status}] ${t.title} (${t.priority || "medium"})`).join("\n")}

---

All tickets in this epic will now use the epic branch \`${branchName}\`.
Use \`start_ticket_work\` to begin work on any ticket.`,
          },
        ],
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
      summary: z
        .string()
        .optional()
        .describe("Work summary describing what was done - will be auto-posted as a comment"),
    },
    async ({ ticketId, summary }: { ticketId: string; summary?: string | undefined }) => {
      // Self-logging for telemetry in non-hook environments
      const telemetrySession = getActiveTelemetrySession(db, ticketId);
      let correlationId: string | null = null;
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

      const ticket = db
        .prepare(
          `
        SELECT t.*, p.name as project_name, p.path as project_path
        FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
      `
        )
        .get(ticketId) as TicketRow | undefined;

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
        return {
          content: [{ type: "text" as const, text: `Ticket not found: ${ticketId}` }],
          isError: true,
        };
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
        return {
          content: [
            {
              type: "text" as const,
              text: `Ticket is already done.\n\n${JSON.stringify(ticket, null, 2)}`,
            },
          ],
        };
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
        return {
          content: [
            {
              type: "text" as const,
              text: `Ticket is already in ${ticket.status}.\n\nTo proceed:\n- In ai_review: Run review agents, fix findings, then generate demo\n- In human_review: Wait for human feedback via submit_demo_feedback\n\n${JSON.stringify(ticket, null, 2)}`,
            },
          ],
        };
      }

      let commitsInfo = "";
      let prDescription = "";
      let changedFiles: string[] = [];

      if (existsSync(ticket.project_path)) {
        const gitCheck = runGitCommand("git rev-parse --git-dir", ticket.project_path);
        if (gitCheck.success) {
          let baseBranch = "main";
          const mainExists = runGitCommand(
            "git show-ref --verify --quiet refs/heads/main",
            ticket.project_path
          );
          if (!mainExists.success) {
            const masterExists = runGitCommand(
              "git show-ref --verify --quiet refs/heads/master",
              ticket.project_path
            );
            if (masterExists.success) baseBranch = "master";
          }

          const commitsResult = runGitCommand(
            `git log ${baseBranch}..HEAD --oneline --no-decorate 2>/dev/null || git log -10 --oneline --no-decorate`,
            ticket.project_path
          );

          if (commitsResult.success && commitsResult.output) {
            commitsInfo = commitsResult.output;
            const commitLines = commitsInfo.split("\n").filter((l) => l.trim());
            prDescription = `## Summary\n${summary || ticket.title}\n\n## Changes\n${commitLines.map((c) => `- ${c.substring(c.indexOf(" ") + 1)}`).join("\n")}\n\n## Ticket\n- ID: ${shortId(ticketId)}\n- Title: ${ticket.title}\n`;
          }

          // Get list of changed files for code review guidance
          const filesResult = runGitCommand(
            `git diff ${baseBranch}..HEAD --name-only 2>/dev/null || git diff HEAD~5..HEAD --name-only 2>/dev/null`,
            ticket.project_path
          );
          if (filesResult.success && filesResult.output) {
            changedFiles = filesResult.output.split("\n").filter((f) => f.trim());
          } else if (!filesResult.success) {
            log.warn(
              `Failed to get changed files for ticket ${ticketId}: ${filesResult.error || "unknown error"}`
            );
          }
        }
      }

      const now = new Date().toISOString();
      try {
        // Per Universal Quality Workflow: complete_ticket_work moves to ai_review, not done
        // The ai_review phase requires running review agents and fixing findings before human_review
        db.prepare("UPDATE tickets SET status = 'ai_review', updated_at = ? WHERE id = ?").run(
          now,
          ticketId
        );
      } catch (dbErr) {
        const errMsg = (dbErr as Error).message;
        log.error(`Failed to update ticket status to ai_review: ${errMsg}`);
        return {
          content: [{ type: "text" as const, text: `Failed to update ticket status: ${errMsg}` }],
          isError: true,
        };
      }

      // Create or update workflow state for this ticket
      // Per spec: increment review_iteration each time ticket enters ai_review
      // Wrapped in try-catch: workflow state is for tracking, not critical to ticket operation
      let workflowStateWarning = "";
      try {
        const workflowState = db
          .prepare("SELECT * FROM ticket_workflow_state WHERE ticket_id = ?")
          .get(ticketId) as TicketWorkflowStateRow | undefined;
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
        const errMsg = (stateErr as Error).message;
        log.error(`Failed to update workflow state for ticket ${ticketId}: ${errMsg}`);
        workflowStateWarning = `\n\n**Warning:** Workflow state tracking failed: ${errMsg}. Review iteration may not be accurate.`;
      }

      // Auto-post work summary comment
      const workSummaryContent = summary
        ? `## Work Summary\n\n${summary}\n\n${commitsInfo ? `### Commits\n\`\`\`\n${commitsInfo}\`\`\`` : ""}`
        : `Completed work on: ${ticket.title}${commitsInfo ? `\n\nCommits:\n${commitsInfo}` : ""}`;
      const summaryResult = addComment(db, ticketId, workSummaryContent, "ralph", "work_summary");
      const summaryWarning = summaryResult.success
        ? ""
        : `\n\n**Warning:** Work summary comment was not saved: ${summaryResult.error}`;

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

      const updatedTicket = db
        .prepare(
          `
        SELECT t.*, p.name as project_name, p.path as project_path
        FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
      `
        )
        .get(ticketId) as TicketRow;

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

      const sections: string[] = [
        prdWarning +
          `## Implementation Complete - Now in AI Review

**Ticket:** ${updatedTicket.title}
**Status:** ${updatedTicket.status}
**Project:** ${updatedTicket.project_name}`,

        `### Work Summary ${summaryResult.success ? "Posted" : "NOT SAVED"}
${summary || "Auto-generated summary from commits"}${summaryWarning}`,

        prdResult.success ? `### PRD Update\n${prdResult.message}` : "", // Already shown at top
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
${changedFiles
  .slice(0, 15)
  .map((f) => `- ${f}`)
  .join("\n")}${changedFiles.length > 15 ? `\n- ... and ${changedFiles.length - 15} more` : ""}`);
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
        content: [
          {
            type: "text" as const,
            text: responseText,
          },
        ],
      };
    }
  );
}

// Note: _getContextResetGuidance and _getCodeReviewGuidance were removed in bc92b026 review
// The AI review instructions are now embedded directly in complete_ticket_work response (lines 1494-1542)
// Context reset guidance will be added to submit_demo_feedback when that's implemented
