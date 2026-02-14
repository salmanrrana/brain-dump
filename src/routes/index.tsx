import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { Plus, AlertCircle, Search, X } from "lucide-react";
import type { CSSProperties } from "react";
import { useProjectsWithAIActivity } from "../lib/hooks";
import { useAppState } from "../components/AppLayout";
import ProjectListItem from "../components/projects/ProjectListItem";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const { projects, loading, error, refetch } = useProjectsWithAIActivity();
  const { openProjectModal } = useAppState();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredProjects = useMemo(
    () => projects.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [projects, searchQuery]
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
              <div style={projectListStyles}>
                {filteredProjects.map((project) => (
                  <ProjectListItem
                    key={project.id}
                    project={project}
                    ticketCount={project.ticketCount}
                    epicCount={project.epics.length}
                    onClick={() => handleSelectProject(project.id)}
                    onSettings={() => handleEditProject(project)}
                  />
                ))}
              </div>
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
  alignItems: "center",
  justifyContent: "space-between",
  padding: "var(--spacing-6) var(--spacing-8)",
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

const searchContainerStyles: CSSProperties = {
  padding: "var(--spacing-4) var(--spacing-8)",
  display: "flex",
  justifyContent: "center",
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
  padding: "var(--spacing-2) var(--spacing-3) var(--spacing-2) var(--spacing-3)",
  background: "var(--bg-primary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-lg)",
  fontSize: "var(--font-size-sm)",
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

const listContainerStyles: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "var(--spacing-6) var(--spacing-8)",
};

const projectListStyles: CSSProperties = {
  width: "100%",
  maxWidth: "900px",
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-1)",
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
