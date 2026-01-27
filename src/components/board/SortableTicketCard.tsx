import { useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TicketCard, type TicketEpicWorktreeInfo } from "./TicketCard";
import type { Ticket } from "../../lib/schema";
import type { ActiveRalphSession } from "../../lib/hooks";

interface SortableTicketCardProps {
  ticket: Ticket;
  onClick?: (() => void) | undefined;
  ralphSession: ActiveRalphSession | null;
  /** Tab index for roving tabindex pattern */
  tabIndex?: 0 | -1;
  /** Whether this card is keyboard-focused */
  isFocused?: boolean;
  /** Ref callback for keyboard navigation */
  registerRef?: (el: HTMLElement | null) => void;
  /** Handler when card receives focus */
  onFocus?: () => void;
  /** Worktree info inherited from parent epic (optional) */
  epicWorktreeInfo?: TicketEpicWorktreeInfo | null | undefined;
}

export function SortableTicketCard({
  ticket,
  onClick,
  ralphSession,
  tabIndex = 0,
  isFocused = false,
  registerRef,
  onFocus,
  epicWorktreeInfo,
}: SortableTicketCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Combine refs: sortable ref + keyboard navigation ref
  const combinedRef = useCallback(
    (el: HTMLDivElement | null) => {
      setNodeRef(el);
      registerRef?.(el);
    },
    [setNodeRef, registerRef]
  );

  return (
    <div ref={combinedRef} style={style} {...attributes} {...listeners}>
      <TicketCard
        ticket={ticket}
        onClick={onClick}
        isDragging={isDragging}
        isAiActive={!!ralphSession}
        tabIndex={tabIndex}
        isFocused={isFocused}
        onFocus={onFocus}
        epicWorktreeInfo={epicWorktreeInfo}
      />
    </div>
  );
}
