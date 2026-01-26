import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
// NOTE: db and logger are imported dynamically inside handlers to prevent bundling server code in client
import { ticketWorkflowState, reviewFindings, demoScripts, tickets } from "../lib/schema";
import { eq, sql } from "drizzle-orm";

/** Valid workflow phases for display */
const VALID_PHASES = ["started", "implementation", "ai_review", "human_review", "done"] as const;
type WorkflowPhase = (typeof VALID_PHASES)[number];

/**
 * Workflow display state - aggregates data needed for the ticket detail UI.
 * Combines workflow state, review findings summary, and demo status.
 */
export interface WorkflowDisplayState {
  /** Current workflow phase: started, implementation, ai_review, human_review, done */
  currentPhase: WorkflowPhase;
  /** Number of completed review iterations */
  reviewIteration: number;
  /** Whether demo script has been generated */
  demoGenerated: boolean;
  /** Whether demo has been completed by human */
  demoCompleted: boolean;
  /** Whether demo was approved (only set if demoCompleted is true) */
  demoApproved: boolean | null;
  /** Review findings summary by severity */
  findingsSummary: {
    critical: number;
    major: number;
    minor: number;
    suggestion: number;
    fixed: number;
    total: number;
  };
  /** Timestamps for tracking */
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * Result type for getWorkflowDisplayState - discriminated union for clear error handling.
 */
export type WorkflowDisplayResult =
  | { status: "success"; data: WorkflowDisplayState }
  | { status: "not_found"; ticketId: string }
  | { status: "error"; message: string };

/** Zod schema for input validation */
const ticketIdSchema = z.string().min(1, "Ticket ID is required");

/**
 * Safely validate and parse a workflow phase from database value.
 * Returns a valid phase or falls back to "started" for invalid values.
 */
function parseWorkflowPhase(phase: string | null | undefined): WorkflowPhase {
  if (phase && VALID_PHASES.includes(phase as WorkflowPhase)) {
    return phase as WorkflowPhase;
  }
  return "started";
}

/**
 * Get workflow display state for a ticket.
 *
 * This aggregates data from multiple tables to provide a complete
 * picture of the ticket's workflow progress for the UI.
 *
 * Returns a discriminated union to distinguish between:
 * - success: Workflow state data found
 * - not_found: Ticket doesn't exist
 * - error: Database or other error occurred
 */
export const getWorkflowDisplayState = createServerFn({ method: "GET" })
  .inputValidator((ticketId: string) => {
    const result = ticketIdSchema.safeParse(ticketId);
    if (!result.success) {
      throw new Error(result.error.issues[0]?.message ?? "Invalid ticket ID");
    }
    return result.data;
  })
  .handler(async ({ data: ticketId }): Promise<WorkflowDisplayResult> => {
    const { db } = await import("../lib/db");
    const { createLogger } = await import("../lib/logger");
    const logger = createLogger("workflow-api");

    try {
      // First check if ticket exists and get its status
      const ticket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
      if (!ticket) {
        return { status: "not_found", ticketId };
      }

      // Get workflow state if it exists
      const workflowState = db
        .select()
        .from(ticketWorkflowState)
        .where(eq(ticketWorkflowState.ticketId, ticketId))
        .get();

      // Get demo script if it exists
      const demoScript = db
        .select()
        .from(demoScripts)
        .where(eq(demoScripts.ticketId, ticketId))
        .get();

      // Get review findings counts by severity
      const findingsCounts = db
        .select({
          severity: reviewFindings.severity,
          status: reviewFindings.status,
          count: sql<number>`COUNT(*)`,
        })
        .from(reviewFindings)
        .where(eq(reviewFindings.ticketId, ticketId))
        .groupBy(reviewFindings.severity, reviewFindings.status)
        .all();

      // Calculate findings summary using object key access
      const findingsSummary = {
        critical: 0,
        major: 0,
        minor: 0,
        suggestion: 0,
        fixed: 0,
        total: 0,
      };

      for (const row of findingsCounts) {
        const count = row.count;
        if (row.status === "fixed") {
          findingsSummary.fixed += count;
        }
        findingsSummary.total += count;

        // Use type-safe key access
        const severity = row.severity as keyof typeof findingsSummary;
        if (severity in findingsSummary && severity !== "fixed" && severity !== "total") {
          findingsSummary[severity] += count;
        }
      }

      // Determine current phase based on ticket status and workflow state
      let currentPhase: WorkflowPhase = "started";

      if (ticket.status === "done") {
        currentPhase = "done";
      } else if (ticket.status === "human_review") {
        currentPhase = "human_review";
      } else if (ticket.status === "ai_review") {
        currentPhase = "ai_review";
      } else if (ticket.status === "in_progress") {
        // Check if any code work has been done (workflow state exists)
        currentPhase = workflowState ? "implementation" : "started";
      } else if (workflowState?.currentPhase) {
        // Use stored phase if available, with safe parsing
        currentPhase = parseWorkflowPhase(workflowState.currentPhase);
      }

      return {
        status: "success",
        data: {
          currentPhase,
          reviewIteration: workflowState?.reviewIteration ?? 0,
          demoGenerated: demoScript !== undefined,
          demoCompleted: Boolean(demoScript?.completedAt),
          demoApproved: demoScript?.passed ?? null,
          findingsSummary,
          createdAt: workflowState?.createdAt ?? null,
          updatedAt: workflowState?.updatedAt ?? null,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(
        "Failed to fetch workflow display state",
        error instanceof Error ? error : undefined
      );
      return { status: "error", message };
    }
  });
