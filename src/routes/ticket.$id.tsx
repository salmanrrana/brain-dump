import { createFileRoute, useParams, useRouter, useCanGoBack } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useRef } from "react";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { getTicket } from "../api/tickets";
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
import { TicketDetailHeader } from "../components/tickets/TicketDetailHeader";
import { EditTicketModal } from "../components/tickets/EditTicketModal";
import { ShipChangesModal, TicketDescription, SubtasksProgress } from "../components/tickets";
import { WorkflowProgress } from "../components/tickets/WorkflowProgress";
import { ReviewFindingsPanel } from "../components/tickets/ReviewFindingsPanel";
import { ClaudeTasks } from "../components/tickets/ClaudeTasks";
import { DemoPanel } from "../components/tickets/DemoPanel";
import { TelemetryPanel } from "../components/TelemetryPanel";
import { TicketCostPanel } from "../components/tickets/TicketCostPanel";
import type { Subtask } from "../components/tickets/SubtasksProgress";
import { type LaunchType } from "../components/tickets/LaunchActions";
import { POLLING_INTERVALS } from "../lib/constants";
import { queryKeys } from "../lib/query-keys";
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
    await context.queryClient.ensureQueryData({
      queryKey: queryKeys.ticket(params.id),
      queryFn: () => getTicket({ data: params.id }),
      staleTime: 30_000,
    });
  },
  component: TicketDetailPage,
  errorComponent: TicketDetailError,
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
    <div style={containerStyles}>
      {/* Back navigation skeleton */}
      <div style={backNavStyles}>
        <div style={{ ...skeletonStyles, width: "120px", height: "20px" }} />
      </div>

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

      {/* Content skeleton */}
      <div style={contentGridStyles}>
        {/* Description section */}
        <div style={sectionStyles}>
          <div
            style={{
              ...skeletonStyles,
              width: "100px",
              height: "20px",
              marginBottom: "var(--spacing-3)",
            }}
          />
          <div style={{ ...skeletonStyles, width: "100%", height: "120px" }} />
        </div>

        {/* Subtasks section */}
        <div style={sectionStyles}>
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
          <div
            style={{
              ...skeletonStyles,
              width: "90%",
              height: "20px",
              marginBottom: "var(--spacing-2)",
            }}
          />
          <div style={{ ...skeletonStyles, width: "70%", height: "20px" }} />
        </div>
      </div>

      {/* Activity section skeleton */}
      <div style={sectionStyles}>
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
    </div>
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
    async (type: LaunchType) => {
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

  return (
    <div style={containerStyles}>
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
      {(ticket.status === "in_progress" ||
        ticket.status === "ai_review" ||
        ticket.status === "human_review" ||
        ticket.status === "done") && (
        <section style={workflowSectionStyles}>
          <WorkflowProgress
            workflowState={workflowState}
            loading={workflowLoading}
            error={workflowError}
          />
        </section>
      )}

      {/* Content Grid */}
      <div style={contentGridStyles}>
        {/* Description Section */}
        <TicketDescription description={ticket.description} testId="ticket-detail-description" />

        {/* Right Column - Subtasks and Review Findings */}
        <div style={rightColumnStyles}>
          {/* Subtasks Section - using SubtasksProgress component */}
          <SubtasksProgress
            ticketId={ticket.id}
            subtasks={localSubtasks}
            onUpdate={handleSubtaskUpdate}
            disabled={ticket.status === "done"}
            testId="ticket-detail-subtasks"
          />

          {/* Review Findings Panel - shows during AI review phase */}
          {(ticket.status === "ai_review" ||
            ticket.status === "human_review" ||
            ticket.status === "done") && (
            <ReviewFindingsPanel
              workflowState={workflowState}
              loading={workflowLoading}
              error={workflowError}
              onRetry={() => {
                void refetchWorkflowState();
              }}
            />
          )}
        </div>
      </div>

      {/* Demo Review Panel - interactive in human_review, read-only after completion */}
      {(ticket.status === "human_review" || ticket.status === "done") && (
        <section style={sectionStyles}>
          <DemoPanel ticketId={ticket.id} />
        </section>
      )}

      {/* Claude Tasks Section */}
      <section style={cardSectionStyles}>
        <ClaudeTasks ticketId={ticket.id} ticketStatus={ticket.status} defaultExpanded={true} />
      </section>

      {/* Cost Panel */}
      <section style={cardSectionStyles}>
        <TicketCostPanel ticketId={ticket.id} />
      </section>

      {/* Telemetry Panel */}
      <section style={cardSectionStyles}>
        <TelemetryPanel ticketId={ticket.id} />
      </section>

      {/* Activity Section */}
      <section style={cardSectionStyles}>
        <ActivitySection
          ticketId={ticket.id}
          pollingInterval={ticket.status === "in_progress" ? POLLING_INTERVALS.COMMENTS_ACTIVE : 0}
          maxHeight="none"
          testId="ticket-detail-activity"
        />
      </section>

      {/* Metadata */}
      <footer style={metadataStyles}>
        <span>Created: {new Date(ticket.createdAt).toLocaleString()}</span>
        <span>Updated: {new Date(ticket.updatedAt).toLocaleString()}</span>
        {ticket.completedAt && (
          <span>Completed: {new Date(ticket.completedAt).toLocaleString()}</span>
        )}
      </footer>

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
    </div>
  );
}

// =============================================================================
// Styles
// =============================================================================

const containerStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-8)",
  padding: "var(--spacing-8)",
  maxWidth: "1200px",
  margin: "0 auto",
  height: "100%",
  overflowY: "auto",
};

const backNavStyles: React.CSSProperties = {
  marginBottom: "var(--spacing-1)",
};

const backNavLinkStyles: React.CSSProperties = {
  display: "inline-flex",
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

const contentGridStyles: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "3fr 2fr",
  gap: "var(--spacing-8)",
};

const sectionStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-3)",
};

const workflowSectionStyles: React.CSSProperties = {
  padding: "var(--spacing-5)",
  background: "var(--bg-card)",
  borderRadius: "var(--radius-xl)",
  border: "1px solid var(--border-primary)",
};

const rightColumnStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-5)",
};

const cardSectionStyles: React.CSSProperties = {
  padding: "var(--spacing-5)",
  background: "var(--bg-card)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-xl)",
};

export const activitySectionStyles: React.CSSProperties = {
  // Keep Activity at intrinsic height so metadata divider renders strictly below it.
  flex: "0 0 auto",
};

export const metadataStyles: React.CSSProperties = {
  display: "flex",
  gap: "var(--spacing-6)",
  flexWrap: "wrap",
  padding: "var(--spacing-5)",
  background: "var(--bg-card)",
  borderRadius: "var(--radius-xl)",
  border: "1px solid var(--border-primary)",
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
  borderRadius: "var(--radius-2xl)",
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
