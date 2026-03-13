import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  LoaderCircle,
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
  Search,
} from "lucide-react";
import { useToast } from "../Toast";
import { Modal } from "../ui/Modal";
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
import { queryKeys } from "../../lib/query-keys";
import { useLaunchRalphForEpic, useSettings } from "../../lib/hooks";

export interface EpicDetailHeaderProps {
  epic: EpicDetailResult["epic"];
  project: EpicDetailResult["project"];
  ticketsByStatus: EpicDetailResult["ticketsByStatus"];
  workflowState: EpicDetailResult["workflowState"];
  tickets: EpicDetailResult["tickets"];
  findingsSummary: EpicDetailResult["findingsSummary"];
  criticalFindings: EpicDetailResult["criticalFindings"];
  onShipChanges?: () => void;
  onPushChanges?: () => void | Promise<void>;
  isPushingChanges?: boolean;
  onEdit: () => void;
}

export function EpicDetailHeader({
  epic,
  project,
  ticketsByStatus,
  workflowState,
  tickets,
  findingsSummary,
  criticalFindings,
  onShipChanges,
  onPushChanges,
  isPushingChanges = false,
  onEdit,
}: EpicDetailHeaderProps): React.ReactElement {
  const [showLaunchMenu, setShowLaunchMenu] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showFindingsModal, setShowFindingsModal] = useState(false);
  const [selectedReviewTicketIds, setSelectedReviewTicketIds] = useState<string[]>([]);
  const [reviewSteeringPrompt, setReviewSteeringPrompt] = useState("");
  const [reviewLaunchError, setReviewLaunchError] = useState<string | null>(null);
  const [pendingReviewProvider, setPendingReviewProvider] = useState<string | null>(null);
  const launchMenuRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  const settings = useSettings();
  const queryClient = useQueryClient();
  const launchRalphMutation = useLaunchRalphForEpic();

  const ticketsTotal = Object.values(ticketsByStatus).reduce((a, b) => a + b, 0);
  const ticketsDone = ticketsByStatus["done"] ?? 0;
  const completionPercent = ticketsTotal > 0 ? Math.round((ticketsDone / ticketsTotal) * 100) : 0;
  const hasFindings = findingsSummary.total > 0;
  const openFindings = findingsSummary.total - findingsSummary.fixed;
  const reviewableTickets = tickets
    .filter((ticket) => ticket.status !== "done")
    .sort((left, right) => {
      if (left.id === workflowState?.currentTicketId) return -1;
      if (right.id === workflowState?.currentTicketId) return 1;
      return left.title.localeCompare(right.title);
    });
  const openCriticalCounts = criticalFindings.reduce((counts, finding) => {
    if (finding.status !== "open") {
      return counts;
    }

    counts.set(finding.ticketId, (counts.get(finding.ticketId) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());

  useClickOutside(
    launchMenuRef,
    useCallback(() => setShowLaunchMenu(false), []),
    showLaunchMenu
  );

  const handleOpenReviewModal = useCallback(() => {
    setSelectedReviewTicketIds([]);
    setReviewSteeringPrompt("");
    setReviewLaunchError(null);
    setShowReviewModal(true);
  }, []);

  const handleCloseReviewModal = useCallback(() => {
    setShowReviewModal(false);
    setReviewLaunchError(null);
  }, []);

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
          showToast("error", launchResult?.message ?? "Launch failed");
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to launch provider";
        showToast("error", errorMessage);
      }
    },
    [tickets, settings, epic.title, showToast]
  );

  const handleToggleReviewTicket = useCallback((ticketId: string) => {
    setSelectedReviewTicketIds((currentIds) =>
      currentIds.includes(ticketId)
        ? currentIds.filter((currentId) => currentId !== ticketId)
        : [...currentIds, ticketId]
    );
    setReviewLaunchError(null);
  }, []);

  const handleLaunchFocusedReview = useCallback(
    async (provider: {
      aiBackend: "claude" | "opencode" | "codex";
      workingMethodOverride?: "vscode" | "cursor" | "copilot-cli";
      label: string;
    }): Promise<void> => {
      if (selectedReviewTicketIds.length === 0) {
        setReviewLaunchError("Select at least one ticket to review.");
        return;
      }

      setReviewLaunchError(null);
      setPendingReviewProvider(provider.label);

      try {
        const result = await launchRalphMutation.mutateAsync({
          epicId: epic.id,
          preferredTerminal: settings?.settings?.terminalEmulator ?? null,
          useSandbox: false,
          aiBackend: provider.aiBackend,
          ...(provider.workingMethodOverride !== undefined
            ? { workingMethodOverride: provider.workingMethodOverride }
            : {}),
          launchProfile: {
            type: "review",
            selectedTicketIds: selectedReviewTicketIds,
            steeringPrompt: reviewSteeringPrompt,
          },
        });

        if ("warnings" in result && result.warnings) {
          (result.warnings as string[]).forEach((warning) => showToast("info", warning));
        }

        if (!result.success) {
          setReviewLaunchError(result.message);
          showToast("error", result.message);
          return;
        }

        const selectedTicketTitles = reviewableTickets
          .filter((ticket) => selectedReviewTicketIds.includes(ticket.id))
          .map((ticket) => ticket.title);
        const launchLabel =
          selectedTicketTitles.length === 1
            ? selectedTicketTitles[0]
            : `${selectedTicketTitles.length} tickets`;

        showToast("success", `Focused review launched for ${launchLabel}`);
        setPendingReviewProvider(null);
        setShowReviewModal(false);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.epicDetail(epic.id) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.allTickets }),
          queryClient.invalidateQueries({ queryKey: queryKeys.projectsWithEpics }),
        ]);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to launch focused ticket review";
        setPendingReviewProvider(null);
        setReviewLaunchError(message);
        showToast("error", message);
      }
    },
    [
      epic.id,
      launchRalphMutation,
      queryClient,
      reviewSteeringPrompt,
      reviewableTickets,
      selectedReviewTicketIds,
      settings,
      showToast,
    ]
  );

  const hasLaunchableTickets = tickets.some((t) => t.status !== "done");

  return (
    <>
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
            {workflowState?.epicBranchName && !workflowState.prNumber && onShipChanges && (
              <button
                type="button"
                onClick={onShipChanges}
                style={shipButtonStyles}
                className="hover:opacity-90"
                aria-label="Ship epic changes"
              >
                <GitPullRequest size={16} />
                Ship Changes
              </button>
            )}

            <button
              type="button"
              onClick={handleOpenReviewModal}
              disabled={reviewableTickets.length === 0}
              style={{
                ...secondaryActionButtonStyles,
                opacity: reviewableTickets.length === 0 ? 0.5 : 1,
                cursor: reviewableTickets.length === 0 ? "not-allowed" : "pointer",
              }}
              className="hover:bg-[var(--bg-hover)]"
              aria-label="Review a ticket in this epic"
            >
              <Search size={16} />
              Review Ticket
            </button>

            <button
              type="button"
              onClick={() => setShowFindingsModal(true)}
              style={secondaryActionButtonStyles}
              className="hover:bg-[var(--bg-hover)]"
              aria-label="View review findings for this epic"
            >
              <AlertCircle size={16} />
              {hasFindings ? `Findings (${findingsSummary.total})` : "Findings"}
            </button>

            {workflowState?.prNumber && onPushChanges && (
              <button
                type="button"
                onClick={() => void onPushChanges()}
                disabled={isPushingChanges}
                style={{
                  ...pushButtonStyles,
                  opacity: isPushingChanges ? 0.7 : 1,
                  cursor: isPushingChanges ? "progress" : "pointer",
                }}
                className="hover:bg-[var(--bg-hover)]"
                aria-label="Push epic branch updates"
              >
                {isPushingChanges ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <GitBranch size={16} color="currentColor" />
                )}
                {isPushingChanges ? "Pushing..." : "Push"}
              </button>
            )}

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

        <div style={findingsSectionStyles}>
          <div style={findingsHeaderStyles}>
            <span style={findingsTitleStyles}>Review Findings</span>
            <span style={findingsSubtitleStyles}>
              {hasFindings
                ? `${findingsSummary.total} total findings across this epic`
                : "No review findings recorded for this epic yet"}
            </span>
          </div>

          <div style={findingsSummaryGridStyles}>
            <div style={getSummaryCardStyles("danger")}>
              <span style={summaryCardLabelStyles}>Critical</span>
              <strong style={summaryCardValueStyles}>{findingsSummary.critical}</strong>
            </div>
            <div style={getSummaryCardStyles("warning")}>
              <span style={summaryCardLabelStyles}>Major</span>
              <strong style={summaryCardValueStyles}>{findingsSummary.major}</strong>
            </div>
            <div style={getSummaryCardStyles("info")}>
              <span style={summaryCardLabelStyles}>Minor</span>
              <strong style={summaryCardValueStyles}>{findingsSummary.minor}</strong>
            </div>
            <div style={getSummaryCardStyles("neutral")}>
              <span style={summaryCardLabelStyles}>Suggestions</span>
              <strong style={summaryCardValueStyles}>{findingsSummary.suggestion}</strong>
            </div>
            <div
              style={getSummaryCardStyles(
                openFindings === 0 && hasFindings ? "success" : "neutral"
              )}
            >
              <span style={summaryCardLabelStyles}>Fixed</span>
              <strong style={summaryCardValueStyles}>
                {findingsSummary.fixed}/{findingsSummary.total}
              </strong>
            </div>
          </div>
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
                <GitPullRequest
                  size={14}
                  className={getPrStatusIconColor(workflowState.prStatus)}
                />
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

      <Modal
        isOpen={showReviewModal}
        onClose={handleCloseReviewModal}
        title={`Focused Review: ${epic.title}`}
        maxWidth="xl"
        footer={
          <button type="button" onClick={handleCloseReviewModal} style={modalButtonStyles}>
            Cancel
          </button>
        }
      >
        <div style={modalContentStyles}>
          <p style={modalLeadStyles}>
            Choose the ticket scope for a focused review run. This launches Ralph in review mode for
            the selected ticket set instead of doing a generic implementation relaunch.
          </p>

          {reviewableTickets.length === 0 ? (
            <div style={emptyPanelStyles}>No tickets in this epic can be reviewed right now.</div>
          ) : (
            <div style={reviewFormStyles}>
              <div style={reviewFormSectionStyles}>
                <div style={reviewSectionHeaderStyles}>
                  <strong>Select Tickets</strong>
                  <span style={modalMetaStyles}>
                    Pick the tickets you want Ralph to review from this epic.
                  </span>
                </div>
                <div style={modalListStyles}>
                  {reviewableTickets.map((ticket) => {
                    const openCriticalCount = openCriticalCounts.get(ticket.id) ?? 0;
                    const isSelected = selectedReviewTicketIds.includes(ticket.id);

                    return (
                      <label
                        key={ticket.id}
                        style={{
                          ...reviewTicketOptionStyles,
                          borderColor: isSelected
                            ? "color-mix(in srgb, var(--accent-primary) 45%, var(--border-primary))"
                            : "var(--border-primary)",
                          background: isSelected
                            ? "color-mix(in srgb, var(--accent-primary) 10%, var(--bg-tertiary))"
                            : "var(--bg-tertiary)",
                          cursor: launchRalphMutation.isPending ? "progress" : "pointer",
                          opacity: launchRalphMutation.isPending ? 0.7 : 1,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={launchRalphMutation.isPending}
                          onChange={() => handleToggleReviewTicket(ticket.id)}
                          aria-label={`Select ${ticket.title} for focused review`}
                        />
                        <div style={modalListTextStyles}>
                          <strong>{ticket.title}</strong>
                          <span style={modalMetaStyles}>
                            Status: {ticket.status}
                            {openCriticalCount > 0
                              ? ` • ${openCriticalCount} open critical finding${openCriticalCount === 1 ? "" : "s"}`
                              : " • No open critical findings"}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={reviewFormSectionStyles}>
                <div style={reviewSectionHeaderStyles}>
                  <strong>Review Steering</strong>
                  <span style={modalMetaStyles}>Optional guidance to focus the review.</span>
                </div>
                <label style={reviewTextareaLabelStyles} htmlFor="epic-focused-review-steering">
                  How do you want to steer the review?
                </label>
                <textarea
                  id="epic-focused-review-steering"
                  value={reviewSteeringPrompt}
                  onChange={(event) => {
                    setReviewSteeringPrompt(event.target.value);
                    setReviewLaunchError(null);
                  }}
                  placeholder="Optional: focus on auth edge cases, UX regressions, loading states, silent failures..."
                  disabled={launchRalphMutation.isPending}
                  rows={5}
                  style={reviewTextareaStyles}
                />
                <span style={modalMetaStyles}>
                  Leave this blank to run the focused review with no extra steering.
                </span>
              </div>

              {reviewLaunchError ? (
                <div role="alert" style={reviewErrorStyles}>
                  {reviewLaunchError}
                </div>
              ) : null}

              <div style={reviewFormSectionStyles}>
                <div style={reviewSectionHeaderStyles}>
                  <strong>Launch via Ralph</strong>
                  <span style={modalMetaStyles}>
                    Each selected ticket runs as an isolated review session. The steering prompt
                    above is injected into every session.
                  </span>
                </div>
                <div style={reviewProviderGridStyles}>
                  {[
                    {
                      label: "Claude",
                      aiBackend: "claude" as const,
                      icon: <Bot size={14} className="text-[var(--accent-ai)] flex-shrink-0" />,
                    },
                    {
                      label: "Codex",
                      aiBackend: "codex" as const,
                      icon: <Terminal size={14} className="text-[var(--success)] flex-shrink-0" />,
                    },
                    {
                      label: "VS Code",
                      aiBackend: "claude" as const,
                      workingMethodOverride: "vscode" as const,
                      icon: (
                        <Code2 size={14} className="text-[var(--accent-primary)] flex-shrink-0" />
                      ),
                    },
                    {
                      label: "Cursor",
                      aiBackend: "claude" as const,
                      workingMethodOverride: "cursor" as const,
                      icon: <Monitor size={14} className="text-[var(--warning)] flex-shrink-0" />,
                    },
                    {
                      label: "Copilot CLI",
                      aiBackend: "claude" as const,
                      workingMethodOverride: "copilot-cli" as const,
                      icon: (
                        <Github size={14} className="text-[var(--text-secondary)] flex-shrink-0" />
                      ),
                    },
                    {
                      label: "OpenCode",
                      aiBackend: "opencode" as const,
                      icon: <Code2 size={14} className="text-[var(--accent-ai)] flex-shrink-0" />,
                    },
                  ].map((p) => {
                    const isThisOne = pendingReviewProvider === p.label;
                    const isDisabled =
                      launchRalphMutation.isPending || selectedReviewTicketIds.length === 0;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => void handleLaunchFocusedReview(p)}
                        disabled={isDisabled}
                        style={{
                          ...reviewProviderButtonStyles,
                          opacity: isDisabled ? 0.6 : 1,
                          cursor: isDisabled ? "not-allowed" : "pointer",
                        }}
                      >
                        {isThisOne ? (
                          <LoaderCircle size={14} className="animate-spin flex-shrink-0" />
                        ) : (
                          p.icon
                        )}
                        <span className="text-sm text-[var(--text-primary)]">{p.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showFindingsModal}
        onClose={() => setShowFindingsModal(false)}
        title={`Review Findings: ${epic.title}`}
        maxWidth="xl"
        footer={
          <button
            type="button"
            onClick={() => setShowFindingsModal(false)}
            style={modalButtonStyles}
          >
            Close
          </button>
        }
      >
        <div style={modalContentStyles}>
          <p style={modalLeadStyles}>
            This epic summary rolls up all review findings across its tickets. Critical findings are
            broken out below because they can block progression.
          </p>

          <div style={modalSummaryGridStyles}>
            <div style={getSummaryCardStyles("danger")}>
              <span style={summaryCardLabelStyles}>Critical</span>
              <strong style={summaryCardValueStyles}>{findingsSummary.critical}</strong>
            </div>
            <div style={getSummaryCardStyles("warning")}>
              <span style={summaryCardLabelStyles}>Major</span>
              <strong style={summaryCardValueStyles}>{findingsSummary.major}</strong>
            </div>
            <div style={getSummaryCardStyles("info")}>
              <span style={summaryCardLabelStyles}>Minor</span>
              <strong style={summaryCardValueStyles}>{findingsSummary.minor}</strong>
            </div>
            <div style={getSummaryCardStyles("neutral")}>
              <span style={summaryCardLabelStyles}>Suggestions</span>
              <strong style={summaryCardValueStyles}>{findingsSummary.suggestion}</strong>
            </div>
            <div
              style={getSummaryCardStyles(
                openFindings === 0 && hasFindings ? "success" : "neutral"
              )}
            >
              <span style={summaryCardLabelStyles}>Fixed</span>
              <strong style={summaryCardValueStyles}>
                {findingsSummary.fixed}/{findingsSummary.total}
              </strong>
            </div>
          </div>

          {criticalFindings.length === 0 ? (
            <div style={emptyPanelStyles}>
              {hasFindings
                ? "No critical findings are recorded for this epic."
                : "No review findings are recorded for this epic."}
            </div>
          ) : (
            <div style={modalListStyles}>
              {criticalFindings.map((finding) => (
                <div key={finding.id} style={modalListItemStyles}>
                  <div style={modalListTextStyles}>
                    <strong>{finding.ticketTitle}</strong>
                    <span style={modalMetaStyles}>
                      {finding.status === "open" ? "Open" : "Resolved"} • {finding.agent} •{" "}
                      {finding.category}
                    </span>
                    <span style={modalDescriptionStyles}>{finding.description}</span>
                    {finding.filePath && (
                      <span style={modalMetaStyles}>
                        {finding.filePath}
                        {finding.lineNumber ? `:${finding.lineNumber}` : ""}
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      ...findingStatusStyles,
                      background:
                        finding.status === "open"
                          ? "color-mix(in srgb, var(--accent-danger) 14%, transparent)"
                          : "color-mix(in srgb, var(--success) 14%, transparent)",
                      borderColor:
                        finding.status === "open"
                          ? "color-mix(in srgb, var(--accent-danger) 28%, transparent)"
                          : "color-mix(in srgb, var(--success) 28%, transparent)",
                      color: finding.status === "open" ? "var(--accent-danger)" : "var(--success)",
                    }}
                  >
                    {finding.status === "open" ? "Open" : "Resolved"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

type SummaryTone = "danger" | "warning" | "info" | "success" | "neutral";

function getSummaryCardStyles(tone: SummaryTone): React.CSSProperties {
  const toneStyles: Record<SummaryTone, { background: string; border: string; text: string }> = {
    danger: {
      background: "color-mix(in srgb, var(--accent-danger) 12%, transparent)",
      border: "color-mix(in srgb, var(--accent-danger) 28%, transparent)",
      text: "var(--accent-danger)",
    },
    warning: {
      background: "color-mix(in srgb, var(--warning) 12%, transparent)",
      border: "color-mix(in srgb, var(--warning) 28%, transparent)",
      text: "var(--warning)",
    },
    info: {
      background: "color-mix(in srgb, var(--info) 12%, transparent)",
      border: "color-mix(in srgb, var(--info) 28%, transparent)",
      text: "var(--info)",
    },
    success: {
      background: "color-mix(in srgb, var(--success) 12%, transparent)",
      border: "color-mix(in srgb, var(--success) 28%, transparent)",
      text: "var(--success)",
    },
    neutral: {
      background: "var(--bg-tertiary)",
      border: "var(--border-primary)",
      text: "var(--text-primary)",
    },
  };
  const palette = toneStyles[tone];

  return {
    ...summaryCardStyles,
    background: palette.background,
    borderColor: palette.border,
    color: palette.text,
  };
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

const shipButtonStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-2) var(--spacing-3)",
  background: "var(--success)",
  border: "none",
  borderRadius: "var(--radius-md)",
  color: "var(--text-on-accent)",
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  cursor: "pointer",
  transition: "opacity 0.15s",
};

const secondaryActionButtonStyles: React.CSSProperties = {
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
  transition: "background-color 0.15s",
};

const pushButtonStyles: React.CSSProperties = {
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

const findingsSectionStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-3)",
  padding: "var(--spacing-3)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-lg)",
  background: "var(--bg-secondary)",
};

const findingsHeaderStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-1)",
};

const findingsTitleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
};

const findingsSubtitleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-secondary)",
};

const findingsSummaryGridStyles: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: "var(--spacing-2)",
};

const summaryCardStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-1)",
  padding: "var(--spacing-3)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-md)",
};

const summaryCardLabelStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--text-secondary)",
};

const summaryCardValueStyles: React.CSSProperties = {
  fontSize: "var(--font-size-lg)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "inherit",
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

const modalContentStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-4)",
};

const modalLeadStyles: React.CSSProperties = {
  margin: 0,
  color: "var(--text-secondary)",
  lineHeight: 1.5,
};

const modalSummaryGridStyles: React.CSSProperties = {
  ...findingsSummaryGridStyles,
};

const emptyPanelStyles: React.CSSProperties = {
  padding: "var(--spacing-4)",
  borderRadius: "var(--radius-md)",
  border: "1px dashed var(--border-primary)",
  color: "var(--text-secondary)",
  textAlign: "center",
};

const modalListStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-3)",
};

const modalListItemStyles: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "var(--spacing-3)",
  alignItems: "flex-start",
  padding: "var(--spacing-3)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-primary)",
  background: "var(--bg-tertiary)",
};

const modalListTextStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  flex: 1,
  minWidth: 0,
};

const modalMetaStyles: React.CSSProperties = {
  color: "var(--text-secondary)",
  fontSize: "var(--font-size-sm)",
  lineHeight: 1.4,
};

const modalDescriptionStyles: React.CSSProperties = {
  color: "var(--text-primary)",
  lineHeight: 1.5,
};

const modalButtonStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-2) var(--spacing-3)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-primary)",
  background: "var(--bg-primary)",
  color: "var(--text-primary)",
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  cursor: "pointer",
};

const reviewFormStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-4)",
};

const reviewFormSectionStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-3)",
};

const reviewSectionHeaderStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
};

const reviewTicketOptionStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "var(--spacing-3)",
  padding: "var(--spacing-3)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-primary)",
  transition: "border-color 0.15s, background-color 0.15s, opacity 0.15s",
};

const reviewTextareaLabelStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
};

const reviewTextareaStyles: React.CSSProperties = {
  width: "100%",
  minHeight: "140px",
  resize: "vertical",
  padding: "var(--spacing-3)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-primary)",
  background: "var(--bg-primary)",
  color: "var(--text-primary)",
  font: "inherit",
  lineHeight: 1.5,
};

const reviewErrorStyles: React.CSSProperties = {
  padding: "var(--spacing-3)",
  borderRadius: "var(--radius-md)",
  border: "1px solid color-mix(in srgb, var(--accent-danger) 30%, transparent)",
  background: "color-mix(in srgb, var(--accent-danger) 12%, transparent)",
  color: "var(--accent-danger)",
  lineHeight: 1.5,
};

const reviewProviderGridStyles: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: "var(--spacing-2)",
};

const reviewProviderButtonStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-primary)",
  padding: "var(--spacing-2) var(--spacing-3)",
  textAlign: "left",
  background: "var(--bg-tertiary)",
  transition: "background-color 0.15s",
};

const findingStatusStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 10px",
  borderRadius: "999px",
  border: "1px solid transparent",
  fontSize: "var(--font-size-xs)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  whiteSpace: "nowrap",
};
