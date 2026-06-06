import { useQuery } from "@tanstack/react-query";
import {
  getCodeChangePatchServerFn,
  getCodeChangeSummaryServerFn,
  type CodeChangePatchServerInput,
} from "../../api/code-changes";
import type {
  CodeChangePatchResult,
  CodeChangeScope,
  CodeChangeSummaryResult,
} from "../../../core/code-changes";
import { queryKeys } from "../query-keys";

export type {
  CodeChangeFileSummary,
  CodeChangePatch,
  CodeChangePatchResult,
  CodeChangeScope,
  CodeChangeSource,
  CodeChangeState,
  CodeChangeStateKind,
  CodeChangeSummaryResult,
  TicketCodeChangeGroup,
} from "../../../core/code-changes";

export interface UseCodeChangeSummaryOptions {
  enabled?: boolean;
}

export interface UseCodeChangePatchOptions {
  enabled?: boolean;
}

export interface UseCodeChangePatchInput extends Omit<CodeChangePatchServerInput, "scope"> {
  scope: CodeChangeScope;
}

function createAbortError(): Error {
  const error = new Error("Code-change request was cancelled.");
  error.name = "AbortError";
  return error;
}

function hasPatchSelection(input: UseCodeChangePatchInput): boolean {
  return Boolean(input.scope.id && input.sourceId && input.filePath);
}

export function useCodeChangeSummary(
  scope: CodeChangeScope,
  options: UseCodeChangeSummaryOptions = {}
) {
  const query = useQuery<CodeChangeSummaryResult>({
    queryKey: queryKeys.codeChangeSummary(scope.type, scope.id),
    queryFn: async ({ signal }) => {
      const result = await getCodeChangeSummaryServerFn({ data: scope });
      if (signal.aborted) {
        throw createAbortError();
      }

      return result;
    },
    enabled: Boolean(scope.id) && (options.enabled ?? true),
    staleTime: 15 * 1000,
  });

  return {
    summary: query.data ?? null,
    loading: query.isLoading,
    fetching: query.isFetching,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

export function useTicketCodeChangeSummary(
  ticketId: string,
  options: UseCodeChangeSummaryOptions = {}
) {
  return useCodeChangeSummary({ type: "ticket", id: ticketId }, options);
}

export function useEpicCodeChangeSummary(
  epicId: string,
  options: UseCodeChangeSummaryOptions = {}
) {
  return useCodeChangeSummary({ type: "epic", id: epicId }, options);
}

export function useCodeChangePatch(
  input: UseCodeChangePatchInput,
  options: UseCodeChangePatchOptions = {}
) {
  const enabled = Boolean(options.enabled ?? true) && hasPatchSelection(input);

  const query = useQuery<CodeChangePatchResult>({
    queryKey: queryKeys.codeChangePatch({
      scopeType: input.scope.type,
      scopeId: input.scope.id,
      ...(input.ticketId ? { ticketId: input.ticketId } : {}),
      ...(input.sourceId ? { sourceId: input.sourceId } : {}),
      ...(input.filePath ? { filePath: input.filePath } : {}),
    }),
    queryFn: async ({ signal }) => {
      const result = await getCodeChangePatchServerFn({ data: input });
      if (signal.aborted) {
        throw createAbortError();
      }

      return result;
    },
    enabled,
    staleTime: 60 * 1000,
  });

  return {
    patch: query.data ?? null,
    loading: query.isLoading,
    fetching: query.isFetching,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}
