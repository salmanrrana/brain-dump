import type { CSSProperties, FC, MouseEvent } from "react";
import { FileText, Folder, Bot, Settings } from "lucide-react";
import { createEnterSpaceHandler } from "../../lib/keyboard-utils";
import type { ProjectWithAIActivity } from "../../lib/hooks/projects";

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
  onSettings: () => void;
}

interface MetadataBadgeProps {
  icon: FC<{ size: number }>;
  label: string;
  count?: number;
  glow?: boolean;
}

function MetadataBadge({ icon: Icon, label, count, glow }: MetadataBadgeProps): React.JSX.Element {
  const style: CSSProperties = glow ? { ...badgeStyles, color: "var(--accent-ai)" } : badgeStyles;

  const displayText = count !== undefined ? String(count) : label;
  const ariaLabel = count !== undefined ? `${count} ${label}` : label;

  return (
    <span style={style} aria-label={ariaLabel}>
      <Icon size={12} aria-hidden="true" />
      <span>{displayText}</span>
    </span>
  );
}

/**
 * Minimalist project row for the projects homepage.
 * Shows a color dot, project name, metadata badges, and a hover-revealed settings button.
 * Uses CSS group-hover for hover effects to avoid React state re-renders.
 */
function ProjectListItem({
  project,
  ticketCount,
  epicCount,
  onClick,
  onSettings,
}: ProjectListItemProps): React.JSX.Element {
  function handleSettingsClick(e: MouseEvent<HTMLButtonElement>): void {
    e.stopPropagation();
    onSettings();
  }

  const handleKeyDown = createEnterSpaceHandler(onClick);

  const containerStyle: CSSProperties = project.hasActiveAI
    ? {
        ...baseContainerStyles,
        boxShadow: "0 0 8px var(--accent-ai), inset 0 0 1px var(--accent-ai)",
      }
    : baseContainerStyles;

  return (
    <div
      style={containerStyle}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      title={`${project.name || "(Unnamed)"} — ${project.path || "(Unknown path)"}`}
      data-testid={`project-list-item-${project.id}`}
      className="group hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-primary)]"
    >
      <span
        style={{
          ...colorDotStyles,
          background: project.color || "var(--text-tertiary)",
        }}
        aria-hidden="true"
      />

      <div style={contentStyles}>
        <h3 style={nameStyles}>{project.name || "(Unnamed)"}</h3>

        <div style={metadataRowStyles}>
          <MetadataBadge icon={FileText} label="tickets" count={ticketCount} />
          <MetadataBadge icon={Folder} label="epics" count={epicCount} />
          {project.hasActiveAI && <MetadataBadge icon={Bot} label="AI active" glow />}
        </div>
      </div>

      <button
        type="button"
        style={settingsButtonStyles}
        onClick={handleSettingsClick}
        aria-label={`Settings for ${project.name?.trim() || "project"}`}
        className="opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <Settings size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export default ProjectListItem;

// ---------------------------------------------------------------------------
// Styles (module-level for referential stability)
// ---------------------------------------------------------------------------

const badgeStyles: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--spacing-1)",
  fontSize: "var(--font-size-xs)",
  color: "var(--text-tertiary)",
  whiteSpace: "nowrap",
};

const baseContainerStyles: CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-3)",
  width: "100%",
  padding: "var(--spacing-3) var(--spacing-4)",
  background: "transparent",
  border: "none",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  transition: "all var(--transition-fast)",
  textAlign: "left",
};

const colorDotStyles: CSSProperties = {
  width: "12px",
  height: "12px",
  borderRadius: "var(--radius-full)",
  flexShrink: 0,
};

const contentStyles: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-2)",
};

const nameStyles: CSSProperties = {
  color: "var(--text-primary)",
  fontSize: "var(--font-size-sm)",
  fontWeight: 500,
  margin: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const metadataRowStyles: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-3)",
};

const settingsButtonStyles: CSSProperties = {
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
  flexShrink: 0,
};
