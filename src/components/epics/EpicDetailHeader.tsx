import { useState, useRef, useCallback } from "react";
import {
  Edit3,
  Play,
  ChevronDown,
  GitBranch,
  GitPullRequest,
  ExternalLink,
  Copy,
  Bot,
  Terminal,
  Code2,
  Monitor,
  Github,
} from "lucide-react";
import { useToast } from "../Toast";
import { useClickOutside } from "../../lib/hooks";
import { getPrStatusIconColor, getPrStatusBadgeStyle } from "../../lib/constants";
import type { EpicDetailResult } from "../../api/epics";
import {
  launchClaudeInTerminal,
  launchCodexInTerminal,
  launchVSCodeInTerminal,
  launchCursorInTerminal,
  launchCopilotInTerminal,
  launchOpenCodeInTerminal,
} from "../../api/terminal";
import { getTicketContext } from "../../api/context";
import { useSettings } from "../../lib/hooks";

export interface EpicDetailHeaderProps {
  epic: EpicDetailResult["epic"];
  project: EpicDetailResult["project"];
  ticketsByStatus: EpicDetailResult["ticketsByStatus"];
  workflowState: EpicDetailResult["workflowState"];
  tickets: EpicDetailResult["tickets"];
  onEdit: () => void;
}

export function EpicDetailHeader({
  epic,
  project,
  ticketsByStatus,
  workflowState,
  tickets,
  onEdit,
}: EpicDetailHeaderProps): React.ReactElement {
  const [showLaunchMenu, setShowLaunchMenu] = useState(false);
  const launchMenuRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  const settings = useSettings();

  const ticketsTotal =
    workflowState?.ticketsTotal ?? Object.values(ticketsByStatus).reduce((a, b) => a + b, 0);
  const ticketsDone = workflowState?.ticketsDone ?? ticketsByStatus["done"] ?? 0;
  const completionPercent = ticketsTotal > 0 ? Math.round((ticketsDone / ticketsTotal) * 100) : 0;

  useClickOutside(
    launchMenuRef,
    useCallback(() => setShowLaunchMenu(false), []),
    showLaunchMenu
  );

  const handleCopyBranch = useCallback(() => {
    const branchName = workflowState?.epicBranchName;
    if (branchName) {
      navigator.clipboard.writeText(branchName).then(
        () => {
          showToast("success", "Branch name copied!");
        },
        () => {
          showToast("error", "Failed to copy branch name");
        }
      );
    }
  }, [workflowState, showToast]);

  const handleLaunchInteractive = useCallback(
    async (
      provider:
        | "claude"
        | "codex"
        | "codex-cli"
        | "codex-app"
        | "vscode"
        | "cursor"
        | "copilot"
        | "opencode"
    ) => {
      const launchableTicket = tickets.find((t) => t.status !== "done");
      if (!launchableTicket) {
        showToast("error", "No launchable tickets in this epic (all tickets are done).");
        return;
      }

      setShowLaunchMenu(false);

      try {
        const contextResult = await getTicketContext({ data: launchableTicket.id });
        if (!contextResult) {
          showToast("error", "Failed to get ticket context");
          return;
        }

        const payload = {
          ticketId: launchableTicket.id,
          context: contextResult.context,
          projectPath: contextResult.projectPath,
          preferredTerminal: settings?.settings?.terminalEmulator ?? null,
          projectName: contextResult.projectName,
          epicName: epic.title,
          ticketTitle: contextResult.ticketTitle,
        };

        const launchResult = await (async () => {
          switch (provider) {
            case "claude":
              return launchClaudeInTerminal({ data: payload });
            case "codex":
              return launchCodexInTerminal({ data: { ...payload, launchMode: "auto" } });
            case "codex-cli":
              return launchCodexInTerminal({ data: { ...payload, launchMode: "cli" } });
            case "codex-app":
              return launchCodexInTerminal({ data: { ...payload, launchMode: "app" } });
            case "vscode":
              return launchVSCodeInTerminal({ data: payload });
            case "cursor":
              return launchCursorInTerminal({ data: payload });
            case "copilot":
              return launchCopilotInTerminal({ data: payload });
            case "opencode":
              return launchOpenCodeInTerminal({ data: payload });
          }
        })();

        if (launchResult?.success) {
          showToast("success", `${launchResult.message} (Ticket: ${launchableTicket.title})`);
        } else {
          showToast("error", launchResult.message);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to launch provider";
        showToast("error", errorMessage);
      }
    },
    [tickets, settings, epic.title, showToast]
  );

  const hasLaunchableTickets = tickets.some((t) => t.status !== "done");

  return (
    <header style={containerStyles}>
      <div style={topRowStyles}>
        <div style={titleContainerStyles}>
          <span
            style={{
              display: "inline-block",
              width: 12,
              height: 12,
              borderRadius: "50%",
              backgroundColor: epic.color ?? "var(--accent-primary)",
              flexShrink: 0,
            }}
          />
          <h1 style={titleStyles}>{epic.title}</h1>
        </div>

        <div style={actionsContainerStyles}>
          <button
            type="button"
            onClick={onEdit}
            style={editButtonStyles}
            className="hover:bg-[var(--bg-hover)]"
            aria-label="Edit epic"
          >
            <Edit3 size={16} />
            Edit
          </button>

          <div style={dropdownContainerStyles} ref={launchMenuRef}>
            <button
              type="button"
              onClick={() => setShowLaunchMenu(!showLaunchMenu)}
              disabled={!hasLaunchableTickets}
              style={{
                ...launchButtonStyles,
                opacity: hasLaunchableTickets ? 1 : 0.5,
                cursor: hasLaunchableTickets ? "pointer" : "not-allowed",
              }}
              className="hover:opacity-90"
              aria-expanded={showLaunchMenu}
              aria-haspopup="true"
              aria-label="Launch options"
            >
              <Play size={16} fill="currentColor" />
              Launch
              <ChevronDown
                size={14}
                style={{
                  transition: "transform 0.2s",
                  transform: showLaunchMenu ? "rotate(180deg)" : "rotate(0deg)",
                }}
              />
            </button>

            {showLaunchMenu && hasLaunchableTickets && (
              <div style={dropdownMenuStyles}>
                <div style={dropdownGridStyles}>
                  <div style={dropdownSectionStyles}>
                    <div style={sectionHeaderStyles}>
                      <Terminal size={14} color="var(--success)" />
                      <span style={sectionTitleStyles}>Interactive</span>
                    </div>
                    <div style={buttonGridStyles}>
                      <button
                        type="button"
                        onClick={() => void handleLaunchInteractive("claude")}
                        style={launchOptionButtonStyles}
                      >
                        <Terminal size={14} color="var(--success)" />
                        <span style={optionTextStyles}>Claude</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleLaunchInteractive("codex")}
                        style={launchOptionButtonStyles}
                      >
                        <Terminal size={14} color="var(--success)" />
                        <span style={optionTextStyles}>Codex Auto</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleLaunchInteractive("codex-cli")}
                        style={launchOptionButtonStyles}
                      >
                        <Terminal size={14} color="var(--success)" />
                        <span style={optionTextStyles}>Codex CLI</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleLaunchInteractive("codex-app")}
                        style={launchOptionButtonStyles}
                      >
                        <Code2 size={14} color="var(--success)" />
                        <span style={optionTextStyles}>Codex App</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleLaunchInteractive("vscode")}
                        style={launchOptionButtonStyles}
                      >
                        <Code2 size={14} color="var(--accent-primary)" />
                        <span style={optionTextStyles}>VS Code</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleLaunchInteractive("cursor")}
                        style={launchOptionButtonStyles}
                      >
                        <Monitor size={14} color="var(--warning)" />
                        <span style={optionTextStyles}>Cursor</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleLaunchInteractive("copilot")}
                        style={launchOptionButtonStyles}
                      >
                        <Github size={14} color="var(--text-secondary)" />
                        <span style={optionTextStyles}>Copilot CLI</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleLaunchInteractive("opencode")}
                        style={launchOptionButtonStyles}
                      >
                        <Code2 size={14} color="var(--info)" />
                        <span style={optionTextStyles}>OpenCode</span>
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      ...dropdownSectionStyles,
                      borderLeft: "1px solid var(--border-primary)",
                    }}
                  >
                    <div style={sectionHeaderStyles}>
                      <Bot size={14} color="var(--accent-ai)" />
                      <span style={sectionTitleStyles}>Ralph</span>
                    </div>
                    <div style={buttonGridStyles}>
                      <button
                        type="button"
                        onClick={() => showToast("info", "Ralph launch coming soon")}
                        style={launchOptionButtonStyles}
                      >
                        <Bot size={14} color="var(--accent-ai)" />
                        <span style={optionTextStyles}>Claude</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => showToast("info", "Ralph launch coming soon")}
                        style={launchOptionButtonStyles}
                      >
                        <Terminal size={14} color="var(--success)" />
                        <span style={optionTextStyles}>Codex</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => showToast("info", "Ralph launch coming soon")}
                        style={launchOptionButtonStyles}
                      >
                        <Code2 size={14} color="var(--accent-primary)" />
                        <span style={optionTextStyles}>VS Code</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => showToast("info", "Ralph launch coming soon")}
                        style={launchOptionButtonStyles}
                      >
                        <Monitor size={14} color="var(--warning)" />
                        <span style={optionTextStyles}>Cursor</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => showToast("info", "Ralph launch coming soon")}
                        style={launchOptionButtonStyles}
                      >
                        <Github size={14} color="var(--text-secondary)" />
                        <span style={optionTextStyles}>Copilot CLI</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => showToast("info", "Ralph launch coming soon")}
                        style={launchOptionButtonStyles}
                      >
                        <Code2 size={14} color="var(--accent-ai)" />
                        <span style={optionTextStyles}>OpenCode</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={badgeRowStyles}>
        <span style={badgeStyles}>{project.name}</span>
        <span style={badgeStyles}>
          {ticketsTotal} ticket{ticketsTotal !== 1 ? "s" : ""}
        </span>
        <span style={completionBadgeStyles}>{completionPercent}% complete</span>
      </div>

      {workflowState && (workflowState.epicBranchName || workflowState.prNumber) && (
        <div style={gitRowStyles}>
          {workflowState.epicBranchName && (
            <div style={gitItemStyles}>
              <GitBranch size={14} color="var(--accent-primary)" />
              <code style={branchCodeStyles}>{workflowState.epicBranchName}</code>
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

          {workflowState.prNumber && (
            <div style={gitItemStyles}>
              <GitPullRequest size={14} className={getPrStatusIconColor(workflowState.prStatus)} />
              {workflowState.prUrl ? (
                <a
                  href={workflowState.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={prLinkStyles}
                  className="hover:underline"
                >
                  PR #{workflowState.prNumber}
                  <ExternalLink size={12} style={{ marginLeft: 4 }} />
                </a>
              ) : (
                <span style={{ color: "var(--text-primary)", fontSize: "var(--font-size-sm)" }}>
                  PR #{workflowState.prNumber}
                </span>
              )}
              <span
                style={prStatusBadgeStyles}
                className={getPrStatusBadgeStyle(workflowState.prStatus)}
              >
                {workflowState.prStatus ?? "open"}
              </span>
            </div>
          )}
        </div>
      )}
    </header>
  );
}

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

const titleContainerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-3)",
  flex: 1,
  minWidth: 0,
};

const titleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-2xl)",
  fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  margin: 0,
  lineHeight: 1.3,
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

const launchButtonStyles: React.CSSProperties = {
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
  background: "var(--bg-secondary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-lg)",
  zIndex: 50,
  minWidth: "400px",
};

const dropdownGridStyles: React.CSSProperties = {
  display: "flex",
};

const dropdownSectionStyles: React.CSSProperties = {
  flex: 1,
  padding: "var(--spacing-3)",
};

const sectionHeaderStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  marginBottom: "var(--spacing-2)",
};

const sectionTitleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const buttonGridStyles: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: "var(--spacing-2)",
};

const launchOptionButtonStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-2)",
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  transition: "background-color 0.15s",
};

const optionTextStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-primary)",
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
  background: "var(--bg-tertiary)",
  color: "var(--text-secondary)",
};

const completionBadgeStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "var(--spacing-1) var(--spacing-3)",
  borderRadius: "var(--radius-full)",
  fontSize: "var(--font-size-xs)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  background: "var(--accent-primary)",
  color: "var(--text-on-accent)",
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
