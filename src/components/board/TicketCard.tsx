import type { FC } from "react";
import { useMemo } from "react";
import { GitBranch, ExternalLink } from "lucide-react";
import type { Ticket } from "../../lib/hooks";

export interface TicketCardProps {
  /** The ticket to display */
  ticket: Ticket;
  /** Whether the card is being dragged (shown in DragOverlay) */
  isOverlay?: boolean;
  /** Whether this ticket has an active Ralph session */
  isAiActive?: boolean;
  /** Handler when card is clicked */
  onClick?: (ticket: Ticket) => void;
}

type Priority = "high" | "medium" | "low";

// Priority border colors (left accent)
const PRIORITY_COLORS: Record<Priority, string> = {
  high: "var(--priority-high)",
  medium: "var(--priority-medium)",
  low: "var(--priority-low)",
};

// PR status dot colors
const PR_STATUS_COLORS: Record<string, string> = {
  open: "var(--pr-open)",
  draft: "var(--pr-draft)",
  merged: "var(--pr-merged)",
  closed: "var(--pr-closed)",
};

// Tag color palette (cycles through for visual variety)
const TAG_COLORS = [
  { bg: "rgba(59, 130, 246, 0.15)", text: "rgb(147, 197, 253)" }, // blue
  { bg: "rgba(168, 85, 247, 0.15)", text: "rgb(196, 181, 253)" }, // purple
  { bg: "rgba(34, 197, 94, 0.15)", text: "rgb(134, 239, 172)" }, // green
  { bg: "rgba(249, 115, 22, 0.15)", text: "rgb(253, 186, 116)" }, // orange
  { bg: "rgba(236, 72, 153, 0.15)", text: "rgb(251, 207, 232)" }, // pink
];

/**
 * TicketCard - Compact card for kanban board display.
 *
 * Features:
 * - Priority indicator on left border (red=high, orange=medium, gray=low)
 * - Ticket title with 2-line truncation
 * - Tags row (max 3 visible, +N more indicator)
 * - Git info (branch name, PR badge with status)
 * - Click opens ticket detail
 * - Hover shows subtle elevation
 * - AI-active glow animation when Ralph is working
 *
 * Layout:
 * ```
 * ┌────────────────────────────────┐
 * │▌ Implement user auth          │  <- Red border = high priority
 * │  [auth] [backend]             │  <- Tags
 * │  🌿 feature/auth  🔗 #42 ●    │  <- Branch + PR
 * └────────────────────────────────┘
 * ```
 */
export const TicketCard: FC<TicketCardProps> = ({
  ticket,
  isOverlay = false,
  isAiActive = false,
  onClick,
}) => {
  // Parse tags from JSON string
  const tags = useMemo<string[]>(() => {
    if (!ticket.tags) return [];
    try {
      return JSON.parse(ticket.tags) as string[];
    } catch {
      return [];
    }
  }, [ticket.tags]);

  // Get priority color (default to low if not set)
  const priority = (ticket.priority as Priority) || "low";
  const priorityColor = PRIORITY_COLORS[priority] || PRIORITY_COLORS.low;

  // Visible tags (max 3) and overflow count
  const visibleTags = tags.slice(0, 3);
  const overflowCount = tags.length - 3;

  // PR status color
  const prStatusColor = ticket.prStatus ? PR_STATUS_COLORS[ticket.prStatus] : null;

  const handleClick = () => {
    if (onClick) {
      onClick(ticket);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" || e.key === " ") && onClick) {
      e.preventDefault();
      onClick(ticket);
    }
  };

  // Card container styles with priority border and optional AI glow
  const cardStyles: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "var(--spacing-2)",
    padding: "var(--spacing-3)",
    background: "var(--bg-card)",
    borderRadius: "var(--radius-md)",
    borderLeft: `3px solid ${priorityColor}`,
    cursor: onClick ? "pointer" : "default",
    transition: "box-shadow var(--transition-fast), transform var(--transition-fast)",
    boxShadow: isOverlay
      ? "0 8px 24px rgba(0, 0, 0, 0.3)"
      : isAiActive
        ? "0 0 12px var(--accent-primary)"
        : "0 1px 3px rgba(0, 0, 0, 0.1)",
    transform: isOverlay ? "scale(1.02)" : undefined,
    // AI-active animation is handled via CSS class
  };

  return (
    <div
      style={cardStyles}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={onClick ? "button" : "article"}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `View ticket: ${ticket.title}` : `Ticket: ${ticket.title}`}
      data-testid="ticket-card"
      data-priority={priority}
      data-ai-active={isAiActive || undefined}
      className={isAiActive ? "ai-active" : undefined}
    >
      {/* Title - truncate at 2 lines */}
      <h3 style={titleStyles} data-testid="ticket-title">
        {ticket.title}
      </h3>

      {/* Tags row */}
      {visibleTags.length > 0 && (
        <div style={tagsRowStyles} data-testid="tags-row">
          {visibleTags.map((tag, index) => {
            // Safe: TAG_COLORS has 5 elements, modulo guarantees valid index
            const tagColor = TAG_COLORS[index % TAG_COLORS.length]!;
            return (
              <span
                key={tag}
                style={{
                  ...tagPillStyles,
                  backgroundColor: tagColor.bg,
                  color: tagColor.text,
                }}
                data-testid="tag-pill"
              >
                {tag}
              </span>
            );
          })}
          {overflowCount > 0 && (
            <span
              style={overflowIndicatorStyles}
              title={tags.slice(3).join(", ")}
              data-testid="tags-overflow"
            >
              +{overflowCount}
            </span>
          )}
        </div>
      )}

      {/* Git info row */}
      {(ticket.branchName || ticket.prNumber) && (
        <div style={gitInfoRowStyles} data-testid="git-info">
          {ticket.branchName && (
            <span style={branchBadgeStyles} title={ticket.branchName}>
              <GitBranch size={12} aria-hidden="true" />
              <span style={branchNameStyles}>{truncateBranch(ticket.branchName)}</span>
            </span>
          )}
          {ticket.prNumber && (
            <span style={prBadgeStyles} data-testid="pr-badge">
              <ExternalLink size={10} aria-hidden="true" />
              <span>#{ticket.prNumber}</span>
              {prStatusColor && (
                <span
                  style={{ ...prStatusDotStyles, backgroundColor: prStatusColor }}
                  aria-label={`PR status: ${ticket.prStatus}`}
                  data-testid="pr-status-dot"
                />
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// Truncate branch name for display (keep prefix and end)
function truncateBranch(branch: string, maxLength = 20): string {
  if (branch.length <= maxLength) return branch;
  // Show first 8 chars + ... + last 8 chars
  return `${branch.slice(0, 8)}...${branch.slice(-8)}`;
}

// ============================================================================
// Styles
// ============================================================================

const titleStyles: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  lineHeight: 1.4,
  // 2-line truncation
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const tagsRowStyles: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--spacing-1)",
  alignItems: "center",
};

const tagPillStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 6px",
  fontSize: "var(--font-size-xs)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  borderRadius: "var(--radius-sm)",
  whiteSpace: "nowrap",
};

const overflowIndicatorStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  color: "var(--text-tertiary)",
  cursor: "help",
};

const gitInfoRowStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-3)",
  marginTop: "var(--spacing-1)",
};

const branchBadgeStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--spacing-1)",
  fontSize: "var(--font-size-xs)",
  color: "var(--text-tertiary)",
};

const branchNameStyles: React.CSSProperties = {
  maxWidth: "120px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const prBadgeStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  fontSize: "var(--font-size-xs)",
  color: "var(--text-tertiary)",
};

const prStatusDotStyles: React.CSSProperties = {
  width: "6px",
  height: "6px",
  borderRadius: "50%",
  flexShrink: 0,
};

export default TicketCard;
