import {
  createFileRoute,
  useParams,
  useRouter,
  useCanGoBack,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useMemo, useRef } from "react";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { getTicket } from "../api/tickets";
import { getWorkflowDisplayState } from "../api/workflow";
import { getProjectsWithEpics } from "../api/projects";
import { pushBranchServerFn } from "../api/ship-server-fns";
import { useToast } from "../components/Toast";
import {
  dispatchInteractiveUiLaunch,
  dispatchRalphAutonomousUiLaunch,
  defaultRalphLaunchDependencies,
} from "../lib/ui-launch-dispatcher";
import {
  getInteractiveUiLaunchProvider,
  getRalphAutonomousUiLaunchProvider,
} from "../lib/ui-launch-registry";
import { ActivitySection } from "../components/tickets/ActivitySection";
import { TicketCodeChangesSection } from "../components/tickets/TicketCodeChangesSection";
import { TicketDetailHeader } from "../components/tickets/TicketDetailHeader";
import { EditTicketModal } from "../components/tickets/EditTicketModal";
import { ShipChangesModal, TicketDescription, SubtasksProgress } from "../components/tickets";
import { WorkflowProgress } from "../components/tickets/WorkflowProgress";
import { ReviewFindingsPanel } from "../components/tickets/ReviewFindingsPanel";
import { ClaudeTasks } from "../components/tickets/ClaudeTasks";
import { DemoPanel } from "../components/tickets/DemoPanel";
import { TelemetryPanel } from "../components/TelemetryPanel";
import { TicketCostPanel } from "../components/tickets/TicketCostPanel";
import {
  DetailPageLayout,
  DetailPageFullBleed,
  DetailPageBody,
  DetailPagePrimary,
  DetailPageRail,
  DetailPageProse,
} from "../components/layout/DetailPageLayout";
import type { Subtask } from "../components/tickets/SubtasksProgress";
import { type LaunchType } from "../components/tickets/LaunchActions";
import type { LaunchModelSelection } from "../lib/launch-model-catalog";
import { POLLING_INTERVALS } from "../lib/constants";
import { queryKeys } from "../lib/query-keys";
import {
  applyCodeChangeSearchToObject,
  parseCodeChangeRouteSearch,
  type CodeChangeRouteSearchPatch,
} from "../lib/code-change-route-search";
import { markLoaderStart, markLoaderEnd, timedFetch } from "../lib/navigation-timing";
import {
  useProjects,
  useSettings,
  useLaunchRalphForTicket,
  useWorkflowState,
  type Ticket,
  type Epic,
} from "../lib/hooks";

export const Route = createFileRoute("/ticket/$id")({
  pendingComponent: TicketDetailSkeleton,
  loader: async ({ context, params }) => {
    markLoaderStart("ticket");
    // Parallel-prefetch the above-the-fold data (ticket + workflow state +
    // projects) so the page renders complete instead of waterfalling these
    // queries after first paint. staleTime matches the consuming hooks'
    // snapshot tier (30s) so the prefetched data is served from cache rather
    // than immediately re-fetched. Below-the-fold panels (cost, telemetry,
    // claude-tasks, comments, demo) stay lazy on-mount and must not block.
    await Promise.all([
      timedFetch("ticket:ticket", () =>
        context.queryClient.ensureQueryData({
          queryKey: queryKeys.ticket(params.id),
          queryFn: () => getTicket({ data: params.id }),
          staleTime: 30_000,
        })
      ),
      timedFetch("ticket:workflowState", () =>
        context.queryClient.ensureQueryData({
          queryKey: queryKeys.workflowState(params.id),
          queryFn: () => getWorkflowDisplayState({ data: params.id }),
          staleTime: 30_000,
        })
      ),
      timedFetch("ticket:projects", () =>
        context.queryClient.ensureQueryData({
          queryKey: queryKeys.projectsWithEpics,
          queryFn: () => getProjectsWithEpics(),
          staleTime: 30_000,
        })
      ),
    ]);
    markLoaderEnd("ticket");
  },
  component: TicketDetailPage,
  errorComponent: TicketDetailError,
  // Normalize the code-changes panel state (open/close + selected source/file)
  // into stable query params so the panel can be deep-linked and restored.
  validateSearch: (search: Record<string, unknown>): Record<string, string> => {
    const parsed = parseCodeChangeRouteSearch(search);
    // Normalize code-change params on top of the existing search so any unrelated
    // params are preserved rather than dropped.
    return applyCodeChangeSearchToObject(search, {
      open: parsed.open,
      selectedTicketId: parsed.selectedTicketId,
      selectedSourceId: parsed.selectedSourceId,
      selectedFilePath: parsed.selectedFilePath,
      wordWrap: parsed.wordWrap,
      ignoreWhitespace: parsed.ignoreWhitespace,
    });
  },
});

// =============================================================================
// Error Component
// =============================================================================

/**
 * Error component for ticket detail route - shows user-friendly error with navigation.
 * Uses TanStack Router's useCanGoBack hook to determine if browser back is available.
 */
function TicketDetailError({ error }: { error: Error }) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const { showToast } = useToast();
  console.error("Ticket detail error:", error);

  const handleBackNavigation = useCallback(async () => {
    try {
      if (canGoBack) {
        router.history.back();
      } else {
        await router.navigate({ to: "/board" });
      }
    } catch {
      showToast("error", "Unable to navigate. Please reload the page.");
    }
  }, [canGoBack, router, showToast]);

  return (
    <div style={errorContainerStyles}>
      <div style={errorCardStyles}>
        <AlertCircle size={48} style={{ color: "var(--accent-danger)" }} />
        <h2 style={errorTitleStyles}>Ticket Not Found</h2>
        <p style={errorMessageStyles}>{error.message}</p>
        <button
          type="button"
          onClick={handleBackNavigation}
          style={backLinkStyles}
          className="hover:opacity-90"
        >
          <ArrowLeft size={16} />
          Back to Board
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Loading Skeleton
// =============================================================================

function TicketDetailSkeleton() {
  return (
    <DetailPageLayout>
      <DetailPageFullBleed style={fullBleedTopStyles}>
        {/* Back navigation skeleton */}
        <div style={{ ...skeletonStyles, width: "120px", height: "20px" }} />

        {/* Header skeleton */}
        <div style={headerSectionStyles}>
          <div
            style={{
              ...skeletonStyles,
              width: "60%",
              height: "32px",
              marginBottom: "var(--spacing-3)",
            }}
          />
          <div style={{ display: "flex", gap: "var(--spacing-2)" }}>
            <div
              style={{
                ...skeletonStyles,
                width: "80px",
                height: "24px",
                borderRadius: "var(--radius-full)",
              }}
            />
            <div
              style={{
                ...skeletonStyles,
                width: "80px",
                height: "24px",
                borderRadius: "var(--radius-full)",
              }}
            />
            <div
              style={{
                ...skeletonStyles,
                width: "100px",
                height: "24px",
                borderRadius: "var(--radius-full)",
              }}
            />
          </div>
        </div>
      </DetailPageFullBleed>

      <DetailPageBody>
        <DetailPagePrimary>
          {/* Description section */}
          <DetailPageProse>
            <div
              style={{
                ...skeletonStyles,
                width: "100px",
                height: "20px",
                marginBottom: "var(--spacing-3)",
              }}
            />
            <div style={{ ...skeletonStyles, width: "100%", height: "120px" }} />
          </DetailPageProse>

          {/* Activity section skeleton */}
          <div>
            <div
              style={{
                ...skeletonStyles,
                width: "80px",
                height: "20px",
                marginBottom: "var(--spacing-3)",
              }}
            />
            <div style={{ ...skeletonStyles, width: "100%", height: "200px" }} />
          </div>
        </DetailPagePrimary>

        <DetailPageRail ariaLabel="Ticket details and status">
          {/* Subtasks section skeleton */}
          <div style={railCardStyles}>
            <div
              style={{
                ...skeletonStyles,
                width: "140px",
                height: "20px",
                marginBottom: "var(--spacing-3)",
              }}
            />
            <div
              style={{
                ...skeletonStyles,
                width: "100%",
                height: "24px",
                marginBottom: "var(--spacing-2)",
              }}
            />
            <div
              style={{
                ...skeletonStyles,
                width: "80%",
                height: "20px",
                marginBottom: "var(--spacing-2)",
              }}
            />
            <div style={{ ...skeletonStyles, width: "70%", height: "20px" }} />
          </div>
        </DetailPageRail>
      </DetailPageBody>
    </DetailPageLayout>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * TicketDetailPage - Full page view for a single ticket.
 *
 * Layout:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ ← Back to Board                                             │
 * ├─────────────────────────────────────────────────────────────┤
 * │ Ticket Title                                [Edit] [Start]  │
 * │ Status: In Progress  Priority: High  Epic: Auth            │
 * ├─────────────────────────────────────────────────────────────┤
 * │ Description                     │ Subtasks (2/4)           │
 * │ Add login/logout...             │ ☑ Database schema        │
 * │                                 │ ☑ API endpoints          │
 * │                                 │ ☐ UI components          │
 * ├─────────────────────────────────────────────────────────────┤
 * │ Activity (full timeline)                                    │
 * └─────────────────────────────────────────────────────────────┘
 */
function TicketDetailPage() {
  const { id } = useParams({ from: "/ticket/$id" });
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const { showToast } = useToast();
  const { projects } = useProjects();
  const { settings } = useSettings();
  const launchRalphMutation = useLaunchRalphForTicket();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Code-changes panel state lives in the URL so the panel can be deep-linked
  // and restored. Parse once per search change into the shared route-search shape.
  const rawSearch = useSearch({ from: "/ticket/$id" });
  const codeChangeSearch = useMemo(
    () => parseCodeChangeRouteSearch(rawSearch as Record<string, unknown>),
    [rawSearch]
  );
  const handleCodeChangeSearch = useCallback(
    (patch: CodeChangeRouteSearchPatch) => {
      navigate({
        to: ".",
        search: (prev) => applyCodeChangeSearchToObject(prev as Record<string, unknown>, patch),
        replace: true,
      }).catch(() => {
        showToast("error", "Failed to update the code changes panel. Please try again.");
      });
    },
    [navigate, showToast]
  );

  // Modal and launch state
  const [showEditModal, setShowEditModal] = useState(false);
  const [showShipModal, setShowShipModal] = useState(false);
  const [isPushingChanges, setIsPushingChanges] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchingType, setLaunchingType] = useState<LaunchType | null>(null);

  // Fetch ticket data
  const {
    data: ticket,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.ticket(id),
    queryFn: () => getTicket({ data: id }),
    // Mutations invalidate this key; short freshness lets recent navigations reuse loaded detail data.
    staleTime: 30_000,
  });

  // Fetch workflow state for this ticket
  const {
    workflowState,
    loading: workflowLoading,
    error: workflowError,
    refetch: refetchWorkflowState,
  } = useWorkflowState(id, {
    // Poll for updates when ticket is actively being worked on
    pollingInterval:
      ticket?.status === "in_progress" || ticket?.status === "ai_review"
        ? POLLING_INTERVALS.COMMENTS_ACTIVE
        : 0,
  });

  // Subtask state - parse from ticket when available
  const [localSubtasks, setLocalSubtasks] = useState<Subtask[]>([]);

  // Sync localSubtasks with ticket data when it changes
  // Using useEffect to avoid stale closure issues
  const ticketSubtasks = ticket?.subtasks;
  const prevTicketSubtasks = useRef(ticketSubtasks);
  if (ticketSubtasks !== prevTicketSubtasks.current) {
    prevTicketSubtasks.current = ticketSubtasks;
    let parsed: Subtask[] = [];
    if (ticketSubtasks) {
      try {
        parsed = JSON.parse(ticketSubtasks) as Subtask[];
      } catch (error) {
        // Invalid JSON in subtasks field - log error and use empty array
        console.error("Failed to parse ticket subtasks:", error);
        showToast("error", "Failed to load subtasks. Please refresh the page.");
        parsed = [];
      }
    }
    if (JSON.stringify(parsed) !== JSON.stringify(localSubtasks)) {
      setLocalSubtasks(parsed);
    }
  }

  // Handle subtask updates - optimistic update + invalidate query
  const handleSubtaskUpdate = useCallback(
    (updatedSubtasks: Subtask[]) => {
      setLocalSubtasks(updatedSubtasks);
      // Invalidate the ticket query to refresh data after mutation completes
      queryClient.invalidateQueries({ queryKey: queryKeys.ticket(id) });
    },
    [queryClient, id]
  );

  // Find the epic for this ticket
  const epic: Epic | null = ticket
    ? (projects.flatMap((p) => p.epics).find((e) => e.id === ticket.epicId) ?? null)
    : null;
  const project = ticket
    ? (projects.find((candidate) => candidate.id === ticket.projectId) ?? null)
    : null;

  // Handle edit button click
  const handleEdit = useCallback(() => {
    setShowEditModal(true);
  }, []);

  // Handle edit modal close
  const handleEditClose = useCallback(() => {
    setShowEditModal(false);
  }, []);

  // Handle edit success - refetch ticket data
  const handleEditSuccess = useCallback(() => {
    void refetch();
    setShowEditModal(false);
  }, [refetch]);

  const invalidateTicketDetail = useCallback(async () => {
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: queryKeys.ticket(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projectsWithEpics }),
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowState(id) }),
    ]);
  }, [id, queryClient, refetch]);

  const handleShipSuccess = useCallback(() => {
    void invalidateTicketDetail();
    setShowShipModal(false);
  }, [invalidateTicketDetail]);

  const handlePushChanges = useCallback(async () => {
    if (!ticket) {
      return;
    }

    setIsPushingChanges(true);

    try {
      const result = await pushBranchServerFn({
        data: {
          scopeType: "ticket",
          scopeId: ticket.id,
        },
      });

      if (result.success) {
        showToast("success", `Pushed ${result.branchName}`);
        await invalidateTicketDetail();
        return;
      }

      showToast("error", result.error);
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Failed to push branch");
    } finally {
      setIsPushingChanges(false);
    }
  }, [invalidateTicketDetail, showToast, ticket]);

  // Handle back navigation - preserves filter state by using browser history
  // Uses TanStack Router's useCanGoBack hook to check if back navigation is possible
  // If no history (direct URL navigation), falls back to board
  const handleBackNavigation = useCallback(async () => {
    try {
      if (canGoBack) {
        router.history.back();
      } else {
        // No history - navigate to board
        await router.navigate({ to: "/board" });
      }
    } catch {
      showToast("error", "Failed to navigate back. Please try again.");
    }
  }, [canGoBack, router, showToast]);

  // Handle launch action through the shared ticket launch dispatcher.
  const handleLaunch = useCallback(
    async (type: LaunchType, modelSelection: LaunchModelSelection) => {
      if (!ticket) return;

      setIsLaunching(true);
      setLaunchingType(type);

      try {
        const interactiveProvider = getInteractiveUiLaunchProvider(type);
        const ralphProvider = getRalphAutonomousUiLaunchProvider(type);

        if (interactiveProvider) {
          const launchResult = await dispatchInteractiveUiLaunch(interactiveProvider, {
            kind: "ticket",
            ticketId: ticket.id,
            preferredTerminal: settings?.terminalEmulator ?? null,
            modelSelection,
          });

          if (launchResult.warnings) {
            launchResult.warnings.forEach((warning) => showToast("info", warning));
          }

          if (launchResult.success) {
            showToast("success", launchResult.message);
            void refetch();
          } else {
            showToast("error", launchResult.message);
          }
          return;
        }

        if (ralphProvider) {
          const result = await dispatchRalphAutonomousUiLaunch(
            ralphProvider,
            {
              kind: "ticket",
              ticketId: ticket.id,
              preferredTerminal: settings?.terminalEmulator ?? null,
              modelSelection,
            },
            {
              ...defaultRalphLaunchDependencies,
              launchTicketRalph: async (payload) => {
                const launchResult = await launchRalphMutation.mutateAsync(payload);
                return {
                  success: launchResult.success,
                  message: launchResult.message,
                  ...(launchResult.warnings ? { warnings: launchResult.warnings } : {}),
                  ...("terminalUsed" in launchResult && launchResult.terminalUsed
                    ? { terminalUsed: launchResult.terminalUsed }
                    : {}),
                };
              },
              launchEpicRalph: async () => ({
                success: false,
                message: "Epic Ralph launch is not available from ticket detail.",
              }),
            }
          );

          if (result.warnings) {
            result.warnings.forEach((warning) => showToast("info", warning));
          }

          if (result.success) {
            showToast("success", result.message);
            void refetch();
          } else {
            showToast("error", result.message);
          }
          return;
        }

        showToast("error", `Unknown launch provider: ${type}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "An unexpected error occurred";
        showToast("error", `Failed to launch: ${message}`);
      } finally {
        setIsLaunching(false);
        setLaunchingType(null);
      }
    },
    [ticket, settings?.terminalEmulator, showToast, launchRalphMutation, refetch]
  );

  // Show loading skeleton
  if (isLoading) {
    return <TicketDetailSkeleton />;
  }

  // Show error state
  if (error || !ticket) {
    return (
      <div style={errorContainerStyles}>
        <div style={errorCardStyles}>
          <AlertCircle size={48} style={{ color: "var(--accent-danger)" }} />
          <h2 style={errorTitleStyles}>Ticket Not Found</h2>
          <p style={errorMessageStyles}>
            {error instanceof Error ? error.message : `Could not find ticket with ID: ${id}`}
          </p>
          <button
            type="button"
            onClick={handleBackNavigation}
            style={backLinkStyles}
            className="hover:opacity-90"
          >
            <ArrowLeft size={16} />
            Back to Board
          </button>
        </div>
      </div>
    );
  }

  const showWorkflow =
    ticket.status === "in_progress" ||
    ticket.status === "ai_review" ||
    ticket.status === "human_review" ||
    ticket.status === "done";
  const showFindings =
    ticket.status === "ai_review" || ticket.status === "human_review" || ticket.status === "done";
  const showDemo = ticket.status === "human_review" || ticket.status === "done";

  return (
    <DetailPageLayout>
      {/* Full-bleed top: back nav, header, workflow, and the diff surface all
          want the full bounded canvas width. */}
      <DetailPageFullBleed style={fullBleedTopStyles}>
        {/* Back Navigation - uses browser history to preserve filter state */}
        <button
          type="button"
          onClick={handleBackNavigation}
          style={backNavLinkStyles}
          className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={16} />
          Back to Board
        </button>

        {/* Header Section - using TicketDetailHeader component */}
        <TicketDetailHeader
          ticket={ticket as Ticket}
          epic={epic}
          onShip={() => setShowShipModal(true)}
          onPush={handlePushChanges}
          isPushing={isPushingChanges}
          onEdit={handleEdit}
          onLaunch={handleLaunch}
          isLaunching={isLaunching}
          launchingType={launchingType}
        />

        {/* Workflow Progress Indicator - shows current phase in the workflow */}
        {showWorkflow && (
          <section style={workflowSectionStyles}>
            <WorkflowProgress
              workflowState={workflowState}
              loading={workflowLoading}
              error={workflowError}
            />
          </section>
        )}

        {/* Code Changes - lazy summary + in-page diff review surface */}
        <TicketCodeChangesSection
          ticketId={ticket.id}
          branchName={ticket.branchName}
          prNumber={ticket.prNumber}
          prUrl={ticket.prUrl}
          search={codeChangeSearch}
          onSearchChange={handleCodeChangeSearch}
        />
      </DetailPageFullBleed>

      {/* Two-column body: description + activity read as the primary column;
          the scan-and-monitor panels live in the sticky rail. */}
      <DetailPageBody>
        <DetailPagePrimary>
          {/* Description - prose-capped even though the page is wide. */}
          <DetailPageProse>
            <TicketDescription
              description={ticket.description}
              testId="ticket-detail-description"
            />
          </DetailPageProse>

          {/* Demo Review Panel - interactive in human_review, read-only after
              completion. Lives in the primary column because it is interactive
              reading, not at-a-glance monitoring. */}
          {showDemo && <DemoPanel ticketId={ticket.id} />}

          {/* Activity Section - the activity log is primary reading, rendered
              on the page surface (not boxed in a clone card) so it reads as the
              ticket's narrative rather than a footnote widget. */}
          <section style={activitySectionStyles} data-testid="ticket-detail-activity-region">
            <ActivitySection
              ticketId={ticket.id}
              pollingInterval={
                ticket.status === "in_progress" ? POLLING_INTERVALS.COMMENTS_ACTIVE : 0
              }
              maxHeight="none"
              testId="ticket-detail-activity"
            />
          </section>
        </DetailPagePrimary>

        <DetailPageRail ariaLabel="Ticket details and status">
          {/* Subtasks - bare component, anchored on a subtle rail card so it
              sits consistently beside the self-carded monitor panels. */}
          <div style={railCardStyles}>
            <SubtasksProgress
              ticketId={ticket.id}
              subtasks={localSubtasks}
              onUpdate={handleSubtaskUpdate}
              disabled={ticket.status === "done"}
              testId="ticket-detail-subtasks"
            />
          </div>

          {/* Review Findings Panel - shows during AI review phase. Self-carded. */}
          {showFindings && (
            <ReviewFindingsPanel
              workflowState={workflowState}
              loading={workflowLoading}
              error={workflowError}
              onRetry={() => {
                void refetchWorkflowState();
              }}
            />
          )}

          {/* Cost / Telemetry / Claude Tasks - each self-carded; no extra wrapper
              so we avoid nested-card scaffolding. */}
          <TicketCostPanel ticketId={ticket.id} />
          <TelemetryPanel ticketId={ticket.id} />
          <ClaudeTasks ticketId={ticket.id} ticketStatus={ticket.status} defaultExpanded={true} />

          {/* Metadata - compact footer-style block, not a heavy card. */}
          <footer style={metadataStyles}>
            <span>Created: {new Date(ticket.createdAt).toLocaleString()}</span>
            <span>Updated: {new Date(ticket.updatedAt).toLocaleString()}</span>
            {ticket.completedAt && (
              <span>Completed: {new Date(ticket.completedAt).toLocaleString()}</span>
            )}
          </footer>
        </DetailPageRail>
      </DetailPageBody>

      {/* Edit Modal */}
      <EditTicketModal
        key={ticket.id}
        isOpen={showEditModal}
        onClose={handleEditClose}
        ticket={ticket as Ticket}
        onSuccess={handleEditSuccess}
      />

      {showShipModal && project && (
        <ShipChangesModal
          isOpen={showShipModal}
          onClose={() => setShowShipModal(false)}
          projectPath={project.path}
          scopeType="ticket"
          scopeId={ticket.id}
          scopeTitle={ticket.title}
          branchName={ticket.branchName ?? undefined}
          onSuccess={handleShipSuccess}
        />
      )}
    </DetailPageLayout>
  );
}

// =============================================================================
// Styles
// =============================================================================

// Full-bleed top region: stacks back-nav, header, workflow, and code changes
// with rhythmic spacing. The outer canvas width/centering is owned by
// DetailPageLayout, so this only controls vertical flow.
const fullBleedTopStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-6)",
};

const backNavLinkStyles: React.CSSProperties = {
  display: "inline-flex",
  // Sit at content width rather than stretching the full canvas in the column.
  alignSelf: "flex-start",
  alignItems: "center",
  gap: "var(--spacing-2)",
  color: "var(--text-muted)",
  fontSize: "var(--font-size-xs)",
  fontFamily: "var(--font-mono)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  letterSpacing: "var(--tracking-wide)",
  padding: "var(--spacing-2) var(--spacing-3)",
  borderRadius: "var(--radius-lg)",
  border: "1px solid transparent",
  transition: "all var(--transition-fast)",
  cursor: "pointer",
  background: "transparent",
};

const headerSectionStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-4)",
  paddingBottom: "var(--spacing-6)",
  borderBottom: "1px solid var(--border-primary)",
};

const workflowSectionStyles: React.CSSProperties = {
  padding: "var(--spacing-5)",
  background: "var(--bg-card)",
  borderRadius: "var(--radius-xl)",
  border: "1px solid var(--border-primary)",
};

// Subtle anchor for the otherwise-bare SubtasksProgress in the rail, so it sits
// consistently next to the self-carded monitor panels (Cost/Telemetry/Tasks)
// without nesting a card inside a card.
const railCardStyles: React.CSSProperties = {
  padding: "var(--spacing-4)",
  background: "var(--bg-card)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-lg)",
};

// Activity is the primary reading log: rendered on the page surface (no clone
// card) and kept at intrinsic height so it flows naturally in the column.
export const activitySectionStyles: React.CSSProperties = {
  flex: "0 0 auto",
};

// Metadata footer in the rail: a compact, column of timestamps separated from
// the panels above by a hairline rule — not a heavy bordered card, so it reads
// as a quiet footnote rather than another monitor widget.
export const metadataStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-1)",
  paddingTop: "var(--spacing-4)",
  borderTop: "1px solid var(--border-primary)",
  fontSize: "var(--font-size-xs)",
  fontFamily: "var(--font-mono)",
  color: "var(--text-muted)",
  letterSpacing: "0.01em",
};

// Error styles
const errorContainerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  padding: "var(--spacing-8)",
};

const errorCardStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "var(--spacing-5)",
  padding: "var(--spacing-10)",
  background: "var(--bg-card)",
  borderRadius: "var(--radius-xl)",
  border: "1px solid var(--border-primary)",
  textAlign: "center",
  maxWidth: "440px",
};

const errorTitleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-2xl)",
  fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
  letterSpacing: "var(--tracking-tight)",
  color: "var(--text-primary)",
  margin: 0,
};

const errorMessageStyles: React.CSSProperties = {
  color: "var(--text-secondary)",
  fontSize: "var(--font-size-sm)",
  margin: 0,
};

const backLinkStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-2) var(--spacing-5)",
  background: "var(--gradient-accent)",
  color: "var(--text-on-accent)",
  borderRadius: "var(--radius-lg)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  fontFamily: "var(--font-sans)",
  marginTop: "var(--spacing-2)",
  cursor: "pointer",
  border: "none",
  boxShadow: "var(--shadow-sm)",
};

// Skeleton styles
const skeletonStyles: React.CSSProperties = {
  background: "var(--bg-tertiary)",
  borderRadius: "var(--radius-lg)",
  animation: "pulse 2s ease-in-out infinite",
};
