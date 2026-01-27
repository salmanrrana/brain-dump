import { memo } from "react";
import { GitBranch, FolderGit2 } from "lucide-react";

/**
 * Valid isolation modes for epic work
 */
export type IsolationMode = "branch" | "worktree" | null;

/**
 * Worktree status values from epic_workflow_state
 */
export type WorktreeStatus = "active" | "stale" | "orphaned" | null;

/**
 * Props for the WorktreeBadge component
 */
export interface WorktreeBadgeProps {
  /** The isolation mode: "branch", "worktree", or null */
  isolationMode: IsolationMode;
  /** The current worktree status (only relevant when isolationMode is "worktree") */
  worktreeStatus?: WorktreeStatus | undefined;
  /** The worktree filesystem path (shown in tooltip) */
  worktreePath?: string | null | undefined;
  /** Size variant: 'sm' for card badges, 'md' for headers */
  size?: "sm" | "md";
}

/**
 * Styling configuration for each worktree status
 */
const STATUS_CONFIG: Record<
  NonNullable<WorktreeStatus>,
  { bgClass: string; textClass: string; label: string }
> = {
  active: {
    bgClass: "bg-[var(--success-muted)]",
    textClass: "text-[var(--success)]",
    label: "active",
  },
  stale: {
    bgClass: "bg-[var(--warning-muted)]",
    textClass: "text-[var(--warning)]",
    label: "stale",
  },
  orphaned: {
    bgClass: "bg-[var(--error-muted)]",
    textClass: "text-[var(--error)]",
    label: "orphaned",
  },
};

/**
 * WorktreeBadge - Visual indicator for epic isolation mode and worktree status.
 *
 * States:
 * - Branch mode: Shows branch icon with "branch" label (gray)
 * - Worktree mode + active: Shows folder icon with "worktree" label (green)
 * - Worktree mode + stale: Shows folder icon with "worktree (stale)" label (yellow)
 * - Worktree mode + orphaned: Shows folder icon with "worktree (orphaned)" label (red)
 * - null isolation mode: Returns null (no badge)
 *
 * The worktree path is shown in a tooltip when provided.
 */
export const WorktreeBadge = memo(function WorktreeBadge({
  isolationMode,
  worktreeStatus,
  worktreePath,
  size = "sm",
}: WorktreeBadgeProps) {
  // Don't render if no isolation mode is set
  if (!isolationMode) {
    return null;
  }

  const sizeClasses = size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1";

  const iconSize = size === "sm" ? 12 : 14;

  // Branch mode: simple gray badge
  if (isolationMode === "branch") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] ${sizeClasses}`}
        title="Working in main repository using git branches"
        role="status"
        aria-label="Isolation mode: branch"
      >
        <GitBranch size={iconSize} aria-hidden="true" />
        branch
      </span>
    );
  }

  // Worktree mode: status-dependent styling
  const status = worktreeStatus ?? "active";
  const config = STATUS_CONFIG[status];

  // Build tooltip text
  const tooltipLines = [
    `Working in isolated worktree (${config.label})`,
    worktreePath ? `Path: ${worktreePath}` : null,
    status === "stale" ? "Safe to clean up after PR merge" : null,
    status === "orphaned" ? "Worktree needs attention" : null,
  ].filter(Boolean);
  const tooltipText = tooltipLines.join("\n");

  // Build label text
  const labelText = status === "active" ? "worktree" : `worktree (${status})`;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-medium ${config.bgClass} ${config.textClass} ${sizeClasses}`}
      title={tooltipText}
      role="status"
      aria-label={`Isolation mode: worktree, status: ${status}`}
    >
      <FolderGit2 size={iconSize} aria-hidden="true" />
      {labelText}
    </span>
  );
});

export default WorktreeBadge;
