import { type FC } from "react";
import { ListOrdered, Play } from "lucide-react";
import type { Ticket } from "../../lib/hooks";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
  emptyStateStyles,
  emptyTextStyles,
  emptySubtextStyles,
} from "./shared-styles";

export interface UpNextQueueProps {
  /** Array of tickets to display in priority order (max 5) */
  tickets: Array<
    Pick<Ticket, "id" | "title" | "priority" | "projectId"> & {
      projectName?: string;
    }
  >;
  /** Handler when a ticket is clicked to view details */
  onClick?: (ticketId: string) => void;
  /** Handler when "Start" button is clicked to begin work */
  onStart?: (ticketId: string) => void;
}

/**
 * UpNextQueue - Displays the next tickets to work on in priority order.
 *
 * Features:
 * - Shows next 5 tickets in priority order (high → medium → low)
 * - Excludes done/blocked tickets (filtered by parent)
 * - Shows title, priority badge, and project name
 * - Click opens ticket detail
 * - "Start" button to begin work on a ticket
 * - Empty state when queue is empty
 * - Full keyboard accessibility
 *
 * Layout:
 * ```
 * ┌────────────────────────────────────┐
 * │ 📋 Up Next                         │
 * ├────────────────────────────────────┤
 * │ 1. 🔴 Add login validation  [Start]│
 * │ 2. 🟠 Update API docs              │
 * │ 3. 🟠 Fix navbar styling           │
 * │ 4. ⚪ Refactor utils               │
 * │ 5. ⚪ Add unit tests               │
 * └────────────────────────────────────┘
 * ```
 */
export const UpNextQueue: FC<UpNextQueueProps> = ({ tickets, onClick, onStart }) => {
  const handleTicketClick = (ticketId: string) => {
    if (onClick) {
      onClick(ticketId);
    }
  };

  const handleStartClick = (ticketId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (onStart) {
      onStart(ticketId);
    }
  };

  const handleTicketKeyDown = (ticketId: string, event: React.KeyboardEvent) => {
    if ((event.key === "Enter" || event.key === " ") && onClick) {
      event.preventDefault();
      onClick(ticketId);
    }
  };

  const handleStartKeyDown = (ticketId: string, event: React.KeyboardEvent) => {
    if ((event.key === "Enter" || event.key === " ") && onStart) {
      event.preventDefault();
      event.stopPropagation();
      onStart(ticketId);
    }
  };

  return (
    <section style={sectionStyles} data-testid="up-next-queue">
      <div style={sectionHeaderStyles}>
        <ListOrdered size={18} style={{ color: "var(--accent-primary)" }} aria-hidden="true" />
        <h2 style={sectionTitleStyles}>Up Next</h2>
      </div>

      <div style={sectionContentStyles}>
        {tickets.length > 0 ? (
          <ol style={queueListStyles} data-testid="queue-list">
            {tickets.map((ticket, index) => (
              <li key={ticket.id} style={queueItemWrapperStyles}>
                <div
                  style={queueItemStyles}
                  onClick={() => handleTicketClick(ticket.id)}
                  onKeyDown={(e) => handleTicketKeyDown(ticket.id, e)}
                  role={onClick ? "button" : undefined}
                  tabIndex={onClick ? 0 : undefined}
                  aria-label={onClick ? `View ticket: ${ticket.title}` : undefined}
                  data-testid={`queue-item-${index}`}
                >
                  <span style={queueIndexStyles} aria-hidden="true">
                    {index + 1}.
                  </span>

                  <PriorityBadge priority={ticket.priority} />

                  <div style={ticketInfoStyles}>
                    <span style={queueTitleStyles}>{ticket.title}</span>
                    {ticket.projectName && (
                      <span style={projectNameStyles} data-testid={`project-name-${index}`}>
                        {ticket.projectName}
                      </span>
                    )}
                  </div>

                  {onStart && (
                    <button
                      type="button"
                      style={startButtonStyles}
                      onClick={(e) => handleStartClick(ticket.id, e)}
                      onKeyDown={(e) => handleStartKeyDown(ticket.id, e)}
                      aria-label={`Start working on: ${ticket.title}`}
                      data-testid={`start-button-${index}`}
                    >
                      <Play size={12} style={{ marginRight: "4px" }} aria-hidden="true" />
                      Start
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div style={emptyStateStyles} data-testid="empty-state">
            <ListOrdered size={32} style={{ opacity: 0.3 }} aria-hidden="true" />
            <p style={emptyTextStyles}>Queue empty</p>
            <p style={emptySubtextStyles}>All tickets are either done or in progress</p>
          </div>
        )}
      </div>
    </section>
  );
};

// ============================================================================
// Priority Badge Sub-component
// ============================================================================

interface PriorityBadgeProps {
  priority: string | null;
}

const PriorityBadge: FC<PriorityBadgeProps> = ({ priority }) => {
  const getPriorityConfig = (priority: string | null) => {
    switch (priority) {
      case "high":
        return { color: "var(--status-high)", label: "High priority" };
      case "medium":
        return { color: "var(--status-medium)", label: "Medium priority" };
      case "low":
        return { color: "var(--status-low)", label: "Low priority" };
      default:
        return { color: "var(--text-tertiary)", label: "No priority" };
    }
  };

  const config = getPriorityConfig(priority);

  return (
    <span
      style={{ ...priorityDotStyles, backgroundColor: config.color }}
      title={config.label}
      aria-label={config.label}
      role="img"
      data-testid="priority-badge"
    />
  );
};

// ============================================================================
// Styles (component-specific; shared styles imported from ./shared-styles.ts)
// ============================================================================

const queueListStyles: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-2)",
};

const queueItemWrapperStyles: React.CSSProperties = {
  display: "contents",
};

const queueItemStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-3)",
  background: "var(--bg-tertiary)",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  transition: "background var(--transition-fast)",
};

const queueIndexStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-tertiary)",
  width: "24px",
  flexShrink: 0,
};

const priorityDotStyles: React.CSSProperties = {
  display: "inline-block",
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  flexShrink: 0,
};

const ticketInfoStyles: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: "2px",
  minWidth: 0,
};

const queueTitleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-primary)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const projectNameStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  color: "var(--text-tertiary)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const startButtonStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "var(--spacing-1) var(--spacing-2)",
  background: "var(--accent-primary)",
  color: "white",
  border: "none",
  borderRadius: "var(--radius-sm)",
  fontSize: "var(--font-size-xs)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  cursor: "pointer",
  transition: "background var(--transition-fast)",
  flexShrink: 0,
};

export default UpNextQueue;
