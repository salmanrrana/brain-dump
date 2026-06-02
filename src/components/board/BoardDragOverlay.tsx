import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DragOverlay, useDndMonitor, type DragStartEvent } from "@dnd-kit/core";
import { TicketCard } from "./TicketCard";
import type { TicketSummary } from "../../api/tickets";
import type { ActiveRalphSession } from "../../lib/hooks";

interface BoardDragOverlayProps {
  /** All board tickets, used to resolve the active drag item by id */
  tickets: TicketSummary[];
  /** Active Ralph sessions keyed by ticket id (for the overlay's AI indicator) */
  activeRalphSessions?: Record<string, ActiveRalphSession> | undefined;
}

/**
 * Renders the drag overlay in isolation from the board tree.
 *
 * The active drag ticket is tracked in THIS component's own state (fed by
 * dnd-kit's `useDndMonitor`) rather than in `KanbanBoard`. Picking up or
 * dropping a card therefore re-renders only this tiny overlay component
 * instead of the entire board (all six columns and every card). This is the
 * single biggest source of drag jank, since the board's column children are
 * fresh JSX each render and defeat the per-column `memo` boundary.
 */
export const BoardDragOverlay = memo(function BoardDragOverlay({
  tickets,
  activeRalphSessions,
}: BoardDragOverlayProps) {
  const [activeTicket, setActiveTicket] = useState<TicketSummary | null>(null);

  // Keep the latest tickets in a ref so the dnd-kit listeners stay
  // referentially stable. `useDndMonitor` re-subscribes whenever the listener
  // object identity changes; a fresh `tickets` array on every board poll would
  // otherwise tear down and re-register the subscription on the drag hot path.
  const ticketsRef = useRef(tickets);
  useEffect(() => {
    ticketsRef.current = tickets;
  }, [tickets]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveTicket(ticketsRef.current.find((t) => t.id === event.active.id) ?? null);
  }, []);

  const clearActiveTicket = useCallback(() => {
    setActiveTicket(null);
  }, []);

  // Stable listener object → dnd-kit subscribes exactly once for this overlay's
  // lifetime instead of re-registering on every re-render.
  const monitor = useMemo(
    () => ({
      onDragStart: handleDragStart,
      onDragEnd: clearActiveTicket,
      onDragCancel: clearActiveTicket,
    }),
    [handleDragStart, clearActiveTicket]
  );

  useDndMonitor(monitor);

  return (
    <DragOverlay>
      {activeTicket ? (
        <TicketCard
          ticket={activeTicket}
          isOverlay
          isAiActive={!!activeRalphSessions?.[activeTicket.id]}
        />
      ) : null}
    </DragOverlay>
  );
});
