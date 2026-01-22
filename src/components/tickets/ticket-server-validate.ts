import { createServerValidate, ServerValidateError } from "@tanstack/react-form-start";
import { ticketFormOpts } from "./ticket-form-opts";
import type { TicketFormData } from "./ticket-form-schema";
import { ticketFormSchema } from "./ticket-form-schema";

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
    // First run Zod schema validation for type safety
    const result = ticketFormSchema.safeParse(value);
    if (!result.success) {
      // Extract first error for each field
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        if (!fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      // Return the first error found
      const firstField = Object.keys(fieldErrors)[0];
      if (firstField) {
        return { [firstField]: fieldErrors[firstField] };
      }
      return { form: "Validation failed" };
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

    // Tags count check (prevent abuse)
    if (value.tags && value.tags.length > 20) {
      return { tags: "Cannot have more than 20 tags" };
    }

    // Individual tag length check
    if (value.tags) {
      for (const tag of value.tags) {
        if (tag.length > 50) {
          return { tags: "Each tag cannot exceed 50 characters" };
        }
      }
    }

    // Subtasks count check (prevent abuse)
    if (value.subtasks && value.subtasks.length > 100) {
      return { subtasks: "Cannot have more than 100 subtasks" };
    }

    // Subtask text length check
    if (value.subtasks) {
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

    // All validations passed
    return undefined;
  },
});

/**
 * Server action for creating/updating tickets with validation.
 *
 * Usage in a server function or route handler:
 * ```typescript
 * import { validateTicketAction } from "./ticket-server-validate";
 *
 * export const createTicket = createServerFn({ method: "POST" })
 *   .handler(async ({ request }) => {
 *     const formData = await request.formData();
 *     const result = await validateTicketAction(formData);
 *     if (!result.success) {
 *       return result;
 *     }
 *     // Proceed with database insert using result.data
 *   });
 * ```
 */
export async function validateTicketAction(
  formData: FormData
): Promise<{ success: true; data: TicketFormData } | { success: false; formState: unknown }> {
  try {
    const validatedData = await serverValidateTicket(formData);
    return { success: true, data: validatedData as TicketFormData };
  } catch (e) {
    if (e instanceof ServerValidateError) {
      return { success: false, formState: e.formState };
    }
    throw e;
  }
}

// Re-export for convenience
export { ServerValidateError };
