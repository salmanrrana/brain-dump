import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowLeft, Plus, AlertCircle } from "lucide-react";
import { useProjects, useTickets } from "../lib/hooks";
import { useAppState } from "../components/AppLayout";
import { createBrowserLogger } from "../lib/browser-logger";
import EpicListItem from "../components/navigation/EpicListItem";

const logger = createBrowserLogger("routes:project-detail");

export const Route = createFileRoute("/projects/$projectId")({
  component: ProjectDetail,
});

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const { projects, loading, error } = useProjects();
  const { tickets } = useTickets({ projectId });
  const { openEpicModal } = useAppState();

  // Must call hooks before any early returns
  const ticketCountByEpic = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ticket of tickets) {
      if (ticket.epicId) {
        counts.set(ticket.epicId, (counts.get(ticket.epicId) ?? 0) + 1);
      }
    }
    return counts;
  }, [tickets]);

  if (loading) {
    return (
      <div style={containerStyles}>
        <div style={centeredContainerStyles}>
          <p style={{ color: "var(--text-secondary)" }}>Loading project...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyles}>
        <div style={centeredContainerStyles}>
          <div style={errorContainerStyles}>
            <AlertCircle size={24} style={{ color: "var(--text-destructive)" }} />
            <p style={errorTitleStyles}>Failed to load project</p>
            <p style={errorDescriptionStyles}>{error}</p>
            <button
              type="button"
              style={accentButtonStyles}
              onClick={() => navigate({ to: "/" })}
              className="hover:bg-[var(--accent-primary)] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            >
              Back to Projects
            </button>
          </div>
        </div>
      </div>
    );
  }

  const project = projects.find((p) => p.id === projectId);

  if (!project) {
    return (
      <div style={containerStyles}>
        <div style={centeredContainerStyles}>
          <div style={errorContainerStyles}>
            <AlertCircle size={24} style={{ color: "var(--text-destructive)" }} />
            <p style={errorTitleStyles}>Project not found</p>
            <p style={errorDescriptionStyles}>The project you're looking for doesn't exist.</p>
            <button
              type="button"
              style={accentButtonStyles}
              onClick={() => navigate({ to: "/" })}
              className="hover:bg-[var(--accent-primary)] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            >
              Back to Projects
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyles}>
      <header style={headerStyles}>
        <button
          type="button"
          style={backButtonStyles}
          onClick={() => navigate({ to: "/" })}
          aria-label="Back to projects"
          className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <div style={projectHeaderStyles}>
          <span
            style={{
              ...colorDotStyles,
              background: project.color || "var(--text-tertiary)",
            }}
            aria-hidden="true"
          />
          <div style={projectInfoStyles}>
            <h1 style={projectNameStyles}>{project.name}</h1>
            <p style={projectPathStyles} title={project.path}>
              {project.path}
            </p>
          </div>
        </div>
        <button
          type="button"
          style={accentButtonStyles}
          onClick={() => navigate({ to: "/board", search: { project: projectId } })}
          className="hover:bg-[var(--accent-primary)] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
        >
          View All Tickets
        </button>
      </header>

      {project.epics.length === 0 ? (
        <div style={emptyStateStyles}>
          <div style={emptyContentStyles}>
            <p style={emptyTitleStyles}>No epics yet</p>
            <p style={emptyDescriptionStyles}>Create your first epic to organize your tickets</p>
            <button
              type="button"
              style={accentButtonStyles}
              onClick={() => openEpicModal(projectId)}
              className="hover:bg-[var(--accent-primary)] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            >
              <Plus size={18} aria-hidden="true" />
              Add Epic
            </button>
          </div>
        </div>
      ) : (
        <div style={contentStyles}>
          <div style={epicsListStyles}>
            {project.epics.map((epic) => (
              <EpicListItem
                key={epic.id}
                epic={epic}
                ticketCount={ticketCountByEpic.get(epic.id)}
                onSelect={() =>
                  navigate({ to: "/board", search: { project: projectId, epic: epic.id } })
                }
                onEdit={() => openEpicModal(projectId, epic)}
                onLaunchRalph={() => {
                  // TODO: Implement Ralph launch for epic
                  logger.info(`Ralph launch not yet implemented for epic: ${epic.id}`);
                }}
              />
            ))}
          </div>

          <footer style={footerStyles}>
            <button
              type="button"
              style={addEpicButtonStyles}
              onClick={() => openEpicModal(projectId)}
              className="hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            >
              <Plus size={16} aria-hidden="true" />
              Add Epic
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}

const containerStyles: React.CSSProperties = {
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
  padding: "var(--spacing-8)",
};

const headerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-4)",
  padding: "var(--spacing-4)",
  borderBottom: "1px solid var(--border-primary)",
  backgroundColor: "var(--bg-secondary)",
};

const backButtonStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "36px",
  height: "36px",
  background: "transparent",
  border: "none",
  borderRadius: "var(--radius-md)",
  color: "var(--text-secondary)",
  cursor: "pointer",
  transition: "all var(--transition-fast)",
  flexShrink: 0,
};

const projectHeaderStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-3)",
  flex: 1,
  minWidth: 0,
};

const colorDotStyles: React.CSSProperties = {
  width: "16px",
  height: "16px",
  borderRadius: "var(--radius-full)",
  flexShrink: 0,
};

const projectInfoStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
};

const projectNameStyles: React.CSSProperties = {
  fontSize: "var(--font-size-lg)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  margin: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const projectPathStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  color: "var(--text-tertiary)",
  margin: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
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
  flexShrink: 0,
};

const contentStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  overflow: "hidden",
};

const epicsListStyles: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "var(--spacing-2)",
};

const footerStyles: React.CSSProperties = {
  padding: "var(--spacing-3) var(--spacing-4)",
  borderTop: "1px solid var(--border-primary)",
  backgroundColor: "var(--bg-secondary)",
};

const addEpicButtonStyles: React.CSSProperties = {
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
