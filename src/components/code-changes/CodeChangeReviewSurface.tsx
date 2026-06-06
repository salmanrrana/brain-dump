import { useMemo } from "react";
import { AlertCircle, GitBranch, Loader2, RotateCw } from "lucide-react";
import { ChangedFilesTree } from "./ChangedFilesTree";
import { DiffPatchViewer } from "./DiffPatchViewer";
import { useCodeChangePatch } from "../../lib/hooks/code-changes";
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

export interface CodeChangeReviewSurfaceProps {
  scope: CodeChangeScope;
  summary: CodeChangeSummaryResult | null;
  open: boolean;
  selection: CodeChangeSelection;
  loading?: boolean;
  error?: string | null;
  onSelectionChange?: (selection: CodeChangeSelectionPatch) => void;
  onRetrySummary?: () => void;
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
  return status.replace(/_/g, " ");
}

function GroupStats({
  files,
  additions,
  deletions,
}: {
  files: number;
  additions: number;
  deletions: number;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-xs tabular-nums">
      <span className="text-[var(--text-tertiary)]">
        {files} file{files === 1 ? "" : "s"}
      </span>
      <span className="text-[var(--success)]">+{additions}</span>
      <span className="text-[var(--accent-danger)]">-{deletions}</span>
    </span>
  );
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

  if (!summary || visibleFiles.length === 0) {
    return <EmptyState message={getStateMessage(summary)} onRetry={onRetrySummary} />;
  }

  const patch = patchQuery.patch?.patches[0]?.patch;
  const patchState = patchQuery.patch?.state;

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
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Code changes</h2>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">
            {summary.totals.files} files, +{summary.totals.additions} / -{summary.totals.deletions}
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

      {summary.groups.length > 1 && (
        <div
          className="mb-4 flex flex-wrap gap-2"
          role="group"
          aria-label="Ticket code-change groups"
        >
          <button
            type="button"
            aria-pressed={!selection.selectedTicketId}
            className={`flex flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/40 ${
              !selection.selectedTicketId
                ? "border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/10"
                : "border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)]"
            }`}
            onClick={() =>
              onSelectionChange?.({
                selectedTicketId: null,
                selectedFilePath: null,
                selectedSourceId: null,
              })
            }
          >
            <span
              className={`text-xs font-semibold ${
                !selection.selectedTicketId
                  ? "text-[var(--accent-primary)]"
                  : "text-[var(--text-primary)]"
              }`}
            >
              All tickets
            </span>
            <GroupStats
              files={summary.totals.files}
              additions={summary.totals.additions}
              deletions={summary.totals.deletions}
            />
          </button>
          {summary.groups.map((group) => {
            const active = selection.selectedTicketId === group.ticketId;
            const sourceLabel = describeGroupSources(group);
            return (
              <button
                key={group.ticketId}
                type="button"
                aria-pressed={active}
                className={`flex max-w-[18rem] flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/40 ${
                  active
                    ? "border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/10"
                    : "border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)]"
                }`}
                onClick={() =>
                  onSelectionChange?.({
                    selectedTicketId: group.ticketId,
                    selectedFilePath: null,
                    selectedSourceId: null,
                  })
                }
              >
                <span className="flex w-full items-center gap-2">
                  <span
                    className={`min-w-0 flex-1 truncate text-xs font-semibold ${
                      active ? "text-[var(--accent-primary)]" : "text-[var(--text-primary)]"
                    }`}
                  >
                    {group.title}
                  </span>
                  <span className="shrink-0 rounded-full bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">
                    {formatStatusLabel(group.status)}
                  </span>
                </span>
                <GroupStats
                  files={group.totals.files}
                  additions={group.totals.additions}
                  deletions={group.totals.deletions}
                />
                {sourceLabel && (
                  <span className="max-w-full truncate text-[11px] text-[var(--text-tertiary)]">
                    {sourceLabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
        <ChangedFilesTree
          files={visibleFiles}
          selectedFilePath={selection.selectedFilePath}
          selectedSourceId={selection.selectedSourceId}
          sharedFilePaths={selection.selectedTicketId ? undefined : sharedFilePaths}
          onSelectFile={(file, sourceId) => {
            const group = visibleGroups.find((candidate) =>
              candidate.files.some((item) => item.path === file.path)
            );
            const nextSelection: CodeChangeSelectionPatch = {
              selectedFilePath: file.path,
              selectedSourceId: sourceId,
            };
            const nextTicketId = group?.ticketId ?? selection.selectedTicketId;
            if (nextTicketId) {
              nextSelection.selectedTicketId = nextTicketId;
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
                <EmptyState message={patchQuery.error} onRetry={() => void patchQuery.refetch()} />
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
                patch && <DiffPatchViewer patch={patch} wordWrap={selection.wordWrap} />}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
