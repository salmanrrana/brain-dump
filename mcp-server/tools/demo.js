/**
 * Demo script tools for Brain Dump MCP server.
 * Handles generating demo scripts and capturing human feedback during review.
 * @module tools/demo
 */
import { z } from "zod";
import { randomUUID } from "crypto";
import { log } from "../lib/logging.js";

/**
 * Register demo script tools with the MCP server.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {import("better-sqlite3").Database} db
 */
export function registerDemoTools(server, db) {
  // Generate demo script
  server.tool(
    "generate_demo_script",
    `Generate a demo script for human review.

Validates that ticket is in ai_review status and all critical/major findings are fixed.
Creates demo script and transitions ticket to human_review status.

Args:
  ticketId: Ticket ID
  steps: Array of demo steps with order, description, expectedOutcome, and type

Returns demo script ID.`,
    {
      ticketId: z.string().describe("Ticket ID"),
      steps: z.array(
        z.object({
          order: z.number().describe("Step order"),
          description: z.string().describe("What to do"),
          expectedOutcome: z.string().describe("What should happen"),
          type: z.enum(["manual", "visual", "automated"]).describe("How to verify"),
        })
      ).describe("Demo steps"),
    },
    async ({ ticketId, steps }) => {
      const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
      if (!ticket) {
        return {
          content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
          isError: true,
        };
      }

      if (ticket.status !== "ai_review") {
        return {
          content: [{ type: "text", text: `Ticket must be in ai_review status to generate demo.\nCurrent status: ${ticket.status}` }],
          isError: true,
        };
      }

      // Check if all critical/major findings are fixed
      const findings = db.prepare("SELECT * FROM review_findings WHERE ticket_id = ?").all(ticketId);
      const openCritical = findings.filter(f => f.severity === "critical" && f.status === "open").length;
      const openMajor = findings.filter(f => f.severity === "major" && f.status === "open").length;

      if (openCritical > 0 || openMajor > 0) {
        return {
          content: [{
            type: "text",
            text: `Cannot generate demo - unresolved findings:\nOpen critical: ${openCritical}\nOpen major: ${openMajor}\n\nFix all critical and major findings before generating demo.`,
          }],
          isError: true,
        };
      }

      // Create demo script
      const id = randomUUID();
      const now = new Date().toISOString();
      const stepsJson = JSON.stringify(steps);

      db.prepare(
        `INSERT INTO demo_scripts (id, ticket_id, steps, generated_at)
         VALUES (?, ?, ?, ?)`
      ).run(id, ticketId, stepsJson, now);

      // Update workflow state
      db.prepare(
        `UPDATE ticket_workflow_state SET demo_generated = 1, updated_at = ? WHERE ticket_id = ?`
      ).run(now, ticketId);

      // Transition ticket to human_review
      db.prepare(
        "UPDATE tickets SET status = 'human_review', updated_at = ? WHERE id = ?"
      ).run(now, ticketId);

      // Create progress comment (per spec: mandatory audit trail)
      const commentId = randomUUID();
      db.prepare(
        `INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at)
         VALUES (?, ?, ?, 'claude', 'progress', ?)`
      ).run(
        commentId,
        ticketId,
        `Demo script generated with ${steps.length} steps. Ticket is now ready for human review.`,
        now
      );

      log.info(`Demo script created for ticket ${ticketId} with ${steps.length} steps`);

      return {
        content: [{
          type: "text",
          text: `Demo script created successfully!\n\nDemo ID: ${id}\nSteps: ${steps.length}\nStatus: human_review\n\nThe ticket is now ready for human review.`,
        }],
      };
    }
  );

  // Get demo script
  server.tool(
    "get_demo_script",
    `Get the demo script for a ticket.

Args:
  ticketId: Ticket ID

Returns demo script with steps and feedback if available.`,
    {
      ticketId: z.string().describe("Ticket ID"),
    },
    async ({ ticketId }) => {
      const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
      if (!ticket) {
        return {
          content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
          isError: true,
        };
      }

      const demo = db.prepare("SELECT * FROM demo_scripts WHERE ticket_id = ?").get(ticketId);
      if (!demo) {
        return {
          content: [{ type: "text", text: `No demo script found for ticket ${ticketId}` }],
          isError: true,
        };
      }

      const steps = JSON.parse(demo.steps || "[]");
      const result = {
        id: demo.id,
        ticketId: demo.ticket_id,
        steps,
        generatedAt: demo.generated_at,
        completedAt: demo.completed_at,
        feedback: demo.feedback,
        passed: demo.passed,
      };

      return {
        content: [{
          type: "text",
          text: `Demo script found:\n\n${JSON.stringify(result, null, 2)}`,
        }],
      };
    }
  );

  // Update demo step
  server.tool(
    "update_demo_step",
    `Update a single demo step's status during human review.

Args:
  demoScriptId: Demo script ID
  stepOrder: Step order number
  status: Step status ('pending', 'passed', 'failed', 'skipped')
  notes: Optional reviewer notes

Returns updated demo script.`,
    {
      demoScriptId: z.string().describe("Demo script ID"),
      stepOrder: z.number().describe("Step order"),
      status: z.enum(["pending", "passed", "failed", "skipped"]).describe("Step status"),
      notes: z.string().optional().describe("Reviewer notes"),
    },
    async ({ demoScriptId, stepOrder, status, notes }) => {
      const demo = db.prepare("SELECT * FROM demo_scripts WHERE id = ?").get(demoScriptId);
      if (!demo) {
        return {
          content: [{ type: "text", text: `Demo script not found: ${demoScriptId}` }],
          isError: true,
        };
      }

      // Update steps JSON
      const steps = JSON.parse(demo.steps || "[]");
      const step = steps.find(s => s.order === stepOrder);
      if (!step) {
        return {
          content: [{ type: "text", text: `Step ${stepOrder} not found in demo script` }],
          isError: true,
        };
      }

      step.status = status;
      if (notes) {
        step.notes = notes;
      }

      const now = new Date().toISOString();
      db.prepare(
        "UPDATE demo_scripts SET steps = ?, updated_at = ? WHERE id = ?"
      ).run(JSON.stringify(steps), now, demoScriptId);

      log.info(`Demo step ${stepOrder} updated to ${status} in demo ${demoScriptId}`);

      return {
        content: [{
          type: "text",
          text: `Step ${stepOrder} marked as ${status}.\n\nUpdated at: ${now}`,
        }],
      };
    }
  );

  // Submit demo feedback
  server.tool(
    "submit_demo_feedback",
    `Submit final demo feedback from human reviewer.

Updates demo script with feedback and completion status.
Transitions ticket to 'done' if passed, or keeps in 'human_review' if failed.

Args:
  ticketId: Ticket ID
  passed: Whether demo was approved (true) or rejected (false)
  feedback: Reviewer feedback
  stepResults: Optional array of step results

Returns updated ticket status.`,
    {
      ticketId: z.string().describe("Ticket ID"),
      passed: z.boolean().describe("Whether demo was approved"),
      feedback: z.string().describe("Reviewer feedback"),
      stepResults: z.array(
        z.object({
          order: z.number(),
          passed: z.boolean(),
          notes: z.string().optional(),
        })
      ).optional().describe("Step results"),
    },
    async ({ ticketId, passed, feedback, stepResults }) => {
      const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
      if (!ticket) {
        return {
          content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
          isError: true,
        };
      }

      if (ticket.status !== "human_review") {
        return {
          content: [{ type: "text", text: `Ticket must be in human_review status to submit feedback.\nCurrent status: ${ticket.status}` }],
          isError: true,
        };
      }

      const demo = db.prepare("SELECT * FROM demo_scripts WHERE ticket_id = ?").get(ticketId);
      if (!demo) {
        return {
          content: [{ type: "text", text: `No demo script found for this ticket` }],
          isError: true,
        };
      }

      const now = new Date().toISOString();

      // Update demo script
      db.prepare(
        `UPDATE demo_scripts SET feedback = ?, passed = ?, completed_at = ? WHERE ticket_id = ?`
      ).run(feedback, passed ? 1 : 0, now, ticketId);

      // Update demo steps if results provided
      if (stepResults && stepResults.length > 0) {
        const steps = JSON.parse(demo.steps || "[]");
        for (const result of stepResults) {
          const step = steps.find(s => s.order === result.order);
          if (step) {
            step.status = result.passed ? "passed" : "failed";
            if (result.notes) {
              step.notes = result.notes;
            }
          }
        }
        db.prepare(
          "UPDATE demo_scripts SET steps = ? WHERE ticket_id = ?"
        ).run(JSON.stringify(steps), ticketId);
      }

      let newStatus = "human_review";
      let commentContent = "";
      let workflowStateWarning = "";

      if (passed) {
        // Mark ticket as done
        newStatus = "done";
        db.prepare(
          "UPDATE tickets SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?"
        ).run(now, now, ticketId);

        // Update workflow state to done phase
        // Wrapped in try-catch: workflow state is for tracking, not critical to ticket completion
        try {
          db.prepare(
            "UPDATE ticket_workflow_state SET current_phase = 'done', updated_at = ? WHERE ticket_id = ?"
          ).run(now, ticketId);
          log.info(`Ticket ${ticketId} workflow state updated to done`);
        } catch (stateErr) {
          log.error(`Failed to update workflow state to done for ticket ${ticketId}: ${stateErr.message}`, { ticketId });
          workflowStateWarning = `\n\n**Warning:** Workflow state tracking failed but ticket is marked done.`;
        }

        commentContent = `✅ Demo Approved!\n\nFeedback: ${feedback}\n\nTicket is now complete.`;
      } else {
        // Keep in human_review but reset demo_generated flag for re-demo after fixes
        // The ticket stays in human_review so user can address issues and request new demo
        // Wrapped in try-catch: workflow state is for tracking, not critical
        try {
          db.prepare(
            "UPDATE ticket_workflow_state SET demo_generated = 0, updated_at = ? WHERE ticket_id = ?"
          ).run(now, ticketId);
          log.info(`Ticket ${ticketId} demo rejected, demo_generated reset for re-demo`);
        } catch (stateErr) {
          log.error(`Failed to reset demo_generated for ticket ${ticketId}: ${stateErr.message}`, { ticketId });
          workflowStateWarning = `\n\n**Warning:** Workflow state tracking failed. Demo regeneration may be blocked.`;
        }

        commentContent = `❌ Demo Rejected\n\nFeedback: ${feedback}\n\nPlease address the issues and resubmit.`;
      }

      // Create comment
      const commentId = randomUUID();
      db.prepare(
        `INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at)
         VALUES (?, ?, ?, 'user', 'comment', ?)`
      ).run(commentId, ticketId, commentContent, now);

      log.info(`Demo feedback submitted for ticket ${ticketId}: ${passed ? "approved" : "rejected"}`);

      return {
        content: [{
          type: "text",
          text: `Demo feedback submitted.\n\nResult: ${passed ? "✅ APPROVED" : "❌ REJECTED"}\nTicket status: ${newStatus}${workflowStateWarning}`,
        }],
      };
    }
  );
}
