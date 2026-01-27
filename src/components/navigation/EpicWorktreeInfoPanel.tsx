import { memo } from "react";
import { FolderOpen, Terminal, Trash2, FolderGit2 } from "lucide-react";
import { WorktreeBadge, type IsolationMode, type WorktreeStatus } from "../WorktreeBadge";

/**
 * Props for the EpicWorktreeInfoPanel component
 */
export interface EpicWorktreeInfoPanelProps {
  /** Epic title for display */
  epicTitle: string;
  /** The isolation mode (should be "worktree" for this panel to show meaningful content) */
  isolationMode: IsolationMode;
  /** Worktree filesystem path */
  worktreePath?: string | null | undefined;
  /** Current worktree status */
  worktreeStatus?: WorktreeStatus | null | undefined;
  /** When the worktree was created */
  worktreeCreatedAt?: string | null | undefined;
  /** Handler for "Open in IDE" action */
  onOpenInIDE?: (() => void) | undefined;
  /** Handler for "Open Terminal" action */
  onOpenTerminal?: (() => void) | undefined;
  /** Handler for "Cleanup" action */
  onCleanup?: (() => void) | undefined;
}

/**
 * EpicWorktreeInfoPanel - Expanded worktree information display.
 *
 * Shows detailed worktree information when an epic uses worktree isolation:
 * - Status badge (active/stale/orphaned)
 * - Filesystem path
 * - Creation date
 * - Action buttons: Open in IDE, Open Terminal, Cleanup
 *
 * This component is designed to appear between the search bar and epic list
 * in the EpicDrillInView when a worktree-enabled epic is selected.
 */
export const EpicWorktreeInfoPanel = memo(function EpicWorktreeInfoPanel({
  epicTitle,
  isolationMode,
  worktreePath,
  worktreeStatus,
  worktreeCreatedAt,
  onOpenInIDE,
  onOpenTerminal,
  onCleanup,
}: EpicWorktreeInfoPanelProps) {
  // Only render for worktree isolation mode
  if (isolationMode !== "worktree") {
    return null;
  }

  // Format the creation date
  const formattedDate = worktreeCreatedAt
    ? new Date(worktreeCreatedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  // Determine if cleanup should be enabled (stale or orphaned status)
  const canCleanup = worktreeStatus === "stale" || worktreeStatus === "orphaned";

  return (
    <div style={containerStyles} role="region" aria-label={`Worktree information for ${epicTitle}`}>
      {/* Header with badge */}
      <div style={headerStyles}>
        <FolderGit2
          size={16}
          style={{ color: "var(--text-tertiary)", flexShrink: 0 }}
          aria-hidden="true"
        />
        <span style={labelStyles}>Worktree</span>
        <WorktreeBadge
          isolationMode="worktree"
          worktreeStatus={worktreeStatus ?? undefined}
          size="sm"
        />
      </div>

      {/* Path display */}
      {worktreePath && (
        <div style={pathContainerStyles}>
          <code style={pathStyles} title={worktreePath}>
            {worktreePath}
          </code>
        </div>
      )}

      {/* Metadata row */}
      {formattedDate && (
        <div style={metaStyles}>
          <span>Created {formattedDate}</span>
        </div>
      )}

      {/* Action buttons */}
      <div style={actionsStyles}>
        {onOpenInIDE && (
          <button
            type="button"
            style={actionButtonStyles}
            onClick={onOpenInIDE}
            aria-label="Open worktree in IDE"
            title="Open in IDE"
            className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <FolderOpen size={14} aria-hidden="true" />
            <span>Open in IDE</span>
          </button>
        )}
        {onOpenTerminal && (
          <button
            type="button"
            style={actionButtonStyles}
            onClick={onOpenTerminal}
            aria-label="Open terminal in worktree"
            title="Open Terminal"
            className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <Terminal size={14} aria-hidden="true" />
            <span>Terminal</span>
          </button>
        )}
        {onCleanup && (
          <button
            type="button"
            style={{
              ...actionButtonStyles,
              ...(canCleanup ? cleanupActiveStyles : cleanupDisabledStyles),
            }}
            onClick={canCleanup ? onCleanup : undefined}
            disabled={!canCleanup}
            aria-label={canCleanup ? "Cleanup worktree" : "Worktree is active, cannot cleanup"}
            title={
              canCleanup ? "Cleanup worktree" : "Only stale/orphaned worktrees can be cleaned up"
            }
            className={canCleanup ? "hover:bg-[var(--error-muted)] hover:text-[var(--error)]" : ""}
          >
            <Trash2 size={14} aria-hidden="true" />
            <span>Cleanup</span>
          </button>
        )}
      </div>
    </div>
  );
});

// ============================================================================
// Styles
// ============================================================================

const containerStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-3) var(--spacing-4)",
  background: "var(--bg-secondary)",
  borderBottom: "1px solid var(--border-primary)",
};

const headerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
};

const labelStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  color: "var(--text-secondary)",
};

const pathContainerStyles: React.CSSProperties = {
  overflow: "hidden",
};

const pathStyles: React.CSSProperties = {
  display: "block",
  fontSize: "var(--font-size-xs)",
  fontFamily: "var(--font-mono)",
  color: "var(--text-tertiary)",
  background: "var(--bg-tertiary)",
  padding: "var(--spacing-1) var(--spacing-2)",
  borderRadius: "var(--radius-sm)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const metaStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  color: "var(--text-tertiary)",
};

const actionsStyles: React.CSSProperties = {
  display: "flex",
  gap: "var(--spacing-2)",
  marginTop: "var(--spacing-1)",
};

const actionButtonStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--spacing-1)",
  padding: "var(--spacing-1) var(--spacing-2)",
  fontSize: "var(--font-size-xs)",
  color: "var(--text-tertiary)",
  background: "transparent",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
  transition: "all var(--transition-fast)",
};

const cleanupActiveStyles: React.CSSProperties = {
  borderColor: "var(--error-muted)",
  color: "var(--text-tertiary)",
};

const cleanupDisabledStyles: React.CSSProperties = {
  opacity: 0.5,
  cursor: "not-allowed",
};

export default EpicWorktreeInfoPanel;
