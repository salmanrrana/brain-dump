/**
 * Workflow tools for Brain Dump MCP server.
 * Handles starting and completing ticket work (includes git branch creation).
 * Smart workflow automation - handles comments, PRD updates, and next ticket suggestions.
 * @module tools/workflow
 */
import { z } from "zod";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";
import { join } from "path";
import { log } from "../lib/logging.js";
import { runGitCommand, shortId, generateBranchName } from "../lib/git-utils.js";

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

      const updatedTicket = db.prepare(`
        SELECT t.*, p.name as project_name, p.path as project_path
        FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
      `).get(ticketId);

      log.info(`Started work on ticket ${ticketId}: branch ${branchName}`);

      // Parse acceptance criteria from subtasks JSON
      let acceptanceCriteria = ["Complete the implementation as described"];
      if (updatedTicket.subtasks) {
        try {
          const subtasks = JSON.parse(updatedTicket.subtasks);
          if (subtasks.length > 0) {
            acceptanceCriteria = subtasks.map(s => s.title || s);
          }
        } catch (parseErr) {
          log.warn(`Failed to parse subtasks for ticket ${ticketId}:`, parseErr);
          // Keep default criteria if parsing fails
        }
      }

      const description = updatedTicket.description || "No description provided";
      const priority = updatedTicket.priority || "medium";

      return {
        content: [{
          type: "text",
          text: `## Started Work on Ticket

**Branch:** \`${branchName}\` ${branchCreated ? "(created)" : "(checked out)"}
**Project:** ${updatedTicket.project_name}
**Path:** ${updatedTicket.project_path}

---

## Ticket: ${updatedTicket.title}

**Priority:** ${priority}

### Description
${description}

### Acceptance Criteria
${acceptanceCriteria.map(c => `- ${c}`).join("\n")}

---

Focus on implementation. When done, call \`complete_ticket_work\` with your summary.`,
        }],
      };
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

  const environmentInstructions = {
    "claude-code": `Run \`/review\` to launch the review pipeline, or use the Task tool to launch these agents in parallel:
- \`pr-review-toolkit:code-reviewer\`
- \`pr-review-toolkit:silent-failure-hunter\`
- \`pr-review-toolkit:code-simplifier\``,
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

  return `## Code Review Recommended

Before creating a PR, run the code review pipeline to catch issues early.

### Review Agents:
${reviewAgents.map(a => `- ${a}`).join("\n")}

### How to Run:
${instructions}

${changedFiles.length > 0 ? `### Files to Review:\n${changedFiles.slice(0, 10).map(f => `- ${f}`).join("\n")}${changedFiles.length > 10 ? `\n- ... and ${changedFiles.length - 10} more` : ""}` : ""}`;
}
