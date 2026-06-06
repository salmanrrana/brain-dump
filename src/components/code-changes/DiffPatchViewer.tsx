import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export interface DiffPatchViewerProps {
  patch: string;
  wordWrap?: boolean;
  maxHeight?: number;
}

const DEFAULT_MAX_HEIGHT = 560;
const LARGE_PATCH_BYTES = 1_000_000;
// Above this size we do not auto-render. Splitting and virtualizing a multi-MB
// patch can still stall the main thread, so we show an explicit fallback with an
// opt-in "Render anyway" instead of risking a frozen or blank panel.
const OVERSIZED_PATCH_BYTES = 5_000_000;

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
  }
  if (bytes >= 1_000) {
    return `${Math.round(bytes / 1_000)} KB`;
  }
  return `${bytes} B`;
}

function getLineClassName(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return "bg-[var(--success-muted)] text-[var(--text-primary)]";
  }

  if (line.startsWith("-") && !line.startsWith("---")) {
    return "bg-[var(--accent-danger)]/10 text-[var(--text-primary)]";
  }

  if (line.startsWith("@@")) {
    return "bg-[var(--info-muted)] text-[var(--info)]";
  }

  return "text-[var(--text-secondary)]";
}

function isBinaryPatch(patch: string): boolean {
  return patch.includes("Binary files ") || patch.includes("GIT binary patch");
}

export function DiffPatchViewer({
  patch,
  wordWrap = true,
  maxHeight = DEFAULT_MAX_HEIGHT,
}: DiffPatchViewerProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const isOversized = patch.length > OVERSIZED_PATCH_BYTES;
  const [forceRender, setForceRender] = useState(false);

  // Reset the opt-in render whenever the selected patch changes, so switching to
  // another oversized file always re-shows the guard instead of silently
  // rendering it.
  useEffect(() => {
    setForceRender(false);
  }, [patch]);

  const showOversizedGuard = isOversized && !forceRender;
  const lines = useMemo(
    () => (showOversizedGuard ? [] : patch.split("\n")),
    [patch, showOversizedGuard]
  );
  // Rows are not a fixed height: a wrapped (word-wrap) line or a long unwrapped
  // line is taller than the estimate. The `ref={virtualizer.measureElement}` on
  // each row measures its real height (via the library default), keeping the
  // absolute offsets in sync so lines never stack on top of one another.
  // estimateSize is only the pre-measurement placeholder.
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 22,
    overscan: 12,
  });

  if (!patch.trim()) {
    return (
      <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-tertiary)]">
        The selected change has no textual patch to display.
      </div>
    );
  }

  if (isBinaryPatch(patch)) {
    return (
      <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4">
        <h4 className="text-sm font-medium text-[var(--text-primary)]">Binary file</h4>
        <p className="mt-1 text-sm text-[var(--text-tertiary)]">
          This change is binary, so Brain Dump cannot render an inline text diff.
        </p>
      </div>
    );
  }

  if (showOversizedGuard) {
    return (
      <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4">
        <h4 className="text-sm font-medium text-[var(--text-primary)]">Diff is very large</h4>
        <p className="mt-1 text-sm text-[var(--text-tertiary)]">
          This patch is {formatBytes(patch.length)}. Rendering it inline may make the page
          unresponsive. Open the change in your editor or pull request, or render it anyway.
        </p>
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-2 rounded-md border border-[var(--border-primary)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/40"
          onClick={() => setForceRender(true)}
        >
          Render anyway
        </button>
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]">
      {patch.length > LARGE_PATCH_BYTES && (
        <div className="border-b border-[var(--border-primary)] bg-[var(--warning-muted)] px-3 py-2 text-xs text-[var(--warning)]">
          Large patch rendered with virtualization to keep scrolling responsive.
        </div>
      )}
      <div
        ref={parentRef}
        className="overflow-auto font-mono text-xs leading-5"
        style={{ maxHeight }}
        aria-label="Unified diff"
      >
        <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualItems.map((virtualRow) => {
            const line = lines[virtualRow.index] ?? "";
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className={`absolute left-0 top-0 flex min-w-full ${getLineClassName(line)}`}
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <span className="w-12 shrink-0 select-none border-r border-[var(--border-primary)] px-2 text-right text-[var(--text-tertiary)]">
                  {virtualRow.index + 1}
                </span>
                <code
                  className={`block px-3 py-0.5 ${wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`}
                >
                  {line || " "}
                </code>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
