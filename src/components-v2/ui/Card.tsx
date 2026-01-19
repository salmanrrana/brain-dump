/**
 * Card Component
 *
 * A versatile container component with support for hover states and
 * an optional glow effect for AI-active states.
 *
 * Uses CSS custom properties from the design system for automatic theme adaptation.
 *
 * @example
 * ```tsx
 * import { Card } from '@/components-v2/ui/Card';
 *
 * // Basic card
 * <Card>Basic card content</Card>
 *
 * // Card with glow effect (for AI-active states)
 * <Card glow>AI is working on this</Card>
 *
 * // Clickable card with hover effect
 * <Card hoverable onClick={handleClick}>Clickable card</Card>
 *
 * // Card with custom padding
 * <Card padding="lg">More spacious content</Card>
 * ```
 */

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

// =============================================================================
// TYPES
// =============================================================================

export type CardPadding = "none" | "sm" | "md" | "lg";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Enable pulsing glow effect using accent color (for AI-active states) */
  glow?: boolean;
  /** Enable hover state with elevated appearance */
  hoverable?: boolean;
  /** Padding size */
  padding?: CardPadding;
  /** Card contents */
  children?: ReactNode;
}

// =============================================================================
// STYLE CONFIGURATION
// =============================================================================

/**
 * Padding values mapped to CSS custom properties.
 */
const PADDING_STYLES: Record<CardPadding, string> = {
  none: "0",
  sm: "var(--spacing-3)",
  md: "var(--spacing-4)",
  lg: "var(--spacing-6)",
};

// =============================================================================
// KEYFRAMES CSS
// =============================================================================

/**
 * CSS keyframes for the glow pulse animation.
 * Injected into head on first render if glow is used.
 */
const GLOW_KEYFRAMES = `
@keyframes card-glow-pulse {
  0%, 100% {
    box-shadow: 0 0 20px var(--accent-glow), 0 0 40px var(--accent-glow);
  }
  50% {
    box-shadow: 0 0 30px var(--accent-glow), 0 0 60px var(--accent-glow);
  }
}
`;

let keyframesInjected = false;

function injectKeyframes(): void {
  if (typeof document === "undefined" || keyframesInjected) return;

  const style = document.createElement("style");
  style.textContent = GLOW_KEYFRAMES;
  document.head.appendChild(style);
  keyframesInjected = true;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Card component with theme-aware styling.
 *
 * Features:
 * - **Background**: Uses `--bg-card` for consistent dark theme appearance
 * - **Border**: Uses `--border-primary` for subtle definition
 * - **Glow**: Optional pulsing glow effect using accent color (great for AI-active states)
 * - **Hoverable**: Optional hover state with elevated appearance
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { glow = false, hoverable = false, padding = "md", children, className = "", style, ...props },
  ref
) {
  // Inject keyframes if glow is enabled
  if (glow) {
    injectKeyframes();
  }

  // Base styles for all cards
  const baseStyles: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border-primary)",
    borderRadius: "var(--radius-xl)",
    padding: PADDING_STYLES[padding],
    transition: "all var(--transition-normal)",
    ...(glow && {
      animation: "card-glow-pulse 2s ease-in-out infinite",
      borderColor: "var(--accent-primary)",
    }),
    ...(hoverable && {
      cursor: "pointer",
    }),
    ...style,
  };

  return (
    <div
      ref={ref}
      className={`
        ${hoverable ? "hover:bg-[var(--bg-hover)] hover:border-[var(--border-secondary)] hover:shadow-lg" : ""}
        ${className}
      `.trim()}
      style={baseStyles}
      data-glow={glow ? "true" : undefined}
      data-hoverable={hoverable ? "true" : undefined}
      onMouseEnter={(e) => {
        if (hoverable) {
          const target = e.currentTarget;
          target.style.background = "var(--bg-hover)";
          target.style.borderColor = "var(--border-secondary)";
          target.style.boxShadow = "var(--shadow-lg)";
        }
        props.onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        if (hoverable) {
          const target = e.currentTarget;
          target.style.background = "var(--bg-card)";
          target.style.borderColor = glow ? "var(--accent-primary)" : "var(--border-primary)";
          target.style.boxShadow = glow ? "" : "none";
        }
        props.onMouseLeave?.(e);
      }}
      {...props}
    >
      {children}
    </div>
  );
});

export default Card;
