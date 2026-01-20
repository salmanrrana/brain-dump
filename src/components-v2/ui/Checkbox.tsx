import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";
import { Check, Minus } from "lucide-react";

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "onChange"
> {
  /** Whether the checkbox is checked */
  checked?: boolean;
  /** Whether the checkbox is in indeterminate state (partial selection) */
  indeterminate?: boolean;
  /** Callback when checked state changes */
  onChange?: (checked: boolean) => void;
  /** Label text displayed next to the checkbox */
  label?: string;
  /** Additional CSS classes for the container */
  className?: string;
}

/**
 * Styles for the visually hidden native checkbox.
 * Uses the standard "sr-only" pattern but keeps the input accessible.
 */
const getHiddenInputStyles = (): React.CSSProperties => ({
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
});

/**
 * Styles for the container label element.
 */
const getContainerStyles = (disabled: boolean): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.5 : 1,
  userSelect: "none",
});

/**
 * Styles for the custom checkbox visual.
 */
const getCheckboxVisualStyles = (
  checked: boolean,
  indeterminate: boolean,
  focused: boolean
): React.CSSProperties => {
  const isActive = checked || indeterminate;

  return {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "18px",
    height: "18px",
    borderRadius: "var(--radius-sm)",
    border: isActive ? "1px solid var(--accent-primary)" : "1px solid var(--border-secondary)",
    backgroundColor: isActive ? "var(--accent-primary)" : "transparent",
    transition:
      "background-color var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast)",
    boxShadow: focused ? "0 0 0 2px var(--accent-muted)" : "none",
    flexShrink: 0,
  };
};

/**
 * Styles for the check/minus icon.
 */
const getIconStyles = (): React.CSSProperties => ({
  width: "12px",
  height: "12px",
  color: "white",
  strokeWidth: 3,
});

/**
 * Styles for the label text.
 */
const getLabelStyles = (): React.CSSProperties => ({
  fontSize: "var(--font-size-sm)",
  color: "var(--text-primary)",
  lineHeight: "var(--line-height-normal)",
});

/**
 * Custom styled Checkbox component.
 *
 * Features:
 * - Custom styled visual (not native checkbox)
 * - Checkmark uses accent color
 * - Indeterminate state support (shows minus icon)
 * - Label support (inline text)
 * - Disabled state (reduced opacity, not-allowed cursor)
 * - Accessible (visually hidden native input underneath)
 * - Focus ring for keyboard navigation
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      checked = false,
      indeterminate = false,
      onChange,
      label,
      disabled = false,
      className = "",
      id: providedId,
      ...inputProps
    },
    ref
  ) => {
    // Generate a unique ID if not provided
    const generatedId = useId();
    const id = providedId ?? generatedId;

    // Track focus state for visual feedback
    const [isFocused, setIsFocused] = useState(false);

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      inputProps.onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      inputProps.onBlur?.(e);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!disabled) {
        onChange?.(e.target.checked);
      }
    };

    // Determine what icon to show
    const showIndeterminate = indeterminate;
    const showCheck = checked && !indeterminate;

    return (
      <label
        htmlFor={id}
        style={getContainerStyles(disabled)}
        className={className}
        data-testid="checkbox-container"
      >
        {/* Visually hidden native checkbox for accessibility */}
        <input
          ref={ref}
          type="checkbox"
          id={id}
          checked={checked}
          disabled={disabled}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          aria-checked={indeterminate ? "mixed" : checked}
          style={getHiddenInputStyles()}
          data-testid="checkbox-input"
          {...inputProps}
        />

        {/* Custom checkbox visual */}
        <div
          style={getCheckboxVisualStyles(checked, indeterminate, isFocused)}
          data-testid="checkbox-visual"
          aria-hidden="true"
        >
          {showIndeterminate && (
            <Minus style={getIconStyles()} data-testid="checkbox-indeterminate-icon" />
          )}
          {showCheck && <Check style={getIconStyles()} data-testid="checkbox-check-icon" />}
        </div>

        {/* Label text */}
        {label && (
          <span style={getLabelStyles()} data-testid="checkbox-label">
            {label}
          </span>
        )}
      </label>
    );
  }
);

Checkbox.displayName = "Checkbox";

export default Checkbox;
