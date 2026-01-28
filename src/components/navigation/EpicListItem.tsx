import { type FC, useState, type MouseEvent } from "react";
import { Pencil, Bot, Play } from "lucide-react";
import { createEnterSpaceHandler } from "../../lib/keyboard-utils";
import type { Epic, EpicWorktreeState } from "../../lib/hooks";
import { WorktreeBadge } from "../WorktreeBadge";

export interface EpicListItemProps {
  /** Epic data */
  epic: Epic;
  /** Whether this epic is currently selected */
  isSelected?: boolean | undefined;
  /** Whether this epic has active AI (Ralph) sessions */
  hasActiveAI?: boolean | undefined;
  /** Number of tickets in this epic */
  ticketCount?: number | undefined;
  /** Worktree state for this epic (path, status) */
  worktreeState?: EpicWorktreeState | undefined;
  /** Handler when the epic is clicked (for selection/filtering) */
  onSelect: () => void;
  /** Handler when the edit button is clicked */
  onEdit: () => void;
  /** Handler when Ralph launch button is clicked */
  onLaunchRalph: () => void;
}

/**
 * EpicListItem - Compact epic row for the ProjectsPanel expanded view.
 *
 * Features:
 * - **Color dot**: Small circle showing epic color
 * - **Title**: Truncated with ellipsis
 * - **Ticket count badge**: Shows number of tickets
 * - **AI glow**: Animated pulse when Ralph is active
 * - **Hover actions**: Edit and Ralph launch buttons appear on hover
 * - **Keyboard accessible**: Enter/Space to select
 */
export const EpicListItem: FC<EpicListItemProps> = ({
  epic,
  isSelected = false,
  hasActiveAI = false,
  ticketCount,
  worktreeState,
  onSelect,
  onEdit,
  onLaunchRalph,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleKeyDown = createEnterSpaceHandler(onSelect);

  const handleEditClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onEdit();
  };

  const handleRalphClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    // Don't trigger if disabled (no tickets or already in progress)
    if (ticketCount === 0 || hasActiveAI) return;
    onLaunchRalph();
  };

  const containerStyles: React.CSSProperties = {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    width: "100%",
    padding: "var(--spacing-2) var(--spacing-3)",
    paddingLeft: "var(--spacing-6)", // Indent under project
    background: isSelected ? "var(--accent-muted)" : "transparent",
    border: "none",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    transition: "all var(--transition-fast)",
    textAlign: "left",
    // AI glow effect
    ...(hasActiveAI && {
      boxShadow: "0 0 8px var(--accent-ai), inset 0 0 1px var(--accent-ai)",
    }),
  };

  const colorDotStyles: React.CSSProperties = {
    width: "8px",
    height: "8px",
    borderRadius: "var(--radius-full)",
    background: epic.color || "var(--text-tertiary)",
    flexShrink: 0,
  };

  const titleStyles: React.CSSProperties = {
    flex: 1,
    color: "var(--text-primary)",
    fontSize: "var(--font-size-sm)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    margin: 0,
  };

  const badgeStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "20px",
    height: "18px",
    padding: "0 var(--spacing-1)",
    background: "var(--bg-tertiary)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-secondary)",
    fontSize: "var(--font-size-xs)",
    flexShrink: 0,
  };

  const aiIndicatorStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    color: "var(--accent-ai)",
    animation: "pulse 2s infinite",
    flexShrink: 0,
  };

  const actionsStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-1)",
    opacity: isHovered ? 1 : 0,
    transition: "opacity var(--transition-fast)",
    pointerEvents: isHovered ? "auto" : "none",
    flexShrink: 0,
  };

  const actionButtonStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "24px",
    height: "24px",
    background: "transparent",
    border: "none",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-tertiary)",
    cursor: "pointer",
    transition: "all var(--transition-fast)",
  };

  // Determine if the button should be disabled (no tickets in epic)
  const hasNoTickets = ticketCount === 0;
  const isButtonDisabled = hasNoTickets || hasActiveAI;
  const hasPreviousWork = Boolean(epic.isolationMode);

  // Derive button state for consistent styling and text
  type ButtonState = "no-tickets" | "in-progress" | "continue" | "start";
  function getButtonState(): ButtonState {
    if (hasNoTickets) return "no-tickets";
    if (hasActiveAI) return "in-progress";
    if (hasPreviousWork) return "continue";
    return "start";
  }
  const buttonState = getButtonState();

  // Button text based on state
  const buttonTextMap: Record<ButtonState, string> = {
    "no-tickets": "No Tickets",
    "in-progress": "In Progress",
    continue: "Continue",
    start: "Start",
  };

  // Button background based on state
  const buttonBackgroundMap: Record<ButtonState, string> = {
    "no-tickets": "var(--bg-tertiary)",
    "in-progress": "var(--accent-ai)",
    continue: "var(--bg-tertiary)",
    start: "var(--gradient-accent)",
  };

  // Button text color based on state
  const buttonColorMap: Record<ButtonState, string> = {
    "no-tickets": "var(--text-tertiary)",
    "in-progress": "white",
    continue: "var(--text-primary)",
    start: "white",
  };

  // Aria label based on state (includes epic title for accessibility)
  function getAriaLabel(state: ButtonState, title: string): string {
    switch (state) {
      case "no-tickets":
        return `No tickets in ${title}`;
      case "in-progress":
        return `AI work in progress on ${title}`;
      case "continue":
        return `Continue AI work on ${title}`;
      case "start":
        return `Start AI work on ${title}`;
    }
  }

  // Tooltip title based on state
  function getTitleText(state: ButtonState): string {
    switch (state) {
      case "no-tickets":
        return "Add tickets to start AI work";
      case "in-progress":
        return "AI work in progress";
      case "continue":
        return "Continue with AI";
      case "start":
        return "Start with AI";
    }
  }

  // "Start with AI" / "Continue with AI" button - more prominent than other actions
  const startAIButtonStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--spacing-1)",
    height: "22px",
    padding: "0 var(--spacing-2)",
    background: buttonBackgroundMap[buttonState],
    border: "none",
    borderRadius: "var(--radius-sm)",
    color: buttonColorMap[buttonState],
    cursor: isButtonDisabled ? "not-allowed" : "pointer",
    opacity: hasNoTickets ? 0.6 : 1,
    transition: "all var(--transition-fast)",
    fontSize: "var(--font-size-xs)",
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    whiteSpace: "nowrap",
    flexShrink: 0,
  };

  return (
    <div
      style={containerStyles}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      title={epic.description || epic.title}
      data-testid={`epic-list-item-${epic.id}`}
      className="hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-primary)]"
    >
      {/* Color dot */}
      <span style={colorDotStyles} aria-hidden="true" />

      {/* Title */}
      <span style={titleStyles}>{epic.title}</span>

      {/* Worktree badge (shown when isolation mode is set) */}
      {epic.isolationMode && (
        <WorktreeBadge
          isolationMode={epic.isolationMode}
          worktreeStatus={worktreeState?.worktreeStatus}
          worktreePath={worktreeState?.worktreePath}
          size="sm"
        />
      )}

      {/* AI indicator (always visible when active) */}
      {hasActiveAI && (
        <span style={aiIndicatorStyles} role="status" aria-label="AI is active on this epic">
          <Bot size={12} aria-hidden="true" />
        </span>
      )}

      {/* Ticket count badge (when not hovered) */}
      {ticketCount !== undefined && !isHovered && (
        <span style={badgeStyles} aria-label={`${ticketCount} tickets`}>
          {ticketCount}
        </span>
      )}

      {/* Hover actions */}
      <div style={actionsStyles}>
        <button
          type="button"
          style={actionButtonStyles}
          onClick={handleEditClick}
          aria-label={`Edit ${epic.title}`}
          className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <Pencil size={12} aria-hidden="true" />
        </button>
        {/* Start/Continue with AI button - more prominent when hovered */}
        <button
          type="button"
          style={startAIButtonStyles}
          onClick={handleRalphClick}
          disabled={isButtonDisabled}
          aria-label={getAriaLabel(buttonState, epic.title)}
          title={getTitleText(buttonState)}
          className={isButtonDisabled ? "" : "hover:brightness-110"}
        >
          {hasActiveAI ? (
            <Bot size={12} className="animate-pulse" aria-hidden="true" />
          ) : (
            <Play size={10} aria-hidden="true" />
          )}
          <span>{buttonTextMap[buttonState]}</span>
        </button>
      </div>
    </div>
  );
};

export default EpicListItem;
