import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
// NOTE: db is imported dynamically inside handlers to prevent bundling server code in client
import { demoScripts, tickets } from "../lib/schema";
import { eq } from "drizzle-orm";
import type { DemoStep } from "../lib/schema";

/**
 * Safely parse JSON steps with descriptive error messages.
 * Falls back to empty array if steps is null/undefined.
 */
function parseSteps(stepsJson: string | null, context: string): DemoStep[] {
  if (!stepsJson) return [];
  try {
    return JSON.parse(stepsJson) as DemoStep[];
  } catch (err) {
    throw new Error(
      `Demo script steps are corrupted (${context}). ` +
        `Parse error: ${err instanceof Error ? err.message : "unknown"}`
    );
  }
}

/**
 * Get demo script for a ticket
 * Returns the demo script with all steps and current status
 */
export const getDemoScript = createServerFn({ method: "GET" })
  .inputValidator(z.object({ ticketId: z.string() }))
  .handler(async ({ data: { ticketId } }: { data: { ticketId: string } }) => {
    const { db } = await import("../lib/db");
    const script = db.select().from(demoScripts).where(eq(demoScripts.ticketId, ticketId)).get();

    if (!script) {
      return null;
    }

    return {
      id: script.id,
      ticketId: script.ticketId,
      steps: parseSteps(script.steps, `ticket ${ticketId}`),
      generatedAt: script.generatedAt,
      completedAt: script.completedAt,
      passed: script.passed,
      feedback: script.feedback,
    };
  });

/**
 * Update a single demo step's status
 * Called by the UI when user marks a step as passed/failed/skipped
 */
export const updateDemoStep = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      demoScriptId: z.string(),
      stepOrder: z.number(),
      status: z.enum(["pending", "passed", "failed", "skipped"]),
      notes: z.string().optional(),
    })
  )
  .handler(async ({ data: input }) => {
    const { db } = await import("../lib/db");
    const { demoScriptId, stepOrder, status, notes = "" } = input;
    const script = db.select().from(demoScripts).where(eq(demoScripts.id, demoScriptId)).get();

    if (!script) {
      throw new Error("Demo script not found");
    }

    const steps = parseSteps(script.steps, `script ${demoScriptId}`);
    const stepIndex = steps.findIndex((s) => s.order === stepOrder);

    if (stepIndex === -1) {
      throw new Error("Step not found");
    }

    // Update step status in the steps array
    const existingStep = steps[stepIndex];
    if (!existingStep) {
      throw new Error("Step not found at index");
    }
    steps[stepIndex] = {
      order: existingStep.order,
      description: existingStep.description,
      expectedOutcome: existingStep.expectedOutcome,
      type: existingStep.type,
      status,
      notes,
    };

    // Update script and verify rows were modified
    const result = db
      .update(demoScripts)
      .set({
        steps: JSON.stringify(steps),
      })
      .where(eq(demoScripts.id, demoScriptId))
      .run();

    if (result.changes === 0) {
      throw new Error(
        "Failed to update demo step - the script may have been deleted. Please refresh and try again."
      );
    }

    return steps[stepIndex];
  });

/**
 * Submit demo feedback from human reviewer
 * Called when user approves or rejects the demo
 */
export const submitDemoFeedback = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      ticketId: z.string(),
      passed: z.boolean(),
      feedback: z.string(),
      stepResults: z
        .array(
          z.object({
            order: z.number(),
            status: z.enum(["pending", "passed", "failed", "skipped"]),
            notes: z.string().optional(),
          })
        )
        .optional(),
    })
  )
  .handler(async ({ data: input }) => {
    const { db } = await import("../lib/db");
    const { ticketId, passed, feedback, stepResults } = input;

    // Find the demo script for this ticket
    const script = db.select().from(demoScripts).where(eq(demoScripts.ticketId, ticketId)).get();

    if (!script) {
      throw new Error("No demo script found for this ticket");
    }

    // Update demo script with feedback and completion, verify rows modified
    const scriptResult = db
      .update(demoScripts)
      .set({
        passed,
        feedback,
        completedAt: new Date().toISOString(),
        steps: stepResults ? JSON.stringify(stepResults) : script.steps,
      })
      .where(eq(demoScripts.id, script.id))
      .run();

    if (scriptResult.changes === 0) {
      throw new Error(
        "Failed to update demo script - it may have been deleted. Please refresh and try again."
      );
    }

    // Update ticket status based on result, verify rows modified
    const newStatus = passed ? "done" : "human_review";
    const ticketResult = db
      .update(tickets)
      .set({
        status: newStatus,
      })
      .where(eq(tickets.id, ticketId))
      .run();

    if (ticketResult.changes === 0) {
      throw new Error(
        "Failed to update ticket status - the ticket may have been deleted. Please refresh and try again."
      );
    }

    return {
      success: true,
      ticketStatus: newStatus,
      demoId: script.id,
    };
  });
