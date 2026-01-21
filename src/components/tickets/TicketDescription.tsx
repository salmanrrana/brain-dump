import { type FC, memo, useMemo } from "react";
import { FileText } from "lucide-react";
import { CodeBlock } from "./CodeBlock";

// =============================================================================
// Types
// =============================================================================

export interface TicketDescriptionProps {
  /** The markdown description content */
  description: string | null | undefined;
  /** Optional test ID prefix */
  testId?: string;
}

// =============================================================================
// Markdown Rendering Utilities
// =============================================================================

/**
 * Parse inline markdown formatting into React elements.
 * Supports: **bold**, *italic*, `code`, [links](url), ~~strikethrough~~
 *
 * Uses a safe approach with React elements instead of innerHTML/dangerouslySetInnerHTML.
 */
function parseInlineMarkdown(text: string, keyPrefix: string): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  // Combined regex for all inline patterns
  // Order matters: strikethrough, bold, inline code, links, italic
  const inlinePattern =
    /(~~(.+?)~~|\*\*(.+?)\*\*|__(.+?)__|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*([^*]+)\*|_([^_\s][^_]*[^_\s]|[^_])_)/g;
  let match;

  while ((match = inlinePattern.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      elements.push(text.slice(lastIndex, match.index));
    }

    const fullMatch = match[0];

    if (fullMatch.startsWith("~~")) {
      // Strikethrough
      const content = match[2];
      elements.push(
        <del key={`${keyPrefix}-${key++}`} style={{ textDecoration: "line-through", opacity: 0.7 }}>
          {content}
        </del>
      );
    } else if (fullMatch.startsWith("**") || fullMatch.startsWith("__")) {
      // Bold
      const content = match[3] || match[4];
      elements.push(<strong key={`${keyPrefix}-${key++}`}>{content}</strong>);
    } else if (fullMatch.startsWith("`")) {
      // Inline code
      const content = match[5];
      elements.push(
        <code key={`${keyPrefix}-${key++}`} style={inlineCodeStyles}>
          {content}
        </code>
      );
    } else if (fullMatch.startsWith("[")) {
      // Link - external links open in new tab
      const linkText = match[6] ?? "";
      const linkUrl = match[7] ?? "";
      const isExternal = linkUrl.startsWith("http://") || linkUrl.startsWith("https://");
      elements.push(
        <a
          key={`${keyPrefix}-${key++}`}
          href={linkUrl}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noopener noreferrer" : undefined}
          style={linkStyles}
        >
          {linkText}
        </a>
      );
    } else if (fullMatch.startsWith("*") || fullMatch.startsWith("_")) {
      // Italic
      const content = match[8] || match[9];
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
 * Render markdown content to React elements.
 *
 * Supports:
 * - Headers (h1-h6 via # syntax)
 * - Code blocks with language (```lang)
 * - Bullet lists (- or *)
 * - Numbered lists (1. 2. 3.)
 * - Blockquotes (>)
 * - Inline formatting (bold, italic, code, links, strikethrough)
 * - Empty lines for paragraph separation
 */
function renderMarkdown(content: string): React.ReactNode {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeBlockLanguage: string | undefined;
  let listItems: { content: string; lineIndex: number }[] = [];
  let listType: "bullet" | "numbered" | null = null;
  let blockquoteLines: { content: string; lineIndex: number }[] = [];

  // Helper to flush bullet/numbered list
  const flushList = () => {
    const firstItem = listItems[0];
    if (listItems.length > 0 && listType && firstItem) {
      const ListTag = listType === "numbered" ? "ol" : "ul";
      elements.push(
        <ListTag key={`list-${firstItem.lineIndex}`} style={listStyles}>
          {listItems.map((item) => (
            <li key={`li-${item.lineIndex}`} style={listItemStyles}>
              {parseInlineMarkdown(item.content, `inline-${item.lineIndex}`)}
            </li>
          ))}
        </ListTag>
      );
      listItems = [];
      listType = null;
    }
  };

  // Helper to flush blockquote
  const flushBlockquote = () => {
    const firstQuote = blockquoteLines[0];
    if (blockquoteLines.length > 0 && firstQuote) {
      elements.push(
        <blockquote key={`quote-${firstQuote.lineIndex}`} style={blockquoteStyles}>
          {blockquoteLines.map((item, idx) => (
            <div key={`bq-${item.lineIndex}`}>
              {parseInlineMarkdown(item.content, `bq-inline-${item.lineIndex}`)}
              {idx < blockquoteLines.length - 1 && <br />}
            </div>
          ))}
        </blockquote>
      );
      blockquoteLines = [];
    }
  };

  lines.forEach((line, lineIndex) => {
    // Handle code block start/end
    if (line.startsWith("```")) {
      // Flush any pending list or blockquote before code block
      flushList();
      flushBlockquote();

      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLines = [];
        codeBlockLanguage = line.slice(3).trim() || undefined;
      } else {
        elements.push(
          <CodeBlock
            key={`code-${lineIndex}`}
            code={codeBlockLines.join("\n")}
            language={codeBlockLanguage}
            testId={`desc-code-${lineIndex}`}
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

    // Headers: # to ######
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      flushList();
      flushBlockquote();
      const hashes = headerMatch[1] ?? "";
      const level = Math.min(Math.max(hashes.length, 1), 6) as 1 | 2 | 3 | 4 | 5 | 6;
      const headerContent = headerMatch[2] ?? "";
      const HeaderTag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      elements.push(
        <HeaderTag key={`h-${lineIndex}`} style={headerStyles[level]}>
          {parseInlineMarkdown(headerContent, `h-inline-${lineIndex}`)}
        </HeaderTag>
      );
      return;
    }

    // Blockquote: > text
    if (line.startsWith("> ") || line === ">") {
      flushList();
      const quoteContent = line.slice(2);
      blockquoteLines.push({ content: quoteContent, lineIndex });
      return;
    } else if (blockquoteLines.length > 0) {
      flushBlockquote();
    }

    // Numbered list: 1. item, 2. item, etc.
    const numberedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (numberedMatch) {
      flushBlockquote();
      if (listType === "bullet") {
        flushList();
      }
      listType = "numbered";
      listItems.push({ content: numberedMatch[1] ?? "", lineIndex });
      return;
    }

    // Bullet list: - item or * item
    if (/^[-*]\s+/.test(line)) {
      flushBlockquote();
      if (listType === "numbered") {
        flushList();
      }
      listType = "bullet";
      const listContent = line.replace(/^[-*]\s+/, "");
      listItems.push({ content: listContent, lineIndex });
      return;
    }

    // If we have a pending list and hit non-list content, flush it
    if (listItems.length > 0) {
      flushList();
    }

    // Empty line (paragraph separator)
    if (line.trim() === "") {
      elements.push(<div key={`empty-${lineIndex}`} style={{ height: "var(--spacing-3)" }} />);
      return;
    }

    // Regular paragraph with inline formatting
    elements.push(
      <p key={`p-${lineIndex}`} style={paragraphStyles}>
        {parseInlineMarkdown(line, `p-inline-${lineIndex}`)}
      </p>
    );
  });

  // Flush any remaining lists or blockquotes
  flushList();
  flushBlockquote();

  // Handle unclosed code block
  if (inCodeBlock && codeBlockLines.length > 0) {
    elements.push(
      <CodeBlock
        key="code-unclosed"
        code={codeBlockLines.join("\n")}
        language={codeBlockLanguage}
        testId="desc-code-unclosed"
      />
    );
  }

  return elements;
}

// =============================================================================
// TicketDescription Component
// =============================================================================

/**
 * TicketDescription - Formatted markdown description section for ticket detail view.
 *
 * Features:
 * - **Markdown rendering**: Headers, lists, code blocks, blockquotes
 * - **Syntax highlighting**: Code blocks with language indicator and copy button
 * - **Inline formatting**: Bold, italic, strikethrough, inline code, links
 * - **External links**: Open in new tab with rel="noopener noreferrer"
 * - **Empty state**: Shows "No description" with icon when empty
 *
 * @example
 * ```tsx
 * <TicketDescription description={ticket.description} />
 * ```
 */
export const TicketDescription: FC<TicketDescriptionProps> = memo(function TicketDescription({
  description,
  testId = "ticket-description",
}) {
  // Memoize markdown rendering for performance
  const renderedContent = useMemo(() => {
    if (!description || description.trim() === "") {
      return null;
    }
    return renderMarkdown(description);
  }, [description]);

  // Empty state
  if (!renderedContent) {
    return (
      <section style={containerStyles} data-testid={testId}>
        <h2 style={sectionTitleStyles}>Description</h2>
        <div style={emptyStateStyles} data-testid={`${testId}-empty`}>
          <FileText
            size={24}
            style={{ color: "var(--text-muted)", marginBottom: "var(--spacing-2)" }}
          />
          <span>No description</span>
        </div>
      </section>
    );
  }

  return (
    <section style={containerStyles} data-testid={testId}>
      <h2 style={sectionTitleStyles}>Description</h2>
      <div style={contentStyles} data-testid={`${testId}-content`}>
        {renderedContent}
      </div>
    </section>
  );
});

// =============================================================================
// Styles
// =============================================================================

const containerStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-3)",
};

const sectionTitleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-lg)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  margin: 0,
};

const contentStyles: React.CSSProperties = {
  fontSize: "var(--font-size-base)",
  lineHeight: 1.7,
  color: "var(--text-primary)",
};

const emptyStateStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--spacing-6)",
  background: "var(--bg-secondary)",
  borderRadius: "var(--radius-md)",
  color: "var(--text-muted)",
  fontSize: "var(--font-size-sm)",
};

const inlineCodeStyles: React.CSSProperties = {
  background: "var(--bg-tertiary)",
  padding: "2px 6px",
  borderRadius: "var(--radius-sm)",
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: "0.9em",
};

const linkStyles: React.CSSProperties = {
  color: "var(--accent-primary)",
  textDecoration: "underline",
  textUnderlineOffset: "2px",
};

const paragraphStyles: React.CSSProperties = {
  margin: "0 0 var(--spacing-2) 0",
};

const listStyles: React.CSSProperties = {
  margin: "var(--spacing-2) 0",
  paddingLeft: "var(--spacing-6)",
};

const listItemStyles: React.CSSProperties = {
  marginBottom: "var(--spacing-1)",
};

const blockquoteStyles: React.CSSProperties = {
  margin: "var(--spacing-3) 0",
  padding: "var(--spacing-3) var(--spacing-4)",
  borderLeft: "3px solid var(--accent-primary)",
  background: "var(--bg-secondary)",
  borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
  color: "var(--text-secondary)",
  fontStyle: "italic",
};

// Header styles (h1-h6)
const headerStyles: Record<1 | 2 | 3 | 4 | 5 | 6, React.CSSProperties> = {
  1: {
    fontSize: "var(--font-size-2xl)",
    fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
    margin: "var(--spacing-4) 0 var(--spacing-3) 0",
    color: "var(--text-primary)",
    borderBottom: "1px solid var(--border-primary)",
    paddingBottom: "var(--spacing-2)",
  },
  2: {
    fontSize: "var(--font-size-xl)",
    fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
    margin: "var(--spacing-4) 0 var(--spacing-2) 0",
    color: "var(--text-primary)",
  },
  3: {
    fontSize: "var(--font-size-lg)",
    fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
    margin: "var(--spacing-3) 0 var(--spacing-2) 0",
    color: "var(--text-primary)",
  },
  4: {
    fontSize: "var(--font-size-base)",
    fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
    margin: "var(--spacing-3) 0 var(--spacing-2) 0",
    color: "var(--text-primary)",
  },
  5: {
    fontSize: "var(--font-size-sm)",
    fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
    margin: "var(--spacing-2) 0 var(--spacing-1) 0",
    color: "var(--text-secondary)",
  },
  6: {
    fontSize: "var(--font-size-sm)",
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    margin: "var(--spacing-2) 0 var(--spacing-1) 0",
    color: "var(--text-muted)",
  },
};

export default TicketDescription;
