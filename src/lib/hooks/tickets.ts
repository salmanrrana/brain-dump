/**
 * Ticket-related TanStack Query hooks.
 * Includes queries and mutations for ticket CRUD operations with optimistic updates.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTickets,
  getTicketSummaries,
  getPaginatedTicketSummaries,
  createTicket,
  updateTicket,
  updateTicketStatus,
  updateTicketPosition,
  deleteTicket,
  type TicketFilters,
  type CreateTicketInput,
  type UpdateTicketInput,
  type TicketStatus,
  type TicketSummary,
} from "../../api/tickets";
import { searchTickets, type SearchResult } from "../../api/search";
import { getTags, getTagsWithMetadata, type TagFilters, type TagMetadata } from "../../api/tags";
import { createBrowserLogger } from "../browser-logger";
import { queryKeys } from "../query-keys";
import type { Ticket } from "../schema";

// Re-export schema-derived type for consumers
export type { Ticket };

// Browser-safe logger for hook errors
const logger = createBrowserLogger("hooks:tickets");

// Status change event for notifications
export interface StatusChange {
  ticketId: string;
  ticketTitle: string;
  fromStatus: string;
  toStatus: string;
}

// =============================================================================
// QUERY INVALIDATION HOOK
// =============================================================================

// Hook for invalidating queries - use this after mutations!
export function useInvalidateQueries() {
  const queryClient = useQueryClient();

  return {
    invalidateProjects: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
    invalidateTickets: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTicketSummaries });
      queryClient.invalidateQueries({ queryKey: queryKeys.projectTicketCounts });
    },
    invalidateTags: () => queryClient.invalidateQueries({ queryKey: queryKeys.allTags }),
    invalidateAll: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTicketSummaries });
      queryClient.invalidateQueries({ queryKey: queryKeys.projectTicketCounts });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTags });
    },
  };
}

// =============================================================================
// TICKET MUTATIONS
// =============================================================================

// Ticket mutations with optimistic updates
export function useCreateTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTicketInput) => createTicket({ data }),
    onMutate: async (newTicketData) => {
      // Cancel outgoing refetches for both ticket query types
      await queryClient.cancelQueries({ queryKey: queryKeys.allTickets });
      await queryClient.cancelQueries({ queryKey: queryKeys.allTicketSummaries });

      // Snapshot both query types for rollback
      const previousTicketQueries = queryClient.getQueriesData<Ticket[]>({
        queryKey: queryKeys.allTickets,
      });
      const previousSummaryQueries = queryClient.getQueriesData<TicketSummary[]>({
        queryKey: queryKeys.allTicketSummaries,
      });

      const now = new Date().toISOString();
      const tagsJson = newTicketData.tags ? JSON.stringify(newTicketData.tags) : null;

      // Create optimistic ticket with temporary ID
      const optimisticTicket: Ticket = {
        id: `temp-${Date.now()}`,
        title: newTicketData.title,
        description: newTicketData.description ?? null,
        status: "backlog",
        priority: newTicketData.priority ?? null,
        position: 0,
        projectId: newTicketData.projectId,
        epicId: newTicketData.epicId ?? null,
        tags: tagsJson,
        subtasks: null,
        isBlocked: null,
        blockedReason: null,
        linkedFiles: null,
        attachments: newTicketData.attachments ? JSON.stringify(newTicketData.attachments) : null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        branchName: null,
        prNumber: null,
        prUrl: null,
        prStatus: null,
      };

      // Optimistic summary (same shape minus description/linkedFiles/attachments)
      const optimisticSummary: TicketSummary = {
        id: optimisticTicket.id,
        title: optimisticTicket.title,
        status: optimisticTicket.status as TicketStatus,
        priority: optimisticTicket.priority,
        position: optimisticTicket.position,
        projectId: optimisticTicket.projectId,
        epicId: optimisticTicket.epicId,
        tags: tagsJson,
        subtasks: null,
        isBlocked: null,
        blockedReason: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        branchName: null,
        prNumber: null,
        prUrl: null,
        prStatus: null,
      };

      // Add optimistic ticket to all matching full-ticket queries
      for (const [queryKey, tickets] of previousTicketQueries) {
        if (tickets) {
          queryClient.setQueryData<Ticket[]>(queryKey, [...tickets, optimisticTicket]);
        }
      }

      // Add optimistic summary to all matching summary queries
      for (const [queryKey, summaries] of previousSummaryQueries) {
        if (summaries) {
          queryClient.setQueryData<TicketSummary[]>(queryKey, [...summaries, optimisticSummary]);
        }
      }

      return { previousTicketQueries, previousSummaryQueries };
    },
    onError: (err, newTicket, context) => {
      logger.error(
        `Failed to create ticket: title="${newTicket.title}", projectId="${newTicket.projectId}"`,
        err instanceof Error ? err : new Error(String(err))
      );

      // Rollback both query types
      if (context?.previousTicketQueries) {
        for (const [queryKey, tickets] of context.previousTicketQueries) {
          queryClient.setQueryData(queryKey, tickets);
        }
      }
      if (context?.previousSummaryQueries) {
        for (const [queryKey, summaries] of context.previousSummaryQueries) {
          queryClient.setQueryData(queryKey, summaries);
        }
      }
    },
    onSettled: () => {
      // Create affects all lists and may introduce new tags
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTicketSummaries });
      queryClient.invalidateQueries({ queryKey: queryKeys.projectTicketCounts });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTags });
    },
  });
}

export function useUpdateTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { id: string; updates: UpdateTicketInput }) => updateTicket({ data }),
    onMutate: async ({ id, updates }) => {
      // Cancel outgoing refetches for both query types
      await queryClient.cancelQueries({ queryKey: queryKeys.allTickets });
      await queryClient.cancelQueries({ queryKey: queryKeys.allTicketSummaries });

      // Snapshot both query types for rollback
      const previousTicketQueries = queryClient.getQueriesData<Ticket[]>({
        queryKey: queryKeys.allTickets,
      });
      const previousSummaryQueries = queryClient.getQueriesData<TicketSummary[]>({
        queryKey: queryKeys.allTicketSummaries,
      });

      // Helper to apply common field updates to both Ticket and TicketSummary
      const applyCommonUpdates = <T extends TicketSummary>(item: T): T => {
        const updated = { ...item, updatedAt: new Date().toISOString() };
        if (updates.title !== undefined) updated.title = updates.title;
        if (updates.status !== undefined) updated.status = updates.status as TicketStatus;
        if (updates.priority !== undefined) updated.priority = updates.priority;
        if (updates.epicId !== undefined) updated.epicId = updates.epicId;
        if (updates.isBlocked !== undefined) updated.isBlocked = updates.isBlocked;
        if (updates.blockedReason !== undefined) updated.blockedReason = updates.blockedReason;
        if (updates.tags !== undefined)
          updated.tags = updates.tags ? JSON.stringify(updates.tags) : null;
        if (updates.subtasks !== undefined)
          updated.subtasks = updates.subtasks ? JSON.stringify(updates.subtasks) : null;

        // Handle completedAt based on status change
        if (updates.status === "done") {
          updated.completedAt = new Date().toISOString();
        } else if (updates.status && item.status === "done") {
          updated.completedAt = null;
        }

        return updated;
      };

      // Optimistically update full-ticket queries
      for (const [queryKey, tickets] of previousTicketQueries) {
        if (tickets) {
          queryClient.setQueryData<Ticket[]>(
            queryKey,
            tickets.map((ticket) => {
              if (ticket.id !== id) return ticket;
              const updated = applyCommonUpdates(ticket);
              // Ticket-only fields
              if (updates.description !== undefined) updated.description = updates.description;
              if (updates.linkedFiles !== undefined)
                updated.linkedFiles = updates.linkedFiles
                  ? JSON.stringify(updates.linkedFiles)
                  : null;
              return updated;
            })
          );
        }
      }

      // Optimistically update summary queries
      for (const [queryKey, summaries] of previousSummaryQueries) {
        if (summaries) {
          queryClient.setQueryData<TicketSummary[]>(
            queryKey,
            summaries.map((summary) => (summary.id === id ? applyCommonUpdates(summary) : summary))
          );
        }
      }

      return { previousTicketQueries, previousSummaryQueries, updates };
    },
    onError: (err, variables, context) => {
      logger.error(
        `Failed to update ticket: id="${variables.id}", updates=${JSON.stringify(variables.updates)}`,
        err instanceof Error ? err : new Error(String(err))
      );

      // Rollback both query types
      if (context?.previousTicketQueries) {
        for (const [queryKey, tickets] of context.previousTicketQueries) {
          queryClient.setQueryData(queryKey, tickets);
        }
      }
      if (context?.previousSummaryQueries) {
        for (const [queryKey, summaries] of context.previousSummaryQueries) {
          queryClient.setQueryData(queryKey, summaries);
        }
      }
    },
    onSettled: (_data, _err, _variables, context) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTicketSummaries });
      // Only invalidate tags if tags were modified
      if (context?.updates?.tags !== undefined) {
        queryClient.invalidateQueries({ queryKey: queryKeys.allTags });
      }
      // Invalidate counts if status changed (affects project/epic progress)
      if (context?.updates?.status !== undefined) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projectTicketCounts });
      }
    },
  });
}

export function useUpdateTicketStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { id: string; status: TicketStatus }) => updateTicketStatus({ data }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.allTickets });
      await queryClient.cancelQueries({ queryKey: queryKeys.allTicketSummaries });

      const previousTicketQueries = queryClient.getQueriesData<Ticket[]>({
        queryKey: queryKeys.allTickets,
      });
      const previousSummaryQueries = queryClient.getQueriesData<TicketSummary[]>({
        queryKey: queryKeys.allTicketSummaries,
      });

      const now = new Date().toISOString();
      const applyStatusUpdate = <
        T extends { id: string; status: string; completedAt: string | null; updatedAt: string },
      >(
        item: T
      ): T => {
        const updated = { ...item, status, updatedAt: now };
        if (status === "done") updated.completedAt = now;
        else if (item.status === "done") updated.completedAt = null;
        return updated;
      };

      for (const [queryKey, tickets] of previousTicketQueries) {
        if (tickets) {
          queryClient.setQueryData<Ticket[]>(
            queryKey,
            tickets.map((t) => (t.id === id ? applyStatusUpdate(t) : t))
          );
        }
      }
      for (const [queryKey, summaries] of previousSummaryQueries) {
        if (summaries) {
          queryClient.setQueryData<TicketSummary[]>(
            queryKey,
            summaries.map((s) => (s.id === id ? applyStatusUpdate(s) : s))
          );
        }
      }

      return { previousTicketQueries, previousSummaryQueries };
    },
    onError: (err, variables, context) => {
      logger.error(
        `Failed to update ticket status: id="${variables.id}", status="${variables.status}"`,
        err instanceof Error ? err : new Error(String(err))
      );

      if (context?.previousTicketQueries) {
        for (const [queryKey, tickets] of context.previousTicketQueries) {
          queryClient.setQueryData(queryKey, tickets);
        }
      }
      if (context?.previousSummaryQueries) {
        for (const [queryKey, summaries] of context.previousSummaryQueries) {
          queryClient.setQueryData(queryKey, summaries);
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTicketSummaries });
      queryClient.invalidateQueries({ queryKey: queryKeys.projectTicketCounts });
    },
  });
}

export function useUpdateTicketPosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { id: string; position: number }) => updateTicketPosition({ data }),
    onMutate: async ({ id, position }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.allTickets });
      await queryClient.cancelQueries({ queryKey: queryKeys.allTicketSummaries });

      const previousTicketQueries = queryClient.getQueriesData<Ticket[]>({
        queryKey: queryKeys.allTickets,
      });
      const previousSummaryQueries = queryClient.getQueriesData<TicketSummary[]>({
        queryKey: queryKeys.allTicketSummaries,
      });

      for (const [queryKey, tickets] of previousTicketQueries) {
        if (tickets) {
          queryClient.setQueryData<Ticket[]>(
            queryKey,
            tickets.map((t) =>
              t.id === id ? { ...t, position, updatedAt: new Date().toISOString() } : t
            )
          );
        }
      }
      for (const [queryKey, summaries] of previousSummaryQueries) {
        if (summaries) {
          queryClient.setQueryData<TicketSummary[]>(
            queryKey,
            summaries.map((s) =>
              s.id === id ? { ...s, position, updatedAt: new Date().toISOString() } : s
            )
          );
        }
      }

      return { previousTicketQueries, previousSummaryQueries };
    },
    onError: (err, variables, context) => {
      logger.error(
        `Failed to update ticket position: id="${variables.id}", position=${variables.position}`,
        err instanceof Error ? err : new Error(String(err))
      );

      if (context?.previousTicketQueries) {
        for (const [queryKey, tickets] of context.previousTicketQueries) {
          queryClient.setQueryData(queryKey, tickets);
        }
      }
      if (context?.previousSummaryQueries) {
        for (const [queryKey, summaries] of context.previousSummaryQueries) {
          queryClient.setQueryData(queryKey, summaries);
        }
      }
    },
    onSettled: () => {
      // Position changes don't affect counts or tags — only ticket lists
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTicketSummaries });
    },
  });
}

export function useDeleteTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { ticketId: string; confirm?: boolean }) => deleteTicket({ data: params }),
    onSuccess: () => {
      // Delete affects all lists, may orphan tags, and changes counts
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTicketSummaries });
      queryClient.invalidateQueries({ queryKey: queryKeys.projectTicketCounts });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTags });
    },
  });
}

// =============================================================================
// DELETE PREVIEW HOOK
// =============================================================================

/**
 * Hook for fetching ticket delete preview (dry-run).
 * @param ticketId - The ticket ID to preview deletion for
 * @param enabled - Whether to fetch the preview (typically when modal opens)
 */
export function useTicketDeletePreview(ticketId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.ticketDeletePreview(ticketId),
    queryFn: () => deleteTicket({ data: { ticketId, confirm: false } }),
    enabled,
  });
}

// =============================================================================
// TICKET QUERIES
// =============================================================================

// Hook for fetching tickets with optional filters and polling
// Polling disabled by default (pollingInterval = 0) for performance
export function useTickets(
  filters: TicketFilters = {},
  options: {
    pollingInterval?: number;
    onStatusChange?: (change: StatusChange) => void;
    enabled?: boolean;
  } = {}
) {
  const prevTicketsRef = useRef<Map<string, string>>(new Map());
  const isInitialLoad = useRef(true);
  const { pollingInterval = 0, onStatusChange, enabled = true } = options;

  const query = useQuery({
    queryKey: queryKeys.tickets(filters),
    queryFn: async () => {
      return getTickets({ data: filters });
    },
    enabled,
    staleTime: 30_000, // 30s — mutations invalidate; MCP changes picked up on next interval
    refetchInterval: pollingInterval > 0 ? pollingInterval : false,
  });

  // Check for status changes when data updates
  useEffect(() => {
    if (!query.data || !onStatusChange) return;

    if (!isInitialLoad.current) {
      for (const ticket of query.data) {
        const prevStatus = prevTicketsRef.current.get(ticket.id);
        if (prevStatus && prevStatus !== ticket.status) {
          onStatusChange({
            ticketId: ticket.id,
            ticketTitle: ticket.title,
            fromStatus: prevStatus,
            toStatus: ticket.status,
          });
        }
      }
    }

    // Update previous tickets map
    prevTicketsRef.current = new Map(query.data.map((t) => [t.id, t.status]));
    isInitialLoad.current = false;
  }, [query.data, onStatusChange]);

  return {
    tickets: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

// =============================================================================
// TICKET SUMMARIES QUERY (lightweight — no description/linkedFiles/attachments)
// =============================================================================

/**
 * Lightweight hook for board, list, and dashboard views.
 * Returns ticket summaries without heavy text fields (description, linkedFiles, attachments).
 */
export function useTicketSummaries(
  filters: TicketFilters = {},
  options: {
    pollingInterval?: number;
    onStatusChange?: (change: StatusChange) => void;
    enabled?: boolean;
  } = {}
) {
  const prevTicketsRef = useRef<Map<string, string>>(new Map());
  const isInitialLoad = useRef(true);
  const { pollingInterval = 0, onStatusChange, enabled = true } = options;

  const query = useQuery({
    queryKey: queryKeys.ticketSummaries(filters),
    queryFn: async () => {
      return getTicketSummaries({ data: filters });
    },
    enabled,
    staleTime: 30_000, // 30s — mutations invalidate; MCP changes picked up on next interval
    refetchInterval: pollingInterval > 0 ? pollingInterval : false,
  });

  // Check for status changes when data updates
  useEffect(() => {
    if (!query.data || !onStatusChange) return;

    if (!isInitialLoad.current) {
      for (const ticket of query.data) {
        const prevStatus = prevTicketsRef.current.get(ticket.id);
        if (prevStatus && prevStatus !== ticket.status) {
          onStatusChange({
            ticketId: ticket.id,
            ticketTitle: ticket.title,
            fromStatus: prevStatus,
            toStatus: ticket.status,
          });
        }
      }
    }

    // Update previous tickets map
    prevTicketsRef.current = new Map(query.data.map((t) => [t.id, t.status]));
    isInitialLoad.current = false;
  }, [query.data, onStatusChange]);

  return {
    tickets: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

// =============================================================================
// PAGINATED TICKET SUMMARIES (offset-based)
// =============================================================================

/**
 * Hook for paginated ticket summaries using infinite query.
 * Use for list views where tickets can grow unbounded.
 * Board views should continue using `useTicketSummaries` which loads all tickets.
 */
export function usePaginatedTicketSummaries(
  filters: TicketFilters = {},
  options: {
    pageSize?: number;
    enabled?: boolean;
  } = {}
) {
  const { pageSize = 50, enabled = true } = options;

  const query = useInfiniteQuery({
    queryKey: [...queryKeys.ticketSummaries(filters), "paginated"] as const,
    queryFn: async ({ pageParam = 0 }) => {
      return getPaginatedTicketSummaries({
        data: { ...filters, limit: pageSize, offset: pageParam },
      });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (!lastPage.hasMore) return undefined;
      return lastPageParam + pageSize;
    },
    enabled,
    staleTime: 30_000,
  });

  const tickets = useMemo(
    () => query.data?.pages.flatMap((page) => page.tickets) ?? [],
    [query.data]
  );

  const total = query.data?.pages[0]?.total ?? 0;

  return {
    tickets,
    total,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    hasMore: query.hasNextPage ?? false,
    fetchMore: query.fetchNextPage,
    isFetchingMore: query.isFetchingNextPage,
    refetch: query.refetch,
  };
}

// =============================================================================
// SEARCH HOOK
// =============================================================================

// Hook for searching tickets with debouncing
export function useSearch(projectId?: string | null) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const search = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        setSearchError(null);
        return;
      }

      setLoading(true);
      setSearchError(null);
      try {
        const searchData: { query: string; projectId?: string } = {
          query: searchQuery,
        };
        if (projectId) {
          searchData.projectId = projectId;
        }
        const data = await searchTickets({
          data: searchData,
        });
        setResults(data);
      } catch (err) {
        // Note: Components using this hook should show user-facing error notifications
        logger.error("Search failed", err instanceof Error ? err : new Error(String(err)));
        setResults([]);
        setSearchError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  const debouncedSearch = useCallback(
    (searchQuery: string) => {
      setQuery(searchQuery);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (!searchQuery.trim()) {
        setResults([]);
        return;
      }

      debounceRef.current = setTimeout(() => {
        void search(searchQuery);
      }, 300);
    },
    [search]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const clearSearch = useCallback(() => {
    setQuery("");
    setResults([]);
    setSearchError(null);
  }, []);

  return { query, results, loading, error: searchError, search: debouncedSearch, clearSearch };
}

// =============================================================================
// TAGS HOOK
// =============================================================================

// Hook for fetching unique tags with optional project/epic filter
export function useTags(filters: TagFilters = {}) {
  const query = useQuery({
    queryKey: queryKeys.tags(filters),
    queryFn: () => getTags({ data: filters }),
    staleTime: 60_000, // 60s — tags change infrequently; mutations invalidate
  });

  return {
    tags: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

// =============================================================================
// TAGS WITH METADATA HOOK
// =============================================================================

// Hook for fetching tags with metadata (counts, status breakdown, last used)
export function useTagsWithMetadata(filters: TagFilters = {}, options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  const query = useQuery({
    queryKey: queryKeys.tagsWithMetadata(filters),
    queryFn: () => getTagsWithMetadata({ data: filters }),
    staleTime: 60_000, // 60s — tag metadata changes infrequently; mutations invalidate
    enabled,
  });

  return {
    tagsWithMetadata: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

// Re-export SearchResult and TagMetadata types
export type { SearchResult, TagMetadata };
