import { type FC, useState, useCallback } from "react";
import { Sparkles, Bot, Container, Code2, Loader2 } from "lucide-react";
import type { TicketStatus } from "../../api/tickets";

// =============================================================================
// Types
// =============================================================================

/** Launch option type identifier */
export type LaunchType = "claude" | "ralph-native" | "ralph-docker" | "opencode";

/** Individual launch option configuration */
export interface LaunchOption {
  id: LaunchType;
  name: string;
  description: string;
  icon: typeof Sparkles;
  iconColor: string;
  recommended?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

export interface LaunchActionsProps {
  /** Current ticket status - used to determine if launch actions should be shown */
  ticketStatus: TicketStatus;
  /** Handler called when a launch option is selected */
  onLaunch: (type: LaunchType) => void | Promise<void>;
  /** Whether a launch is currently in progress */
  isLaunching?: boolean;
  /** Which launch type is currently in progress (for loading indicator) */
  launchingType?: LaunchType | null;
  /** Whether the component is disabled */
  disabled?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Statuses where the ticket is in a "workable" state and launch actions should show */
const WORKABLE_STATUSES: TicketStatus[] = [
  "backlog",
  "ready",
  "in_progress",
  "review",
  "ai_review",
  "human_review",
];

/** Configuration for all launch options */
const LAUNCH_OPTIONS: LaunchOption[] = [
  {
    id: "claude",
    name: "Claude",
    description: "Interactive AI assistance",
    icon: Sparkles,
    iconColor: "#a855f7", // purple
    recommended: true,
  },
  {
    id: "ralph-native",
    name: "Ralph Native",
    description: "Autonomous agent",
    icon: Bot,
    iconColor: "#06b6d4", // cyan
  },
  {
    id: "ralph-docker",
    name: "Ralph Docker",
    description: "Sandboxed agent",
    icon: Container,
    iconColor: "#64748b", // slate
    disabled: true,
    disabledReason: "Coming soon",
  },
  {
    id: "opencode",
    name: "OpenCode",
    description: "Alternative client",
    icon: Code2,
    iconColor: "#3b82f6", // blue
  },
];

// =============================================================================
// LaunchOptionCard Component
// =============================================================================

interface LaunchOptionCardProps {
  option: LaunchOption;
  onClick: () => void;
  isLoading: boolean;
  disabled: boolean;
}

const LaunchOptionCard: FC<LaunchOptionCardProps> = ({ option, onClick, isLoading, disabled }) => {
  const Icon = option.icon;
  const isCardDisabled = disabled || option.disabled;

  const cardStyles: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "var(--spacing-2)",
    padding: "var(--spacing-3)",
    background: option.recommended ? "rgba(168, 85, 247, 0.1)" : "var(--bg-primary)",
    border: option.recommended
      ? "1px solid rgba(168, 85, 247, 0.3)"
      : "1px solid var(--border-primary)",
    borderRadius: "var(--radius-lg)",
    cursor: isCardDisabled ? "not-allowed" : "pointer",
    opacity: isCardDisabled ? 0.5 : 1,
    transition: "all var(--transition-fast)",
    minWidth: 0,
    position: "relative",
  };

  const iconContainerStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "40px",
    height: "40px",
    borderRadius: "var(--radius-md)",
    background: `${option.iconColor}20`, // 20% opacity
  };

  const nameStyles: React.CSSProperties = {
    fontSize: "var(--font-size-sm)",
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    color: "var(--text-primary)",
    textAlign: "center",
  };

  const descriptionStyles: React.CSSProperties = {
    fontSize: "var(--font-size-xs)",
    color: "var(--text-muted)",
    textAlign: "center",
  };

  const recommendedBadgeStyles: React.CSSProperties = {
    position: "absolute",
    top: "-8px",
    right: "-8px",
    padding: "2px 6px",
    background: "#a855f7",
    borderRadius: "var(--radius-sm)",
    fontSize: "10px",
    fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
    color: "white",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isCardDisabled}
      style={cardStyles}
      className={
        isCardDisabled
          ? ""
          : "hover:border-[var(--accent-primary)] hover:shadow-md hover:shadow-[var(--accent-primary)]/10"
      }
      aria-label={`Start work with ${option.name}${option.disabled ? ` - ${option.disabledReason}` : ""}`}
    >
      {option.recommended && <span style={recommendedBadgeStyles}>Recommended</span>}

      <div style={iconContainerStyles}>
        {isLoading ? (
          <Loader2 size={20} color={option.iconColor} className="animate-spin" />
        ) : (
          <Icon size={20} color={option.iconColor} />
        )}
      </div>

      <span style={nameStyles}>{option.name}</span>
      <span style={descriptionStyles}>
        {option.disabled ? option.disabledReason : option.description}
      </span>
    </button>
  );
};

// =============================================================================
// LaunchActions Component
// =============================================================================

/**
 * LaunchActions - A component displaying AI launch options for starting work on a ticket.
 *
 * Features:
 * - **Grid layout**: 2x2 grid of option cards
 * - **Recommended highlight**: Claude is highlighted as recommended
 * - **Loading states**: Shows spinner on the launching option
 * - **Disabled states**: Handles disabled options (e.g., Docker coming soon)
 * - **Workable state check**: Only shown when ticket is in a workable state
 *
 * @example
 * ```tsx
 * <LaunchActions
 *   ticketStatus="ready"
 *   onLaunch={(type) => handleLaunch(type)}
 *   isLaunching={isStartingWork}
 *   launchingType={currentLaunchType}
 * />
 * ```
 */
export const LaunchActions: FC<LaunchActionsProps> = ({
  ticketStatus,
  onLaunch,
  isLaunching = false,
  launchingType = null,
  disabled = false,
}) => {
  const [clickedType, setClickedType] = useState<LaunchType | null>(null);

  // Determine if ticket is in a workable state
  const isWorkable = WORKABLE_STATUSES.includes(ticketStatus);

  // Handle option click
  const handleOptionClick = useCallback(
    (type: LaunchType) => {
      if (disabled || isLaunching) return;
      setClickedType(type);
      void onLaunch(type);
    },
    [disabled, isLaunching, onLaunch]
  );

  // Don't render if ticket is not in a workable state (e.g., "done")
  if (!isWorkable) {
    return null;
  }

  // Styles
  const containerStyles: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "var(--spacing-3)",
  };

  const headerStyles: React.CSSProperties = {
    fontSize: "var(--font-size-sm)",
    fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
    color: "var(--text-secondary)",
    marginBottom: "var(--spacing-1)",
  };

  const gridStyles: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "var(--spacing-3)",
  };

  return (
    <div style={containerStyles}>
      <h3 style={headerStyles}>Start Work With</h3>

      <div style={gridStyles}>
        {LAUNCH_OPTIONS.map((option) => (
          <LaunchOptionCard
            key={option.id}
            option={option}
            onClick={() => handleOptionClick(option.id)}
            isLoading={isLaunching && (launchingType === option.id || clickedType === option.id)}
            disabled={disabled || isLaunching}
          />
        ))}
      </div>
    </div>
  );
};

export default LaunchActions;
