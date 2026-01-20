import { forwardRef, useState, type ButtonHTMLAttributes, type ElementType } from "react";

export type IconButtonVariant = "ghost" | "filled";
export type IconButtonSize = "sm" | "md" | "lg";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Lucide React icon component */
  icon: ElementType;
  /** Visual style variant */
  variant?: IconButtonVariant;
  /** Button size (determines both button and icon dimensions) */
  size?: IconButtonSize;
  /** Tooltip text to show on hover */
  tooltip?: string;
}

/**
 * Size-specific styles for button dimensions and icon sizing.
 * Maintains 1:1 aspect ratio as per acceptance criteria.
 */
const SIZE_STYLES: Record<IconButtonSize, { buttonSize: string; iconSize: number }> = {
  sm: {
    buttonSize: "24px",
    iconSize: 14,
  },
  md: {
    buttonSize: "32px",
    iconSize: 18,
  },
  lg: {
    buttonSize: "40px",
    iconSize: 22,
  },
};

/**
 * Variant-specific styles for colors, backgrounds, and borders.
 * Uses CSS custom properties to adapt to theme changes.
 */
const VARIANT_STYLES: Record<
  IconButtonVariant,
  {
    background: string;
    color: string;
    border: string;
    hoverBackground: string;
  }
> = {
  ghost: {
    background: "transparent",
    color: "var(--text-secondary)",
    border: "none",
    hoverBackground: "var(--bg-hover)",
  },
  filled: {
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-primary)",
    hoverBackground: "var(--bg-hover)",
  },
};

/**
 * CSS keyframes for tooltip fade-in animation.
 * Injected into head on first render if tooltip is used.
 */
const TOOLTIP_KEYFRAMES = `
@keyframes iconbutton-tooltip-fade {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
`;

let keyframesInjected = false;

function injectKeyframes(): void {
  if (typeof document === "undefined" || keyframesInjected) return;

  try {
    const style = document.createElement("style");
    style.textContent = TOOLTIP_KEYFRAMES;
    document.head.appendChild(style);
    keyframesInjected = true;
  } catch {
    // Tooltip animation will not be available, but component remains functional
  }
}

/**
 * IconButton component for icon-only actions.
 *
 * Features:
 * - **Square shape**: Maintains 1:1 aspect ratio for clean icon-only appearance
 * - **Two variants**: Ghost (transparent) and Filled (subtle background)
 * - **Three sizes**: sm (24px), md (32px), lg (40px)
 * - **Optional tooltip**: Shows on hover for accessibility context
 * - **Theme-aware**: Uses CSS custom properties for automatic theme adaptation
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon: Icon,
    variant = "ghost",
    size = "md",
    tooltip,
    disabled,
    className = "",
    style,
    ...props
  },
  ref
) {
  const [showTooltip, setShowTooltip] = useState(false);
  const sizeStyles = SIZE_STYLES[size];
  const variantStyles = VARIANT_STYLES[variant];

  // Use tooltip as fallback for aria-label if not provided
  const effectiveAriaLabel = props["aria-label"] ?? tooltip;

  // Warn in development if no accessible label is provided
  if (process.env.NODE_ENV === "development" && !effectiveAriaLabel) {
    console.warn(
      "[IconButton] Missing accessible label. Provide either aria-label or tooltip prop for screen reader support."
    );
  }

  // Inject keyframes if tooltip is used
  if (tooltip) {
    injectKeyframes();
  }

  // Base styles for the button
  const baseStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: sizeStyles.buttonSize,
    height: sizeStyles.buttonSize,
    minWidth: sizeStyles.buttonSize,
    minHeight: sizeStyles.buttonSize,
    borderRadius: "var(--radius-lg)",
    transition: "all var(--transition-normal)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    background: variantStyles.background,
    color: variantStyles.color,
    border: variantStyles.border,
    position: "relative",
    ...style,
  };

  // Tooltip styles
  const tooltipStyles: React.CSSProperties = {
    position: "absolute",
    top: "100%",
    left: "50%",
    transform: "translateX(-50%)",
    marginTop: "8px",
    padding: "var(--spacing-1) var(--spacing-2)",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    fontSize: "var(--font-size-xs)",
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--border-secondary)",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    zIndex: "var(--z-tooltip)",
    animation: "iconbutton-tooltip-fade 150ms ease-out",
    boxShadow: "var(--shadow-md)",
  };

  return (
    <button
      ref={ref}
      disabled={disabled}
      className={`
        focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
        focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-[var(--bg-primary)]
        ${className}
      `.trim()}
      style={baseStyles}
      data-variant={variant}
      data-size={size}
      onMouseEnter={(e) => {
        if (!disabled) {
          const target = e.currentTarget;
          target.style.background = variantStyles.hoverBackground;
          target.style.color = "var(--text-primary)";
          if (tooltip) setShowTooltip(true);
        }
        props.onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          const target = e.currentTarget;
          target.style.background = variantStyles.background;
          target.style.color = variantStyles.color;
          if (tooltip) setShowTooltip(false);
        }
        props.onMouseLeave?.(e);
      }}
      {...props}
      aria-label={effectiveAriaLabel}
    >
      <Icon size={sizeStyles.iconSize} aria-hidden="true" />

      {/* Tooltip */}
      {tooltip && showTooltip && (
        <span role="tooltip" style={tooltipStyles}>
          {tooltip}
        </span>
      )}
    </button>
  );
});

export default IconButton;
