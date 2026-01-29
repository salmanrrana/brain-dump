import { type FC, useState, useRef, useCallback, useMemo } from "react";
import { ChevronDown, X, Check } from "lucide-react";
import { useClickOutside, useProjects, useTags, useFiltersWithUrl } from "../../lib/hooks";

export interface BoardHeaderProps {
  /** Currently selected project ID */
  projectId?: string | null;
  /** Currently selected epic ID */
  epicId?: string | null;
  /** Currently selected tags */
  tags?: string[];
  /** Handler to clear all filters */
  onClearFilters?: () => void;
}

/**
 * BoardHeader - Header component with filter controls for the kanban board.
 *
 * Features:
 * - Project dropdown filter
 * - Epic dropdown filter (shows epics for selected project)
 * - Tag multi-select filter
 * - Clear all filters button with active count
 * - Filters sync with URL params via useFiltersWithUrl hook
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
  // Get filter setters from URL-synced hook
  const { setProjectId, setEpicId, toggleTag, hasActiveFilters, activeFilterCount } =
    useFiltersWithUrl();

  // Fetch data for dropdowns
  const { projects } = useProjects();
  const { tags: availableTags } = useTags();

  // Dropdown open states
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [epicDropdownOpen, setEpicDropdownOpen] = useState(false);
  const [tagsDropdownOpen, setTagsDropdownOpen] = useState(false);

  // Refs for click outside detection
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const epicDropdownRef = useRef<HTMLDivElement>(null);
  const tagsDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside
  useClickOutside(projectDropdownRef, () => setProjectDropdownOpen(false), projectDropdownOpen);
  useClickOutside(epicDropdownRef, () => setEpicDropdownOpen(false), epicDropdownOpen);
  useClickOutside(tagsDropdownRef, () => setTagsDropdownOpen(false), tagsDropdownOpen);

  // Get selected project and its epics
  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId]
  );

  // Epics for the currently selected project
  const availableEpics = useMemo(() => selectedProject?.epics ?? [], [selectedProject]);

  // Get selected epic name
  const selectedEpic = useMemo(
    () => availableEpics.find((e) => e.id === epicId) ?? null,
    [availableEpics, epicId]
  );

  // Handlers
  const handleProjectSelect = useCallback(
    (id: string | null) => {
      setProjectId(id);
      setProjectDropdownOpen(false);
    },
    [setProjectId]
  );

  const handleEpicSelect = useCallback(
    (id: string | null) => {
      setEpicId(id);
      setEpicDropdownOpen(false);
    },
    [setEpicId]
  );

  return (
    <div style={headerContainerStyles} data-testid="board-header">
      {/* Title */}
      <h1 style={titleStyles}>Board</h1>

      {/* Filter controls */}
      <div style={filtersContainerStyles}>
        <div style={filterChipsStyles}>
          {/* Project Dropdown */}
          <div ref={projectDropdownRef} style={dropdownContainerStyles}>
            <button
              type="button"
              style={{
                ...filterChipStyles,
                ...(projectId ? activeFilterChipStyles : {}),
              }}
              onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
              aria-expanded={projectDropdownOpen}
              aria-haspopup="listbox"
            >
              <span>{selectedProject?.name ?? "Project"}</span>
              <ChevronDown
                size={14}
                style={{
                  transition: "transform var(--transition-fast)",
                  transform: projectDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                }}
              />
            </button>
            {projectDropdownOpen && (
              <div style={dropdownMenuStyles} role="listbox">
                <button
                  type="button"
                  style={{
                    ...dropdownItemStyles,
                    ...(!projectId ? selectedDropdownItemStyles : {}),
                  }}
                  onClick={() => handleProjectSelect(null)}
                  role="option"
                  aria-selected={!projectId}
                >
                  <span>All Projects</span>
                  {!projectId && <Check size={14} />}
                </button>
                {projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    style={{
                      ...dropdownItemStyles,
                      ...(projectId === project.id ? selectedDropdownItemStyles : {}),
                    }}
                    onClick={() => handleProjectSelect(project.id)}
                    role="option"
                    aria-selected={projectId === project.id}
                  >
                    <span style={dropdownItemContentStyles}>
                      {project.color && (
                        <span style={{ ...colorDotStyles, backgroundColor: project.color }} />
                      )}
                      {project.name}
                    </span>
                    {projectId === project.id && <Check size={14} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Epic Dropdown */}
          <div ref={epicDropdownRef} style={dropdownContainerStyles}>
            <button
              type="button"
              style={{
                ...filterChipStyles,
                ...(epicId ? activeFilterChipStyles : {}),
                ...(availableEpics.length === 0 ? disabledFilterChipStyles : {}),
              }}
              onClick={() => availableEpics.length > 0 && setEpicDropdownOpen(!epicDropdownOpen)}
              aria-expanded={epicDropdownOpen}
              aria-haspopup="listbox"
              disabled={availableEpics.length === 0}
              title={availableEpics.length === 0 ? "Select a project first" : undefined}
            >
              <span>{selectedEpic?.title ?? "Epic"}</span>
              <ChevronDown
                size={14}
                style={{
                  transition: "transform var(--transition-fast)",
                  transform: epicDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                }}
              />
            </button>
            {epicDropdownOpen && (
              <div style={dropdownMenuStyles} role="listbox">
                <button
                  type="button"
                  style={{
                    ...dropdownItemStyles,
                    ...(!epicId ? selectedDropdownItemStyles : {}),
                  }}
                  onClick={() => handleEpicSelect(null)}
                  role="option"
                  aria-selected={!epicId}
                >
                  <span>All Epics</span>
                  {!epicId && <Check size={14} />}
                </button>
                {availableEpics.map((epic) => (
                  <button
                    key={epic.id}
                    type="button"
                    style={{
                      ...dropdownItemStyles,
                      ...(epicId === epic.id ? selectedDropdownItemStyles : {}),
                    }}
                    onClick={() => handleEpicSelect(epic.id)}
                    role="option"
                    aria-selected={epicId === epic.id}
                  >
                    <span style={dropdownItemContentStyles}>
                      {epic.color && (
                        <span style={{ ...colorDotStyles, backgroundColor: epic.color }} />
                      )}
                      {epic.title}
                    </span>
                    {epicId === epic.id && <Check size={14} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tags Multi-select Dropdown */}
          <div ref={tagsDropdownRef} style={dropdownContainerStyles}>
            <button
              type="button"
              style={{
                ...filterChipStyles,
                ...(tags.length > 0 ? activeFilterChipStyles : {}),
              }}
              onClick={() => setTagsDropdownOpen(!tagsDropdownOpen)}
              aria-expanded={tagsDropdownOpen}
              aria-haspopup="listbox"
            >
              <span>{tags.length > 0 ? `Tags (${tags.length})` : "Tags"}</span>
              <ChevronDown
                size={14}
                style={{
                  transition: "transform var(--transition-fast)",
                  transform: tagsDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                }}
              />
            </button>
            {tagsDropdownOpen && (
              <div style={dropdownMenuStyles} role="listbox" aria-multiselectable="true">
                {availableTags.length === 0 ? (
                  <div style={emptyDropdownStyles}>No tags available</div>
                ) : (
                  availableTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      style={{
                        ...dropdownItemStyles,
                        ...(tags.includes(tag) ? selectedDropdownItemStyles : {}),
                      }}
                      onClick={() => toggleTag(tag)}
                      role="option"
                      aria-selected={tags.includes(tag)}
                    >
                      <span>{tag}</span>
                      {tags.includes(tag) && <Check size={14} />}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
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

const dropdownContainerStyles: React.CSSProperties = {
  position: "relative",
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
  cursor: "pointer",
  transition: "all var(--transition-fast)",
};

const activeFilterChipStyles: React.CSSProperties = {
  color: "var(--accent-primary)",
  borderColor: "var(--accent-primary)",
  background: "color-mix(in srgb, var(--accent-primary) 10%, transparent)",
};

const disabledFilterChipStyles: React.CSSProperties = {
  cursor: "not-allowed",
  opacity: 0.6,
};

const dropdownMenuStyles: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + var(--spacing-1))",
  left: 0,
  minWidth: 180,
  maxHeight: 300,
  overflow: "auto",
  background: "var(--bg-secondary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-md)",
  boxShadow: "var(--shadow-lg)",
  zIndex: 100,
};

const dropdownItemStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  padding: "var(--spacing-2) var(--spacing-3)",
  fontSize: "var(--font-size-sm)",
  color: "var(--text-primary)",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
  transition: "background var(--transition-fast)",
};

const selectedDropdownItemStyles: React.CSSProperties = {
  background: "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
  color: "var(--accent-primary)",
};

const emptyDropdownStyles: React.CSSProperties = {
  padding: "var(--spacing-3)",
  fontSize: "var(--font-size-sm)",
  color: "var(--text-tertiary)",
  textAlign: "center",
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

const colorDotStyles: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
};

const dropdownItemContentStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
};

export default BoardHeader;
