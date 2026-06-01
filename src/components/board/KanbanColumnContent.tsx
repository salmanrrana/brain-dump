import { memo } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { SortableTicketCard } from "./SortableTicketCard";
import type { TicketSummary } from "../../api/tickets";
import type { ActiveRalphSession } from "../../lib/hooks";

export interface KanbanColumnContentProps {
  /** Ordered ticket ids for this column's SortableContext */
  ticketIds: string[];
  /** Tickets to render as cards (already sorted by position) */
  tickets: TicketSummary[];
  /** Click handler forwarded to each card (must be referentially stable) */
  onTicketClick?: ((ticket: TicketSummary) => void) | undefined;
  /** Active Ralph sessions keyed by ticket id */
  activeRalphSessions?: Record<string, ActiveRalphSession> | undefined;
  /** Roving-tabindex resolver from the keyboard navigation hook */
  getTabIndex: (ticketId: string) => 0 | -1;
  /** Currently keyboard-focused ticket id (null when none) */
  focusedTicketId: string | null;
  /** Stable higher-order ref factory from the keyboard navigation hook */
  registerCardRef: (ticketId: string) => (el: HTMLElement | null) => void;
  /** Stable focus handler from the keyboard navigation hook */
  onCardFocus: (ticketId: string) => void;
}

/**
 * Renders a single column's sortable card list in isolation from the board.
 *
 * This is the expensive part of a column render: the `SortableContext` plus one
 * `SortableTicketCard` per ticket. Previously the board passed this JSX directly
 * as `KanbanColumn`'s `children`, which is a fresh element object every render —
 * defeating `KanbanColumn`'s `memo` and re-mapping every card on every board
 * render (background poll, drag hover, focus change).
 *
 * By extracting it into its own `memo` boundary keyed on the column's real
 * inputs, the card mapping is skipped entirely when those inputs are unchanged.
 * With TanStack Query's structural sharing, an idle background poll keeps the
 * column's `tickets`/`ticketIds` references stable, so no column re-maps its
 * cards on an unrelated board update.
 */
export const KanbanColumnContent = memo(function KanbanColumnContent({
  ticketIds,
  tickets,
  onTicketClick,
  activeRalphSessions,
  getTabIndex,
  focusedTicketId,
  registerCardRef,
  onCardFocus,
}: KanbanColumnContentProps) {
  return (
    <SortableContext items={ticketIds} strategy={verticalListSortingStrategy}>
      {tickets.map((ticket) => (
        <SortableTicketCard
          key={ticket.id}
          ticket={ticket}
          onTicketClick={onTicketClick}
          ralphSession={activeRalphSessions?.[ticket.id] ?? null}
          tabIndex={getTabIndex(ticket.id)}
          isFocused={focusedTicketId === ticket.id}
          registerCardRef={registerCardRef}
          onCardFocus={onCardFocus}
        />
      ))}
    </SortableContext>
  );
});

export default KanbanColumnContent;
