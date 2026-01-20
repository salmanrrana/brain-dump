import type { Ticket } from "../../lib/schema";
import { GitInfo } from "./GitInfo";
import { TicketTags } from "./TicketTags";

export interface TicketCardProps {
  ticket: Ticket;
  onClick?: ((ticket: Ticket) => void) | undefined;
  isAiActive?: boolean;
  isOverlay?: boolean;
  isDragging?: boolean;
}

export function TicketCard({
  ticket,
  onClick,
  isAiActive = false,
  isOverlay = false,
  isDragging = false,
}: TicketCardProps) {
  // Parse JSON fields
  const tags = ticket.tags ? (JSON.parse(ticket.tags) as string[]) : [];

  // Determine priority color
  const getPriorityColor = (priority: string | null) => {
    switch (priority) {
      case "high":
        return "border-l-red-500";
      case "medium":
        return "border-l-orange-500";
      case "low":
        return "border-l-gray-400";
      default:
        return "border-l-transparent";
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick?.(ticket)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.(ticket);
        }
      }}
      className={`
        group relative flex flex-col gap-2 rounded-lg border border-border/50 
        bg-card p-3 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5
        border-l-4 ${getPriorityColor(ticket.priority)}
        ${isAiActive ? "ring-2 ring-primary/50 shadow-[0_0_12px_rgba(139,92,246,0.3)] animate-pulse-slow" : ""}
        ${isOverlay ? "rotate-2 scale-105 shadow-xl cursor-grabbing" : isDragging ? "opacity-50" : "cursor-pointer"}
      `}
    >
      {/* Title */}
      <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
        {ticket.title}
      </h3>

      {/* Tags - Colored pills with overflow handling */}
      <TicketTags tags={tags} />

      {/* Git Info - Branch and PR status */}
      <GitInfo
        branchName={ticket.branchName}
        prNumber={ticket.prNumber}
        prUrl={ticket.prUrl}
        prStatus={ticket.prStatus}
      />
    </div>
  );
}

export default TicketCard;
