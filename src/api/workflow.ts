import { createServerFn } from "@tanstack/react-start";
import { db } from "../lib/db";
import { ticketWorkflowState, reviewFindings, demoScripts, tickets } from "../lib/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Workflow display state - aggregates data needed for the ticket detail UI.
 * Combines workflow state, review findings summary, and demo status.
 */
export interface WorkflowDisplayState {
  /** Current workflow phase: started, implementation, ai_review, human_review, done */
  currentPhase: "started" | "implementation" | "ai_review" | "human_review" | "done";
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
 * Get workflow display state for a ticket.
 *
 * This aggregates data from multiple tables to provide a complete
 * picture of the ticket's workflow progress for the UI.
 */
export const getWorkflowDisplayState = createServerFn({ method: "GET" })
  .inputValidator((ticketId: string) => {
    if (!ticketId) {
      throw new Error("Ticket ID is required");
    }
    return ticketId;
  })
  .handler(async ({ data: ticketId }): Promise<WorkflowDisplayState | null> => {
    // First check if ticket exists and get its status
    const ticket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
    if (!ticket) {
      return null;
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

    // Calculate findings summary
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

      switch (row.severity) {
        case "critical":
          findingsSummary.critical += count;
          break;
        case "major":
          findingsSummary.major += count;
          break;
        case "minor":
          findingsSummary.minor += count;
          break;
        case "suggestion":
          findingsSummary.suggestion += count;
          break;
      }
    }

    // Determine current phase based on available data
    // Priority: done > human_review > ai_review > implementation > started
    let currentPhase: WorkflowDisplayState["currentPhase"] = "started";

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
      // Use stored phase if available
      currentPhase = workflowState.currentPhase as WorkflowDisplayState["currentPhase"];
    }

    return {
      currentPhase,
      reviewIteration: workflowState?.reviewIteration ?? 0,
      demoGenerated: demoScript !== undefined,
      demoCompleted: demoScript?.completedAt !== null && demoScript?.completedAt !== undefined,
      demoApproved: demoScript?.passed ?? null,
      findingsSummary,
      createdAt: workflowState?.createdAt ?? null,
      updatedAt: workflowState?.updatedAt ?? null,
    };
  });
