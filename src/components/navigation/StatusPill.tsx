import type { FC } from "react";

export type TicketStatus =
  | "backlog"
  | "ready"
  | "in_progress"
  | "ai_review"
  | "human_review"
  | "done";

export interface StatusPillProps {
  status: TicketStatus;
  size?: "sm" | "md";
  className?: string;
  style?: React.CSSProperties;
}

// Maps status to CSS custom properties from variables.css
const STATUS_COLORS: Record<TicketStatus, string> = {
  backlog: "var(--status-backlog)",
  ready: "var(--status-ready)",
  in_progress: "var(--status-in-progress)",
  ai_review: "var(--status-review)",
  human_review: "var(--status-review)",
  done: "var(--status-done)",
};

// Labels match Brain Dump's PRD terminology
const STATUS_LABELS: Record<TicketStatus, string> = {
  backlog: "Backlog",
  ready: "Ready",
  in_progress: "In Progress",
  ai_review: "AI Review",
  human_review: "Human Review",
  done: "Done",
};

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
 * Compact status indicator with colored dot and label.
 * Used in ticket cards, dashboard focus card, and up-next queue.
 */
export const StatusPill: FC<StatusPillProps> = ({ status, size = "md", className = "", style }) => {
  const color = STATUS_COLORS[status];
  const label = STATUS_LABELS[status];
  const sizeConfig = SIZE_CONFIG[size];

  const containerStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: sizeConfig.gap,
    padding: sizeConfig.padding,
    backgroundColor: "var(--bg-tertiary)",
    borderRadius: "var(--radius-full)",
    ...style,
  };

  const dotStyles: React.CSSProperties = {
    width: sizeConfig.dotSize,
    height: sizeConfig.dotSize,
    borderRadius: "50%",
    backgroundColor: color,
    flexShrink: 0,
  };

  const labelStyles: React.CSSProperties = {
    fontSize: sizeConfig.fontSize,
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    color: "var(--text-secondary)",
    whiteSpace: "nowrap",
  };

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
