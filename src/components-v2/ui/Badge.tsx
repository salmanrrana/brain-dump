/**
 * Badge Component
 *
 * A versatile badge component for displaying status, priority, and PR status indicators.
 * Uses pill shape with rounded corners and size variants (sm, md).
 *
 * Uses CSS custom properties from the design system for automatic theme adaptation.
 *
 * @example
 * ```tsx
 * import { Badge } from '@/components-v2/ui/Badge';
 *
 * // Status badges (for ticket workflow)
 * <Badge variant="status" value="backlog" />
 * <Badge variant="status" value="in_progress" />
 * <Badge variant="status" value="review" />
 * <Badge variant="status" value="done" />
 *
 * // Priority badges
 * <Badge variant="priority" value="high" />
 * <Badge variant="priority" value="medium" />
 * <Badge variant="priority" value="low" />
 *
 * // PR status badges
 * <Badge variant="pr-status" value="open" />
 * <Badge variant="pr-status" value="draft" />
 * <Badge variant="pr-status" value="merged" />
 * <Badge variant="pr-status" value="closed" />
 *
 * // Size variants
 * <Badge variant="status" value="done" size="sm" />
 * <Badge variant="status" value="done" size="md" />
 * ```
 */

import { forwardRef, type HTMLAttributes } from "react";

// =============================================================================
// TYPES
// =============================================================================

export type BadgeVariant = "status" | "priority" | "pr-status";
export type BadgeSize = "sm" | "md";

export type StatusValue =
  | "backlog"
  | "ready"
  | "in_progress"
  | "review"
  | "ai_review"
  | "human_review"
  | "done";
export type PriorityValue = "high" | "medium" | "low";
export type PrStatusValue = "open" | "draft" | "merged" | "closed";

export type BadgeValue = StatusValue | PriorityValue | PrStatusValue;

export interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  /** Badge variant determines the color mapping */
  variant: BadgeVariant;
  /** Value to display - type depends on variant */
  value: BadgeValue;
  /** Badge size */
  size?: BadgeSize;
}

// =============================================================================
// STYLE CONFIGURATION
// =============================================================================

/**
 * Size-specific styles for padding and font size.
 */
const SIZE_STYLES: Record<BadgeSize, { padding: string; fontSize: string }> = {
  sm: {
    padding: "var(--spacing-1) var(--spacing-2)",
    fontSize: "var(--font-size-xs)",
  },
  md: {
    padding: "var(--spacing-1) var(--spacing-3)",
    fontSize: "var(--font-size-sm)",
  },
};

/**
 * Status value color mapping using CSS custom properties.
 * Colors match the workflow states in Brain Dump.
 */
const STATUS_COLORS: Record<StatusValue, string> = {
  backlog: "var(--status-backlog)",
  ready: "var(--status-ready)",
  in_progress: "var(--status-in-progress)",
  review: "var(--status-review)",
  ai_review: "var(--status-review)", // Same as review
  human_review: "var(--status-review)", // Same as review
  done: "var(--status-done)",
};

/**
 * Priority value color mapping.
 */
const PRIORITY_COLORS: Record<PriorityValue, string> = {
  high: "var(--priority-high)",
  medium: "var(--priority-medium)",
  low: "var(--priority-low)",
};

/**
 * PR status value color mapping.
 */
const PR_STATUS_COLORS: Record<PrStatusValue, string> = {
  open: "var(--pr-open)",
  draft: "var(--pr-draft)",
  merged: "var(--pr-merged)",
  closed: "var(--pr-closed)",
};

/**
 * Display labels for each value.
 * Converts snake_case to human-readable format.
 */
const DISPLAY_LABELS: Record<BadgeValue, string> = {
  // Status
  backlog: "Backlog",
  ready: "Ready",
  in_progress: "In Progress",
  review: "Review",
  ai_review: "AI Review",
  human_review: "Human Review",
  done: "Done",
  // Priority
  high: "High",
  medium: "Medium",
  low: "Low",
  // PR Status
  open: "Open",
  draft: "Draft",
  merged: "Merged",
  closed: "Closed",
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get the background color for a badge based on its variant and value.
 */
function getBackgroundColor(variant: BadgeVariant, value: BadgeValue): string {
  switch (variant) {
    case "status":
      return STATUS_COLORS[value as StatusValue] ?? "var(--status-backlog)";
    case "priority":
      return PRIORITY_COLORS[value as PriorityValue] ?? "var(--priority-low)";
    case "pr-status":
      return PR_STATUS_COLORS[value as PrStatusValue] ?? "var(--pr-draft)";
    default:
      return "var(--status-backlog)";
  }
}

/** Text color for all badges - white for contrast against colored backgrounds */
const BADGE_TEXT_COLOR = "#ffffff";

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Badge component for displaying status, priority, and PR status indicators.
 *
 * Features:
 * - **Status variant**: Displays workflow states (backlog, ready, in_progress, review, done)
 * - **Priority variant**: Displays priority levels (high, medium, low)
 * - **PR-status variant**: Displays PR states (open, draft, merged, closed)
 * - **Sizes**: sm and md for different contexts
 * - **Pill shape**: Fully rounded corners for visual distinction
 */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { variant, value, size = "md", className = "", style, ...props },
  ref
) {
  const sizeStyles = SIZE_STYLES[size];
  const backgroundColor = getBackgroundColor(variant, value);
  const displayLabel = DISPLAY_LABELS[value] ?? value;

  // Base styles for all badges
  const baseStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: sizeStyles.padding,
    fontSize: sizeStyles.fontSize,
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    lineHeight: "var(--line-height-tight)",
    borderRadius: "var(--radius-full)", // Pill shape
    backgroundColor,
    color: BADGE_TEXT_COLOR,
    whiteSpace: "nowrap",
    textTransform: "capitalize",
    ...style,
  };

  return (
    <span
      ref={ref}
      className={className}
      style={baseStyles}
      data-variant={variant}
      data-value={value}
      data-size={size}
      {...props}
    >
      {displayLabel}
    </span>
  );
});

export default Badge;
