import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { Plus, AlertCircle } from "lucide-react";
import { useProjectsWithAIActivity } from "../lib/hooks";
import { useAppState } from "../components/AppLayout";
import ProjectCard from "../components/projects/ProjectCard";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const { projects, loading, error, refetch } = useProjectsWithAIActivity();
  const { openProjectModal } = useAppState();

  const handleSelectProject = useCallback(
    (projectId: string) => {
      // TODO: Navigate to /projects/$projectId once that route is implemented
      // For now, navigate to board filtered by project
      navigate({ to: `/board`, search: { project: projectId } });
    },
    [navigate]
  );

  const handleViewAllTickets = useCallback(
    (projectId: string) => {
      navigate({ to: `/board`, search: { project: projectId } });
    },
    [navigate]
  );

  if (loading) {
    return (
      <div style={pageContainerStyles}>
        <div style={centeredContainerStyles}>
          <p style={{ color: "var(--text-secondary)" }}>Loading projects...</p>
        </div>
      </div>
    );
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
    <div style={pageContainerStyles}>
      <header style={headerStyles}>
        <h1 style={titleStyles}>Projects</h1>
        <button
          type="button"
          style={accentButtonStyles}
          onClick={() => openProjectModal()}
          className="hover:bg-[var(--accent-primary)] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
        >
          <Plus size={18} aria-hidden="true" />
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
        <div style={gridStyles}>
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => handleSelectProject(project.id)}
              onViewAllTickets={() => handleViewAllTickets(project.id)}
              onEditProject={() => openProjectModal(project)}
            />
          ))}
        </div>
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

const accentButtonStyles: React.CSSProperties = {
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
