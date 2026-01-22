import { createServerValidate } from "@tanstack/react-form-start";
import {
  runValidationAction,
  ServerValidateError,
  validateWithZodSchema,
  type ValidationResult,
} from "../../lib/server-validation.js";
import { epicFormOpts } from "./epic-form-opts.js";
import type { EpicFormData } from "./epic-form-schema.js";
import { epicFormSchema } from "./epic-form-schema.js";

const HEX_COLOR_REGEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

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
    // Run Zod schema validation for type safety
    const schemaError = validateWithZodSchema(epicFormSchema, value);
    if (schemaError) {
      return schemaError;
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
    if (value.color && value.color.length > 0 && !HEX_COLOR_REGEX.test(value.color)) {
      return { color: "Color must be a valid hex color (e.g., #FF5733)" };
    }

    return undefined;
  },
});

/**
 * Server action for creating/updating epics with validation.
 */
export function validateEpicAction(formData: FormData): Promise<ValidationResult<EpicFormData>> {
  return runValidationAction<EpicFormData>(serverValidateEpic, formData);
}

export { ServerValidateError };
