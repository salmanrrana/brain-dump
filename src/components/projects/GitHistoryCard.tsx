import { useState, useEffect, useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useGitProjectInfo, useGitCommitsInfinite, useCommitFileStats } from "../../lib/hooks";
import type { Commit } from "../../api/git-info";
import { skeletonLineStyles } from "./shared-styles";

const VIRTUALIZATION_THRESHOLD = 20;
const COMMIT_ROW_HEIGHT_ESTIMATE = 36;

interface GitHistoryCardProps {
  projectPath: string;
}

function CommitLink({
  url,
  children,
  title,
}: {
  url: string | null;
  children: React.ReactNode;
  title?: string;
}) {
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:underline hover:text-[var(--accent-primary)]"
        title={title}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </a>
    );
  }
  return <>{children}</>;
}

// =============================================================================
// CommitRow — extracted so each row can call useCommitFileStats
// =============================================================================

interface CommitRowProps {
  commit: Commit;
  remoteUrl: string | null;
  projectPath: string;
  isExpanded: boolean;
  onToggle: () => void;
}

function CommitRow({ commit, remoteUrl, projectPath, isExpanded, onToggle }: CommitRowProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const { data: fileStats, isLoading: statsLoading } = useCommitFileStats(
    projectPath,
    commit.hash,
    isExpanded
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function handleCopyHash(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(commit.hash).catch(() => {});
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        style={commitItemStyles}
        className="group relative"
      >
        <span style={chevronStyles}>{isExpanded ? "\u25BE" : "\u25B8"}</span>

        <CommitLink
          url={remoteUrl ? `${remoteUrl}/commit/${commit.hash}` : null}
          title="View on GitHub"
        >
          <span style={commitHashStyles}>{commit.hash.substring(0, 7)}</span>
        </CommitLink>

        <span style={commitShortMessageStyles} title={commit.message}>
          {commit.message}
        </span>

        <button
          onClick={handleCopyHash}
          title="Copy commit hash"
          type="button"
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[var(--bg-hover)] rounded focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] transition-opacity"
        >
          {copied ? (
            <span style={{ color: "var(--accent-primary)", fontSize: "10px" }}>Copied!</span>
          ) : (
            <span style={{ fontSize: "12px" }}>📋</span>
          )}
        </button>
      </div>

      {isExpanded && (
        <div style={expandedPanelStyles}>
          {/* Author + date — available instantly from already-fetched data */}
          <div style={commitDetailRowStyles}>
            <span style={detailLabelStyles}>Author</span>
            <span style={detailValueStyles}>{commit.author}</span>
          </div>
          <div style={commitDetailRowStyles}>
            <span style={detailLabelStyles}>Date</span>
            <span style={detailValueStyles}>{commit.date}</span>
          </div>

          {/* File stats — lazy loaded */}
          {statsLoading && (
            <div style={fileStatsLoadingStyles}>
              <span style={miniSpinnerStyles} className="animate-spin" />
              <span>Loading file changes...</span>
            </div>
          )}

          {fileStats && (
            <div style={fileStatsContainerStyles}>
              <div style={fileStatsSummaryStyles}>
                {fileStats.files.length} file{fileStats.files.length !== 1 ? "s" : ""} changed
                {fileStats.totalInsertions > 0 && (
                  <span style={insertionsStyles}> +{fileStats.totalInsertions}</span>
                )}
                {fileStats.totalDeletions > 0 && (
                  <span style={deletionsStyles}> -{fileStats.totalDeletions}</span>
                )}
              </div>

              <div style={fileListStyles}>
                {fileStats.files.map((file) => (
                  <div key={file.filename} style={fileRowStyles}>
                    <span style={fileNameStyles} title={file.filename}>
                      {file.filename}
                    </span>
                    {file.isBinary ? (
                      <span style={binaryBadgeStyles}>binary</span>
                    ) : (
                      <span style={fileCountsStyles}>
                        {file.insertions > 0 && (
                          <span style={insertionsStyles}>+{file.insertions}</span>
                        )}
                        {file.deletions > 0 && (
                          <span style={deletionsStyles}>-{file.deletions}</span>
                        )}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// GitHistoryCard — main component
// =============================================================================

export default function GitHistoryCard({ projectPath }: GitHistoryCardProps) {
  const { data: projectInfo, isLoading, error } = useGitProjectInfo(projectPath);
  const {
    data: commitsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: commitsLoading,
  } = useGitCommitsInfinite(projectPath);
  const [expandedHash, setExpandedHash] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Intersection observer for infinite scroll
  const observerCallback = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(observerCallback, { threshold: 0.1 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [observerCallback]);

  const allCommits = commitsData?.pages.flatMap((page) => page.commits) ?? [];

  function handleToggle(hash: string) {
    setExpandedHash((prev) => (prev === hash ? null : hash));
  }

  return (
    <div style={panelStyles}>
      {/* Sticky header */}
      <div style={headerStyles}>
        <h2 style={headerTitleStyles}>Git Activity</h2>
        {projectInfo?.branch && (
          <span style={branchBadgeStyles} title={projectInfo.branch}>
            {projectInfo.branch}
          </span>
        )}
      </div>

      {/* Scrollable content */}
      <div style={scrollAreaStyles}>
        {isLoading && commitsLoading && (
          <div style={loadingContainerStyles}>
            <div style={skeletonLineStyles} />
            <div style={skeletonLineStyles} />
            <div style={skeletonLineStyles} />
            <div style={skeletonLineStyles} />
          </div>
        )}

        {error && (
          <div style={errorContainerStyles}>
            <p style={errorTextStyles}>Could not fetch git history</p>
          </div>
        )}

        {!isLoading && !error && projectInfo && (
          <>
            {projectInfo.hasUncommittedChanges && (
              <div style={changesIndicatorStyles}>
                <span style={changesDotStyles}>●</span>
                <span style={changesTextStyles}>Uncommitted changes</span>
              </div>
            )}

            {projectInfo.lastCommit && (
              <div style={lastCommitStyles}>
                <p style={sectionLabelStyles}>Latest commit</p>
                <p style={commitMessageStyles} title={projectInfo.lastCommit.message}>
                  {projectInfo.lastCommit.message}
                </p>
                <p style={commitMetaStyles}>
                  <CommitLink
                    url={
                      projectInfo.remoteUrl
                        ? `${projectInfo.remoteUrl}/commit/${projectInfo.lastCommit.hash}`
                        : null
                    }
                    title="View on GitHub"
                  >
                    {projectInfo.lastCommit.date}
                  </CommitLink>{" "}
                  by {projectInfo.lastCommit.author}
                </p>
              </div>
            )}

            {!projectInfo.lastCommit && !commitsLoading && allCommits.length === 0 && (
              <p style={emptyTextStyles}>No commits yet</p>
            )}

            {allCommits.length > 0 && (
              <div style={commitSectionStyles}>
                <p style={sectionLabelStyles}>History</p>
                <VirtualizedCommitList
                  commits={allCommits}
                  remoteUrl={projectInfo.remoteUrl}
                  projectPath={projectPath}
                  expandedHash={expandedHash}
                  onToggle={handleToggle}
                />

                {/* Sentinel for intersection observer */}
                <div ref={sentinelRef} style={{ height: 1 }} />

                {isFetchingNextPage && (
                  <div style={loadingMoreStyles}>
                    <span style={spinnerStyles} className="animate-spin" />
                    Loading more commits...
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// VirtualizedCommitList — renders commit rows with optional virtualization
// =============================================================================

interface VirtualizedCommitListProps {
  commits: Commit[];
  remoteUrl: string | null;
  projectPath: string;
  expandedHash: string | null;
  onToggle: (hash: string) => void;
}

function VirtualizedCommitList({
  commits,
  remoteUrl,
  projectPath,
  expandedHash,
  onToggle,
}: VirtualizedCommitListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const useVirtual = commits.length > VIRTUALIZATION_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: commits.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => COMMIT_ROW_HEIGHT_ESTIMATE,
    overscan: 5,
    enabled: useVirtual,
  });

  if (!useVirtual) {
    return (
      <div style={commitListStyles}>
        {commits.map((commit) => (
          <CommitRow
            key={commit.hash}
            commit={commit}
            remoteUrl={remoteUrl}
            projectPath={projectPath}
            isExpanded={expandedHash === commit.hash}
            onToggle={() => onToggle(commit.hash)}
          />
        ))}
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollContainerRef}
      style={{ ...commitListStyles, maxHeight: 400, overflowY: "auto" }}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualItems.map((virtualRow) => {
          const commit = commits[virtualRow.index];
          if (!commit) return null;
          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <CommitRow
                commit={commit}
                remoteUrl={remoteUrl}
                projectPath={projectPath}
                isExpanded={expandedHash === commit.hash}
                onToggle={() => onToggle(commit.hash)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// STYLES
// =============================================================================

// Panel fills its grid cell
const panelStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  background: "var(--bg-secondary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-md)",
  overflow: "hidden",
};

const headerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-3)",
  padding: "var(--spacing-3) var(--spacing-4)",
  borderBottom: "1px solid var(--border-primary)",
  background: "var(--bg-secondary)",
  flexShrink: 0,
  overflow: "hidden",
};

const headerTitleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-md)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  margin: 0,
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const branchBadgeStyles: React.CSSProperties = {
  fontSize: "10px",
  color: "var(--text-tertiary)",
  background: "var(--bg-tertiary)",
  padding: "1px var(--spacing-1)",
  borderRadius: "var(--radius-sm)",
  fontFamily: "var(--font-mono)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: 0,
  flexShrink: 1,
};

const scrollAreaStyles: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "var(--spacing-3) var(--spacing-4)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-3)",
};

const loadingContainerStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-2)",
};

const errorContainerStyles: React.CSSProperties = {
  padding: "var(--spacing-2)",
  background: "var(--bg-destructive-subtle)",
  border: "1px solid var(--border-destructive)",
  borderRadius: "var(--radius-sm)",
};

const errorTextStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-destructive)",
  margin: 0,
};

const changesIndicatorStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-2) var(--spacing-3)",
  background: "var(--bg-warning-subtle)",
  border: "1px solid var(--border-warning)",
  borderRadius: "var(--radius-sm)",
};

const changesDotStyles: React.CSSProperties = {
  color: "var(--text-warning)",
  fontSize: "var(--font-size-sm)",
};

const changesTextStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  color: "var(--text-warning)",
};

const lastCommitStyles: React.CSSProperties = {
  padding: "var(--spacing-2) var(--spacing-3)",
  background: "var(--bg-tertiary)",
  borderRadius: "var(--radius-sm)",
  borderLeft: "3px solid var(--accent-primary)",
};

const sectionLabelStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  color: "var(--text-tertiary)",
  margin: "0 0 var(--spacing-1) 0",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const commitMessageStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  margin: "0 0 var(--spacing-1) 0",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const commitMetaStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  color: "var(--text-tertiary)",
  margin: 0,
};

const commitSectionStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-2)",
};

const commitListStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-1)",
};

const commitItemStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-2)",
  background: "transparent",
  border: "1px solid transparent",
  borderRadius: "var(--radius-sm)",
  fontSize: "var(--font-size-xs)",
  color: "var(--text-secondary)",
  transition: "all var(--transition-fast)",
  cursor: "pointer",
};

const chevronStyles: React.CSSProperties = {
  fontSize: "10px",
  color: "var(--text-tertiary)",
  flexShrink: 0,
  width: "10px",
  textAlign: "center",
};

const commitHashStyles: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  color: "var(--text-tertiary)",
  flexShrink: 0,
};

const commitShortMessageStyles: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  flex: 1,
};

// Expanded panel
const expandedPanelStyles: React.CSSProperties = {
  padding:
    "var(--spacing-2) var(--spacing-3) var(--spacing-3) calc(var(--spacing-2) + 10px + var(--spacing-2))",
  fontSize: "var(--font-size-xs)",
  color: "var(--text-secondary)",
  borderLeft: "2px solid var(--border-primary)",
  marginLeft: "var(--spacing-2)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-2)",
};

const commitDetailRowStyles: React.CSSProperties = {
  display: "flex",
  gap: "var(--spacing-2)",
};

const detailLabelStyles: React.CSSProperties = {
  color: "var(--text-tertiary)",
  minWidth: "48px",
  flexShrink: 0,
};

const detailValueStyles: React.CSSProperties = {
  color: "var(--text-primary)",
};

// File stats
const fileStatsLoadingStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  color: "var(--text-tertiary)",
  padding: "var(--spacing-1) 0",
};

const miniSpinnerStyles: React.CSSProperties = {
  display: "inline-block",
  width: "12px",
  height: "12px",
  border: "1.5px solid var(--border-primary)",
  borderTopColor: "var(--accent-primary)",
  borderRadius: "50%",
  flexShrink: 0,
};

const fileStatsContainerStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-1)",
  marginTop: "var(--spacing-1)",
};

const fileStatsSummaryStyles: React.CSSProperties = {
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  color: "var(--text-secondary)",
};

const fileListStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1px",
  fontFamily: "var(--font-mono)",
  fontSize: "11px",
};

const fileRowStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "1px 0",
};

const fileNameStyles: React.CSSProperties = {
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  direction: "rtl",
  textAlign: "left",
  color: "var(--text-secondary)",
};

const fileCountsStyles: React.CSSProperties = {
  display: "flex",
  gap: "var(--spacing-2)",
  flexShrink: 0,
};

const insertionsStyles: React.CSSProperties = {
  color: "#4ade80",
};

const deletionsStyles: React.CSSProperties = {
  color: "#f87171",
};

const binaryBadgeStyles: React.CSSProperties = {
  color: "var(--text-tertiary)",
  fontStyle: "italic",
  flexShrink: 0,
};

const loadingMoreStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--spacing-2)",
  fontSize: "var(--font-size-xs)",
  color: "var(--text-tertiary)",
  padding: "var(--spacing-3) 0",
};

const spinnerStyles: React.CSSProperties = {
  display: "inline-block",
  width: "14px",
  height: "14px",
  border: "2px solid var(--border-primary)",
  borderTopColor: "var(--accent-primary)",
  borderRadius: "50%",
};

const emptyTextStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-tertiary)",
  margin: 0,
  textAlign: "center",
  padding: "var(--spacing-8) 0",
};
