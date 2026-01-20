import { type FC, useMemo } from "react";
import { Target, Zap, Clock } from "lucide-react";
import type { Ticket } from "../../lib/hooks";
import type { ActiveRalphSession } from "../../api/ralph";
import { type Subtask } from "../../api/tickets";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
  emptyStateStyles,
  emptyTextStyles,
  emptySubtextStyles,
} from "./shared-styles";

export interface CurrentFocusCardProps {
  /** The ticket currently being focused on (in_progress with AI active) */
  ticket: Ticket | null;
  /** Active Ralph session for this ticket (if any) */
  session?: ActiveRalphSession | null | undefined;
  /** Handler when card is clicked to navigate to ticket detail */
  onClick?: (ticketId: string) => void;
}

/**
 * CurrentFocusCard - Displays the currently active/focused ticket.
 *
 * Features:
 * - Shows ticket title, description preview, and progress
 * - AI activity indicator (glow animation when Ralph is active)
 * - Subtask progress bar with completion count
 * - Time since work started
 * - Click navigates to ticket detail
 * - Empty state when no active focus
 *
 * Layout:
 * ```
 * ┌────────────────────────────────────┐
 * │ 🎯 Current Focus                   │
 * ├────────────────────────────────────┤
 * │ Implement dark mode toggle    ⚡   │
 * │ Adding theme switching...          │
 * │ ████████░░░░ 3/5 subtasks         │
 * │ Started 2h ago                     │
 * └────────────────────────────────────┘
 * ```
 */
export const CurrentFocusCard: FC<CurrentFocusCardProps> = ({ ticket, session, onClick }) => {
  // Parse subtasks from JSON string - log errors for debugging malformed data
  const subtasksJson = ticket?.subtasks ?? null;
  const ticketId = ticket?.id;
  const subtasks = useMemo<Subtask[]>(() => {
    if (!subtasksJson) return [];
    try {
      return JSON.parse(subtasksJson) as Subtask[];
    } catch (err) {
      console.error("Failed to parse subtasks JSON:", err, { ticketId });
      return [];
    }
  }, [subtasksJson, ticketId]);

  const completedSubtasks = subtasks.filter((s) => s.completed).length;
  const totalSubtasks = subtasks.length;
  const progressPercent = totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0;

  // Calculate time since started - validate date to prevent NaN display
  const sessionStartedAt = session?.startedAt ?? null;
  const timeAgo = useMemo(() => {
    if (!sessionStartedAt) return null;
    const started = new Date(sessionStartedAt);

    // Validate the parsed date
    if (isNaN(started.getTime())) {
      console.warn("Invalid session start date:", sessionStartedAt);
      return null;
    }

    const now = new Date();
    const diffMs = now.getTime() - started.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return "Just started";
  }, [sessionStartedAt]);

  const isAiActive = Boolean(session);

  const handleClick = () => {
    if (ticket && onClick) {
      onClick(ticket.id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" || e.key === " ") && ticket && onClick) {
      e.preventDefault();
      onClick(ticket.id);
    }
  };

  return (
    <section style={sectionStyles} data-testid="current-focus-card">
      <div style={sectionHeaderStyles}>
        <Target size={18} style={{ color: "var(--accent-primary)" }} aria-hidden="true" />
        <h2 style={sectionTitleStyles}>Current Focus</h2>
      </div>

      <div style={sectionContentStyles}>
        {ticket ? (
          <div
            style={focusTicketStyles}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            role={onClick ? "button" : undefined}
            tabIndex={onClick ? 0 : undefined}
            aria-label={onClick ? `View ticket: ${ticket.title}` : undefined}
            data-testid="focus-ticket"
          >
            <div style={focusTicketHeaderStyles}>
              <span style={focusTicketTitleStyles}>{ticket.title}</span>
              {isAiActive && (
                <span
                  style={aiIndicatorStyles}
                  title="AI Active"
                  aria-label="AI is actively working on this ticket"
                  data-testid="ai-indicator"
                >
                  <Zap size={14} />
                </span>
              )}
            </div>

            {ticket.description && (
              <p style={focusTicketDescStyles} data-testid="ticket-description">
                {ticket.description.slice(0, 100)}
                {ticket.description.length > 100 ? "..." : ""}
              </p>
            )}

            {totalSubtasks > 0 && (
              <div style={progressContainerStyles} data-testid="subtask-progress">
                <div style={progressBarContainerStyles}>
                  <div
                    style={{ ...progressBarFillStyles, width: `${progressPercent}%` }}
                    role="progressbar"
                    aria-valuenow={progressPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${completedSubtasks} of ${totalSubtasks} subtasks completed`}
                  />
                </div>
                <span style={progressTextStyles}>
                  {completedSubtasks}/{totalSubtasks} subtasks
                </span>
              </div>
            )}

            {timeAgo && (
              <div style={timeStyles} data-testid="time-started">
                <Clock size={12} style={{ opacity: 0.6 }} aria-hidden="true" />
                <span>Started {timeAgo}</span>
              </div>
            )}
          </div>
        ) : (
          <div style={emptyStateStyles} data-testid="empty-state">
            <Target size={32} style={{ opacity: 0.3 }} aria-hidden="true" />
            <p style={emptyTextStyles}>No active focus</p>
            <p style={emptySubtextStyles}>Start working on a ticket to see it here</p>
          </div>
        )}
      </div>
    </section>
  );
};

// ============================================================================
// Styles (component-specific; shared styles imported from ./shared-styles.ts)
// ============================================================================

const focusTicketStyles: React.CSSProperties = {
  padding: "var(--spacing-4)",
  background: "var(--bg-tertiary)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-secondary)",
  cursor: "pointer",
  transition: "all var(--transition-fast)",
};

const focusTicketHeaderStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--spacing-2)",
};

const focusTicketTitleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-base)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
};

const aiIndicatorStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--accent-warning)",
  animation: "pulse 2s infinite",
};

const focusTicketDescStyles: React.CSSProperties = {
  marginTop: "var(--spacing-2)",
  fontSize: "var(--font-size-sm)",
  color: "var(--text-secondary)",
  lineHeight: 1.5,
};

const progressContainerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  marginTop: "var(--spacing-3)",
};

const progressBarContainerStyles: React.CSSProperties = {
  flex: 1,
  height: "6px",
  background: "var(--bg-primary)",
  borderRadius: "var(--radius-full)",
  overflow: "hidden",
};

const progressBarFillStyles: React.CSSProperties = {
  height: "100%",
  background: "var(--accent-primary)",
  borderRadius: "var(--radius-full)",
  transition: "width var(--transition-fast)",
};

const progressTextStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  color: "var(--text-tertiary)",
  whiteSpace: "nowrap",
};

const timeStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-1)",
  marginTop: "var(--spacing-2)",
  fontSize: "var(--font-size-xs)",
  color: "var(--text-tertiary)",
};

export default CurrentFocusCard;
