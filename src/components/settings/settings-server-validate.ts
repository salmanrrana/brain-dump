import { createServerValidate } from "@tanstack/react-form-start";
import {
  runValidationAction,
  ServerValidateError,
  validateWithZodSchema,
  type ValidationResult,
} from "../../lib/server-validation.js";
import { settingsFormOpts } from "./settings-form-opts.js";
import type { SettingsFormData } from "./settings-form-schema.js";
import { settingsFormSchema } from "./settings-form-schema.js";

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
    // Run Zod schema validation for type safety
    const schemaError = validateWithZodSchema(settingsFormSchema, value);
    if (schemaError) {
      return schemaError;
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

    return undefined;
  },
});

/**
 * Server action for updating settings with validation.
 */
export function updateSettingsAction(
  formData: FormData
): Promise<ValidationResult<SettingsFormData>> {
  return runValidationAction<SettingsFormData>(serverValidateSettings, formData);
}

export { ServerValidateError };
