import { type FC, useState, useCallback, useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Comment as CommentData, CommentType, CommentAuthor } from "../../api/comments";
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

/** Border colors for each comment type */
const TYPE_BORDER_COLORS: Record<CommentType, string> = {
  comment: "#6b7280", // gray
  progress: "#14b8a6", // teal
  work_summary: "#a855f7", // purple
  test_report: "#22c55e", // green
};

/** Author colors for header text */
const AUTHOR_COLORS: Record<CommentAuthor, string> = {
  claude: "#a855f7", // purple
  ralph: "#06b6d4", // cyan
  opencode: "#22c55e", // green
  user: "#f97316", // orange
};

/** Type labels for display */
const TYPE_LABELS: Record<CommentType, string | null> = {
  comment: null, // No badge for regular comments
  progress: "Progress",
  work_summary: "Work Summary",
  test_report: "Test Report",
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
    /(\*\*(.+?)\*\*|__(.+?)__|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*(.+?)\*|_([^_]+)_)/g;
  let match;

  while ((match = inlinePattern.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      elements.push(text.slice(lastIndex, match.index));
    }

    const fullMatch = match[0];

    if (fullMatch.startsWith("**") || fullMatch.startsWith("__")) {
      // Bold
      const content = match[2] || match[3];
      elements.push(<strong key={`${keyPrefix}-${key++}`}>{content}</strong>);
    } else if (fullMatch.startsWith("`")) {
      // Inline code
      const content = match[4];
      elements.push(
        <code
          key={`${keyPrefix}-${key++}`}
          style={{
            background: "var(--bg-tertiary)",
            padding: "2px 4px",
            borderRadius: "3px",
            fontFamily: "monospace",
            fontSize: "0.9em",
          }}
        >
          {content}
        </code>
      );
    } else if (fullMatch.startsWith("[")) {
      // Link
      const linkText = match[5];
      const linkUrl = match[6];
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
      const content = match[7] || match[8];
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

  lines.forEach((line, lineIndex) => {
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
      return;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      return;
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
      return;
    }

    // Empty line
    if (line.trim() === "") {
      elements.push(<div key={`line-${lineIndex}`} style={{ height: "var(--spacing-2)" }} />);
      return;
    }

    // Regular line with inline formatting
    elements.push(
      <div key={`line-${lineIndex}`}>{parseInlineMarkdown(line, `inline-${lineIndex}`)}</div>
    );
  });

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
 * Comment - Individual comment display with type-specific styling.
 *
 * Features:
 * - Type-specific borders: Different colors for comment, progress, work_summary, test_report
 * - Author avatar: Color-coded by author type
 * - Markdown rendering: Supports bold, italic, code, lists, links (safely, no innerHTML)
 * - Expandable content: Truncates long content with "Show more" button
 * - Relative timestamps: "2h ago", "3d ago", etc.
 */
export const Comment: FC<CommentProps> = ({ comment, maxLines = 8, testId = "comment" }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate if content is long enough to need expansion
  const lineCount = useMemo(() => comment.content.split("\n").length, [comment.content]);
  const needsExpansion = maxLines > 0 && lineCount > maxLines;

  // Get colors
  const borderColor = TYPE_BORDER_COLORS[comment.type as CommentType] ?? TYPE_BORDER_COLORS.comment;
  const authorColor = AUTHOR_COLORS[comment.author as CommentAuthor] ?? AUTHOR_COLORS.user;
  const typeLabel = TYPE_LABELS[comment.type as CommentType];

  // Toggle expansion
  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // Truncate content if needed
  const displayContent = useMemo(() => {
    if (!needsExpansion || isExpanded) {
      return comment.content;
    }
    const lines = comment.content.split("\n");
    return lines.slice(0, maxLines).join("\n") + "...";
  }, [comment.content, needsExpansion, isExpanded, maxLines]);

  // Styles
  const containerStyles: React.CSSProperties = {
    display: "flex",
    gap: "var(--spacing-3)",
    padding: "var(--spacing-3)",
    borderRadius: "var(--radius-md)",
    background: "var(--bg-primary)",
    borderLeft: `3px solid ${borderColor}`,
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
    textTransform: "capitalize",
  };

  const timestampStyles: React.CSSProperties = {
    fontSize: "var(--font-size-xs)",
    color: "var(--text-muted)",
  };

  const typeBadgeStyles: React.CSSProperties = {
    fontSize: "var(--font-size-xs)",
    padding: "2px 6px",
    borderRadius: "var(--radius-sm)",
    background: `${borderColor}15`,
    color: borderColor,
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
      <CommentAvatar author={comment.author as CommentAuthor} testId={`${testId}-avatar`} />

      {/* Content */}
      <div style={contentContainerStyles}>
        {/* Header */}
        <div style={headerStyles}>
          <span style={authorStyles}>{comment.author}</span>
          <span style={timestampStyles}>·</span>
          <span style={timestampStyles}>{formatTimestamp(comment.createdAt)}</span>
          {typeLabel && <span style={typeBadgeStyles}>{typeLabel}</span>}
        </div>

        {/* Comment content with markdown */}
        <div style={contentStyles}>{renderMarkdown(displayContent)}</div>

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
};

export default Comment;
