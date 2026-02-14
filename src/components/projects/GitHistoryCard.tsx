import { useState, useCallback } from "react";
import { useGitProjectInfo } from "../../lib/hooks";
import {
  cardStyles,
  cardHeaderStyles,
  cardContentStyles,
  errorStyles,
  errorTextStyles,
  skeletonLineStyles,
} from "./shared-styles";

interface GitHistoryCardProps {
  projectPath: string;
}

export default function GitHistoryCard({ projectPath }: GitHistoryCardProps) {
  const { data, isLoading, error } = useGitProjectInfo(projectPath);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const handleCopyHash = useCallback(async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHash(hash);
      setTimeout(() => setCopiedHash(null), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) - no action needed
    }
  }, []);

  return (
    <div style={cardStyles}>
      <h3 style={cardHeaderStyles}>📊 Git Activity</h3>

      {isLoading && (
        <div style={cardContentStyles}>
          <div style={skeletonLineStyles} />
          <div style={skeletonLineStyles} />
          <div style={skeletonLineStyles} />
        </div>
      )}

      {error && (
        <div style={errorStyles}>
          <p style={errorTextStyles}>Could not fetch git history</p>
        </div>
      )}

      {!isLoading && !error && data && (
        <div style={cardContentStyles}>
          {data.lastCommit ? (
            <div style={lastCommitStyles}>
              <p style={lastCommitTitleStyles}>Latest:</p>
              <p style={commitMessageStyles} title={data.lastCommit.message}>
                {data.lastCommit.message}
              </p>
              <p style={commitMetaStyles}>
                {data.lastCommit.date} by {data.lastCommit.author}
              </p>
            </div>
          ) : (
            <p style={emptyTextStyles}>No commits yet</p>
          )}

          {data.recentCommits.length > 0 && (
            <div style={recentCommitsStyles}>
              <p style={recentTitleStyles}>Recent Commits:</p>
              <div style={commitListStyles}>
                {data.recentCommits.map((commit) => (
                  <button
                    key={commit.hash}
                    style={commitItemStyles}
                    onClick={() => handleCopyHash(commit.hash)}
                    title="Click to copy commit hash"
                    type="button"
                    className="hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                  >
                    <span style={copiedHash === commit.hash ? copiedHashStyles : commitHashStyles}>
                      {copiedHash === commit.hash ? "Copied!" : commit.hash.substring(0, 7)}
                    </span>
                    <span style={commitShortMessageStyles} title={commit.message}>
                      {commit.message}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {data.hasUncommittedChanges && (
            <div style={changesIndicatorStyles}>
              <span style={changesDotStyles}>●</span>
              <span style={changesTextStyles}>Uncommitted changes</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const lastCommitStyles: React.CSSProperties = {
  padding: "var(--spacing-2) var(--spacing-3)",
  background: "var(--bg-tertiary)",
  borderRadius: "var(--radius-sm)",
  borderLeft: "3px solid var(--accent-primary)",
};

const lastCommitTitleStyles: React.CSSProperties = {
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

const recentCommitsStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-2)",
};

const recentTitleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  color: "var(--text-tertiary)",
  margin: 0,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
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
  padding: "var(--spacing-2) var(--spacing-2)",
  background: "transparent",
  border: "1px solid transparent",
  borderRadius: "var(--radius-sm)",
  fontSize: "var(--font-size-xs)",
  color: "var(--text-secondary)",
  cursor: "pointer",
  transition: "all var(--transition-fast)",
  textAlign: "left",
};

const commitHashStyles: React.CSSProperties = {
  fontFamily: "monospace",
  color: "var(--text-tertiary)",
  flexShrink: 0,
};

const copiedHashStyles: React.CSSProperties = {
  fontFamily: "monospace",
  color: "var(--accent-primary)",
  flexShrink: 0,
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
};

const commitShortMessageStyles: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  flex: 1,
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

const emptyTextStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-tertiary)",
  margin: 0,
  textAlign: "center",
};
