import { ServerValidateError } from "@tanstack/react-form-start";
import type { ZodError } from "zod";
import { type ZodType } from "zod";
import { createLogger } from "./logger";

const log = createLogger("server-validation");

/**
 * Extracts the first error per field from a Zod validation result.
 * Returns a field-keyed error object suitable for TanStack Form's server validation.
 *
 * @param zodError - The ZodError from a failed safeParse call
 * @returns Record mapping field names to their first error message
 */
export function extractZodFieldErrors(zodError: ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of zodError.issues) {
    const field = issue.path[0] as string;
    if (!fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }
  return fieldErrors;
}

/**
 * Validates form data against a Zod schema and returns the first error found.
 * Use this at the start of onServerValidate handlers for consistent Zod validation.
 *
 * @param schema - The Zod schema to validate against
 * @param value - The form data to validate
 * @returns An error object if validation fails, undefined if it passes
 */
export function validateWithZodSchema<T>(
  schema: ZodType<T>,
  value: unknown
): Record<string, string> | undefined {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fieldErrors = extractZodFieldErrors(result.error);

    // Log validation failure for observability
    log.info(`Server validation failed: ${JSON.stringify(fieldErrors)}`);

    const firstField = Object.keys(fieldErrors)[0];
    const firstError = firstField ? fieldErrors[firstField] : undefined;
    if (firstField && firstError) {
      return { [firstField]: firstError };
    }
    // Fallback: include all errors for context
    const allErrors = Object.values(fieldErrors).filter(Boolean).join("; ");
    return { form: allErrors || "Validation failed" };
  }
  return undefined;
}

/**
 * Result type for validation actions.
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; formState: unknown };

/**
 * Wraps a server validator in a standard action handler.
 * Catches ServerValidateError and returns a structured result.
 *
 * @param serverValidator - The createServerValidate result
 * @param formData - The FormData to validate
 * @returns A ValidationResult indicating success/failure
 */
export async function runValidationAction<T>(
  serverValidator: (formData: FormData) => Promise<unknown>,
  formData: FormData
): Promise<ValidationResult<T>> {
  try {
    const validatedData = await serverValidator(formData);
    return { success: true, data: validatedData as T };
  } catch (e) {
    if (e instanceof ServerValidateError) {
      log.info(`Validation action failed: ${JSON.stringify(e.formState)}`);
      return { success: false, formState: e.formState };
    }
    log.error("Unexpected error during validation action", e as Error);
    throw e;
  }
}

// Re-export for convenience - consumers can import from this module
export { ServerValidateError };
