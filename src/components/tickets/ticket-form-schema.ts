import { z } from "zod";

/**
 * Ticket status enum - matches database schema.
 */
export const ticketStatusSchema = z.enum([
  "backlog",
  "ready",
  "in_progress",
  "review",
  "ai_review",
  "human_review",
  "done",
]);

/**
 * Ticket priority enum.
 */
export const ticketPrioritySchema = z.enum(["low", "medium", "high"]);

/**
 * Subtask schema - represents a checklist item within a ticket.
 */
export const subtaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  completed: z.boolean(),
});

/**
 * Zod schema for Ticket form validation.
 *
 * Fields:
 * - title: Required, non-empty string
 * - description: Optional string
 * - status: Required enum (backlog, ready, in_progress, review, ai_review, human_review, done)
 * - priority: Optional enum (low, medium, high)
 * - epicId: Optional string (reference to parent epic)
 * - tags: Array of strings (default empty)
 * - subtasks: Array of subtask objects (default empty)
 * - isBlocked: Boolean flag
 * - blockedReason: Optional string (reason for blocking)
 *
 * Note: projectId is intentionally NOT included - it's a separate prop, not a form field.
 * Note: Attachments are intentionally NOT included - file uploads don't fit the form model.
 */
export const ticketFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string(),
  status: ticketStatusSchema,
  priority: ticketPrioritySchema.optional(),
  epicId: z.string().optional(),
  tags: z.array(z.string()),
  subtasks: z.array(subtaskSchema),
  isBlocked: z.boolean(),
  blockedReason: z.string(),
});

/**
 * TypeScript type inferred from the Zod schema.
 * Use this for type-safe form handling.
 */
export type TicketFormData = z.infer<typeof ticketFormSchema>;

/**
 * Type for ticket status values.
 */
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

/**
 * Type for ticket priority values.
 */
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;

/**
 * Type for subtask objects.
 */
export type Subtask = z.infer<typeof subtaskSchema>;
