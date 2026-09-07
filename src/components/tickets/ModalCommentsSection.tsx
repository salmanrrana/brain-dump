import { type FC, useState, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { MessageSquare, ChevronDown, Loader2, Send } from "lucide-react";
import { usePaginatedComments, useCreateComment } from "../../lib/hooks";
import { POLLING_INTERVALS } from "../../lib/constants";
import { useToast } from "../Toast";
import { Comment } from "./Comment";

const VIRTUALIZATION_THRESHOLD = 20;
const COMMENT_HEIGHT_ESTIMATE = 80;

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
  const commentsRegionId = `ticket-${ticketId}-activity-comments`;

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
        type="button"
        onClick={() => setShowComments(!showComments)}
        aria-expanded={showComments}
        aria-controls={commentsRegionId}
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
        <div id={commentsRegionId} className="space-y-3">
          {/* Add comment input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
              placeholder="Add a comment..."
              aria-label="Add a comment"
              className="flex-1 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] text-sm"
            />
            <button
              type="button"
              onClick={handleAddComment}
              disabled={!newComment.trim() || createCommentMutation.isPending}
              aria-label="Post comment"
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
      <Comment
        key={comment.id}
        comment={comment}
        maxLines={0}
        testId={`modal-comment-${comment.id}`}
      />
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
