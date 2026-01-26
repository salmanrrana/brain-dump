/**
 * Workflow and Demo TanStack Query hooks.
 * Includes queries and mutations for workflow state and demo scripts.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDemoScript, updateDemoStep, submitDemoFeedback } from "../../api/demo";
import {
  getWorkflowDisplayState,
  type WorkflowDisplayState,
  type WorkflowDisplayResult,
} from "../../api/workflow";
import type { DemoStep } from "../schema";
import { createBrowserLogger } from "../browser-logger";
import { queryKeys } from "../query-keys";

// Browser-safe logger for hook errors
const logger = createBrowserLogger("hooks:workflow");

// Re-export types for consumers
export type { WorkflowDisplayState, WorkflowDisplayResult, DemoStep };

// =============================================================================
// DEMO SCRIPT TYPES
// =============================================================================

/**
 * Demo script as returned from the API
 */
export interface DemoScript {
  id: string;
  ticketId: string;
  steps: DemoStep[];
  generatedAt: string;
  completedAt: string | null;
  passed: boolean | null;
  feedback: string | null;
}

/**
 * Input type for updateDemoStep mutation
 */
export interface UpdateDemoStepInput {
  ticketId: string;
  demoScriptId: string;
  stepOrder: number;
  status: "pending" | "passed" | "failed" | "skipped";
  notes?: string;
}

/**
 * Input type for submitDemoFeedback mutation
 */
export interface SubmitDemoFeedbackInput {
  ticketId: string;
  passed: boolean;
  feedback: string;
  stepResults?: Array<{
    order: number;
    status: "pending" | "passed" | "failed" | "skipped";
    notes?: string;
  }>;
}

// =============================================================================
// DEMO SCRIPT HOOKS
// =============================================================================

/**
 * Hook for fetching a demo script for a ticket.
 * Returns the script with all steps and their current status.
 *
 * @param ticketId - The ticket ID to fetch the demo script for
 * @param options - Configuration options
 */
export function useDemoScript(
  ticketId: string,
  options: {
    /** Whether to enable the query (default: true when ticketId is provided) */
    enabled?: boolean;
    /** Polling interval in ms for real-time updates (default: 0 = disabled) */
    pollingInterval?: number;
  } = {}
) {
  const { enabled = Boolean(ticketId), pollingInterval = 0 } = options;

  const query = useQuery({
    queryKey: queryKeys.demoScript(ticketId),
    queryFn: async () => {
      return getDemoScript({ data: { ticketId } });
    },
    enabled,
    refetchInterval: pollingInterval > 0 ? pollingInterval : false,
    staleTime: 0, // Demo script status can change externally
  });

  return {
    demoScript: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

/**
 * Hook for updating a single demo step's status.
 * Uses TanStack Query optimistic updates for instant UI feedback.
 *
 * The optimistic update pattern:
 * 1. onMutate: Cancel outgoing refetches, snapshot previous value, update cache optimistically
 * 2. onError: Roll back to snapshot on failure
 * 3. onSettled: Invalidate queries to ensure cache is in sync with server
 */
export function useUpdateDemoStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateDemoStepInput) => {
      // Extract only the fields the API expects (excludes ticketId which is for cache key)
      const { demoScriptId, stepOrder, status, notes } = data;
      return updateDemoStep({ data: { demoScriptId, stepOrder, status, notes } });
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.demoScript(variables.ticketId) });

      // Snapshot the previous value
      const previousDemoScript = queryClient.getQueryData<DemoScript>(
        queryKeys.demoScript(variables.ticketId)
      );

      // Optimistically update the cache
      if (previousDemoScript) {
        queryClient.setQueryData<DemoScript>(queryKeys.demoScript(variables.ticketId), (old) => {
          if (!old) return old;
          return {
            ...old,
            steps: old.steps.map(
              (step): DemoStep =>
                step.order === variables.stepOrder
                  ? {
                      ...step,
                      status: variables.status,
                      // Keep existing notes if new notes not provided
                      ...(variables.notes !== undefined ? { notes: variables.notes } : {}),
                    }
                  : step
            ),
          };
        });
      }

      // Return context with snapshot for rollback
      return { previousDemoScript };
    },
    onError: (_err, variables, context) => {
      // Roll back to the previous value on error
      if (context?.previousDemoScript) {
        queryClient.setQueryData(
          queryKeys.demoScript(variables.ticketId),
          context.previousDemoScript
        );
      }
    },
    onSettled: (_data, _err, variables) => {
      // Always refetch after error or success to ensure cache is in sync
      queryClient.invalidateQueries({ queryKey: queryKeys.demoScript(variables.ticketId) });
    },
  });
}

/**
 * Hook for submitting final demo feedback from human reviewer.
 * This approves or rejects the demo and updates ticket status.
 */
export function useSubmitDemoFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SubmitDemoFeedbackInput) => submitDemoFeedback({ data }),
    onSuccess: (_, variables) => {
      // Invalidate demo script for this ticket
      queryClient.invalidateQueries({ queryKey: queryKeys.demoScript(variables.ticketId) });
      // Invalidate tickets to reflect status change
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
      // Invalidate workflow state as demo feedback changes it
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowState(variables.ticketId) });
    },
  });
}

// =============================================================================
// WORKFLOW STATE HOOKS
// =============================================================================

/** Workflow state hook result - includes explicit error and notFound states */
export interface UseWorkflowStateResult {
  /** The workflow state data (null if not found, error, or loading) */
  workflowState: WorkflowDisplayState | null;
  /** Whether the query is currently loading */
  loading: boolean;
  /** Error message if the query failed */
  error: string | null;
  /** Whether the ticket was not found (distinct from null workflowState) */
  notFound: boolean;
  /** Function to manually refetch the data */
  refetch: () => void;
}

/**
 * Hook for fetching workflow display state for a ticket.
 * Returns aggregated workflow progress, review findings summary, and demo status.
 *
 * Distinguishes between:
 * - loading: Data is being fetched
 * - success: Data was fetched successfully
 * - notFound: Ticket doesn't exist
 * - error: Database or network error occurred
 *
 * @param ticketId - The ticket ID to fetch workflow state for
 * @param options - Configuration options
 */
export function useWorkflowState(
  ticketId: string,
  options: {
    /** Whether to enable the query (default: true when ticketId is provided) */
    enabled?: boolean;
    /** Polling interval in ms for real-time updates (default: 0 = disabled) */
    pollingInterval?: number;
  } = {}
): UseWorkflowStateResult {
  const { enabled = Boolean(ticketId), pollingInterval = 0 } = options;

  const query = useQuery({
    queryKey: queryKeys.workflowState(ticketId),
    queryFn: async (): Promise<WorkflowDisplayResult> => {
      return getWorkflowDisplayState({ data: ticketId });
    },
    enabled,
    refetchInterval: pollingInterval > 0 ? pollingInterval : false,
    staleTime: 0, // Workflow state can change externally (MCP tools)
  });

  // Process the discriminated union result
  const result = query.data;
  let workflowState: WorkflowDisplayState | null = null;
  let error: string | null = query.error?.message ?? null;
  let notFound = false;

  if (result) {
    if (result.status === "success") {
      workflowState = result.data;
    } else if (result.status === "not_found") {
      notFound = true;
    } else if (result.status === "error") {
      error = result.message;
      // Note: Components using this hook should show user-facing error notifications
      logger.error(`Workflow state fetch failed for ticket ${ticketId}: ${result.message}`);
    }
  }

  return {
    workflowState,
    loading: query.isLoading,
    error,
    notFound,
    refetch: query.refetch,
  };
}
