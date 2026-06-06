import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export interface DiffPatchViewerProps {
  patch: string;
  wordWrap?: boolean;
  maxHeight?: number;
}

const DEFAULT_MAX_HEIGHT = 560;
const LARGE_PATCH_BYTES = 1_000_000;

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
  const lines = useMemo(() => patch.split("\n"), [patch]);
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
