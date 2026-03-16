import { type FC, useState, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { MessageSquare, ChevronDown, Loader2, Send, Bot, Terminal } from "lucide-react";
import { usePaginatedComments, useCreateComment } from "../../lib/hooks";
import { POLLING_INTERVALS } from "../../lib/constants";
import { getCommentAuthorBase, getCommentAuthorDisplayName } from "../../lib/comment-authors";
import { useToast } from "../Toast";

const VIRTUALIZATION_THRESHOLD = 20;
const COMMENT_HEIGHT_ESTIMATE = 80;

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

  const {
    comments,
    totalCount,
    loading: commentsLoading,
    hasMore,
    fetchMore,
    isFetchingMore,
  } = usePaginatedComments(ticketId, {
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
        {totalCount > 0 && <span className="text-[var(--text-tertiary)]">({totalCount})</span>}
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
          <CommentsList
            comments={comments}
            loading={commentsLoading}
            hasMore={hasMore}
            isFetchingMore={isFetchingMore}
            onLoadMore={() => fetchMore()}
          />
        </div>
      )}
    </div>
  );
};

interface CommentsListProps {
  comments: ReturnType<typeof usePaginatedComments>["comments"];
  loading: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;
}

function CommentsList({
  comments,
  loading,
  hasMore,
  isFetchingMore,
  onLoadMore,
}: CommentsListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const useVirtual = comments.length > VIRTUALIZATION_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: comments.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => COMMENT_HEIGHT_ESTIMATE,
    overscan: 3,
    enabled: useVirtual,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4 text-[var(--text-tertiary)]">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (comments.length === 0) {
    return (
      <p className="text-sm text-[var(--text-tertiary)] py-2">
        No activity yet. Comments from Claude and Ralph will appear here.
      </p>
    );
  }

  function renderComment(comment: CommentsListProps["comments"][number]) {
    return (
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
            <span className={`text-xs px-1.5 py-0.5 rounded ${COMMENT_BADGE_STYLES[comment.type]}`}>
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
    );
  }

  const loadMoreButton = hasMore && (
    <button
      type="button"
      onClick={onLoadMore}
      disabled={isFetchingMore}
      className="w-full flex items-center justify-center gap-1 py-2 text-xs text-[var(--text-muted)] bg-[var(--bg-hover)] border border-[var(--border-secondary)] rounded hover:bg-[var(--bg-tertiary)] transition-colors disabled:cursor-wait"
    >
      {isFetchingMore ? <Loader2 size={12} className="animate-spin" /> : <ChevronDown size={12} />}
      {isFetchingMore ? "Loading..." : "Load older comments"}
    </button>
  );

  if (!useVirtual) {
    return (
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {comments.map((comment) => renderComment(comment))}
        {loadMoreButton}
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div>
      <div ref={scrollContainerRef} className="max-h-96 overflow-y-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualItems.map((virtualRow) => {
            const comment = comments[virtualRow.index];
            if (!comment) return null;
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
                <div className="pb-2">{renderComment(comment)}</div>
              </div>
            );
          })}
        </div>
      </div>
      {loadMoreButton}
    </div>
  );
}
