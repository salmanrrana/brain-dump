import { memo, useCallback, useMemo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TicketCard } from "./TicketCard";
import type { TicketSummary } from "../../api/tickets";
import type { ActiveRalphSession } from "../../lib/hooks";

interface SortableTicketCardProps {
  ticket: TicketSummary;
  /** Stable click handler — receives the ticket, so parent doesn't need a per-card closure */
  onTicketClick?: ((ticket: TicketSummary) => void) | undefined;
  ralphSession: ActiveRalphSession | null;
  /** Tab index for roving tabindex pattern */
  tabIndex?: 0 | -1;
  /** Whether this card is keyboard-focused */
  isFocused?: boolean;
  /** Stable higher-order ref factory from useBoardKeyboardNavigation */
  registerCardRef?: (ticketId: string) => (el: HTMLElement | null) => void;
  /** Stable focus handler — receives ticketId, so parent doesn't need a per-card closure */
  onCardFocus?: (ticketId: string) => void;
}

export const SortableTicketCard = memo(function SortableTicketCard({
  ticket,
  onTicketClick,
  ralphSession,
  tabIndex = 0,
  isFocused = false,
  registerCardRef,
  onCardFocus,
}: SortableTicketCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.id,
  });

  const style = useMemo(
    () => ({
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    }),
    [transform, transition, isDragging]
  );

  // Combine refs: sortable ref + keyboard navigation ref
  const combinedRef = useCallback(
    (el: HTMLDivElement | null) => {
      setNodeRef(el);
      if (registerCardRef) {
        registerCardRef(ticket.id)(el);
      }
    },
    [setNodeRef, registerCardRef, ticket.id]
  );

  // Bind ticket.id once inside the memo boundary instead of per-render in parent
  const handleFocus = useCallback(() => {
    onCardFocus?.(ticket.id);
  }, [onCardFocus, ticket.id]);

  return (
    <div ref={combinedRef} style={style} {...attributes} {...listeners}>
      <TicketCard
        ticket={ticket}
        onClick={onTicketClick}
        isDragging={isDragging}
        isAiActive={!!ralphSession}
        tabIndex={tabIndex}
        isFocused={isFocused}
        onFocus={handleFocus}
      />
    </div>
  );
});
