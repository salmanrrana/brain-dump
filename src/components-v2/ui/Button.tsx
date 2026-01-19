/**
 * Button Component
 *
 * A versatile button component with 4 variants (primary, secondary, ghost, danger),
 * 3 sizes (sm, md, lg), and support for loading states and icons.
 *
 * Uses CSS custom properties from the design system for automatic theme adaptation.
 *
 * @example
 * ```tsx
 * import { Button } from '@/components-v2/ui/Button';
 * import { Save, Trash } from 'lucide-react';
 *
 * // Basic variants
 * <Button variant="primary">Save</Button>
 * <Button variant="secondary">Cancel</Button>
 * <Button variant="ghost">More</Button>
 * <Button variant="danger">Delete</Button>
 *
 * // With icons
 * <Button variant="primary" iconLeft={<Save />}>Save</Button>
 * <Button variant="danger" iconRight={<Trash />}>Delete</Button>
 *
 * // Loading state
 * <Button variant="primary" isLoading>Saving...</Button>
 *
 * // Sizes
 * <Button size="sm">Small</Button>
 * <Button size="md">Medium</Button>
 * <Button size="lg">Large</Button>
 * ```
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

// =============================================================================
// TYPES
// =============================================================================

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style variant */
  variant?: ButtonVariant;
  /** Button size */
  size?: ButtonSize;
  /** Show loading spinner and disable interactions */
  isLoading?: boolean;
  /** Icon to display on the left side */
  iconLeft?: ReactNode;
  /** Icon to display on the right side */
  iconRight?: ReactNode;
  /** Button contents */
  children?: ReactNode;
}

// =============================================================================
// SPINNER COMPONENT
// =============================================================================

/**
 * Simple loading spinner using CSS animation.
 * Inherits color from parent for seamless integration.
 */
function Spinner({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// =============================================================================
// STYLE CONFIGURATION
// =============================================================================

/**
 * Size-specific styles for padding, font size, and icon dimensions.
 */
const SIZE_STYLES: Record<
  ButtonSize,
  { padding: string; fontSize: string; iconSize: string; spinnerSize: string }
> = {
  sm: {
    padding: "var(--spacing-1) var(--spacing-3)",
    fontSize: "var(--font-size-sm)",
    iconSize: "16px",
    spinnerSize: "14px",
  },
  md: {
    padding: "var(--spacing-2) var(--spacing-4)",
    fontSize: "var(--font-size-base)",
    iconSize: "18px",
    spinnerSize: "16px",
  },
  lg: {
    padding: "var(--spacing-3) var(--spacing-6)",
    fontSize: "var(--font-size-lg)",
    iconSize: "20px",
    spinnerSize: "18px",
  },
};

/**
 * Variant-specific styles for colors, backgrounds, borders, and hover states.
 * Uses CSS custom properties to adapt to theme changes.
 */
const VARIANT_STYLES: Record<
  ButtonVariant,
  {
    background: string;
    color: string;
    border: string;
    hoverBackground: string;
    hoverBorder?: string;
  }
> = {
  primary: {
    background: "var(--gradient-accent)",
    color: "#ffffff",
    border: "none",
    hoverBackground: "var(--gradient-accent)",
  },
  secondary: {
    background: "transparent",
    color: "var(--text-primary)",
    border: "1px solid var(--border-secondary)",
    hoverBackground: "var(--bg-hover)",
    hoverBorder: "1px solid var(--accent-primary)",
  },
  ghost: {
    background: "transparent",
    color: "var(--text-secondary)",
    border: "none",
    hoverBackground: "var(--bg-hover)",
  },
  danger: {
    background: "var(--error)",
    color: "#ffffff",
    border: "none",
    hoverBackground: "#dc2626", // error-600 for hover
  },
};

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Button component with theme-aware styling.
 *
 * Supports 4 variants:
 * - **primary**: Gradient background using accent colors (for main actions)
 * - **secondary**: Transparent with border (for alternative actions)
 * - **ghost**: Transparent with no border (for subtle actions)
 * - **danger**: Red background (for destructive actions)
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    isLoading = false,
    iconLeft,
    iconRight,
    disabled,
    children,
    className = "",
    style,
    ...props
  },
  ref
) {
  const isDisabled = disabled || isLoading;
  const sizeStyles = SIZE_STYLES[size];
  const variantStyles = VARIANT_STYLES[variant];

  // Base styles that apply to all buttons
  const baseStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--spacing-2)",
    padding: sizeStyles.padding,
    fontSize: sizeStyles.fontSize,
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    lineHeight: "var(--line-height-tight)",
    borderRadius: "var(--radius-lg)",
    transition: "all var(--transition-normal)",
    cursor: isDisabled ? "not-allowed" : "pointer",
    opacity: isDisabled ? 0.5 : 1,
    background: variantStyles.background,
    color: variantStyles.color,
    border: variantStyles.border,
    ...style,
  };

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      className={`
        focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
        focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-[var(--bg-primary)]
        ${className}
      `.trim()}
      style={baseStyles}
      data-variant={variant}
      data-size={size}
      data-loading={isLoading ? "true" : undefined}
      onMouseEnter={(e) => {
        if (!isDisabled) {
          const target = e.currentTarget;
          target.style.background = variantStyles.hoverBackground;
          if (variantStyles.hoverBorder) {
            target.style.border = variantStyles.hoverBorder;
          }
          // Add brightness filter for primary to simulate hover
          if (variant === "primary") {
            target.style.filter = "brightness(1.1)";
          }
        }
        props.onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        if (!isDisabled) {
          const target = e.currentTarget;
          target.style.background = variantStyles.background;
          target.style.border = variantStyles.border;
          target.style.filter = "none";
        }
        props.onMouseLeave?.(e);
      }}
      {...props}
    >
      {/* Loading spinner replaces left icon when loading */}
      {isLoading ? (
        <Spinner
          className="shrink-0"
          style={{ width: sizeStyles.spinnerSize, height: sizeStyles.spinnerSize }}
        />
      ) : (
        iconLeft && (
          <span
            className="shrink-0"
            style={{ width: sizeStyles.iconSize, height: sizeStyles.iconSize }}
          >
            {iconLeft}
          </span>
        )
      )}

      {/* Button text */}
      {children && <span>{children}</span>}

      {/* Right icon (not shown when loading) */}
      {iconRight && !isLoading && (
        <span
          className="shrink-0"
          style={{ width: sizeStyles.iconSize, height: sizeStyles.iconSize }}
        >
          {iconRight}
        </span>
      )}
    </button>
  );
});

export default Button;
