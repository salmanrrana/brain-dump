/**
 * Ticket-related TanStack Query hooks.
 * Includes queries and mutations for ticket CRUD operations with optimistic updates.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTickets,
  createTicket,
  updateTicket,
  updateTicketStatus,
  updateTicketPosition,
  deleteTicket,
  type TicketFilters,
  type CreateTicketInput,
  type UpdateTicketInput,
  type TicketStatus,
} from "../../api/tickets";
import { searchTickets, type SearchResult } from "../../api/search";
import { getTags, type TagFilters } from "../../api/tags";
import { createBrowserLogger } from "../browser-logger";
import { queryKeys } from "../query-keys";

// Browser-safe logger for hook errors
const logger = createBrowserLogger("hooks:tickets");

// =============================================================================
// TYPES
// =============================================================================

export interface Ticket {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  position: number;
  projectId: string;
  epicId: string | null;
  tags: string | null;
  subtasks: string | null;
  isBlocked: boolean | null;
  blockedReason: string | null;
  linkedFiles: string | null;
  attachments: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  // Git/PR tracking fields
  branchName: string | null;
  prNumber: number | null;
  prUrl: string | null;
  prStatus: "draft" | "open" | "merged" | "closed" | null;
}

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
    invalidateTickets: () => queryClient.invalidateQueries({ queryKey: queryKeys.allTickets }),
    invalidateTags: () => queryClient.invalidateQueries({ queryKey: queryKeys.allTags }),
    invalidateAll: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
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
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.allTickets });

      // Snapshot all ticket queries for rollback
      const previousTicketQueries = queryClient.getQueriesData<Ticket[]>({
        queryKey: queryKeys.allTickets,
      });

      // Create optimistic ticket with temporary ID
      // Note: CreateTicketInput only has title, description, projectId, epicId, priority, tags, attachments
      const optimisticTicket: Ticket = {
        id: `temp-${Date.now()}`,
        title: newTicketData.title,
        description: newTicketData.description ?? null,
        status: "backlog", // New tickets always start in backlog
        priority: newTicketData.priority ?? null,
        position: 0, // Will be updated by server
        projectId: newTicketData.projectId,
        epicId: newTicketData.epicId ?? null,
        tags: newTicketData.tags ? JSON.stringify(newTicketData.tags) : null,
        subtasks: null, // Not in CreateTicketInput
        isBlocked: null,
        blockedReason: null,
        linkedFiles: null,
        attachments: newTicketData.attachments ? JSON.stringify(newTicketData.attachments) : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
        branchName: null,
        prNumber: null,
        prUrl: null,
        prStatus: null,
      };

      // Add optimistic ticket to all matching queries
      for (const [queryKey, tickets] of previousTicketQueries) {
        if (tickets) {
          queryClient.setQueryData<Ticket[]>(queryKey, [...tickets, optimisticTicket]);
        }
      }

      return { previousTicketQueries };
    },
    onError: (err, newTicket, context) => {
      // Note: Components using this hook should show user-facing error notifications
      // Log error with context for debugging
      logger.error(
        `Failed to create ticket: title="${newTicket.title}", projectId="${newTicket.projectId}"`,
        err instanceof Error ? err : new Error(String(err))
      );

      // Rollback all ticket queries
      if (context?.previousTicketQueries) {
        for (const [queryKey, tickets] of context.previousTicketQueries) {
          queryClient.setQueryData(queryKey, tickets);
        }
      }
    },
    onSettled: () => {
      // Invalidate tickets and tags (new ticket might have new tags)
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTags });
    },
  });
}

export function useUpdateTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { id: string; updates: UpdateTicketInput }) => updateTicket({ data }),
    onMutate: async ({ id, updates }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.allTickets });

      // Snapshot all ticket queries for rollback
      const previousTicketQueries = queryClient.getQueriesData<Ticket[]>({
        queryKey: queryKeys.allTickets,
      });

      // Optimistically update the ticket in all matching queries
      for (const [queryKey, tickets] of previousTicketQueries) {
        if (tickets) {
          queryClient.setQueryData<Ticket[]>(
            queryKey,
            tickets.map((ticket) => {
              if (ticket.id !== id) return ticket;

              // Build optimistic update, transforming array fields to JSON strings
              const optimisticUpdate: Ticket = {
                ...ticket,
                updatedAt: new Date().toISOString(),
              };

              // Apply simple field updates
              if (updates.title !== undefined) optimisticUpdate.title = updates.title;
              if (updates.description !== undefined)
                optimisticUpdate.description = updates.description;
              if (updates.status !== undefined) optimisticUpdate.status = updates.status;
              if (updates.priority !== undefined) optimisticUpdate.priority = updates.priority;
              if (updates.epicId !== undefined) optimisticUpdate.epicId = updates.epicId;
              if (updates.isBlocked !== undefined) optimisticUpdate.isBlocked = updates.isBlocked;
              if (updates.blockedReason !== undefined)
                optimisticUpdate.blockedReason = updates.blockedReason;

              // Transform array fields to JSON strings (Ticket stores these as strings)
              if (updates.tags !== undefined)
                optimisticUpdate.tags = updates.tags ? JSON.stringify(updates.tags) : null;
              if (updates.subtasks !== undefined)
                optimisticUpdate.subtasks = updates.subtasks
                  ? JSON.stringify(updates.subtasks)
                  : null;
              if (updates.linkedFiles !== undefined)
                optimisticUpdate.linkedFiles = updates.linkedFiles
                  ? JSON.stringify(updates.linkedFiles)
                  : null;

              // Handle completedAt based on status change
              if (updates.status === "done") {
                optimisticUpdate.completedAt = new Date().toISOString();
              } else if (updates.status && ticket.status === "done") {
                optimisticUpdate.completedAt = null;
              }

              return optimisticUpdate;
            })
          );
        }
      }

      return { previousTicketQueries };
    },
    onError: (err, variables, context) => {
      // Note: Components using this hook should show user-facing error notifications
      // Log error with context for debugging
      logger.error(
        `Failed to update ticket: id="${variables.id}", updates=${JSON.stringify(variables.updates)}`,
        err instanceof Error ? err : new Error(String(err))
      );

      // Rollback all ticket queries
      if (context?.previousTicketQueries) {
        for (const [queryKey, tickets] of context.previousTicketQueries) {
          queryClient.setQueryData(queryKey, tickets);
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTags });
    },
  });
}

export function useUpdateTicketStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { id: string; status: TicketStatus }) => updateTicketStatus({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
    },
  });
}

export function useUpdateTicketPosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { id: string; position: number }) => updateTicketPosition({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
    },
  });
}

export function useDeleteTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { ticketId: string; confirm?: boolean }) => deleteTicket({ data: params }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
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
    queryKey: ["ticket", ticketId, "delete-preview"] as const,
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
      const ticketList = await getTickets({ data: filters });
      return ticketList as Ticket[];
    },
    enabled,
    // Always stale - tickets can be created/updated via MCP externally
    staleTime: 0,
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
    // Always stale - tags derived from tickets which can change via MCP
    staleTime: 0,
  });

  return {
    tags: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

// Re-export SearchResult type
export type { SearchResult };
