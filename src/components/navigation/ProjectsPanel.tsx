import {
  type FC,
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type KeyboardEvent,
} from "react";
import { X, Search, Plus, Folder, ChevronRight, ChevronDown, Bot, Pencil, Upload } from "lucide-react";
import { useClickOutside, type Epic } from "../../lib/hooks";
import { EpicListItem } from "./EpicListItem";
import { EpicDrillInView } from "./EpicDrillInView";

export interface Project {
  id: string;
  name: string;
  path: string;
  color: string | null;
}

export interface ProjectWithEpics extends Project {
  epics: Epic[];
}

export interface ProjectWithAIActivity extends ProjectWithEpics {
  /** Whether this project has any active Ralph sessions */
  hasActiveAI: boolean;
  /** Number of active sessions in this project */
  activeSessionCount: number;
}

export interface ProjectsPanelProps {
  /** Whether the panel is open */
  isOpen: boolean;
  /** Handler to close the panel */
  onClose: () => void;
  /** List of projects to display (with epics and AI activity) */
  projects: ProjectWithAIActivity[];
  /** Currently selected project ID */
  selectedProjectId?: string | null;
  /** Currently selected epic ID */
  selectedEpicId?: string | null;
  /** Handler when a project is selected */
  onSelectProject?: (projectId: string | null) => void;
  /** Handler when an epic is selected */
  onSelectEpic?: (epicId: string | null, projectId: string) => void;
  /** Handler when "Add Project" is clicked */
  onAddProject?: () => void;
  /** Handler when a project is double-clicked (for editing) */
  onEditProject?: (project: Project) => void;
  /** Handler when "Add Epic" is clicked for a project */
  onAddEpic?: (projectId: string) => void;
  /** Handler when an epic is edited */
  onEditEpic?: (projectId: string, epic: Epic) => void;
  /** Handler when Ralph is launched for an epic */
  onLaunchRalphForEpic?: (epicId: string) => void;
  /** Handler when "Import" is clicked */
  onImport?: () => void;
  /** Map of epicId -> ticket count */
  epicTicketCounts?: Map<string, number>;
  /** Set of epic IDs with active AI */
  epicsWithActiveAI?: Set<string>;
  /** Loading state */
  loading?: boolean;
}

// CSS keyframes for slide animation and glow
const PANEL_KEYFRAMES = `
@keyframes projectspanel-slide-in {
  from { transform: translateX(-100%); }
  to { transform: translateX(0); }
}
@keyframes projectspanel-slide-out {
  from { transform: translateX(0); }
  to { transform: translateX(-100%); }
}
@keyframes projectspanel-glow-pulse {
  0%, 100% { box-shadow: 0 0 8px var(--accent-ai), inset 0 0 1px var(--accent-ai); }
  50% { box-shadow: 0 0 16px var(--accent-ai), inset 0 0 2px var(--accent-ai); }
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

/** Maximum number of epics to show in expanded inline view */
const MAX_INLINE_EPICS = 5;

type PanelView = "projects" | "epics";

/**
 * ProjectsPanel - Slide-out panel for project selection and management.
 *
 * Features:
 * - **320px width panel**: Slides out from left, covering sidebar
 * - **z-index 100**: Positioned above sidebar (z-sticky: 20)
 * - **Header**: "Projects" title with close button
 * - **Search input**: Filters projects by name
 * - **Expandable projects**: Click chevron to show recent epics inline
 * - **Drill-in view**: "View all epics" navigates to full epic list
 * - **AI glow indicator**: Projects with active Ralph show pulsing glow
 * - **Add Project button**: At the bottom of the panel
 * - **Keyboard accessible**: Escape to close, Tab navigation
 */
export const ProjectsPanel: FC<ProjectsPanelProps> = ({
  isOpen,
  onClose,
  projects,
  selectedProjectId,
  selectedEpicId,
  onSelectProject,
  onSelectEpic,
  onAddProject,
  onEditProject,
  onAddEpic,
  onEditEpic,
  onLaunchRalphForEpic,
  onImport,
  epicTicketCounts,
  epicsWithActiveAI,
  loading = false,
}) => {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<PanelView>("projects");
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [drillInProject, setDrillInProject] = useState<ProjectWithAIActivity | null>(null);
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Inject CSS keyframes once
  useEffect(() => {
    injectKeyframes();
  }, []);

  // Handler for closing the panel - resets all internal state
  const handleClose = useCallback(() => {
    setSearch("");
    setView("projects");
    setExpandedProjectId(null);
    setDrillInProject(null);
    onClose();
  }, [onClose]);

  // Focus search input when panel opens (only in projects view)
  useEffect(() => {
    if (!isOpen || view !== "projects") return;
    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen, view]);

  // Handle click outside to close
  useClickOutside(panelRef, handleClose, isOpen);

  // Handle escape key to close or go back
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (view === "epics") {
          setView("projects");
          setDrillInProject(null);
        } else {
          handleClose();
        }
      }
    },
    [handleClose, view]
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

  // Handle expand/collapse toggle
  const handleToggleExpand = useCallback((e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    setExpandedProjectId((prev) => (prev === projectId ? null : projectId));
  }, []);

  // Handle drill-in to full epic view
  const handleDrillIn = useCallback((e: React.MouseEvent, project: ProjectWithAIActivity) => {
    e.stopPropagation();
    setDrillInProject(project);
    setView("epics");
  }, []);

  // Handle back from drill-in view
  const handleBackFromDrillIn = useCallback(() => {
    setView("projects");
    setDrillInProject(null);
  }, []);

  // Handle epic selection from panel
  const handleEpicSelect = useCallback(
    (epicId: string | null, projectId: string) => {
      onSelectEpic?.(epicId, projectId);
    },
    [onSelectEpic]
  );

  // Handle epic edit
  const handleEditEpic = useCallback(
    (projectId: string, epic: Epic) => {
      onEditEpic?.(projectId, epic);
    },
    [onEditEpic]
  );

  // Handle Ralph launch for epic
  const handleLaunchRalph = useCallback(
    (epicId: string) => {
      onLaunchRalphForEpic?.(epicId);
    },
    [onLaunchRalphForEpic]
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

  const projectItemStyles = (isSelected: boolean, hasActiveAI: boolean): React.CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    width: "100%",
    background: isSelected ? "var(--accent-muted)" : "transparent",
    borderRadius: "var(--radius-md)",
    transition: "all var(--transition-fast)",
    // AI glow animation
    ...(hasActiveAI && {
      animation: "projectspanel-glow-pulse 2s ease-in-out infinite",
    }),
  });

  const projectRowStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    width: "100%",
    padding: "var(--spacing-3)",
    background: "transparent",
    border: "none",
    borderRadius: "var(--radius-md)",
    cursor: "pointer",
    textAlign: "left",
  };

  const chevronButtonStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "20px",
    height: "20px",
    background: "transparent",
    border: "none",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-tertiary)",
    cursor: "pointer",
    transition: "all var(--transition-fast)",
    flexShrink: 0,
  };

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

  const aiIndicatorStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    color: "var(--accent-ai)",
    flexShrink: 0,
  };

  const expandedEpicsStyles: React.CSSProperties = {
    paddingBottom: "var(--spacing-2)",
  };

  const viewAllLinkStyles: React.CSSProperties = {
    display: "block",
    padding: "var(--spacing-2) var(--spacing-3)",
    paddingLeft: "var(--spacing-6)",
    background: "transparent",
    border: "none",
    color: "var(--accent-primary)",
    fontSize: "var(--font-size-xs)",
    cursor: "pointer",
    textAlign: "left",
    transition: "color var(--transition-fast)",
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

  // Render drill-in view if active
  if (view === "epics" && drillInProject) {
    return (
      <>
        <div style={overlayStyles} aria-hidden="true" />
        <div
          ref={panelRef}
          style={panelStyles}
          role="dialog"
          aria-modal="true"
          aria-label={`Epics for ${drillInProject.name}`}
          onKeyDown={handleKeyDown}
        >
          <EpicDrillInView
            project={drillInProject}
            selectedEpicId={selectedEpicId ?? null}
            epicTicketCounts={epicTicketCounts}
            epicsWithActiveAI={epicsWithActiveAI}
            onBack={handleBackFromDrillIn}
            onSelectEpic={(epicId) => handleEpicSelect(epicId, drillInProject.id)}
            onEditEpic={(epic) => handleEditEpic(drillInProject.id, epic)}
            onAddEpic={() => onAddEpic?.(drillInProject.id)}
            onLaunchRalphForEpic={handleLaunchRalph}
          />
        </div>
      </>
    );
  }

  // Render main projects view
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
            onClick={handleClose}
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
              const isExpanded = expandedProjectId === project.id;
              const hasEpics = project.epics.length > 0;
              // Get the 5 most recent epics (sorted by createdAt desc)
              const recentEpics = [...project.epics]
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, MAX_INLINE_EPICS);
              const hasMoreEpics = project.epics.length > MAX_INLINE_EPICS;

              return (
                <div
                  key={project.id}
                  style={projectItemStyles(isSelected, project.hasActiveAI)}
                  data-testid={`project-panel-item-${project.id}`}
                >
                  {/* Project row */}
                  <div
                    style={projectRowStyles}
                    onClick={() => handleSelectProject(project.id)}
                    onDoubleClick={() => handleDoubleClick(project)}
                    onMouseEnter={() => setHoveredProjectId(project.id)}
                    onMouseLeave={() => setHoveredProjectId(null)}
                    role="option"
                    aria-selected={isSelected}
                    aria-expanded={hasEpics ? isExpanded : undefined}
                    title={project.path}
                    className="hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-primary)]"
                    tabIndex={0}
                  >
                    {/* Expand/collapse chevron */}
                    {hasEpics ? (
                      <button
                        type="button"
                        style={chevronButtonStyles}
                        onClick={(e) => handleToggleExpand(e, project.id)}
                        aria-label={isExpanded ? "Collapse epics" : "Expand epics"}
                        className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                      >
                        {isExpanded ? (
                          <ChevronDown size={14} aria-hidden="true" />
                        ) : (
                          <ChevronRight size={14} aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      <span style={{ width: "20px" }} aria-hidden="true" />
                    )}

                    {/* Color dot */}
                    <span style={colorDotStyles(project.color)} aria-hidden="true" />

                    {/* Project info */}
                    <div style={projectInfoStyles}>
                      <p style={projectNameStyles}>{project.name}</p>
                      <p style={projectPathStyles}>{project.path}</p>
                    </div>

                    {/* AI indicator */}
                    {project.hasActiveAI && (
                      <span
                        style={aiIndicatorStyles}
                        role="status"
                        aria-label={`AI active (${project.activeSessionCount} session${project.activeSessionCount !== 1 ? "s" : ""})`}
                        title={`${project.activeSessionCount} active Ralph session${project.activeSessionCount !== 1 ? "s" : ""}`}
                      >
                        <Bot size={16} aria-hidden="true" />
                      </span>
                    )}

                    {/* Edit (pencil) button — visible on hover */}
                    {onEditProject && (
                      <button
                        type="button"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "28px",
                          height: "28px",
                          background: "var(--bg-secondary)",
                          border: "1px solid var(--border-primary)",
                          borderRadius: "var(--radius-sm)",
                          color: "var(--text-secondary)",
                          cursor: "pointer",
                          transition: "opacity var(--transition-fast)",
                          opacity: hoveredProjectId === project.id ? 1 : 0,
                          pointerEvents: hoveredProjectId === project.id ? "auto" : "none",
                          flexShrink: 0,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditProject(project);
                        }}
                        aria-label={`Edit ${project.name}`}
                        data-testid={`edit-project-${project.id}`}
                        className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] hover:border-[var(--accent-primary)]"
                      >
                        <Pencil size={14} aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  {/* Expanded epics list */}
                  {isExpanded && hasEpics && (
                    <div style={expandedEpicsStyles}>
                      {recentEpics.map((epic) => {
                        const ticketCount = epicTicketCounts?.get(epic.id);
                        const hasAI = epicsWithActiveAI?.has(epic.id) ?? false;
                        return (
                          <EpicListItem
                            key={epic.id}
                            epic={epic}
                            isSelected={epic.id === selectedEpicId}
                            hasActiveAI={hasAI}
                            onSelect={() => handleEpicSelect(epic.id, project.id)}
                            onEdit={() => handleEditEpic(project.id, epic)}
                            onLaunchRalph={() => handleLaunchRalph(epic.id)}
                            {...(ticketCount !== undefined && { ticketCount })}
                          />
                        );
                      })}

                      {/* "View all epics" link */}
                      {hasMoreEpics && (
                        <button
                          type="button"
                          style={viewAllLinkStyles}
                          onClick={(e) => handleDrillIn(e, project)}
                          className="hover:text-[var(--accent-secondary)]"
                        >
                          View all {project.epics.length} epics →
                        </button>
                      )}

                      {/* Add epic shortcut */}
                      <button
                        type="button"
                        style={{
                          ...viewAllLinkStyles,
                          color: "var(--text-tertiary)",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddEpic?.(project.id);
                        }}
                        className="hover:text-[var(--text-secondary)]"
                      >
                        + Add Epic
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer with Add Project and Import buttons */}
        <footer style={footerStyles}>
          <div style={{ display: "flex", gap: "var(--spacing-2)" }}>
            <button
              type="button"
              style={{ ...addButtonStyles, flex: 1 }}
              onClick={onAddProject}
              className="hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            >
              <Plus size={16} aria-hidden="true" />
              Add Project
            </button>
            <button
              type="button"
              style={{ ...addButtonStyles, flex: 0 }}
              onClick={onImport}
              className="hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
              title="Import .braindump archive"
            >
              <Upload size={16} aria-hidden="true" />
            </button>
          </div>
        </footer>
      </div>
    </>
  );
};

export default ProjectsPanel;
