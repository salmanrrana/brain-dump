/**
 * Input Component
 *
 * A versatile input component with 3 variants (text, search, textarea),
 * support for labels, error states, and disabled states.
 *
 * Uses CSS custom properties from the design system for automatic theme adaptation.
 *
 * @example
 * ```tsx
 * import { Input } from '@/components-v2/ui/Input';
 * import { Search } from 'lucide-react';
 *
 * // Basic text input
 * <Input placeholder="Enter your name" />
 *
 * // With label
 * <Input label="Email" placeholder="you@example.com" />
 *
 * // Search variant with icon
 * <Input variant="search" placeholder="Search tickets..." />
 *
 * // Textarea variant
 * <Input variant="textarea" placeholder="Enter description..." rows={4} />
 *
 * // Error state
 * <Input error="This field is required" />
 *
 * // Disabled state
 * <Input disabled placeholder="Cannot edit" />
 * ```
 */

import {
  forwardRef,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
  useId,
} from "react";

// =============================================================================
// TYPES
// =============================================================================

export type InputVariant = "text" | "search" | "textarea";

type BaseInputProps = {
  /** Visual style variant */
  variant?: InputVariant;
  /** Error message to display (also triggers error styling) */
  error?: string;
  /** Label text above the input */
  label?: string;
  /** Additional content before the input (for custom icons) */
  startAdornment?: ReactNode;
  /** Additional content after the input */
  endAdornment?: ReactNode;
};

type TextInputProps = BaseInputProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
    variant?: "text" | "search";
  };

type TextareaInputProps = BaseInputProps &
  TextareaHTMLAttributes<HTMLTextAreaElement> & {
    variant: "textarea";
  };

export type InputProps = TextInputProps | TextareaInputProps;

// Type guard to check if props are for textarea
function isTextareaProps(props: InputProps): props is TextareaInputProps {
  return props.variant === "textarea";
}

// =============================================================================
// SEARCH ICON COMPONENT
// =============================================================================

/**
 * Simple search icon using SVG.
 * Uses currentColor to inherit text color from parent.
 */
function SearchIcon({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      className={className}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

// =============================================================================
// STYLE CONFIGURATION
// =============================================================================

/**
 * Base styles for the input container/wrapper.
 */
const getWrapperStyles = (): React.CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-1)",
  width: "100%",
});

/**
 * Styles for the label element.
 */
const getLabelStyles = (): React.CSSProperties => ({
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  color: "var(--text-secondary)",
  lineHeight: "var(--line-height-tight)",
});

/**
 * Styles for the input field container (holds adornments and input).
 */
const getInputContainerStyles = (hasError: boolean, disabled: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-2) var(--spacing-3)",
  backgroundColor: "var(--bg-secondary)",
  border: hasError ? "1px solid var(--error)" : "1px solid var(--border-primary)",
  borderRadius: "var(--radius-lg)",
  transition: "all var(--transition-normal)",
  opacity: disabled ? 0.5 : 1,
  cursor: disabled ? "not-allowed" : "text",
});

/**
 * Styles for the actual input element.
 */
const getInputStyles = (disabled: boolean): React.CSSProperties => ({
  flex: 1,
  minWidth: 0,
  backgroundColor: "transparent",
  border: "none",
  outline: "none",
  fontSize: "var(--font-size-base)",
  fontFamily: "inherit",
  color: "var(--text-primary)",
  lineHeight: "var(--line-height-normal)",
  cursor: disabled ? "not-allowed" : "text",
});

/**
 * Styles for the textarea element.
 */
const getTextareaStyles = (disabled: boolean): React.CSSProperties => ({
  width: "100%",
  minHeight: "80px",
  padding: "var(--spacing-2) var(--spacing-3)",
  backgroundColor: "var(--bg-secondary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-lg)",
  outline: "none",
  fontSize: "var(--font-size-base)",
  fontFamily: "inherit",
  color: "var(--text-primary)",
  lineHeight: "var(--line-height-normal)",
  resize: "vertical",
  transition: "all var(--transition-normal)",
  opacity: disabled ? 0.5 : 1,
  cursor: disabled ? "not-allowed" : "text",
});

/**
 * Styles for error message text.
 */
const getErrorStyles = (): React.CSSProperties => ({
  fontSize: "var(--font-size-sm)",
  color: "var(--error)",
  marginTop: "var(--spacing-1)",
  lineHeight: "var(--line-height-tight)",
});

// =============================================================================
// INPUT COMPONENT
// =============================================================================

/**
 * Input component with theme-aware styling.
 *
 * Supports 3 variants:
 * - **text**: Standard text input (default)
 * - **search**: Text input with search icon
 * - **textarea**: Multiline text input
 */
export const Input = forwardRef<HTMLInputElement | HTMLTextAreaElement, InputProps>(
  function Input(props, ref) {
    const generatedId = useId();

    // Handle textarea variant separately
    if (isTextareaProps(props)) {
      const {
        variant: _variant,
        error,
        label,
        startAdornment: _startAdornment,
        endAdornment: _endAdornment,
        className = "",
        style,
        disabled,
        id,
        ...textareaProps
      } = props;

      const inputId = id ?? generatedId;
      const errorId = error ? `${inputId}-error` : undefined;
      const hasError = Boolean(error);

      const textareaStyles: React.CSSProperties = {
        ...getTextareaStyles(disabled ?? false),
        ...(hasError && { border: "1px solid var(--error)" }),
        ...style,
      };

      return (
        <div style={getWrapperStyles()}>
          {label && (
            <label htmlFor={inputId} style={getLabelStyles()}>
              {label}
            </label>
          )}
          <textarea
            ref={ref as React.Ref<HTMLTextAreaElement>}
            id={inputId}
            disabled={disabled}
            className={`
              placeholder:text-[var(--text-muted)]
              focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]
              ${className}
            `.trim()}
            style={textareaStyles}
            aria-invalid={hasError}
            aria-describedby={errorId}
            data-variant="textarea"
            data-error={hasError ? "true" : undefined}
            {...textareaProps}
          />
          {error && (
            <span id={errorId} style={getErrorStyles()} role="alert">
              {error}
            </span>
          )}
        </div>
      );
    }

    // Handle text and search variants
    const {
      variant = "text",
      error,
      label,
      startAdornment,
      endAdornment,
      className = "",
      style,
      disabled,
      id,
      ...inputProps
    } = props as TextInputProps;

    const inputId = id ?? generatedId;
    const errorId = error ? `${inputId}-error` : undefined;
    const hasError = Boolean(error);
    const isSearch = variant === "search";

    // For search variant, show search icon as start adornment
    const effectiveStartAdornment = isSearch ? (
      <SearchIcon
        style={{
          flexShrink: 0,
          color: "var(--text-tertiary)",
        }}
      />
    ) : (
      startAdornment
    );

    return (
      <div style={getWrapperStyles()}>
        {label && (
          <label htmlFor={inputId} style={getLabelStyles()}>
            {label}
          </label>
        )}
        <div
          className={`
            focus-within:border-[var(--accent-primary)] focus-within:ring-1 focus-within:ring-[var(--accent-primary)]
            ${className}
          `.trim()}
          style={{ ...getInputContainerStyles(hasError, disabled ?? false), ...style }}
          data-variant={variant}
          data-error={hasError ? "true" : undefined}
        >
          {effectiveStartAdornment}
          <input
            ref={ref as React.Ref<HTMLInputElement>}
            id={inputId}
            type="text"
            disabled={disabled}
            className="placeholder:text-[var(--text-muted)]"
            style={getInputStyles(disabled ?? false)}
            aria-invalid={hasError}
            aria-describedby={errorId}
            {...inputProps}
          />
          {endAdornment}
        </div>
        {error && (
          <span id={errorId} style={getErrorStyles()} role="alert">
            {error}
          </span>
        )}
      </div>
    );
  }
);

export default Input;
