import {
  createFileRoute,
  useParams,
  useRouter,
  useCanGoBack,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useMemo } from "react";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { pushBranchServerFn } from "../api/ship-server-fns";
import { useEpicDetail } from "../lib/hooks";
import { getEpicDetail } from "../api/epics";
import { getEpicCost } from "../api/cost";
import { EpicDetailHeader } from "../components/epics/EpicDetailHeader";
import { EpicProgressOverview } from "../components/epics/EpicProgressOverview";
import { EpicTicketsList } from "../components/epics/EpicTicketsList";
import { EpicLearnings } from "../components/epics/EpicLearnings";
import { EpicInsights } from "../components/epics/EpicInsights";
import { EpicCostPanel } from "../components/epics/EpicCostPanel";
import { EpicCodeChangesSection } from "../components/epics/EpicCodeChangesSection";
import { TicketDescription } from "../components/tickets/TicketDescription";
import { ShipChangesModal } from "../components/tickets";
import {
  DetailPageLayout,
  DetailPageFullBleed,
  DetailPageBody,
  DetailPagePrimary,
  DetailPageRail,
  DetailPageProse,
} from "../components/layout/DetailPageLayout";
import EpicModal from "../components/EpicModal";
import { useToast } from "../components/Toast";
import { queryKeys } from "../lib/query-keys";
import {
  applyCodeChangeSearchToObject,
  parseCodeChangeRouteSearch,
  type CodeChangeRouteSearchPatch,
} from "../lib/code-change-route-search";

export const Route = createFileRoute("/epic/$id")({
  loader: async ({ context, params }) => {
    const epicId = params.id;
    // Pre-warm both epic detail and epic cost in parallel to avoid waterfall
    await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: queryKeys.epicDetail(epicId),
        queryFn: () => getEpicDetail({ data: epicId }),
        staleTime: 30_000,
      }),
      context.queryClient.ensureQueryData({
        queryKey: queryKeys.cost.epicCost(epicId),
        queryFn: () => getEpicCost({ data: epicId }),
        staleTime: 300_000,
      }),
    ]);
  },
  // Render the skeleton during loader suspension, matching the sibling ticket
  // route so the two detail pages share the same loading behavior.
  pendingComponent: EpicDetailSkeleton,
  component: EpicDetailPage,
  errorComponent: EpicDetailError,
  // Normalize the code-changes panel state (open/close + selected ticket/source/
  // file) into stable query params so the panel can be deep-linked and restored.
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

        {/* Progress overview skeleton */}
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
      </DetailPageFullBleed>

      <DetailPageBody>
        <DetailPagePrimary>
          {/* Description skeleton */}
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

          {/* Tickets list skeleton */}
          <div style={{ ...skeletonStyles, width: "100%", height: "240px" }} />
        </DetailPagePrimary>

        <DetailPageRail ariaLabel="Epic cost, insights, and learnings">
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

function EpicDetailPage() {
  const { id } = useParams({ from: "/epic/$id" });
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Code-changes panel state lives in the URL so the panel can be deep-linked
  // and restored. Parse once per search change into the shared route-search shape.
  const rawSearch = useSearch({ from: "/epic/$id" });
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
    <DetailPageLayout>
      {/* Full-bleed top: back nav, header, progress overview, and the aggregated
          diff surface all want the full bounded canvas width. */}
      <DetailPageFullBleed style={fullBleedTopStyles}>
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

        <EpicCodeChangesSection
          epicId={epicDetail.epic.id}
          branchName={epicDetail.workflowState?.epicBranchName}
          prNumber={epicDetail.workflowState?.prNumber}
          prUrl={epicDetail.workflowState?.prUrl}
          search={codeChangeSearch}
          onSearchChange={handleCodeChangeSearch}
        />
      </DetailPageFullBleed>

      {/* Two-column body: the epic description and tickets list are the primary
          reading column; the scan-and-monitor panels live in the sticky rail. */}
      <DetailPageBody>
        <DetailPagePrimary>
          {/* Epic description - prose-capped even though the page is wide. */}
          <DetailPageProse>
            <TicketDescription
              description={epicDetail.epic.description}
              testId="epic-detail-description"
            />
          </DetailPageProse>

          {/* Tickets list - the heart of an epic, given the prominent primary
              region. Self-carded; rendered on the page surface (no clone wrapper). */}
          <EpicTicketsList tickets={epicDetail.tickets} />
        </DetailPagePrimary>

        <DetailPageRail ariaLabel="Epic cost, insights, and learnings">
          {/* Cost / Insights / Learnings - each self-carded scan-and-monitor
              panel; no extra wrapper so we avoid nested-card scaffolding. */}
          <EpicCostPanel epicId={epicDetail.epic.id} />
          <EpicInsights
            insights={epicDetail.workflowState?.insights ?? []}
            analyzedAt={epicDetail.workflowState?.analyzedAt ?? null}
          />
          <EpicLearnings
            epicId={epicDetail.epic.id}
            learnings={epicDetail.workflowState?.learnings ?? []}
          />

          {/* Metadata - compact footer-style block, not a heavy card. */}
          <footer style={metadataStyles}>
            <span>Created: {new Date(epicDetail.epic.createdAt).toLocaleString()}</span>
          </footer>
        </DetailPageRail>
      </DetailPageBody>

      {/* Review Runs - the auto-fit grid wants the full canvas width, so it
          hosts in a full-bleed region below the body. Only when present. */}
      {epicDetail.reviewRuns.length > 0 ? (
        <DetailPageFullBleed>
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
        </DetailPageFullBleed>
      ) : null}

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
    </DetailPageLayout>
  );
}

// Full-bleed top region: stacks back-nav, header, progress overview, and the
// aggregated code-changes diff with rhythmic spacing. The outer canvas
// width/centering is owned by DetailPageLayout, so this only controls vertical
// flow. Mirrors the ticket-detail page so the two read as a consistent family.
const fullBleedTopStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-6)",
};

const backNavLinkStyles: React.CSSProperties = {
  display: "inline-flex",
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

const progressSectionStyles: React.CSSProperties = {
  padding: "var(--spacing-5)",
  background: "var(--bg-card)",
  borderRadius: "var(--radius-xl)",
  border: "1px solid var(--border-primary)",
};

// Subtle anchor for skeleton placeholders in the rail, mirroring the
// ticket-detail page so the loading state of both pages matches.
const railCardStyles: React.CSSProperties = {
  padding: "var(--spacing-4)",
  background: "var(--bg-card)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-lg)",
};

const reviewRunsSectionStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-4)",
  padding: "var(--spacing-5)",
  background: "var(--bg-card)",
  borderRadius: "var(--radius-xl)",
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
  fontSize: "var(--font-size-sm)",
  fontFamily: "var(--font-mono)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  letterSpacing: "var(--tracking-wide)",
  textTransform: "uppercase" as const,
  color: "var(--text-secondary)",
};

const reviewRunsMetaStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  fontFamily: "var(--font-mono)",
  color: "var(--text-muted)",
};

const reviewRunsListStyles: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: "var(--spacing-3)",
};

const reviewRunCardStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-4)",
  borderRadius: "var(--radius-xl)",
  border: "1px solid var(--border-primary)",
  background: "var(--bg-primary)",
  transition: "all var(--transition-normal)",
};

const reviewRunCardHeaderStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--spacing-2)",
};

const reviewRunCardTitleStyles: React.CSSProperties = {
  color: "var(--text-primary)",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--font-size-sm)",
};

const reviewRunStatusStyles: React.CSSProperties = {
  textTransform: "capitalize",
  fontSize: "var(--font-size-xs)",
  fontFamily: "var(--font-mono)",
  color: "var(--text-muted)",
};

const reviewRunMetaStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-secondary)",
};

const reviewRunSummaryStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-primary)",
  lineHeight: "var(--line-height-relaxed)",
};

const reviewRunSteeringStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  fontFamily: "var(--font-mono)",
  color: "var(--text-muted)",
};

// Metadata footer in the rail: a compact column separated from the panels above
// by a hairline rule — not a heavy bordered card, so it reads as a quiet
// footnote rather than another monitor widget (matches the ticket-detail page).
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
  fontFamily: "var(--font-sans)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  marginTop: "var(--spacing-2)",
  cursor: "pointer",
  border: "none",
  boxShadow: "var(--shadow-sm)",
};

const skeletonStyles: React.CSSProperties = {
  background: "var(--bg-tertiary)",
  borderRadius: "var(--radius-lg)",
  animation: "pulse 2s ease-in-out infinite",
};
