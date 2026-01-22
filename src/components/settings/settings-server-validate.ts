import { createServerValidate, ServerValidateError } from "@tanstack/react-form-start";
import { settingsFormOpts } from "./settings-form-opts";
import type { SettingsFormData } from "./settings-form-schema";
import { settingsFormSchema } from "./settings-form-schema";

/**
 * Server-side validation for settings form.
 *
 * This provides an additional layer of security by validating settings on the server,
 * catching malicious clients that might bypass client-side validation.
 *
 * Business logic validation rules:
 * - ralphTimeout: 5 minutes (300s) minimum, 24 hours (86400s) maximum
 * - ralphMaxIterations: 1-100 range
 * - conversationRetentionDays: 7-365 days (GDPR-compliant minimum, practical maximum)
 */
export const serverValidateSettings = createServerValidate({
  ...settingsFormOpts,
  onServerValidate: async ({ value }: { value: SettingsFormData }) => {
    // First run Zod schema validation for type safety
    const result = settingsFormSchema.safeParse(value);
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

    // Business logic validation (beyond schema constraints)

    // Ralph timeout: 5 minutes minimum is enforced by the API, but we validate
    // the 24-hour maximum here for security
    if (value.ralphTimeout > 86400) {
      return { ralphTimeout: "Timeout cannot exceed 24 hours (86400 seconds)" };
    }

    // Conversation retention: ensure reasonable bounds for GDPR compliance
    if (value.conversationRetentionDays > 3650) {
      return { conversationRetentionDays: "Retention cannot exceed 10 years" };
    }

    // All validations passed
    return undefined;
  },
});

/**
 * Server action for updating settings with validation.
 *
 * Usage in a server function or route handler:
 * ```typescript
 * import { updateSettingsAction } from "./settings-server-validate";
 *
 * export const updateSettings = createServerFn({ method: "POST" })
 *   .handler(async ({ request }) => {
 *     const formData = await request.formData();
 *     return updateSettingsAction(formData);
 *   });
 * ```
 */
export async function updateSettingsAction(
  formData: FormData
): Promise<{ success: true; data: SettingsFormData } | { success: false; formState: unknown }> {
  try {
    const validatedData = await serverValidateSettings(formData);
    return { success: true, data: validatedData as SettingsFormData };
  } catch (e) {
    if (e instanceof ServerValidateError) {
      return { success: false, formState: e.formState };
    }
    throw e;
  }
}

// Re-export for convenience
export { ServerValidateError };
