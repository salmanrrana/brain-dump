/**
 * Comments TanStack Query hooks.
 * Includes queries and mutations for ticket comments.
 */

import { useMemo } from "react";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getComments,
  getPaginatedComments,
  createComment,
  deleteComment,
  type Comment,
  type CreateCommentInput,
  type PaginatedCommentsResult,
} from "../../api/comments";
import { queryKeys } from "../query-keys";

// Re-export types for components
export type { Comment, CreateCommentInput, PaginatedCommentsResult };

// =============================================================================
// COMMENTS HOOKS
// =============================================================================

// Hook for fetching comments for a ticket with optional polling
export function useComments(ticketId: string, options: { pollingInterval?: number } = {}) {
  const { pollingInterval = 0 } = options;

  const query = useQuery({
    queryKey: queryKeys.comments(ticketId),
    queryFn: async () => {
      return getComments({ data: ticketId });
    },
    enabled: Boolean(ticketId),
    refetchInterval: pollingInterval > 0 ? pollingInterval : false,
    refetchOnWindowFocus: true,
  });

  return {
    comments: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

// =============================================================================
// PAGINATED COMMENTS HOOK
// =============================================================================

/**
 * Hook for fetching paginated comments using infinite query.
 * Returns most recent comments first. Call `fetchNextPage` to load older comments.
 * Falls back transparently for small datasets (< pageSize).
 */
export function usePaginatedComments(
  ticketId: string,
  options: { pageSize?: number; pollingInterval?: number } = {}
) {
  const { pageSize = 50, pollingInterval = 0 } = options;

  const query = useInfiniteQuery({
    queryKey: queryKeys.paginatedComments(ticketId),
    queryFn: async ({ pageParam }) => {
      const input: { ticketId: string; limit: number; cursor?: string } = {
        ticketId,
        limit: pageSize,
      };
      if (pageParam) input.cursor = pageParam;
      return getPaginatedComments({ data: input });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(ticketId),
    refetchInterval: pollingInterval > 0 ? pollingInterval : false,
    refetchOnWindowFocus: true,
  });

  // Flatten all pages into a single comments array
  const comments = useMemo(
    () => query.data?.pages.flatMap((page) => page.comments) ?? [],
    [query.data]
  );

  const totalCount = query.data?.pages[0]?.totalCount ?? 0;

  return {
    comments,
    totalCount,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    hasMore: query.hasNextPage ?? false,
    fetchMore: query.fetchNextPage,
    isFetchingMore: query.isFetchingNextPage,
    refetch: query.refetch,
  };
}

// Hook for creating a comment
export function useCreateComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCommentInput) => createComment({ data }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.comments(variables.ticketId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.paginatedComments(variables.ticketId),
      });
    },
  });
}

// Hook for deleting a comment
export function useDeleteComment(ticketId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (commentId: string) => deleteComment({ data: commentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.comments(ticketId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.paginatedComments(ticketId) });
    },
  });
}
