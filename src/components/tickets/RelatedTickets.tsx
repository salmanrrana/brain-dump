import { type FC, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Layers, ChevronRight } from "lucide-react";
import type { Ticket } from "../../lib/hooks";
import { StatusPill } from "../navigation/StatusPill";
import type { TicketStatus } from "../navigation/StatusPill";

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
        const statusOrder: Record<string, number> = {
          in_progress: 0,
          ready: 1,
          review: 2,
          ai_review: 3,
          human_review: 4,
          backlog: 5,
          done: 6,
        };
        const aOrder = statusOrder[a.status] ?? 99;
        const bOrder = statusOrder[b.status] ?? 99;
        if (aOrder !== bOrder) return aOrder - bOrder;

        // Then by priority
        const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
        const aPriority = priorityOrder[a.priority ?? "medium"] ?? 1;
        const bPriority = priorityOrder[b.priority ?? "medium"] ?? 1;
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
          <li key={ticket.id}>
            <Link
              to="/ticket/$id"
              params={{ id: ticket.id }}
              style={ticketLinkStyles}
              data-testid={`${testId}-item-${ticket.id}`}
              className="hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-primary)]"
            >
              <StatusPill status={ticket.status as TicketStatus} size="sm" />
              <span style={ticketTitleStyles}>{ticket.title}</span>
            </Link>
          </li>
        ))}
      </ul>

      {/* View All Link */}
      {hasMore && (
        <a
          href={`/?epicId=${epicId}`}
          style={viewAllStyles}
          data-testid={`${testId}-view-all`}
          className="hover:text-[var(--accent-primary)] focus:outline-none focus-visible:underline"
        >
          <span>View all {totalCount} tickets in epic</span>
          <ChevronRight size={14} aria-hidden="true" />
        </a>
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
