import type { FC } from "react";
import { useMemo } from "react";
import { useTickets, type Ticket } from "../../lib/hooks";
import { TicketCard } from "./TicketCard";
import type { TicketStatus } from "../../api/tickets";

export interface KanbanBoardProps {
  /** Optional project ID to filter tickets */
  projectId?: string | null;
  /** Optional epic ID to filter tickets */
  epicId?: string | null;
  /** Handler when a ticket card is clicked */
  onTicketClick?: (ticket: Ticket) => void;
  /** Map of ticketId -> isAiActive for Ralph session tracking */
  aiActiveSessions?: Record<string, boolean>;
}

/**
 * Status columns in display order.
 * These match the TicketStatus type from the tickets API.
 */
const COLUMNS: TicketStatus[] = [
  "backlog",
  "ready",
  "in_progress",
  "review",
  "ai_review",
  "human_review",
  "done",
];

/**
 * Human-readable labels for each status.
 */
const COLUMN_LABELS: Record<TicketStatus, string> = {
  backlog: "Backlog",
  ready: "Ready",
  in_progress: "In Progress",
  review: "Review",
  ai_review: "AI Review",
  human_review: "Human Review",
  done: "Done",
};

/**
 * Accent colors for column headers (matches design system status colors).
 */
const COLUMN_COLORS: Record<TicketStatus, string> = {
  backlog: "var(--status-backlog)",
  ready: "var(--status-ready)",
  in_progress: "var(--status-in-progress)",
  review: "var(--status-review)",
  ai_review: "var(--accent-warning)",
  human_review: "var(--accent-primary)",
  done: "var(--status-done)",
};

/**
 * KanbanBoard - Main kanban board with horizontal scrolling columns.
 *
 * Features:
 * - 7 columns for each ticket status
 * - Horizontal scroll container for responsive layout
 * - Fetches tickets via TanStack Query with optional filters
 * - Groups tickets by status into columns
 * - Loading skeleton while data is being fetched
 * - Empty state per column when no tickets
 *
 * Layout:
 * ```
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ [Backlog (3)] [Ready (2)] [In Progress (1)] [Review (0)] ... [Done (5)]     │
 * │    │Card│       │Card│       │Card│                           │Card│        │
 * │    │Card│       │Card│                                        │Card│        │
 * │    │Card│                                                     │Card│        │
 * │                                                               │Card│        │
 * │                                                               │Card│        │
 * └─────────────────────────────────────────────────────────────────────────────┘
 * ```
 */
export const KanbanBoard: FC<KanbanBoardProps> = ({
  projectId,
  epicId,
  onTicketClick,
  aiActiveSessions = {},
}) => {
  // Fetch tickets with optional filters
  const filters = useMemo(() => {
    const f: { projectId?: string; epicId?: string } = {};
    if (projectId) f.projectId = projectId;
    if (epicId) f.epicId = epicId;
    return f;
  }, [projectId, epicId]);

  const { tickets, loading, error } = useTickets(filters);

  // Group tickets by status
  const ticketsByStatus = useMemo(() => {
    const grouped: Record<TicketStatus, Ticket[]> = {
      backlog: [],
      ready: [],
      in_progress: [],
      review: [],
      ai_review: [],
      human_review: [],
      done: [],
    };

    for (const ticket of tickets) {
      const status = ticket.status as TicketStatus;
      if (grouped[status]) {
        grouped[status].push(ticket);
      }
    }

    return grouped;
  }, [tickets]);

  // Loading skeleton
  if (loading) {
    return (
      <div style={boardContainerStyles} role="region" aria-label="Kanban board loading">
        <div style={columnsContainerStyles}>
          {COLUMNS.map((status) => (
            <div key={status} style={columnStyles} data-testid={`column-skeleton-${status}`}>
              <div style={columnHeaderStyles}>
                <div style={skeletonHeaderStyles} />
              </div>
              <div style={columnContentStyles}>
                {[1, 2, 3].map((i) => (
                  <div key={i} style={skeletonCardStyles} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={errorContainerStyles} role="alert">
        <span style={errorTextStyles}>Failed to load tickets: {error}</span>
      </div>
    );
  }

  return (
    <div
      style={boardContainerStyles}
      role="region"
      aria-label="Kanban board"
      data-testid="kanban-board"
    >
      <div style={columnsContainerStyles}>
        {COLUMNS.map((status) => {
          const columnTickets = ticketsByStatus[status];
          const count = columnTickets.length;
          const accentColor = COLUMN_COLORS[status];

          return (
            <div
              key={status}
              style={columnStyles}
              role="list"
              aria-label={`${COLUMN_LABELS[status]} column, ${count} tickets`}
              data-testid={`column-${status}`}
              data-status={status}
            >
              {/* Column Header */}
              <div style={columnHeaderStyles}>
                <div style={headerContentStyles}>
                  <span
                    style={{ ...headerAccentStyles, backgroundColor: accentColor }}
                    aria-hidden="true"
                  />
                  <h3 style={headerTitleStyles}>{COLUMN_LABELS[status]}</h3>
                  <span style={countBadgeStyles} data-testid={`count-${status}`}>
                    {count}
                  </span>
                </div>
              </div>

              {/* Column Content */}
              <div style={columnContentStyles}>
                {count === 0 ? (
                  <div style={emptyStateStyles} role="listitem">
                    <span style={emptyTextStyles}>No tickets</span>
                  </div>
                ) : (
                  columnTickets.map((ticket) => (
                    <div key={ticket.id} role="listitem">
                      <TicketCard
                        ticket={ticket}
                        {...(onTicketClick ? { onClick: onTicketClick } : {})}
                        isAiActive={aiActiveSessions[ticket.id] ?? false}
                      />
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// Styles
// ============================================================================

const boardContainerStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  minHeight: 0,
  overflow: "hidden",
};

const columnsContainerStyles: React.CSSProperties = {
  display: "flex",
  gap: "var(--spacing-4)",
  height: "100%",
  overflowX: "auto",
  overflowY: "hidden",
  padding: "var(--spacing-4)",
  // Smooth scrolling for better UX
  scrollBehavior: "smooth",
  // Custom scrollbar styling (webkit)
  WebkitOverflowScrolling: "touch",
};

const columnStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minWidth: "280px",
  maxWidth: "320px",
  flexShrink: 0,
  height: "100%",
  background: "var(--bg-secondary)",
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--border-primary)",
};

const columnHeaderStyles: React.CSSProperties = {
  padding: "var(--spacing-3) var(--spacing-4)",
  borderBottom: "1px solid var(--border-primary)",
  flexShrink: 0,
};

const headerContentStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
};

const headerAccentStyles: React.CSSProperties = {
  width: "4px",
  height: "16px",
  borderRadius: "2px",
  flexShrink: 0,
};

const headerTitleStyles: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  flex: 1,
};

const countBadgeStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "20px",
  height: "20px",
  padding: "0 var(--spacing-2)",
  fontSize: "var(--font-size-xs)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  color: "var(--text-secondary)",
  background: "var(--bg-tertiary)",
  borderRadius: "var(--radius-full)",
};

const columnContentStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-3)",
  flex: 1,
  overflowY: "auto",
  minHeight: 0,
};

const emptyStateStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--spacing-8) var(--spacing-4)",
};

const emptyTextStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-tertiary)",
};

// Loading skeleton styles
const skeletonHeaderStyles: React.CSSProperties = {
  width: "100px",
  height: "20px",
  background: "var(--bg-tertiary)",
  borderRadius: "var(--radius-sm)",
  animation: "pulse 1.5s ease-in-out infinite",
};

const skeletonCardStyles: React.CSSProperties = {
  height: "80px",
  background: "var(--bg-tertiary)",
  borderRadius: "var(--radius-md)",
  animation: "pulse 1.5s ease-in-out infinite",
};

// Error state styles
const errorContainerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "200px",
  padding: "var(--spacing-4)",
};

const errorTextStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--accent-error)",
};

export default KanbanBoard;
