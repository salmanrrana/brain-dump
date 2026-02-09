/**
 * Consolidated workflow resource tool for Brain Dump MCP server.
 *
 * Consolidates workflow operations into one action-dispatched tool.
 * Legacy tool names (start_ticket_work/complete_ticket_work) are still used in telemetry labels.
 * Business logic lives in core/workflow.ts.
 * MCP layer adds presentation: attachments, context building, telemetry, conversation sessions.
 *
 * @module tools/workflow
 */
import { z } from "zod";
import { log } from "../lib/logging.js";
import { mcpError } from "../lib/mcp-response.ts";
import { requireParam, formatResult } from "../lib/mcp-format.ts";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "better-sqlite3";
import { CoreError } from "../../core/errors.ts";
import { startWork, completeWork, startEpicWork } from "../../core/workflow.ts";
import { linkCommit, linkPr, syncTicketLinks } from "../../core/git.ts";
import type { PrStatus } from "../../core/types.ts";
import { createRealGitOperations, shortId } from "../../core/git-utils.ts";
import type { StartWorkResult, CompleteWorkResult, StartEpicWorkResult } from "../../core/types.ts";

// MCP-layer presentation imports
import { getActiveTelemetrySession, logMcpCallEvent } from "../lib/telemetry-self-log.js";
import { loadTicketAttachments, buildAttachmentContextSection } from "../lib/attachment-loader.js";
import { fetchTicketComments, buildCommentsSection } from "../lib/comment-utils.js";
import { updatePrdForTicket } from "../lib/prd-utils.js";
import { createConversationSession, endConversationSessions } from "../lib/conversation-session.js";
import {
  buildTicketContextContent,
  buildWarningsSection,
  buildAttachmentsSection,
} from "../lib/ticket-context-builder.js";

const ACTIONS = [
  "start-work",
  "complete-work",
  "start-epic",
  "link-commit",
  "link-pr",
  "sync-links",
] as const;
const PR_STATUSES = ["draft", "open", "merged", "closed"] as const;

/**
 * Register the consolidated workflow tool with the MCP server.
 */
export function registerWorkflowTool(
  server: McpServer,
  db: Database.Database,
  detectEnvironment: () => string
): void {
  const git = createRealGitOperations();

  server.tool(
    "workflow",
    `Manage ticket and epic work lifecycle in Brain Dump.

## Actions

### start-work
Start working on a ticket. Creates git branch, sets status to in_progress, returns ticket context.
Required params: ticketId

### complete-work
Complete implementation and move ticket to ai_review. Posts work summary, updates PRD.
Required params: ticketId
Optional params: summary

### start-epic
Start working on an epic. Creates shared git branch for all tickets in the epic.
Required params: epicId
Optional params: createPr

### link-commit
Link a git commit to a ticket. Tracks which commits belong to which ticket.
Required params: ticketId, commitHash
Optional params: commitMessage

### link-pr
Link a GitHub PR to a ticket. Also triggers PR status sync for all tickets in the project.
Required params: ticketId, prNumber
Optional params: prUrl, prStatus

### sync-links
Auto-discover and link commits and PRs to the active ticket from Ralph state or branch name.
Optional params: projectPath

## Parameters
- action: (required) The operation to perform
- ticketId: Ticket ID. Required for: start-work, complete-work, link-commit, link-pr
- epicId: Epic ID. Required for: start-epic
- summary: Work summary. Optional for: complete-work
- createPr: Create a draft PR immediately (default: false). Optional for: start-epic
- commitHash: Git commit hash. Required for: link-commit
- commitMessage: Commit message. Optional for: link-commit
- prNumber: GitHub PR number. Required for: link-pr
- prUrl: Full PR URL. Optional for: link-pr
- prStatus: PR status (draft, open, merged, closed). Optional for: link-pr
- projectPath: Project path for auto-detection. Optional for: sync-links`,
    {
      action: z.enum(ACTIONS).describe("The operation to perform"),
      ticketId: z.string().optional().describe("Ticket ID"),
      epicId: z.string().optional().describe("Epic ID"),
      summary: z.string().optional().describe("Work summary"),
      createPr: z.boolean().optional().describe("Create draft PR (default: false)"),
      commitHash: z.string().optional().describe("Git commit hash"),
      commitMessage: z.string().optional().describe("Commit message"),
      prNumber: z.number().optional().describe("GitHub PR number"),
      prUrl: z.string().optional().describe("Full PR URL"),
      prStatus: z.enum(PR_STATUSES).optional().describe("PR status"),
      projectPath: z.string().optional().describe("Project path for auto-detection"),
    },
    async (params: {
      action: (typeof ACTIONS)[number];
      ticketId?: string | undefined;
      epicId?: string | undefined;
      summary?: string | undefined;
      createPr?: boolean | undefined;
      commitHash?: string | undefined;
      commitMessage?: string | undefined;
      prNumber?: number | undefined;
      prUrl?: string | undefined;
      prStatus?: (typeof PR_STATUSES)[number] | undefined;
      projectPath?: string | undefined;
    }) => {
      try {
        switch (params.action) {
          case "start-work": {
            return handleStartWork(db, git, detectEnvironment, params);
          }

          case "complete-work": {
            return handleCompleteWork(db, git, detectEnvironment, params);
          }

          case "start-epic": {
            return handleStartEpic(db, git, params);
          }

          case "link-commit": {
            const ticketId = requireParam(params.ticketId, "ticketId", "link-commit");
            const commitHash = requireParam(params.commitHash, "commitHash", "link-commit");

            const result = linkCommit(db, ticketId, commitHash, params.commitMessage);

            if (result.alreadyLinked) {
              log.info(`Commit ${commitHash} already linked to ticket ${ticketId}`);
              return formatResult(
                result,
                `Commit already linked to ticket "${result.ticketTitle}".`
              );
            }

            log.info(`Linked commit ${commitHash} to ticket ${ticketId}`);
            return formatResult(
              result,
              `Commit linked to ticket "${result.ticketTitle}". Total commits: ${result.totalCommits}`
            );
          }

          case "link-pr": {
            const ticketId = requireParam(params.ticketId, "ticketId", "link-pr");
            const prNumber = requireParam(params.prNumber, "prNumber", "link-pr");

            const result = linkPr(
              db,
              ticketId,
              prNumber,
              params.prUrl,
              params.prStatus as PrStatus | undefined
            );

            let syncInfo = "";
            if (result.syncedPrs.length > 0) {
              syncInfo = `\nPR status synced for ${result.syncedPrs.length} ticket(s).`;
            }

            log.info(`Linked PR #${prNumber} to ticket ${ticketId}`);
            return formatResult(
              result,
              `PR #${prNumber} linked to ticket "${result.ticketTitle}".${syncInfo}`
            );
          }

          case "sync-links": {
            const result = syncTicketLinks(db, params.projectPath);

            const parts: string[] = [];
            if (result.commitsLinked.length > 0) {
              parts.push(`Linked ${result.commitsLinked.length} new commit(s)`);
            }
            if (result.commitsSkipped.length > 0) {
              parts.push(`${result.commitsSkipped.length} commit(s) already linked`);
            }
            if (result.prLinked) {
              parts.push(`Linked PR #${result.prLinked.number}`);
            }
            if (result.prSkipped) {
              parts.push(`PR #${result.prSkipped.number} already linked`);
            }
            if (parts.length === 0) {
              parts.push("No new links to add");
            }

            log.info(`Synced links for ticket ${result.ticketId}: ${parts.join(", ")}`);
            return formatResult(
              result,
              `Sync complete for "${result.ticketTitle}" (source: ${result.source}).\n${parts.join("\n")}`
            );
          }
        }
      } catch (err) {
        if (err instanceof CoreError) {
          log.error(`workflow/${params.action} failed: ${err.message}`);
        }
        return mcpError(err);
      }
    }
  );
}

// ============================================
// Action Handlers
// ============================================

/**
 * Handle start-work action: delegates to core, then adds MCP-layer presentation
 * (attachments, comments, context building, conversation session, telemetry).
 */
function handleStartWork(
  db: Database.Database,
  git: ReturnType<typeof createRealGitOperations>,
  detectEnvironment: () => string,
  params: { ticketId?: string | undefined }
) {
  const ticketId = requireParam(params.ticketId, "ticketId", "start-work");

  // Telemetry self-logging (for non-hook environments)
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

  let result: StartWorkResult;
  try {
    result = startWork(db, ticketId, git);
  } catch (err) {
    if (telemetrySession && correlationId) {
      logMcpCallEvent(db, {
        sessionId: telemetrySession.id,
        ticketId: telemetrySession.ticket_id,
        event: "end",
        toolName: "start_ticket_work",
        correlationId,
        success: false,
        durationMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
    throw err;
  }

  const ticket = result.ticket;
  const parseWarnings: string[] = [];

  // Parse acceptance criteria from subtasks
  let acceptanceCriteria: string[] = ["Complete the implementation as described"];
  if (ticket.subtasks && ticket.subtasks.length > 0) {
    acceptanceCriteria = ticket.subtasks.map((s) => {
      if (typeof s === "string") return s;
      return (s as { title?: string }).title || String(s);
    });
  }

  const description = ticket.description || "No description provided";
  const priority = ticket.priority || "medium";

  // Fetch previous comments for context
  const { comments, totalCount, truncated } = fetchTicketComments(db, ticketId);
  const commentsSection = buildCommentsSection(comments, totalCount, truncated);
  log.info(`Loaded ${comments.length} of ${totalCount} comments for ticket ${ticketId}`);

  // Load ticket attachments for LLM context
  let attachmentsList: unknown[] | null = null;
  if (ticket.attachments && ticket.attachments.length > 0) {
    attachmentsList = ticket.attachments;
  }

  const {
    contentBlocks: attachmentBlocks,
    warnings: attachmentWarnings,
    telemetry: attachmentTelemetry,
  } = loadTicketAttachments(ticketId, attachmentsList);

  if (attachmentTelemetry.totalCount > 0) {
    log.info(
      `Attachment telemetry for ticket ${ticketId}: total=${attachmentTelemetry.totalCount}, loaded=${attachmentTelemetry.loadedCount}, failed=${attachmentTelemetry.failedCount}`
    );
  }

  const attachmentContext = buildAttachmentContextSection(attachmentTelemetry);
  const attachmentsSection = buildAttachmentsSection(attachmentBlocks);

  // Combine all warnings
  const allWarnings = [...result.warnings, ...parseWarnings, ...attachmentWarnings];
  const warningsSection = buildWarningsSection(allWarnings);

  // Create conversation session for compliance logging
  const environment = detectEnvironment();
  const sessionResult = createConversationSession(db, ticketId, ticket.projectId, environment);
  const sessionInfo = sessionResult.success
    ? `**Conversation Session:** \`${sessionResult.sessionId}\` (auto-created for compliance logging)`
    : `**Warning:** Compliance logging failed: ${sessionResult.error}. Work may not be logged for audit.`;

  // Build epic info if available
  let epicInfo: { title: string; branchName: string; prUrl?: string | undefined } | undefined;
  if (result.usingEpicBranch && ticket.epicId) {
    const epic = db.prepare("SELECT title FROM epics WHERE id = ?").get(ticket.epicId) as
      | { title: string }
      | undefined;
    if (epic) {
      epicInfo = {
        title: epic.title,
        branchName: result.branch,
      };
    }
  }

  // Build the complete context using ticket-context-builder
  const contextParams = {
    ticket: {
      title: ticket.title,
      project_name: ticket.project.name,
      project_path: ticket.project.path,
    },
    branchName: result.branch,
    branchCreated: result.branchCreated,
    usingEpicBranch: result.usingEpicBranch,
    sessionInfo,
    attachmentContext,
    description,
    priority,
    acceptanceCriteria,
    commentsSection,
    attachmentsSection,
    warningsSection,
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

  log.info(`Started work on ticket ${ticketId}: branch ${result.branch}`);
  return { content };
}

/**
 * Handle complete-work action: delegates to core, then adds MCP-layer presentation
 * (PRD update, conversation sessions, telemetry, AI review instructions).
 */
function handleCompleteWork(
  db: Database.Database,
  git: ReturnType<typeof createRealGitOperations>,
  detectEnvironment: () => string,
  params: { ticketId?: string | undefined; summary?: string | undefined }
) {
  const ticketId = requireParam(params.ticketId, "ticketId", "complete-work");

  // Telemetry self-logging
  const telemetrySession = getActiveTelemetrySession(db, ticketId);
  let correlationId: string | null = null;
  const startTime = Date.now();
  if (telemetrySession) {
    correlationId = logMcpCallEvent(db, {
      sessionId: telemetrySession.id,
      ticketId: telemetrySession.ticket_id,
      event: "start",
      toolName: "complete_ticket_work",
      params: { ticketId, summary: params.summary ? "[provided]" : undefined },
    });
  }

  let result: CompleteWorkResult;
  try {
    result = completeWork(db, ticketId, git, params.summary);
  } catch (err) {
    if (telemetrySession && correlationId) {
      logMcpCallEvent(db, {
        sessionId: telemetrySession.id,
        ticketId: telemetrySession.ticket_id,
        event: "end",
        toolName: "complete_ticket_work",
        correlationId,
        success: false,
        durationMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
    throw err;
  }

  // Get project path for PRD update
  const ticketRow = db
    .prepare(
      "SELECT t.*, p.path as project_path, p.name as project_name FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?"
    )
    .get(ticketId) as { project_path: string; project_name: string; title: string } | undefined;

  // Update PRD file
  let prdWarning = "";
  if (ticketRow) {
    const prdResult = updatePrdForTicket(ticketRow.project_path, ticketId);
    if (!prdResult.success) {
      log.error(`PRD update failed for ticket ${ticketId}: ${prdResult.message}`);
      prdWarning = `## WARNING: PRD Update Failed

**The PRD file was NOT updated.** This will cause Ralph's iteration loop to malfunction.

**Problem:** \`${prdResult.message}\`

**Action Required:** Manually update \`plans/prd.json\`:
1. Find the ticket with ID containing \`${ticketId.substring(0, 8)}\`
2. Set \`"passes": true\` for that ticket
3. Save the file

---

`;
    }
  }

  // End conversation sessions
  const sessionEndResult = endConversationSessions(db, ticketId);
  let sessionEndInfo = "";
  if (!sessionEndResult.success) {
    sessionEndInfo = `### Conversation Sessions\n**Warning:** Failed to end sessions: ${sessionEndResult.error}`;
  } else if (sessionEndResult.sessionsEnded > 0) {
    sessionEndInfo = `### Conversation Sessions\n${sessionEndResult.sessionsEnded} session(s) ended (${sessionEndResult.messageCount || 0} messages logged)`;
  }

  const environment = detectEnvironment();

  // Build response sections
  const sections: string[] = [
    prdWarning +
      `## Implementation Complete - Now in AI Review

**Ticket:** ${ticketRow?.title || ticketId}
**Status:** ai_review
**Project:** ${ticketRow?.project_name || "Unknown"}`,

    `### Work Summary
${params.summary || "Auto-generated summary from commits"}`,
  ].filter(Boolean);

  if (result.warnings.length > 0) {
    sections.push(`### Warnings\n${result.warnings.map((w) => `- ${w}`).join("\n")}`);
  }

  if (sessionEndInfo) {
    sections.push(sessionEndInfo);
  }

  // AI Review Instructions
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
review({
  action: "submit-finding",
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
review({ action: "mark-fixed", findingId: "...", fixStatus: "fixed", fixDescription: "How it was fixed" })
\`\`\`

### Step 4: Verify Review Complete
\`\`\`
review({ action: "check-complete", ticketId: "${ticketId}" })
\`\`\`
Must return \`canProceedToHumanReview: true\` (all critical/major fixed)

### Step 5: Generate Demo Script
\`\`\`
review({
  action: "generate-demo",
  ticketId: "${ticketId}",
  steps: [
    { order: 1, description: "What to test", expectedOutcome: "What should happen", type: "manual" }
  ]
})
\`\`\`
This moves ticket to **human_review**.

### Step 6: STOP
**DO NOT proceed further.** The ticket requires human approval via \`review({ action: "submit-feedback", ... })\`.`);

  // Changed files for reference
  if (result.changedFiles.length > 0) {
    sections.push(`### Files Changed
${result.changedFiles
  .slice(0, 15)
  .map((f) => `- ${f}`)
  .join(
    "\n"
  )}${result.changedFiles.length > 15 ? `\n- ... and ${result.changedFiles.length - 15} more` : ""}`);
  }

  // PR description suggestion
  if (result.commitsInfo) {
    const commitLines = result.commitsInfo.split("\n").filter((l) => l.trim());
    const prDescription = `## Summary\n${params.summary || ticketRow?.title || ticketId}\n\n## Changes\n${commitLines.map((c) => `- ${c.substring(c.indexOf(" ") + 1)}`).join("\n")}\n\n## Ticket\n- ID: ${shortId(ticketId)}\n- Title: ${ticketRow?.title || ticketId}\n`;
    sections.push(`### Suggested PR Description (for later)
\`\`\`markdown
${prDescription}
\`\`\``);
  }

  if (result.suggestedNextTicket) {
    sections.push(
      `### Suggested Next Ticket\n- **${result.suggestedNextTicket.title}** (\`${result.suggestedNextTicket.id}\`)`
    );
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

  log.info(`Completed implementation on ticket ${ticketId}, moved to ai_review`);
  return {
    content: [{ type: "text" as const, text: responseText }],
  };
}

/**
 * Handle start-epic action: delegates to core, optionally creates draft PR,
 * then formats a rich markdown response.
 */
function handleStartEpic(
  db: Database.Database,
  git: ReturnType<typeof createRealGitOperations>,
  params: { epicId?: string | undefined; createPr?: boolean | undefined }
) {
  const epicId = requireParam(params.epicId, "epicId", "start-epic");
  const createPr = params.createPr ?? false;

  const result: StartEpicWorkResult = startEpicWork(db, epicId, git);

  // Optionally create draft PR
  let prInfo = "";
  if (createPr) {
    // Get project path for git operations
    const epicRow = db
      .prepare(
        "SELECT e.*, p.path as project_path FROM epics e JOIN projects p ON e.project_id = p.id WHERE e.id = ?"
      )
      .get(epicId) as { project_path: string } | undefined;

    if (epicRow) {
      const pushResult = git.run(`git push -u origin ${result.branch}`, epicRow.project_path);
      if (!pushResult.success) {
        prInfo = `\n\n**Warning:** Could not push branch to remote: ${pushResult.error}\nCreate PR manually when ready.`;
      } else {
        const prResult = git.run(
          `gh pr create --draft --title "[Epic] ${result.epic.title}" --body "Epic work for: ${result.epic.title}\n\nThis PR contains all tickets from the epic."`,
          epicRow.project_path
        );
        if (prResult.success && prResult.output) {
          const prUrl = prResult.output.trim();
          const prNumber = parseInt(prUrl.split("/").pop() || "0", 10);

          // Update epic workflow state with PR info
          const now = new Date().toISOString();
          db.prepare(
            "UPDATE epic_workflow_state SET pr_number = ?, pr_url = ?, pr_status = 'draft', updated_at = ? WHERE epic_id = ?"
          ).run(prNumber, prUrl, now, epicId);

          prInfo = `\n\n**Draft PR Created:** ${prUrl}`;
          log.info(`Created draft PR for epic ${epicId}: ${prUrl}`);
        } else {
          prInfo = `\n\n**Warning:** Could not create PR: ${prResult.error}\nCreate PR manually when ready.`;
        }
      }
    }
  }

  log.info(`Started epic work on ${epicId}: branch ${result.branch}`);

  const ticketList = result.tickets
    .map((t) => `- [${t.status}] ${t.title} (${t.priority || "medium"})`)
    .join("\n");

  return {
    content: [
      {
        type: "text" as const,
        text: `## Started Epic Work

**Branch:** \`${result.branch}\` ${result.branchCreated ? "(created)" : "(checked out)"}
**Epic:** ${result.epic.title}
**Project:** ${result.epic.projectName}${prInfo}

### Tickets in Epic (${result.tickets.length})
${ticketList}

---

All tickets in this epic will now use the epic branch \`${result.branch}\`.
Use \`workflow({ action: "start-work", ticketId: "..." })\` to begin work on any ticket.`,
      },
    ],
  };
}
