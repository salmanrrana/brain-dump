import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TicketCard } from "./TicketCard";
import type { Ticket } from "../../lib/schema";
import type { ActiveRalphSession } from "../../lib/hooks";

interface SortableTicketCardProps {
  ticket: Ticket;
  onClick?: (() => void) | undefined;
  ralphSession: ActiveRalphSession | null;
}

export function SortableTicketCard({ ticket, onClick, ralphSession }: SortableTicketCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TicketCard
        ticket={ticket}
        onClick={onClick}
        isDragging={isDragging}
        isAiActive={!!ralphSession}
      />
    </div>
  );
}
