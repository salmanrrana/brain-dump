import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "../lib/db";
import { demoScripts, tickets } from "../lib/schema";
import { eq } from "drizzle-orm";

/**
 * Get demo script for a ticket
 * Returns the demo script with all steps and current status
 */
export const getDemoScript = createServerFn({ method: "GET" })
  .inputValidator(z.object({ ticketId: z.string() }))
  .handler(async ({ data: { ticketId } }: { data: { ticketId: string } }) => {
    const script = db.select().from(demoScripts).where(eq(demoScripts.ticketId, ticketId)).get();

    if (!script) {
      return null;
    }

    return {
      id: script.id,
      ticketId: script.ticketId,
      steps: script.steps ? JSON.parse(script.steps) : [],
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
    const { demoScriptId, stepOrder, status, notes = "" } = input;
    const script = db.select().from(demoScripts).where(eq(demoScripts.id, demoScriptId)).get();

    if (!script) {
      throw new Error("Demo script not found");
    }

    const steps = script.steps ? JSON.parse(script.steps) : [];
    const stepIndex = steps.findIndex((s: Record<string, unknown>) => s.order === stepOrder);

    if (stepIndex === -1) {
      throw new Error("Step not found");
    }

    // Update step status in the steps array
    steps[stepIndex] = {
      ...steps[stepIndex],
      status,
      notes,
    };

    // Update script
    db.update(demoScripts)
      .set({
        steps: JSON.stringify(steps),
      })
      .where(eq(demoScripts.id, demoScriptId))
      .run();

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
    const { ticketId, passed, feedback, stepResults } = input;

    // Find the demo script for this ticket
    const script = db.select().from(demoScripts).where(eq(demoScripts.ticketId, ticketId)).get();

    if (!script) {
      throw new Error("No demo script found for this ticket");
    }

    // Update demo script with feedback and completion
    db.update(demoScripts)
      .set({
        passed,
        feedback,
        completedAt: new Date().toISOString(),
        steps: stepResults ? JSON.stringify(stepResults) : script.steps,
      })
      .where(eq(demoScripts.id, script.id))
      .run();

    // Update ticket status based on result
    const newStatus = passed ? "done" : "human_review";
    db.update(tickets)
      .set({
        status: newStatus,
      })
      .where(eq(tickets.id, ticketId))
      .run();

    return {
      success: true,
      ticketStatus: newStatus,
      demoId: script.id,
    };
  });
