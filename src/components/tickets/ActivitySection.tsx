import { type FC, useRef, useCallback, useEffect } from "react";
import { MessageCircle, Loader2 } from "lucide-react";
import { useComments } from "../../lib/hooks";
import { Comment as CommentComponent } from "./Comment";
import { CommentInput } from "./CommentInput";

// =============================================================================
// Types
// =============================================================================

export interface ActivitySectionProps {
  /** The ticket ID to display activity for */
  ticketId: string;
  /** Whether to enable polling for new comments (default: 0 = disabled) */
  pollingInterval?: number;
  /** Maximum height of the comments list in pixels (default: 300) */
  maxHeight?: number;
  /** Test ID prefix for testing */
  testId?: string;
}

// =============================================================================
// ActivitySection Component
// =============================================================================

/**
 * ActivitySection - Container for displaying and adding comments to a ticket.
 *
 * Features:
 * - **Scrollable list**: Comments displayed in chronological order (oldest first)
 * - **Auto-scroll**: Scrolls to bottom when new comments are added
 * - **Polling**: Optional polling for real-time updates
 * - **Comment input**: Fixed at bottom with Ctrl+Enter shortcut
 * - **Empty state**: Shows "No activity yet" when no comments exist
 * - **Author avatars**: Color-coded by author type (user, claude, ralph, opencode)
 *
 * @example
 * ```tsx
 * <ActivitySection
 *   ticketId="abc-123"
 *   pollingInterval={5000}
 *   maxHeight={400}
 * />
 * ```
 */
export const ActivitySection: FC<ActivitySectionProps> = ({
  ticketId,
  pollingInterval = 0,
  maxHeight = 300,
  testId = "activity-section",
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const { comments, loading, error } = useComments(ticketId, { pollingInterval });

  // Sort comments oldest first (API returns newest first, so reverse)
  const sortedComments = [...comments].reverse();

  // Scroll to bottom when comments change
  const scrollToBottom = useCallback(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, []);

  // Scroll to bottom on initial load and when comments change
  useEffect(() => {
    scrollToBottom();
  }, [comments.length, scrollToBottom]);

  const containerStyles: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    border: "1px solid var(--border-primary)",
    borderRadius: "var(--radius-lg)",
    overflow: "hidden",
    background: "var(--bg-secondary)",
  };

  const headerStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    padding: "var(--spacing-3)",
    borderBottom: "1px solid var(--border-primary)",
    background: "var(--bg-tertiary)",
  };

  const titleStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    fontSize: "var(--font-size-sm)",
    fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
    color: "var(--text-secondary)",
    margin: 0,
  };

  const countBadgeStyles: React.CSSProperties = {
    fontSize: "var(--font-size-xs)",
    padding: "2px 6px",
    borderRadius: "var(--radius-sm)",
    background: "var(--bg-hover)",
    color: "var(--text-muted)",
  };

  const listStyles: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "var(--spacing-2)",
    padding: "var(--spacing-3)",
    maxHeight: `${maxHeight}px`,
    overflowY: "auto",
  };

  const emptyStyles: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "var(--spacing-6)",
    color: "var(--text-muted)",
    fontSize: "var(--font-size-sm)",
  };

  const errorStyles: React.CSSProperties = {
    padding: "var(--spacing-3)",
    background: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: "var(--radius-md)",
    color: "#f87171",
    fontSize: "var(--font-size-sm)",
    margin: "var(--spacing-3)",
  };

  const loadingStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "var(--spacing-6)",
    color: "var(--text-muted)",
  };

  return (
    <div style={containerStyles} data-testid={testId}>
      {/* Header */}
      <div style={headerStyles}>
        <h3 style={titleStyles}>
          <MessageCircle size={16} aria-hidden="true" />
          Activity
        </h3>
        {comments.length > 0 && <span style={countBadgeStyles}>{comments.length}</span>}
      </div>

      {/* Error display */}
      {error && <div style={errorStyles}>{error}</div>}

      {/* Comments list */}
      <div ref={listRef} style={listStyles} data-testid={`${testId}-list`}>
        {loading && comments.length === 0 ? (
          <div style={loadingStyles}>
            <Loader2 size={20} className="animate-spin" aria-label="Loading comments" />
          </div>
        ) : sortedComments.length === 0 ? (
          <div style={emptyStyles}>
            <MessageCircle size={24} style={{ marginBottom: "var(--spacing-2)", opacity: 0.5 }} />
            No activity yet
          </div>
        ) : (
          sortedComments.map((comment) => (
            <CommentComponent key={comment.id} comment={comment} testId={`${testId}-item`} />
          ))
        )}
      </div>

      {/* Comment input */}
      <CommentInput
        ticketId={ticketId}
        onCommentAdded={scrollToBottom}
        disabled={loading && comments.length === 0}
        testId={`${testId}-input`}
      />
    </div>
  );
};

export default ActivitySection;
