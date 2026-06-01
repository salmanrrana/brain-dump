import { memo, useCallback, useMemo, useState } from "react";
import type { RefObject } from "react";
import { useDndMonitor, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type { Range } from "@tanstack/react-virtual";
import { SortableTicketCard } from "./SortableTicketCard";
import type { TicketSummary } from "../../api/tickets";
import type { ActiveRalphSession } from "../../lib/hooks";

const VIRTUALIZATION_THRESHOLD = 20;
const TICKET_CARD_HEIGHT_ESTIMATE = 132;
const VIRTUALIZATION_OVERSCAN = 6;

export interface KanbanColumnContentProps {
  /** Scrollable column content element used by TanStack Virtual */
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  /** Ordered ticket ids for this column's SortableContext */
  ticketIds: string[];
  /** Tickets to render as cards (already sorted by position) */
  tickets: TicketSummary[];
  /** Click handler forwarded to each card (must be referentially stable) */
  onTicketClick?: ((ticket: TicketSummary) => void) | undefined;
  /** Active Ralph sessions keyed by ticket id */
  activeRalphSessions?: Record<string, ActiveRalphSession> | undefined;
  /** Keyboard-focused ticket id for this column; null when no card here is focused. */
  focusedTicketId: string | null;
  /** Roving tab-stop ticket id for this column; null when the tab stop is elsewhere. */
  tabStopTicketId: string | null;
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
  scrollContainerRef,
  ticketIds,
  tickets,
  onTicketClick,
  activeRalphSessions,
  focusedTicketId,
  tabStopTicketId,
  registerCardRef,
  onCardFocus,
}: KanbanColumnContentProps) {
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveTicketId(String(event.active.id));
  }, []);

  const clearActiveTicket = useCallback(() => {
    setActiveTicketId(null);
  }, []);

  const dndMonitor = useMemo(
    () => ({
      onDragStart: handleDragStart,
      onDragEnd: clearActiveTicket,
      onDragCancel: clearActiveTicket,
    }),
    [handleDragStart, clearActiveTicket]
  );

  useDndMonitor(dndMonitor);

  const useVirtual = tickets.length > VIRTUALIZATION_THRESHOLD;
  const focusedTicketIndex = focusedTicketId ? ticketIds.indexOf(focusedTicketId) : -1;
  const tabStopTicketIndex = tabStopTicketId ? ticketIds.indexOf(tabStopTicketId) : -1;
  const activeTicketIndex = activeTicketId ? ticketIds.indexOf(activeTicketId) : -1;

  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = new Set(defaultRangeExtractor(range));
      for (const index of [focusedTicketIndex, tabStopTicketIndex, activeTicketIndex]) {
        if (index >= 0 && index < range.count) {
          indexes.add(index);
        }
      }
      return [...indexes].sort((a, b) => a - b);
    },
    [activeTicketIndex, focusedTicketIndex, tabStopTicketIndex]
  );

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: tickets.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => TICKET_CARD_HEIGHT_ESTIMATE,
    overscan: VIRTUALIZATION_OVERSCAN,
    enabled: useVirtual,
    rangeExtractor,
  });

  const virtualItems = useVirtual ? virtualizer.getVirtualItems() : [];

  const renderTicketCard = useCallback(
    (ticket: TicketSummary) => (
      <SortableTicketCard
        key={ticket.id}
        ticket={ticket}
        onTicketClick={onTicketClick}
        ralphSession={activeRalphSessions?.[ticket.id] ?? null}
        tabIndex={ticket.id === tabStopTicketId ? 0 : -1}
        isFocused={ticket.id === focusedTicketId}
        registerCardRef={registerCardRef}
        onCardFocus={onCardFocus}
      />
    ),
    [
      activeRalphSessions,
      focusedTicketId,
      onCardFocus,
      onTicketClick,
      registerCardRef,
      tabStopTicketId,
    ]
  );

  return (
    <SortableContext items={ticketIds} strategy={verticalListSortingStrategy}>
      {useVirtual ? (
        <div style={virtualListStyles} data-testid="kanban-virtual-list">
          <div
            style={{
              ...virtualListInnerStyles,
              height: virtualizer.getTotalSize(),
            }}
          >
            {virtualItems.map((virtualItem) => {
              const ticket = tickets[virtualItem.index];
              if (!ticket) return null;

              return (
                <div
                  key={virtualItem.key}
                  ref={virtualizer.measureElement}
                  data-index={virtualItem.index}
                  style={{
                    ...virtualTicketRowStyles,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {renderTicketCard(ticket)}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        tickets.map((ticket) => renderTicketCard(ticket))
      )}
    </SortableContext>
  );
});

const virtualListStyles: React.CSSProperties = {
  width: "100%",
};

const virtualListInnerStyles: React.CSSProperties = {
  position: "relative",
  width: "100%",
};

const virtualTicketRowStyles: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  paddingBottom: "var(--spacing-2)",
  boxSizing: "border-box",
};

export default KanbanColumnContent;
