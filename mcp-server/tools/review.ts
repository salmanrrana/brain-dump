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
  validateGenerateDemo,
  generateDemo,
  getDemo,
  DEMO_COMMAND_MAX_TIMEOUT_MS,
  validateRepairLegacyHumanReviewHandoff,
  repairLegacyHumanReviewHandoff,
} from "../../core/review.ts";
import { listVerificationRuns } from "../../core/verification.ts";
import { getVerificationJob } from "../../core/verification-queue.ts";
import {
  resolveBrainDumpRootFrom,
  spawnDetachedVerificationDrain,
} from "../../core/verification-worker.ts";
import type { MarkFixedStatus } from "../../core/review.ts";
import type { DemoStep, FindingAgent, FindingSeverity, FindingStatus } from "../../core/types.ts";
import { addComment, type CommentAuthor } from "../../core/comment.ts";
import { detectAuthor } from "../lib/environment.js";
import { execFileNoThrow, syncPrVerificationChecklist } from "../../core/index.ts";
import { updatePrdForDbTicketIfPresent } from "../../core/prd-sync.ts";
import { WORKFLOW_SCHEMA_VERSION } from "../../core/workflow-schema.ts";

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
  "get-verification-history",
  "get-verification-job",
  "repair-legacy-handoff",
] as const;

const SEVERITIES = ["critical", "major", "minor", "suggestion"] as const;
const FINDING_STATUSES = ["open", "fixed", "wont_fix", "duplicate"] as const;
const MARK_FIXED_STATUSES = ["fixed", "wont_fix", "duplicate"] as const;
const DEMO_STEP_TYPES = ["manual", "visual", "automated"] as const;
const DEFINED_UNKNOWN_SCHEMA = z.unknown().refine((value) => value !== undefined, {
  message: "Expected value is required.",
});
const DEMO_APP_BOOT_SCHEMA = z.object({
  start: z.array(z.string()),
  cwd: z.string().optional(),
});

const DEMO_STEP_AUTOMATION_SCHEMA = z.union([
  z.object({
    kind: z.literal("ui"),
    route: z.string(),
    actions: z
      .array(
        z.object({
          act: z.enum(["click", "fill", "press", "waitFor"]),
          selector: z.string().optional(),
          value: z.string().optional(),
        })
      )
      .optional(),
    assert: z.array(
      z.object({
        type: z.enum(["visible", "text", "url"]),
        selector: z.string().optional(),
        expected: z.string().optional(),
      })
    ),
    screenshot: z.literal(true),
  }),
  z.object({
    kind: z.literal("api"),
    request: z.object({
      method: z.string(),
      path: z.string(),
      headers: z.record(z.string()).optional(),
      body: z.unknown().optional(),
    }),
    assert: z.array(
      z.object({
        type: z.enum(["status", "jsonPath", "bodyContains"]),
        expected: DEFINED_UNKNOWN_SCHEMA,
      })
    ),
  }),
  z.object({
    kind: z.literal("command"),
    command: z.object({
      argv: z.array(z.string()),
      cwd: z.string().optional(),
      timeoutMs: z.number().int().positive().max(DEMO_COMMAND_MAX_TIMEOUT_MS),
      expectedExitCode: z.number(),
    }),
    assert: z.array(
      z.object({
        type: z.enum([
          "stdoutContains",
          "stdoutNotContains",
          "stderrContains",
          "stderrNotContains",
        ]),
        expected: z.string(),
      })
    ),
  }),
  z.object({
    kind: z.literal("file"),
    path: z.string(),
    assert: z.array(
      z.union([
        z.object({ type: z.enum(["exists", "notExists"]) }),
        z.object({ type: z.enum(["contains", "notContains"]), expected: z.string() }),
        z.object({
          type: z.literal("jsonPath"),
          path: z.string(),
          expected: DEFINED_UNKNOWN_SCHEMA,
        }),
      ])
    ),
  }),
]);

type PrdSyncResult = ReturnType<typeof updatePrdForDbTicketIfPresent>;

function getReviewerAuthorOverride(): CommentAuthor | undefined {
  const author = process.env.BRAIN_DUMP_REVIEWER_AUTHOR?.trim();
  return author ? (author as CommentAuthor) : undefined;
}

function syncPrdPassMarker(
  db: Database.Database,
  ticketId: string,
  passes: boolean
): PrdSyncResult {
  const result = updatePrdForDbTicketIfPresent(db, ticketId, passes);
  if (result.required && !result.success) {
    log.warn(`PRD sync failed for ticket ${ticketId}`, new Error(result.message));
  }
  return result;
}

function formatPrdSyncNote(result: PrdSyncResult): string {
  return result.success ? result.message : `PRD sync warning: ${result.message}`;
}

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
### check-complete - Check if all critical/major findings resolved (returns canProceedToVerification)
### generate-demo - Generate demo script for AI verification (moves ticket to ai_verification). Steps must be visual/automated with executable UI, API, command, or file automation specs; manual steps are legacy read-only data and are rejected for new handoffs.
### get-demo - Get the demo script for a ticket
### get-verification-history - Read verification run history for a ticket
### get-verification-job - Read queued/running verification job state for a ticket
### repair-legacy-handoff - Repair a legacy human_review ticket to ai_verification (with demo) or ai_review (without demo)

Workflow schema: ${WORKFLOW_SCHEMA_VERSION}

No MCP action uploads evidence or marks verification passed. The verification runner owns evidence writes and ai_verification -> done.`,
    {
      action: z.enum(ACTIONS).describe("The operation to perform"),
      ticketId: z.string().optional().describe("Ticket ID"),
      agent: z.string().optional().describe("Review agent"),
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
            automation: DEMO_STEP_AUTOMATION_SCHEMA.optional(),
            app: DEMO_APP_BOOT_SCHEMA.optional(),
            covers: z.array(z.string()).optional(),
            coverageRationale: z.string().optional(),
          })
        )
        .optional()
        .describe(
          "Demo steps. Use executable automation and covers references (criterion:1, subtask:<id>) so every acceptance criterion is proven. API/UI steps for non-legacy projects require app.start argv selected from that project's docs/config, with {port}/{host} tokens and optional project-relative cwd. Use coverageRationale only for non-certifiable criteria; it must name criterion ids and keeps the run uncertified."
        ),
      demoScriptId: z.string().optional().describe("Demo script ID"),
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
      agent?: string | undefined;
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
      steps?: unknown[] | undefined;
      demoScriptId?: string | undefined;
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
            const reviewerAuthor = getReviewerAuthorOverride();
            const findingAgent = (reviewerAuthor ?? agent) as FindingAgent;

            const finding = submitFinding(db, {
              ticketId,
              agent: findingAgent,
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
              author: reviewerAuthor ?? (detectAuthor() as CommentAuthor),
              type: "progress",
            });

            log.info(`Submitted ${severity} finding for ticket ${ticketId} by ${findingAgent}`);
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
              author: getReviewerAuthorOverride() ?? (detectAuthor() as CommentAuthor),
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
            const steps = requireParam(params.steps, "steps", "generate-demo") as DemoStep[];

            const demoParams = { ticketId, steps };
            validateGenerateDemo(db, demoParams);
            const prdSync = syncPrdPassMarker(db, ticketId, false);
            if (prdSync.required && !prdSync.success) {
              throw new Error(`Cannot generate demo because PRD sync failed: ${prdSync.message}`);
            }

            const demo = generateDemo(db, demoParams);
            let syncNote = "PR checklist sync skipped: no linked PR found for this ticket.";
            const prdNote = formatPrdSyncNote(prdSync);

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
              content: `Demo script generated with ${steps.length} steps. Ticket is now ready for AI verification.${demo.epicReviewRunId ? `\n\nEpic review run: ${demo.epicReviewRunId}` : ""}`,
              author: getReviewerAuthorOverride() ?? (detectAuthor() as CommentAuthor),
              type: "progress",
            });

            log.info(`Generated demo script for ticket ${ticketId} with ${steps.length} steps`);

            // Hand execution to a detached one-shot drain running current
            // on-disk code; this long-running MCP process never executes
            // verification with its boot-time module graph.
            const brainDumpRoot = resolveBrainDumpRootFrom(import.meta.url);
            let drainNote = "Verification drain spawned; the runner will pick the job up shortly.";
            if (brainDumpRoot) {
              const drain = spawnDetachedVerificationDrain({
                brainDumpRoot,
                logError: (message) => log.error(message),
              });
              if (!drain.spawned) {
                drainNote = `Verification drain not spawned (${drain.error ?? "unknown"}); the job stays queued for the next boot or enqueue drain.`;
              }
            } else {
              drainNote =
                "Verification drain not spawned (Brain Dump root not resolvable); the job stays queued for the next boot or enqueue drain.";
              log.warn(drainNote);
            }

            return formatResult(
              demo,
              `Demo script generated! Ticket moved to ai_verification.\n\n${prdNote}\n\n${syncNote}\n\n${drainNote}`
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

          case "get-verification-history": {
            const ticketId = requireParam(params.ticketId, "ticketId", "get-verification-history");
            const runs = listVerificationRuns(db, ticketId);
            if (runs.length === 0) {
              return formatEmpty("verification runs for this ticket");
            }
            return formatResult(runs, `Found ${runs.length} verification run(s)`);
          }

          case "get-verification-job": {
            const ticketId = requireParam(params.ticketId, "ticketId", "get-verification-job");
            const job = getVerificationJob(db, ticketId);
            if (!job) {
              return formatEmpty("verification job for this ticket");
            }
            return formatResult(job);
          }

          case "repair-legacy-handoff": {
            const ticketId = requireParam(params.ticketId, "ticketId", "repair-legacy-handoff");
            validateRepairLegacyHumanReviewHandoff(db, ticketId);
            const prdSync = syncPrdPassMarker(db, ticketId, false);
            if (prdSync.required && !prdSync.success) {
              throw new Error(
                `Cannot repair legacy handoff because PRD sync failed: ${prdSync.message}`
              );
            }
            const result = repairLegacyHumanReviewHandoff(db, ticketId);
            return formatResult(
              { ...result, prdSync },
              `Legacy human_review handoff repaired: ticket moved to ${result.newStatus}.\n\n${formatPrdSyncNote(prdSync)}`
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
