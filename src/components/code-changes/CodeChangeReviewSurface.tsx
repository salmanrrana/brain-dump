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
  className = "",
}: CodeChangeReviewSurfaceProps) {
  const visibleGroups = useMemo(
    () => filterGroups(summary?.groups ?? [], selection.selectedTicketId),
    [summary?.groups, selection.selectedTicketId]
  );
  const visibleFiles = useMemo(() => flattenFiles(visibleGroups), [visibleGroups]);
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
        <div className="mb-4 flex flex-wrap gap-2" aria-label="Ticket code-change groups">
          <button
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              !selection.selectedTicketId
                ? "bg-[var(--accent-primary)] text-white"
                : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            }`}
            onClick={() =>
              onSelectionChange?.({
                selectedTicketId: null,
                selectedFilePath: null,
                selectedSourceId: null,
              })
            }
          >
            All tickets
          </button>
          {summary.groups.map((group) => (
            <button
              key={group.ticketId}
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                selection.selectedTicketId === group.ticketId
                  ? "bg-[var(--accent-primary)] text-white"
                  : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              }`}
              onClick={() =>
                onSelectionChange?.({
                  selectedTicketId: group.ticketId,
                  selectedFilePath: null,
                  selectedSourceId: null,
                })
              }
            >
              {group.title} · {group.totals.files}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
        <ChangedFilesTree
          files={visibleFiles}
          selectedFilePath={selection.selectedFilePath}
          selectedSourceId={selection.selectedSourceId}
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
