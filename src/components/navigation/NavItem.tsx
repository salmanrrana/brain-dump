import {
  forwardRef,
  useState,
  useEffect,
  type ButtonHTMLAttributes,
  type ElementType,
} from "react";

export interface NavItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Lucide React icon component */
  icon: ElementType;
  /** Label text for tooltip and accessibility */
  label: string;
  /** Whether this item is currently active */
  active?: boolean;
  /** Custom size for the button (defaults to 44px square) */
  size?: number;
}

/**
 * CSS keyframes for tooltip fade-in animation.
 * Positioned to the right of the nav item (not below like IconButton).
 */
const TOOLTIP_KEYFRAMES = `
@keyframes navitem-tooltip-fade {
  from {
    opacity: 0;
    transform: translateY(-50%) translateX(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(-50%) translateX(0);
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
  } catch (error) {
    // Tooltip animation will not be available, but component remains functional
    if (process.env.NODE_ENV !== "production") {
      console.warn("[NavItem] Failed to inject tooltip keyframes:", error);
    }
  }
}

/**
 * NavItem component for sidebar navigation.
 *
 * Features:
 * - **Icon centered in square button**: 44px default size with centered icon
 * - **Tooltip on hover**: Appears to the right of the item
 * - **Active state**: Gradient background + glow effect
 * - **Hover state**: Subtle background change
 * - **Keyboard accessible**: Tab to focus, Enter/Space to activate
 * - **aria-current**: Set to "page" when active for screen readers
 */
export const NavItem = forwardRef<HTMLButtonElement, NavItemProps>(function NavItem(
  { icon: Icon, label, active = false, size = 44, disabled, className = "", style, ...props },
  ref
) {
  const [showTooltip, setShowTooltip] = useState(false);
  const iconSize = Math.round(size * 0.5);

  // Inject keyframes for tooltip animation (useEffect to avoid side effects during render)
  useEffect(() => {
    injectKeyframes();
  }, []);

  // Base styles for the button
  const baseStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: `${size}px`,
    height: `${size}px`,
    minWidth: `${size}px`,
    minHeight: `${size}px`,
    borderRadius: "var(--radius-lg)",
    transition: "all var(--transition-normal)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    background: active ? "var(--gradient-accent)" : "transparent",
    color: active ? "var(--text-on-accent)" : "var(--text-secondary)",
    border: "none",
    position: "relative",
    boxShadow: active ? "var(--shadow-glow)" : "none",
    ...style,
  };

  // Tooltip styles - appears to the right of the button
  const tooltipStyles: React.CSSProperties = {
    position: "absolute",
    left: "100%",
    top: "50%",
    transform: "translateY(-50%)",
    marginLeft: "12px",
    padding: "var(--spacing-1) var(--spacing-3)",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    fontSize: "var(--font-size-sm)",
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--border-secondary)",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    zIndex: "var(--z-tooltip)",
    animation: "navitem-tooltip-fade 150ms ease-out",
    boxShadow: "var(--shadow-md)",
  };

  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      className={`
        focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
        focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-[var(--bg-secondary)]
        ${className}
      `.trim()}
      style={baseStyles}
      data-active={active ? "true" : undefined}
      onMouseEnter={(e) => {
        if (!disabled) {
          if (!active) {
            const target = e.currentTarget;
            target.style.background = "var(--bg-hover)";
          }
          setShowTooltip(true);
        }
        props.onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          if (!active) {
            const target = e.currentTarget;
            target.style.background = "transparent";
          }
          setShowTooltip(false);
        }
        props.onMouseLeave?.(e);
      }}
      onFocus={(e) => {
        if (!disabled && !active) {
          const target = e.currentTarget;
          target.style.background = "var(--bg-hover)";
        }
        setShowTooltip(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        if (!disabled && !active) {
          const target = e.currentTarget;
          target.style.background = "transparent";
        }
        setShowTooltip(false);
        props.onBlur?.(e);
      }}
      {...props}
    >
      <Icon size={iconSize} aria-hidden="true" />

      {/* Tooltip - appears to the right */}
      {showTooltip && (
        <span role="tooltip" style={tooltipStyles}>
          {label}
        </span>
      )}
    </button>
  );
});

export default NavItem;
