import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FolderGit2,
  GitBranch,
  GitPullRequest,
  LoaderCircle,
  RefreshCcw,
} from "lucide-react";
import { Modal } from "../ui/Modal";
import { useToast } from "../Toast";
import {
  commitAndShipServerFn,
  generatePrBodyServerFn,
  getShipPrep,
  type ShipMutationStep,
  type ShipPrepData,
} from "../../api/ship-server-fns";
import { startEpicWorkflowFn, startTicketWorkflowFn } from "../../api/workflow-server-fns";

type ShipChangesView = "preflight" | "blocked-main" | "existing-pr" | "running" | "done" | "error";

interface ShipResult {
  commitHash: string;
  prNumber: number;
  prUrl: string;
}

interface VisibleError {
  step: ShipMutationStep | "load" | "branch";
  message: string;
}

interface RunningStepDefinition {
  id: Exclude<ShipMutationStep, "validate" | "persist">;
  label: string;
  description: string;
}

export interface ShipChangesModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectPath: string;
  scopeType: "ticket" | "epic";
  scopeId: string;
  scopeTitle: string;
  branchName?: string | undefined;
  onSuccess: (prUrl: string) => void;
}

function getRunningSteps(hasChangedFiles: boolean): RunningStepDefinition[] {
  return hasChangedFiles
    ? [
        {
          id: "stage",
          label: "Stage repository changes",
          description: "Preparing all current changes for the new commit.",
        },
        {
          id: "commit",
          label: "Create commit",
          description: "Recording the current repository changes with your commit message.",
        },
        {
          id: "push",
          label: "Push branch",
          description: "Sending the current branch to the remote.",
        },
        {
          id: "pr",
          label: "Create pull request",
          description: "Opening the pull request with the generated body.",
        },
      ]
    : [
        {
          id: "stage",
          label: "Confirm clean branch",
          description: "Verifying there are no uncommitted changes left to ship.",
        },
        {
          id: "commit",
          label: "Reuse HEAD commit",
          description: "Using the existing branch commit instead of creating a new one.",
        },
        {
          id: "push",
          label: "Push branch",
          description: "Sending the current branch to the remote.",
        },
        {
          id: "pr",
          label: "Create pull request",
          description: "Opening the pull request with the generated body.",
        },
      ];
}

function getScopeInput(
  scopeType: ShipChangesModalProps["scopeType"],
  scopeId: string
): { ticketId: string } | { epicId: string } {
  return scopeType === "ticket" ? { ticketId: scopeId } : { epicId: scopeId };
}

function getDefaultCommitMessage(scopeId: string, scopeTitle: string): string {
  return `feat(${scopeId.slice(0, 8)}): ${scopeTitle}`;
}

function getDefaultPrTitle(scopeTitle: string): string {
  return scopeTitle;
}

function getNextView(prep: ShipPrepData): ShipChangesView {
  if (!prep.isSafeToShip) {
    return "blocked-main";
  }

  if (prep.existingPr) {
    return "existing-pr";
  }

  return "preflight";
}

function getStepLabel(step: VisibleError["step"]): string {
  switch (step) {
    case "load":
      return "Loading preflight data";
    case "branch":
      return "Create feature branch";
    case "validate":
      return "Validate request";
    case "stage":
      return "Stage files";
    case "commit":
      return "Create commit";
    case "push":
      return "Push branch";
    case "pr":
      return "Create pull request";
    case "persist":
      return "Persist workflow metadata";
  }
}

function getCheckTone(value: boolean): {
  color: string;
  background: string;
  border: string;
  icon: ReactNode;
  label: string;
} {
  if (value) {
    return {
      color: "var(--success)",
      background: "color-mix(in srgb, var(--success) 12%, transparent)",
      border: "color-mix(in srgb, var(--success) 28%, transparent)",
      icon: <CheckCircle2 size={16} aria-hidden="true" />,
      label: "Passing",
    };
  }

  return {
    color: "var(--accent-danger)",
    background: "color-mix(in srgb, var(--accent-danger) 12%, transparent)",
    border: "color-mix(in srgb, var(--accent-danger) 28%, transparent)",
    icon: <AlertCircle size={16} aria-hidden="true" />,
    label: "Blocked",
  };
}

export function ShipChangesModal({
  isOpen,
  onClose,
  projectPath,
  scopeType,
  scopeId,
  scopeTitle,
  branchName,
  onSuccess,
}: ShipChangesModalProps): ReactElement | null {
  const { showToast } = useToast();

  const [view, setView] = useState<ShipChangesView>("preflight");
  const [prepData, setPrepData] = useState<ShipPrepData | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");
  const [draftPr, setDraftPr] = useState(true);
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [visibleError, setVisibleError] = useState<VisibleError | null>(null);
  const [shipResult, setShipResult] = useState<ShipResult | null>(null);
  const [isLoadingPreflight, setIsLoadingPreflight] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [activeRunningStep, setActiveRunningStep] = useState<RunningStepDefinition["id"]>("stage");

  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const didReportSuccessRef = useRef(false);
  const didInitializeFormRef = useRef(false);

  const effectiveBranchName = prepData?.currentBranch || branchName || "Unknown branch";
  const hasChangedFiles = (prepData?.changedFiles.length ?? 0) > 0;
  const runningSteps = useMemo(() => getRunningSteps(hasChangedFiles), [hasChangedFiles]);
  const canShip =
    view === "preflight" &&
    !isLoadingPreflight &&
    !isSubmitting &&
    Boolean(prepData?.ghAvailable) &&
    Boolean(prepData?.remoteConfigured);

  const checkRows = useMemo(() => {
    if (!prepData) {
      return [];
    }

    return [
      {
        label: "Branch safety",
        detail: prepData.isSafeToShip
          ? `${prepData.currentBranch} can be shipped`
          : `${prepData.currentBranch} is protected`,
        tone: getCheckTone(prepData.isSafeToShip),
      },
      {
        label: "GitHub CLI",
        detail: prepData.ghAvailable ? "gh is available" : "gh is not installed or not on PATH",
        tone: getCheckTone(prepData.ghAvailable),
      },
      {
        label: "Git remote",
        detail: prepData.remoteConfigured ? "Remote configured" : "No remote configured",
        tone: getCheckTone(prepData.remoteConfigured),
      },
    ];
  }, [prepData]);

  const stopProgressAnimation = useCallback(function stopProgressAnimation(): void {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  const startProgressAnimation = useCallback(
    function startProgressAnimation(): void {
      stopProgressAnimation();
      setActiveRunningStep("stage");

      let stepIndex = 0;
      progressTimerRef.current = setInterval(() => {
        stepIndex = Math.min(stepIndex + 1, runningSteps.length - 1);
        const nextStep = runningSteps[stepIndex];
        if (nextStep) {
          setActiveRunningStep(nextStep.id);
        }

        if (stepIndex >= runningSteps.length - 1) {
          stopProgressAnimation();
        }
      }, 700);
    },
    [runningSteps, stopProgressAnimation]
  );

  const loadPreflight = useCallback(
    async function loadPreflight(resetForm: boolean): Promise<void> {
      setIsLoadingPreflight(true);
      setVisibleError(null);

      try {
        const scopeInput = getScopeInput(scopeType, scopeId);
        const [prepResult, bodyResult] = await Promise.all([
          getShipPrep({ data: scopeInput }),
          generatePrBodyServerFn({ data: { scopeType, scopeId } }),
        ]);

        if (!prepResult.success) {
          throw new Error(prepResult.error);
        }

        if (!bodyResult.success) {
          throw new Error(bodyResult.error);
        }

        setPrepData(prepResult);

        if (resetForm || !didInitializeFormRef.current) {
          setCommitMessage(getDefaultCommitMessage(scopeId, scopeTitle));
          setPrTitle(getDefaultPrTitle(scopeTitle));
          setPrBody(bodyResult.body);
          didInitializeFormRef.current = true;
        }

        if (resetForm) {
          setDraftPr(true);
          setBodyExpanded(false);
          setShipResult(null);
          didReportSuccessRef.current = false;
        }

        setView(getNextView(prepResult));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load ship preflight data.";
        setVisibleError({ step: "load", message });
        setView("error");
      } finally {
        setIsLoadingPreflight(false);
      }
    },
    [scopeId, scopeTitle, scopeType]
  );

  useEffect(() => {
    if (!isOpen) {
      stopProgressAnimation();
      return;
    }

    setView("preflight");
    setPrepData(null);
    setCommitMessage("");
    setPrTitle("");
    setPrBody("");
    setDraftPr(true);
    setBodyExpanded(false);
    setVisibleError(null);
    setShipResult(null);
    setIsSubmitting(false);
    setIsCreatingBranch(false);
    setActiveRunningStep("stage");
    didReportSuccessRef.current = false;
    didInitializeFormRef.current = false;

    void loadPreflight(true);

    return () => {
      stopProgressAnimation();
    };
  }, [isOpen, loadPreflight, stopProgressAnimation]);

  const handleRequestClose = useCallback(
    function handleRequestClose(): void {
      if (view === "running") {
        return;
      }

      if (view === "done" && shipResult && !didReportSuccessRef.current) {
        didReportSuccessRef.current = true;
        onSuccess(shipResult.prUrl);
      }

      onClose();
    },
    [onClose, onSuccess, shipResult, view]
  );

  const handleCreateBranch = useCallback(
    async function handleCreateBranch(): Promise<void> {
      setIsCreatingBranch(true);
      setVisibleError(null);

      try {
        const result =
          scopeType === "ticket"
            ? await startTicketWorkflowFn({ data: { ticketId: scopeId, projectPath } })
            : await startEpicWorkflowFn({ data: { epicId: scopeId, projectPath } });

        if (!result.success) {
          setVisibleError({ step: "branch", message: result.error });
          return;
        }

        result.warnings.forEach((warning) => showToast("info", warning));
        showToast(
          "success",
          result.branchCreated
            ? `Created ${result.branchName}`
            : `Using existing branch ${result.branchName}`
        );

        await loadPreflight(false);
      } catch (error) {
        setVisibleError({
          step: "branch",
          message: error instanceof Error ? error.message : "Failed to create feature branch.",
        });
      } finally {
        setIsCreatingBranch(false);
      }
    },
    [loadPreflight, projectPath, scopeId, scopeType, showToast]
  );

  const handleShip = useCallback(
    async function handleShip(): Promise<void> {
      if (!prepData || !canShip) {
        return;
      }

      setIsSubmitting(true);
      setVisibleError(null);
      setView("running");
      startProgressAnimation();

      try {
        const result = await commitAndShipServerFn({
          data: {
            scopeType,
            scopeId,
            message: hasChangedFiles
              ? commitMessage.trim() || getDefaultCommitMessage(scopeId, scopeTitle)
              : "",
            selectedPaths: hasChangedFiles ? prepData.changedFiles.map((file) => file.path) : [],
            prTitle: prTitle.trim() || getDefaultPrTitle(scopeTitle),
            prBody,
            draft: draftPr,
          },
        });

        stopProgressAnimation();

        if (!result.success) {
          setActiveRunningStep(
            result.step === "validate" || result.step === "persist" ? "stage" : result.step
          );
          setVisibleError({
            step: result.step,
            message: result.error,
          });
          setView("error");
          return;
        }

        setShipResult(result);
        setView("done");
      } catch (error) {
        stopProgressAnimation();
        setVisibleError({
          step: "validate",
          message: error instanceof Error ? error.message : "Ship request failed unexpectedly.",
        });
        setView("error");
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      canShip,
      commitMessage,
      draftPr,
      hasChangedFiles,
      prepData,
      prBody,
      prTitle,
      scopeId,
      scopeTitle,
      scopeType,
      startProgressAnimation,
      stopProgressAnimation,
    ]
  );

  const handleRetry = useCallback(
    async function handleRetry(): Promise<void> {
      await loadPreflight(false);
    },
    [loadPreflight]
  );

  const handleCopy = useCallback(
    async function handleCopy(value: string, label: string): Promise<void> {
      try {
        await navigator.clipboard.writeText(value);
        showToast("success", `${label} copied`);
      } catch {
        showToast("error", `Failed to copy ${label.toLowerCase()}`);
      }
    },
    [showToast]
  );

  const handleOpenPr = useCallback(
    function handleOpenPr(): void {
      if (shipResult?.prUrl) {
        window.open(shipResult.prUrl, "_blank", "noopener,noreferrer");
      }
    },
    [shipResult]
  );

  const handleKeyDown = useCallback(
    function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
      if (event.key !== "Enter" || !canShip || view !== "preflight") {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLButtonElement ||
        target instanceof HTMLAnchorElement
      ) {
        return;
      }

      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      if (target.type === "checkbox") {
        return;
      }

      if (target.getAttribute("role") === "button") {
        return;
      }

      event.preventDefault();
      void handleShip();
    },
    [canShip, handleShip, view]
  );

  if (!isOpen) {
    return null;
  }

  const footer =
    view === "done" || view === "existing-pr" ? (
      <div style={footerRowStyles}>
        <button type="button" onClick={handleRequestClose} style={primaryButtonStyles}>
          Close
        </button>
      </div>
    ) : (
      <div style={footerRowStyles}>
        <button
          type="button"
          onClick={handleRequestClose}
          disabled={view === "running" || isSubmitting}
          style={{
            ...secondaryButtonStyles,
            opacity: view === "running" || isSubmitting ? 0.6 : 1,
            cursor: view === "running" || isSubmitting ? "not-allowed" : "pointer",
          }}
        >
          Cancel
        </button>
        {view === "preflight" && (
          <button
            type="button"
            onClick={() => void handleShip()}
            disabled={!canShip}
            style={{
              ...primaryButtonStyles,
              opacity: canShip ? 1 : 0.55,
              cursor: canShip ? "pointer" : "not-allowed",
            }}
          >
            {isSubmitting ? "Shipping..." : "Ship Changes"}
          </button>
        )}
      </div>
    );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleRequestClose}
      title={`Ship Changes: ${scopeTitle}`}
      maxWidth="2xl"
      footer={footer}
      testId="ship-changes-modal"
    >
      <div onKeyDown={handleKeyDown} style={contentColumnStyles}>
        <div style={heroStyles}>
          <div style={heroBadgeStyles}>
            <FolderGit2 size={14} aria-hidden="true" />
            {scopeType === "epic" ? "Epic Ship Flow" : "Ticket Ship Flow"}
          </div>
          <div>
            <h3 style={sectionHeadingStyles}>Prepare commit, push, and PR from one modal</h3>
            <p style={supportTextStyles}>
              Review the current branch state, confirm what will be shipped, then create the pull
              request with visible progress and failure feedback.
            </p>
          </div>
        </div>

        {visibleError && (
          <div role="alert" style={errorBannerStyles} data-testid="ship-error-banner">
            <AlertCircle size={18} aria-hidden="true" />
            <div>
              <strong>{getStepLabel(visibleError.step)}</strong>
              <div>{visibleError.message}</div>
            </div>
          </div>
        )}

        {(view === "preflight" || view === "blocked-main") && (
          <>
            <section style={panelStyles}>
              <div style={panelHeaderStyles}>
                <div>
                  <h4 style={panelTitleStyles}>Preflight checks</h4>
                  <p style={panelBodyStyles}>
                    Current branch: <strong>{effectiveBranchName}</strong>
                  </p>
                </div>
                {isLoadingPreflight && (
                  <div style={loadingPillStyles}>
                    <LoaderCircle size={14} className="spin" aria-hidden="true" />
                    Checking…
                  </div>
                )}
              </div>

              <div style={checksGridStyles}>
                {checkRows.map((row) => (
                  <div
                    key={row.label}
                    style={{
                      ...checkCardStyles,
                      color: row.tone.color,
                      background: row.tone.background,
                      borderColor: row.tone.border,
                    }}
                  >
                    <div style={checkTitleRowStyles}>
                      {row.tone.icon}
                      <span style={checkLabelStyles}>{row.label}</span>
                    </div>
                    <div style={checkDetailStyles}>{row.detail}</div>
                    <div style={checkStateStyles}>{row.tone.label}</div>
                  </div>
                ))}
              </div>
            </section>

            {view === "blocked-main" && (
              <section style={blockedPanelStyles} data-testid="ship-blocked-main">
                <div style={blockedHeaderStyles}>
                  <GitBranch size={20} aria-hidden="true" />
                  <div>
                    <h4 style={panelTitleStyles}>Protected branch</h4>
                    <p style={panelBodyStyles}>
                      Direct shipping from <strong>{effectiveBranchName}</strong> is blocked. Create
                      or reuse a feature branch, then continue from there.
                    </p>
                  </div>
                </div>
                <div style={actionRowStyles}>
                  <button
                    type="button"
                    onClick={() => void handleCreateBranch()}
                    disabled={isCreatingBranch}
                    style={primaryButtonStyles}
                  >
                    <GitBranch size={16} aria-hidden="true" />
                    {isCreatingBranch ? "Preparing branch…" : "Create feature branch and continue"}
                  </button>
                </div>
              </section>
            )}

            <section style={panelStyles}>
              <div style={panelHeaderStyles}>
                <div>
                  <h4 style={panelTitleStyles}>Repository changes</h4>
                  <p style={panelBodyStyles}>
                    {hasChangedFiles
                      ? "All current tracked and untracked changes will be included in the new commit."
                      : "No uncommitted files are waiting to be staged. Ship Changes will reuse the current branch state instead of creating a new commit."}
                  </p>
                </div>
              </div>

              {!prepData && isLoadingPreflight ? (
                <div style={emptyStateStyles}>Loading changed files…</div>
              ) : prepData?.changedFiles.length ? (
                <div style={fileListStyles}>
                  {prepData.changedFiles.map((file) => (
                    <div key={file.path} style={fileRowStyles}>
                      <code style={statusCodeStyles}>{file.status}</code>
                      <span style={filePathStyles}>{file.path}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={emptyStateStyles}>
                  No changed files found in the repository. Ship Changes will reuse the current
                  branch state and create a PR from the existing HEAD commit.
                </div>
              )}
            </section>

            <section style={panelStyles}>
              <div style={formGridStyles}>
                {hasChangedFiles ? (
                  <label style={fieldLabelStyles}>
                    Commit message
                    <input
                      type="text"
                      value={commitMessage}
                      onChange={(event) => setCommitMessage(event.target.value)}
                      disabled={view !== "preflight"}
                      style={textInputStyles}
                      placeholder={getDefaultCommitMessage(scopeId, scopeTitle)}
                    />
                  </label>
                ) : (
                  <div style={fieldLabelStyles}>
                    Existing HEAD commit
                    <div style={readOnlyValueStyles} data-testid="ship-head-commit-message">
                      {prepData?.headCommit?.message ??
                        "No existing branch commit could be read yet. A PR cannot be created until the branch has at least one commit."}
                    </div>
                    <div style={fieldHintStyles}>
                      No new commit will be created from this modal while the branch is clean.
                    </div>
                  </div>
                )}
                <label style={fieldLabelStyles}>
                  PR title
                  <input
                    type="text"
                    value={prTitle}
                    onChange={(event) => setPrTitle(event.target.value)}
                    disabled={view !== "preflight"}
                    style={textInputStyles}
                    placeholder={getDefaultPrTitle(scopeTitle)}
                  />
                </label>
              </div>

              <div style={checkboxRowStyles}>
                <label style={checkboxLabelStyles}>
                  <input
                    type="checkbox"
                    checked={draftPr}
                    onChange={(event) => setDraftPr(event.target.checked)}
                    disabled={view !== "preflight"}
                  />
                  Create as draft PR
                </label>
              </div>

              <div style={prBodySectionStyles}>
                <button
                  type="button"
                  onClick={() => setBodyExpanded((current) => !current)}
                  style={collapsibleButtonStyles}
                  aria-expanded={bodyExpanded}
                >
                  <span>Pull request body</span>
                  {bodyExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {bodyExpanded && (
                  <textarea
                    value={prBody}
                    onChange={(event) => setPrBody(event.target.value)}
                    disabled={view !== "preflight"}
                    style={textareaStyles}
                    rows={14}
                  />
                )}
              </div>
            </section>
          </>
        )}

        {view === "existing-pr" && prepData?.existingPr && (
          <section style={successPanelStyles} data-testid="ship-existing-pr-state">
            <div style={blockedHeaderStyles}>
              <GitPullRequest size={24} color="var(--accent-primary)" aria-hidden="true" />
              <div>
                <h4 style={panelTitleStyles}>Pull request already exists</h4>
                <p style={panelBodyStyles}>
                  This {scopeType} already has PR #{prepData.existingPr.number} linked. Use the push
                  action from the page header if you need to send more commits.
                </p>
              </div>
            </div>

            <div style={successValueGridStyles}>
              <div style={successValueCardStyles}>
                <span style={successLabelStyles}>Linked pull request</span>
                <code style={successCodeStyles}>#{prepData.existingPr.number}</code>
                <div style={actionRowStyles}>
                  {prepData.existingPr.url && (
                    <button
                      type="button"
                      onClick={() => void handleCopy(prepData.existingPr!.url!, "PR URL")}
                      style={secondaryButtonStyles}
                    >
                      <Copy size={16} aria-hidden="true" />
                      Copy URL
                    </button>
                  )}
                  {prepData.existingPr.url && (
                    <button
                      type="button"
                      onClick={() =>
                        window.open(prepData.existingPr?.url ?? "", "_blank", "noopener,noreferrer")
                      }
                      style={primaryButtonStyles}
                    >
                      <ExternalLink size={16} aria-hidden="true" />
                      Open PR
                    </button>
                  )}
                </div>
              </div>
              <div style={successValueCardStyles}>
                <span style={successLabelStyles}>Status</span>
                <code style={successCodeStyles}>{prepData.existingPr.status ?? "open"}</code>
                <div style={panelBodyStyles}>
                  The linked PR state is tracked outside this modal.
                </div>
              </div>
            </div>
          </section>
        )}

        {view === "running" && (
          <section style={panelStyles} data-testid="ship-running-state">
            <div style={runningHeaderStyles}>
              <LoaderCircle size={20} className="spin" aria-hidden="true" />
              <div>
                <h4 style={panelTitleStyles}>Shipping changes</h4>
                <p style={panelBodyStyles}>
                  This modal stays open until commit, push, and PR creation finish.
                </p>
              </div>
            </div>
            <div style={runningStepListStyles}>
              {runningSteps.map((step, index) => {
                const activeIndex = runningSteps.findIndex((item) => item.id === activeRunningStep);
                const isDone = index < activeIndex;
                const isActive = index === activeIndex;

                return (
                  <div
                    key={step.id}
                    style={{
                      ...runningStepStyles,
                      borderColor: isActive
                        ? "color-mix(in srgb, var(--accent-primary) 40%, transparent)"
                        : "var(--border-primary)",
                      background: isActive
                        ? "color-mix(in srgb, var(--accent-primary) 10%, transparent)"
                        : "var(--bg-tertiary)",
                    }}
                  >
                    <div style={runningStepIconStyles}>
                      {isDone ? (
                        <CheckCircle2 size={16} color="var(--success)" aria-hidden="true" />
                      ) : isActive ? (
                        <LoaderCircle
                          size={16}
                          className="spin"
                          color="var(--accent-primary)"
                          aria-hidden="true"
                        />
                      ) : (
                        <div style={runningStepDotStyles} />
                      )}
                    </div>
                    <div>
                      <div style={runningStepLabelStyles}>{step.label}</div>
                      <div style={runningStepDescriptionStyles}>{step.description}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {view === "done" && shipResult && (
          <section style={successPanelStyles} data-testid="ship-done-state">
            <div style={blockedHeaderStyles}>
              <CheckCircle2 size={24} color="var(--success)" aria-hidden="true" />
              <div>
                <h4 style={panelTitleStyles}>Pull request created</h4>
                <p style={panelBodyStyles}>
                  The branch was pushed and the pull request is ready for review.
                </p>
              </div>
            </div>

            <div style={successValueGridStyles}>
              <div style={successValueCardStyles}>
                <span style={successLabelStyles}>Commit hash</span>
                <code style={successCodeStyles}>{shipResult.commitHash}</code>
                <button
                  type="button"
                  onClick={() => void handleCopy(shipResult.commitHash, "Commit hash")}
                  style={secondaryButtonStyles}
                >
                  <Copy size={16} aria-hidden="true" />
                  Copy commit
                </button>
              </div>
              <div style={successValueCardStyles}>
                <span style={successLabelStyles}>Pull request</span>
                <code style={successCodeStyles}>#{shipResult.prNumber}</code>
                <div style={actionRowStyles}>
                  <button
                    type="button"
                    onClick={() => void handleCopy(shipResult.prUrl, "PR URL")}
                    style={secondaryButtonStyles}
                  >
                    <Copy size={16} aria-hidden="true" />
                    Copy URL
                  </button>
                  <button type="button" onClick={handleOpenPr} style={primaryButtonStyles}>
                    <ExternalLink size={16} aria-hidden="true" />
                    Open PR
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {view === "error" && (
          <section style={panelStyles} data-testid="ship-error-state">
            <div style={blockedHeaderStyles}>
              <AlertCircle size={20} color="var(--accent-danger)" aria-hidden="true" />
              <div>
                <h4 style={panelTitleStyles}>Shipping failed</h4>
                <p style={panelBodyStyles}>
                  The failure stays visible here until you retry back to preflight.
                </p>
              </div>
            </div>

            <div style={errorDetailsStyles}>
              <div>
                <strong>Failed step</strong>
                <div>{visibleError ? getStepLabel(visibleError.step) : "Unknown step"}</div>
              </div>
              <div>
                <strong>Details</strong>
                <div>{visibleError?.message ?? "No error details were provided."}</div>
              </div>
            </div>

            <div style={actionRowStyles}>
              <button type="button" onClick={() => void handleRetry()} style={primaryButtonStyles}>
                <RefreshCcw size={16} aria-hidden="true" />
                Retry from preflight
              </button>
            </div>
          </section>
        )}

        <style>{`
          .spin {
            animation: ship-changes-spin 0.9s linear infinite;
          }

          @keyframes ship-changes-spin {
            from {
              transform: rotate(0deg);
            }

            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    </Modal>
  );
}

const contentColumnStyles: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-4)",
};

const heroStyles: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-4)",
  borderRadius: "var(--radius-lg)",
  border: "1px solid color-mix(in srgb, var(--accent-primary) 20%, transparent)",
  background:
    "linear-gradient(135deg, color-mix(in srgb, var(--accent-primary) 14%, transparent), transparent 70%)",
};

const heroBadgeStyles: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  alignSelf: "flex-start",
  padding: "4px 10px",
  borderRadius: "999px",
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--accent-primary)",
  background: "color-mix(in srgb, var(--accent-primary) 12%, transparent)",
};

const sectionHeadingStyles: CSSProperties = {
  margin: 0,
  fontSize: "18px",
  lineHeight: 1.3,
  color: "var(--text-primary)",
};

const supportTextStyles: CSSProperties = {
  margin: "6px 0 0 0",
  color: "var(--text-secondary)",
  lineHeight: 1.5,
};

const errorBannerStyles: CSSProperties = {
  display: "flex",
  gap: "12px",
  alignItems: "flex-start",
  padding: "12px 14px",
  borderRadius: "var(--radius-md)",
  border: "1px solid color-mix(in srgb, var(--accent-danger) 30%, transparent)",
  background: "color-mix(in srgb, var(--accent-danger) 10%, transparent)",
  color: "var(--text-primary)",
};

const panelStyles: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-3)",
  padding: "var(--spacing-4)",
  borderRadius: "var(--radius-lg)",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "var(--border-primary)",
  background: "var(--bg-secondary)",
};

const blockedPanelStyles: CSSProperties = {
  ...panelStyles,
  borderColor: "color-mix(in srgb, var(--warning) 35%, transparent)",
  background: "color-mix(in srgb, var(--warning) 10%, transparent)",
};

const successPanelStyles: CSSProperties = {
  ...panelStyles,
  borderColor: "color-mix(in srgb, var(--success) 35%, transparent)",
  background: "color-mix(in srgb, var(--success) 10%, transparent)",
};

const panelHeaderStyles: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "var(--spacing-3)",
};

const panelTitleStyles: CSSProperties = {
  margin: 0,
  fontSize: "16px",
  lineHeight: 1.3,
  color: "var(--text-primary)",
};

const panelBodyStyles: CSSProperties = {
  margin: "6px 0 0 0",
  color: "var(--text-secondary)",
  lineHeight: 1.5,
};

const loadingPillStyles: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "6px 10px",
  borderRadius: "999px",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--text-secondary)",
  background: "var(--bg-tertiary)",
};

const checksGridStyles: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "var(--spacing-3)",
};

const checkCardStyles: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  padding: "12px",
  borderRadius: "var(--radius-md)",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "var(--border-primary)",
};

const checkTitleRowStyles: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const checkLabelStyles: CSSProperties = {
  fontWeight: 700,
};

const checkDetailStyles: CSSProperties = {
  color: "var(--text-primary)",
  lineHeight: 1.45,
};

const checkStateStyles: CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const blockedHeaderStyles: CSSProperties = {
  display: "flex",
  gap: "12px",
  alignItems: "flex-start",
};

const actionRowStyles: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--spacing-2)",
};

const fileListStyles: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const fileRowStyles: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  alignItems: "center",
  gap: "10px",
  padding: "10px 12px",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border-primary)",
};

const statusCodeStyles: CSSProperties = {
  padding: "2px 8px",
  borderRadius: "999px",
  background: "var(--bg-primary)",
  color: "var(--accent-primary)",
  fontWeight: 700,
  fontSize: "12px",
};

const filePathStyles: CSSProperties = {
  color: "var(--text-primary)",
  wordBreak: "break-word",
};

const emptyStateStyles: CSSProperties = {
  padding: "18px",
  borderRadius: "var(--radius-md)",
  border: "1px dashed var(--border-primary)",
  color: "var(--text-secondary)",
  textAlign: "center",
};

const formGridStyles: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "var(--spacing-3)",
};

const fieldLabelStyles: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  color: "var(--text-primary)",
  fontWeight: 600,
};

const textInputStyles: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-primary)",
  background: "var(--bg-primary)",
  color: "var(--text-primary)",
  fontSize: "14px",
};

const readOnlyValueStyles: CSSProperties = {
  padding: "10px 12px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-primary)",
  background: "var(--bg-primary)",
  color: "var(--text-primary)",
  lineHeight: 1.5,
};

const fieldHintStyles: CSSProperties = {
  color: "var(--text-secondary)",
  fontSize: "13px",
  fontWeight: 400,
  lineHeight: 1.4,
};

const checkboxRowStyles: CSSProperties = {
  display: "flex",
  alignItems: "center",
};

const checkboxLabelStyles: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  color: "var(--text-secondary)",
};

const prBodySectionStyles: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};

const collapsibleButtonStyles: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
  width: "100%",
  padding: "10px 12px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-primary)",
  background: "var(--bg-tertiary)",
  color: "var(--text-primary)",
  fontWeight: 600,
};

const textareaStyles: CSSProperties = {
  width: "100%",
  resize: "vertical",
  minHeight: "240px",
  padding: "12px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-primary)",
  background: "var(--bg-primary)",
  color: "var(--text-primary)",
  fontSize: "14px",
  lineHeight: 1.5,
  fontFamily: "inherit",
};

const runningHeaderStyles: CSSProperties = {
  display: "flex",
  gap: "12px",
  alignItems: "flex-start",
};

const runningStepListStyles: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};

const runningStepStyles: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "20px 1fr",
  gap: "12px",
  alignItems: "flex-start",
  padding: "12px",
  borderRadius: "var(--radius-md)",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "var(--border-primary)",
};

const runningStepIconStyles: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  paddingTop: "2px",
};

const runningStepDotStyles: CSSProperties = {
  width: "10px",
  height: "10px",
  borderRadius: "50%",
  background: "var(--border-primary)",
  marginTop: "4px",
};

const runningStepLabelStyles: CSSProperties = {
  fontWeight: 700,
  color: "var(--text-primary)",
};

const runningStepDescriptionStyles: CSSProperties = {
  marginTop: "4px",
  color: "var(--text-secondary)",
  lineHeight: 1.45,
};

const successValueGridStyles: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "var(--spacing-3)",
};

const successValueCardStyles: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  padding: "12px",
  borderRadius: "var(--radius-md)",
  border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)",
  background: "color-mix(in srgb, var(--success) 8%, transparent)",
};

const successLabelStyles: CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-secondary)",
};

const successCodeStyles: CSSProperties = {
  fontSize: "14px",
  fontWeight: 700,
  color: "var(--text-primary)",
  wordBreak: "break-all",
};

const errorDetailsStyles: CSSProperties = {
  display: "grid",
  gap: "12px",
  padding: "12px",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-tertiary)",
  color: "var(--text-primary)",
  lineHeight: 1.5,
};

const footerRowStyles: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "var(--spacing-2)",
  width: "100%",
};

const baseButtonStyles: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  padding: "10px 14px",
  borderRadius: "var(--radius-md)",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "transparent",
  fontSize: "14px",
  fontWeight: 700,
};

const primaryButtonStyles: CSSProperties = {
  ...baseButtonStyles,
  color: "white",
  background: "var(--accent-primary)",
};

const secondaryButtonStyles: CSSProperties = {
  ...baseButtonStyles,
  color: "var(--text-primary)",
  background: "var(--bg-tertiary)",
  borderColor: "var(--border-primary)",
};
