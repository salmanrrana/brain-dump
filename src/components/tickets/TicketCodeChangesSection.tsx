import { lazy, Suspense, useEffect, useMemo, useRef } from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileDiff,
  GitBranch,
  Loader2,
} from "lucide-react";
import { useTicketCodeChangeSummary } from "../../lib/hooks/code-changes";
import type {
  CodeChangeRouteSearchPatch,
  CodeChangeRouteSearchState,
} from "../../lib/code-change-route-search";

// The diff review surface pulls in the virtualized patch renderer, which is heavy
// and only needed once the panel is opened. Lazy-loading it keeps the ticket route
// initial chunk lean (no diff renderer until the user reviews changes).
const CodeChangeReviewSurface = lazy(() =>
  import("../code-changes").then((module) => ({ default: module.CodeChangeReviewSurface }))
);

function SurfaceFallback() {
  return (
    <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 text-sm text-[var(--text-tertiary)]">
      <span className="inline-flex items-center gap-2">
        <Loader2 size={16} className="animate-spin" />
        Loading diff viewer...
      </span>
    </div>
  );
}

export interface TicketCodeChangesSectionProps {
  ticketId: string;
  prUrl?: string | null | undefined;
  prNumber?: number | null | undefined;
  branchName?: string | null | undefined;
  search: CodeChangeRouteSearchState;
  onSearchChange: (patch: CodeChangeRouteSearchPatch) => void;
}

/**
 * Compact, non-blocking "Code changes" entry point for ticket detail.
 *
 * The summary loads lazily after page paint (it is never fetched in the route
 * loader). The compact state answers "are there changes, how many files, how big,
 * and from what source" before the user opens the full review surface. Full patch
 * text is only fetched once the panel is open and a file is selected.
 */
export function TicketCodeChangesSection({
  ticketId,
  prUrl,
  prNumber,
  branchName,
  search,
  onSearchChange,
}: TicketCodeChangesSectionProps) {
  const scope = useMemo(() => ({ type: "ticket" as const, id: ticketId }), [ticketId]);
  const { summary, loading, fetching, error, refetch } = useTicketCodeChangeSummary(ticketId);

  // Reconcile stale selection when navigating between tickets. A deep-linked or
  // carried-over file/source/ticket selection from a different ticket must not
  // leave the panel filtering against the wrong group, so reset selection (but
  // keep open + view preferences) whenever the ticket id changes.
  const previousTicketId = useRef(ticketId);
  useEffect(() => {
    if (previousTicketId.current === ticketId) {
      return;
    }
    previousTicketId.current = ticketId;
    if (search.selectedFilePath || search.selectedSourceId || search.selectedTicketId) {
      onSearchChange({
        selectedFilePath: null,
        selectedSourceId: null,
        selectedTicketId: null,
      });
    }
  }, [
    ticketId,
    search.selectedFilePath,
    search.selectedSourceId,
    search.selectedTicketId,
    onSearchChange,
  ]);

  const totals = summary?.totals;
  const hasChanges = (totals?.files ?? 0) > 0;
  const open = search.open;
  // Opening is allowed when there are changes to review, or when the summary
  // failed to load so the user can reach the review surface's Retry affordance.
  const canOpen = hasChanges || Boolean(error);

  // For a single-ticket scope there is only ever one group, so the surface must
  // not filter by a (possibly stale) selectedTicketId. We pass it through as
  // undefined and only forward the file/source selection.
  const selection = useMemo(
    () => ({
      selectedFilePath: search.selectedFilePath,
      selectedSourceId: search.selectedSourceId,
      wordWrap: search.wordWrap,
      ignoreWhitespace: search.ignoreWhitespace,
    }),
    [search.selectedFilePath, search.selectedSourceId, search.wordWrap, search.ignoreWhitespace]
  );

  const statusMessage = useMemo(() => {
    if (loading) {
      return "Checking for linked code changes...";
    }
    if (error) {
      return error;
    }
    if (!summary) {
      return "Code-change summary is not available yet.";
    }
    if (hasChanges) {
      return `${totals?.files} changed file${totals?.files === 1 ? "" : "s"}`;
    }
    return summary.state?.message ?? "No linked code changes are available for this ticket.";
  }, [loading, error, summary, hasChanges, totals?.files]);

  const handleToggleOpen = () => {
    onSearchChange({ open: !open });
  };

  return (
    <section
      className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] p-5"
      aria-labelledby="ticket-code-changes-heading"
      data-testid="ticket-code-changes-section"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/40"
          aria-expanded={open}
          aria-controls="ticket-code-changes-surface"
          onClick={handleToggleOpen}
          disabled={!canOpen}
        >
          <span className="mt-0.5 text-[var(--text-tertiary)]">
            {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <FileDiff size={16} className="text-[var(--text-secondary)]" />
              <span
                id="ticket-code-changes-heading"
                className="text-base font-semibold text-[var(--text-primary)]"
              >
                Code changes
              </span>
              {fetching && !loading && (
                <Loader2 size={14} className="animate-spin text-[var(--text-tertiary)]" />
              )}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--text-tertiary)]">
              <span>{statusMessage}</span>
              {hasChanges && totals && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <span className="text-[var(--success)]">+{totals.additions}</span>
                  <span className="text-[var(--accent-danger)]">-{totals.deletions}</span>
                </span>
              )}
            </span>
          </span>
        </button>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {branchName && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-2 py-1 text-xs text-[var(--text-secondary)]">
              <GitBranch size={12} />
              <span className="max-w-[12rem] truncate">{branchName}</span>
            </span>
          )}
          {prUrl && (
            <a
              href={prUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border-primary)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/40"
            >
              <ExternalLink size={12} />
              {prNumber ? `PR #${prNumber}` : "Pull request"}
            </a>
          )}
          {hasChanges && (
            <button
              type="button"
              className="rounded-md border border-[var(--border-primary)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/40"
              onClick={handleToggleOpen}
            >
              {open ? "Hide diff" : "Review changes"}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div id="ticket-code-changes-surface" className="mt-4">
          <Suspense fallback={<SurfaceFallback />}>
            <CodeChangeReviewSurface
              scope={scope}
              summary={summary}
              open={open}
              selection={selection}
              loading={loading}
              error={error}
              onSelectionChange={onSearchChange}
              onRetrySummary={() => void refetch()}
              onClose={() => onSearchChange({ open: false })}
            />
          </Suspense>
        </div>
      )}
    </section>
  );
}
