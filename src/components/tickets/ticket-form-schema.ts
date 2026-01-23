import { z } from "zod";

export const ticketStatusSchema = z.enum([
  "backlog",
  "ready",
  "in_progress",
  "review",
  "ai_review",
  "human_review",
  "done",
]);

export const ticketPrioritySchema = z.enum(["low", "medium", "high"]);

/** @deprecated Use acceptanceCriterionSchema instead */
export const subtaskSchema = z.object({
  id: z.string(),
  text: z.string(),
  completed: z.boolean(),
});

/** Status for acceptance criteria verification */
export const acceptanceCriterionStatusSchema = z.enum(["pending", "passed", "failed", "skipped"]);

/** Who verified the acceptance criterion */
export const acceptanceCriterionVerifierSchema = z.enum([
  "human",
  "claude",
  "ralph",
  "opencode",
  "cursor",
  "windsurf",
  "copilot",
  "test",
  "ci",
]);

/** Acceptance Criterion - a verifiable requirement for ticket completion */
export const acceptanceCriterionSchema = z.object({
  id: z.string(),
  criterion: z.string(),
  status: acceptanceCriterionStatusSchema,
  verifiedBy: acceptanceCriterionVerifierSchema.optional(),
  verifiedAt: z.string().optional(),
  verificationNote: z.string().optional(),
});

// Note: projectId and attachments are NOT form fields - handled separately
// Use union with undefined instead of .optional() to ensure fields are always present
// This aligns with TanStack Form's expectation that all defaultValues fields exist
export const ticketFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string(),
  status: ticketStatusSchema,
  priority: ticketPrioritySchema.or(z.undefined()),
  epicId: z.string().or(z.undefined()),
  tags: z.array(z.string()),
  acceptanceCriteria: z.array(acceptanceCriterionSchema),
  isBlocked: z.boolean(),
  blockedReason: z.string(),
});

export type TicketFormData = z.infer<typeof ticketFormSchema>;
export type TicketStatus = z.infer<typeof ticketStatusSchema>;
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;
/** @deprecated Use AcceptanceCriterion instead */
export type Subtask = z.infer<typeof subtaskSchema>;
export type AcceptanceCriterionStatus = z.infer<typeof acceptanceCriterionStatusSchema>;
export type AcceptanceCriterionVerifier = z.infer<typeof acceptanceCriterionVerifierSchema>;
export type AcceptanceCriterion = z.infer<typeof acceptanceCriterionSchema>;
