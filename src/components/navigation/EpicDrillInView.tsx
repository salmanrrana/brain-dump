import { type FC, useState, useMemo, useRef, useEffect, useCallback } from "react";
import { ArrowLeft, Search, Plus, X } from "lucide-react";
import { EpicListItem } from "./EpicListItem";
import type { Epic, EpicWorktreeState } from "../../lib/hooks";

export interface ProjectWithEpics {
  id: string;
  name: string;
  path: string;
  color: string | null;
  epics: Epic[];
}

export interface EpicDrillInViewProps {
  /** Project with its epics */
  project: ProjectWithEpics;
  /** Currently selected epic ID */
  selectedEpicId: string | null;
  /** Map of epicId -> ticket count */
  epicTicketCounts?: Map<string, number> | undefined;
  /** Set of epic IDs with active AI */
  epicsWithActiveAI?: Set<string> | undefined;
  /** Map of epicId -> worktree state */
  epicWorktreeStates?: Map<string, EpicWorktreeState> | undefined;
  /** Handler to go back to projects list */
  onBack: () => void;
  /** Handler when an epic is selected */
  onSelectEpic: (epicId: string | null) => void;
  /** Handler when edit is clicked for an epic */
  onEditEpic: (epic: Epic) => void;
  /** Handler to add a new epic */
  onAddEpic: () => void;
  /** Handler to launch Ralph for an epic */
  onLaunchRalphForEpic: (epicId: string) => void;
}

/**
 * EpicDrillInView - Full epic list view with back navigation.
 *
 * Features:
 * - **Back button**: Returns to project list
 * - **Project header**: Shows project name and color
 * - **Search input**: Filters epics by title
 * - **Full epic list**: Shows all epics using EpicListItem
 * - **Add Epic button**: At the bottom
 * - **Keyboard accessible**: Escape goes back
 */
export const EpicDrillInView: FC<EpicDrillInViewProps> = ({
  project,
  selectedEpicId,
  epicTicketCounts,
  epicsWithActiveAI,
  epicWorktreeStates,
  onBack,
  onSelectEpic,
  onEditEpic,
  onAddEpic,
  onLaunchRalphForEpic,
}) => {
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  // Filter epics based on search
  const filteredEpics = useMemo(() => {
    const searchLower = search.toLowerCase();
    return project.epics.filter((epic) => epic.title.toLowerCase().includes(searchLower));
  }, [project.epics, search]);

  // Handle clear search
  const handleClearSearch = useCallback(() => {
    setSearch("");
    searchInputRef.current?.focus();
  }, []);

  // Styles
  const headerStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    padding: "var(--spacing-4)",
    borderBottom: "1px solid var(--border-primary)",
    position: "sticky",
    top: 0,
    background: "var(--bg-tertiary)",
    zIndex: 1,
  };

  const backButtonStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "32px",
    height: "32px",
    background: "transparent",
    border: "none",
    borderRadius: "var(--radius-md)",
    color: "var(--text-secondary)",
    cursor: "pointer",
    transition: "all var(--transition-fast)",
  };

  const projectInfoStyles: React.CSSProperties = {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    minWidth: 0,
  };

  const colorDotStyles: React.CSSProperties = {
    width: "12px",
    height: "12px",
    borderRadius: "var(--radius-full)",
    background: project.color || "var(--text-tertiary)",
    flexShrink: 0,
  };

  const projectNameStyles: React.CSSProperties = {
    color: "var(--text-primary)",
    fontSize: "var(--font-size-lg)",
    fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    margin: 0,
  };

  const epicCountStyles: React.CSSProperties = {
    color: "var(--text-tertiary)",
    fontSize: "var(--font-size-sm)",
    flexShrink: 0,
  };

  const searchContainerStyles: React.CSSProperties = {
    padding: "var(--spacing-3) var(--spacing-4)",
    borderBottom: "1px solid var(--border-primary)",
  };

  const searchInputWrapperStyles: React.CSSProperties = {
    position: "relative",
    display: "flex",
    alignItems: "center",
  };

  const searchIconStyles: React.CSSProperties = {
    position: "absolute",
    left: "var(--spacing-3)",
    color: "var(--text-tertiary)",
    pointerEvents: "none",
  };

  const searchInputStyles: React.CSSProperties = {
    width: "100%",
    height: "36px",
    padding: "0 var(--spacing-3)",
    paddingLeft: "var(--spacing-8)",
    paddingRight: search ? "var(--spacing-8)" : "var(--spacing-3)",
    background: "var(--bg-primary)",
    border: "1px solid var(--border-primary)",
    borderRadius: "var(--radius-md)",
    color: "var(--text-primary)",
    fontSize: "var(--font-size-sm)",
    outline: "none",
    transition: "border-color var(--transition-fast)",
  };

  const clearButtonStyles: React.CSSProperties = {
    position: "absolute",
    right: "var(--spacing-2)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "24px",
    height: "24px",
    background: "transparent",
    border: "none",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-tertiary)",
    cursor: "pointer",
  };

  const listStyles: React.CSSProperties = {
    flex: 1,
    overflowY: "auto",
    padding: "var(--spacing-2)",
  };

  const emptyStyles: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "var(--spacing-8)",
    color: "var(--text-tertiary)",
    textAlign: "center",
  };

  const footerStyles: React.CSSProperties = {
    padding: "var(--spacing-3) var(--spacing-4)",
    borderTop: "1px solid var(--border-primary)",
    position: "sticky",
    bottom: 0,
    background: "var(--bg-secondary)",
  };

  const addButtonStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--spacing-2)",
    width: "100%",
    height: "40px",
    background: "transparent",
    border: "1px dashed var(--border-secondary)",
    borderRadius: "var(--radius-md)",
    color: "var(--text-secondary)",
    fontSize: "var(--font-size-sm)",
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    cursor: "pointer",
    transition: "all var(--transition-fast)",
  };

  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
      role="region"
      aria-label={`Epics for ${project.name}`}
    >
      {/* Header with back button */}
      <header style={headerStyles}>
        <button
          type="button"
          style={backButtonStyles}
          onClick={onBack}
          aria-label="Back to projects"
          className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <div style={projectInfoStyles}>
          <span style={colorDotStyles} aria-hidden="true" />
          <h2 style={projectNameStyles}>{project.name}</h2>
        </div>
        <span style={epicCountStyles}>
          {project.epics.length} epic{project.epics.length !== 1 ? "s" : ""}
        </span>
      </header>

      {/* Search */}
      <div style={searchContainerStyles}>
        <div style={searchInputWrapperStyles}>
          <Search size={16} style={searchIconStyles} aria-hidden="true" />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search epics..."
            style={searchInputStyles}
            aria-label="Search epics"
            className="focus:border-[var(--accent-primary)] focus:shadow-[0_0_0_3px_var(--accent-muted)]"
          />
          {search && (
            <button
              type="button"
              style={clearButtonStyles}
              onClick={handleClearSearch}
              aria-label="Clear search"
              className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Epic list */}
      <div style={listStyles} role="listbox" aria-label="Epics">
        {filteredEpics.length === 0 ? (
          <div style={emptyStyles}>
            {search ? (
              <p>No epics found for "{search}"</p>
            ) : (
              <>
                <p>No epics yet</p>
                <p style={{ fontSize: "var(--font-size-xs)" }}>Add an epic to organize tickets</p>
              </>
            )}
          </div>
        ) : (
          filteredEpics.map((epic) => {
            const ticketCount = epicTicketCounts?.get(epic.id);
            const hasActiveAI = epicsWithActiveAI?.has(epic.id) ?? false;
            const worktreeState = epicWorktreeStates?.get(epic.id);
            return (
              <EpicListItem
                key={epic.id}
                epic={epic}
                isSelected={epic.id === selectedEpicId}
                hasActiveAI={hasActiveAI}
                worktreeState={worktreeState}
                onSelect={() => onSelectEpic(epic.id)}
                onEdit={() => onEditEpic(epic)}
                onLaunchRalph={() => onLaunchRalphForEpic(epic.id)}
                {...(ticketCount !== undefined && { ticketCount })}
              />
            );
          })
        )}
      </div>

      {/* Footer with Add Epic button */}
      <footer style={footerStyles}>
        <button
          type="button"
          style={addButtonStyles}
          onClick={onAddEpic}
          className="hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
        >
          <Plus size={16} aria-hidden="true" />
          Add Epic
        </button>
      </footer>
    </div>
  );
};

export default EpicDrillInView;
