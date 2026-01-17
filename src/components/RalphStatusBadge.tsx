import type { RalphSessionState } from "../lib/schema";
import type { ActiveRalphSession } from "../lib/hooks";

/**
 * Configuration for each Ralph session state
 */
const STATE_CONFIG: Record<
  RalphSessionState,
  { label: string; bgClass: string; textClass: string; pulseClass?: string }
> = {
  idle: {
    label: "Idle",
    bgClass: "bg-slate-600",
    textClass: "text-slate-200",
  },
  analyzing: {
    label: "Analyzing",
    bgClass: "bg-purple-600",
    textClass: "text-purple-100",
    pulseClass: "animate-pulse",
  },
  implementing: {
    label: "Coding",
    bgClass: "bg-cyan-600",
    textClass: "text-cyan-100",
    pulseClass: "animate-pulse",
  },
  testing: {
    label: "Testing",
    bgClass: "bg-amber-600",
    textClass: "text-amber-100",
    pulseClass: "animate-pulse",
  },
  committing: {
    label: "Committing",
    bgClass: "bg-green-600",
    textClass: "text-green-100",
    pulseClass: "animate-pulse",
  },
  reviewing: {
    label: "Reviewing",
    bgClass: "bg-blue-600",
    textClass: "text-blue-100",
    pulseClass: "animate-pulse",
  },
  done: {
    label: "Done",
    bgClass: "bg-green-700",
    textClass: "text-green-100",
  },
};

interface RalphStatusBadgeProps {
  /** The active Ralph session, or null if no session is active */
  session: ActiveRalphSession | null;
  /** Size variant: 'sm' for card, 'md' for modal */
  size?: "sm" | "md";
}

/**
 * Displays the current Ralph session state as a badge.
 * Shows a pulsing animation for active states (analyzing, implementing, testing, etc.)
 */
export function RalphStatusBadge({ session, size = "sm" }: RalphStatusBadgeProps) {
  if (!session) {
    return null;
  }

  const config = STATE_CONFIG[session.currentState] ?? STATE_CONFIG.idle;
  const sizeClasses = size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-medium ${config.bgClass} ${config.textClass} ${sizeClasses} ${config.pulseClass ?? ""}`}
      title={`Ralph is ${session.currentState}`}
    >
      <RalphIcon className={size === "sm" ? "w-3 h-3" : "w-4 h-4"} />
      {config.label}
    </span>
  );
}

/**
 * Small robot icon for Ralph branding
 */
function RalphIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Robot head */}
      <rect x="5" y="8" width="14" height="11" rx="2" />
      {/* Antenna */}
      <line x1="12" y1="4" x2="12" y2="8" />
      <circle cx="12" cy="3" r="1" fill="currentColor" />
      {/* Eyes */}
      <circle cx="9" cy="13" r="1.5" fill="currentColor" />
      <circle cx="15" cy="13" r="1.5" fill="currentColor" />
    </svg>
  );
}

export default RalphStatusBadge;
