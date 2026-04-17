/**
 * Consolidated review resource tool for Brain Dump MCP server.
 *
 * Merges 4 review-findings + 4 demo tools into 1 action-dispatched tool.
 * Business logic lives in core/review.ts.
 *
 * @module tools/review
 */
import { z } from "zod";
import { log } from "../lib/logging.js";
import { mcpError } from "../lib/mcp-response.ts";
import { requireParam, formatResult, formatEmpty } from "../lib/mcp-format.ts";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "better-sqlite3";
import { CoreError } from "../../core/errors.ts";
import {
  submitFinding,
  markFixed,
  getFindings,
  checkComplete,
  generateDemo,
  getDemo,
  updateDemoStep,
  submitFeedback,
} from "../../core/review.ts";
import type { MarkFixedStatus, DemoStepStatus } from "../../core/review.ts";
import type { FindingAgent, FindingSeverity, FindingStatus } from "../../core/types.ts";
import { addComment, type CommentAuthor } from "../../core/comment.ts";
import { detectAuthor } from "../lib/environment.js";
import { execFileNoThrow, syncPrVerificationChecklist } from "../../core/index.ts";

const SEVERITY_ICONS: Record<string, string> = {
  critical: "🔴",
  major: "🟠",
  minor: "🟡",
  suggestion: "💡",
};

const ACTIONS = [
  "submit-finding",
  "mark-fixed",
  "get-findings",
  "check-complete",
  "generate-demo",
  "get-demo",
  "update-demo-step",
  "submit-feedback",
] as const;

const AGENTS = ["code-reviewer", "silent-failure-hunter", "code-simplifier"] as const;
const SEVERITIES = ["critical", "major", "minor", "suggestion"] as const;
const FINDING_STATUSES = ["open", "fixed", "wont_fix", "duplicate"] as const;
const MARK_FIXED_STATUSES = ["fixed", "wont_fix", "duplicate"] as const;
const DEMO_STEP_STATUSES = ["pending", "passed", "failed", "skipped"] as const;
const DEMO_STEP_TYPES = ["manual", "visual", "automated"] as const;

/**
 * Register the consolidated review tool with the MCP server.
 */
export function registerReviewTool(server: McpServer, db: Database.Database): void {
  server.tool(
    "review",
    `Manage review findings and demo scripts in Brain Dump.

### submit-finding - Submit a review finding (ticket must be in ai_review)
### mark-fixed - Mark finding as fixed, wont_fix, or duplicate
### get-findings - Get findings for a ticket (filterable by status, severity, agent)
### check-complete - Check if all critical/major findings resolved (returns canProceedToHumanReview)
### generate-demo - Generate demo script for human review (moves ticket to human_review)
### get-demo - Get the demo script for a ticket
### update-demo-step - Update a demo step's status during human review
### submit-feedback - Submit final demo feedback from human reviewer (moves to done if passed)`,
    {
      action: z.enum(ACTIONS).describe("The operation to perform"),
      ticketId: z.string().optional().describe("Ticket ID"),
      agent: z.enum(AGENTS).optional().describe("Review agent"),
      severity: z.enum(SEVERITIES).optional().describe("Finding severity"),
      category: z.string().optional().describe("Finding category"),
      description: z.string().optional().describe("Finding description"),
      filePath: z.string().optional().describe("File path"),
      lineNumber: z.number().optional().describe("Line number"),
      suggestedFix: z.string().optional().describe("Suggested fix"),
      findingId: z.string().optional().describe("Finding ID"),
      fixStatus: z.enum(MARK_FIXED_STATUSES).optional().describe("Fix status"),
      fixDescription: z.string().optional().describe("How it was fixed"),
      findingStatus: z.enum(FINDING_STATUSES).optional().describe("Finding status filter"),
      steps: z
        .array(
          z.object({
            order: z.number(),
            description: z.string(),
            expectedOutcome: z.string(),
            type: z.enum(DEMO_STEP_TYPES),
          })
        )
        .optional()
        .describe("Demo steps"),
      demoScriptId: z.string().optional().describe("Demo script ID"),
      stepOrder: z.number().optional().describe("Step order number"),
      stepStatus: z.enum(DEMO_STEP_STATUSES).optional().describe("Step status"),
      stepNotes: z.string().optional().describe("Reviewer notes"),
      passed: z.boolean().optional().describe("Whether demo passed"),
      feedback: z.string().optional().describe("Reviewer feedback"),
      stepResults: z
        .array(
          z.object({
            order: z.number(),
            passed: z.boolean(),
            notes: z.string().optional(),
          })
        )
        .optional()
        .describe("Step results"),
    },
    async (params: {
      action: (typeof ACTIONS)[number];
      ticketId?: string | undefined;
      agent?: (typeof AGENTS)[number] | undefined;
      severity?: (typeof SEVERITIES)[number] | undefined;
      category?: string | undefined;
      description?: string | undefined;
      filePath?: string | undefined;
      lineNumber?: number | undefined;
      suggestedFix?: string | undefined;
      findingId?: string | undefined;
      fixStatus?: (typeof MARK_FIXED_STATUSES)[number] | undefined;
      fixDescription?: string | undefined;
      findingStatus?: (typeof FINDING_STATUSES)[number] | undefined;
      steps?:
        | Array<{
            order: number;
            description: string;
            expectedOutcome: string;
            type: (typeof DEMO_STEP_TYPES)[number];
          }>
        | undefined;
      demoScriptId?: string | undefined;
      stepOrder?: number | undefined;
      stepStatus?: (typeof DEMO_STEP_STATUSES)[number] | undefined;
      stepNotes?: string | undefined;
      passed?: boolean | undefined;
      feedback?: string | undefined;
      stepResults?:
        | Array<{ order: number; passed: boolean; notes?: string | undefined }>
        | undefined;
    }) => {
      try {
        switch (params.action) {
          case "submit-finding": {
            const ticketId = requireParam(params.ticketId, "ticketId", "submit-finding");
            const agent = requireParam(params.agent, "agent", "submit-finding");
            const severity = requireParam(params.severity, "severity", "submit-finding");
            const category = requireParam(params.category, "category", "submit-finding");
            const description = requireParam(params.description, "description", "submit-finding");

            const finding = submitFinding(db, {
              ticketId,
              agent: agent as FindingAgent,
              severity: severity as FindingSeverity,
              category,
              description,
              ...(params.filePath !== undefined ? { filePath: params.filePath } : {}),
              ...(params.lineNumber !== undefined ? { lineNumber: params.lineNumber } : {}),
              ...(params.suggestedFix !== undefined ? { suggestedFix: params.suggestedFix } : {}),
            });

            // Add audit comment to ticket
            const icon = SEVERITY_ICONS[severity] ?? "📋";
            let commentContent = `Review finding: ${icon} [${severity}] ${category}\n\n${description}`;
            if (params.filePath) {
              commentContent += `\n\nFile: ${params.filePath}`;
              if (params.lineNumber) commentContent += `:${params.lineNumber}`;
            }
            if (params.suggestedFix) {
              commentContent += `\n\nSuggested fix:\n${params.suggestedFix}`;
            }
            if (finding.epicReviewRunId) {
              commentContent += `\n\nEpic review run: ${finding.epicReviewRunId}`;
            }
            addComment(db, {
              ticketId,
              content: commentContent,
              author: detectAuthor() as CommentAuthor,
              type: "progress",
            });

            log.info(`Submitted ${severity} finding for ticket ${ticketId} by ${agent}`);
            return formatResult(finding, `Finding submitted (${severity})`);
          }

          case "mark-fixed": {
            const findingId = requireParam(params.findingId, "findingId", "mark-fixed");
            const fixStatus = requireParam(params.fixStatus, "fixStatus", "mark-fixed");

            const finding = markFixed(db, findingId, fixStatus as MarkFixedStatus);

            // Add audit comment to ticket
            const statusLabel =
              fixStatus === "fixed"
                ? "✅ Finding marked as fixed"
                : fixStatus === "wont_fix"
                  ? "⚠️ Finding marked as won't fix"
                  : "↔️ Finding marked as duplicate";
            let fixComment = `${statusLabel}\nCategory: ${finding.category}\nSeverity: ${finding.severity}`;
            if (params.fixDescription) {
              fixComment += `\n\nFix description:\n${params.fixDescription}`;
            }
            if (finding.epicReviewRunId) {
              fixComment += `\n\nEpic review run: ${finding.epicReviewRunId}`;
            }
            addComment(db, {
              ticketId: finding.ticketId,
              content: fixComment,
              author: detectAuthor() as CommentAuthor,
              type: "progress",
            });

            log.info(`Marked finding ${findingId} as ${fixStatus}`);
            return formatResult(finding, `Finding marked as ${fixStatus}`);
          }

          case "get-findings": {
            const ticketId = requireParam(params.ticketId, "ticketId", "get-findings");

            const findings = getFindings(db, ticketId, {
              ...(params.findingStatus !== undefined
                ? { status: params.findingStatus as FindingStatus }
                : {}),
              ...(params.severity !== undefined
                ? { severity: params.severity as FindingSeverity }
                : {}),
              ...(params.agent !== undefined ? { agent: params.agent as FindingAgent } : {}),
            });

            if (findings.length === 0) {
              return formatEmpty("review findings", {
                status: params.findingStatus,
                severity: params.severity,
                agent: params.agent,
              });
            }
            return formatResult(findings, `Found ${findings.length} finding(s)`);
          }

          case "check-complete": {
            const ticketId = requireParam(params.ticketId, "ticketId", "check-complete");
            const result = checkComplete(db, ticketId);
            return formatResult(result);
          }

          case "generate-demo": {
            const ticketId = requireParam(params.ticketId, "ticketId", "generate-demo");
            const steps = requireParam(params.steps, "steps", "generate-demo");

            const demo = generateDemo(db, { ticketId, steps });
            let syncNote = "PR checklist sync skipped: no linked PR found for this ticket.";

            const syncResult = await syncPrVerificationChecklist(
              { ticketId },
              {
                db,
                execFileNoThrow,
              }
            );

            if (syncResult.success) {
              syncNote = syncResult.message;
            } else {
              syncNote = `PR checklist sync warning: ${syncResult.error}`;
              log.warn(
                `PR checklist sync failed for ticket ${ticketId}`,
                new Error(syncResult.error)
              );
            }

            // Add audit comment to ticket
            addComment(db, {
              ticketId,
              content: `Demo script generated with ${steps.length} steps. Ticket is now ready for human review.${demo.epicReviewRunId ? `\n\nEpic review run: ${demo.epicReviewRunId}` : ""}`,
              author: detectAuthor() as CommentAuthor,
              type: "progress",
            });

            log.info(`Generated demo script for ticket ${ticketId} with ${steps.length} steps`);
            return formatResult(
              demo,
              `Demo script generated! Ticket moved to human_review.\n\n${syncNote}`
            );
          }

          case "get-demo": {
            const ticketId = requireParam(params.ticketId, "ticketId", "get-demo");
            const demo = getDemo(db, ticketId);

            if (!demo) {
              return formatEmpty("demo script for this ticket");
            }
            return formatResult(demo);
          }

          case "update-demo-step": {
            const demoScriptId = requireParam(
              params.demoScriptId,
              "demoScriptId",
              "update-demo-step"
            );
            const stepOrder = requireParam(params.stepOrder, "stepOrder", "update-demo-step");
            const stepStatus = requireParam(params.stepStatus, "stepStatus", "update-demo-step");

            const demo = updateDemoStep(
              db,
              demoScriptId,
              stepOrder,
              stepStatus as DemoStepStatus,
              params.stepNotes
            );
            log.info(`Updated demo step ${stepOrder} to ${stepStatus}`);
            return formatResult(demo, `Step ${stepOrder} updated to ${stepStatus}`);
          }

          case "submit-feedback": {
            const ticketId = requireParam(params.ticketId, "ticketId", "submit-feedback");
            const passed = requireParam(params.passed, "passed", "submit-feedback");
            const feedback = requireParam(params.feedback, "feedback", "submit-feedback");

            const result = submitFeedback(db, {
              ticketId,
              passed,
              feedback,
              ...(params.stepResults !== undefined
                ? {
                    stepResults: params.stepResults.map((sr) => ({
                      order: sr.order,
                      passed: sr.passed,
                      ...(sr.notes !== undefined ? { notes: sr.notes } : {}),
                    })),
                  }
                : {}),
            });

            log.info(`Demo feedback for ${ticketId}: ${passed ? "PASSED" : "REJECTED"}`);
            return formatResult(
              result,
              passed
                ? "Demo approved! Ticket moved to done."
                : "Demo rejected. Ticket remains in human_review."
            );
          }
        }
      } catch (err) {
        if (err instanceof CoreError) {
          log.error(`review/${params.action} failed: ${err.message}`);
        }
        return mcpError(err);
      }
    }
  );
}
