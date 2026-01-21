import {
  type FC,
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type KeyboardEvent,
} from "react";
import { X, Search, Plus, Folder } from "lucide-react";
import { useClickOutside } from "../../lib/hooks";

export interface Project {
  id: string;
  name: string;
  path: string;
  color: string | null;
}

export interface ProjectsPanelProps {
  /** Whether the panel is open */
  isOpen: boolean;
  /** Handler to close the panel */
  onClose: () => void;
  /** List of projects to display */
  projects: Project[];
  /** Currently selected project ID */
  selectedProjectId?: string | null;
  /** Handler when a project is selected */
  onSelectProject?: (projectId: string | null) => void;
  /** Handler when "Add Project" is clicked */
  onAddProject?: () => void;
  /** Handler when a project is double-clicked (for editing) */
  onEditProject?: (project: Project) => void;
  /** Loading state */
  loading?: boolean;
}

// CSS keyframes for slide animation
const PANEL_KEYFRAMES = `
@keyframes projectspanel-slide-in {
  from { transform: translateX(-100%); }
  to { transform: translateX(0); }
}
@keyframes projectspanel-slide-out {
  from { transform: translateX(0); }
  to { transform: translateX(-100%); }
}
`;

let keyframesInjected = false;
function injectKeyframes(): void {
  if (typeof document === "undefined" || keyframesInjected) return;
  try {
    const style = document.createElement("style");
    style.textContent = PANEL_KEYFRAMES;
    document.head.appendChild(style);
    keyframesInjected = true;
  } catch (error) {
    // Animation unavailable but component still functional
    if (process.env.NODE_ENV !== "production") {
      console.warn("[ProjectsPanel] Failed to inject keyframes:", error);
    }
  }
}

/**
 * ProjectsPanel - Slide-out panel for project selection and management.
 *
 * Features:
 * - **320px width panel**: Slides out from left, covering sidebar
 * - **z-index 100**: Positioned above sidebar (z-sticky: 20)
 * - **Header**: "Projects" title with close button
 * - **Search input**: Filters projects by name
 * - **Project list**: Shows all projects, click to select
 * - **Add Project button**: At the bottom of the panel
 * - **Keyboard accessible**: Escape to close, Tab navigation
 */
export const ProjectsPanel: FC<ProjectsPanelProps> = ({
  isOpen,
  onClose,
  projects,
  selectedProjectId,
  onSelectProject,
  onAddProject,
  onEditProject,
  loading = false,
}) => {
  const [search, setSearch] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Inject CSS keyframes once
  useEffect(() => {
    injectKeyframes();
  }, []);

  // Focus search input when panel opens
  useEffect(() => {
    if (!isOpen) return;
    // Small delay to allow animation to start
    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Handle click outside to close
  useClickOutside(panelRef, onClose, isOpen);

  // Handle escape key to close
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [onClose]
  );

  // Filter projects based on search (memoized to avoid recalculation on every render)
  const filteredProjects = useMemo(() => {
    const searchLower = search.toLowerCase();
    return projects.filter((project) => project.name.toLowerCase().includes(searchLower));
  }, [projects, search]);

  // Handle project selection
  const handleSelectProject = useCallback(
    (projectId: string) => {
      // Toggle selection - clicking same project deselects
      if (projectId === selectedProjectId) {
        onSelectProject?.(null);
      } else {
        onSelectProject?.(projectId);
      }
    },
    [selectedProjectId, onSelectProject]
  );

  // Handle project double-click for editing
  const handleDoubleClick = useCallback(
    (project: Project) => {
      onEditProject?.(project);
    },
    [onEditProject]
  );

  // Clear search
  const handleClearSearch = useCallback(() => {
    setSearch("");
    searchInputRef.current?.focus();
  }, []);

  if (!isOpen) return null;

  // Styles
  const overlayStyles: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 99,
    background: "rgba(0, 0, 0, 0.3)",
  };

  const panelStyles: React.CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    width: "320px",
    height: "100vh",
    background: "var(--bg-secondary)",
    borderRight: "1px solid var(--border-primary)",
    zIndex: 100,
    display: "flex",
    flexDirection: "column",
    animation: "projectspanel-slide-in 200ms ease-out",
    boxShadow: "var(--shadow-xl)",
  };

  const headerStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "var(--spacing-4)",
    borderBottom: "1px solid var(--border-primary)",
    position: "sticky",
    top: 0,
    background: "var(--bg-tertiary)",
    zIndex: 1,
  };

  const titleStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    color: "var(--text-primary)",
    fontSize: "var(--font-size-lg)",
    fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
    margin: 0,
  };

  const closeButtonStyles: React.CSSProperties = {
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

  const projectItemStyles = (isSelected: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-3)",
    width: "100%",
    padding: "var(--spacing-3)",
    background: isSelected ? "var(--accent-muted)" : "transparent",
    border: "none",
    borderRadius: "var(--radius-md)",
    cursor: "pointer",
    transition: "background var(--transition-fast)",
    textAlign: "left",
  });

  const colorDotStyles = (color: string | null): React.CSSProperties => ({
    width: "12px",
    height: "12px",
    borderRadius: "var(--radius-full)",
    background: color || "var(--text-tertiary)",
    flexShrink: 0,
  });

  const projectInfoStyles: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
  };

  const projectNameStyles: React.CSSProperties = {
    color: "var(--text-primary)",
    fontSize: "var(--font-size-sm)",
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    margin: 0,
  };

  const projectPathStyles: React.CSSProperties = {
    color: "var(--text-tertiary)",
    fontSize: "var(--font-size-xs)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    margin: 0,
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
    <>
      {/* Backdrop overlay */}
      <div style={overlayStyles} aria-hidden="true" />

      {/* Panel */}
      <div
        ref={panelRef}
        style={panelStyles}
        role="dialog"
        aria-modal="true"
        aria-label="Projects panel"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <header style={headerStyles}>
          <h2 style={titleStyles}>
            <Folder size={20} aria-hidden="true" />
            Projects
          </h2>
          <button
            type="button"
            style={closeButtonStyles}
            onClick={onClose}
            aria-label="Close projects panel"
            className="hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
          >
            <X size={18} aria-hidden="true" />
          </button>
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
              placeholder="Search projects..."
              style={searchInputStyles}
              aria-label="Search projects"
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

        {/* Project list */}
        <div style={listStyles} role="listbox" aria-label="Projects">
          {loading ? (
            <div style={emptyStyles}>
              <p>Loading projects...</p>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div style={emptyStyles}>
              {search ? (
                <p>No projects found for "{search}"</p>
              ) : (
                <>
                  <Folder size={40} style={{ opacity: 0.5, marginBottom: "var(--spacing-2)" }} />
                  <p>No projects yet</p>
                  <p style={{ fontSize: "var(--font-size-xs)" }}>Add a project to get started</p>
                </>
              )}
            </div>
          ) : (
            filteredProjects.map((project) => {
              const isSelected = project.id === selectedProjectId;
              return (
                <button
                  key={project.id}
                  type="button"
                  style={projectItemStyles(isSelected)}
                  onClick={() => handleSelectProject(project.id)}
                  onDoubleClick={() => handleDoubleClick(project)}
                  role="option"
                  aria-selected={isSelected}
                  title={project.path}
                  className="hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-primary)]"
                >
                  <span style={colorDotStyles(project.color)} aria-hidden="true" />
                  <div style={projectInfoStyles}>
                    <p style={projectNameStyles}>{project.name}</p>
                    <p style={projectPathStyles}>{project.path}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer with Add Project button */}
        <footer style={footerStyles}>
          <button
            type="button"
            style={addButtonStyles}
            onClick={onAddProject}
            className="hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
          >
            <Plus size={16} aria-hidden="true" />
            Add Project
          </button>
        </footer>
      </div>
    </>
  );
};

export default ProjectsPanel;
