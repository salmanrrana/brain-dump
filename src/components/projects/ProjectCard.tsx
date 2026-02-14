import type { CSSProperties } from "react";
import { ChevronRight } from "lucide-react";
import type { ProjectWithAIActivity } from "../../lib/hooks/projects";
import { createBrowserLogger } from "../../lib/browser-logger";

const logger = createBrowserLogger("components:ProjectCard");

export interface ProjectCardProps {
  project: ProjectWithAIActivity;
  onClick: () => void;
  onViewAllTickets: () => void;
  onEditProject: () => void;
}

// Glow keyframes for AI activity indicator
const GLOW_KEYFRAMES = `
@keyframes project-card-glow {
  0%, 100% { box-shadow: 0 0 12px var(--accent-ai), inset 0 0 1px var(--accent-ai), 0 0 0 1px var(--border-primary); }
  50% { box-shadow: 0 0 20px var(--accent-ai), inset 0 0 2px var(--accent-ai), 0 0 0 1px var(--border-primary); }
}
`;

let glowKeyframesInjected = false;
function injectGlowKeyframes(): void {
  if (typeof document === "undefined" || glowKeyframesInjected) return;
  try {
    const style = document.createElement("style");
    style.textContent = GLOW_KEYFRAMES;
    document.head.appendChild(style);
    glowKeyframesInjected = true;
  } catch (error) {
    logger.error(
      "Failed to inject glow keyframes - animation will be unavailable",
      error instanceof Error ? error : new Error(String(error))
    );
    // Component still renders but without animation
  }
}

// Inject keyframes on first mount
injectGlowKeyframes();

function truncatePath(path: string, maxLength: number): string {
  if (path.length <= maxLength) return path;
  return `${path.slice(0, maxLength - 3)}...`;
}

/**
 * ProjectCard - Card component for displaying a project in the grid.
 * Shows project name, path, epic count, ticket stats, and AI activity glow.
 */
function ProjectCard({
  project,
  onClick,
  onViewAllTickets,
  onEditProject,
}: ProjectCardProps): React.JSX.Element {
  const displayPath = truncatePath(project.path, 50);

  const cardStyles: CSSProperties = {
    ...baseCardStyles,
    ...(project.hasActiveAI && {
      animation: "project-card-glow 2s infinite",
    }),
  };

  return (
    <div
      style={cardStyles}
      className="hover:bg-[var(--bg-tertiary)] hover:border-[var(--accent-primary)] focus-within:outline-none focus-within:ring-2 focus-within:ring-[var(--accent-primary)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--bg-primary)]"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`Open project ${project.name}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div style={headerStyles}>
        <div style={titleContainerStyles}>
          <span
            style={{
              ...colorDotStyles,
              background: project.color || "var(--text-tertiary)",
            }}
            aria-hidden="true"
          />
          <h3 style={projectNameStyles}>{project.name}</h3>
        </div>
        <ChevronRight size={20} style={chevronStyles} aria-hidden="true" />
      </div>

      <p style={pathStyles} title={project.path}>
        {displayPath}
      </p>

      <div style={statsStyles}>
        <div style={statItemStyles}>
          <p style={statLabelStyles}>Epics</p>
          <p style={statValueStyles}>{project.epics.length}</p>
        </div>
        {project.hasActiveAI && (
          <div style={statItemStyles}>
            <p style={statLabelStyles}>Active AI</p>
            <p style={statValueStyles}>{project.activeSessionCount}</p>
          </div>
        )}
      </div>

      <div style={actionsContainerStyles}>
        <button
          type="button"
          style={actionButtonStyles}
          onClick={(e) => {
            e.stopPropagation();
            onViewAllTickets();
          }}
          className="hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
        >
          View All Tickets
        </button>
        <button
          type="button"
          style={editButtonStyles}
          onClick={(e) => {
            e.stopPropagation();
            onEditProject();
          }}
          className="hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
          title="Edit project"
          aria-label={`Edit ${project.name}`}
        >
          Settings
        </button>
      </div>
    </div>
  );
}

export default ProjectCard;

// ---------------------------------------------------------------------------
// Styles (module-level for referential stability)
// ---------------------------------------------------------------------------

const baseCardStyles: CSSProperties = {
  padding: "var(--spacing-4)",
  background: "var(--bg-secondary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-lg)",
  cursor: "pointer",
  transition: "all var(--transition-normal)",
  position: "relative",
  overflow: "hidden",
};

const headerStyles: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "var(--spacing-2)",
  marginBottom: "var(--spacing-3)",
};

const titleContainerStyles: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  flex: 1,
  minWidth: 0,
};

const colorDotStyles: CSSProperties = {
  width: "12px",
  height: "12px",
  borderRadius: "var(--radius-full)",
  flexShrink: 0,
};

const projectNameStyles: CSSProperties = {
  fontSize: "var(--font-size-lg)",
  fontWeight: "var(--font-weight-semibold)" as CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  margin: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const chevronStyles: CSSProperties = {
  width: "20px",
  height: "20px",
  color: "var(--text-secondary)",
  flexShrink: 0,
};

const pathStyles: CSSProperties = {
  fontSize: "var(--font-size-xs)",
  color: "var(--text-tertiary)",
  margin: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  marginBottom: "var(--spacing-3)",
};

const statsStyles: CSSProperties = {
  display: "flex",
  gap: "var(--spacing-4)",
  marginBottom: "var(--spacing-3)",
  fontSize: "var(--font-size-sm)",
};

const statItemStyles: CSSProperties = {
  display: "flex",
  flexDirection: "column",
};

const statLabelStyles: CSSProperties = {
  color: "var(--text-tertiary)",
  fontSize: "var(--font-size-xs)",
  margin: 0,
};

const statValueStyles: CSSProperties = {
  color: "var(--text-primary)",
  fontWeight: "var(--font-weight-semibold)" as CSSProperties["fontWeight"],
  margin: 0,
};

const actionsContainerStyles: CSSProperties = {
  display: "flex",
  gap: "var(--spacing-2)",
};

const actionButtonStyles: CSSProperties = {
  flex: 1,
  padding: "var(--spacing-2) var(--spacing-3)",
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-md)",
  color: "var(--text-secondary)",
  fontSize: "var(--font-size-xs)",
  fontWeight: "var(--font-weight-medium)" as CSSProperties["fontWeight"],
  cursor: "pointer",
  transition: "all var(--transition-fast)",
};

const editButtonStyles: CSSProperties = {
  ...actionButtonStyles,
  flex: "0 0 auto",
};
