import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen } from "lucide-react";
import type { CodeChangeFileSummary } from "../../lib/hooks/code-changes";
import { buildCodeChangeFileTree, type CodeChangeFileTreeNode } from "./file-tree";

export interface ChangedFilesTreeProps {
  files: CodeChangeFileSummary[];
  selectedFilePath?: string | undefined;
  selectedSourceId?: string | undefined;
  onSelectFile?: ((file: CodeChangeFileSummary, sourceId: string) => void) | undefined;
  className?: string;
}

function collectDirectoryIds(nodes: CodeChangeFileTreeNode[]): string[] {
  const ids: string[] = [];

  for (const node of nodes) {
    if (node.type === "directory") {
      ids.push(node.id, ...collectDirectoryIds(node.children));
    }
  }

  return ids;
}

function formatStats(additions: number, deletions: number): string {
  return `+${additions} / -${deletions}`;
}

function FileStats({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span
      className="ml-auto inline-flex items-center gap-1 text-xs tabular-nums"
      aria-label={formatStats(additions, deletions)}
    >
      <span className="text-[var(--success)]">+{additions}</span>
      <span className="text-[var(--accent-danger)]">-{deletions}</span>
    </span>
  );
}

const MAX_RENDERED_CHILDREN_PER_DIRECTORY = 300;

function TreeNode({
  node,
  depth,
  expandedIds,
  selectedFilePath,
  selectedSourceId,
  onToggle,
  onSelectFile,
}: {
  node: CodeChangeFileTreeNode;
  depth: number;
  expandedIds: Set<string>;
  selectedFilePath?: string | undefined;
  selectedSourceId?: string | undefined;
  onToggle: (nodeId: string) => void;
  onSelectFile?: ((file: CodeChangeFileSummary, sourceId: string) => void) | undefined;
}) {
  const isExpanded = expandedIds.has(node.id);
  const paddingLeft = `${depth * 0.875 + 0.5}rem`;

  if (node.type === "directory") {
    const visibleChildren = node.children.slice(0, MAX_RENDERED_CHILDREN_PER_DIRECTORY);
    const hiddenChildren = node.children.length - visibleChildren.length;

    return (
      <li>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/40"
          style={{ paddingLeft }}
          aria-expanded={isExpanded}
          onClick={() => onToggle(node.id)}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          <span className="text-xs text-[var(--text-tertiary)]">{node.files}</span>
          <FileStats additions={node.additions} deletions={node.deletions} />
        </button>
        {isExpanded && (
          <ul className="mt-0.5 space-y-0.5">
            {visibleChildren.map((child) => (
              <TreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                expandedIds={expandedIds}
                selectedFilePath={selectedFilePath}
                selectedSourceId={selectedSourceId}
                onToggle={onToggle}
                onSelectFile={onSelectFile}
              />
            ))}
            {hiddenChildren > 0 && (
              <li
                className="px-2 py-1.5 text-xs text-[var(--text-tertiary)]"
                style={{ paddingLeft: `${(depth + 1) * 0.875 + 0.5}rem` }}
              >
                {hiddenChildren} more files hidden to keep the tree responsive. Narrow the ticket or
                source selection to review them.
              </li>
            )}
          </ul>
        )}
      </li>
    );
  }

  const file = node.file;
  const sourceId =
    selectedSourceId && file?.sourceIds.includes(selectedSourceId)
      ? selectedSourceId
      : (file?.sourceIds[0] ?? "");
  const isSelected = node.path === selectedFilePath;

  return (
    <li>
      <button
        type="button"
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/40 ${
          isSelected
            ? "bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
        }`}
        style={{ paddingLeft }}
        aria-current={isSelected ? "true" : undefined}
        onClick={() => {
          if (file && sourceId) {
            onSelectFile?.(file, sourceId);
          }
        }}
      >
        <FileText size={14} />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {file?.binary && (
          <span className="rounded-full bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-[10px] uppercase text-[var(--text-tertiary)]">
            binary
          </span>
        )}
        <span className="text-xs text-[var(--text-tertiary)]">{file?.status}</span>
        <FileStats additions={node.additions} deletions={node.deletions} />
      </button>
    </li>
  );
}

export function ChangedFilesTree({
  files,
  selectedFilePath,
  selectedSourceId,
  onSelectFile,
  className = "",
}: ChangedFilesTreeProps) {
  const tree = useMemo(() => buildCodeChangeFileTree(files), [files]);
  const allDirectoryIds = useMemo(() => collectDirectoryIds(tree), [tree]);
  const treeKey = allDirectoryIds.join("\0");
  const [expandedState, setExpandedState] = useState<{ treeKey: string; ids: Set<string> }>(() => ({
    treeKey,
    ids: new Set(allDirectoryIds),
  }));
  const expandedIds =
    expandedState.treeKey === treeKey ? expandedState.ids : new Set(allDirectoryIds);

  if (files.length === 0) {
    return (
      <div
        className={`rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-tertiary)] ${className}`}
      >
        No changed files to display.
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] ${className}`}
    >
      <div className="flex items-center justify-between border-b border-[var(--border-primary)] px-3 py-2">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">Changed files</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/40"
            onClick={() => setExpandedState({ treeKey, ids: new Set(allDirectoryIds) })}
          >
            Expand all
          </button>
          <button
            type="button"
            className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/40"
            onClick={() => setExpandedState({ treeKey, ids: new Set() })}
          >
            Collapse all
          </button>
        </div>
      </div>
      <ul className="max-h-[32rem] space-y-0.5 overflow-auto p-2" aria-label="Changed files">
        {tree.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            expandedIds={expandedIds}
            selectedFilePath={selectedFilePath}
            selectedSourceId={selectedSourceId}
            onToggle={(nodeId) => {
              setExpandedState((current) => {
                const currentIds =
                  current.treeKey === treeKey ? current.ids : new Set(allDirectoryIds);
                const next = new Set(currentIds);
                if (next.has(nodeId)) {
                  next.delete(nodeId);
                } else {
                  next.add(nodeId);
                }
                return { treeKey, ids: next };
              });
            }}
            onSelectFile={onSelectFile}
          />
        ))}
      </ul>
    </div>
  );
}
