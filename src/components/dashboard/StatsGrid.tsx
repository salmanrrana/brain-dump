import { type FC } from "react";
import { Ticket, Clock, Zap, Check, type LucideIcon } from "lucide-react";

export interface StatsGridProps {
  /** Total number of tickets */
  total: number;
  /** Number of tickets in progress */
  inProgress: number;
  /** Number of tickets with active AI/Ralph session */
  aiActive: number;
  /** Number of completed tickets */
  done: number;
  /** Handler called when a stat card is clicked with its filter type */
  onStatClick?: (filter: StatFilter) => void;
}

/** Filter types that can be applied when clicking stat cards */
export type StatFilter = "all" | "in_progress" | "ai_active" | "done";

interface StatConfig {
  icon: LucideIcon;
  label: string;
  value: number;
  color: string;
  filter: StatFilter;
}

/**
 * StatsGrid - Displays 4 stat cards showing ticket counts.
 *
 * Layout:
 * ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
 * │ Total  │ │In Prog │ │AI Active│ │ Done   │
 * │  24    │ │   3    │ │   1    │ │  15    │
 * └────────┘ └────────┘ └────────┘ └────────┘
 *
 * Features:
 * - 4 stat cards in a responsive grid
 * - Each card shows icon, label, and count
 * - Click navigates to filtered board view
 * - Accessible with proper ARIA labels
 */
export const StatsGrid: FC<StatsGridProps> = ({
  total,
  inProgress,
  aiActive,
  done,
  onStatClick,
}) => {
  const stats: StatConfig[] = [
    {
      icon: Ticket,
      label: "Total",
      value: total,
      color: "var(--text-secondary)",
      filter: "all",
    },
    {
      icon: Clock,
      label: "In Progress",
      value: inProgress,
      color: "var(--status-in-progress)",
      filter: "in_progress",
    },
    {
      icon: Zap,
      label: "AI Active",
      value: aiActive,
      color: "var(--accent-warning)",
      filter: "ai_active",
    },
    {
      icon: Check,
      label: "Done",
      value: done,
      color: "var(--status-done)",
      filter: "done",
    },
  ];

  const handleClick = (filter: StatFilter) => {
    onStatClick?.(filter);
  };

  const handleKeyDown = (e: React.KeyboardEvent, filter: StatFilter) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick(filter);
    }
  };

  return (
    <div style={gridStyles} role="list" aria-label="Ticket statistics">
      {stats.map((stat) => {
        const Icon = stat.icon;
        const isClickable = !!onStatClick;

        return (
          <div
            key={stat.label}
            style={{
              ...cardStyles,
              cursor: isClickable ? "pointer" : "default",
            }}
            onClick={() => handleClick(stat.filter)}
            onKeyDown={(e) => handleKeyDown(e, stat.filter)}
            role="listitem"
            tabIndex={isClickable ? 0 : undefined}
            aria-label={`${stat.label}: ${stat.value} tickets${isClickable ? ", click to filter" : ""}`}
            className={
              isClickable
                ? "hover:border-[var(--border-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                : ""
            }
          >
            <div style={iconWrapperStyles}>
              <Icon size={20} style={{ color: stat.color }} aria-hidden="true" />
            </div>
            <div style={contentStyles}>
              <span style={valueStyles} data-testid={`stat-value-${stat.filter}`}>
                {stat.value}
              </span>
              <span style={labelStyles}>{stat.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const gridStyles: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: "var(--spacing-4)",
};

const cardStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-3)",
  padding: "var(--spacing-4)",
  background: "var(--bg-secondary)",
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--border-primary)",
  transition: "border-color var(--transition-fast)",
};

const iconWrapperStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "40px",
  height: "40px",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-tertiary)",
  flexShrink: 0,
};

const contentStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
};

const valueStyles: React.CSSProperties = {
  fontSize: "var(--font-size-2xl)",
  fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  lineHeight: 1,
};

const labelStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-secondary)",
};

export default StatsGrid;
