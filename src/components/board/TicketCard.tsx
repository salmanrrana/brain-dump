import { memo, useMemo } from "react";
import { Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import type { TicketSummary } from "../../api/tickets";
import { GitInfo } from "./GitInfo";
import { TicketTags } from "./TicketTags";

export interface TicketCardProps {
  ticket: TicketSummary;
  onClick?: ((ticket: TicketSummary) => void) | undefined;
  isAiActive?: boolean;
  isOverlay?: boolean;
  isDragging?: boolean;
  /** Tab index for roving tabindex pattern (default: 0) */
  tabIndex?: 0 | -1;
  /** Whether this card is keyboard-focused (shows focus ring) */
  isFocused?: boolean;
  /** Handler when card receives focus */
  onFocus?: (() => void) | undefined;
}

const PRIORITY_BORDER_COLORS: Record<string, string> = {
  high: "border-l-[var(--accent-danger)]",
  medium: "border-l-[var(--accent-warning)]",
  low: "border-l-[var(--text-tertiary)]",
};

function getVerificationLabel(ticket: TicketSummary): string {
  switch (ticket.verificationJobStatus) {
    case "queued":
      return "Verification Queued";
    case "running":
      return "Verification Running";
    case "failed":
      return "Verification Retrying";
    case "blocked":
    case "dead":
      return "Verification Blocked";
    case "succeeded":
      return "Verification Complete";
    default:
      return "Verification Pending";
  }
}

/**
 * Safely parse tags JSON with fallback to empty array.
 * Prevents crashes from malformed JSON in database.
 */
function parseTagsSafely(tagsJson: string | null): string[] {
  if (!tagsJson) return [];
  try {
    const parsed = JSON.parse(tagsJson);
    if (!Array.isArray(parsed)) {
      // Invalid format - silently fall back to empty array
      return [];
    }
    return parsed.filter((tag): tag is string => typeof tag === "string");
  } catch {
    // Invalid JSON - silently fall back to empty array
    return [];
  }
}

export const TicketCard = memo(function TicketCard({
  ticket,
  onClick,
  isAiActive = false,
  isOverlay = false,
  isDragging = false,
  tabIndex = 0,
  isFocused = false,
  onFocus,
}: TicketCardProps) {
  // Memoize tag parsing to avoid expensive JSON.parse on every render
  const tags = useMemo(() => parseTagsSafely(ticket.tags), [ticket.tags]);

  const priorityBorderClass =
    PRIORITY_BORDER_COLORS[ticket.priority ?? ""] ?? "border-l-transparent";
  const isVerificationJobBlocked =
    ticket.status === "ai_verification" &&
    (ticket.verificationJobStatus === "blocked" || ticket.verificationJobStatus === "dead");
  const isBlocked = ticket.isBlocked === true || isVerificationJobBlocked;
  const verificationLabel = getVerificationLabel(ticket);

  return (
    <div
      role="button"
      tabIndex={tabIndex}
      aria-label={`Open ticket: ${ticket.title}`}
      onClick={() => onClick?.(ticket)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.(ticket);
        }
      }}
      onFocus={onFocus}
      className={`
        group relative flex flex-col gap-2.5 rounded-xl border border-[var(--border-primary)]
        bg-[var(--bg-card)] p-3.5 transition-all
        hover:border-[var(--border-secondary)] hover:shadow-lg hover:-translate-y-0.5
        border-l-[3px] ${priorityBorderClass}
        ${isBlocked ? "ring-2 ring-[var(--accent-danger)]/40 border-[var(--accent-danger)]/60" : ""}
        ${isAiActive ? "ring-1 ring-[var(--accent-ai)]/40 shadow-[0_0_16px_var(--accent-ai-glow)] animate-pulse-slow" : ""}
        ${isOverlay ? "rotate-1 scale-[1.03] shadow-2xl cursor-grabbing" : isDragging ? "opacity-40" : "cursor-pointer"}
        ${isFocused ? "ring-2 ring-offset-2 ring-[var(--accent-primary)]" : ""}
        focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent-primary)] focus-visible:outline-none
      `}
    >
      <h3 className="line-clamp-2 text-sm font-medium leading-snug text-[var(--text-primary)]">
        {ticket.title}
      </h3>

      {isBlocked ? (
        <div className="flex flex-col gap-1 rounded-lg border border-[var(--accent-danger)]/40 bg-[var(--accent-danger)]/10 px-2 py-1.5 text-xs text-[var(--accent-danger)]">
          <div className="flex items-center gap-1.5 font-semibold">
            <TriangleAlert size={12} aria-hidden="true" />
            <span>Needs Attention</span>
          </div>
          {(ticket.blockedReason || ticket.verificationJobLastError) && (
            <span className="line-clamp-2 text-[var(--text-secondary)]">
              {ticket.blockedReason ?? ticket.verificationJobLastError}
            </span>
          )}
        </div>
      ) : ticket.status === "ai_verification" ? (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[var(--info-muted)] text-[var(--info)] text-xs font-medium w-fit">
          {ticket.verificationJobStatus === "running" ? (
            <Loader2 size={12} className="animate-spin" aria-hidden="true" />
          ) : (
            <ShieldCheck size={12} aria-hidden="true" />
          )}
          <span>{verificationLabel}</span>
        </div>
      ) : null}

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
