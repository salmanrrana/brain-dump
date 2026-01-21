/**
 * Workflow tools for Brain Dump MCP server.
 * Handles starting and completing ticket work (includes git branch creation).
 * Smart workflow automation - handles comments, PRD updates, next ticket suggestions,
 * and automatic conversation session management for compliance logging.
 * @module tools/workflow
 */
import { z } from "zod";
import { existsSync, readFileSync, writeFileSync, statSync } from "fs";
import { randomUUID } from "crypto";
import { join } from "path";
import { homedir } from "os";
import { log } from "../lib/logging.js";
import { runGitCommand, shortId, generateBranchName } from "../lib/git-utils.js";

/**
 * Maximum file size for attachments to include in MCP response (5MB).
 * Files larger than this will be skipped with a warning.
 */
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;

/**
 * File type configuration for attachments.
 * Each entry defines how to handle a file extension: mime type and content type.
 * - "image": Loaded as base64 MCP image content block
 * - "text": Read as UTF-8 and included inline with code fence
 * - "reference": Not loaded, just referenced by path
 */
const FILE_TYPES = {
  jpg: { mime: "image/jpeg", type: "image" },
  jpeg: { mime: "image/jpeg", type: "image" },
  png: { mime: "image/png", type: "image" },
  gif: { mime: "image/gif", type: "image" },
  webp: { mime: "image/webp", type: "image" },
  svg: { mime: "image/svg+xml", type: "image" },  // Treat as image for consistency with src/api/attachments.ts
  pdf: { mime: "application/pdf", type: "reference" },
  txt: { mime: "text/plain", type: "text", fence: "" },
  md: { mime: "text/markdown", type: "text", fence: "markdown" },
  json: { mime: "application/json", type: "text", fence: "json" },
};

/**
 * Format file size for display.
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size (e.g., "1.5MB" or "256KB")
 */
function formatFileSize(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${Math.round(bytes / 1024 / 1024)}MB`;
  }
  return `${Math.round(bytes / 1024)}KB`;
}

/**
 * Get the attachments directory path.
 * Uses legacy path (~/.brain-dump) to match src/api/attachments.ts for consistency.
 * TODO: Migrate both to XDG-compliant paths (see docs/data-locations.md)
 * @returns {string}
 */
function getAttachmentsDir() {
  return join(homedir(), ".brain-dump", "attachments");
}

/**
 * Load a single attachment and return its content block.
 * @param {string} filePath - Full path to the file
 * @param {string} filename - Original filename for display
 * @param {number} size - File size in bytes
 * @returns {{ type: string, text?: string, data?: string, mimeType?: string }}
 */
function loadSingleAttachment(filePath, filename, size) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const fileConfig = FILE_TYPES[ext];
  const mimeType = fileConfig?.mime || "application/octet-stream";
  const contentType = fileConfig?.type || "reference";
  const sizeStr = formatFileSize(size);

  switch (contentType) {
    case "image": {
      const base64Data = readFileSync(filePath).toString("base64");
      log.info(`Loaded image attachment: ${filename} (${sizeStr})`);
      return { type: "image", data: base64Data, mimeType };
    }
    case "text": {
      const textContent = readFileSync(filePath, "utf-8");
      const fence = fileConfig.fence || "";
      log.info(`Loaded text attachment: ${filename} (${sizeStr})`);
      return {
        type: "text",
        text: `### Attachment: ${filename}\n\n\`\`\`${fence}\n${textContent}\n\`\`\``,
      };
    }
    default: {
      log.info(`Referenced attachment: ${filename} (${mimeType})`);
      return {
        type: "text",
        text: `### Attachment: ${filename}\n\n*File attached (${sizeStr}, type: ${mimeType}). Located at: ${filePath}*`,
      };
    }
  }
}

/**
 * Load and format ticket attachments as MCP content blocks.
 * Images are returned as image content blocks with base64 data.
 * Text files (txt, md, json) are returned as text content blocks.
 * PDFs and other files are referenced but not included inline.
 *
 * @param {string} ticketId - The ticket ID to load attachments for
 * @param {string[] | null} attachmentsList - JSON-parsed list of attachment filenames
 * @returns {{ contentBlocks: Array<{type: string, text?: string, data?: string, mimeType?: string}>, warnings: string[] }}
 */
function loadTicketAttachments(ticketId, attachmentsList) {
  const contentBlocks = [];
  const warnings = [];

  if (!attachmentsList || !Array.isArray(attachmentsList) || attachmentsList.length === 0) {
    return { contentBlocks, warnings };
  }

  const ticketDir = join(getAttachmentsDir(), ticketId);

  if (!existsSync(ticketDir)) {
    warnings.push(`Attachments directory not found: ${ticketDir}`);
    return { contentBlocks, warnings };
  }

  for (const filename of attachmentsList) {
    // Sanitize filename to prevent path traversal attacks (matches src/api/attachments.ts:171)
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    if (safeFilename !== filename) {
      warnings.push(`Skipped unsafe filename: ${filename}`);
      log.warn(`Blocked path traversal attempt in attachment: ${filename}`);
      continue;
    }
    const filePath = join(ticketDir, safeFilename);

    if (!existsSync(filePath)) {
      warnings.push(`Attachment file not found: ${filename}`);
      continue;
    }

    let stats;
    try {
      stats = statSync(filePath);
    } catch (err) {
      warnings.push(`Failed to stat file ${filename}: ${err.message}`);
      continue;
    }

    if (stats.size > MAX_ATTACHMENT_SIZE) {
      warnings.push(`Skipping ${filename}: File size (${formatFileSize(stats.size)}) exceeds 5MB limit`);
      continue;
    }

    try {
      contentBlocks.push(loadSingleAttachment(filePath, filename, stats.size));
    } catch (err) {
      warnings.push(`Failed to read ${filename}: ${err.message}`);
      log.error(`Failed to read attachment ${filename}:`, err);
    }
  }

  return { contentBlocks, warnings };
}

/**
 * Create a conversation session for compliance logging.
 * Auto-links to project and ticket for context.
 * @param {import("better-sqlite3").Database} db
 * @param {string} ticketId
 * @param {string} projectId
 * @param {string} environment
 * @returns {{ success: boolean, sessionId?: string, error?: string }}
 */
function createConversationSession(db, ticketId, projectId, environment) {
  const id = randomUUID();
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO conversation_sessions
      (id, project_id, ticket_id, environment, data_classification, started_at, created_at)
      VALUES (?, ?, ?, ?, 'internal', ?, ?)
    `).run(id, projectId, ticketId, environment, now, now);

    log.info(`Auto-created conversation session ${id} for ticket ${ticketId}`);
    return { success: true, sessionId: id };
  } catch (err) {
    log.error(`Failed to create conversation session for ticket ${ticketId}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * End any active conversation sessions for a ticket.
 * Sets ended_at timestamp and returns session summary.
 * @param {import("better-sqlite3").Database} db
 * @param {string} ticketId
 * @returns {{ success: boolean, sessionsEnded: number, messageCount?: number, error?: string }}
 */
function endConversationSessions(db, ticketId) {
  const now = new Date().toISOString();

  try {
    // Find active sessions for this ticket
    const activeSessions = db.prepare(`
      SELECT id FROM conversation_sessions
      WHERE ticket_id = ? AND ended_at IS NULL
    `).all(ticketId);

    if (activeSessions.length === 0) {
      return { success: true, sessionsEnded: 0 };
    }

    // Count total messages across sessions
    const sessionIds = activeSessions.map(s => s.id);
    const messageCount = db.prepare(`
      SELECT COUNT(*) as count FROM conversation_messages
      WHERE session_id IN (${sessionIds.map(() => "?").join(",")})
    `).get(...sessionIds)?.count || 0;

    // End all active sessions
    db.prepare(`
      UPDATE conversation_sessions
      SET ended_at = ?
      WHERE ticket_id = ? AND ended_at IS NULL
    `).run(now, ticketId);

    log.info(`Auto-ended ${activeSessions.length} conversation session(s) for ticket ${ticketId} (${messageCount} messages)`);
    return { success: true, sessionsEnded: activeSessions.length, messageCount };
  } catch (err) {
    log.error(`Failed to end conversation sessions for ticket ${ticketId}: ${err.message}`);
    return { success: false, sessionsEnded: 0, error: err.message };
  }
}

/**
 * Add a comment to a ticket (internal helper).
 * @param {import("better-sqlite3").Database} db
 * @param {string} ticketId
 * @param {string} content
 * @param {string} author
 * @param {string} type
 * @returns {{ success: boolean, id?: string, error?: string }}
 */
function addComment(db, ticketId, content, author = "ralph", type = "comment") {
  const id = randomUUID();
  const now = new Date().toISOString();
  try {
    db.prepare(
      "INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, ticketId, content.trim(), author, type, now);
    log.info(`Auto-added ${type} to ticket ${ticketId} by ${author}`);
    return { success: true, id };
  } catch (err) {
    log.error(`Failed to add ${type} to ticket ${ticketId}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Update PRD file to set passes: true for a ticket.
 * @param {string} projectPath
 * @param {string} ticketId
 * @returns {{ success: boolean, message: string }}
 */
function updatePrdForTicket(projectPath, ticketId) {
  const prdPath = join(projectPath, "plans", "prd.json");

  if (!existsSync(prdPath)) {
    return { success: false, message: `PRD file not found: ${prdPath}` };
  }

  try {
    const prdContent = readFileSync(prdPath, "utf-8");
    const prd = JSON.parse(prdContent);

    if (!prd.userStories || !Array.isArray(prd.userStories)) {
      return { success: false, message: "PRD has no userStories array" };
    }

    const story = prd.userStories.find(s => s.id === ticketId);
    if (!story) {
      return { success: false, message: `Ticket ${ticketId} not found in PRD` };
    }

    story.passes = true;
    writeFileSync(prdPath, JSON.stringify(prd, null, 2) + "\n");
    log.info(`Updated PRD: set passes=true for ticket ${ticketId}`);
    return { success: true, message: `PRD updated: ${story.title} marked as passing` };
  } catch (err) {
    return { success: false, message: `Failed to update PRD: ${err.message}` };
  }
}

/**
 * Read and parse PRD file.
 * @param {string} projectPath
 * @returns {{ prd: object | null, error: string | null }}
 */
function readPrd(projectPath) {
  const prdPath = join(projectPath, "plans", "prd.json");

  if (!existsSync(prdPath)) {
    return { prd: null, error: "No PRD file found" };
  }

  try {
    const prd = JSON.parse(readFileSync(prdPath, "utf-8"));
    if (!prd.userStories || !Array.isArray(prd.userStories)) {
      return { prd: null, error: "PRD has no userStories array" };
    }
    return { prd, error: null };
  } catch (err) {
    return { prd: null, error: `Failed to read PRD: ${err.message}` };
  }
}

/**
 * Get the next strategic ticket to work on from the PRD.
 * @param {string} projectPath
 * @param {string} completedTicketId - The ticket that was just completed
 * @returns {{ nextTicket: object | null, reason: string }}
 */
function suggestNextTicket(projectPath, completedTicketId) {
  const { prd, error } = readPrd(projectPath);
  if (!prd) {
    return { nextTicket: null, reason: error };
  }

  const incompleteStories = prd.userStories.filter(s => !s.passes && s.id !== completedTicketId);

  if (incompleteStories.length === 0) {
    return { nextTicket: null, reason: "All tickets complete! Sprint finished." };
  }

  // Prioritize by priority field (high > medium > low)
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  incompleteStories.sort((a, b) => {
    const aPriority = priorityOrder[a.priority] ?? 1;
    const bPriority = priorityOrder[b.priority] ?? 1;
    return aPriority - bPriority;
  });

  const next = incompleteStories[0];
  const description = next.description || "";
  return {
    nextTicket: {
      id: next.id,
      title: next.title,
      priority: next.priority,
      description: description.length > 200 ? description.substring(0, 200) + "..." : description,
    },
    reason: `Next highest priority ticket (${next.priority || "medium"})`,
  };
}

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

Use this when picking up a ticket to work on.
The project must have a git repository initialized.

Args:
  ticketId: The ticket ID to start working on

Returns:
  Branch name, ticket details with description/acceptance criteria, and project path.`,
    { ticketId: z.string().describe("Ticket ID to start working on") },
    async ({ ticketId }) => {
      const ticket = db.prepare(`
        SELECT t.*, p.name as project_name, p.path as project_path
        FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
      `).get(ticketId);

      if (!ticket) {
        return { content: [{ type: "text", text: `Ticket not found: ${ticketId}` }], isError: true };
      }

      if (ticket.status === "in_progress") {
        return { content: [{ type: "text", text: `Ticket is already in progress.\n\n${JSON.stringify(ticket, null, 2)}` }] };
      }

      if (!existsSync(ticket.project_path)) {
        return { content: [{ type: "text", text: `Project path does not exist: ${ticket.project_path}` }], isError: true };
      }

      const gitCheck = runGitCommand("git rev-parse --git-dir", ticket.project_path);
      if (!gitCheck.success) {
        return { content: [{ type: "text", text: `Not a git repository: ${ticket.project_path}\n\nInitialize git first: git init` }], isError: true };
      }

      const branchName = generateBranchName(ticketId, ticket.title);
      const branchExists = runGitCommand(`git show-ref --verify --quiet refs/heads/${branchName}`, ticket.project_path);

      let branchCreated = false;
      if (!branchExists.success) {
        const createBranch = runGitCommand(`git checkout -b ${branchName}`, ticket.project_path);
        if (!createBranch.success) {
          return { content: [{ type: "text", text: `Failed to create branch ${branchName}: ${createBranch.error}` }], isError: true };
        }
        branchCreated = true;
      } else {
        const checkoutBranch = runGitCommand(`git checkout ${branchName}`, ticket.project_path);
        if (!checkoutBranch.success) {
          return { content: [{ type: "text", text: `Failed to checkout branch ${branchName}: ${checkoutBranch.error}` }], isError: true };
        }
      }

      const now = new Date().toISOString();
      try {
        db.prepare("UPDATE tickets SET status = 'in_progress', branch_name = ?, updated_at = ? WHERE id = ?").run(branchName, now, ticketId);
      } catch (dbErr) {
        log.error(`Failed to update ticket status: ${dbErr.message}`, { ticketId });
        // Attempt to clean up the branch we just created
        runGitCommand(`git checkout - && git branch -d ${branchName}`, ticket.project_path);
        return { content: [{ type: "text", text: `Failed to update ticket status: ${dbErr.message}\n\nThe git branch was cleaned up. Please try again.` }], isError: true };
      }

      // Auto-post "Starting work" comment
      const commentResult = addComment(db, ticketId, `Starting work on: ${ticket.title}`, "ralph", "comment");
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

      const { contentBlocks: attachmentBlocks, warnings: attachmentWarnings } = loadTicketAttachments(ticketId, attachmentsList);

      // Build attachments section for the text block
      let attachmentsSection = "";
      if (attachmentBlocks.length > 0) {
        const imageCount = attachmentBlocks.filter(b => b.type === "image").length;
        const textCount = attachmentBlocks.filter(b => b.type === "text").length;
        attachmentsSection = `\n### Attachments\n${imageCount > 0 ? `- ${imageCount} image(s) included below\n` : ""}${textCount > 0 ? `- ${textCount} text/reference file(s) included below\n` : ""}`;
      }

      // Add warnings section if any (combine parse warnings and attachment warnings)
      const allWarnings = [...parseWarnings, ...attachmentWarnings];
      let warningsSection = "";
      if (allWarnings.length > 0) {
        warningsSection = `\n### Warnings\n${allWarnings.map(w => `- ${w}`).join("\n")}\n`;
      }

      // Build the main text content block
      const mainTextBlock = {
        type: "text",
        text: `## Started Work on Ticket

**Branch:** \`${branchName}\` ${branchCreated ? "(created)" : "(checked out)"}
**Project:** ${updatedTicket.project_name}
**Path:** ${updatedTicket.project_path}
${sessionInfo ? `\n${sessionInfo}` : ""}

---

## Ticket: ${updatedTicket.title}

**Priority:** ${priority}

### Description
${description}

### Acceptance Criteria
${acceptanceCriteria.map(c => `- ${c}`).join("\n")}
${attachmentsSection}${warningsSection}
---

Focus on implementation. When done, call \`complete_ticket_work\` with your summary.`,
      };

      // Build the content array: main text first, then attachments
      const content = [mainTextBlock, ...attachmentBlocks];

      return { content };
    }
  );

  // Complete ticket work
  server.tool(
    "complete_ticket_work",
    `Complete work on a ticket and move it to review.

This tool handles all completion workflow automatically:
1. Sets the ticket status to review
2. Auto-posts a formatted work summary comment
3. Updates the PRD file (sets passes: true for this ticket)
4. Suggests the next strategic ticket to work on
5. Returns context reset guidance for fresh perspective

Use this when you've finished implementing a ticket.
Call this before creating a pull request.

Args:
  ticketId: The ticket ID to complete
  summary: Work summary describing what was done (recommended)

Returns:
  Updated ticket, PR description, next ticket suggestion, and context reset guidance.`,
    {
      ticketId: z.string().describe("Ticket ID to complete"),
      summary: z.string().optional().describe("Work summary describing what was done - will be auto-posted as a comment"),
    },
    async ({ ticketId, summary }) => {
      const ticket = db.prepare(`
        SELECT t.*, p.name as project_name, p.path as project_path
        FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
      `).get(ticketId);

      if (!ticket) {
        return { content: [{ type: "text", text: `Ticket not found: ${ticketId}` }], isError: true };
      }

      if (ticket.status === "done") {
        return { content: [{ type: "text", text: `Ticket is already done.\n\n${JSON.stringify(ticket, null, 2)}` }] };
      }

      if (ticket.status === "review") {
        return { content: [{ type: "text", text: `Ticket is already in review.\n\n${JSON.stringify(ticket, null, 2)}` }] };
      }

      let commitsInfo = "", prDescription = "";
      let changedFiles = [];

      if (existsSync(ticket.project_path)) {
        const gitCheck = runGitCommand("git rev-parse --git-dir", ticket.project_path);
        if (gitCheck.success) {
          let baseBranch = "main";
          const mainExists = runGitCommand("git show-ref --verify --quiet refs/heads/main", ticket.project_path);
          if (!mainExists.success) {
            const masterExists = runGitCommand("git show-ref --verify --quiet refs/heads/master", ticket.project_path);
            if (masterExists.success) baseBranch = "master";
          }

          const commitsResult = runGitCommand(
            `git log ${baseBranch}..HEAD --oneline --no-decorate 2>/dev/null || git log -10 --oneline --no-decorate`,
            ticket.project_path
          );

          if (commitsResult.success && commitsResult.output) {
            commitsInfo = commitsResult.output;
            const commitLines = commitsInfo.split("\n").filter(l => l.trim());
            prDescription = `## Summary\n${summary || ticket.title}\n\n## Changes\n${commitLines.map(c => `- ${c.substring(c.indexOf(" ") + 1)}`).join("\n")}\n\n## Ticket\n- ID: ${shortId(ticketId)}\n- Title: ${ticket.title}\n`;
          }

          // Get list of changed files for code review guidance
          const filesResult = runGitCommand(
            `git diff ${baseBranch}..HEAD --name-only 2>/dev/null || git diff HEAD~5..HEAD --name-only 2>/dev/null`,
            ticket.project_path
          );
          if (filesResult.success && filesResult.output) {
            changedFiles = filesResult.output.split("\n").filter(f => f.trim());
          }
        }
      }

      const now = new Date().toISOString();
      try {
        db.prepare("UPDATE tickets SET status = 'review', updated_at = ? WHERE id = ?").run(now, ticketId);
      } catch (dbErr) {
        log.error(`Failed to update ticket status to review: ${dbErr.message}`, { ticketId });
        return { content: [{ type: "text", text: `Failed to update ticket status: ${dbErr.message}` }], isError: true };
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

      // Suggest next ticket
      const nextTicketSuggestion = suggestNextTicket(ticket.project_path, ticketId);

      const updatedTicket = db.prepare(`
        SELECT t.*, p.name as project_name, p.path as project_path
        FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
      `).get(ticketId);

      log.info(`Completed work on ticket ${ticketId}, moved to review`);

      const environment = detectEnvironment();
      const contextResetGuidance = getContextResetGuidance(environment);
      const codeReviewGuidance = getCodeReviewGuidance(environment, changedFiles);

      // Build response sections
      const sections = [
        `## Ticket Completed

**Ticket:** ${updatedTicket.title}
**Status:** ${updatedTicket.status}
**Project:** ${updatedTicket.project_name}`,

        `### Work Summary ${summaryResult.success ? "Posted" : "NOT SAVED"}
${summary || "Auto-generated summary from commits"}${summaryWarning}`,

        `### PRD Update
${prdResult.success
  ? prdResult.message
  : `**FAILED:** ${prdResult.message}\n\nThe PRD was not updated. This may cause issues with automated workflows.`}`,
      ];

      // Add conversation session summary if sessions were ended
      if (sessionEndInfo) {
        sections.push(sessionEndInfo);
      }

      if (prDescription) {
        sections.push(`### Suggested PR Description
\`\`\`markdown
${prDescription}
\`\`\``);
      }

      // Code review guidance
      sections.push(codeReviewGuidance);

      // Next ticket suggestion
      const { nextTicket } = nextTicketSuggestion;
      if (nextTicket) {
        sections.push(`## Next Ticket Suggestion

**${nextTicket.title}** (${nextTicket.priority || "medium"})
${nextTicketSuggestion.reason}

${nextTicket.description || ""}

To start: \`start_ticket_work("${nextTicket.id}")\``);
      } else {
        sections.push(`## ${nextTicketSuggestion.reason}`);
      }

      sections.push(contextResetGuidance);
      sections.push(`---\nclearContext: true\nenvironment: ${environment}`);

      const responseText = sections.join("\n\n---\n\n");

      return {
        content: [{
          type: "text",
          text: responseText,
        }],
      };
    }
  );
}

function getContextResetGuidance(environment) {
  const resetInstructions = {
    "claude-code": 'Run `/clear` to reset context for the next task.',
    "vscode": 'Click "New Chat" or press Cmd/Ctrl+L for the next task.',
  };
  const instruction = resetInstructions[environment] || "Start a new conversation for the next task.";
  return `\n## Context Reset Required\n\nThis ticket has been completed. ${instruction}`;
}

/**
 * Generate code review instructions based on the environment.
 * In Claude Code, review is enforced by a Stop hook before conversation ends.
 * In other environments, clear instructions are provided.
 * @param {string} environment - The detected environment
 * @param {string[]} changedFiles - List of files changed in the branch
 * @returns {string} Markdown instructions for running code review
 */
function getCodeReviewGuidance(environment, changedFiles = []) {
  const hasCodeChanges = changedFiles.some(file =>
    /\.(ts|tsx|js|jsx|py|go|rs)$/.test(file) &&
    !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file) &&
    !/node_modules|dist|build/.test(file)
  );

  if (!hasCodeChanges && changedFiles.length > 0) {
    return `## Code Review

No source code changes detected. Review may be skipped.`;
  }

  const reviewAgents = [
    "**code-reviewer** - Checks code against project guidelines",
    "**silent-failure-hunter** - Identifies error handling issues",
    "**code-simplifier** - Simplifies and refines code",
  ];

  // Claude Code has automatic review enforcement via Stop hook
  if (environment === "claude-code") {
    return `## Code Review

**Automatic Review Enabled:** The Stop hook will prompt for \`/review\` before conversation ends.

When prompted, run \`/review\` to launch all three review agents in parallel:
${reviewAgents.map(a => `- ${a}`).join("\n")}

${changedFiles.length > 0 ? `### Files Changed:\n${changedFiles.slice(0, 10).map(f => `- ${f}`).join("\n")}${changedFiles.length > 10 ? `\n- ... and ${changedFiles.length - 10} more` : ""}` : ""}`;
  }

  // Other environments need manual review
  const environmentInstructions = {
    "vscode": `Use MCP tools to run these review agents:
1. code-reviewer - Reviews against CLAUDE.md guidelines
2. silent-failure-hunter - Checks error handling
3. code-simplifier - Simplifies complex code

These can be run via the MCP panel or by asking your AI assistant.`,
    "opencode": `Run the review pipeline by asking your assistant to launch:
- code-reviewer
- silent-failure-hunter
- code-simplifier`,
  };

  const instructions = environmentInstructions[environment] || environmentInstructions["vscode"];

  return `## Code Review Required

Before creating a PR, run the code review pipeline to catch issues early.

### Review Agents:
${reviewAgents.map(a => `- ${a}`).join("\n")}

### How to Run:
${instructions}

${changedFiles.length > 0 ? `### Files to Review:\n${changedFiles.slice(0, 10).map(f => `- ${f}`).join("\n")}${changedFiles.length > 10 ? `\n- ... and ${changedFiles.length - 10} more` : ""}` : ""}`;
}
