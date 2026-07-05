import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
// NOTE: db is imported dynamically inside handlers to prevent bundling server code in client
import { demoScripts } from "../lib/schema";
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
    const script = db
      .select()
      .from(demoScripts)
      .where(eq(demoScripts.ticketId, ticketId))
      .orderBy(desc(demoScripts.generatedAt))
      .get();

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
