import type { FC } from "react";
import { useMemo } from "react";
import { useTickets } from "../../lib/hooks";
import { TicketCard } from "./TicketCard";
import { KanbanColumn } from "./KanbanColumn";
import type { TicketStatus } from "../../api/tickets";
import type { Ticket } from "../../lib/schema";

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
              <div style={skeletonColumnContentStyles}>
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
            <KanbanColumn
              key={status}
              status={status}
              label={COLUMN_LABELS[status]}
              count={count}
              accentColor={accentColor}
            >
              {columnTickets.map((ticket) => (
                <div key={ticket.id} role="listitem">
                  <TicketCard
                    ticket={ticket}
                    onClick={onTicketClick ? (t) => onTicketClick(t) : undefined}
                    isAiActive={aiActiveSessions[ticket.id] ?? false}
                  />
                </div>
              ))}
            </KanbanColumn>
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

// Skeleton column content (for loading state only)
const skeletonColumnContentStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-3)",
  flex: 1,
  overflowY: "auto",
  minHeight: 0,
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
