/**
 * Workflow and Demo TanStack Query hooks.
 * Includes queries and mutations for workflow state and demo scripts.
 */

import { useQuery } from "@tanstack/react-query";
import { getAttachments, type Attachment } from "../../api/attachments";
import { getDemoScript } from "../../api/demo";
import {
  getVerificationRuns,
  type VerificationRunSummary,
  type VerificationStepVerdict,
} from "../../api/verification";
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
export type { Attachment, VerificationRunSummary, VerificationStepVerdict };

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
    // Non-polling: snapshot tier (30s) so revisits serve cache. Polling: match interval.
    // Window-focus refetch stays off (global default); external changes surface via invalidation.
    staleTime: pollingInterval > 0 ? pollingInterval : 30 * 1000,
  });

  return {
    demoScript: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

export function useTicketAttachments(
  ticketId: string,
  options: {
    /** Whether to enable the query (default: true when ticketId is provided) */
    enabled?: boolean;
  } = {}
) {
  const { enabled = Boolean(ticketId) } = options;

  const query = useQuery({
    queryKey: queryKeys.attachments(ticketId),
    queryFn: async () => getAttachments({ data: ticketId }),
    enabled,
    staleTime: 30 * 1000,
  });

  return {
    attachments: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

export function useVerificationRuns(
  ticketId: string,
  options: {
    /** Whether to enable the query (default: true when ticketId is provided) */
    enabled?: boolean;
    /** Polling interval in ms for live verification status (default: 0 = disabled) */
    pollingInterval?: number;
  } = {}
) {
  const { enabled = Boolean(ticketId), pollingInterval = 0 } = options;

  const query = useQuery({
    queryKey: queryKeys.verificationRuns(ticketId),
    queryFn: async () => getVerificationRuns({ data: { ticketId } }),
    enabled,
    refetchInterval: pollingInterval > 0 ? pollingInterval : false,
    staleTime: pollingInterval > 0 ? pollingInterval : 30 * 1000,
  });

  return {
    verificationRuns: (query.data ?? []) as VerificationRunSummary[],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
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
    // Non-polling: snapshot tier (30s) so revisits serve cache. Polling: match interval.
    // Window-focus refetch stays off (global default); MCP changes surface via invalidation.
    staleTime: pollingInterval > 0 ? pollingInterval : 30 * 1000,
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
