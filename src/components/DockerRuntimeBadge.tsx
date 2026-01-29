import { Container, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { useDockerAvailability } from "../lib/hooks";

/**
 * Props for the DockerRuntimeBadge component.
 */
interface DockerRuntimeBadgeProps {
  /** Project path - required to show the badge (null hides it) */
  projectPath: string | null;
  /** Optional click handler, typically for opening logs modal */
  onClick?: () => void;
}

/**
 * A reusable badge component that shows Docker runtime status.
 *
 * States:
 * - Loading: Shows spinner while checking Docker status
 * - Available: Cyan icon, Docker is ready for use
 * - Unavailable: Yellow warning icon with tooltip explaining why
 *
 * Uses useDockerAvailability hook which caches status for 30 seconds.
 */
export default function DockerRuntimeBadge({ projectPath, onClick }: DockerRuntimeBadgeProps) {
  const { isAvailable, isImageBuilt, message, loading } = useDockerAvailability();

  // Don't render if no project path is provided
  if (!projectPath) return null;

  // Determine icon based on state
  const Icon = loading
    ? Loader2
    : isAvailable && isImageBuilt
      ? CheckCircle
      : isAvailable
        ? Container // Docker running but image not built - not an error
        : AlertCircle;

  // Determine color based on state
  const color = loading
    ? "text-[var(--text-secondary)]"
    : isAvailable && isImageBuilt
      ? "text-[var(--accent-ai)]"
      : isAvailable
        ? "text-[var(--text-secondary)]" // Image not built - neutral, will build on first use
        : "text-[var(--warning)]"; // Docker not available - warning

  // Generate accessible tooltip text
  const tooltipText = loading ? "Checking Docker status..." : message || "Docker runtime available";

  // Determine if badge should be interactive (has click handler and docker is available)
  const isClickable = Boolean(onClick) && isAvailable;

  // Common classes for both button and span
  const baseClasses = `flex items-center gap-1 px-2 py-1 rounded ${color} transition-colors`;
  const interactiveClasses = isClickable ? "hover:bg-[var(--bg-hover)] " : "";

  // Use button if clickable, span if not (for accessibility)
  if (isClickable) {
    return (
      <button
        onClick={onClick}
        className={`${baseClasses} ${interactiveClasses}`}
        title={tooltipText}
        aria-label={`Docker status: ${tooltipText}`}
      >
        <Icon size={14} className={loading ? "animate-spin" : ""} aria-hidden="true" />
        <span className="text-xs">Docker</span>
      </button>
    );
  }

  // Non-interactive when Docker unavailable or no click handler
  return (
    <span
      className={baseClasses}
      title={tooltipText}
      role="status"
      aria-label={`Docker status: ${tooltipText}`}
      tabIndex={0} // Allow keyboard focus for tooltip accessibility
    >
      <Icon size={14} className={loading ? "animate-spin" : ""} aria-hidden="true" />
      <span className="text-xs">Docker</span>
    </span>
  );
}
