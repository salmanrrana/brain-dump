import type { FC } from "react";
import { useMemo } from "react";

export interface TicketTagsProps {
  /** Array of tag strings */
  tags: string[];
  /** Maximum number of tags to display before overflow (default: 3) */
  maxVisible?: number;
}

/**
 * TicketTags - Displays ticket tags with overflow handling.
 *
 * Features:
 * - Shows up to maxVisible tag pills (default 3)
 * - "+N more" indicator for overflow
 * - Hover tooltip on overflow shows remaining tags
 * - Color coding from predefined palette based on tag name hash
 * - Compact size for card use
 * - Returns null if no tags
 *
 * Layout:
 * ```
 * [auth] [backend] [api] +2 more
 * ```
 */
export const TicketTags: FC<TicketTagsProps> = ({ tags, maxVisible = 3 }) => {
  // Split tags into visible and overflow
  const visibleTags = tags.slice(0, maxVisible);
  const overflowTags = tags.slice(maxVisible);
  const hasOverflow = overflowTags.length > 0;

  // Create tooltip text for overflow indicator
  // Memoize to avoid recalculating on every render
  const overflowTooltip = useMemo(() => {
    return overflowTags.join(", ");
  }, [overflowTags]);

  // Hide if no tags (after all hooks, to satisfy rules-of-hooks)
  if (!tags || tags.length === 0) {
    return null;
  }

  return (
    <div style={containerStyles}>
      {visibleTags.map((tag) => (
        <TagPill key={tag} tag={tag} />
      ))}

      {hasOverflow && (
        <span
          style={overflowIndicatorStyles}
          title={overflowTooltip}
          aria-label={`${overflowTags.length} more tags: ${overflowTooltip}`}
        >
          +{overflowTags.length}
        </span>
      )}
    </div>
  );
};

/**
 * TagPill - Individual tag badge with color.
 */
interface TagPillProps {
  tag: string;
}

const TagPill: FC<TagPillProps> = ({ tag }) => {
  const color = getTagColor(tag);

  return (
    <span
      style={{
        ...tagPillStyles,
        backgroundColor: color.bg,
        color: color.text,
      }}
    >
      {tag}
    </span>
  );
};

// =============================================================================
// Color Palette
// =============================================================================

/**
 * Predefined color palette for tags.
 * Each color has a background and text color for good contrast.
 */
const TAG_COLORS = [
  { bg: "rgba(59, 130, 246, 0.15)", text: "#3b82f6" }, // blue
  { bg: "rgba(168, 85, 247, 0.15)", text: "#a855f7" }, // purple
  { bg: "rgba(34, 197, 94, 0.15)", text: "#22c55e" }, // green
  { bg: "rgba(249, 115, 22, 0.15)", text: "#f97316" }, // orange
  { bg: "rgba(236, 72, 153, 0.15)", text: "#ec4899" }, // pink
  { bg: "rgba(14, 165, 233, 0.15)", text: "#0ea5e9" }, // sky
  { bg: "rgba(234, 179, 8, 0.15)", text: "#ca8a04" }, // yellow (darkened for contrast)
  { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444" }, // red
  { bg: "rgba(99, 102, 241, 0.15)", text: "#6366f1" }, // indigo
  { bg: "rgba(20, 184, 166, 0.15)", text: "#14b8a6" }, // teal
] as const;

/**
 * Simple hash function to consistently map tag names to colors.
 * Same tag will always get the same color.
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Get color for a tag based on its name.
 */
function getTagColor(tag: string): { bg: string; text: string } {
  const index = hashString(tag) % TAG_COLORS.length;
  return TAG_COLORS[index]!;
}

// =============================================================================
// Styles
// =============================================================================

const containerStyles: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--spacing-1, 4px)",
  alignItems: "center",
};

const tagPillStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "9999px", // fully rounded (pill shape)
  padding: "2px 8px",
  fontSize: "10px",
  fontWeight: 500,
  lineHeight: 1.2,
  whiteSpace: "nowrap",
};

const overflowIndicatorStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "9999px",
  padding: "2px 6px",
  fontSize: "10px",
  fontWeight: 500,
  lineHeight: 1.2,
  backgroundColor: "var(--bg-secondary, rgba(100, 100, 100, 0.1))",
  color: "var(--text-muted, #6b7280)",
  cursor: "help",
};

export default TicketTags;
