import { type FC } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

// =============================================================================
// Types
// =============================================================================

export interface BackNavigationProps {
  /** Text label to display after the arrow */
  label?: string;
  /** Fallback URL if no history exists */
  fallback?: string;
  /** Optional test ID prefix */
  testId?: string;
}

// =============================================================================
// BackNavigation Component
// =============================================================================

/**
 * BackNavigation - Link component for navigating back to the board.
 *
 * Features:
 * - **Arrow icon + text**: Shows "← Back to Board" style link
 * - **Fallback URL**: Uses provided fallback when history unavailable
 * - **Hover state**: Subtle background on hover
 * - **Keyboard accessible**: Full focus states and proper link semantics
 * - **Preserves URL**: Links back to root with any existing query params
 *
 * @example
 * ```tsx
 * <BackNavigation label="Back to Board" fallback="/" />
 * ```
 */
export const BackNavigation: FC<BackNavigationProps> = ({
  label = "Back to Board",
  fallback = "/",
  testId = "back-navigation",
}) => {
  const router = useRouter();

  // Get current search params to preserve filters when going back
  const searchParams =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const preservedSearch = searchParams?.toString() ? `?${searchParams.toString()}` : "";

  // Build the target URL with preserved search params
  const targetUrl = `${fallback}${preservedSearch}`;

  // Handle click with prefetch for better performance
  const handleMouseEnter = () => {
    void router.preloadRoute({ to: fallback });
  };

  return (
    <Link
      to={targetUrl}
      style={linkStyles}
      data-testid={testId}
      className="hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]"
      onMouseEnter={handleMouseEnter}
    >
      <ArrowLeft size={16} aria-hidden="true" style={iconStyles} />
      <span>{label}</span>
    </Link>
  );
};

// =============================================================================
// Styles
// =============================================================================

const linkStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-2) var(--spacing-3)",
  borderRadius: "var(--radius-md)",
  color: "var(--text-secondary)",
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  textDecoration: "none",
  transition: "background-color 0.15s, color 0.15s",
};

const iconStyles: React.CSSProperties = {
  flexShrink: 0,
};

export default BackNavigation;
