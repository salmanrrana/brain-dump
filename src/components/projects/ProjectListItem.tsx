import { type FC, useState, type MouseEvent } from "react";
import { FileText, Folder, Bot, Settings } from "lucide-react";
import type { ProjectWithAIActivity } from "../../lib/hooks";

export interface ProjectListItemProps {
  /** Project data with AI activity indicators */
  project: ProjectWithAIActivity;
  /** Number of tickets in this project */
  ticketCount: number;
  /** Number of epics in this project */
  epicCount: number;
  /** Handler when the project is clicked */
  onClick: () => void;
  /** Handler when the settings button is clicked */
  onSettings: (e: MouseEvent<HTMLButtonElement>) => void;
}

/**
 * MetadataBadge - Inline metadata badge for project list item.
 *
 * Displays an icon with optional count and label. Used for showing
 * ticket counts, epic counts, and AI activity status.
 */
interface MetadataBadgeProps {
  icon: FC<{ size: number }>;
  label: string;
  count?: number;
  glow?: boolean;
}

const MetadataBadge: FC<MetadataBadgeProps> = ({ icon: Icon, label, count, glow }) => {
  const badgeStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--spacing-1)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-tertiary)",
    whiteSpace: "nowrap",
    ...(glow && {
      color: "var(--accent-ai)",
    }),
  };

  return (
    <span style={badgeStyles} aria-label={`${count || ""} ${label}`.trim()}>
      <Icon size={12} aria-hidden="true" />
      {count !== undefined && <span>{count}</span>}
      {!count && <span>{label}</span>}
    </span>
  );
};

/**
 * ProjectListItem - Minimalist project row for the projects homepage.
 *
 * Features:
 * - **Color dot**: Small circle showing project color
 * - **Title**: Project name with path hint on hover
 * - **Metadata badges**: Inline ticket count, epic count, and AI status
 * - **Hover actions**: Settings button appears on hover
 * - **Subtle styling**: No borders, transparent background, minimal visual noise
 */
export const ProjectListItem: FC<ProjectListItemProps> = ({
  project,
  ticketCount,
  epicCount,
  onClick,
  onSettings,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleSettingsClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onSettings(e);
  };

  const containerStyles: React.CSSProperties = {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-3)",
    width: "100%",
    padding: "var(--spacing-3) var(--spacing-4)",
    background: isHovered ? "var(--bg-hover)" : "transparent",
    border: "none",
    borderRadius: "var(--radius-md)",
    cursor: "pointer",
    transition: "all var(--transition-fast)",
    textAlign: "left",
    // AI glow effect
    ...(project.hasActiveAI && {
      boxShadow: "0 0 8px var(--accent-ai), inset 0 0 1px var(--accent-ai)",
    }),
  };

  const colorDotStyles: React.CSSProperties = {
    width: "12px",
    height: "12px",
    borderRadius: "var(--radius-full)",
    background: project.color || "var(--text-tertiary)",
    flexShrink: 0,
  };

  const contentStyles: React.CSSProperties = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "var(--spacing-2)",
  };

  const nameStyles: React.CSSProperties = {
    color: "var(--text-primary)",
    fontSize: "var(--font-size-sm)",
    fontWeight: 500,
    margin: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  const metadataRowStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-3)",
  };

  const settingsButtonStyles: React.CSSProperties = {
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
    transition: "all var(--transition-fast)",
    opacity: isHovered ? 1 : 0,
    pointerEvents: isHovered ? "auto" : "none",
    flexShrink: 0,
  };

  return (
    <div
      style={containerStyles}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="option"
      tabIndex={0}
      title={`${project.name} — ${project.path}`}
      data-testid={`project-list-item-${project.id}`}
      className="hover:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-primary)]"
    >
      {/* Color dot */}
      <span style={colorDotStyles} aria-hidden="true" />

      {/* Content */}
      <div style={contentStyles}>
        {/* Project name */}
        <h3 style={nameStyles}>{project.name}</h3>

        {/* Metadata badges row */}
        <div style={metadataRowStyles}>
          <MetadataBadge icon={FileText} label="tickets" count={ticketCount} />
          <MetadataBadge icon={Folder} label="epics" count={epicCount} />
          {project.hasActiveAI && <MetadataBadge icon={Bot} label="AI active" glow />}
        </div>
      </div>

      {/* Settings button (hover-revealed) */}
      <button
        type="button"
        style={settingsButtonStyles}
        onClick={handleSettingsClick}
        aria-label={`Settings for ${project.name}`}
        className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <Settings size={16} aria-hidden="true" />
      </button>
    </div>
  );
};

export default ProjectListItem;
