import { type FC, useCallback, useState } from "react";
import { Bot, Code2, Github, Loader2, Monitor, Sparkles, Terminal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TicketStatus } from "../../api/tickets";
import type { LaunchProviderIconKey, UiLaunchProviderId } from "../../lib/launch-provider-contract";
import {
  INTERACTIVE_UI_LAUNCH_PROVIDERS,
  RALPH_AUTONOMOUS_UI_LAUNCH_PROVIDERS,
} from "../../lib/ui-launch-registry";

export type LaunchType = UiLaunchProviderId;

export interface LaunchOption {
  id: LaunchType;
  name: string;
  description: string;
  icon: LucideIcon;
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

const WORKABLE_STATUSES: TicketStatus[] = [
  "backlog",
  "ready",
  "in_progress",
  "ai_review",
  "human_review",
];

const ICONS_BY_KEY: Record<LaunchProviderIconKey, LucideIcon> = {
  sparkles: Sparkles,
  bot: Bot,
  code: Code2,
  terminal: Terminal,
  monitor: Monitor,
  github: Github,
};

const TICKET_LAUNCH_OPTIONS: LaunchOption[] = [
  ...INTERACTIVE_UI_LAUNCH_PROVIDERS,
  ...RALPH_AUTONOMOUS_UI_LAUNCH_PROVIDERS,
]
  .filter((provider) => provider.availability.supportedContexts.includes("ticket"))
  .sort((left, right) => left.display.order - right.display.order)
  .map((provider) => ({
    id: provider.id,
    name: provider.display.label,
    description: provider.display.description,
    icon: ICONS_BY_KEY[provider.display.iconKey],
    iconColor: provider.display.iconColor,
    ...(provider.display.recommended ? { recommended: true } : {}),
  }));

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
    background: option.recommended ? "var(--accent-muted)" : "var(--bg-secondary)",
    border: option.recommended
      ? "1px solid color-mix(in srgb, var(--accent-primary) 25%, transparent)"
      : "1px solid var(--border-primary)",
    borderRadius: "var(--radius-xl)",
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
    borderRadius: "var(--radius-lg)",
    background: `${option.iconColor}15`,
  };

  const recommendedBadgeStyles: React.CSSProperties = {
    position: "absolute",
    top: "-8px",
    right: "-8px",
    padding: "2px 8px",
    background: "var(--accent-primary)",
    color: "var(--text-on-accent)",
    borderRadius: "var(--radius-lg)",
    fontSize: "10px",
    fontFamily: "var(--font-mono)",
    fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
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

export const LaunchActions: FC<LaunchActionsProps> = ({
  ticketStatus,
  onLaunch,
  isLaunching = false,
  launchingType = null,
  disabled = false,
}) => {
  const [clickedType, setClickedType] = useState<LaunchType | null>(null);
  const isWorkable = WORKABLE_STATUSES.includes(ticketStatus);

  const handleOptionClick = useCallback(
    (type: LaunchType) => {
      if (disabled || isLaunching) return;
      setClickedType(type);
      void onLaunch(type);
    },
    [disabled, isLaunching, onLaunch]
  );

  if (!isWorkable) {
    return null;
  }

  return (
    <div style={containerStyles}>
      <h3 style={headerStyles}>Start Work With</h3>

      <div style={gridStyles}>
        {TICKET_LAUNCH_OPTIONS.map((option) => (
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

const containerStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-3)",
};

const headerStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  fontFamily: "var(--font-mono)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  letterSpacing: "var(--tracking-wider)",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginBottom: "var(--spacing-2)",
};

const gridStyles: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: "var(--spacing-3)",
};

export default LaunchActions;
