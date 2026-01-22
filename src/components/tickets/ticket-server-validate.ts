import { createServerValidate } from "@tanstack/react-form-start";
import {
  runValidationAction,
  ServerValidateError,
  validateWithZodSchema,
  type ValidationResult,
} from "../../lib/server-validation.js";
import { ticketFormOpts } from "./ticket-form-opts.js";
import type { TicketFormData } from "./ticket-form-schema.js";
import { ticketFormSchema } from "./ticket-form-schema.js";

/**
 * Server-side validation for ticket form.
 *
 * This provides an additional layer of security by validating tickets on the server,
 * catching malicious clients that might bypass client-side validation.
 *
 * Business logic validation rules:
 * - title: Required, non-empty
 * - tags: Array of strings (sanitized)
 * - subtasks: Array with valid structure
 */
export const serverValidateTicket = createServerValidate({
  ...ticketFormOpts,
  onServerValidate: async ({ value }: { value: TicketFormData }) => {
    // Run Zod schema validation for type safety
    const schemaError = validateWithZodSchema(ticketFormSchema, value);
    if (schemaError) {
      return schemaError;
    }

    // Business logic validation

    // Title must not be only whitespace
    if (value.title.trim().length === 0) {
      return { title: "Title cannot be empty or whitespace only" };
    }

    // Title length check (prevent excessive titles)
    if (value.title.length > 500) {
      return { title: "Title cannot exceed 500 characters" };
    }

    // Description length check (prevent excessive descriptions)
    if (value.description && value.description.length > 50000) {
      return { description: "Description cannot exceed 50,000 characters" };
    }

    // Tags validation
    if (value.tags) {
      if (value.tags.length > 20) {
        return { tags: "Cannot have more than 20 tags" };
      }
      for (const tag of value.tags) {
        if (tag.length > 50) {
          return { tags: "Each tag cannot exceed 50 characters" };
        }
      }
    }

    // Subtasks validation
    if (value.subtasks) {
      if (value.subtasks.length > 100) {
        return { subtasks: "Cannot have more than 100 subtasks" };
      }
      for (const subtask of value.subtasks) {
        if (subtask.text.length > 500) {
          return { subtasks: "Each subtask text cannot exceed 500 characters" };
        }
      }
    }

    // Blocked reason length check
    if (value.blockedReason && value.blockedReason.length > 1000) {
      return { blockedReason: "Blocked reason cannot exceed 1,000 characters" };
    }

    return undefined;
  },
});

/**
 * Server action for creating/updating tickets with validation.
 */
export function validateTicketAction(
  formData: FormData
): Promise<ValidationResult<TicketFormData>> {
  return runValidationAction<TicketFormData>(serverValidateTicket, formData);
}

export { ServerValidateError };
