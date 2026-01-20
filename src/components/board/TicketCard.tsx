import { memo, useMemo } from "react";
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

const PRIORITY_BORDER_COLORS: Record<string, string> = {
  high: "border-l-red-500",
  medium: "border-l-orange-500",
  low: "border-l-gray-400",
};

/**
 * Safely parse tags JSON with fallback to empty array.
 * Prevents crashes from malformed JSON in database.
 */
function parseTagsSafely(tagsJson: string | null): string[] {
  if (!tagsJson) return [];
  try {
    const parsed = JSON.parse(tagsJson);
    if (!Array.isArray(parsed)) {
      console.warn("Ticket tags is not an array, falling back to empty array");
      return [];
    }
    return parsed.filter((tag): tag is string => typeof tag === "string");
  } catch {
    console.warn("Failed to parse ticket tags JSON, falling back to empty array");
    return [];
  }
}

export const TicketCard = memo(function TicketCard({
  ticket,
  onClick,
  isAiActive = false,
  isOverlay = false,
  isDragging = false,
}: TicketCardProps) {
  // Memoize tag parsing to avoid expensive JSON.parse on every render
  const tags = useMemo(() => parseTagsSafely(ticket.tags), [ticket.tags]);

  const priorityBorderClass =
    PRIORITY_BORDER_COLORS[ticket.priority ?? ""] ?? "border-l-transparent";

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
        border-l-4 ${priorityBorderClass}
        ${isAiActive ? "ring-2 ring-primary/50 shadow-[0_0_12px_rgba(139,92,246,0.3)] animate-pulse-slow" : ""}
        ${isOverlay ? "rotate-2 scale-105 shadow-xl cursor-grabbing" : isDragging ? "opacity-50" : "cursor-pointer"}
      `}
    >
      <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
        {ticket.title}
      </h3>

      <TicketTags tags={tags} />

      <GitInfo
        branchName={ticket.branchName}
        prNumber={ticket.prNumber}
        prUrl={ticket.prUrl}
        prStatus={ticket.prStatus}
      />
    </div>
  );
});

export default TicketCard;
