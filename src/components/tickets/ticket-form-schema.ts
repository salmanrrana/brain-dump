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

// Uses 'text' to match canonical Subtask type in api/tickets.ts
export const subtaskSchema = z.object({
  id: z.string(),
  text: z.string(),
  completed: z.boolean(),
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
  subtasks: z.array(subtaskSchema),
  isBlocked: z.boolean(),
  blockedReason: z.string(),
});

export type TicketFormData = z.infer<typeof ticketFormSchema>;
export type TicketStatus = z.infer<typeof ticketStatusSchema>;
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;
export type Subtask = z.infer<typeof subtaskSchema>;
