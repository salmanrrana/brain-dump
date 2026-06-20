import type { CSSProperties, FC, KeyboardEvent, MouseEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FileText, Folder, Bot, GripVertical, Settings } from "lucide-react";
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
  /** Whether drag reordering is currently enabled */
  reorderEnabled?: boolean;
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
  reorderEnabled = true,
}: ProjectListItemProps): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
    disabled: !reorderEnabled,
  });

  function handleSettingsClick(e: MouseEvent<HTMLButtonElement>): void {
    e.stopPropagation();
    onSettings();
  }

  function handleDragHandleClick(e: MouseEvent<HTMLButtonElement>): void {
    e.stopPropagation();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.target instanceof HTMLElement && event.target.closest("[data-project-drag-handle]")) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  }

  const containerStyle: CSSProperties = {
    ...(project.hasActiveAI
      ? {
          ...baseContainerStyles,
          boxShadow: "0 0 8px var(--accent-ai), inset 0 0 1px var(--accent-ai)",
        }
      : baseContainerStyles),
    transform: CSS.Transform.toString(transform),
    transition: transition ?? baseContainerStyles.transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 1 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={containerStyle}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      title={`${project.name || "(Unnamed)"} — ${project.path || "(Unknown path)"}`}
      data-testid={`project-list-item-${project.id}`}
      className="group hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)] hover:[&_h3]:text-[var(--accent-primary)] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-primary)]"
    >
      <button
        type="button"
        style={dragHandleStyles}
        onClick={handleDragHandleClick}
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${project.name?.trim() || "project"}`}
        aria-disabled={!reorderEnabled}
        title={
          reorderEnabled ? "Drag or use keyboard to reorder" : "Clear search to reorder projects"
        }
        data-project-drag-handle="true"
        className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
      >
        <GripVertical size={16} aria-hidden="true" />
      </button>

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
  gap: "4px",
  fontSize: "var(--font-size-xs)",
  fontFamily: "var(--font-mono)",
  color: "var(--text-muted)",
  whiteSpace: "nowrap",
  letterSpacing: "0.02em",
};

const baseContainerStyles: CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-4)",
  width: "100%",
  padding: "var(--spacing-4) var(--spacing-5)",
  background: "var(--bg-card)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-xl)",
  cursor: "pointer",
  transition: "all var(--transition-normal)",
  textAlign: "left",
};

const dragHandleStyles: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "28px",
  height: "28px",
  background: "transparent",
  border: "none",
  borderRadius: "var(--radius-md)",
  color: "var(--text-muted)",
  cursor: "grab",
  touchAction: "none",
  transition: "all var(--transition-fast)",
  flexShrink: 0,
};

const colorDotStyles: CSSProperties = {
  width: "10px",
  height: "10px",
  borderRadius: "var(--radius-full)",
  flexShrink: 0,
  boxShadow: "0 0 6px currentColor",
};

const contentStyles: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-1)",
};

const nameStyles: CSSProperties = {
  color: "var(--text-primary)",
  fontSize: "var(--font-size-base)",
  fontWeight: 500,
  letterSpacing: "var(--tracking-tight)",
  margin: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  transition: "color var(--transition-fast)",
};

const metadataRowStyles: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-4)",
};

const settingsButtonStyles: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "28px",
  height: "28px",
  background: "transparent",
  border: "none",
  borderRadius: "var(--radius-md)",
  color: "var(--text-muted)",
  cursor: "pointer",
  transition: "all var(--transition-fast)",
  flexShrink: 0,
};
