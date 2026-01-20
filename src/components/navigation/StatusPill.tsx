import { type FC, useMemo } from "react";

export type TicketStatus =
  | "backlog"
  | "ready"
  | "in_progress"
  | "review"
  | "ai_review"
  | "human_review"
  | "done";

export interface StatusPillProps {
  /** The ticket status to display */
  status: TicketStatus;
  /** Size variant */
  size?: "sm" | "md";
  /** Additional className for the container */
  className?: string;
  /** Additional inline styles */
  style?: React.CSSProperties;
}

/**
 * Color mapping for each status value.
 * Uses CSS custom properties defined in variables.css.
 */
const STATUS_COLORS: Record<TicketStatus, string> = {
  backlog: "var(--status-backlog)",
  ready: "var(--status-ready)",
  in_progress: "var(--status-in-progress)",
  review: "var(--status-review)",
  ai_review: "var(--status-review)", // Same as review
  human_review: "var(--status-review)", // Same as review
  done: "var(--status-done)",
};

/**
 * Display labels for each status value.
 * Converts snake_case to human-readable format.
 */
const STATUS_LABELS: Record<TicketStatus, string> = {
  backlog: "Backlog",
  ready: "Ready",
  in_progress: "In Progress",
  review: "Review",
  ai_review: "AI Review",
  human_review: "Human Review",
  done: "Done",
};

/**
 * Size configurations for the pill and dot.
 */
const SIZE_CONFIG = {
  sm: {
    dotSize: "6px",
    fontSize: "var(--font-size-xs)",
    gap: "var(--spacing-1)",
    padding: "var(--spacing-1) var(--spacing-2)",
  },
  md: {
    dotSize: "8px",
    fontSize: "var(--font-size-sm)",
    gap: "var(--spacing-2)",
    padding: "var(--spacing-1) var(--spacing-3)",
  },
};

/**
 * StatusPill - Compact status indicator with colored dot and label.
 *
 * Features:
 * - **Colored dot**: Small circle indicator matching status color
 * - **Label text**: Human-readable status name
 * - **Two sizes**: sm (compact) and md (default)
 * - **Theme-aware**: Uses CSS custom properties for colors
 *
 * Design:
 * ```
 * ● In Progress
 * ^-- colored dot
 * ```
 *
 * Use cases:
 * - Ticket cards in kanban view
 * - Current focus card in dashboard
 * - Up next queue items
 * - Any compact status display
 */
export const StatusPill: FC<StatusPillProps> = ({ status, size = "md", className = "", style }) => {
  const color = STATUS_COLORS[status];
  const label = STATUS_LABELS[status];
  const sizeConfig = SIZE_CONFIG[size];

  const containerStyles: React.CSSProperties = useMemo(
    () => ({
      display: "inline-flex",
      alignItems: "center",
      gap: sizeConfig.gap,
      padding: sizeConfig.padding,
      backgroundColor: "var(--bg-tertiary)",
      borderRadius: "var(--radius-full)",
      ...style,
    }),
    [sizeConfig, style]
  );

  const dotStyles: React.CSSProperties = useMemo(
    () => ({
      width: sizeConfig.dotSize,
      height: sizeConfig.dotSize,
      borderRadius: "50%",
      backgroundColor: color,
      flexShrink: 0,
    }),
    [sizeConfig.dotSize, color]
  );

  const labelStyles: React.CSSProperties = useMemo(
    () => ({
      fontSize: sizeConfig.fontSize,
      fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
      color: "var(--text-secondary)",
      whiteSpace: "nowrap",
    }),
    [sizeConfig.fontSize]
  );

  return (
    <span
      className={className}
      style={containerStyles}
      data-status={status}
      data-size={size}
      role="status"
      aria-label={`Status: ${label}`}
    >
      <span style={dotStyles} aria-hidden="true" />
      <span style={labelStyles}>{label}</span>
    </span>
  );
};

export default StatusPill;
