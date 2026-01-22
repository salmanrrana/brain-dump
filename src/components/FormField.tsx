import { memo, useMemo, type ReactNode } from "react";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Minimal field state interface that captures what FormField needs from TanStack Form.
 *
 * TanStack Form's FieldApi has 12+ generic parameters, making direct typing impractical.
 * This interface captures only the properties FormField actually uses, providing
 * type safety at the component level while remaining compatible with any field type.
 */
interface FieldState {
  /** Field name - used for label's htmlFor attribute */
  name: string;
  /** Field state containing meta information */
  state: {
    meta: {
      /** Array of validation error messages */
      errors: (string | undefined)[];
    };
  };
}

interface FormFieldProps {
  /** TanStack Form field instance (from form.Field render prop) */
  field: FieldState;
  /** Label text displayed above the field */
  label: string;
  /** The form control element(s) to render */
  children: ReactNode;
  /** Optional description text displayed below the label */
  description?: string;
}

// =============================================================================
// FORM FIELD COMPONENT
// =============================================================================

/**
 * FormField - Reusable wrapper component for consistent field rendering.
 *
 * Provides a consistent layout for form fields with:
 * - Label with proper htmlFor association
 * - Optional description text
 * - Child content (the actual input element)
 * - Error message display with ARIA alert role
 *
 * Uses the project's CSS variable design system for theme support.
 *
 * @example
 * ```tsx
 * <form.Field
 *   name="title"
 *   children={(field) => (
 *     <FormField field={field} label="Title" description="Enter a descriptive title">
 *       <input
 *         id={field.name}
 *         value={field.state.value}
 *         onChange={(e) => field.handleChange(e.target.value)}
 *         onBlur={field.handleBlur}
 *         className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg"
 *       />
 *     </FormField>
 *   )}
 * />
 * ```
 */
export const FormField = memo(function FormField({
  field,
  label,
  children,
  description,
}: FormFieldProps) {
  // Memoize error filtering to prevent array recreation on every render
  const errors = useMemo(
    () => field.state.meta.errors.filter((e): e is string => e !== undefined),
    [field.state.meta.errors]
  );
  const hasErrors = errors.length > 0;

  return (
    <div className="space-y-1">
      <label htmlFor={field.name} className="text-sm font-medium text-[var(--text-secondary)]">
        {label}
      </label>
      {description && <p className="text-xs text-[var(--text-tertiary)]">{description}</p>}
      {children}
      {hasErrors && (
        <div className="text-xs text-[var(--accent-danger)]" role="alert">
          {errors.join(", ")}
        </div>
      )}
    </div>
  );
});

export default FormField;
