import { createServerValidate, ServerValidateError } from "@tanstack/react-form-start";
import { epicFormOpts } from "./epic-form-opts";
import type { EpicFormData } from "./epic-form-schema";
import { epicFormSchema } from "./epic-form-schema";

/**
 * Server-side validation for epic form.
 *
 * This provides an additional layer of security by validating epics on the server,
 * catching malicious clients that might bypass client-side validation.
 *
 * Business logic validation rules:
 * - title: Required, non-empty, reasonable length
 * - description: Optional, reasonable length
 * - color: Valid hex color format
 */
export const serverValidateEpic = createServerValidate({
  ...epicFormOpts,
  onServerValidate: async ({ value }: { value: EpicFormData }) => {
    // First run Zod schema validation for type safety
    const result = epicFormSchema.safeParse(value);
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
    if (value.title.length > 200) {
      return { title: "Title cannot exceed 200 characters" };
    }

    // Description length check (prevent excessive descriptions)
    if (value.description && value.description.length > 10000) {
      return { description: "Description cannot exceed 10,000 characters" };
    }

    // Color validation (if provided, must be valid hex)
    if (value.color && value.color.length > 0) {
      const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
      if (!hexColorRegex.test(value.color)) {
        return { color: "Color must be a valid hex color (e.g., #FF5733)" };
      }
    }

    // All validations passed
    return undefined;
  },
});

/**
 * Server action for creating/updating epics with validation.
 *
 * Usage in a server function or route handler:
 * ```typescript
 * import { validateEpicAction } from "./epic-server-validate";
 *
 * export const createEpic = createServerFn({ method: "POST" })
 *   .handler(async ({ request }) => {
 *     const formData = await request.formData();
 *     const result = await validateEpicAction(formData);
 *     if (!result.success) {
 *       return result;
 *     }
 *     // Proceed with database insert using result.data
 *   });
 * ```
 */
export async function validateEpicAction(
  formData: FormData
): Promise<{ success: true; data: EpicFormData } | { success: false; formState: unknown }> {
  try {
    const validatedData = await serverValidateEpic(formData);
    return { success: true, data: validatedData as EpicFormData };
  } catch (e) {
    if (e instanceof ServerValidateError) {
      return { success: false, formState: e.formState };
    }
    throw e;
  }
}

// Re-export for convenience
export { ServerValidateError };
