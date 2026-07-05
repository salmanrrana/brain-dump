import type { FC } from "react";
import {
  getTicketStatusColorToken,
  getTicketStatusLabel,
  type TicketStatus,
} from "../../../core/workflow-steps.ts";
export type { TicketStatus } from "../../../core/workflow-steps.ts";

export interface StatusPillProps {
  status: TicketStatus;
  size?: "sm" | "md";
  className?: string;
  style?: React.CSSProperties;
}

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
  const color = getTicketStatusColorToken(status);
  const label = getTicketStatusLabel(status);
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
