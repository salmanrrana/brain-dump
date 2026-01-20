import type { Ticket } from "../../lib/schema";

export interface TicketCardProps {
  ticket: Ticket;
  onClick?: ((ticket: Ticket) => void) | undefined;
  isAiActive?: boolean;
  isOverlay?: boolean;
}

export function TicketCard({
  ticket,
  onClick,
  isAiActive = false,
  isOverlay = false,
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

  // Determine PR status color
  const getPrStatusColor = (status: string | null) => {
    switch (status) {
      case "open":
        return "text-green-500";
      case "draft":
        return "text-gray-500";
      case "merged":
        return "text-purple-500";
      case "closed":
        return "text-red-500";
      default:
        return "text-gray-500";
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
        ${isOverlay ? "rotate-2 scale-105 shadow-xl cursor-grabbing" : "cursor-pointer"}
      `}
    >
      {/* Title */}
      <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
        {ticket.title}
      </h3>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-full bg-secondary/50 px-1.5 py-0.5 text-[10px] text-secondary-foreground"
            >
              {tag}
            </span>
          ))}
          {tags.length > 3 && (
            <span className="inline-flex items-center rounded-full bg-secondary/50 px-1.5 py-0.5 text-[10px] text-secondary-foreground">
              +{tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Git Info */}
      {(ticket.branchName || ticket.prNumber) && (
        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
          {ticket.branchName && (
            <div className="flex items-center gap-1 overflow-hidden" title={ticket.branchName}>
              <span>🌿</span>
              <span className="truncate max-w-[120px]">{ticket.branchName.split("/").pop()}</span>
            </div>
          )}

          {ticket.prNumber && (
            <div className="flex items-center gap-1">
              <span>🔗</span>
              <a
                href={ticket.prUrl || "#"}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={`hover:underline ${getPrStatusColor(ticket.prStatus)}`}
              >
                #{ticket.prNumber}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TicketCard;
