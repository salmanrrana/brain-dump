import type { FC } from "react";
import { Filter, X } from "lucide-react";

export interface BoardHeaderProps {
  /** Currently selected project ID */
  projectId?: string | null;
  /** Currently selected epic ID */
  epicId?: string | null;
  /** Currently selected tags */
  tags?: string[];
  /** Handler when project filter changes */
  onProjectChange?: (projectId: string | null) => void;
  /** Handler when epic filter changes */
  onEpicChange?: (epicId: string | null) => void;
  /** Handler when tags filter changes */
  onTagsChange?: (tags: string[]) => void;
  /** Handler to clear all filters */
  onClearFilters?: () => void;
}

/**
 * BoardHeader - Header component with filter controls for the kanban board.
 *
 * This is a stub component that will be fully implemented in ticket 52.
 * Currently provides:
 * - Board title
 * - Placeholder for filter chips (project, epic, tags)
 * - Clear all filters button (shown when filters active)
 *
 * Future implementation (ticket 52) will add:
 * - Project dropdown filter
 * - Epic dropdown filter
 * - Tag multi-select filter
 * - Active filter count indicator
 * - URL params sync
 *
 * Layout:
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Board    [Project ▾] [Epic ▾] [Tags ▾]    Clear (3 active) │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 */
export const BoardHeader: FC<BoardHeaderProps> = ({
  projectId,
  epicId,
  tags = [],
  onClearFilters,
}) => {
  // Count active filters
  const activeFilterCount = [projectId ? 1 : 0, epicId ? 1 : 0, tags.length > 0 ? 1 : 0].reduce(
    (a, b) => a + b,
    0
  );

  const hasActiveFilters = activeFilterCount > 0;

  return (
    <div style={headerContainerStyles} data-testid="board-header">
      {/* Title */}
      <h1 style={titleStyles}>Board</h1>

      {/* Filter controls placeholder */}
      <div style={filtersContainerStyles}>
        <div style={filterChipsStyles}>
          {/* Placeholder for future filter dropdowns */}
          <button
            type="button"
            style={filterChipStyles}
            disabled
            title="Project filter (coming soon)"
          >
            <Filter size={14} />
            <span>Project</span>
          </button>

          <button type="button" style={filterChipStyles} disabled title="Epic filter (coming soon)">
            <Filter size={14} />
            <span>Epic</span>
          </button>

          <button type="button" style={filterChipStyles} disabled title="Tags filter (coming soon)">
            <Filter size={14} />
            <span>Tags</span>
          </button>
        </div>

        {/* Clear filters button */}
        {hasActiveFilters && onClearFilters && (
          <button
            type="button"
            style={clearButtonStyles}
            onClick={onClearFilters}
            aria-label={`Clear ${activeFilterCount} active filters`}
          >
            <X size={14} />
            <span>Clear ({activeFilterCount})</span>
          </button>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// Styles
// ============================================================================

const headerContainerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "var(--spacing-4)",
  borderBottom: "1px solid var(--border-primary)",
  background: "var(--bg-primary)",
  flexShrink: 0,
};

const titleStyles: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--font-size-xl)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
};

const filtersContainerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-4)",
};

const filterChipsStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
};

const filterChipStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--spacing-1)",
  padding: "var(--spacing-2) var(--spacing-3)",
  fontSize: "var(--font-size-sm)",
  color: "var(--text-secondary)",
  background: "var(--bg-secondary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-md)",
  cursor: "not-allowed",
  opacity: 0.6,
};

const clearButtonStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--spacing-1)",
  padding: "var(--spacing-2) var(--spacing-3)",
  fontSize: "var(--font-size-sm)",
  color: "var(--text-tertiary)",
  background: "transparent",
  border: "none",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  transition: "color var(--transition-fast)",
};

export default BoardHeader;
