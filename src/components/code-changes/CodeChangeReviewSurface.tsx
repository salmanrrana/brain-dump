import { useMemo, type ReactNode } from "react";
import { AlertCircle, GitBranch, Loader2, RotateCw } from "lucide-react";
import { ChangedFilesTree } from "./ChangedFilesTree";
import { DiffPatchViewer } from "./DiffPatchViewer";
import { useCodeChangePatch } from "../../lib/hooks/code-changes";
import { PRIORITY_BADGE_CONFIG, getPrStatusBadgeStyle } from "../../lib/constants";
import type {
  CodeChangeFileSummary,
  CodeChangeScope,
  CodeChangeSource,
  CodeChangeSummaryResult,
  TicketCodeChangeGroup,
} from "../../lib/hooks/code-changes";

export interface CodeChangeSelection {
  selectedTicketId?: string | undefined;
  selectedSourceId?: string | undefined;
  selectedFilePath?: string | undefined;
  wordWrap: boolean;
  ignoreWhitespace: boolean;
}

export interface CodeChangeSelectionPatch {
  selectedTicketId?: string | null | undefined;
  selectedSourceId?: string | null | undefined;
  selectedFilePath?: string | null | undefined;
  wordWrap?: boolean;
  ignoreWhitespace?: boolean;
}

export interface CodeChangeTicketMeta {
  priority?: string | null | undefined;
  isBlocked?: boolean | null | undefined;
  blockedReason?: string | null | undefined;
  branchName?: string | null | undefined;
  prNumber?: number | null | undefined;
  prUrl?: string | null | undefined;
  prStatus?: string | null | undefined;
}

export interface CodeChangeReviewSurfaceProps {
  scope: CodeChangeScope;
  summary: CodeChangeSummaryResult | null;
  open: boolean;
  selection: CodeChangeSelection;
  loading?: boolean;
  error?: string | null;
  onSelectionChange?: (selection: CodeChangeSelectionPatch) => void;
  onRetrySummary?: () => void;
  ticketMetaById?: Record<string, CodeChangeTicketMeta> | undefined;
  currentTicketId?: string | null | undefined;
  /**
   * Called when the user dismisses the review surface from within it (Escape
   * key). Lets the host route close the panel without forcing keyboard users to
   * tab back up to the header toggle.
   */
  onClose?: () => void;
  className?: string;
}

interface SelectedFileContext {
  group: TicketCodeChangeGroup;
  file: CodeChangeFileSummary;
  sourceId: string;
}

function getStateMessage(summary: CodeChangeSummaryResult | null): string {
  if (!summary) {
    return "Code-change summary has not loaded yet.";
  }

  if (summary.groups.length === 0) {
    return summary.state.message;
  }

  const unavailableGroup = summary.groups.find((group) => group.state.kind !== "available");
  if (unavailableGroup) {
    return unavailableGroup.state.message;
  }

  return summary.state.message;
}

function filterGroups(
  groups: TicketCodeChangeGroup[],
  selectedTicketId?: string
): TicketCodeChangeGroup[] {
  if (!selectedTicketId) {
    return groups;
  }

  return groups.filter((group) => group.ticketId === selectedTicketId);
}

function findSelectedFile(
  groups: TicketCodeChangeGroup[],
  selection: CodeChangeSelection
): SelectedFileContext | null {
  if (selection.selectedSourceId) {
    for (const group of groups) {
      const file = group.files.find(
        (candidate) =>
          candidate.path === selection.selectedFilePath &&
          candidate.sourceIds.includes(selection.selectedSourceId ?? "")
      );
      if (!file) {
        continue;
      }

      return { group, file, sourceId: selection.selectedSourceId };
    }
  }

  for (const group of groups) {
    const file = group.files.find((candidate) => candidate.path === selection.selectedFilePath);
    if (!file) {
      continue;
    }

    const sourceId =
      selection.selectedSourceId && file.sourceIds.includes(selection.selectedSourceId)
        ? selection.selectedSourceId
        : (file.sourceIds[0] ?? "");

    if (!sourceId) {
      return null;
    }

    return { group, file, sourceId };
  }

  return null;
}

function flattenFiles(groups: TicketCodeChangeGroup[]): CodeChangeFileSummary[] {
  const byPath = new Map<string, CodeChangeFileSummary>();

  for (const group of groups) {
    for (const file of group.files) {
      const existing = byPath.get(file.path);
      if (!existing) {
        byPath.set(file.path, { ...file });
        continue;
      }

      byPath.set(file.path, {
        ...existing,
        additions: existing.additions + file.additions,
        deletions: existing.deletions + file.deletions,
        sourceIds: Array.from(new Set([...existing.sourceIds, ...file.sourceIds])),
      });
    }
  }

  return Array.from(byPath.values()).sort((a, b) => a.path.localeCompare(b.path));
}

function findSource(groups: TicketCodeChangeGroup[], sourceId: string): CodeChangeSource | null {
  for (const group of groups) {
    const source = group.sources.find((candidate) => candidate.id === sourceId);
    if (source) {
      return source;
    }
  }

  return null;
}

/**
 * Paths that appear in more than one ticket group. Used to flag files shared
 * across tickets in an epic so the boundary is obvious even when several tickets
 * touch the same file.
 */
function computeSharedFilePaths(groups: TicketCodeChangeGroup[]): Set<string> {
  const ticketsByPath = new Map<string, Set<string>>();

  for (const group of groups) {
    for (const file of group.files) {
      const tickets = ticketsByPath.get(file.path) ?? new Set<string>();
      tickets.add(group.ticketId);
      ticketsByPath.set(file.path, tickets);
    }
  }

  const shared = new Set<string>();
  for (const [path, tickets] of ticketsByPath) {
    if (tickets.size > 1) {
      shared.add(path);
    }
  }

  return shared;
}

/**
 * Short, human-readable source context for a ticket group (e.g. "Commit abc1234"
 * or "Branch feature/x +1 more") shown on the ticket strip.
 */
function describeGroupSources(group: TicketCodeChangeGroup): string | null {
  if (group.sources.length === 0) {
    return null;
  }

  const [first, ...rest] = group.sources;
  if (!first) {
    return null;
  }

  return rest.length > 0 ? `${first.label} +${rest.length} more` : first.label;
}

function formatStatusLabel(status: string): string {
  const normalized = status.replace(/_/g, " ");
  if (normalized === "ai review") {
    return "AI Review";
  }

  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function GroupFileCount({ files }: { files: number }) {
  return (
    <span className="text-xs tabular-nums text-[var(--text-secondary)]">
      {files} file{files === 1 ? "" : "s"}
    </span>
  );
}

function GroupChangeStats({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs tabular-nums">
      <span className="text-[var(--success)]">+{additions}</span>
      <span className="text-[var(--accent-danger)]">-{deletions}</span>
    </span>
  );
}

function GroupStatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex w-fit items-center rounded-full border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
      {formatStatusLabel(status)}
    </span>
  );
}

function GroupTag({
  children,
  className = "border-[var(--border-primary)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]",
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string | undefined;
}) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${className}`}
      title={title}
    >
      {children}
    </span>
  );
}

function GroupTags({
  group,
  meta,
  currentTicketId,
  aggregateCount,
}: {
  group?: TicketCodeChangeGroup | undefined;
  meta?: CodeChangeTicketMeta | undefined;
  currentTicketId?: string | null | undefined;
  aggregateCount?: number | undefined;
}) {
  if (!group) {
    return (
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        <GroupTag>{aggregateCount ?? 0} tickets</GroupTag>
      </span>
    );
  }

  const priority = meta?.priority ? PRIORITY_BADGE_CONFIG[meta.priority] : null;
  const hasLinkedSource = group.sources.length > 0;

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      {priority && (
        <GroupTag className={`${priority.className} border-transparent`}>{priority.label}</GroupTag>
      )}
      {currentTicketId === group.ticketId && (
        <GroupTag className="border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]">
          Current
        </GroupTag>
      )}
      {meta?.isBlocked && (
        <GroupTag
          className="border-[var(--warning)]/30 bg-[var(--warning-muted)] text-[var(--warning)]"
          title={meta.blockedReason ?? undefined}
        >
          Blocked
        </GroupTag>
      )}
      {meta?.prNumber && (
        <GroupTag className={`${getPrStatusBadgeStyle(meta.prStatus)} border-transparent`}>
          PR #{meta.prNumber}
        </GroupTag>
      )}
      {!hasLinkedSource && <GroupTag>No source</GroupTag>}
    </span>
  );
}

function ticketGroupRowClass(active: boolean): string {
  return `grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-[var(--border-primary)] px-3 py-2.5 text-left transition-colors last:border-b-0 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--accent-primary)]/40 lg:grid-cols-[minmax(0,1.25fr)_7.5rem_minmax(8rem,0.8fr)_5rem_7rem_minmax(0,12rem)] ${
    active ? "bg-[var(--accent-primary)]/10" : "bg-transparent hover:bg-[var(--bg-hover)]"
  }`;
}

function SourcePill({ source }: { source: CodeChangeSource }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-2 py-1 text-xs text-[var(--text-secondary)]">
      <GitBranch size={12} />
      {source.label}
    </span>
  );
}

function EmptyState({ message, onRetry }: { message: string; onRetry?: (() => void) | undefined }) {
  return (
    <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5">
      <div className="flex items-start gap-3">
        <AlertCircle size={18} className="mt-0.5 text-[var(--text-tertiary)]" />
        <div>
          <h3 className="text-sm font-medium text-[var(--text-primary)]">
            No code changes to review
          </h3>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">{message}</p>
          {onRetry && (
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-2 rounded-md border border-[var(--border-primary)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/40"
              onClick={onRetry}
            >
              <RotateCw size={12} />
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 text-sm text-[var(--text-tertiary)]">
      <span className="inline-flex items-center gap-2">
        <Loader2 size={16} className="animate-spin" />
        Loading code-change summary...
      </span>
    </div>
  );
}

export function CodeChangeReviewSurface({
  scope,
  summary,
  open,
  selection,
  loading = false,
  error = null,
  onSelectionChange,
  onRetrySummary,
  ticketMetaById,
  currentTicketId,
  onClose,
  className = "",
}: CodeChangeReviewSurfaceProps) {
  const visibleGroups = useMemo(
    () => filterGroups(summary?.groups ?? [], selection.selectedTicketId),
    [summary?.groups, selection.selectedTicketId]
  );
  const visibleFiles = useMemo(() => flattenFiles(visibleGroups), [visibleGroups]);
  // Shared paths are computed across the whole scope (not just visible groups)
  // so the "shared" marker is stable, and only surfaced in the aggregate "All
  // tickets" view where multiple groups are combined.
  const sharedFilePaths = useMemo(
    () => computeSharedFilePaths(summary?.groups ?? []),
    [summary?.groups]
  );
  const selectedFile = useMemo(
    () => findSelectedFile(visibleGroups, selection),
    [visibleGroups, selection]
  );
  const selectedSource = selectedFile ? findSource(visibleGroups, selectedFile.sourceId) : null;
  const patchQuery = useCodeChangePatch(
    {
      scope,
      ...(selectedFile?.group.ticketId ? { ticketId: selectedFile.group.ticketId } : {}),
      ...(selectedFile?.sourceId ? { sourceId: selectedFile.sourceId } : {}),
      ...(selectedFile?.file.path ? { filePath: selectedFile.file.path } : {}),
      ...(selection.ignoreWhitespace ? { ignoreWhitespace: true } : {}),
    },
    { enabled: open && Boolean(selectedFile) }
  );

  if (!open) {
    return null;
  }

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return <EmptyState message={error} onRetry={onRetrySummary} />;
  }

  if (!summary || (summary.groups.length === 0 && visibleFiles.length === 0)) {
    return <EmptyState message={getStateMessage(summary)} onRetry={onRetrySummary} />;
  }

  const patch = patchQuery.patch?.patches[0]?.patch;
  const patchState = patchQuery.patch?.state;
  const showWorkLedger = scope.type === "epic" && summary.groups.length > 0;
  const showAggregateRow = summary.groups.length > 1;

  return (
    <section
      className={`rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 ${className}`}
      onKeyDown={
        onClose
          ? (event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                onClose();
              }
            }
          : undefined
      }
    >
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            {showWorkLedger ? "Work ledger" : "Code changes"}
          </h2>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">
            {showWorkLedger
              ? `${summary.groups.length} ticket${summary.groups.length === 1 ? "" : "s"}, ${summary.totals.files} changed file${summary.totals.files === 1 ? "" : "s"}`
              : `${summary.totals.files} files, +${summary.totals.additions} / -${summary.totals.deletions}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`rounded-md border px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/40 ${
              selection.wordWrap
                ? "border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]"
                : "border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            }`}
            aria-pressed={selection.wordWrap}
            onClick={() => onSelectionChange?.({ wordWrap: !selection.wordWrap })}
          >
            Word wrap
          </button>
          <button
            type="button"
            className={`rounded-md border px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/40 ${
              selection.ignoreWhitespace
                ? "border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]"
                : "border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            }`}
            aria-pressed={selection.ignoreWhitespace}
            onClick={() => onSelectionChange?.({ ignoreWhitespace: !selection.ignoreWhitespace })}
          >
            Ignore whitespace
          </button>
        </div>
      </div>

      {showWorkLedger && (
        <div
          className="mb-4 overflow-hidden rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)]"
          role="group"
          aria-label="Epic tickets and code-change groups"
        >
          <div className="hidden grid-cols-[minmax(0,1.25fr)_7.5rem_minmax(8rem,0.8fr)_5rem_7rem_minmax(0,12rem)] gap-x-3 border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-3 py-2 text-[11px] font-medium text-[var(--text-tertiary)] lg:grid">
            <span>Ticket</span>
            <span>Status</span>
            <span>Tags</span>
            <span>Files</span>
            <span>Changes</span>
            <span>Source</span>
          </div>
          {showAggregateRow && (
            <button
              type="button"
              aria-pressed={!selection.selectedTicketId}
              className={ticketGroupRowClass(!selection.selectedTicketId)}
              onClick={() =>
                onSelectionChange?.({
                  selectedTicketId: null,
                  selectedFilePath: null,
                  selectedSourceId: null,
                })
              }
            >
              <span
                className={`col-start-1 min-w-0 truncate text-sm font-semibold lg:col-auto ${
                  !selection.selectedTicketId
                    ? "text-[var(--accent-primary)]"
                    : "text-[var(--text-primary)]"
                }`}
              >
                All tickets
              </span>
              <span className="col-start-2 justify-self-end lg:col-auto lg:justify-self-start">
                <GroupStatusBadge status="aggregate" />
              </span>
              <span className="col-start-1 lg:col-auto">
                <GroupTags aggregateCount={summary.groups.length} />
              </span>
              <span className="col-start-1 lg:col-auto">
                <GroupFileCount files={summary.totals.files} />
              </span>
              <span className="col-start-2 justify-self-end lg:col-auto lg:justify-self-start">
                <GroupChangeStats
                  additions={summary.totals.additions}
                  deletions={summary.totals.deletions}
                />
              </span>
              <span className="hidden min-w-0 truncate text-xs text-[var(--text-tertiary)] lg:block">
                All linked sources
              </span>
            </button>
          )}
          {summary.groups.map((group) => {
            const active = selection.selectedTicketId === group.ticketId;
            const sourceLabel = describeGroupSources(group);
            const meta = ticketMetaById?.[group.ticketId];
            return (
              <button
                key={group.ticketId}
                type="button"
                aria-pressed={active}
                className={ticketGroupRowClass(active)}
                onClick={() =>
                  onSelectionChange?.({
                    selectedTicketId: group.ticketId,
                    selectedFilePath: null,
                    selectedSourceId: null,
                  })
                }
              >
                <span className="col-start-1 min-w-0 lg:col-auto">
                  <span
                    className={`block truncate text-sm font-semibold ${
                      active ? "text-[var(--accent-primary)]" : "text-[var(--text-primary)]"
                    }`}
                  >
                    {group.title}
                  </span>
                  {sourceLabel && (
                    <span className="mt-0.5 block truncate text-[11px] text-[var(--text-tertiary)] lg:hidden">
                      {sourceLabel}
                    </span>
                  )}
                </span>
                <span className="col-start-2 justify-self-end lg:col-auto lg:justify-self-start">
                  <GroupStatusBadge status={group.status} />
                </span>
                <span className="col-start-1 lg:col-auto">
                  <GroupTags group={group} meta={meta} currentTicketId={currentTicketId} />
                </span>
                <span className="col-start-1 lg:col-auto">
                  <GroupFileCount files={group.totals.files} />
                </span>
                <span className="col-start-2 justify-self-end lg:col-auto lg:justify-self-start">
                  <GroupChangeStats
                    additions={group.totals.additions}
                    deletions={group.totals.deletions}
                  />
                </span>
                <span className="hidden min-w-0 truncate text-xs text-[var(--text-tertiary)] lg:block">
                  {sourceLabel ?? "No linked source"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {visibleFiles.length === 0 ? (
        <EmptyState message={getStateMessage(summary)} onRetry={onRetrySummary} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
          <ChangedFilesTree
            files={visibleFiles}
            selectedFilePath={selection.selectedFilePath}
            selectedSourceId={selection.selectedSourceId}
            sharedFilePaths={selection.selectedTicketId ? undefined : sharedFilePaths}
            onSelectFile={(file, sourceId) => {
              const group =
                visibleGroups.find((candidate) =>
                  candidate.files.some(
                    (item) => item.path === file.path && item.sourceIds.includes(sourceId)
                  )
                ) ??
                visibleGroups.find((candidate) =>
                  candidate.files.some((item) => item.path === file.path)
                );
              const nextSelection: CodeChangeSelectionPatch = {
                selectedFilePath: file.path,
                selectedSourceId: sourceId,
              };
              const nextTicketId = group?.ticketId ?? selection.selectedTicketId;
              if ((scope.type === "ticket" || selection.selectedTicketId) && nextTicketId) {
                nextSelection.selectedTicketId = nextTicketId;
              } else if (scope.type === "epic") {
                nextSelection.selectedTicketId = null;
              }
              onSelectionChange?.(nextSelection);
            }}
          />

          <div className="min-w-0">
            {!selectedFile && (
              <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 text-sm text-[var(--text-tertiary)]">
                Select a file to load its diff.
              </div>
            )}

            {selectedFile && (
              <div className="space-y-3">
                <div className="flex flex-col gap-2 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {selectedFile.file.path}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                      {selectedFile.group.title} · {selectedFile.file.status}
                    </p>
                  </div>
                  {selectedSource && <SourcePill source={selectedSource} />}
                </div>

                {patchQuery.loading || patchQuery.fetching ? (
                  <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 text-sm text-[var(--text-tertiary)]">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      Loading patch...
                    </span>
                  </div>
                ) : null}

                {patchQuery.error && (
                  <EmptyState
                    message={patchQuery.error}
                    onRetry={() => void patchQuery.refetch()}
                  />
                )}

                {!patchQuery.loading &&
                  !patchQuery.fetching &&
                  !patchQuery.error &&
                  patchState?.kind !== "available" &&
                  patchState && (
                    <EmptyState
                      message={patchState.message}
                      onRetry={() => void patchQuery.refetch()}
                    />
                  )}

                {!patchQuery.loading &&
                  !patchQuery.fetching &&
                  !patchQuery.error &&
                  patchState?.kind === "available" &&
                  patch && (
                    <DiffPatchViewer
                      patch={patch}
                      filePath={selectedFile.file.path}
                      wordWrap={selection.wordWrap}
                    />
                  )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
