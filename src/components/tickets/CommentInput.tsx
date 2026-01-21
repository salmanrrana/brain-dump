import { type FC, useState, useRef, useCallback, type KeyboardEvent } from "react";
import { Send, Loader2 } from "lucide-react";
import { useCreateComment } from "../../lib/hooks";
import type { CommentAuthor, CommentType } from "../../api/comments";

// =============================================================================
// Types
// =============================================================================

export interface CommentInputProps {
  /** The ticket ID to add comments to */
  ticketId: string;
  /** Callback when a comment is successfully added */
  onCommentAdded?: () => void;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Test ID prefix for testing */
  testId?: string;
}

// =============================================================================
// CommentInput Component
// =============================================================================

/**
 * CommentInput - A textarea with submit button for adding comments to tickets.
 *
 * Features:
 * - **Keyboard shortcut**: Ctrl/Cmd + Enter to submit
 * - **Loading state**: Shows spinner and disables input while submitting
 * - **Auto-clear**: Clears textarea after successful submission
 * - **Auto-focus**: Returns focus to textarea after submission
 *
 * @example
 * ```tsx
 * <CommentInput
 *   ticketId="abc-123"
 *   onCommentAdded={() => scrollToBottom()}
 * />
 * ```
 */
export const CommentInput: FC<CommentInputProps> = ({
  ticketId,
  onCommentAdded,
  disabled = false,
  testId = "comment-input",
}) => {
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const createComment = useCreateComment();

  const isSubmitting = createComment.isPending;
  const canSubmit = content.trim().length > 0 && !isSubmitting && !disabled;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;

    setError(null);
    createComment.mutate(
      {
        ticketId,
        content: content.trim(),
        author: "user" as CommentAuthor,
        type: "comment" as CommentType,
      },
      {
        onSuccess: () => {
          setContent("");
          onCommentAdded?.();
          textareaRef.current?.focus();
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : "Failed to add comment. Please try again.");
          textareaRef.current?.focus();
        },
      }
    );
  }, [canSubmit, content, ticketId, createComment, onCommentAdded]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Submit on Ctrl/Cmd + Enter
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const containerStyles: React.CSSProperties = {
    display: "flex",
    gap: "var(--spacing-2)",
    alignItems: "flex-end",
    padding: "var(--spacing-3)",
    borderTop: "1px solid var(--border-primary)",
    background: "var(--bg-secondary)",
  };

  const textareaStyles: React.CSSProperties = {
    flex: 1,
    padding: "var(--spacing-2) var(--spacing-3)",
    background: "var(--bg-primary)",
    border: "1px solid var(--border-primary)",
    borderRadius: "var(--radius-md)",
    color: "var(--text-primary)",
    fontSize: "var(--font-size-sm)",
    fontFamily: "inherit",
    resize: "none",
    minHeight: "38px",
    maxHeight: "100px",
    outline: "none",
  };

  const buttonStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "38px",
    height: "38px",
    background: canSubmit ? "var(--accent-primary)" : "var(--bg-tertiary)",
    border: "none",
    borderRadius: "var(--radius-md)",
    color: canSubmit ? "var(--text-on-accent)" : "var(--text-muted)",
    cursor: canSubmit ? "pointer" : "not-allowed",
    transition: "all var(--transition-fast)",
  };

  const errorStyles: React.CSSProperties = {
    padding: "var(--spacing-2) var(--spacing-3)",
    background: "rgba(239, 68, 68, 0.1)",
    borderTop: "1px solid rgba(239, 68, 68, 0.3)",
    color: "#ef4444",
    fontSize: "var(--font-size-xs)",
  };

  return (
    <div data-testid={testId}>
      {error && (
        <div style={errorStyles} role="alert" data-testid={`${testId}-error`}>
          {error}
        </div>
      )}
      <div style={containerStyles}>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a comment... (Ctrl+Enter to send)"
          style={textareaStyles}
          className="focus:border-[var(--accent-primary)]"
          disabled={disabled || isSubmitting}
          rows={1}
          data-testid={`${testId}-textarea`}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? `${testId}-error` : undefined}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={buttonStyles}
          className={canSubmit ? "hover:opacity-90" : ""}
          aria-label="Send comment"
          data-testid={`${testId}-submit`}
        >
          {isSubmitting ? (
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <Send size={16} aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
};

export default CommentInput;
