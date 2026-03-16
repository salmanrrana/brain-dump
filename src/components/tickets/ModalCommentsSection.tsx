import { type FC, useState, useCallback } from "react";
import { MessageSquare, ChevronDown, Loader2, Send, Bot, Terminal } from "lucide-react";
import { useComments, useCreateComment } from "../../lib/hooks";
import { POLLING_INTERVALS } from "../../lib/constants";
import { getCommentAuthorBase, getCommentAuthorDisplayName } from "../../lib/comment-authors";
import { useToast } from "../Toast";

// Comment type styling lookup objects
const COMMENT_CONTAINER_STYLES: Record<string, string> = {
  progress: "p-2 bg-[var(--info-muted)] border border-[var(--info)]/50",
  work_summary: "p-3 bg-[var(--status-review)]/20 border border-[var(--status-review)]/50",
  test_report: "p-3 bg-[var(--success-muted)] border border-[var(--success)]/50",
  comment: "p-3 bg-[var(--bg-tertiary)]",
};

const COMMENT_AUTHOR_STYLES: Record<string, string> = {
  ralph: "text-[var(--status-review)]",
  claude: "text-[var(--accent-ai)]",
  codex: "text-[var(--success)]",
  cursor: "text-[var(--text-primary)]",
  vscode: "text-[var(--accent-primary)]",
  copilot: "text-[var(--text-secondary)]",
  opencode: "text-[var(--success)]",
  ai: "text-[var(--accent-primary)]",
  "brain-dump": "text-[var(--text-secondary)]",
  user: "text-[var(--text-primary)]",
};

const COMMENT_BADGE_STYLES: Record<string, string> = {
  progress: "bg-[var(--info)] text-white",
  work_summary: "bg-[var(--status-review)] text-white",
  test_report: "bg-[var(--success)] text-white",
};

const COMMENT_BADGE_LABELS: Record<string, string> = {
  progress: "Working...",
  work_summary: "Work Summary",
  test_report: "Test Report",
};

export interface ModalCommentsSectionProps {
  ticketId: string;
  ticketStatus: string;
}

export const ModalCommentsSection: FC<ModalCommentsSectionProps> = ({ ticketId, ticketStatus }) => {
  const { showToast } = useToast();
  const [newComment, setNewComment] = useState("");
  const [showComments, setShowComments] = useState(true);

  const { comments, loading: commentsLoading } = useComments(ticketId, {
    pollingInterval:
      ticketStatus === "in_progress"
        ? POLLING_INTERVALS.COMMENTS_ACTIVE
        : POLLING_INTERVALS.DISABLED,
  });
  const createCommentMutation = useCreateComment();

  const handleAddComment = useCallback(() => {
    const content = newComment.trim();
    if (!content) return;

    createCommentMutation.mutate(
      {
        ticketId,
        content,
        author: "user",
        type: "comment",
      },
      {
        onSuccess: () => {
          setNewComment("");
        },
        onError: (error) => {
          showToast(
            "error",
            `Failed to add comment: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        },
      }
    );
  }, [newComment, ticketId, createCommentMutation, showToast]);

  return (
    <div>
      <button
        onClick={() => setShowComments(!showComments)}
        className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] mb-2 hover:text-[var(--text-primary)] transition-colors"
      >
        <MessageSquare size={16} />
        <span>Activity</span>
        {comments.length > 0 && (
          <span className="text-[var(--text-tertiary)]">({comments.length})</span>
        )}
        <ChevronDown
          size={14}
          className={`transition-transform ${showComments ? "rotate-180" : ""}`}
        />
      </button>

      {showComments && (
        <div className="space-y-3">
          {/* Add comment input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
              placeholder="Add a comment..."
              className="flex-1 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] text-sm"
            />
            <button
              onClick={handleAddComment}
              disabled={!newComment.trim() || createCommentMutation.isPending}
              className="px-3 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-tertiary)] rounded-lg transition-colors"
            >
              {createCommentMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </button>
          </div>

          {/* Comments list */}
          {commentsLoading ? (
            <div className="flex items-center justify-center py-4 text-[var(--text-tertiary)]">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : comments.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className={`rounded-lg text-sm ${COMMENT_CONTAINER_STYLES[comment.type] ?? COMMENT_CONTAINER_STYLES.comment}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {comment.type === "progress" && (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--info)] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--info)]"></span>
                      </span>
                    )}
                    <span
                      className={`font-medium ${COMMENT_AUTHOR_STYLES[getCommentAuthorBase(comment.author)] ?? COMMENT_AUTHOR_STYLES.user}`}
                    >
                      {getCommentAuthorBase(comment.author) === "ralph" && (
                        <Bot size={12} className="inline mr-1" />
                      )}
                      {getCommentAuthorBase(comment.author) === "claude" && (
                        <Terminal size={12} className="inline mr-1" />
                      )}
                      {getCommentAuthorDisplayName(comment.author)}
                    </span>
                    <span className="text-[var(--text-tertiary)] text-xs">
                      {new Date(comment.createdAt).toLocaleString()}
                    </span>
                    {comment.type !== "comment" && COMMENT_BADGE_STYLES[comment.type] && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${COMMENT_BADGE_STYLES[comment.type]}`}
                      >
                        {COMMENT_BADGE_LABELS[comment.type]}
                      </span>
                    )}
                  </div>
                  <p
                    className={`whitespace-pre-wrap ${comment.type === "progress" ? "text-[var(--info-text)] text-xs" : "text-[var(--text-primary)]"}`}
                  >
                    {comment.content}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-tertiary)] py-2">
              No activity yet. Comments from Claude and Ralph will appear here.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
