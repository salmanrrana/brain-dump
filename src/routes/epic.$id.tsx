import { createFileRoute, useParams, useRouter, useCanGoBack } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { pushBranchServerFn } from "../api/ship-server-fns";
import { useEpicDetail } from "../lib/hooks";
import { EpicDetailHeader } from "../components/epics/EpicDetailHeader";
import { EpicProgressOverview } from "../components/epics/EpicProgressOverview";
import { EpicTicketsList } from "../components/epics/EpicTicketsList";
import { EpicLearnings } from "../components/epics/EpicLearnings";
import { EpicCostPanel } from "../components/epics/EpicCostPanel";
import { TicketDescription } from "../components/tickets/TicketDescription";
import { ShipChangesModal } from "../components/tickets";
import EpicModal from "../components/EpicModal";
import { useToast } from "../components/Toast";
import { queryKeys } from "../lib/query-keys";

export const Route = createFileRoute("/epic/$id")({
  component: EpicDetailPage,
  errorComponent: EpicDetailError,
});

function EpicDetailError({ error }: { error: Error }) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const { showToast } = useToast();
  console.error("Epic detail error:", error);

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
        <h2 style={errorTitleStyles}>Epic Not Found</h2>
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

function EpicDetailSkeleton() {
  return (
    <div style={containerStyles}>
      <div style={backNavStyles}>
        <div style={{ ...skeletonStyles, width: "120px", height: "20px" }} />
      </div>

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

      <div style={progressSectionStyles}>
        <div
          style={{
            ...skeletonStyles,
            width: "100%",
            height: "24px",
            marginBottom: "var(--spacing-3)",
          }}
        />
        <div style={{ ...skeletonStyles, width: "100%", height: "12px" }} />
      </div>

      <div style={contentGridStyles}>
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
    </div>
  );
}

function EpicDetailPage() {
  const { id } = useParams({ from: "/epic/$id" });
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [showEditModal, setShowEditModal] = useState(false);
  const [showShipModal, setShowShipModal] = useState(false);
  const [isPushingChanges, setIsPushingChanges] = useState(false);

  const { data: epicDetail, loading: isLoading, error, refetch } = useEpicDetail(id);

  const handleBackNavigation = useCallback(async () => {
    try {
      if (canGoBack) {
        router.history.back();
      } else {
        await router.navigate({ to: "/board" });
      }
    } catch {
      showToast("error", "Failed to navigate back. Please try again.");
    }
  }, [canGoBack, router, showToast]);

  const handleEdit = useCallback(() => {
    setShowEditModal(true);
  }, []);

  const handleEditClose = useCallback(() => {
    setShowEditModal(false);
  }, []);

  const invalidateEpicDetail = useCallback(async () => {
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: queryKeys.epicDetail(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projectsWithEpics }),
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets }),
    ]);
  }, [id, queryClient, refetch]);

  const handleEditSuccess = useCallback(() => {
    void refetch();
    void queryClient.invalidateQueries({ queryKey: queryKeys.projectsWithEpics });
    setShowEditModal(false);
  }, [refetch, queryClient]);

  const handleShipSuccess = useCallback(() => {
    void invalidateEpicDetail();
    setShowShipModal(false);
  }, [invalidateEpicDetail]);

  const handlePushChanges = useCallback(async () => {
    setIsPushingChanges(true);

    try {
      const result = await pushBranchServerFn({
        data: {
          scopeType: "epic",
          scopeId: id,
        },
      });

      if (result.success) {
        showToast("success", `Pushed ${result.branchName}`);
        await invalidateEpicDetail();
        return;
      }

      showToast("error", result.error);
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Failed to push branch");
    } finally {
      setIsPushingChanges(false);
    }
  }, [id, invalidateEpicDetail, showToast]);

  if (isLoading) {
    return <EpicDetailSkeleton />;
  }

  if (error || !epicDetail) {
    return (
      <div style={errorContainerStyles}>
        <div style={errorCardStyles}>
          <AlertCircle size={48} style={{ color: "var(--accent-danger)" }} />
          <h2 style={errorTitleStyles}>Epic Not Found</h2>
          <p style={errorMessageStyles}>{error || `Could not find epic with ID: ${id}`}</p>
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

  const ticketsTotal =
    epicDetail.workflowState?.ticketsTotal ??
    Object.values(epicDetail.ticketsByStatus).reduce((a, b) => a + b, 0);
  const ticketsDone = epicDetail.ticketsByStatus["done"] ?? 0;

  return (
    <div style={containerStyles}>
      <button
        type="button"
        onClick={handleBackNavigation}
        style={backNavLinkStyles}
        className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft size={16} />
        Back to Board
      </button>

      <EpicDetailHeader
        epic={epicDetail.epic}
        project={epicDetail.project}
        ticketsByStatus={epicDetail.ticketsByStatus}
        workflowState={epicDetail.workflowState}
        tickets={epicDetail.tickets}
        findingsSummary={epicDetail.findingsSummary}
        criticalFindings={epicDetail.criticalFindings}
        onShipChanges={() => setShowShipModal(true)}
        onPushChanges={handlePushChanges}
        isPushingChanges={isPushingChanges}
        onEdit={handleEdit}
      />

      <section style={progressSectionStyles}>
        <EpicProgressOverview
          ticketsByStatus={epicDetail.ticketsByStatus}
          ticketsTotal={ticketsTotal}
          ticketsDone={ticketsDone}
          currentTicketId={epicDetail.workflowState?.currentTicketId ?? null}
        />
      </section>

      <div style={contentGridStyles}>
        <section style={sectionStyles}>
          <TicketDescription
            description={epicDetail.epic.description}
            testId="epic-detail-description"
          />
        </section>

        <section style={sectionStyles}>
          <EpicTicketsList tickets={epicDetail.tickets} />
        </section>
      </div>

      <section style={sectionStyles}>
        <EpicCostPanel epicId={epicDetail.epic.id} />
      </section>

      <section style={sectionStyles}>
        <EpicLearnings learnings={epicDetail.workflowState?.learnings ?? []} />
      </section>

      {epicDetail.reviewRuns.length > 0 ? (
        <section style={reviewRunsSectionStyles} data-testid="epic-review-runs">
          <div style={reviewRunsHeaderStyles}>
            <h2 style={reviewRunsTitleStyles}>Focused Review Runs</h2>
            <span style={reviewRunsMetaStyles}>
              {epicDetail.reviewRuns.length} run{epicDetail.reviewRuns.length === 1 ? "" : "s"}
            </span>
          </div>

          <div style={reviewRunsListStyles}>
            {epicDetail.reviewRuns.slice(0, 3).map((run) => (
              <article key={run.id} style={reviewRunCardStyles}>
                <div style={reviewRunCardHeaderStyles}>
                  <strong style={reviewRunCardTitleStyles}>Run {run.id.slice(0, 8)}</strong>
                  <span style={reviewRunStatusStyles}>{run.status}</span>
                </div>
                <div style={reviewRunMetaStyles}>
                  {run.selectedTickets
                    .map((ticket) =>
                      ticket.summary
                        ? `${ticket.title} (${ticket.status}: ${ticket.summary})`
                        : `${ticket.title} (${ticket.status})`
                    )
                    .join(", ")}
                </div>
                <div style={reviewRunMetaStyles}>
                  {run.findingsTotal} finding{run.findingsTotal === 1 ? "" : "s"} •{" "}
                  {run.findingsFixed} fixed • Demo {run.demoGenerated ? "generated" : "pending"}
                </div>
                {run.summary ? <div style={reviewRunSummaryStyles}>{run.summary}</div> : null}
                {run.steeringPrompt ? (
                  <div style={reviewRunSteeringStyles}>Steering: {run.steeringPrompt}</div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <footer style={metadataStyles}>
        <span>Created: {new Date(epicDetail.epic.createdAt).toLocaleString()}</span>
      </footer>

      {showEditModal && (
        <EpicModal
          epic={{
            id: epicDetail.epic.id,
            title: epicDetail.epic.title,
            description: epicDetail.epic.description,
            projectId: epicDetail.epic.projectId,
            color: epicDetail.epic.color,
          }}
          projectId={epicDetail.epic.projectId}
          onClose={handleEditClose}
          onSave={handleEditSuccess}
        />
      )}

      {showShipModal && (
        <ShipChangesModal
          isOpen={showShipModal}
          onClose={() => setShowShipModal(false)}
          projectPath={epicDetail.project.path}
          scopeType="epic"
          scopeId={epicDetail.epic.id}
          scopeTitle={epicDetail.epic.title}
          branchName={epicDetail.workflowState?.epicBranchName ?? undefined}
          onSuccess={handleShipSuccess}
        />
      )}
    </div>
  );
}

const containerStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-6)",
  padding: "var(--spacing-6)",
  maxWidth: "1200px",
  margin: "0 auto",
  height: "100%",
  overflowY: "auto",
};

const backNavStyles: React.CSSProperties = {
  marginBottom: "var(--spacing-2)",
};

const backNavLinkStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  color: "var(--text-secondary)",
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  padding: "var(--spacing-2) var(--spacing-3)",
  borderRadius: "var(--radius-md)",
  transition: "background-color 0.15s, color 0.15s",
  cursor: "pointer",
  background: "transparent",
  border: "none",
};

const headerSectionStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-3)",
  paddingBottom: "var(--spacing-4)",
  borderBottom: "1px solid var(--border-primary)",
};

const progressSectionStyles: React.CSSProperties = {
  padding: "var(--spacing-4)",
  background: "var(--bg-secondary)",
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--border-primary)",
};

const contentGridStyles: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "var(--spacing-6)",
};

const sectionStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-3)",
};

const reviewRunsSectionStyles: React.CSSProperties = {
  ...sectionStyles,
  padding: "var(--spacing-4)",
  background: "var(--bg-secondary)",
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--border-primary)",
};

const reviewRunsHeaderStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--spacing-3)",
};

const reviewRunsTitleStyles: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--font-size-lg)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
};

const reviewRunsMetaStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-muted)",
};

const reviewRunsListStyles: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "var(--spacing-3)",
};

const reviewRunCardStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-3)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-primary)",
  background: "var(--bg-primary)",
};

const reviewRunCardHeaderStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--spacing-2)",
};

const reviewRunCardTitleStyles: React.CSSProperties = {
  color: "var(--text-primary)",
};

const reviewRunStatusStyles: React.CSSProperties = {
  textTransform: "capitalize",
  fontSize: "var(--font-size-xs)",
  color: "var(--text-muted)",
};

const reviewRunMetaStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-secondary)",
};

const reviewRunSummaryStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-primary)",
};

const reviewRunSteeringStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  color: "var(--text-muted)",
};

const metadataStyles: React.CSSProperties = {
  display: "flex",
  gap: "var(--spacing-4)",
  flexWrap: "wrap",
  padding: "var(--spacing-4)",
  borderTop: "1px solid var(--border-primary)",
  fontSize: "var(--font-size-xs)",
  color: "var(--text-muted)",
};

const errorContainerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  padding: "var(--spacing-6)",
};

const errorCardStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "var(--spacing-4)",
  padding: "var(--spacing-8)",
  background: "var(--bg-secondary)",
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--border-primary)",
  textAlign: "center",
  maxWidth: "400px",
};

const errorTitleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xl)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  margin: 0,
};

const errorMessageStyles: React.CSSProperties = {
  color: "var(--text-secondary)",
  margin: 0,
};

const backLinkStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-2) var(--spacing-4)",
  background: "var(--accent-primary)",
  color: "white",
  borderRadius: "var(--radius-md)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  marginTop: "var(--spacing-2)",
  cursor: "pointer",
  border: "none",
};

const skeletonStyles: React.CSSProperties = {
  background: "var(--bg-tertiary)",
  borderRadius: "var(--radius-md)",
  animation: "pulse 1.5s ease-in-out infinite",
};
