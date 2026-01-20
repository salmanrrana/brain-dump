import { type FC, useState, useCallback, type KeyboardEvent, type MouseEvent } from "react";
import { Pencil, Trash2, Zap } from "lucide-react";

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
 * Truncates a path to show ~ prefix for home directory and limit length.
 */
function truncatePath(path: string, maxLength: number = 30): string {
  // Replace home directory with ~
  const homeDir =
    typeof window !== "undefined" ? undefined : process.env.HOME || process.env.USERPROFILE;
  let displayPath = path;

  if (homeDir && path.startsWith(homeDir)) {
    displayPath = "~" + path.slice(homeDir.length);
  }

  // If still too long, truncate with ellipsis
  if (displayPath.length > maxLength) {
    return "..." + displayPath.slice(-maxLength + 3);
  }

  return displayPath;
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

  const handleClick = useCallback(() => {
    onClick?.(id);
  }, [id, onClick]);

  const handleDoubleClick = useCallback(() => {
    onDoubleClick?.(id);
  }, [id, onDoubleClick]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick?.(id);
      }
    },
    [id, onClick]
  );

  const handleEditClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onEdit?.(id);
    },
    [id, onEdit]
  );

  const handleDeleteClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onDelete?.(id);
    },
    [id, onDelete]
  );

  // Build stats text
  const statsText = stats ? `${stats.total} tickets · ${stats.inProgress} in progress` : undefined;

  // Container styles
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
    // AI active glow effect
    ...(isAiActive && {
      boxShadow: "0 0 12px var(--accent-primary), inset 0 0 2px var(--accent-primary)",
    }),
  };

  // Color dot styles
  const colorDotStyles: React.CSSProperties = {
    width: "12px",
    height: "12px",
    borderRadius: "var(--radius-full)",
    background: color || "var(--text-tertiary)",
    flexShrink: 0,
    marginTop: "4px", // Align with first line of text
  };

  // Content container
  const contentStyles: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "var(--spacing-1)",
  };

  // Header row (name + AI indicator)
  const headerStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "var(--spacing-2)",
  };

  // Project name
  const nameStyles: React.CSSProperties = {
    color: "var(--text-primary)",
    fontSize: "var(--font-size-sm)",
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    margin: 0,
  };

  // AI indicator
  const aiIndicatorStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    color: "var(--accent-primary)",
    animation: isAiActive ? "pulse 2s infinite" : undefined,
    flexShrink: 0,
  };

  // Path styles
  const pathStyles: React.CSSProperties = {
    color: "var(--text-tertiary)",
    fontSize: "var(--font-size-xs)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    margin: 0,
  };

  // Stats styles
  const statsStyles: React.CSSProperties = {
    color: "var(--text-secondary)",
    fontSize: "var(--font-size-xs)",
    margin: 0,
  };

  // Hover actions container
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
      {/* Color indicator */}
      <span style={colorDotStyles} aria-hidden="true" data-testid="color-indicator" />

      {/* Content */}
      <div style={contentStyles}>
        {/* Header: Name + AI indicator */}
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

        {/* Path */}
        <p style={pathStyles} data-testid="project-path">
          {truncatePath(path)}
        </p>

        {/* Stats */}
        {statsText && (
          <p style={statsStyles} data-testid="project-stats">
            {statsText}
          </p>
        )}
      </div>

      {/* Hover actions */}
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
