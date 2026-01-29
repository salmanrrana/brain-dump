/**
 * Workflow shortcut tools for Brain Dump MCP server.
 * Composite tools that combine common operations to reduce tool count and improve UX.
 *
 * These shortcuts demonstrate the concept of composite tools that combine multiple
 * common operations into single user-facing tools, reducing overall tool count while
 * maintaining full functionality.
 *
 * NOTE: These are demonstration/stub tools that show what WOULD happen if executed.
 * Full implementation would integrate with actual tool handlers from workflow.ts, etc.
 *
 * @module tools/shortcuts
 */
import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { log } from "../lib/logging.js";

/**
 * Helper to return error response
 */
function errorResponse(text: string) {
  return {
    content: [{ type: "text", text }],
    isError: true,
  };
}

/**
 * Helper to return success response
 */
function successResponse(text: string) {
  return {
    content: [{ type: "text", text }],
  };
}

/**
 * Register shortcut tools with the MCP server.
 */
export function registerShortcutTools(server: any, db: any) {
  // =====================================================================
  // quick_start_ticket: Combined start + telemetry + session creation
  // =====================================================================
  server.tool(
    "quick_start_ticket",
    `Start work on a ticket with automatic session creation.
Combines: start_ticket_work + create_ralph_session + start_telemetry_session`,
    {
      ticketId: z.string().describe("Ticket ID to start working on"),
      sessionName: z
        .string()
        .optional()
        .describe("Optional name for work session (defaults to ticket title)"),
    },
    async ({ ticketId, sessionName }: { ticketId: string; sessionName?: string }) => {
      try {
        const ticket = db
          .prepare("SELECT id, title, status FROM tickets WHERE id = ?")
          .get(ticketId);

        if (!ticket) {
          return errorResponse(`Ticket ${ticketId} not found`);
        }

        if (ticket.status === "in_progress") {
          return errorResponse(`Ticket ${ticketId} is already in_progress`);
        }

        log.info(
          `quick_start_ticket: Starting ${ticketId} (${ticket.title}) with session ${sessionName || ticket.title}`
        );

        return successResponse(`Started work on ticket ${ticketId}: "${ticket.title}"

This shortcut demonstrates combining these operations:
1. Create git branch (feature/{ticket-short-id}-{slug})
2. Set status to in_progress
3. Create Ralph session: "${sessionName || ticket.title}"
4. Start telemetry session for compliance logging

NOTE: This is a demonstration tool showing the concept of composite shortcuts.
Full implementation would execute these operations through the actual tool handlers.

Next: Use quick_complete_work to finish when done.`);
      } catch (error: unknown) {
        log.error("quick_start_ticket failed", error);
        return errorResponse(
          `Error starting ticket: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // =====================================================================
  // quick_complete_work: Combined completion + comment + telemetry end
  // =====================================================================
  server.tool(
    "quick_complete_work",
    `Complete work on a ticket with automatic summary comment.
Combines: complete_ticket_work + add_ticket_comment + end_telemetry_session`,
    {
      ticketId: z.string().describe("Ticket ID to complete"),
      summary: z
        .string()
        .max(500)
        .describe("Brief summary of work completed"),
    },
    async ({ ticketId, summary }: { ticketId: string; summary: string }) => {
      try {
        const ticket = db
          .prepare("SELECT id, title, status FROM tickets WHERE id = ?")
          .get(ticketId);

        if (!ticket) {
          return errorResponse(`Ticket ${ticketId} not found`);
        }

        if (ticket.status !== "in_progress") {
          return errorResponse(
            `Ticket must be in_progress to complete (current: ${ticket.status})`
          );
        }

        log.info(
          `quick_complete_work: Completing ${ticketId} with summary: ${summary.substring(0, 100)}...`
        );

        return successResponse(`Completed work on ticket ${ticketId}: "${ticket.title}"

Summary: ${summary}

This shortcut demonstrates combining:
1. Mark ticket as complete (moves to ai_review)
2. Add comment with work summary
3. End telemetry session

NOTE: This is a demonstration tool. Full implementation would execute these
operations and move the ticket through the quality review workflow.

Next: Code review agents will run automatically to validate the implementation.`);
      } catch (error: unknown) {
        log.error("quick_complete_work failed", error);
        return errorResponse(
          `Error completing work: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // =====================================================================
  // quick_submit_finding: Submit review finding with optional fix mark
  // =====================================================================
  server.tool(
    "quick_submit_finding",
    `Submit code review finding with optional fix marking.
Combines: submit_review_finding + mark_finding_fixed (optional) + logging`,
    {
      ticketId: z.string().describe("Ticket ID being reviewed"),
      agent: z
        .enum(["code-reviewer", "silent-failure-hunter", "code-simplifier"])
        .describe("Review agent name"),
      severity: z
        .enum(["Critical", "Major", "Minor", "Suggestion"])
        .describe("Severity level of finding"),
      category: z.string().describe("Category of finding (e.g., type-safety, error-handling)"),
      description: z.string().max(1000).describe("Description of the finding"),
      fixed: z
        .boolean()
        .optional()
        .describe("Mark as fixed immediately"),
    },
    async ({
      ticketId,
      agent,
      severity,
      category,
      description,
      fixed = false,
    }: {
      ticketId: string;
      agent: "code-reviewer" | "silent-failure-hunter" | "code-simplifier";
      severity: "Critical" | "Major" | "Minor" | "Suggestion";
      category: string;
      description: string;
      fixed?: boolean;
    }) => {
      try {
        const ticket = db
          .prepare("SELECT id, title FROM tickets WHERE id = ?")
          .get(ticketId);

        if (!ticket) {
          return errorResponse(`Ticket ${ticketId} not found`);
        }

        log.info(
          `quick_submit_finding: ${severity} finding from ${agent} on ticket ${ticketId}`
        );

        const status = fixed ? "fixed" : "open";
        return successResponse(`Submitted ${severity} finding from ${agent}

Ticket: ${ticket.title}
Category: ${category}
Status: ${status}

Finding: ${description}

This shortcut demonstrates:
1. Record finding (${severity} severity)
2. ${fixed ? "Mark as fixed" : "Mark for developer review"}
3. Add activity comment

${fixed ? "The finding has been fixed and marked complete." : "The finding is awaiting developer review and fix."}`);
      } catch (error: unknown) {
        log.error("quick_submit_finding failed", error);
        return errorResponse(
          `Error submitting finding: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // =====================================================================
  // workflow_status: Show current workflow state and next steps
  // =====================================================================
  server.tool(
    "workflow_status",
    `Get current workflow state and next steps.
Shows ticket status, current state, session info, and recommended next action.`,
    {},
    async () => {
      try {
        const stateFile = ".claude/ralph-state.json";
        let state: any = null;

        // Try to load state file with proper error handling
        if (existsSync(stateFile)) {
          try {
            const content = readFileSync(stateFile, "utf8");
            state = JSON.parse(content);
            log.debug(`Loaded workflow state from ${stateFile}`);
          } catch (parseError: unknown) {
            log.warn(
              `State file is malformed (invalid JSON at ${stateFile})`,
              parseError
            );
            return errorResponse(
              `State file is corrupted: ${stateFile}\n\nYour workflow state JSON is invalid. Try: rm ${stateFile} to reset.`
            );
          }
        }

        if (!state) {
          return successResponse(
            `No active workflow state found.

Use quick_start_ticket to begin work on a ticket.`
          );
        }

        const ticket = db
          .prepare("SELECT id, title, status FROM tickets WHERE id = ?")
          .get(state.ticketId);

        if (!ticket) {
          return successResponse(
            `Last work was on ticket ${state.ticketId} but it no longer exists.`
          );
        }

        const stateHistory = Array.isArray(state.stateHistory)
          ? state.stateHistory.join(" → ")
          : "(history unavailable)";

        return successResponse(`Workflow Status

Ticket: ${ticket.id} - "${ticket.title}"
Status: ${ticket.status}
Current State: ${state.currentState || "(unknown)"}
Session ID: ${state.sessionId || "(unknown)"}
Updated: ${state.updatedAt ? new Date(state.updatedAt).toLocaleString() : "(unknown)"}

State History: ${stateHistory}

Next Steps:
${ticket.status === "in_progress" ? "- Continue implementation or call quick_complete_work when done" : `- Ticket is ${ticket.status}: ${getSuggestedAction(ticket.status)}`}`);
      } catch (error: unknown) {
        log.error("workflow_status failed", error);
        return errorResponse(
          `Error getting workflow status: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}

function getSuggestedAction(status: string): string {
  const actions: Record<string, string> = {
    backlog: "Ready to start - use quick_start_ticket",
    ready: "Ready to start - use quick_start_ticket",
    in_progress: "In progress - continue work",
    ai_review: "Review findings - fix any critical/major issues",
    human_review: "Awaiting human approval - demo script available",
    done: "Complete!",
  };
  return actions[status] || "Check ticket details";
}
