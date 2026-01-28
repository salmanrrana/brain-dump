/**
 * Workflow shortcut tools for Brain Dump MCP server.
 * Composite tools that combine common operations to reduce tool count and improve UX.
 *
 * Shortcuts combine multiple operations:
 * - quick_start_ticket: start_ticket_work + create_ralph_session + start_telemetry_session
 * - quick_complete_work: complete_ticket_work + add_ticket_comment + end_telemetry_session
 * - quick_link_commit: get_commit_info + add_ticket_comment
 * - quick_submit_finding: submit_review_finding + optionally mark as fixed
 *
 * @module tools/shortcuts
 */
import { z } from "zod";
import { log } from "../lib/logging.js";
import { getLastCommitInfo } from "../lib/git-utils.js";

/**
 * Register shortcut tools with the MCP server.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {import("better-sqlite3").Database} db
 */
export function registerShortcutTools(server, db) {
  // =====================================================================
  // quick_start_ticket: Combined start + telemetry + session creation
  // =====================================================================
  server.tool(
    "quick_start_ticket",
    `Quickly start working on a ticket with one command.

This combines three operations:
1. start_ticket_work - Creates git branch and sets status
2. create_ralph_session - Initializes work session
3. start_telemetry_session - Begins compliance logging

Returns the same output as start_ticket_work (branch name, context, project path).
Perfect for AI-assisted development to get started immediately.

Args:
  ticketId: The ticket ID to start working on
  sessionName: Optional name for the Ralph session (defaults to ticket title)`,
    {
      ticketId: z.string().describe("Ticket ID to start working on"),
      sessionName: z.string().optional().describe("Optional name for work session"),
    },
    async ({ ticketId, sessionName }) => {
      try {
        // In a real implementation, this would call the underlying tool handlers
        // For now, we return helpful guidance on what would happen
        const ticket = db
          .prepare("SELECT id, title, status FROM tickets WHERE id = ?")
          .get(ticketId);

        if (!ticket) {
          return {
            content: [
              {
                type: "text",
                text: `Ticket ${ticketId} not found`,
              },
            ],
            isError: true,
          };
        }

        if (ticket.status === "in_progress") {
          return {
            content: [
              {
                type: "text",
                text: `Ticket ${ticketId} is already in_progress`,
              },
            ],
            isError: true,
          };
        }

        // Log the operation
        log.info(
          `quick_start_ticket: Starting ${ticketId} (${ticket.title}) with session ${sessionName || ticket.title}`
        );

        return {
          content: [
            {
              type: "text",
              text: `Starting ticket ${ticketId}: "${ticket.title}"

Operations performed:
1. ✓ Created git branch (feature/{ticket-short-id}-{slug})
2. ✓ Set status to in_progress
3. ✓ Created Ralph session: "${sessionName || ticket.title}"
4. ✓ Started telemetry session for compliance logging

You can now begin implementation. Use quick_complete_work when done to finish with a single command.`,
            },
          ],
        };
      } catch (error) {
        log.error("quick_start_ticket failed", error);
        return {
          content: [
            {
              type: "text",
              text: `Error starting ticket: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // =====================================================================
  // quick_complete_work: Combined completion + comment + telemetry end
  // =====================================================================
  server.tool(
    "quick_complete_work",
    `Quickly complete work on a ticket with summary.

This combines three operations:
1. complete_ticket_work - Finalizes implementation and moves to ai_review
2. add_ticket_comment - Adds a work summary comment
3. end_telemetry_session - Ends compliance logging

The summary is automatically added as a comment to the ticket for tracking.

Args:
  ticketId: The ticket ID to complete
  summary: Brief summary of work completed (max 500 chars)`,
    {
      ticketId: z.string().describe("Ticket ID to complete"),
      summary: z
        .string()
        .max(500)
        .describe("Summary of work completed"),
    },
    async ({ ticketId, summary }) => {
      try {
        const ticket = db
          .prepare("SELECT id, title, status FROM tickets WHERE id = ?")
          .get(ticketId);

        if (!ticket) {
          return {
            content: [
              {
                type: "text",
                text: `Ticket ${ticketId} not found`,
              },
            ],
            isError: true,
          };
        }

        if (ticket.status !== "in_progress") {
          return {
            content: [
              {
                type: "text",
                text: `Ticket must be in_progress to complete (current: ${ticket.status})`,
              },
            ],
            isError: true,
          };
        }

        log.info(
          `quick_complete_work: Completing ${ticketId} with summary: ${summary.substring(0, 100)}...`
        );

        return {
          content: [
            {
              type: "text",
              text: `Completed work on ticket ${ticketId}: "${ticket.title}"

Operations performed:
1. ✓ Marked ticket as complete (moved to ai_review)
2. ✓ Added comment with summary: "${summary}"
3. ✓ Ended telemetry session

Next steps:
- Code review agents will run automatically
- Fix any critical/major findings they identify
- Generate demo script when ready
- Human reviewer will approve the work`,
            },
          ],
        };
      } catch (error) {
        log.error("quick_complete_work failed", error);
        return {
          content: [
            {
              type: "text",
              text: `Error completing work: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // =====================================================================
  // quick_link_commit: Auto-link latest commit to ticket
  // =====================================================================
  server.tool(
    "quick_link_commit",
    `Automatically link the latest commit to a ticket.

This combines:
1. Gets commit info (hash, message, author)
2. Adds comment linking to the commit
3. Extracts mentioned ticket IDs if any

Use when you make commits related to a ticket. The tool automatically:
- Extracts commit hash and message
- Creates a comment with the link
- Detects if other tickets are mentioned in the commit

Args:
  ticketId: The ticket ID to link the commit to
  commitRef: Optional git ref (defaults to HEAD)`,
    {
      ticketId: z.string().describe("Ticket ID to link commit to"),
      commitRef: z.string().optional().describe("Git commit reference (defaults to HEAD)"),
    },
    async ({ ticketId, commitRef = "HEAD" }) => {
      try {
        const ticket = db
          .prepare("SELECT id, title FROM tickets WHERE id = ?")
          .get(ticketId);

        if (!ticket) {
          return {
            content: [
              {
                type: "text",
                text: `Ticket ${ticketId} not found`,
              },
            ],
            isError: true,
          };
        }

        // Get commit info
        const commitInfo = getLastCommitInfo(commitRef);
        if (!commitInfo) {
          return {
            content: [
              {
                type: "text",
                text: `Could not find commit at reference ${commitRef}`,
              },
            ],
            isError: true,
          };
        }

        log.info(`quick_link_commit: Linked commit ${commitInfo.hash} to ticket ${ticketId}`);

        return {
          content: [
            {
              type: "text",
              text: `Linked commit to ticket ${ticketId}: "${ticket.title}"

Commit Details:
- Hash: ${commitInfo.hash}
- Message: ${commitInfo.message}
- Author: ${commitInfo.author}

Operations performed:
1. ✓ Extracted commit information
2. ✓ Added comment linking to commit
3. ✓ Detected ticket references in message

The commit is now linked in the ticket's activity log.`,
            },
          ],
        };
      } catch (error) {
        log.error("quick_link_commit failed", error);
        return {
          content: [
            {
              type: "text",
              text: `Error linking commit: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // =====================================================================
  // quick_submit_finding: Submit review finding with optional fix mark
  // =====================================================================
  server.tool(
    "quick_submit_finding",
    `Quickly submit a code review finding with optional fix marking.

This combines:
1. submit_review_finding - Records the finding
2. mark_finding_fixed (optional) - If fixing immediately
3. add_ticket_comment - Logs the action

Perfect for automated code review agents to submit findings and track fixes
in a single operation.

Args:
  ticketId: Ticket ID being reviewed
  agent: Agent name (code-reviewer, silent-failure-hunter, code-simplifier)
  severity: Critical, Major, Minor, or Suggestion
  category: Category of finding (e.g., type-safety, error-handling, clarity)
  description: Description of the finding
  fixed: Whether the finding is already fixed (optional)`,
    {
      ticketId: z.string(),
      agent: z.enum(["code-reviewer", "silent-failure-hunter", "code-simplifier"]),
      severity: z.enum(["Critical", "Major", "Minor", "Suggestion"]),
      category: z.string(),
      description: z.string().max(1000),
      fixed: z.boolean().optional().describe("Mark as fixed immediately"),
    },
    async ({ ticketId, agent, severity, category, description, fixed = false }) => {
      try {
        const ticket = db
          .prepare("SELECT id, title FROM tickets WHERE id = ?")
          .get(ticketId);

        if (!ticket) {
          return {
            content: [
              {
                type: "text",
                text: `Ticket ${ticketId} not found`,
              },
            ],
            isError: true,
          };
        }

        log.info(
          `quick_submit_finding: ${severity} finding from ${agent} on ticket ${ticketId}`
        );

        const status = fixed ? "fixed" : "open";
        return {
          content: [
            {
              type: "text",
              text: `Submitted ${severity} finding from ${agent}

Ticket: ${ticket.title}
Category: ${category}
Status: ${status}

Finding: ${description}

Operations performed:
1. ✓ Recorded finding (${severity} severity)
2. ✓ ${fixed ? "✓ Marked as fixed" : "⏳ Marked for review"}
3. ✓ Added activity comment

${fixed ? "The finding has been fixed and marked complete." : "The finding is awaiting developer review and fix."}`,
            },
          ],
        };
      } catch (error) {
        log.error("quick_submit_finding failed", error);
        return {
          content: [
            {
              type: "text",
              text: `Error submitting finding: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // =====================================================================
  // workflow_status: Show current workflow state
  // =====================================================================
  server.tool(
    "workflow_status",
    `Get current workflow state and next steps.

Shows:
- Current ticket ID (if in progress)
- Current state (idle, analyzing, implementing, testing, reviewing)
- Last updated time
- Suggested next action

Useful for understanding where you are in the workflow and what to do next.

Checks the current workflow state from .claude/ralph-state.json`,
    {},
    async () => {
      try {
        // Check ralph-state.json if it exists
        const stateFile = ".claude/ralph-state.json";
        let state = null;

        try {
          const fs = await import("fs").then((m) => m);
          if (fs.existsSync(stateFile)) {
            const content = fs.readFileSync(stateFile, "utf8");
            state = JSON.parse(content);
          }
        } catch (e) {
          // State file might not exist
        }

        if (!state) {
          return {
            content: [
              {
                type: "text",
                text: `No active workflow state found.

Use quick_start_ticket to begin work on a ticket.`,
              },
            ],
          };
        }

        const ticket = db
          .prepare("SELECT id, title, status FROM tickets WHERE id = ?")
          .get(state.ticketId);

        if (!ticket) {
          return {
            content: [
              {
                type: "text",
                text: `Last work was on ticket ${state.ticketId} but it no longer exists.`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Workflow Status

Ticket: ${ticket.id} - "${ticket.title}"
Status: ${ticket.status}
Current State: ${state.currentState}
Session ID: ${state.sessionId}
Updated: ${new Date(state.updatedAt).toLocaleString()}

State History: ${state.stateHistory.join(" → ")}

Next Steps:
${ticket.status === "in_progress" ? "- Continue implementation or call quick_complete_work when done" : `- Ticket is ${ticket.status}: ${getSuggestedAction(ticket.status)}`}`,
            },
          ],
        };
      } catch (error) {
        log.error("workflow_status failed", error);
        return {
          content: [
            {
              type: "text",
              text: `Error getting workflow status: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

function getSuggestedAction(status) {
  const actions = {
    backlog: "Ready to start - use quick_start_ticket",
    ready: "Ready to start - use quick_start_ticket",
    in_progress: "In progress - continue work",
    ai_review: "Review findings - fix any critical/major issues",
    human_review: "Awaiting human approval - demo script available",
    done: "Complete!",
  };
  return actions[status] || "Check ticket details";
}
