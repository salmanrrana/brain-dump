import { type FC, useMemo, memo } from "react";
import { Link } from "@tanstack/react-router";
import { Layers, ChevronRight } from "lucide-react";
import type { Ticket } from "../../lib/hooks";
import { StatusPill, type TicketStatus } from "../navigation/StatusPill";

// =============================================================================
// Constants
// =============================================================================

/** Sort order for ticket statuses - lower numbers appear first */
const STATUS_SORT_ORDER: Record<string, number> = {
  in_progress: 0,
  ready: 1,
  ai_review: 2,
  human_review: 3,
  backlog: 4,
  done: 5,
};

/** Sort order for ticket priorities - lower numbers appear first */
const PRIORITY_SORT_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

/** Valid ticket status values for type checking */
const VALID_STATUSES: readonly TicketStatus[] = [
  "backlog",
  "ready",
  "in_progress",
  "ai_review",
  "human_review",
  "done",
];

/** Type guard to check if a string is a valid TicketStatus */
function isValidTicketStatus(status: string): status is TicketStatus {
  return VALID_STATUSES.includes(status as TicketStatus);
}

// =============================================================================
// Types
// =============================================================================

export interface RelatedTicketsProps {
  /** Current ticket (to exclude from related list) */
  currentTicketId: string;
  /** Epic ID to find related tickets (null if no epic) */
  epicId: string | null;
  /** Epic title for display */
  epicTitle?: string | null;
  /** All tickets in the epic */
  tickets: Ticket[];
  /** Maximum tickets to show before "View all" link */
  maxDisplay?: number;
  /** Optional test ID prefix */
  testId?: string;
}

interface RelatedTicketItemProps {
  ticket: Ticket;
  testId: string;
}

// =============================================================================
// Memoized List Item Component
// =============================================================================

/**
 * Memoized list item for related tickets to prevent unnecessary re-renders.
 */
const RelatedTicketItem = memo<RelatedTicketItemProps>(({ ticket, testId }) => {
  // Safely get the status - default to "backlog" if invalid
  const status: TicketStatus = isValidTicketStatus(ticket.status) ? ticket.status : "backlog";

  return (
    <li>
      <Link
        to="/ticket/$id"
        params={{ id: ticket.id }}
        style={ticketLinkStyles}
        data-testid={`${testId}-item-${ticket.id}`}
        className="hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-primary)]"
      >
        <StatusPill status={status} size="sm" />
        <span style={ticketTitleStyles}>{ticket.title}</span>
      </Link>
    </li>
  );
});

RelatedTicketItem.displayName = "RelatedTicketItem";

// =============================================================================
// RelatedTickets Component
// =============================================================================

/**
 * RelatedTickets - Panel showing other tickets in the same epic.
 *
 * Features:
 * - **Same epic filtering**: Shows tickets from same epic only
 * - **Current exclusion**: Excludes the current ticket from list
 * - **Mini ticket cards**: Title + status badge
 * - **Click navigation**: Links to ticket detail view
 * - **Empty state**: Graceful handling when no epic or no related tickets
 * - **Max display**: Shows up to N tickets with "View all" link
 *
 * @example
 * ```tsx
 * <RelatedTickets
 *   currentTicketId={ticket.id}
 *   epicId={ticket.epicId}
 *   epicTitle={epic?.title}
 *   tickets={ticketsInEpic}
 *   maxDisplay={5}
 * />
 * ```
 */
export const RelatedTickets: FC<RelatedTicketsProps> = ({
  currentTicketId,
  epicId,
  epicTitle,
  tickets,
  maxDisplay = 5,
  testId = "related-tickets",
}) => {
  // Filter and sort related tickets
  const relatedTickets = useMemo(() => {
    if (!epicId) return [];

    return tickets
      .filter((t) => t.epicId === epicId && t.id !== currentTicketId)
      .sort((a, b) => {
        // Sort by status priority: in_progress first, then ready, then backlog, then done
        const aOrder = STATUS_SORT_ORDER[a.status] ?? 99;
        const bOrder = STATUS_SORT_ORDER[b.status] ?? 99;
        if (aOrder !== bOrder) return aOrder - bOrder;

        // Then by priority
        const aPriority = PRIORITY_SORT_ORDER[a.priority ?? "medium"] ?? 1;
        const bPriority = PRIORITY_SORT_ORDER[b.priority ?? "medium"] ?? 1;
        return aPriority - bPriority;
      });
  }, [epicId, tickets, currentTicketId]);

  // Determine if we need a "View all" link
  const displayedTickets = relatedTickets.slice(0, maxDisplay);
  const hasMore = relatedTickets.length > maxDisplay;
  const totalCount = relatedTickets.length;

  // Empty state: no epic assigned
  if (!epicId) {
    return (
      <section style={containerStyles} data-testid={testId}>
        <h2 style={titleStyles}>
          <Layers size={16} aria-hidden="true" />
          Related Tickets
        </h2>
        <div style={emptyStateStyles} data-testid={`${testId}-empty`}>
          <span style={emptyTextStyles}>No epic assigned</span>
          <span style={emptyHintStyles}>Assign an epic to see related tickets</span>
        </div>
      </section>
    );
  }

  // Empty state: no other tickets in epic
  if (relatedTickets.length === 0) {
    return (
      <section style={containerStyles} data-testid={testId}>
        <h2 style={titleStyles}>
          <Layers size={16} aria-hidden="true" />
          Related Tickets
          {epicTitle && <span style={epicBadgeStyles}>{epicTitle}</span>}
        </h2>
        <div style={emptyStateStyles} data-testid={`${testId}-empty`}>
          <span style={emptyTextStyles}>No other tickets</span>
          <span style={emptyHintStyles}>This is the only ticket in this epic</span>
        </div>
      </section>
    );
  }

  return (
    <section style={containerStyles} data-testid={testId}>
      {/* Header */}
      <h2 style={titleStyles}>
        <Layers size={16} aria-hidden="true" />
        Related Tickets
        {epicTitle && <span style={epicBadgeStyles}>{epicTitle}</span>}
      </h2>

      {/* Ticket List */}
      <ul style={listStyles} data-testid={`${testId}-list`}>
        {displayedTickets.map((ticket) => (
          <RelatedTicketItem key={ticket.id} ticket={ticket} testId={testId} />
        ))}
      </ul>

      {/* View All Link */}
      {hasMore && (
        <Link
          to="/"
          search={{ epicId }}
          style={viewAllStyles}
          data-testid={`${testId}-view-all`}
          className="hover:text-[var(--accent-primary)] focus:outline-none focus-visible:underline"
        >
          <span>View all {totalCount} tickets in epic</span>
          <ChevronRight size={14} aria-hidden="true" />
        </Link>
      )}
    </section>
  );
};

// =============================================================================
// Styles
// =============================================================================

const containerStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-3)",
};

const titleStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  fontSize: "var(--font-size-lg)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  margin: 0,
};

const epicBadgeStyles: React.CSSProperties = {
  marginLeft: "auto",
  padding: "2px 8px",
  background: "var(--bg-tertiary)",
  borderRadius: "var(--radius-full)",
  fontSize: "var(--font-size-xs)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  color: "var(--text-secondary)",
};

const listStyles: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-1)",
};

const ticketLinkStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-2) var(--spacing-3)",
  borderRadius: "var(--radius-md)",
  textDecoration: "none",
  color: "var(--text-primary)",
  transition: "background-color 0.1s ease",
};

const ticketTitleStyles: React.CSSProperties = {
  flex: 1,
  fontSize: "var(--font-size-sm)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const viewAllStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-1)",
  padding: "var(--spacing-2) var(--spacing-3)",
  fontSize: "var(--font-size-sm)",
  color: "var(--text-secondary)",
  textDecoration: "none",
  transition: "color 0.1s ease",
};

const emptyStateStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--spacing-6)",
  background: "var(--bg-secondary)",
  borderRadius: "var(--radius-md)",
  textAlign: "center",
};

const emptyTextStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-secondary)",
  marginBottom: "var(--spacing-1)",
};

const emptyHintStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  color: "var(--text-muted)",
};

export default RelatedTickets;
