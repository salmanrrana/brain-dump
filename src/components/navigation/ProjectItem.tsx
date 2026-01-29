import { type FC, useState, type MouseEvent } from "react";
import { Pencil, Trash2, Zap } from "lucide-react";
import { createEnterSpaceHandler } from "../../lib/keyboard-utils";

export interface ProjectStats {
  /** Total number of tickets in the project */
  total: number;
  /** Number of tickets currently in progress */
  inProgress: number;
  /** Number of completed tickets */
  done: number;
}

export interface ProjectItemProps {
  /** Project ID */
  id: string;
  /** Project display name */
  name: string;
  /** Filesystem path to the project */
  path: string;
  /** Project color (hex value) */
  color: string | null;
  /** Whether this project is currently selected */
  isSelected?: boolean;
  /** Ticket statistics for this project */
  stats?: ProjectStats;
  /** Whether AI (Ralph) is currently active on this project */
  isAiActive?: boolean;
  /** Handler when the project is clicked (for selection) */
  onClick?: (id: string) => void;
  /** Handler when the project is double-clicked (for editing) */
  onDoubleClick?: (id: string) => void;
  /** Handler when the edit button is clicked */
  onEdit?: (id: string) => void;
  /** Handler when the delete button is clicked */
  onDelete?: (id: string) => void;
}

/**
 * Truncates a path by keeping the last maxLength characters.
 * Full path is shown in tooltip, so this just ensures UI doesn't overflow.
 */
function truncatePath(path: string, maxLength: number = 30): string {
  if (path.length <= maxLength) {
    return path;
  }
  return "..." + path.slice(-maxLength + 3);
}

/**
 * ProjectItem - Individual project item for the projects panel list.
 *
 * Features:
 * - **Color indicator**: Circle showing project color
 * - **Project name**: Primary text
 * - **Path display**: Truncated with tooltip for full path
 * - **Ticket stats**: Shows total, in progress, done counts
 * - **AI active indicator**: Glow effect when Ralph is running
 * - **Hover actions**: Edit and delete buttons appear on hover
 * - **Click to select**: Sets project filter
 * - **Double-click to edit**: Opens edit modal
 * - **Keyboard accessible**: Enter/Space to select, full focus management
 */
export const ProjectItem: FC<ProjectItemProps> = ({
  id,
  name,
  path,
  color,
  isSelected = false,
  stats,
  isAiActive = false,
  onClick,
  onDoubleClick,
  onEdit,
  onDelete,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = () => onClick?.(id);
  const handleDoubleClick = () => onDoubleClick?.(id);
  const handleKeyDown = onClick ? createEnterSpaceHandler(() => onClick(id)) : undefined;

  const handleEditClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onEdit?.(id);
  };

  const handleDeleteClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onDelete?.(id);
  };

  const statsText = stats ? `${stats.total} tickets · ${stats.inProgress} in progress` : undefined;

  const containerStyles: React.CSSProperties = {
    position: "relative",
    display: "flex",
    alignItems: "flex-start",
    gap: "var(--spacing-3)",
    width: "100%",
    padding: "var(--spacing-3)",
    background: isSelected ? "var(--accent-muted)" : "transparent",
    border: "none",
    borderRadius: "var(--radius-md)",
    cursor: "pointer",
    transition: "all var(--transition-fast)",
    textAlign: "left",
    ...(isAiActive && {
      boxShadow: "0 0 12px var(--accent-primary), inset 0 0 2px var(--accent-primary)",
    }),
  };

  const colorDotStyles: React.CSSProperties = {
    width: "12px",
    height: "12px",
    borderRadius: "var(--radius-full)",
    background: color || "var(--text-tertiary)",
    flexShrink: 0,
    marginTop: "4px", // Vertically align with name text
  };

  const contentStyles: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "var(--spacing-1)",
  };

  const headerStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "var(--spacing-2)",
  };

  const nameStyles: React.CSSProperties = {
    color: "var(--text-primary)",
    fontSize: "var(--font-size-sm)",
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    margin: 0,
  };

  const aiIndicatorStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    color: "var(--accent-primary)",
    animation: isAiActive ? "pulse 2s infinite" : undefined,
    flexShrink: 0,
  };

  const pathStyles: React.CSSProperties = {
    color: "var(--text-tertiary)",
    fontSize: "var(--font-size-xs)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    margin: 0,
  };

  const statsStyles: React.CSSProperties = {
    color: "var(--text-secondary)",
    fontSize: "var(--font-size-xs)",
    margin: 0,
  };

  const actionsStyles: React.CSSProperties = {
    position: "absolute",
    right: "var(--spacing-2)",
    top: "50%",
    transform: "translateY(-50%)",
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-1)",
    opacity: isHovered ? 1 : 0,
    transition: "opacity var(--transition-fast)",
    pointerEvents: isHovered ? "auto" : "none",
  };

  // Action button styles
  const actionButtonStyles: React.CSSProperties = {
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
    transition: "all var(--transition-fast)",
  };

  return (
    <div
      style={containerStyles}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      title={path}
      data-testid={`project-item-${id}`}
      className="hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-primary)]"
    >
      <span style={colorDotStyles} aria-hidden="true" data-testid="color-indicator" />

      <div style={contentStyles}>
        <div style={headerStyles}>
          <p style={nameStyles} data-testid="project-name">
            {name}
          </p>
          {isAiActive && (
            <span
              style={aiIndicatorStyles}
              role="status"
              aria-label="AI is active on this project"
              data-testid="ai-indicator"
            >
              <Zap size={14} aria-hidden="true" />
            </span>
          )}
        </div>

        <p style={pathStyles} data-testid="project-path">
          {truncatePath(path)}
        </p>

        {statsText && (
          <p style={statsStyles} data-testid="project-stats">
            {statsText}
          </p>
        )}
      </div>

      {(onEdit || onDelete) && (
        <div style={actionsStyles} data-testid="hover-actions">
          {onEdit && (
            <button
              type="button"
              style={actionButtonStyles}
              onClick={handleEditClick}
              aria-label={`Edit ${name}`}
              data-testid="edit-button"
              className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] hover:border-[var(--accent-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            >
              <Pencil size={14} aria-hidden="true" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              style={actionButtonStyles}
              onClick={handleDeleteClick}
              aria-label={`Delete ${name}`}
              data-testid="delete-button"
              className="hover:bg-[var(--status-error-bg)] hover:text-[var(--status-error)] hover:border-[var(--status-error)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--status-error)]"
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ProjectItem;
