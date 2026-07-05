import { useState, useMemo, memo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Comment as CommentData, CommentType } from "../../api/comments";
import { getCommentAuthorDisplayName, getCommentAuthorStyle } from "../../lib/comment-authors";
import { CommentAvatar } from "./CommentAvatar";
import { CodeBlock } from "./CodeBlock";

// =============================================================================
// Types
// =============================================================================

export interface CommentProps {
  /** The comment data to display */
  comment: CommentData;
  /** Maximum lines before truncating (0 = no limit) */
  maxLines?: number;
  /** Test ID prefix for testing */
  testId?: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Type labels for display */
const TYPE_LABELS: Record<CommentType, string | null> = {
  comment: null, // No badge for regular comments
  progress: "Progress",
  work_summary: "Work Summary",
  test_report: "Test Report",
  change_request: "Changes Requested",
  verification_report: "Verification Report",
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format a timestamp as a relative time string.
 */
function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function isAllowedAttachmentImageUrl(url: string): boolean {
  return (
    url.startsWith("data:image/") ||
    url.startsWith("/attachments/") ||
    url.startsWith("/api/attachments/")
  );
}

/**
 * Parse inline markdown formatting into React elements.
 * Safely handles bold, italic, inline code, and links without innerHTML.
 */
function parseInlineMarkdown(text: string, keyPrefix: string): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  // Combined regex for all inline patterns
  const inlinePattern =
    /(!\[([^\]]*)\]\(([^)]+)\)|\*\*(.+?)\*\*|__(.+?)__|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*(.+?)\*|_([^_]+)_)/g;
  let match;

  while ((match = inlinePattern.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      elements.push(text.slice(lastIndex, match.index));
    }

    const fullMatch = match[0];

    if (fullMatch.startsWith("![")) {
      const altText = match[2] || "Verification evidence image";
      const imageUrl = match[3] || "";
      if (isAllowedAttachmentImageUrl(imageUrl)) {
        elements.push(
          <img
            key={`${keyPrefix}-${key++}`}
            src={imageUrl}
            alt={altText}
            loading="lazy"
            style={{
              display: "block",
              maxWidth: "100%",
              height: "auto",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-primary)",
              marginTop: "var(--spacing-2)",
            }}
          />
        );
      } else {
        elements.push(`[image blocked: ${altText}]`);
      }
    } else if (fullMatch.startsWith("**") || fullMatch.startsWith("__")) {
      // Bold
      const content = match[4] || match[5];
      elements.push(<strong key={`${keyPrefix}-${key++}`}>{content}</strong>);
    } else if (fullMatch.startsWith("`")) {
      // Inline code
      const content = match[6];
      elements.push(
        <code
          key={`${keyPrefix}-${key++}`}
          style={{
            background: "var(--bg-tertiary)",
            padding: "2px 4px",
            borderRadius: "3px",
            fontFamily: "var(--font-mono)",
            fontSize: "0.9em",
          }}
        >
          {content}
        </code>
      );
    } else if (fullMatch.startsWith("[")) {
      // Link
      const linkText = match[7];
      const linkUrl = match[8];
      elements.push(
        <a
          key={`${keyPrefix}-${key++}`}
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--accent-primary)", textDecoration: "underline" }}
        >
          {linkText}
        </a>
      );
    } else if (fullMatch.startsWith("*") || fullMatch.startsWith("_")) {
      // Italic
      const content = match[9] || match[10];
      elements.push(<em key={`${keyPrefix}-${key++}`}>{content}</em>);
    }

    lastIndex = match.index + fullMatch.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return elements.length > 0 ? elements : [text];
}

function isTableDivider(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function renderEvidenceCell(cell: string, keyPrefix: string): React.ReactNode {
  if (cell === "-" || cell.length === 0) return cell;
  const ids = cell
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.map((id, index) => (
    <span key={`${keyPrefix}-${id}`}>
      {index > 0 ? ", " : null}
      <a
        href={`#attachment-${id}`}
        style={{ color: "var(--accent-primary)", textDecoration: "underline" }}
      >
        {id}
      </a>
    </span>
  ));
}

function renderMarkdownTable(tableLines: string[], keyPrefix: string): React.ReactNode {
  const headers = splitTableRow(tableLines[0] ?? "");
  const rows = tableLines.slice(2).map(splitTableRow);
  const evidenceColumn = headers.findIndex((header) => header.toLowerCase() === "evidence");

  return (
    <div key={keyPrefix} style={{ overflowX: "auto", margin: "var(--spacing-2) 0" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "var(--font-size-xs)",
        }}
      >
        <thead>
          <tr>
            {headers.map((header, index) => (
              <th
                key={`${keyPrefix}-header-${index}`}
                scope="col"
                style={{
                  borderBottom: "1px solid var(--border-primary)",
                  color: "var(--text-primary)",
                  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
                  padding: "var(--spacing-2)",
                  textAlign: "left",
                }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${keyPrefix}-row-${rowIndex}`}>
              {headers.map((_, cellIndex) => {
                const cell = row[cellIndex] ?? "";
                return (
                  <td
                    key={`${keyPrefix}-cell-${rowIndex}-${cellIndex}`}
                    style={{
                      borderBottom: "1px solid var(--border-primary)",
                      color: "var(--text-secondary)",
                      padding: "var(--spacing-2)",
                      verticalAlign: "top",
                    }}
                  >
                    {cellIndex === evidenceColumn
                      ? renderEvidenceCell(cell, `${keyPrefix}-evidence-${rowIndex}`)
                      : parseInlineMarkdown(
                          cell,
                          `${keyPrefix}-cell-inline-${rowIndex}-${cellIndex}`
                        )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Simple markdown-like rendering for comments.
 * Supports: bold, italic, inline code, code blocks, lists, links.
 * Uses React elements instead of innerHTML for security.
 */
function renderMarkdown(content: string): React.ReactNode {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeBlockLanguage: string | undefined;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex] ?? "";

    // Handle code block start/end
    if (line.startsWith("```")) {
      if (!inCodeBlock) {
        // Start of code block - extract language from fence
        inCodeBlock = true;
        codeBlockLines = [];
        codeBlockLanguage = line.slice(3).trim() || undefined;
      } else {
        // End of code block - render with CodeBlock component
        elements.push(
          <CodeBlock
            key={`code-${lineIndex}`}
            code={codeBlockLines.join("\n")}
            language={codeBlockLanguage}
            testId={`code-block-${lineIndex}`}
          />
        );
        inCodeBlock = false;
        codeBlockLines = [];
        codeBlockLanguage = undefined;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    if (line.trim().startsWith("|") && isTableDivider(lines[lineIndex + 1] ?? "")) {
      const tableLines = [line, lines[lineIndex + 1] ?? ""];
      lineIndex += 2;
      while (lineIndex < lines.length && (lines[lineIndex] ?? "").trim().startsWith("|")) {
        tableLines.push(lines[lineIndex] ?? "");
        lineIndex++;
      }
      lineIndex--;
      elements.push(renderMarkdownTable(tableLines, `table-${lineIndex}`));
      continue;
    }

    // List items: - item or * item
    if (/^[-*]\s/.test(line)) {
      const listContent = line.replace(/^[-*]\s/, "");
      elements.push(
        <div
          key={`line-${lineIndex}`}
          style={{ display: "flex", gap: "var(--spacing-2)", marginLeft: "var(--spacing-2)" }}
        >
          <span style={{ color: "var(--text-muted)" }}>•</span>
          <span>{parseInlineMarkdown(listContent, `inline-${lineIndex}`)}</span>
        </div>
      );
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      elements.push(<div key={`line-${lineIndex}`} style={{ height: "var(--spacing-2)" }} />);
      continue;
    }

    // Regular line with inline formatting
    elements.push(
      <div key={`line-${lineIndex}`}>{parseInlineMarkdown(line, `inline-${lineIndex}`)}</div>
    );
  }

  // Handle unclosed code block
  if (inCodeBlock && codeBlockLines.length > 0) {
    elements.push(
      <CodeBlock
        key="code-unclosed"
        code={codeBlockLines.join("\n")}
        language={codeBlockLanguage}
        testId="code-block-unclosed"
      />
    );
  }

  return elements;
}

// =============================================================================
// Comment Component
// =============================================================================

/**
 * Comment - Individual comment display.
 *
 * Features:
 * - Flat surface: a single neutral background for every type; change_request
 *   gets one restrained warning tint + border as an action signal (no stripes)
 * - Author avatar: Color-coded by author type
 * - Markdown rendering: Supports bold, italic, code, lists, links (safely, no innerHTML)
 * - Expandable content: Truncates long content with "Show more" button
 * - Relative timestamps: "2h ago", "3d ago", etc.
 *
 * Wrapped with React.memo to prevent unnecessary re-renders when parent re-renders
 * but comment data hasn't changed.
 */
export const Comment = memo(function Comment({
  comment,
  maxLines = 8,
  testId = "comment",
}: CommentProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate if content is long enough to need expansion
  const lineCount = useMemo(() => comment.content.split("\n").length, [comment.content]);
  const needsExpansion = maxLines > 0 && lineCount > maxLines;

  // Get author + type metadata
  const authorDisplayName = getCommentAuthorDisplayName(comment.author);
  const authorColor = getCommentAuthorStyle(comment.author).textColor;
  const typeLabel = TYPE_LABELS[comment.type as CommentType];
  const isChangeRequest = comment.type === "change_request";

  // Toggle expansion
  function toggleExpanded(): void {
    setIsExpanded((prev) => !prev);
  }

  // Truncate content if needed
  const displayContent = useMemo(() => {
    if (!needsExpansion || isExpanded) {
      return comment.content;
    }
    const lines = comment.content.split("\n");
    return lines.slice(0, maxLines).join("\n") + "...";
  }, [comment.content, needsExpansion, isExpanded, maxLines]);

  // Memoize markdown rendering — only re-parse when displayContent changes
  const renderedMarkdown = useMemo(() => renderMarkdown(displayContent), [displayContent]);

  // Memoize relative timestamp — only recompute when createdAt changes
  const relativeTimestamp = useMemo(() => formatTimestamp(comment.createdAt), [comment.createdAt]);

  // Styles — comments sit on a flat, consistent surface (no side stripe).
  // change_request keeps a single restrained accent (faint tint + full border)
  // because it's an action signal, not a category color.
  const containerStyles: React.CSSProperties = {
    display: "flex",
    gap: "var(--spacing-3)",
    padding: "var(--spacing-3)",
    borderRadius: "var(--radius-md)",
    background: isChangeRequest ? "var(--warning-muted)" : "var(--bg-primary)",
    border: isChangeRequest
      ? "1px solid color-mix(in srgb, var(--warning) 40%, transparent)"
      : undefined,
  };

  const contentContainerStyles: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
  };

  const headerStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    marginBottom: "var(--spacing-2)",
  };

  const authorStyles: React.CSSProperties = {
    fontSize: "var(--font-size-sm)",
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    color: authorColor,
  };

  const timestampStyles: React.CSSProperties = {
    fontSize: "var(--font-size-xs)",
    color: "var(--text-muted)",
  };

  // Single neutral chip for ordinary types; change_request gets the one
  // meaningful accent so the "Changes Requested" action signal still stands out.
  const typeBadgeStyles: React.CSSProperties = {
    fontSize: "var(--font-size-xs)",
    padding: "2px 6px",
    borderRadius: "var(--radius-sm)",
    background: isChangeRequest ? "var(--warning-muted)" : "var(--bg-tertiary)",
    color: isChangeRequest ? "var(--warning)" : "var(--text-secondary)",
    border: isChangeRequest ? "none" : "1px solid var(--border-primary)",
  };

  const contentStyles: React.CSSProperties = {
    fontSize: "var(--font-size-sm)",
    color: "var(--text-primary)",
    lineHeight: 1.6,
    wordBreak: "break-word",
  };

  const expandButtonStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--spacing-1)",
    marginTop: "var(--spacing-2)",
    padding: 0,
    background: "none",
    border: "none",
    color: "var(--accent-primary)",
    fontSize: "var(--font-size-xs)",
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    cursor: "pointer",
  };

  return (
    <div style={containerStyles} data-testid={testId}>
      {/* Avatar */}
      <CommentAvatar author={comment.author} testId={`${testId}-avatar`} />

      {/* Content */}
      <div style={contentContainerStyles}>
        {/* Header */}
        <div style={headerStyles}>
          <span style={authorStyles}>{authorDisplayName}</span>
          <span style={timestampStyles}>·</span>
          <span style={timestampStyles}>{relativeTimestamp}</span>
          {typeLabel && <span style={typeBadgeStyles}>{typeLabel}</span>}
        </div>

        {/* Comment content with markdown — memoized to avoid re-parsing on every render */}
        <div style={contentStyles}>{renderedMarkdown}</div>

        {/* Expand/collapse button */}
        {needsExpansion && (
          <button
            type="button"
            onClick={toggleExpanded}
            style={expandButtonStyles}
            aria-expanded={isExpanded}
          >
            {isExpanded ? (
              <>
                <ChevronUp size={14} aria-hidden="true" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown size={14} aria-hidden="true" />
                Show more ({lineCount - maxLines} more lines)
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
});

export default Comment;
