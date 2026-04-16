import { memo } from "react";
import { CopyableTag } from "./CopyableTag";

export interface TicketTagsProps {
  /** Array of tag strings */
  tags: string[];
  /** Maximum number of tags to display before overflow (default: 3) */
  maxVisible?: number;
}

/**
 * TicketTags - Displays ticket tags with overflow handling.
 * Shows up to maxVisible tags (default 3) with "+N more" indicator.
 * Returns null if no tags.
 */
export const TicketTags = memo(function TicketTags({ tags, maxVisible = 3 }: TicketTagsProps) {
  if (!tags || tags.length === 0) {
    return null;
  }

  const visibleTags = tags.slice(0, maxVisible);
  const overflowTags = tags.slice(maxVisible);
  const hasOverflow = overflowTags.length > 0;
  const overflowTooltip = overflowTags.join(", ");

  return (
    <div style={containerStyles}>
      {visibleTags.map((tag) => (
        <CopyableTag
          key={tag}
          tag={tag}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
            }
          }}
        />
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
});

const containerStyles: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--spacing-1, 4px)",
  alignItems: "center",
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
