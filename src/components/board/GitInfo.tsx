import { memo } from "react";
import type { FC } from "react"; // Used by PrBadge
import { GitBranch, ExternalLink } from "lucide-react";

export interface GitInfoProps {
  /** Git branch name (e.g., "feature/ui-v2") */
  branchName?: string | null;
  /** PR number (e.g., 42) */
  prNumber?: number | null;
  /** PR URL for linking */
  prUrl?: string | null;
  /** PR status for color coding */
  prStatus?: "draft" | "open" | "merged" | "closed" | null;
}

/**
 * GitInfo - Shows git branch and PR status on ticket cards.
 *
 * Features:
 * - Branch badge with branch icon
 * - PR badge with number and status color
 * - Truncates long branch names with tooltip showing full name
 * - Returns null if no git info to display
 *
 * Layout:
 * ```
 * 🌿 feature/ui-v2  🔗 #42 ●  <- Branch + PR number + status dot
 * ```
 */
export const GitInfo = memo(function GitInfo({
  branchName,
  prNumber,
  prUrl,
  prStatus,
}: GitInfoProps) {
  // Hide if no git info
  if (!branchName && !prNumber) {
    return null;
  }

  // Get the short branch name (last segment after /)
  const shortBranchName = branchName?.split("/").pop() ?? branchName;

  return (
    <div style={containerStyles}>
      {/* Branch badge */}
      {branchName && (
        <div
          style={branchBadgeStyles}
          title={branchName} // Full branch name in tooltip
          aria-label={`Branch: ${branchName}`}
        >
          <GitBranch size={12} style={iconStyles} />
          <span style={branchTextStyles}>{shortBranchName}</span>
        </div>
      )}

      {/* PR badge */}
      {prNumber && <PrBadge prNumber={prNumber} prUrl={prUrl} prStatus={prStatus} />}
    </div>
  );
});

/**
 * PrBadge - Internal component for PR number and status display.
 */
interface PrBadgeProps {
  prNumber: number;
  prUrl: string | null | undefined;
  prStatus: "draft" | "open" | "merged" | "closed" | null | undefined;
}

const PrBadge: FC<PrBadgeProps> = ({ prNumber, prUrl, prStatus }) => {
  const statusColor = getPrStatusColor(prStatus);
  const statusLabel = getPrStatusLabel(prStatus);

  const content = (
    <div style={prBadgeStyles} aria-label={`Pull request #${prNumber}: ${statusLabel}`}>
      <ExternalLink size={12} style={iconStyles} />
      <span style={{ ...prNumberStyles, color: statusColor }}>#{prNumber}</span>
      <span style={{ ...statusDotStyles, backgroundColor: statusColor }} title={statusLabel} />
    </div>
  );

  // If we have a URL, wrap in a link
  if (prUrl) {
    return (
      <a
        href={prUrl}
        target="_blank"
        rel="noreferrer noopener"
        onClick={(e) => e.stopPropagation()} // Prevent card click
        style={prLinkStyles}
      >
        {content}
      </a>
    );
  }

  return content;
};

/**
 * Get color for PR status.
 * - open: green
 * - draft: gray
 * - merged: purple
 * - closed: red
 */
function getPrStatusColor(status: string | null | undefined): string {
  switch (status) {
    case "open":
      return "var(--status-open, #22c55e)"; // green
    case "draft":
      return "var(--status-draft, #6b7280)"; // gray
    case "merged":
      return "var(--status-merged, #a855f7)"; // purple
    case "closed":
      return "var(--status-closed, #ef4444)"; // red
    default:
      return "var(--text-muted, #6b7280)";
  }
}

/**
 * Get human-readable label for PR status.
 */
function getPrStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "open":
      return "Open";
    case "draft":
      return "Draft";
    case "merged":
      return "Merged";
    case "closed":
      return "Closed";
    default:
      return "Unknown";
  }
}

const containerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2, 8px)",
  fontSize: "var(--font-size-xs, 10px)",
  color: "var(--text-muted, #6b7280)",
  marginTop: "var(--spacing-1, 4px)",
};

const branchBadgeStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-1, 4px)",
  maxWidth: 140,
  overflow: "hidden",
};

const iconStyles: React.CSSProperties = {
  flexShrink: 0,
  opacity: 0.7,
};

const branchTextStyles: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const prBadgeStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-1, 4px)",
};

const prNumberStyles: React.CSSProperties = {
  fontWeight: 500,
};

const statusDotStyles: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  flexShrink: 0,
};

const prLinkStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  textDecoration: "none",
  color: "inherit",
  transition: "opacity 0.15s",
};

export default GitInfo;
