/**
 * Toggle Component
 *
 * A switch-style toggle for boolean settings with smooth animations,
 * gradient fill when ON, and full accessibility support.
 *
 * Uses CSS custom properties from the design system for automatic theme adaptation.
 *
 * @example
 * ```tsx
 * import { Toggle } from '@/components-v2/ui/Toggle';
 *
 * // Basic usage
 * <Toggle checked={enabled} onChange={setEnabled} />
 *
 * // With label
 * <Toggle checked={enabled} onChange={setEnabled} label="Enable notifications" />
 *
 * // Disabled state
 * <Toggle checked={true} disabled />
 *
 * // Different sizes
 * <Toggle size="sm" checked={enabled} onChange={setEnabled} />
 * <Toggle size="lg" checked={enabled} onChange={setEnabled} />
 * ```
 */

import { forwardRef, useId, type InputHTMLAttributes } from "react";

// =============================================================================
// TYPES
// =============================================================================

export type ToggleSize = "sm" | "md" | "lg";

export interface ToggleProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "size" | "onChange"
> {
  /** Whether the toggle is checked (ON) */
  checked?: boolean;
  /** Callback when toggle state changes */
  onChange?: (checked: boolean) => void;
  /** Toggle size */
  size?: ToggleSize;
  /** Optional label text displayed next to toggle */
  label?: string;
  /** Position of the label relative to toggle */
  labelPosition?: "left" | "right";
}

// =============================================================================
// STYLE CONFIGURATION
// =============================================================================

/**
 * Size-specific dimensions for the toggle track and thumb.
 */
const SIZE_STYLES: Record<
  ToggleSize,
  {
    trackWidth: string;
    trackHeight: string;
    thumbSize: string;
    thumbOffset: string;
    thumbTranslate: string;
    fontSize: string;
  }
> = {
  sm: {
    trackWidth: "36px",
    trackHeight: "20px",
    thumbSize: "16px",
    thumbOffset: "2px",
    thumbTranslate: "16px", // trackWidth - thumbSize - (thumbOffset * 2)
    fontSize: "var(--font-size-sm)",
  },
  md: {
    trackWidth: "44px",
    trackHeight: "24px",
    thumbSize: "20px",
    thumbOffset: "2px",
    thumbTranslate: "20px",
    fontSize: "var(--font-size-base)",
  },
  lg: {
    trackWidth: "52px",
    trackHeight: "28px",
    thumbSize: "24px",
    thumbOffset: "2px",
    thumbTranslate: "24px",
    fontSize: "var(--font-size-base)",
  },
};

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Toggle component with accessible switch styling.
 *
 * Features:
 * - **Gradient fill when ON** using theme accent colors
 * - **Gray fill when OFF** using neutral colors
 * - **Smooth slide animation** for the thumb
 * - **Full accessibility** with role="switch" and aria-checked
 * - **Disabled state** with reduced opacity
 */
export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(function Toggle(
  {
    checked = false,
    onChange,
    size = "md",
    label,
    labelPosition = "right",
    disabled = false,
    className = "",
    id: providedId,
    ...props
  },
  ref
) {
  // Generate a unique ID if not provided (for label association)
  const generatedId = useId();
  const inputId = providedId ?? `toggle-${generatedId}`;

  const sizeStyles = SIZE_STYLES[size];

  // Track styles (the background container)
  const trackStyles: React.CSSProperties = {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    width: sizeStyles.trackWidth,
    height: sizeStyles.trackHeight,
    borderRadius: "var(--radius-full)",
    background: checked ? "var(--gradient-accent)" : "var(--bg-tertiary)",
    border: checked ? "none" : "1px solid var(--border-primary)",
    transition: "all var(--transition-normal)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    flexShrink: 0,
  };

  // Thumb styles (the sliding circle)
  const thumbStyles: React.CSSProperties = {
    position: "absolute",
    left: sizeStyles.thumbOffset,
    width: sizeStyles.thumbSize,
    height: sizeStyles.thumbSize,
    borderRadius: "var(--radius-full)",
    background: checked ? "#ffffff" : "var(--text-secondary)",
    boxShadow: "var(--shadow-sm)",
    transition: "transform var(--transition-normal), background var(--transition-normal)",
    transform: checked ? `translateX(${sizeStyles.thumbTranslate})` : "translateX(0)",
  };

  // Label styles
  const labelStyles: React.CSSProperties = {
    fontSize: sizeStyles.fontSize,
    color: disabled ? "var(--text-muted)" : "var(--text-primary)",
    cursor: disabled ? "not-allowed" : "pointer",
    userSelect: "none",
  };

  // Container styles (for label + toggle alignment)
  const containerStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--spacing-3)",
    flexDirection: labelPosition === "left" ? "row-reverse" : "row",
  };

  const handleChange = () => {
    if (!disabled) {
      onChange?.(!checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Space and Enter should toggle (Space is handled by checkbox natively)
    if (e.key === "Enter") {
      e.preventDefault();
      handleChange();
    }
  };

  return (
    <div style={containerStyles} className={className}>
      {/* Visually hidden checkbox for accessibility */}
      <input
        ref={ref}
        type="checkbox"
        id={inputId}
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        aria-checked={checked}
        aria-label={label || props["aria-label"]}
        style={{
          position: "absolute",
          width: "1px",
          height: "1px",
          padding: 0,
          margin: "-1px",
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
        {...props}
      />

      {/* Visual toggle track (clickable) */}
      <label
        htmlFor={inputId}
        style={trackStyles}
        data-checked={checked ? "true" : "false"}
        data-disabled={disabled ? "true" : undefined}
        data-size={size}
      >
        {/* Thumb */}
        <span style={thumbStyles} aria-hidden="true" />
      </label>

      {/* Optional text label */}
      {label && (
        <label htmlFor={inputId} style={labelStyles}>
          {label}
        </label>
      )}
    </div>
  );
});

export default Toggle;
