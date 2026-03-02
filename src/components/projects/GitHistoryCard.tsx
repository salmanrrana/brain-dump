import { useState, useEffect, useRef } from "react";
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
      >
        {children}
      </a>
    );
  }
  return <>{children}</>;
}

export default function GitHistoryCard({ projectPath }: GitHistoryCardProps) {
  const { data, isLoading, error } = useGitProjectInfo(projectPath);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  function handleCopyHash(hash: string) {
    navigator.clipboard
      .writeText(hash)
      .then(() => {
        setCopiedHash(hash);
        timeoutRef.current = window.setTimeout(() => setCopiedHash(null), 2000);
      })
      .catch(() => {
        setCopiedHash(hash);
        timeoutRef.current = window.setTimeout(() => setCopiedHash(null), 2000);
      });
  }

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
                <CommitLink
                  url={data.remoteUrl ? `${data.remoteUrl}/commit/${data.lastCommit.hash}` : null}
                  title="View on GitHub"
                >
                  {data.lastCommit.date}
                </CommitLink>{" "}
                by {data.lastCommit.author}
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
                  <div key={commit.hash} style={commitItemStyles} className="group relative">
                    <CommitLink
                      url={data.remoteUrl ? `${data.remoteUrl}/commit/${commit.hash}` : null}
                      title="View on GitHub"
                    >
                      <span style={commitHashStyles}>{commit.hash.substring(0, 7)}</span>
                    </CommitLink>

                    <span style={commitShortMessageStyles} title={commit.message}>
                      {commit.message}
                    </span>

                    <button
                      onClick={() => handleCopyHash(commit.hash)}
                      title="Copy commit hash"
                      type="button"
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[var(--bg-hover)] rounded focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] transition-opacity"
                    >
                      {copiedHash === commit.hash ? (
                        <span style={{ color: "var(--accent-primary)", fontSize: "10px" }}>
                          Copied!
                        </span>
                      ) : (
                        <span style={{ fontSize: "12px" }}>📋</span>
                      )}
                    </button>
                  </div>
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
  transition: "all var(--transition-fast)",
};

const commitHashStyles: React.CSSProperties = {
  fontFamily: "monospace",
  color: "var(--text-tertiary)",
  flexShrink: 0,
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
