import { z } from "zod";

/**
 * Zod schema for Epic form validation.
 *
 * Fields:
 * - title: Required, non-empty string (trimmed validation happens in component)
 * - description: Optional string
 * - color: Optional hex color string
 */
export const epicFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string(),
  color: z.string(),
});

/**
 * TypeScript type inferred from the Zod schema.
 * Use this for type-safe form handling.
 */
export type EpicFormData = z.infer<typeof epicFormSchema>;
