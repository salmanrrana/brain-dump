import { type FC, useState, useRef, useCallback } from "react";
import {
  Edit3,
  Play,
  ChevronDown,
  GitBranch,
  GitPullRequest,
  ExternalLink,
  Copy,
  FolderOpen,
} from "lucide-react";
import type { Ticket, Epic } from "../../lib/hooks";
import { useClickOutside } from "../../lib/hooks";
import { useToast } from "../Toast";
import {
  STATUS_BADGE_CONFIG,
  PRIORITY_BADGE_CONFIG,
  getPrStatusIconColor,
  getPrStatusBadgeStyle,
} from "../../lib/constants";
import { LaunchActions, type LaunchType } from "./LaunchActions";
import type { TicketStatus } from "../../api/tickets";

// =============================================================================
// Types
// =============================================================================

export interface TicketDetailHeaderProps {
  /** The ticket to display */
  ticket: Ticket;
  /** Epic this ticket belongs to (for display) */
  epic?: Epic | null;
  /** Handler when Edit button is clicked */
  onEdit: () => void;
  /** Handler when a launch option is selected */
  onLaunch: (type: LaunchType) => void | Promise<void>;
  /** Whether a launch is currently in progress */
  isLaunching?: boolean;
  /** Which launch type is currently in progress */
  launchingType?: LaunchType | null;
}

// =============================================================================
// TicketDetailHeader Component
// =============================================================================

/**
 * TicketDetailHeader - Header section for ticket detail page.
 *
 * Layout:
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Implement user authentication              [Edit] [▶ Start] │
 * │ 🔵 In Progress  🔴 High  📁 Auth Epic                       │
 * │ 🌿 feature/auth  🔗 PR #42                                  │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 *
 * Features:
 * - **Large title**: Ticket title as main heading
 * - **Status/Priority badges**: Using consistent badge styling
 * - **Epic badge**: Shows epic name with color if assigned
 * - **Git info**: Branch name with copy button, PR link with status
 * - **Action buttons**: Edit button and Start Work dropdown
 */
export const TicketDetailHeader: FC<TicketDetailHeaderProps> = ({
  ticket,
  epic,
  onEdit,
  onLaunch,
  isLaunching = false,
  launchingType = null,
}) => {
  const [showLaunchMenu, setShowLaunchMenu] = useState(false);
  const launchMenuRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  // Close launch menu when clicking outside
  useClickOutside(
    launchMenuRef,
    useCallback(() => setShowLaunchMenu(false), []),
    showLaunchMenu
  );

  // Handle launch option selection
  const handleLaunch = useCallback(
    (type: LaunchType) => {
      setShowLaunchMenu(false);
      void onLaunch(type);
    },
    [onLaunch]
  );

  // Copy branch name to clipboard
  const handleCopyBranch = useCallback(() => {
    if (ticket.branchName) {
      navigator.clipboard.writeText(ticket.branchName).then(
        () => {
          showToast("success", "Branch name copied!");
        },
        () => {
          showToast("error", "Failed to copy branch name");
        }
      );
    }
  }, [ticket.branchName, showToast]);

  // Get badge configurations
  const statusConfig = STATUS_BADGE_CONFIG[ticket.status] ?? {
    label: ticket.status,
    className: "bg-slate-700 text-slate-300",
  };

  const priorityConfig = ticket.priority ? PRIORITY_BADGE_CONFIG[ticket.priority] : null;

  // Parse tags if present
  let tags: string[] = [];
  if (ticket.tags) {
    try {
      tags = JSON.parse(ticket.tags) as string[];
    } catch {
      // Invalid JSON in tags field - use empty array
      tags = [];
    }
  }

  return (
    <header style={containerStyles}>
      {/* Top row: Title + Actions */}
      <div style={topRowStyles}>
        <h1 style={titleStyles}>{ticket.title}</h1>

        <div style={actionsContainerStyles}>
          {/* Edit Button */}
          <button
            type="button"
            onClick={onEdit}
            style={editButtonStyles}
            className="hover:bg-[var(--bg-hover)]"
            aria-label="Edit ticket"
          >
            <Edit3 size={16} />
            Edit
          </button>

          {/* Start Work Dropdown */}
          <div style={dropdownContainerStyles} ref={launchMenuRef}>
            <button
              type="button"
              onClick={() => setShowLaunchMenu(!showLaunchMenu)}
              disabled={isLaunching}
              style={{
                ...startButtonStyles,
                opacity: isLaunching ? 0.7 : 1,
                cursor: isLaunching ? "not-allowed" : "pointer",
              }}
              className="hover:opacity-90"
              aria-expanded={showLaunchMenu}
              aria-haspopup="true"
              aria-label="Start work options"
            >
              <Play size={16} fill="currentColor" />
              Start Work
              <ChevronDown
                size={14}
                style={{
                  transition: "transform 0.2s",
                  transform: showLaunchMenu ? "rotate(180deg)" : "rotate(0deg)",
                }}
              />
            </button>

            {/* Launch Actions Dropdown */}
            {showLaunchMenu && (
              <div style={dropdownMenuStyles}>
                <LaunchActions
                  ticketStatus={ticket.status as TicketStatus}
                  onLaunch={handleLaunch}
                  isLaunching={isLaunching}
                  launchingType={launchingType}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Badge row: Status, Priority, Epic, Tags */}
      <div style={badgeRowStyles}>
        {/* Status Badge */}
        <span
          style={badgeStyles}
          className={statusConfig.className}
          data-testid="ticket-status-badge"
        >
          {statusConfig.label}
        </span>

        {/* Priority Badge */}
        {priorityConfig && (
          <span
            style={badgeStyles}
            className={priorityConfig.className}
            data-testid="ticket-priority-badge"
          >
            {priorityConfig.label}
          </span>
        )}

        {/* Epic Badge */}
        {epic && (
          <span
            style={{
              ...badgeStyles,
              background: epic.color ? `${epic.color}20` : "var(--bg-tertiary)",
              color: epic.color ?? "var(--text-secondary)",
              border: epic.color ? `1px solid ${epic.color}40` : "1px solid var(--border-primary)",
            }}
            data-testid="ticket-epic-badge"
          >
            <FolderOpen size={12} style={{ marginRight: "4px" }} />
            {epic.title}
          </span>
        )}

        {/* Tags */}
        {tags.map((tag) => (
          <span key={tag} style={tagBadgeStyles}>
            {tag}
          </span>
        ))}
      </div>

      {/* Git info row: Branch, PR */}
      {(ticket.branchName || ticket.prNumber) && (
        <div style={gitRowStyles}>
          {/* Branch Name */}
          {ticket.branchName && (
            <div style={gitItemStyles}>
              <GitBranch size={14} style={{ color: "var(--accent-primary)" }} />
              <code style={branchCodeStyles}>{ticket.branchName}</code>
              <button
                type="button"
                onClick={handleCopyBranch}
                style={copyButtonStyles}
                className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                title="Copy branch name"
                aria-label="Copy branch name"
              >
                <Copy size={12} />
              </button>
            </div>
          )}

          {/* PR Link */}
          {ticket.prNumber && (
            <div style={gitItemStyles}>
              <GitPullRequest size={14} className={getPrStatusIconColor(ticket.prStatus)} />
              {ticket.prUrl ? (
                <a
                  href={ticket.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={prLinkStyles}
                  className="hover:underline"
                >
                  PR #{ticket.prNumber}
                  <ExternalLink size={12} style={{ marginLeft: "4px" }} />
                </a>
              ) : (
                <span style={{ color: "var(--text-primary)", fontSize: "var(--font-size-sm)" }}>
                  PR #{ticket.prNumber}
                </span>
              )}
              <span style={prStatusBadgeStyles} className={getPrStatusBadgeStyle(ticket.prStatus)}>
                {ticket.prStatus ?? "open"}
              </span>
            </div>
          )}
        </div>
      )}
    </header>
  );
};

// =============================================================================
// Styles
// =============================================================================

const containerStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-3)",
  paddingBottom: "var(--spacing-4)",
  borderBottom: "1px solid var(--border-primary)",
};

const topRowStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "var(--spacing-4)",
};

const titleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-2xl)",
  fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  margin: 0,
  lineHeight: 1.3,
  flex: 1,
};

const actionsContainerStyles: React.CSSProperties = {
  display: "flex",
  gap: "var(--spacing-2)",
  flexShrink: 0,
};

const editButtonStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-2) var(--spacing-3)",
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-md)",
  color: "var(--text-primary)",
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  cursor: "pointer",
  transition: "background-color 0.15s",
};

const startButtonStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-2) var(--spacing-3)",
  background: "var(--accent-primary)",
  border: "none",
  borderRadius: "var(--radius-md)",
  color: "var(--text-on-accent)",
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  cursor: "pointer",
  transition: "opacity 0.15s",
};

const dropdownContainerStyles: React.CSSProperties = {
  position: "relative",
};

const dropdownMenuStyles: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  right: 0,
  marginTop: "var(--spacing-2)",
  padding: "var(--spacing-3)",
  background: "var(--bg-secondary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-lg)",
  zIndex: 50,
  minWidth: "320px",
};

const badgeRowStyles: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--spacing-2)",
  alignItems: "center",
};

const badgeStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "var(--spacing-1) var(--spacing-3)",
  borderRadius: "var(--radius-full)",
  fontSize: "var(--font-size-xs)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
};

const tagBadgeStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "var(--spacing-1) var(--spacing-2)",
  borderRadius: "var(--radius-sm)",
  fontSize: "var(--font-size-xs)",
  background: "var(--bg-tertiary)",
  color: "var(--text-secondary)",
};

const gitRowStyles: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--spacing-4)",
  alignItems: "center",
  paddingTop: "var(--spacing-2)",
};

const gitItemStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
};

const branchCodeStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  fontFamily: "var(--font-mono)",
  color: "var(--text-primary)",
  background: "var(--bg-tertiary)",
  padding: "var(--spacing-1) var(--spacing-2)",
  borderRadius: "var(--radius-sm)",
};

const copyButtonStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--spacing-1)",
  background: "transparent",
  border: "none",
  borderRadius: "var(--radius-sm)",
  color: "var(--text-muted)",
  cursor: "pointer",
  transition: "background-color 0.15s, color 0.15s",
};

const prLinkStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  color: "var(--accent-primary)",
  fontSize: "var(--font-size-sm)",
  textDecoration: "none",
};

const prStatusBadgeStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  padding: "2px 8px",
  borderRadius: "var(--radius-sm)",
  marginLeft: "var(--spacing-2)",
};

export default TicketDetailHeader;
