import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus, AlertCircle, Search, X } from "lucide-react";
import type { CSSProperties } from "react";
import { useProjectsWithAIActivity, useUpdateProjectPosition } from "../lib/hooks";
import { useAppModalActions } from "../components/AppLayoutContext";
import ProjectListItem from "../components/projects/ProjectListItem";
import { createBrowserLogger } from "../lib/browser-logger";
export const Route = createFileRoute("/")({
  component: Home,
});

const logger = createBrowserLogger("routes:projects-home");

const POINTER_SENSOR_OPTIONS = {
  activationConstraint: {
    distance: 8,
  },
} as const;

const KEYBOARD_SENSOR_OPTIONS = {
  coordinateGetter: sortableKeyboardCoordinates,
} as const;

const projectReorderAnnouncements: Announcements = {
  onDragStart() {
    return "Picked up project. Press space to drop, or escape to cancel.";
  },
  onDragOver({ over }) {
    if (over) {
      return "Project is over another project in the workspace list.";
    }
    return "Project is no longer over the workspace list.";
  },
  onDragEnd({ over }) {
    if (over) {
      return "Project dropped. The new order is being saved.";
    }
    return "Project was dropped outside of the workspace list. No changes made.";
  },
  onDragCancel() {
    return "Drag cancelled. Project returned to its original position.";
  },
};

function Home() {
  const navigate = useNavigate();
  const { projects, loading, error, refetch } = useProjectsWithAIActivity();
  const updateProjectPosition = useUpdateProjectPosition();
  const { openProjectModal } = useAppModalActions();
  const [searchQuery, setSearchQuery] = useState("");
  const isSearchActive = searchQuery.trim().length > 0;

  const sensors = useSensors(
    useSensor(PointerSensor, POINTER_SENSOR_OPTIONS),
    useSensor(KeyboardSensor, KEYBOARD_SENSOR_OPTIONS)
  );

  const filteredProjects = useMemo(
    () => projects.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [projects, searchQuery]
  );

  const projectIds = useMemo(
    () => filteredProjects.map((project) => project.id),
    [filteredProjects]
  );

  const handleDragEnd = useCallback(
    async ({ active, over }: DragEndEvent) => {
      if (!over || isSearchActive || active.id === over.id) {
        return;
      }

      const orderedProjects = [...projects].sort((a, b) => a.position - b.position);
      const activeProject = orderedProjects.find((project) => project.id === active.id);
      const overIndex = orderedProjects.findIndex((project) => project.id === over.id);

      if (!activeProject || overIndex === -1) {
        return;
      }

      const projectsWithoutActive = orderedProjects.filter((project) => project.id !== active.id);
      let targetPosition: number;

      if (overIndex <= 0) {
        targetPosition = (projectsWithoutActive[0]?.position ?? 2) / 2;
      } else if (overIndex >= projectsWithoutActive.length) {
        targetPosition =
          (projectsWithoutActive[projectsWithoutActive.length - 1]?.position ?? 0) + 1;
      } else {
        const previousProject = projectsWithoutActive[overIndex - 1];
        const nextProject = projectsWithoutActive[overIndex];
        targetPosition = ((previousProject?.position ?? 0) + (nextProject?.position ?? 0)) / 2;
      }

      try {
        await updateProjectPosition.mutateAsync({ id: activeProject.id, position: targetPosition });
      } catch (error) {
        logger.error(
          `Failed to reorder project: id="${activeProject.id}", position=${targetPosition}`,
          error instanceof Error ? error : new Error(String(error))
        );
        refetch();
      }
    },
    [isSearchActive, projects, refetch, updateProjectPosition]
  );

  const handleSelectProject = useCallback(
    (projectId: string) => {
      navigate({ to: "/projects/$projectId", params: { projectId } });
    },
    [navigate]
  );

  const handleEditProject = useCallback(
    (project: (typeof projects)[0]) => {
      openProjectModal(project);
    },
    [openProjectModal]
  );

  if (loading) {
    return <div style={pageContainerStyles} />;
  }

  if (error) {
    return (
      <div style={pageContainerStyles}>
        <div style={centeredContainerStyles}>
          <div style={errorContainerStyles}>
            <AlertCircle size={24} style={{ color: "var(--text-destructive)" }} />
            <p style={errorTitleStyles}>Failed to load projects</p>
            <p style={errorDescriptionStyles}>{error}</p>
            <button
              type="button"
              style={accentButtonStyles}
              onClick={() => refetch()}
              className="hover:bg-[var(--accent-primary)] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageContainerStyles} className="route-fade-in">
      <header style={headerStyles}>
        <div>
          <p style={labelStyles}>workspace</p>
          <h1 style={titleStyles}>Projects</h1>
        </div>
        <button
          type="button"
          style={accentButtonStyles}
          onClick={() => openProjectModal()}
          className="hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
        >
          <Plus size={16} aria-hidden="true" />
          New Project
        </button>
      </header>

      {projects.length === 0 ? (
        <div style={emptyStateStyles}>
          <div style={emptyContentStyles}>
            <p style={emptyTitleStyles}>No projects yet</p>
            <p style={emptyDescriptionStyles}>
              Create your first project to get started with Brain Dump.
            </p>
            <button
              type="button"
              style={accentButtonStyles}
              onClick={() => openProjectModal()}
              className="hover:bg-[var(--accent-primary)] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            >
              Add Project
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={searchContainerStyles}>
            <div style={searchWrapperStyles}>
              <Search size={16} style={{ color: "var(--text-tertiary)" }} aria-hidden="true" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={searchInputStyles}
                aria-label="Search projects by name"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  style={clearButtonStyles}
                  aria-label="Clear search"
                  className="hover:text-[var(--text-primary)]"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>
            {isSearchActive && (
              <p style={reorderPausedStyles}>Reordering is paused while search is active.</p>
            )}
          </div>

          <div style={listContainerStyles}>
            {filteredProjects.length === 0 ? (
              <div style={noResultsContainerStyles}>
                <p style={noResultsTitleStyles}>No projects match "{searchQuery}"</p>
                <p style={noResultsDescriptionStyles}>
                  Try adjusting your search or create a new project.
                </p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
                accessibility={{ announcements: projectReorderAnnouncements }}
              >
                <SortableContext items={projectIds} strategy={verticalListSortingStrategy}>
                  <div style={projectListStyles}>
                    {filteredProjects.map((project) => (
                      <ProjectListItem
                        key={project.id}
                        project={project}
                        ticketCount={project.ticketCount}
                        epicCount={project.epics.length}
                        onClick={() => handleSelectProject(project.id)}
                        onSettings={() => handleEditProject(project)}
                        reorderEnabled={!isSearchActive}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const pageContainerStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  background: "var(--bg-primary)",
};

const centeredContainerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
};

const headerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  padding: "var(--spacing-8) var(--spacing-8) var(--spacing-4)",
};

const labelStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  fontFamily: "var(--font-mono)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  color: "var(--text-muted)",
  letterSpacing: "var(--tracking-wider)",
  textTransform: "uppercase",
  margin: 0,
  marginBottom: "var(--spacing-1)",
};

const titleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-3xl)",
  fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
  letterSpacing: "var(--tracking-tighter)",
  color: "var(--text-primary)",
  margin: 0,
  lineHeight: "var(--line-height-tight)",
};

const accentButtonStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-2) var(--spacing-4)",
  background: "var(--gradient-accent)",
  color: "var(--text-on-accent)",
  border: "none",
  borderRadius: "var(--radius-lg)",
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  fontFamily: "var(--font-sans)",
  cursor: "pointer",
  transition: "all var(--transition-fast)",
  boxShadow: "var(--shadow-sm)",
};

const searchContainerStyles: CSSProperties = {
  padding: "0 var(--spacing-8) var(--spacing-4)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--spacing-2)",
};

const searchWrapperStyles: CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  maxWidth: "600px",
  width: "100%",
  gap: "var(--spacing-2)",
};

const searchInputStyles: React.CSSProperties = {
  flex: 1,
  padding: "var(--spacing-2) var(--spacing-3)",
  background: "var(--bg-card)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-lg)",
  fontSize: "var(--font-size-sm)",
  fontFamily: "var(--font-sans)",
  color: "var(--text-primary)",
  outline: "none",
  transition: "all var(--transition-fast)",
};

const clearButtonStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "24px",
  height: "24px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  color: "var(--text-tertiary)",
  transition: "color var(--transition-fast)",
};

const reorderPausedStyles: CSSProperties = {
  margin: 0,
  fontSize: "var(--font-size-xs)",
  color: "var(--text-muted)",
};

const listContainerStyles: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "var(--spacing-4) var(--spacing-8)",
};

const projectListStyles: CSSProperties = {
  width: "100%",
  maxWidth: "900px",
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-2)",
};

const noResultsContainerStyles: CSSProperties = {
  textAlign: "center",
  maxWidth: "400px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "var(--spacing-3)",
};

const noResultsTitleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-lg)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  margin: 0,
};

const noResultsDescriptionStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-secondary)",
  margin: 0,
};

const emptyStateStyles: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--spacing-8)",
};

const emptyContentStyles: React.CSSProperties = {
  textAlign: "center",
  maxWidth: "440px",
};

const emptyTitleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-2xl)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  letterSpacing: "var(--tracking-tight)",
  color: "var(--text-primary)",
  margin: 0,
  marginBottom: "var(--spacing-2)",
};

const emptyDescriptionStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-secondary)",
  margin: 0,
  marginBottom: "var(--spacing-6)",
};

const errorContainerStyles: React.CSSProperties = {
  textAlign: "center",
  maxWidth: "400px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "var(--spacing-3)",
};

const errorTitleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-lg)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-destructive)",
  margin: 0,
};

const errorDescriptionStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-secondary)",
  margin: 0,
  marginBottom: "var(--spacing-2)",
};
