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

## Actions

### submit-finding
Submit a review finding for a ticket in ai_review status.
Required params: ticketId, agent, severity, category, description
Optional params: filePath, lineNumber, suggestedFix

### mark-fixed
Mark a review finding as fixed, won't fix, or duplicate.
Required params: findingId, fixStatus
Optional params: fixDescription

### get-findings
Get review findings for a ticket with optional filters.
Required params: ticketId
Optional params: findingStatus, severity, agent

### check-complete
Check if all critical/major findings have been resolved.
Required params: ticketId

### generate-demo
Generate a demo script for human review. Moves ticket to human_review.
Required params: ticketId, steps

### get-demo
Get the demo script for a ticket.
Required params: ticketId

### update-demo-step
Update a single demo step's status during human review.
Required params: demoScriptId, stepOrder, stepStatus
Optional params: stepNotes

### submit-feedback
Submit final demo feedback from human reviewer. Moves ticket to done if passed.
Required params: ticketId, passed, feedback
Optional params: stepResults

## Parameters
- action: (required) The operation to perform
- ticketId: Ticket ID. Required for: submit-finding, get-findings, check-complete, generate-demo, get-demo, submit-feedback
- agent: Review agent. Required for: submit-finding. Optional filter for: get-findings
- severity: Finding severity. Required for: submit-finding. Optional filter for: get-findings
- category: Finding category. Required for: submit-finding
- description: Finding description. Required for: submit-finding
- filePath: File path. Optional for: submit-finding
- lineNumber: Line number. Optional for: submit-finding
- suggestedFix: Suggested fix. Optional for: submit-finding
- findingId: Finding ID. Required for: mark-fixed
- fixStatus: Fix status. Required for: mark-fixed
- fixDescription: How it was fixed. Optional for: mark-fixed
- findingStatus: Finding status filter. Optional for: get-findings
- steps: Demo steps array. Required for: generate-demo
- demoScriptId: Demo script ID. Required for: update-demo-step
- stepOrder: Step order number. Required for: update-demo-step
- stepStatus: Step status. Required for: update-demo-step
- stepNotes: Reviewer notes. Optional for: update-demo-step
- passed: Whether demo passed. Required for: submit-feedback
- feedback: Reviewer feedback. Required for: submit-feedback
- stepResults: Step results array. Optional for: submit-feedback`,
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

            log.info(`Submitted ${severity} finding for ticket ${ticketId} by ${agent}`);
            return formatResult(finding, `Finding submitted (${severity})`);
          }

          case "mark-fixed": {
            const findingId = requireParam(params.findingId, "findingId", "mark-fixed");
            const fixStatus = requireParam(params.fixStatus, "fixStatus", "mark-fixed");

            const finding = markFixed(db, findingId, fixStatus as MarkFixedStatus);
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
            log.info(`Generated demo script for ticket ${ticketId} with ${steps.length} steps`);
            return formatResult(demo, "Demo script generated! Ticket moved to human_review.");
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
