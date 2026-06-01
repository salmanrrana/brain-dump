import { memo, useState } from "react";
import { DragOverlay, useDndMonitor } from "@dnd-kit/core";
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

  useDndMonitor({
    onDragStart(event) {
      setActiveTicket(tickets.find((t) => t.id === event.active.id) ?? null);
    },
    onDragEnd() {
      setActiveTicket(null);
    },
    onDragCancel() {
      setActiveTicket(null);
    },
  });

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
