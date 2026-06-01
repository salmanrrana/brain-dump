import { memo } from "react";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanColumnContent } from "./KanbanColumnContent";
import type { TicketStatus, TicketSummary } from "../../api/tickets";
import type { ActiveRalphSession } from "../../lib/hooks";

export interface BoardColumnProps {
  /** Status this column represents */
  status: TicketStatus;
  /** Human-readable column label */
  label: string;
  /** Accent color for the column header */
  accentColor: string;
  /** Ordered ticket ids for this column's SortableContext */
  ticketIds: string[];
  /** Tickets to render as cards (already sorted by position) */
  tickets: TicketSummary[];
  /** Click handler forwarded to each card (must be referentially stable) */
  onTicketClick?: ((ticket: TicketSummary) => void) | undefined;
  /** Active Ralph sessions keyed by ticket id */
  activeRalphSessions?: Record<string, ActiveRalphSession> | undefined;
  /**
   * Keyboard-focused ticket id IF it belongs to this column, else null. The
   * board passes null to every column that doesn't own the focused card, so a
   * focus move re-renders only the column(s) that gained/lost focus.
   */
  focusedTicketId: string | null;
  /** Roving tab-stop ticket id IF it belongs to this column, else null. */
  tabStopTicketId: string | null;
  /** Stable higher-order ref factory from the keyboard navigation hook */
  registerCardRef: (ticketId: string) => (el: HTMLElement | null) => void;
  /** Stable focus handler from the keyboard navigation hook */
  onCardFocus: (ticketId: string) => void;
}

/**
 * One kanban column: the column shell (`KanbanColumn`) plus its sortable card
 * list (`KanbanColumnContent`), memoized as a single unit.
 *
 * The board renders six of these. Keyboard navigation focus lives in the board,
 * so every arrow-key press re-renders the board. Without this boundary the board
 * would hand each column a fresh `children` element, re-rendering all six column
 * shells (and re-mapping every card list) on every focus move.
 *
 * By scoping the focus props per column — the board passes `focusedTicketId` /
 * `tabStopTicketId` only to the column that actually owns that card, and null to
 * the rest — this `memo` boundary holds for the unaffected columns. A focus move
 * (or an idle background poll, where TanStack Query keeps ticket references
 * stable) then re-renders at most the one or two columns whose focus changed,
 * and within them only the one or two cards whose tab-stop/focus state flipped.
 */
export const BoardColumn = memo(function BoardColumn({
  status,
  label,
  accentColor,
  ticketIds,
  tickets,
  onTicketClick,
  activeRalphSessions,
  focusedTicketId,
  tabStopTicketId,
  registerCardRef,
  onCardFocus,
}: BoardColumnProps) {
  return (
    <KanbanColumn status={status} label={label} count={tickets.length} accentColor={accentColor}>
      <KanbanColumnContent
        ticketIds={ticketIds}
        tickets={tickets}
        onTicketClick={onTicketClick}
        activeRalphSessions={activeRalphSessions}
        focusedTicketId={focusedTicketId}
        tabStopTicketId={tabStopTicketId}
        registerCardRef={registerCardRef}
        onCardFocus={onCardFocus}
      />
    </KanbanColumn>
  );
});

export default BoardColumn;
