/**
 * Comments TanStack Query hooks.
 * Includes queries and mutations for ticket comments.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getComments,
  createComment,
  deleteComment,
  type Comment,
  type CreateCommentInput,
} from "../../api/comments";

// Re-export types for components
export type { Comment, CreateCommentInput };

// =============================================================================
// COMMENTS HOOKS
// =============================================================================

// Hook for fetching comments for a ticket with optional polling
export function useComments(ticketId: string, options: { pollingInterval?: number } = {}) {
  const { pollingInterval = 0 } = options;

  const query = useQuery({
    queryKey: ["comments", ticketId],
    queryFn: async () => {
      const comments = await getComments({ data: ticketId });
      return comments as Comment[];
    },
    enabled: Boolean(ticketId),
    refetchInterval: pollingInterval > 0 ? pollingInterval : false,
  });

  return {
    comments: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

// Hook for creating a comment
export function useCreateComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCommentInput) => createComment({ data }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["comments", variables.ticketId] });
    },
  });
}

// Hook for deleting a comment
export function useDeleteComment(ticketId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (commentId: string) => deleteComment({ data: commentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", ticketId] });
    },
  });
}
