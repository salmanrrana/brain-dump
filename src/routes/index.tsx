import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { Plus } from "lucide-react";
import { useProjectsWithAIActivity, useModal, type ProjectBase } from "../lib/hooks";
import ProjectCard from "../components/projects/ProjectCard";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const { projects, loading } = useProjectsWithAIActivity();
  const { openProject } = useModal();

  const handleSelectProject = useCallback(
    (projectId: string) => {
      navigate({ to: `/projects/${projectId}` });
    },
    [navigate]
  );

  const handleViewAllTickets = useCallback(
    (projectId: string) => {
      navigate({ to: `/board`, search: { project: projectId } });
    },
    [navigate]
  );

  const handleAddProject = useCallback(() => {
    openProject();
  }, [openProject]);

  const handleEditProject = useCallback(
    (project: ProjectBase) => {
      openProject(project);
    },
    [openProject]
  );

  if (loading) {
    return (
      <div style={pageContainerStyles}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
          }}
        >
          <p style={{ color: "var(--text-secondary)" }}>Loading projects...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={pageContainerStyles}>
      {/* Header */}
      <header style={headerStyles}>
        <h1 style={titleStyles}>Projects</h1>
        <button
          type="button"
          style={newProjectButtonStyles}
          onClick={handleAddProject}
          className="hover:bg-[var(--accent-primary)] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
        >
          <Plus size={18} aria-hidden="true" />
          New Project
        </button>
      </header>

      {/* Projects Grid or Empty State */}
      {projects.length === 0 ? (
        <div style={emptyStateStyles}>
          <div style={emptyContentStyles}>
            <p style={emptyTitleStyles}>No projects yet</p>
            <p style={emptyDescriptionStyles}>
              Create your first project to get started with Brain Dump.
            </p>
            <button
              type="button"
              style={emptyActionButtonStyles}
              onClick={handleAddProject}
              className="hover:bg-[var(--accent-primary)] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            >
              Add Project
            </button>
          </div>
        </div>
      ) : (
        <div style={gridStyles}>
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => handleSelectProject(project.id)}
              onViewAllTickets={() => handleViewAllTickets(project.id)}
              onEditProject={() => handleEditProject(project)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Styles
const pageContainerStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  background: "var(--bg-primary)",
};

const headerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "var(--spacing-6) var(--spacing-8)",
  borderBottom: "1px solid var(--border-primary)",
  backgroundColor: "var(--bg-secondary)",
};

const titleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-2xl)",
  fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  margin: 0,
};

const newProjectButtonStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-2) var(--spacing-4)",
  background: "var(--accent-primary)",
  color: "white",
  border: "none",
  borderRadius: "var(--radius-md)",
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  cursor: "pointer",
  transition: "all var(--transition-fast)",
};

const gridStyles: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "var(--spacing-8)",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
  gap: "var(--spacing-6)",
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
  maxWidth: "400px",
};

const emptyTitleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xl)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  margin: 0,
  marginBottom: "var(--spacing-2)",
};

const emptyDescriptionStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-secondary)",
  margin: 0,
  marginBottom: "var(--spacing-4)",
};

const emptyActionButtonStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-2) var(--spacing-4)",
  background: "var(--accent-primary)",
  color: "white",
  border: "none",
  borderRadius: "var(--radius-md)",
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  cursor: "pointer",
  transition: "all var(--transition-fast)",
};
